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

export type ProviderTraceEvent =
  | { type: 'attempt'; provider: string; model: string; attempt: number }
  | { type: 'retry'; provider: string; model: string; attempt: number; reason: string; durationMs: number };

export type ProviderRequest = {
  system: string;
  messages: ProviderChatMessage[];
  maxOutputTokens: number;
  signal: AbortSignal;
  tools?: ProviderTool[];
  format?: 'json' | null;
  // When set, the provider streams from Ollama (NDJSON) and forwards each
  // decoded content chunk as it arrives. The returned ProviderResult still
  // carries the full accumulated text.
  onDelta?: (chunk: string) => void;
  // Observability hook: records each provider attempt and retry. Success and
  // failure are traced by the caller, which owns the request id and purpose.
  trace?: (event: ProviderTraceEvent) => void;
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

function parseToolCalls(raw: unknown): ProviderToolCall[] {
  if (!Array.isArray(raw)) return [];
  const toolCalls: ProviderToolCall[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as { id?: unknown; function?: unknown };
    const fn = record.function;
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
      ...(typeof record.id === 'string' && record.id ? { id: record.id } : {}),
      name,
      arguments: argumentError ? null : parsed,
      ...(argumentError ? { argumentError: argumentError } : {}),
    });
  }
  return toolCalls;
}

type OllamaChunk = {
  message?: { content?: unknown; tool_calls?: unknown };
  prompt_eval_count?: unknown;
  eval_count?: unknown;
  load_duration?: unknown;
  prompt_eval_duration?: unknown;
  eval_duration?: unknown;
};

function providerUsage(chunk: OllamaChunk): { inputTokens: number; outputTokens: number } {
  return {
    inputTokens: typeof chunk.prompt_eval_count === 'number' ? chunk.prompt_eval_count : 0,
    outputTokens: typeof chunk.eval_count === 'number' ? chunk.eval_count : 0,
  };
}

// Consumes an Ollama NDJSON stream, forwarding each content chunk to onDelta
// and returning the accumulated result.
async function readOllamaStream(
  response: Response,
  onDelta: (chunk: string) => void,
  signal: AbortSignal,
  timeout: AbortSignal
): Promise<ProviderResult> {
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError('error', 'Ollama returned no stream body');
  const model = process.env.ASSISTANT_MODEL ?? 'qwen3.5:9b';
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let rawToolCalls: unknown[] = [];
  let usage = { inputTokens: 0, outputTokens: 0 };
  const handleChunk = (chunk: OllamaChunk) => {
    const content = typeof chunk.message?.content === 'string' ? chunk.message.content : '';
    if (content) {
      text += content;
      onDelta(content);
    }
    if (Array.isArray(chunk.message?.tool_calls)) rawToolCalls.push(...chunk.message.tool_calls);
    if (chunk.prompt_eval_count !== undefined || chunk.eval_count !== undefined) usage = providerUsage(chunk);
  };
  const handleLine = (line: string) => {
    if (!line) return;
    try {
      handleChunk(JSON.parse(line) as OllamaChunk);
    } catch {
      // Skip malformed lines; the accumulated text is still usable.
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        handleLine(buffer.slice(0, newline).trim());
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    }
    handleLine(buffer.trim());
  } catch (error) {
    if (signal.aborted) throw new ProviderError('aborted', 'Assistant request was cancelled');
    if (timeout.aborted) throw new ProviderError('timeout', 'Ollama request timed out');
    throw new ProviderError('error', `Ollama stream failed: ${error instanceof Error ? error.message : 'unknown'}`);
  }
  if (!text.trim() && !rawToolCalls.length) {
    throw new ProviderError('error', 'Ollama returned an empty answer');
  }
  modelLoaded = true;
  return { text, model, usage, toolCalls: parseToolCalls(rawToolCalls) };
}

