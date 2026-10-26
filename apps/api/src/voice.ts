import express, { Router, type NextFunction, type Request, type Response as ExpressResponse } from 'express';

const router = Router();
const sampleRate = 16_000;
const maxSamples = sampleRate * 60;

type SttProvider = 'deepgram' | 'groq' | 'openrouter' | 'elevenlabs' | 'openai' | 'gemini';

// Reliability-first, measured on this account's keys with one shared Vietnamese
// corpus (apps/api/scripts/stt-bench.mjs): Deepgram nova-3 has the lowest WER
// (0.063 on a 14 s clip) and no quota wall, Groq is the fast $0 free tier that
// survived 18 un-spaced requests, and Gemini's AI Studio free tier both 429s at
// ~17 requests/minute and rewrites pronouns it "knows better" — so it is now a
// last cloud resort.
const cloudProviderOrder: readonly SttProvider[] = ['deepgram', 'groq', 'openrouter', 'elevenlabs', 'openai', 'gemini'];
const sttLanguage = (process.env.STT_LANGUAGE?.trim() || 'vi').toLowerCase();
const sttMaxConcurrency = Math.max(1, Number(process.env.STT_MAX_CONCURRENCY) || 4);

// A provider that just refused us stays skipped for a while, so one rate-limited
// vendor costs a single doomed request per cooldown window instead of one per
// user turn.
const sttCooldowns = new Map<SttProvider, { until: number; reason: string }>();

function sttCooldownMs(env: NodeJS.ProcessEnv = process.env): number {
  const value = Math.round(Number(env.STT_BUSY_COOLDOWN_MS)) || 30_000;
  return Math.min(600_000, Math.max(1_000, value));
}

let activeTranscriptions = 0;

class SpeechBusyError extends Error {
  readonly retryAfterMs: number | null;
  constructor(message = 'provider is busy', retryAfterMs: number | null = null) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}
class SpeechUnavailableError extends Error {
  readonly httpStatus: number;
  readonly code: string;
  constructor(message: string, httpStatus = 502, code = 'speech_generation_failed') {
    super(message);
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

function envValue(env: NodeJS.ProcessEnv, ...names: string[]): string | null {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return null;
}

function cloudConfigured(provider: SttProvider, env: NodeJS.ProcessEnv = process.env): boolean {
  switch (provider) {
    case 'deepgram':
      return Boolean(envValue(env, 'DEEPGRAM_API_KEY'));
    case 'groq':
      return Boolean(envValue(env, 'GROQ_API_KEY'));
    case 'openrouter':
      return Boolean(envValue(env, 'OPENROUTER_API_KEY'));
    case 'elevenlabs':
      return Boolean(envValue(env, 'ELEVENLABS_API_KEY'));
    case 'openai':
      return Boolean(envValue(env, 'OPENAI_API_KEY'));
    case 'gemini':
      return Boolean(envValue(env, 'GOOGLE_API_KEY'));
  }
}

// The cloud providers usable for this environment, in failover order. One
// provider is never the whole plan: a free tier that 429s or a vendor that is
// briefly down would otherwise surface as "speech recognition failed" for the
// user.
//
// OpenRouter is deliberately absent from the automatic chain: it shares its key
// with the assistant LLM, its audio endpoint needs a separate prepaid balance
// (it answers 402 without one) and it lost the accuracy bench. Pin
// STT_PROVIDER=openrouter to use it once funded.
const optInOnlyProviders: readonly SttProvider[] = ['openrouter'];

export function sttProviderCandidates(env: NodeJS.ProcessEnv = process.env): SttProvider[] {
  const explicit = env.STT_PROVIDER?.trim().toLowerCase();
  if (explicit) {
    const wanted = cloudProviderOrder.find((provider) => provider === explicit);
    return wanted && cloudConfigured(wanted, env) ? [wanted] : [];
  }
  return cloudProviderOrder.filter(
    (provider) => cloudConfigured(provider, env) && !optInOnlyProviders.includes(provider)
  );
}

function providerCooldown(provider: SttProvider): string | null {
  const entry = sttCooldowns.get(provider);
  if (!entry) return null;
  if (entry.until <= Date.now()) {
    sttCooldowns.delete(provider);
    return null;
  }
  return entry.reason;
}

function coolProvider(provider: SttProvider, reason: string, ms: number): void {
  sttCooldowns.set(provider, { until: Date.now() + ms, reason });
}

export function clearSttCooldowns(): void {
  sttCooldowns.clear();
}

export function sttProviderStatus(env: NodeJS.ProcessEnv = process.env): Array<{ provider: SttProvider; coolingDown: string | null }> {
  return sttProviderCandidates(env).map((provider) => ({ provider, coolingDown: providerCooldown(provider) }));
}

// 16-bit PCM mono WAV, the one input format every supported provider accepts.
export function encodeWavPcm16(samples: Float32Array): Buffer {
  const pcm = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    pcm.writeInt16LE(Math.round(clamped * 32767), index * 2);
  }
  return wavFromPcm16(pcm, sampleRate);
}

export function wavFromPcm16(pcm: Buffer, rate: number): Buffer {
  const bytes = Buffer.alloc(44 + pcm.byteLength);
  bytes.write('RIFF', 0, 'latin1');
  bytes.writeUInt32LE(36 + pcm.byteLength, 4);
  bytes.write('WAVE', 8, 'latin1');
  bytes.write('fmt ', 12, 'latin1');
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36, 'latin1');
  bytes.writeUInt32LE(pcm.byteLength, 40);
  pcm.copy(bytes, 44);
  return bytes;
}

