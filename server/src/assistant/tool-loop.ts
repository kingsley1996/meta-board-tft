import { assistantLog } from './logger.ts';
import {
  AssistantToolError,
  executeAssistantTool,
  type ToolExecution,
} from './tool-registry.ts';
import type { Lang } from './contracts.ts';
import type {
  ProviderChatMessage,
  ProviderRequest,
  ProviderResult,
  ProviderTool,
  ProviderToolCall,
} from './provider.ts';
import { ProviderError as ProviderFailure } from './provider.ts';

type Generate = (request: ProviderRequest) => Promise<ProviderResult>;
type Execute = (name: string, args: unknown, lang: Lang) => Promise<ToolExecution>;

export type ToolLoopConfig = {
  maxRounds: number;
  maxCalls: number;
  maxCallsPerRound: number;
  toolTimeoutMs: number;
};

export type ToolFailure = {
  tool: string;
  code: string;
  message: string;
};

export type ToolLoopResult = {
  messages: ProviderChatMessage[];
  results: ToolExecution[];
  failures: ToolFailure[];
  final: ProviderResult | null;
  calls: number;
  rounds: number;
  stopped: 'no_call' | 'max_rounds' | 'max_calls' | 'max_per_round' | 'aborted' | 'finalized';
};

function envInt(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function toolLoopConfig(): ToolLoopConfig {
  return {
    maxRounds: envInt('ASSISTANT_MAX_TOOL_ROUNDS', 3, 1, 5),
    maxCalls: envInt('ASSISTANT_MAX_TOOL_CALLS', 5, 1, 10),
    maxCallsPerRound: envInt('ASSISTANT_MAX_TOOL_CALLS_PER_ROUND', 2, 1, 4),
    toolTimeoutMs: envInt('ASSISTANT_TOOL_TIMEOUT_MS', 15_000, 1_000, 60_000),
  };
}

function stable(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value) ?? 'null';
  return JSON.stringify(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, (value as Record<string, unknown>)[key]])
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function failure(tool: string, code: string, message: string): ToolFailure {
  return { tool, code, message };
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new AssistantToolError('Tool timed out.')), timeoutMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function runToolLoop(input: {
  system: string;
  answerSystem: string;
  messages: ProviderChatMessage[];
  tools: ProviderTool[];
  lang: Lang;
  signal: AbortSignal;
  provenance?: { setId: string; patch: string };
  finalizeModel?: boolean;
  generate: Generate;
  execute?: Execute;
  config?: ToolLoopConfig;
}): Promise<ToolLoopResult> {
  const config = input.config ?? toolLoopConfig();
  const execute = input.execute ?? executeAssistantTool;
  const allowed = new Set(input.tools.map((tool) => tool.function.name));
  const messages: ProviderChatMessage[] = [];
  const results: ToolExecution[] = [];
  const failures: ToolFailure[] = [];
  const seen = new Set<string>();
  let calls = 0;
  let rounds = 0;
  let stopped: ToolLoopResult['stopped'] = 'no_call';
  let final: ProviderResult | null = null;

  while (rounds < config.maxRounds && calls < config.maxCalls) {
    if (input.signal.aborted) return { messages, results, failures, final, calls, rounds, stopped: 'aborted' };
    rounds += 1;
    const planned = await input.generate({
      system: calls === 0 ? input.system : input.answerSystem,
      messages: [...input.messages, ...messages],
      maxOutputTokens: 300,
      signal: input.signal,
      tools: input.tools,
      format: calls === 0 ? null : 'json',
    });
    if (!planned.toolCalls.length) {
      final = planned;
      stopped = 'no_call';
      break;
    }

    const remaining = config.maxCalls - calls;
    const requested = planned.toolCalls.slice(0, config.maxCallsPerRound);
    const accepted = requested.slice(0, remaining);
    if (requested.length > accepted.length) {
      stopped = 'max_per_round';
      assistantLog('tool_limit', { requested: requested.length, accepted: accepted.length, reason: 'max_per_round' });
    } else if (planned.toolCalls.length > accepted.length) {
      stopped = 'max_calls';
      assistantLog('tool_limit', { requested: planned.toolCalls.length, accepted: accepted.length, reason: 'max_calls' });
    }

    const assistantCalls = accepted.map((call: ProviderToolCall) => ({
      ...(call.id ? { id: call.id } : {}),
      function: { name: call.name, arguments: call.arguments },
    }));
    messages.push({ role: 'assistant', content: planned.text, tool_calls: assistantCalls });

    for (const call of accepted) {
      calls += 1;
      let result: ToolExecution | null = null;
      let content: string;
      if (call.argumentError) {
        const error = failure(call.name, 'invalid_arguments', call.argumentError);
        failures.push(error);
        content = JSON.stringify({ status: 'error', tool: call.name, code: error.code, message: error.message });
      } else if (!allowed.has(call.name)) {
        const error = failure(call.name, 'unknown_tool', 'Tool is not allowed.');
        failures.push(error);
        content = JSON.stringify({ status: 'error', tool: call.name, code: error.code, message: error.message });
      } else {
        const signature = `${call.name}:${stable(call.arguments)}`;
        if (seen.has(signature)) {
          const error = failure(call.name, 'repeated_call', 'This tool call was already tried; choose a different tool or answer.');
          failures.push(error);
          content = JSON.stringify({ status: 'error', tool: call.name, code: error.code, message: error.message });
        } else {
          seen.add(signature);
          try {
            result = await withTimeout(execute(call.name, call.arguments, input.lang), config.toolTimeoutMs);
            results.push(result);
            content = JSON.stringify({
              status: 'ok',
              tool: result.tool,
              data: result.payload,
              ...(input.provenance ? { meta: input.provenance } : {}),
            });
          } catch (caught) {
            const timedOut = caught instanceof AssistantToolError && caught.message === 'Tool timed out.';
            const known = caught instanceof AssistantToolError && !timedOut;
            const code = timedOut
              ? 'timeout'
              : known
                ? 'invalid_arguments'
                : caught instanceof ProviderFailure
                  ? caught.code
                  : 'tool_error';
            const message = timedOut ? 'Tool timed out.' : known ? caught.message : 'Tool execution failed.';
            const error = failure(call.name, code, message);
            failures.push(error);
            content = JSON.stringify({ status: 'error', tool: call.name, code, message });
          }
        }
      }
      assistantLog('tool_call', {
        tool: call.name,
        lang: input.lang,
        ok: Boolean(result),
        candidates: result?.candidates?.length ?? 0,
        comps: result?.comps?.length ?? 0,
        stats: result?.stats?.length ?? 0,
      });
      messages.push({ role: 'tool', tool_name: call.name, content: truncate(content, 8_000) });
    }

    if (input.finalizeModel === false && results.length) {
      stopped = 'finalized';
      break;
    }
    if (calls >= config.maxCalls) {
      stopped = 'max_calls';
      break;
    }
  }

  if (rounds >= config.maxRounds && calls > 0 && stopped === 'no_call') {
    stopped = 'max_rounds';
    assistantLog('tool_limit', { calls, rounds, reason: 'max_rounds' });
  }
  if (rounds > 0) assistantLog('tool_loop', { calls, rounds, results: results.length, failures: failures.length, stopped });
  return { messages, results, failures, final, calls, rounds, stopped };
}