async function generateWithOllama(request: ProviderRequest): Promise<ProviderResult> {
  const endpoint = chatEndpoint();
  const model = process.env.ASSISTANT_MODEL ?? 'qwen3.5:9b';
  const started = Date.now();
  const deadline = started + timeoutForRequest();
  const streaming = typeof request.onDelta === 'function';

  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ProviderError('timeout', 'Ollama request timed out');
    request.trace?.({ type: 'attempt', provider: 'ollama', model, attempt: attempt + 1 });
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
          stream: streaming,
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
        request.trace?.({ type: 'retry', provider: 'ollama', model, attempt: attempt + 1, reason: 'network', durationMs: Date.now() - started });
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
        request.trace?.({ type: 'retry', provider: 'ollama', model, attempt: attempt + 1, reason: `http_${response.status}`, durationMs: Date.now() - started });
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      assistantLog('provider_error', { code: 'provider_error', status: response.status, durationMs: Date.now() - started });
      throw new ProviderError('error', `Ollama responded ${response.status}`);
    }

    if (streaming && request.onDelta) {
      const result = await readOllamaStream(response, request.onDelta, request.signal, timeout);
      assistantLog('provider_usage', {
        model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        durationMs: Date.now() - started,
        streamed: true,
      });
      return result;
    }

    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > 2_000_000) {
      throw new ProviderError('error', 'Ollama response was too large');
    }
    const data = (await response.json().catch(() => null)) as OllamaChunk | null;
    if (!data) throw new ProviderError('error', 'Ollama returned invalid JSON');
    const text = typeof data.message?.content === 'string' ? data.message.content : '';
    const toolCalls = parseToolCalls(data.message?.tool_calls);
    if (!text.trim() && !toolCalls.length) {
      throw new ProviderError('error', 'Ollama returned an empty answer');
    }

    modelLoaded = true;
    const usage = providerUsage(data);
    assistantLog('provider_usage', {
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      durationMs: Date.now() - started,
      loadMs: toMs(data.load_duration),
      promptEvalMs: toMs(data.prompt_eval_duration),
      evalMs: toMs(data.eval_duration),
    });
    return { text, model, usage, toolCalls };
  }

  throw new ProviderError('error', 'Ollama failed after retry');
}

// ---------------------------------------------------------------------------
// Multi-provider dispatch. ASSISTANT_PROVIDER picks the backend: "ollama" (the
// local default), "google" (Gemini API) or "openai" (any OpenAI-compatible
// endpoint). Remote adapters share the ProviderRequest/ProviderResult contract,
// so the orchestrator and tool loop are provider-agnostic.
// ---------------------------------------------------------------------------

export type AssistantProviderId = 'ollama' | 'google' | 'openai';

export function activeAssistantProvider(): AssistantProviderId {
  const raw = (process.env.ASSISTANT_PROVIDER ?? '').trim().toLowerCase();
  if (raw === 'google') return 'google';
  if (raw === 'openai') return 'openai';
  return 'ollama';
}

// Model the active provider will use; shown in traces before the first response.
export function activeAssistantModel(): string {
  const provider = activeAssistantProvider();
  if (provider === 'google') return googleModelName();
  if (provider === 'openai') return openaiRemoteConfig()?.model ?? 'gpt-4o-mini';
  return process.env.ASSISTANT_MODEL ?? 'qwen3.5:9b';
}

export async function generateAssistantAnswer(request: ProviderRequest): Promise<ProviderResult> {
  const provider = activeAssistantProvider();
  if (provider === 'google') return generateWithGoogle(request);
  if (provider === 'openai') return generateWithOpenAI(request);
  return generateWithOllama(request);
}

function envString(...names: string[]): string | null {
  for (const name of names) {
    const raw = process.env[name];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value) return value;
  }
  return null;
}

function remoteTimeoutMs(): number {
  const value = Number(process.env.ASSISTANT_REQUEST_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 90_000;
}

// Runs one remote API call under the request abort signal plus the shared
// request-timeout budget, and normalizes transport failures to ProviderError.
async function runRemote(provider: string, request: ProviderRequest, work: (signal: AbortSignal) => Promise<ProviderResult>): Promise<ProviderResult> {
  const timeout = AbortSignal.timeout(remoteTimeoutMs());
  const signal = AbortSignal.any([request.signal, timeout]);
  try {
    return await work(signal);
  } catch (error) {
    if (request.signal.aborted) throw new ProviderError('aborted', 'Assistant request was cancelled');
    if (timeout.aborted) throw new ProviderError('timeout', 'Model request timed out');
    if (error instanceof ProviderError) {
      if (error.code !== 'aborted') assistantLog('provider_error', { provider, code: error.code, message: error.message.slice(0, 300) });
      throw error;
    }
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new ProviderError('timeout', 'Model request timed out');
    }
    throw new ProviderError('unavailable', error instanceof Error ? error.message.slice(0, 200) : 'Model request failed');
  }
}