async function transcribeWithElevenLabs(
  wav: Buffer,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const apiKey = envValue(env, 'ELEVENLABS_API_KEY');
  if (!apiKey) throw new SpeechUnavailableError('ELEVENLABS_API_KEY is not configured');
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'speech.wav');
  form.append('model_id', env.STT_ELEVENLABS_MODEL?.trim() || 'scribe_v2');
  if (sttLanguage) form.append('language_code', sttLanguage);
  const response = await fetchImpl('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 429) throw new SpeechBusyError('ElevenLabs rate limited', retryAfterMs(response, sttCooldownMs(env)));
  if (!response.ok) {
    const detail = await upstreamErrorText(response);
    throw new SpeechUnavailableError(
      detail,
      response.status,
      isCredentialStatus(response.status) ? 'stt_credentials_rejected' : 'transcription_failed'
    );
  }
  const result = (await response.json()) as { text?: unknown };
  return typeof result.text === 'string' ? result.text : '';
}

async function transcribeWithOpenAiCompatible(
  provider: 'openai' | 'groq',
  wav: Buffer,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const isGroq = provider === 'groq';
  const apiKey = envValue(env, isGroq ? 'GROQ_API_KEY' : 'OPENAI_API_KEY');
  if (!apiKey) {
    throw new SpeechUnavailableError(isGroq ? 'GROQ_API_KEY is not configured' : 'OPENAI_API_KEY is not configured');
  }
  const baseUrl = isGroq
    ? 'https://api.groq.com/openai/v1'
    : (envValue(env, 'STT_OPENAI_BASE_URL', 'OPENAI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = isGroq
    ? env.STT_GROQ_MODEL?.trim() || 'whisper-large-v3-turbo'
    : env.STT_OPENAI_MODEL?.trim() || 'gpt-4o-transcribe';
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'speech.wav');
  form.append('model', model);
  if (sttLanguage) form.append('language', sttLanguage);
  const response = await fetchImpl(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 429) {
    throw new SpeechBusyError(`${provider} rate limited`, retryAfterMs(response, sttCooldownMs(env)));
  }
  if (!response.ok) {
    throw new SpeechUnavailableError(
      `${provider} transcription responded ${response.status}`,
      response.status,
      isCredentialStatus(response.status) ? 'stt_credentials_rejected' : 'transcription_failed'
    );
  }
  const result = (await response.json()) as { text?: unknown };
  return typeof result.text === 'string' ? result.text : '';
}

// Deepgram is the only vendor here whose options travel in the query string and
// whose audio is the raw body; the transcript lives in results.channels[0]
// .alternatives[0].transcript (the legacy results.transcripts path is gone).
async function transcribeWithDeepgram(
  wav: Buffer,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const apiKey = envValue(env, 'DEEPGRAM_API_KEY');
  if (!apiKey) throw new SpeechUnavailableError('DEEPGRAM_API_KEY is not configured');
  const query = new URLSearchParams({ model: env.STT_DEEPGRAM_MODEL?.trim() || 'nova-3', smart_format: 'true' });
  if (sttLanguage) query.set('language', sttLanguage);
  const response = await fetchImpl(`https://api.deepgram.com/v1/listen?${query.toString()}`, {
    method: 'POST',
    headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'audio/wav' },
    body: wav,
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 429) throw new SpeechBusyError('Deepgram rate limited', retryAfterMs(response, sttCooldownMs(env)));
  if (!response.ok) {
    const detail = await upstreamErrorText(response);
    throw new SpeechUnavailableError(
      detail,
      response.status,
      isCredentialStatus(response.status) ? 'stt_credentials_rejected' : 'transcription_failed'
    );
  }
  const result = (await response.json()) as {
    results?: { channels?: Array<{ alternatives?: Array<{ transcript?: unknown }> }> };
  };
  const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  return typeof transcript === 'string' ? transcript : '';
}

// OpenRouter wraps several STT vendors behind one key; it takes the audio as base64
// in JSON instead of multipart, which also dodges the 25 MB multipart ceiling.
async function transcribeWithOpenRouter(
  wav: Buffer,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const apiKey = envValue(env, 'OPENROUTER_API_KEY');
  if (!apiKey) throw new SpeechUnavailableError('OPENROUTER_API_KEY is not configured');
  const response = await fetchImpl('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.STT_OPENROUTER_MODEL?.trim() || 'openai/whisper-large-v3-turbo',
      input_audio: { data: wav.toString('base64'), format: 'wav' },
      ...(sttLanguage ? { language: sttLanguage } : {}),
      response_format: 'json',
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 429) throw new SpeechBusyError('OpenRouter rate limited', retryAfterMs(response, sttCooldownMs(env)));
  if (!response.ok) {
    const detail = await upstreamErrorText(response);
    throw new SpeechUnavailableError(
      detail,
      response.status,
      isCredentialStatus(response.status) ? 'stt_credentials_rejected' : 'transcription_failed'
    );
  }
  const result = (await response.json()) as { text?: unknown };
  return typeof result.text === 'string' ? result.text : '';
}

async function transcribeWithGemini(
  wav: Buffer,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const apiKey = envValue(env, 'GOOGLE_API_KEY');
  if (!apiKey) throw new SpeechUnavailableError('GOOGLE_API_KEY is not configured');
  const model = env.STT_GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite';
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text:
                  'Transcribe the speech in this recording verbatim in its original language, preserving the exact wording. ' +
                  'Output only the transcript with no commentary. If the recording contains no speech, output an empty string.',
              },
              { inline_data: { mime_type: 'audio/wav', data: wav.toString('base64') } },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(45_000),
    }
  );
  if (response.status === 429) throw new SpeechBusyError('Gemini rate limited', retryAfterMs(response, sttCooldownMs(env)));
  if (!response.ok) {
    const detail = await upstreamErrorText(response);
    throw new SpeechUnavailableError(
      detail,
      response.status,
      isCredentialStatus(response.status) ? 'stt_credentials_rejected' : 'transcription_failed'
    );
  }
  const result = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  };
  const parts = result.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => (typeof part.text === 'string' ? part.text : '')).join('').trim();
}

