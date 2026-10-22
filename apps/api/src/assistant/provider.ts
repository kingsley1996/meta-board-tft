import { assistantLog } from './logger.ts';

export type ProviderTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ProviderToolCall = {
  id?: string;
  name: string;
  arguments: unknown;
  argumentError?: string;
};

export type ProviderToolMessage = {
  role: 'tool';
  tool_name: string;
  content: string;
};

export type ProviderChatMessage =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      tool_calls?: {
        id?: string;
        function: { name: string; arguments: unknown };
      }[];
    }
  | ProviderToolMessage;

export type ProviderRequest = {
  system: string;
  messages: ProviderChatMessage[];
  maxOutputTokens: number;
  signal: AbortSignal;
  tools?: ProviderTool[];
  format?: 'json' | null;
};

export type ProviderResult = {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  toolCalls: ProviderToolCall[];
};

export type ProviderErrorCode = 'unavailable' | 'timeout' | 'aborted' | 'error';

export class ProviderError extends Error {
  code: ProviderErrorCode;

  constructor(code: ProviderErrorCode, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}

let modelLoaded = false;

function toMs(value: unknown): number | null {
  return typeof value === 'number' && value > 0 ? Math.round(value / 1_000_000) : null;
}

function timeoutForRequest(): number {
  const fallback = modelLoaded ? 90_000 : 60_000;
  const raw = modelLoaded ? process.env.ASSISTANT_REQUEST_TIMEOUT_MS : process.env.ASSISTANT_LOAD_TIMEOUT_MS;
  const number = Number(raw);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function chatEndpoint(): string {
  const raw = process.env.ASSISTANT_BASE_URL ?? 'http://127.0.0.1:11434';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderError('unavailable', 'ASSISTANT_BASE_URL is invalid');
  }
  const host = url.hostname;
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    throw new ProviderError('unavailable', 'ASSISTANT_BASE_URL must be a loopback HTTP address');
  }
  return `${url.origin}/api/chat`;
}

function abortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

export async function generateAssistantAnswer(request: ProviderRequest): Promise<ProviderResult> {
  const endpoint = chatEndpoint();
  const model = process.env.ASSISTANT_MODEL ?? 'qwen3.5:9b';
  const started = Date.now();
  const deadline = started + timeoutForRequest();

  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ProviderError('timeout', 'Ollama request timed out');
    const timeout = AbortSignal.timeout(remaining);
    const signal = AbortSignal.any([request.signal, timeout]);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal,
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: request.system }, ...request.messages],
          stream: false,
          ...(request.format === null ? {} : { format: request.format ?? 'json' }),
          think: false,
          keep_alive: '30m',
          ...(request.tools?.length ? { tools: request.tools } : {}),
          options: {
            num_ctx: 8192,
            num_predict: Math.min(800, Math.max(64, request.maxOutputTokens)),
            temperature: 0.2,
          },
        }),
      });
    } catch (error) {
      if (request.signal.aborted) throw new ProviderError('aborted', 'Assistant request was cancelled');
      if (timeout.aborted) throw new ProviderError('timeout', 'Ollama request timed out');
      if (abortError(error) || signal.aborted) throw new ProviderError('timeout', 'Ollama request timed out');
      if (attempt === 0 && Date.now() + 500 < deadline) {
        assistantLog('provider_retry', { attempt: attempt + 1, reason: 'network', durationMs: Date.now() - started });
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      throw new ProviderError('unavailable', 'Ollama is not reachable');
    }
    if (request.signal.aborted) throw new ProviderError('aborted', 'Assistant request was cancelled');

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 500);
      if (response.status === 404 || /model.*not found|not found.*model/i.test(detail)) {
        throw new ProviderError('unavailable', 'Ollama model is not available');
      }
      if (response.status >= 500 && attempt === 0 && Date.now() + 500 < deadline) {
        assistantLog('provider_retry', { attempt: attempt + 1, reason: `http_${response.status}`, durationMs: Date.now() - started });
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      assistantLog('provider_error', { code: 'provider_error', status: response.status, durationMs: Date.now() - started });
      throw new ProviderError('error', `Ollama responded ${response.status}`);
    }

    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > 2_000_000) {
      throw new ProviderError('error', 'Ollama response was too large');
    }
    const data = (await response.json().catch(() => null)) as {
      message?: { content?: unknown; tool_calls?: unknown };
      prompt_eval_count?: unknown;
      eval_count?: unknown;
      prompt_eval_duration?: unknown;
      eval_duration?: unknown;
      load_duration?: unknown;
    } | null;
    if (!data) throw new ProviderError('error', 'Ollama returned invalid JSON');
    const text = typeof data.message?.content === 'string' ? data.message.content : '';
    const rawToolCalls = Array.isArray(data.message?.tool_calls) ? data.message.tool_calls : [];
    const toolCalls: ProviderToolCall[] = [];
    for (const entry of rawToolCalls) {
      if (!entry || typeof entry !== 'object') continue;
      const raw = entry as { id?: unknown; function?: unknown };
      const fn = raw.function;
      if (!fn || typeof fn !== 'object') continue;
      const name = (fn as { name?: unknown }).name;
      if (typeof name !== 'string' || !name) continue;
      const args = (fn as { arguments?: unknown }).arguments;
      let parsed = args;
      let argumentError: string | undefined;
      if (typeof args === 'string') {
        try {
          parsed = JSON.parse(args);
        } catch {
          argumentError = 'Tool arguments are not valid JSON.';
        }
      }
      if (!argumentError && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
        argumentError = 'Tool arguments must be an object.';
      }
      toolCalls.push({
        ...(typeof raw.id === 'string' && raw.id ? { id: raw.id } : {}),
        name,
        arguments: argumentError ? null : parsed,
        ...(argumentError ? { argumentError } : {}),
      });
    }
    if (!text.trim() && !toolCalls.length) {
      throw new ProviderError('error', 'Ollama returned an empty answer');
    }

    modelLoaded = true;
    assistantLog('provider_usage', {
      model,
      inputTokens: typeof data?.prompt_eval_count === 'number' ? data.prompt_eval_count : 0,
      outputTokens: typeof data?.eval_count === 'number' ? data.eval_count : 0,
      durationMs: Date.now() - started,
      loadMs: toMs(data?.load_duration),
      promptEvalMs: toMs(data?.prompt_eval_duration),
      evalMs: toMs(data?.eval_duration),
    });
    return {
      text,
      model,
      usage: {
        inputTokens: typeof data?.prompt_eval_count === 'number' ? data.prompt_eval_count : 0,
        outputTokens: typeof data?.eval_count === 'number' ? data.eval_count : 0,
      },
      toolCalls,
    };
  }

  throw new ProviderError('error', 'Ollama failed after retry');
}