// HTTP status → ProviderError mapping for remote APIs. Auth and missing-model
// failures stay "unavailable" (loud 503); quota and server errors degrade
// gracefully to "error" so the orchestrator can fall back to deterministic data.
function remoteHttpError(status: number, detail: string, provider: string): ProviderError {
  const snippet = detail.slice(0, 300).replace(/\s+/g, ' ').trim();
  assistantLog('provider_error', { provider, status, message: snippet });
  if (status === 401 || status === 403 || status === 404) {
    return new ProviderError('unavailable', `${provider} rejected the request (${status})${snippet ? `: ${snippet}` : ''}`);
  }
  if (status >= 429) return new ProviderError('error', `${provider} responded ${status}`);
  return new ProviderError('error', `${provider} responded ${status}${snippet ? `: ${snippet}` : ''}`);
}

// Light JSON syntax repair for remote models with weaker formatting discipline
// (unescaped inner quotes, trailing commas, markdown fences). The strict
// validator downstream still judges content; this only rescues punctuation.
// Anything unrecoverable is returned unchanged.
export function repairJsonText(text: string): string {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed;
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // Continue with repairs.
  }
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (escaped) {
      escaped = false;
      out += ch;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      out += ch;
      continue;
    }
    if (ch === '"') {
      // A quote closes the string only when the next non-space character is
      // structural; otherwise it is content that must be escaped.
      const next = /^\s*(.)/.exec(trimmed.slice(i + 1))?.[1];
      if (next && !',}]'.includes(next) && next !== ':') {
        out += '\\"';
        continue;
      }
      inString = false;
      out += ch;
      continue;
    }
    out += ch;
  }
  const repaired = out.replace(/,\s*([}\]])/g, '$1');
  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    return trimmed;
  }
}

// ---------------------------------------------------------------------------
// Google Gemini (generativelanguage.googleapis.com)
// ---------------------------------------------------------------------------

type GeminiPart = { text?: string; functionCall?: { name?: string; args?: unknown } };
type GeminiContent = { role: 'user' | 'model'; parts: Record<string, unknown>[] };
type GeminiChunk = {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  modelVersion?: string;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

const GOOGLE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// Gemini's function-declaration schema is an OpenAPI subset: it rejects
// JSON-Schema keywords such as additionalProperties and $schema with 400s.
const GEMINI_SCHEMA_SKIP = new Set([
  '$schema',
  '$defs',
  '$id',
  'definitions',
  'additionalProperties',
  'additionalItems',
  'oneOf',
  'allOf',
  'if',
  'then',
  'else',
  'not',
  'dependencies',
  'patternProperties',
]);

export function sanitizeGeminiSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return { type: 'object' };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (GEMINI_SCHEMA_SKIP.has(key)) continue;
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, unknown>).map(([name, child]) => [name, sanitizeGeminiSchema(child)]);
      if (entries.length) out.properties = Object.fromEntries(entries);
      continue;
    }
    if (key === 'items') {
      // Gemini expects a single item schema; drop tuple-style items.
      const item = Array.isArray(value) ? value[0] : value;
      out.items = sanitizeGeminiSchema(item);
      continue;
    }
    if (key === 'anyOf' && Array.isArray(value)) {
      out.anyOf = value.map((child) => sanitizeGeminiSchema(child));
      continue;
    }
    out[key] = value;
  }
  return out;
}

function googleApiKey(): string | null {
  return envString('GOOGLE_API_KEY', 'google_api_key');
}

function googleModelName(): string {
  return envString('GOOGLE_MODEL', 'google_model') ?? 'gemini-3.5-flash-lite';
}