// 401/402/403 never fix themselves by retrying the same audio: bad key, no
// credit, or no access. Everything else is worth a second try on another vendor.
function isCredentialStatus(status: number): boolean {
  return status === 401 || status === 402 || status === 403;
}

async function transcribeCloud(
  provider: SttProvider,
  wav: Buffer,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch
): Promise<string> {
  switch (provider) {
    case 'elevenlabs':
      return transcribeWithElevenLabs(wav, env, fetchImpl);
    case 'openai':
      return transcribeWithOpenAiCompatible('openai', wav, env, fetchImpl);
    case 'groq':
      return transcribeWithOpenAiCompatible('groq', wav, env, fetchImpl);
    case 'openrouter':
      return transcribeWithOpenRouter(wav, env, fetchImpl);
    case 'deepgram':
      return transcribeWithDeepgram(wav, env, fetchImpl);
    case 'gemini':
      return transcribeWithGemini(wav, env, fetchImpl);
  }
}

// Walk the configured providers until one returns text. Every refusal puts that
// provider on a timeout so a rate-limited vendor costs one doomed request per
// window instead of one per user turn, and the answer never depends on which
// vendor happened to be first in the list.
// Walking six vendors with a 30 s timeout each could park a user's turn for three
// minutes when one of them hangs, so the chain gets one shared budget: the head
// provider always gets its try, and a later provider is only asked while the
// budget has room left.
function sttChainBudgetMs(env: NodeJS.ProcessEnv = process.env): number {
  const value = Math.round(Number(env.STT_CHAIN_BUDGET_MS)) || 45_000;
  return Math.min(180_000, Math.max(2_000, value));
}