export function geminiContents(messages: ProviderChatMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: message.content }] });
      continue;
    }
    if (message.role === 'tool') {
      // Function results come back as a user-role content holding a
      // functionResponse part; the response value must be an object.
      let payload: unknown = message.content;
      try {
        payload = JSON.parse(message.content);
      } catch {
        // The tool loop truncates oversized results with "...", so raw text is
        // a valid fallback payload.
      }
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: message.tool_name, response: { result: payload } } }],
      });
      continue;
    }
    const parts: Record<string, unknown>[] = [];
    if (message.content.trim()) parts.push({ text: message.content });
    for (const call of message.tool_calls ?? []) {
      const args = call.function.arguments;
      parts.push({
        functionCall: {
          name: call.function.name,
          args: args && typeof args === 'object' && !Array.isArray(args) ? args : {},
        },
      });
    }
    contents.push({ role: 'model', parts: parts.length ? parts : [{ text: '' }] });
  }
  return contents;
}

function geminiToolDeclarations(tools: ProviderTool[]): Record<string, unknown>[] {
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: sanitizeGeminiSchema(tool.function.parameters),
      })),
    },
  ];
}

export function googleRequestBody(request: ProviderRequest): Record<string, unknown> {
  const model = googleModelName();
  // Gemma on the Gemini API rejects systemInstruction, function calling and
  // JSON mime mode: fold the system prompt into the first user turn and let
  // the prompt's JSON contract drive the output shape.
  if (/gemma/i.test(model)) {
    const plain = request.messages.map((message) => {
      if (message.role === 'tool') {
        return { role: 'user' as const, content: `Tool ${message.tool_name} result: ${message.content}` };
      }
      if (message.role === 'assistant') {
        return { role: 'assistant' as const, content: message.content };
      }
      return message;
    });
    const firstUser = plain.findIndex((message) => message.role === 'user');
    const withSystem =
      firstUser === -1
        ? [{ role: 'user' as const, content: request.system }, ...plain]
        : plain.map((message, index) =>
            index === firstUser ? { role: 'user' as const, content: `${request.system}\n\n---\n\n${message.content}` } : message
          );
    return {
      contents: geminiContents(withSystem),
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: Math.min(800, Math.max(64, request.maxOutputTokens)),
      },
    };
  }
  // JSON mime mode cannot be combined with function calling, so tool rounds
  // rely on the prompt's JSON contract instead.
  const jsonMode = request.format === 'json' && !request.tools?.length;
  return {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: geminiContents(request.messages),
    ...(request.tools?.length ? { tools: geminiToolDeclarations(request.tools) } : {}),
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: Math.min(800, Math.max(64, request.maxOutputTokens)),
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
      // 2.5 Flash supports disabling thinking entirely; Pro and newer models
      // do not, and stay on their default budget.
      ...(/2\.5-flash/i.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
}

async function generateWithGoogle(request: ProviderRequest): Promise<ProviderResult> {
  const apiKey = googleApiKey();
  if (!apiKey) throw new ProviderError('unavailable', 'GOOGLE_API_KEY is not configured');
  const model = googleModelName();
  const onDelta = typeof request.onDelta === 'function' ? request.onDelta : null;
  const streaming = onDelta !== null;
  // Transient 503/429 ("high demand") responses are common on Gemini; retry
  // once as long as nothing has streamed to the client yet.
  let streamed = false;
  const emit = onDelta
    ? (chunk: string) => {
        streamed = true;
        onDelta(chunk);
      }
    : null;
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    request.trace?.({ type: 'attempt', provider: 'google', model, attempt: attempt + 1 });
    try {
      const result = await runRemote('Google API', request, async (signal) => {
        const endpoint = streaming
          ? `${GOOGLE_ENDPOINT}/${model}:streamGenerateContent?alt=sse`
          : `${GOOGLE_ENDPOINT}/${model}:generateContent`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          signal,
          body: JSON.stringify(googleRequestBody(request)),
        });
        if (!response.ok) {
          throw remoteHttpError(response.status, await response.text().catch(() => ''), 'Google API');
        }
        return emit
          ? readGeminiStream(response, emit, request.signal, signal)
          : parseGeminiResponse((await response.json().catch(() => null)) as GeminiChunk | null, null);
      });
      assistantLog('provider_usage', {
        provider: 'google',
        model: result.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        durationMs: Date.now() - started,
        streamed,
      });
      return result;
    } catch (error) {
      if (
        attempt < 2 &&
        !streamed &&
        error instanceof ProviderError &&
        error.code === 'error'
      ) {
        assistantLog('provider_retry', { provider: 'google', attempt: attempt + 1, durationMs: Date.now() - started });
        request.trace?.({
          type: 'retry',
          provider: 'google',
          model,
          attempt: attempt + 1,
          reason: error.message.slice(0, 200),
          durationMs: Date.now() - started,
        });
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 1000 : 2500));
        continue;
      }
      throw error;
    }
  }
}

function parseGeminiResponse(data: GeminiChunk | null, onDelta: ((chunk: string) => void) | null): ProviderResult {
  if (!data) throw new ProviderError('error', 'Google API returned invalid JSON');
  if (data.promptFeedback?.blockReason) {
    throw new ProviderError('error', `Google API blocked the request (${data.promptFeedback.blockReason})`);
  }
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  let text = '';
  const calls: ProviderToolCall[] = [];
  for (const part of parts) {
    if (typeof part.text === 'string' && part.text) {
      text += part.text;
      onDelta?.(part.text);
    }
    if (part.functionCall?.name) calls.push({ name: part.functionCall.name, arguments: part.functionCall.args ?? {} });
  }
  if (!text.trim() && !calls.length) throw new ProviderError('error', 'Google API returned an empty answer');
  return {
    text: repairJsonText(text),
    model: data.modelVersion || googleModelName(),
    usage: {
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
    toolCalls: calls,
  };
}

async function readGeminiStream(
  response: Response,
  onDelta: (chunk: string) => void,
  abort: AbortSignal,
  timeout: AbortSignal
): Promise<ProviderResult> {
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError('error', 'Google API returned no stream body');
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let modelVersion = '';
  let usage = { inputTokens: 0, outputTokens: 0 };
  const rawCalls: { name: string; args: unknown }[] = [];
  const handlePayload = (payload: GeminiChunk) => {
    // Gemini can deliver an error object as an SSE payload (quota, overload,
    // safety) instead of closing the stream with a status code.
    if (payload.error) {
      throw new ProviderError('error', `Google API stream error: ${payload.error.message ?? payload.error.status ?? 'unknown'}`);
    }
    if (payload.modelVersion) modelVersion = payload.modelVersion;
    const parts = payload.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (typeof part.text === 'string' && part.text) {
        text += part.text;
        onDelta(part.text);
      }
      if (part.functionCall?.name) rawCalls.push({ name: part.functionCall.name, args: part.functionCall.args ?? {} });
    }
    if (payload.usageMetadata) {
      usage = {
        inputTokens: payload.usageMetadata.promptTokenCount ?? 0,
        outputTokens: payload.usageMetadata.candidatesTokenCount ?? 0,
      };
    }
  };
  const handleLine = (line: string) => {
    const data = line.startsWith('data:') ? line.slice(5).trim() : '';
    if (!data || data === '[DONE]') return;
    try {
      handlePayload(JSON.parse(data) as GeminiChunk);
    } catch (error) {
      // Provider errors must surface; only malformed JSON is skipped.
      if (error instanceof ProviderError) throw error;
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        handleLine(buffer.slice(0, newline).trim());
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    }
    handleLine(buffer.trim());
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (abort.aborted) throw new ProviderError('aborted', 'Assistant request was cancelled');
    if (timeout.aborted) throw new ProviderError('timeout', 'Google API request timed out');
    throw new ProviderError('error', `Google API stream failed: ${error instanceof Error ? error.message : 'unknown'}`);
  }
  if (!text.trim() && !rawCalls.length) throw new ProviderError('error', 'Google API returned an empty answer');
  return {
    text: repairJsonText(text),
    model: modelVersion || googleModelName(),
    usage,
    toolCalls: rawCalls.map((call) => ({ name: call.name, arguments: call.args })),
  };
}

// ---------------------------------------------------------------------------
// OpenAI-compatible chat completions (api.openai.com by default; point
// OPENAI_BASE_URL at any compatible gateway).
// ---------------------------------------------------------------------------