export async function transcribeWithFailover(
  wav: Buffer,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<{ text: string; provider: SttProvider }> {
  const candidates = sttProviderCandidates(env);
  const deadline = Date.now() + sttChainBudgetMs(env);
  let lastError: unknown = null;
  for (const provider of candidates) {
    if (providerCooldown(provider)) continue;
    if (lastError && Date.now() >= deadline) {
      throw new SpeechUnavailableError('the transcription provider chain ran out of time');
    }
    try {
      const text = await transcribeCloud(provider, wav, env, fetchImpl);
      return { text, provider };
    } catch (error) {
      if (!(error instanceof SpeechBusyError) && !(error instanceof SpeechUnavailableError)) throw error;
      const credentialFailure = error instanceof SpeechUnavailableError && error.code === 'stt_credentials_rejected';
      const window = credentialFailure ? 60_000 : (error instanceof SpeechBusyError ? error.retryAfterMs : null) ?? sttCooldownMs(env);
      coolProvider(provider, `${provider}: ${error.message}`, window);
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  throw new SpeechBusyError('every transcription provider is cooling down');
}

router.get('/status', (_req, res) => {
  const providers = sttProviderStatus();
  // Upstream messages can name hosts and key ids, so the reason only travels to
  // the browser console outside production — same rule as /tts/status.
  const debug = process.env.NODE_ENV !== 'production';
  res.json({
    available: providers.some((entry) => !entry.coolingDown),
    provider: providers[0]?.provider ?? null,
    providers: providers.map((entry) => ({
      provider: entry.provider,
      coolingDown: Boolean(entry.coolingDown),
      ...(debug && entry.coolingDown ? { reason: entry.coolingDown } : {}),
    })),
  });
});

router.post(
  '/transcribe',
  express.raw({ type: 'application/octet-stream', limit: '4mb' }),
  async (req, res) => {
    if (sttProviderCandidates().length === 0) {
      return res.status(503).json({ error: 'stt_not_configured' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.byteLength < 4 || req.body.byteLength % 4 !== 0) {
      return res.status(400).json({ error: 'invalid_audio' });
    }
    if (Number(req.header('x-sample-rate')) !== sampleRate) {
      return res.status(400).json({ error: 'unsupported_sample_rate' });
    }

    const samplesCount = req.body.byteLength / Float32Array.BYTES_PER_ELEMENT;
    if (samplesCount > maxSamples) return res.status(413).json({ error: 'audio_too_long' });
    if (activeTranscriptions >= sttMaxConcurrency) {
      return res.status(429).json({ error: 'transcription_busy' });
    }

    const samples = new Float32Array(samplesCount);
    let squaredAmplitude = 0;
    for (let index = 0; index < samplesCount; index += 1) {
      const value = req.body.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT);
      if (!Number.isFinite(value)) return res.status(400).json({ error: 'invalid_audio' });
      samples[index] = value;
      squaredAmplitude += value * value;
    }
    if (Math.sqrt(squaredAmplitude / samplesCount) < 0.001) {
      return res.status(422).json({ error: 'no_speech' });
    }

    activeTranscriptions += 1;
    try {
      const outcome = await transcribeWithFailover(encodeWavPcm16(samples));
      const text = outcome.text.trim();
      if (!text || !/[\p{L}\p{N}]/u.test(text)) return res.status(422).json({ error: 'no_speech' });
      res.setHeader('x-stt-provider', outcome.provider);
      return res.json({ text });
    } catch (error) {
      if (error instanceof SpeechBusyError) {
        return res.status(429).json({ error: 'transcription_busy' });
      }
      if (error instanceof SpeechUnavailableError) {
        console.error('Voice transcription unavailable', error.message);
        return res.status(502).json({ error: 'transcription_failed' });
      }
      throw error;
    } finally {
      activeTranscriptions -= 1;
    }
  }
);

// --- TTS: VieNeu engine, one sentence-sized chunk per request ---
//
// VieNeu on CPU needs ~3.4 s for a 250-character chunk, so the client splits an
// answer into short chunks and plays one while the next is still synthesizing.
// The same wire format (OpenAI-compatible POST /v1/audio/speech) is served by
// the local `apps.openai_speech` server and by the hosted https://api.vieneu.io
// cloud, so switching engines is only a VIENEU_TTS_URL/API_KEY change.

const ttsFormats = ['wav', 'mp3', 'pcm', 'opus', 'ulaw'] as const;
export type TtsFormat = (typeof ttsFormats)[number];

const ttsContentTypes: Record<TtsFormat, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  // Headerless formats carry no container hint, so the browser needs the rate.
  pcm: 'audio/L16;rate=48000',
  opus: 'audio/ogg',
  ulaw: 'audio/basic',
};

function ttsBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.VIENEU_TTS_URL?.trim() || 'http://127.0.0.1:8001').replace(/\/+$/, '');
}

function ttsVoice(env: NodeJS.ProcessEnv = process.env): string {
  return env.VIENEU_TTS_VOICE?.trim() || 'Hải Đăng';
}

// The cloud retired the v3 model names and the local server ignores the field
// ("any string; reported back as-is"), so one default works for both engines.
export function ttsModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.VIENEU_TTS_MODEL?.trim() || 'vieneu-v4';
}