type OpenAIChunk = {
  model?: string;
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

const OPENAI_ENDPOINT = 'https://api.openai.com/v1';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1';

// OPENAI_API_KEY targets any OpenAI-compatible endpoint; with only
// OPENROUTER_API_KEY present, the adapter speaks OpenRouter's dialect
// (usage accounting via body, attribution headers, provider/model ids).
export function openaiRemoteConfig(): { base: string; key: string; model: string; openrouter: boolean } | null {
  const explicitKey = envString('OPENAI_API_KEY', 'openai_api_key');
  if (explicitKey) {
    return {
      base: envString('OPENAI_BASE_URL', 'openai_base_url') ?? OPENAI_ENDPOINT,
      key: explicitKey,
      model: envString('OPENAI_MODEL', 'openai_model') ?? 'gpt-4o-mini',
      openrouter: false,
    };
  }
  const openrouterKey = envString('OPENROUTER_API_KEY', 'openrouter_api_key');
  if (openrouterKey) {
    return {
      base: OPENROUTER_ENDPOINT,
      key: openrouterKey,
      model:
        envString('OPENROUTER_MODEL', 'openrouter_model') ??
        envString('OPENAI_MODEL', 'openai_model') ??
        'google/gemma-4-31b-it:free',
      openrouter: true,
    };
  }
  return null;
}

function openaiModelName(): string {
  return openaiRemoteConfig()?.model ?? 'gpt-4o-mini';
}

function openaiMessages(messages: ProviderChatMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let pendingIds: string[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      out.push({ role: 'user', content: message.content });
      pendingIds = [];
      continue;
    }
    if (message.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: pendingIds.shift() ?? `call_${out.length}`, content: message.content });
      continue;
    }
    const calls = (message.tool_calls ?? []).map((call, index) => {
      const id = call.id || `call_${index}_${call.function.name}`;
      return {
        id,
        type: 'function',
        function: {
          name: call.function.name,
          arguments: typeof call.function.arguments === 'string' ? call.function.arguments : JSON.stringify(call.function.arguments ?? {}),
        },
      };
    });
    out.push({ role: 'assistant', content: message.content || null, ...(calls.length ? { tool_calls: calls } : {}) });
    pendingIds = calls.map((call) => call.id);
  }
  return out;
}

export function openaiRequestBody(request: ProviderRequest, model: string = openaiModelName(), openrouter = false): Record<string, unknown> {
  const jsonMode = request.format === 'json' && !request.tools?.length;
  return {
    model,
    messages: [{ role: 'system', content: request.system }, ...openaiMessages(request.messages)],
    temperature: 0.2,
    // Free OpenRouter models are mostly reasoning models: their thinking
    // tokens share the completion budget, so keep a floor high enough for
    // reasoning plus the actual answer. Low effort trims the thinking phase.
    max_tokens: openrouter ? Math.max(request.maxOutputTokens, 8000) : Math.min(800, Math.max(64, request.maxOutputTokens)),
    ...(openrouter ? { reasoning: { effort: 'low' } } : {}),
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    ...(request.tools?.length ? { tools: request.tools, tool_choice: 'auto' } : {}),
  };
}