export function ttsFormat(env: NodeJS.ProcessEnv = process.env): TtsFormat {
  const value = env.VIENEU_TTS_FORMAT?.trim().toLowerCase();
  return (ttsFormats as readonly string[]).includes(value ?? '') ? (value as TtsFormat) : 'wav';
}

// A loopback probe answers in milliseconds; a hosted one crosses the internet,
// and a too-short timeout makes the client fall back to the browser engine while
// the cloud is perfectly healthy.
export function ttsProbeTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const value = Math.round(Number(env.VIENEU_TTS_PROBE_TIMEOUT_MS)) || 4_000;
  return Math.min(15_000, Math.max(500, value));
}

export function ttsChunkCharacters(env: NodeJS.ProcessEnv = process.env): number {
  const value = Math.round(Number(env.TTS_CHUNK_CHARACTERS)) || 150;
  return Math.min(400, Math.max(40, value));
}

export function ttsLimits(env: NodeJS.ProcessEnv = process.env) {
  return {
    // VieNeu serves two requests at once and answers 429 beyond that.
    maxConcurrency: Math.max(1, Number(env.TTS_MAX_CONCURRENCY) || 2),
    queueWaitMs: Math.max(0, Number(env.TTS_QUEUE_WAIT_MS) || 5_000),
    timeoutMs: Math.max(5_000, Number(env.TTS_TIMEOUT_MS) || 45_000),
  };
}