async function generateWithOpenAI(request: ProviderRequest): Promise<ProviderResult> {
  const config = openaiRemoteConfig();
  if (!config) throw new ProviderError('unavailable', 'OPENAI_API_KEY or OPENROUTER_API_KEY is not configured');
  const onDelta = typeof request.onDelta === 'function' ? request.onDelta : null;
  const streaming = onDelta !== null;
  // OpenRouter tracks usage through a body flag instead of stream_options.
  const body = {
    ...openaiRequestBody(request, config.model, config.openrouter),
    ...(streaming
      ? config.openrouter
        ? { stream: true, usage: { include: true } }
        : { stream: true, stream_options: { include_usage: true } }
      : {}),
  };
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${config.key}`,
    ...(config.openrouter ? { 'HTTP-Referer': 'http://localhost:4173', 'X-Title': 'MetaBoard' } : {}),
  };
  const providerName = config.openrouter ? 'OpenRouter' : 'OpenAI API';
  let streamed = false;
  const emit = onDelta
    ? (chunk: string) => {
        streamed = true;
        onDelta(chunk);
      }
    : null;
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    request.trace?.({ type: 'attempt', provider: providerName, model: config.model, attempt: attempt + 1 });
    try {
      const result = await runRemote(providerName, request, async (signal) => {
        const response = await fetch(`${config.base}/chat/completions`, {
          method: 'POST',
          headers,
          signal,
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          throw remoteHttpError(response.status, await response.text().catch(() => ''), providerName);
        }
        return streaming && emit
          ? readOpenAIStream(response, emit, request.signal, signal)
          : parseOpenAIResponse((await response.json().catch(() => null)) as OpenAIChunk & {
              choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] } }[];
            } | null, config.model);
      });
      assistantLog('provider_usage', {
        provider: config.openrouter ? 'openrouter' : 'openai',
        model: result.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        durationMs: Date.now() - started,
        streamed,
      });
      return result;
    } catch (error) {
      if (attempt < 2 && !streamed && error instanceof ProviderError && error.code === 'error') {
        assistantLog('provider_retry', { provider: providerName, attempt: attempt + 1, durationMs: Date.now() - started });
        request.trace?.({
          type: 'retry',
          provider: providerName,
          model: config.model,
          attempt: attempt + 1,
          reason: error.message.slice(0, 200),
          durationMs: Date.now() - started,
        });
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 1000 : 2500));
        continue;
      }
      throw error;
    }
  }
}

function parseOpenAIResponse(
  data: {
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] } }[];
  } | null,
  fallbackModel: string
): ProviderResult {
  if (!data) throw new ProviderError('error', 'OpenAI API returned invalid JSON');
  const message = data.choices?.[0]?.message;
  const text = typeof message?.content === 'string' ? message.content : '';
  const toolCalls = parseToolCalls(message?.tool_calls ?? []);
  if (!text.trim() && !toolCalls.length) throw new ProviderError('error', 'OpenAI API returned an empty answer');
  return {
    text: repairJsonText(text),
    model: data.model || fallbackModel,
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    },
    toolCalls,
  };
}

async function readOpenAIStream(
  response: Response,
  onDelta: (chunk: string) => void,
  abort: AbortSignal,
  timeout: AbortSignal
): Promise<ProviderResult> {
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError('error', 'OpenAI API returned no stream body');
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let model = '';
  let usage = { inputTokens: 0, outputTokens: 0 };
  const pending = new Map<number, { id?: string; name: string; args: string }>();
  const handlePayload = (payload: OpenAIChunk) => {
    if (payload.error) throw new ProviderError('error', `OpenAI API stream error: ${payload.error.message ?? 'unknown'}`);
    if (payload.model) model = payload.model;
    const delta = payload.choices?.[0]?.delta;
    if (typeof delta?.content === 'string' && delta.content) {
      text += delta.content;
      onDelta(delta.content);
    }
    for (const call of delta?.tool_calls ?? []) {
      const index = typeof call.index === 'number' ? call.index : pending.size;
      const slot = pending.get(index) ?? { name: '', args: '' };
      if (call.id) slot.id = call.id;
      if (call.function?.name) slot.name = call.function.name;
      if (call.function?.arguments) slot.args += call.function.arguments;
      pending.set(index, slot);
    }
    if (payload.usage) {
      usage = { inputTokens: payload.usage.prompt_tokens ?? 0, outputTokens: payload.usage.completion_tokens ?? 0 };
    }
  };
  const handleLine = (line: string) => {
    const data = line.startsWith('data:') ? line.slice(5).trim() : '';
    if (!data || data === '[DONE]') return;
    try {
      handlePayload(JSON.parse(data) as OpenAIChunk);
    } catch (error) {
      // Provider errors must surface; only malformed JSON is skipped.
      if (error instanceof ProviderError) throw error;
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        handleLine(buffer.slice(0, newline).trim());
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    }
    handleLine(buffer.trim());
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (abort.aborted) throw new ProviderError('aborted', 'Assistant request was cancelled');
    if (timeout.aborted) throw new ProviderError('timeout', 'OpenAI API request timed out');
    throw new ProviderError('error', `OpenAI API stream failed: ${error instanceof Error ? error.message : 'unknown'}`);
  }
  const toolCalls = parseToolCalls(
    [...pending.values()].filter((call) => call.name).map((call) => ({ ...(call.id ? { id: call.id } : {}), function: { name: call.name, arguments: call.args } }))
  );
  if (!text.trim() && !toolCalls.length) throw new ProviderError('error', 'OpenAI API returned an empty answer');
  return { text: repairJsonText(text), model: model || openaiModelName(), usage, toolCalls };
}