function vieneuHeaders(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const headers: Record<string, string> = {};
  const apiKey = env.VIENEU_TTS_API_KEY?.trim();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

// 401/403 from the cloud means bad key or exhausted/revoked token package, and
// its docs are explicit that retrying does not help. Without this, every answer
// would burn its whole chunk budget on doomed requests before the client gave up
// on the engine, so the fault is remembered per origin and `/tts/status` reports
// the engine as unavailable until the cooldown expires.
const engineFaults = new Map<string, { until: number; reason: string; code: string }>();

function rememberFault(origin: string, reason: string, cooldownMs: number, code: string): void {
  engineFaults.set(origin, { until: Date.now() + cooldownMs, reason, code });
}

export function ttsFault(env: NodeJS.ProcessEnv = process.env): { reason: string; code: string } | null {
  const origin = new URL(ttsBaseUrl(env)).origin;
  const fault = engineFaults.get(origin);
  if (!fault) return null;
  if (fault.until <= Date.now()) {
    engineFaults.delete(origin);
    return null;
  }
  return { reason: fault.reason, code: fault.code };
}

export function clearTtsFaults(): void {
  engineFaults.clear();
}

// Both the OpenAI-compatible shape ({ error: { message, type, code } }) and the
// native one ({ statusCode, message, code }) appear on this API; keep whichever
// text the upstream actually sent, truncated so it can be logged safely.
async function upstreamErrorText(response: Response): Promise<string> {
  let raw = '';
  try {
    raw = (await response.text()).slice(0, 2_000);
  } catch {
    return `HTTP ${response.status}`;
  }
  try {
    const body = JSON.parse(raw) as {
      error?: { message?: string; type?: string; code?: string | null };
      message?: string;
      code?: string;
    };
    const openAi = body.error;
    const detail = openAi?.message || openAi?.type || body.message || body.code || '';
    const code = !openAi?.code && body.code ? body.code : openAi?.code;
    return `HTTP ${response.status}${code ? ` ${code}` : ''}${detail ? `: ${String(detail).slice(0, 180)}` : ''}`;
  } catch {
    return `HTTP ${response.status}: ${raw.slice(0, 180)}`;
  }
}

// Retry-After is either seconds or an HTTP date; anything unparseable is ignored.
function retryAfterMs(response: Response, maxMs: number): number | null {
  const header = response.headers.get('retry-after')?.trim();
  if (!header) return null;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : Date.parse(header) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.min(ms, maxMs);
}

export async function vieneuAvailable(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  if (ttsFault(env)) return false;
  try {
    const response = await fetchImpl(`${ttsBaseUrl(env)}/v1/voices`, {
      headers: vieneuHeaders(env),
      signal: AbortSignal.timeout(ttsProbeTimeoutMs(env)),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Speech requests queue briefly for a slot instead of failing, so a burst of
// chunk prefetches does not surface an error for the whole answer.
const speechSlots = { active: 0, waiters: [] as Array<() => void> };

async function acquireSpeechSlot(limit: number, waitMs: number): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    if (speechSlots.active < limit) {
      speechSlots.active += 1;
      return true;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    await new Promise<void>((resolve) => {
      const waiter = () => {
        const index = speechSlots.waiters.indexOf(waiter);
        if (index >= 0) speechSlots.waiters.splice(index, 1);
        resolve();
      };
      speechSlots.waiters.push(waiter);
      setTimeout(waiter, remaining);
    });
  }
}

function releaseSpeechSlot(): void {
  speechSlots.active -= 1;
  speechSlots.waiters.shift()?.();
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function synthVieneuChunk(
  input: string,
  voice: string,
  signal: AbortSignal,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<{ audio: Buffer; contentType: string }> {
  const limits = ttsLimits(env);
  const format = ttsFormat(env);
  const origin = new URL(ttsBaseUrl(env)).origin;
  const knownFault = ttsFault(env);
  if (knownFault) {
    // A rejected key or a saturated queue stays cheap: the browser gets the
    // answer from the engine it already knows is gone, without another doomed
    // upstream request per chunk.
    throw new SpeechUnavailableError(knownFault.reason, 503, knownFault.code);
  }
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let upstream: Response;
    try {
      upstream = await fetchImpl(`${ttsBaseUrl(env)}/v1/audio/speech`, {
        method: 'POST',
        headers: { ...vieneuHeaders(env), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ttsModel(env),
          voice,
          input,
          response_format: format,
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(limits.timeoutMs)]),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof Error && error.name === 'TimeoutError') throw error;
      throw new SpeechUnavailableError('VieNeu is unreachable', 503, 'tts_unavailable');
    }
    if (upstream.status === 429) {
      // The cloud sends Retry-After for the transient codes (queue full, balance
      // race); daily/weekly caps answer with resetAt instead and are pointless to
      // wait out inside one request, so a plain backoff covers those.
      const wait = retryAfterMs(upstream, limits.timeoutMs) ?? 400 * attempt;
      void upstream.body?.cancel();
      if (attempt < maxAttempts) {
        await delay(wait, signal);
        continue;
      }
      if (wait >= 30_000) rememberFault(origin, `engine queue busy: ${wait} ms`, wait, 'speech_busy');
      throw new SpeechBusyError();
    }
    if (upstream.status === 401 || upstream.status === 403) {
      const detail = await upstreamErrorText(upstream);
      rememberFault(origin, detail, 60_000, 'tts_credentials_rejected');
      console.error('VieNeu rejected credentials', detail);
      throw new SpeechUnavailableError(detail, 503, 'tts_credentials_rejected');
    }
    if (!upstream.ok) {
      const detail = await upstreamErrorText(upstream);
      if (upstream.status === 404) {
        throw new SpeechUnavailableError('VieNeu is not running', 503, 'tts_unavailable');
      }
      // 400 on this route means the engine refused this particular text (its
      // docs reject long consonant-only runs and non-Latin scripts); it is not a
      // reason to stop using the engine for the next answer.
      if (upstream.status === 400) {
        throw new SpeechUnavailableError(detail, 400, 'speech_text_rejected');
      }
      throw new SpeechUnavailableError(detail);
    }
    const audio = Buffer.from(await upstream.arrayBuffer());
    // A full chunk is tens of kilobytes at 48 kHz; anything outside that range is
    // an error page or a truncated stream rather than speech.
    if (audio.length < 4_000 || audio.length > 30 * 1024 * 1024) {
      throw new SpeechUnavailableError('VieNeu returned invalid audio');
    }
    return {
      audio,
      contentType: upstream.headers.get('content-type')?.split(';')[0]?.trim() || ttsContentTypes[format],
    };
  }
  throw new SpeechBusyError();
}

router.get('/tts/status', async (_req, res) => {
  const available = await vieneuAvailable();
  res.json({
    available,
    provider: 'vieneu',
    voice: ttsVoice(),
    maxChars: ttsChunkCharacters(),
    // The upstream message can name hosts and key ids; dev-only so the browser
    // console is enough to diagnose "why is the engine grey".
    ...(available || process.env.NODE_ENV === 'production'
      ? {}
      : { reason: ttsFault()?.reason ?? (available ? null : 'engine did not answer the voices probe') }),
  });
});

router.post('/tts/speech', async (req, res) => {
  const input = typeof req.body?.input === 'string' ? req.body.input.trim() : '';
  const maxChars = ttsChunkCharacters();
  if (!input || input.length > maxChars) {
    return res.status(400).json({ error: 'invalid_speech_text', maxChars });
  }
  const requestedVoice = typeof req.body?.voice === 'string' ? req.body.voice.trim() : '';
  const voice = requestedVoice && requestedVoice.length <= 60 ? requestedVoice : ttsVoice();
  const limits = ttsLimits();
  if (!(await acquireSpeechSlot(limits.maxConcurrency, limits.queueWaitMs))) {
    return res.status(429).json({ error: 'speech_busy' });
  }

  // Chunk synthesis still takes a second or two per request; when the listener
  // walks away (stop button, new question, navigation) abort the upstream job so
  // a slot frees immediately instead of staying busy for the full timeout. The
  // RESPONSE 'close' event is the real disconnect signal: the request body is
  // already read by then.
  const clientGone = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) clientGone.abort();
  };
  res.on('close', onClose);
  try {
    const { audio, contentType } = await synthVieneuChunk(input, voice, clientGone.signal);
    if (clientGone.signal.aborted || res.writableEnded || res.destroyed) return;
    res.type(contentType).setHeader('Cache-Control', 'no-store').send(audio);
  } catch (error) {
    if (clientGone.signal.aborted || res.writableEnded || res.destroyed) return;
    if (error instanceof SpeechBusyError) return res.status(429).json({ error: 'speech_busy' });
    if (error instanceof SpeechUnavailableError) {
      console.error('Speech synthesis unavailable', error.message);
      return res.status(error.httpStatus).json({ error: error.code });
    }
    if (error instanceof Error && error.name === 'TimeoutError') {
      return res.status(504).json({ error: 'speech_generation_timeout' });
    }
    throw error;
  } finally {
    res.off('close', onClose);
    releaseSpeechSlot();
  }
});

router.use((error: unknown, _req: Request, res: ExpressResponse, next: NextFunction) => {
  if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'audio_too_long' });
  }
  return next(error);
});

export const voiceRouter = router;
