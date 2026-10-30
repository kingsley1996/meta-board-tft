import express, { Router, type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { chunkForSpeech, spokenText } from '@metaboard/shared/speech-text';
import type { AuthedRequest } from './auth-routes.ts';
import { getAssistantAnswerForRequest } from './assistant/conversation-store.ts';
import { chargeForFailure, characterCharges, durationCharges, meterClose, meterOpen, createSpendMeter } from './membership/cost.ts';
import { approvedTariff } from './membership/tariff.ts';
import type { AttemptClose, Charge, SpendMeter } from './membership/cost.ts';
import { quotaDenial, sendDenial } from './membership/denial.ts';
import { membershipEnforced } from './membership/enforcement.ts';
import { resolveEntitlement } from './membership/lifecycle.ts';
import { extendTurn, markDispatched, releaseExpiredTurns, reserve, settle } from './membership/quota.ts';

const router = Router();
const sampleRate = 16_000;
const maxSamples = sampleRate * 60;

// A voice turn is a chat turn with a transcription in front of it (task #84). The
// chat unit is reserved before the clip leaves, and the client spends it by sending
// the transcript to /api/assistant/query with `voiceTurnId`.
const REQUEST_KEY = /^[A-Za-z0-9_-]{8,64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The hold must outlive the provider chain before the text comes back...
const VOICE_TURN_RESERVE_MS = 5 * 60_000;
// ...and only until the client sends the question after it does. A short window
// means a turn nobody used stops blocking the account quickly.
const VOICE_TURN_CLAIM_MS = 60_000;

type SttProvider = 'deepgram' | 'groq' | 'openrouter' | 'elevenlabs' | 'openai' | 'gemini';

// Reliability-first, measured on this account's keys with one shared Vietnamese
// corpus (apps/api/scripts/stt-bench.mjs): Deepgram nova-3 has the lowest WER
// (0.063 on a 14 s clip) and no quota wall, Groq is the fast $0 free tier that
// survived 18 un-spaced requests, and Gemini's AI Studio free tier both 429s at
// ~17 requests/minute and rewrites pronouns it "knows better" — so it is now a
// last cloud resort.
const cloudProviderOrder: readonly SttProvider[] = ['deepgram', 'groq', 'openrouter', 'elevenlabs', 'openai', 'gemini'];

// The spoken language of one request. The UI locale decides it and travels on the
// request, so a Vietnamese and an English user get different providers' language
// codes from the same chain instead of one deployment-wide setting.
export type SpeechLang = 'en' | 'vi';

export function speechLang(value: unknown): SpeechLang {
  return value === 'en' ? 'en' : 'vi';
}

// Every provider in the chain accepts plain ISO-639-1, and Deepgram answers 200
// for language=en on nova-3 (a bogus code is the only thing it rejects), so one
// code per language covers the whole chain. STT_LANGUAGE still pins the non-English
// side for requests that do not say what they want.
function sttLanguageFor(lang: SpeechLang, env: NodeJS.ProcessEnv = process.env): string {
  return lang === 'en' ? 'en' : (env.STT_LANGUAGE?.trim().toLowerCase() || 'vi');
}
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
  /** A 429 is an answer from the vendor, and a vendor that refuses to work has
   *  billed nothing. Every throw site of this class read a status from the wire. */
  readonly refused = true;
  constructor(message = 'provider is busy', retryAfterMs: number | null = null) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}
class SpeechUnavailableError extends Error {
  readonly httpStatus: number;
  readonly code: string;
  /** True only when the message came from a status the provider answered with.
   *  A missing key, an unreachable host or a body nobody read proves nothing was
   *  billed, so the cost ledger keeps those as unexplained rather than free. */
  readonly refused: boolean;
  constructor(message: string, httpStatus = 502, code = 'speech_generation_failed', refused = false) {
    super(message);
    this.httpStatus = httpStatus;
    this.code = code;
    this.refused = refused;
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

// One table for the whole chain instead of a `env.STT_*_MODEL?.trim() || '<default>'`
// at each call site. The cost ledger prices by (provider, model), so the id written to
// the ledger and the id sent on the wire must come from the same place.
const sttModelDefaults: Record<SttProvider, string> = {
  deepgram: 'nova-3',
  groq: 'whisper-large-v3-turbo',
  openrouter: 'openai/whisper-large-v3-turbo',
  elevenlabs: 'scribe_v2',
  openai: 'gpt-4o-transcribe',
  gemini: 'gemini-3.1-flash-lite',
};

const sttModelEnvNames: Record<SttProvider, string> = {
  deepgram: 'STT_DEEPGRAM_MODEL',
  groq: 'STT_GROQ_MODEL',
  openrouter: 'STT_OPENROUTER_MODEL',
  elevenlabs: 'STT_ELEVENLABS_MODEL',
  openai: 'STT_OPENAI_MODEL',
  gemini: 'STT_GEMINI_MODEL',
};

export function sttModelFor(provider: SttProvider, env: NodeJS.ProcessEnv = process.env): string {
  return env[sttModelEnvNames[provider]]?.trim() || sttModelDefaults[provider];
}

// The length of the clip every provider in the chain is offered, rounded up because
// vendors bill a partial second as a whole one. The 44-byte header is the only part
// that is not audio.
export function wavDurationSeconds(wav: Buffer): number {
  return Math.max(0, Math.ceil((wav.byteLength - 44) / 2 / sampleRate));
}

// A call the vendor may have billed owes its quantity: the clip length (STT) or the
// text length (TTS) is what the provider prices. A refusal carries no billing line -
// the absence of a line is what the cost report reads as "nothing was billed".
function priced(close: AttemptClose, charges: Charge[]): AttemptClose {
  return close.charged === false ? close : { ...close, charges };
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
  language: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const apiKey = envValue(env, 'ELEVENLABS_API_KEY');
  if (!apiKey) throw new SpeechUnavailableError('ELEVENLABS_API_KEY is not configured');
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'speech.wav');
  form.append('model_id', sttModelFor('elevenlabs', env));
  if (language) form.append('language_code', language);
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
      isCredentialStatus(response.status) ? 'stt_credentials_rejected' : 'transcription_failed',
      true
    );
  }
  const result = (await response.json()) as { text?: unknown };
  return typeof result.text === 'string' ? result.text : '';
}

async function transcribeWithOpenAiCompatible(
  provider: 'openai' | 'groq',
  wav: Buffer,
  language: string,
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
  const model = sttModelFor(provider, env);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'speech.wav');
  form.append('model', model);
  if (language) form.append('language', language);
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
      isCredentialStatus(response.status) ? 'stt_credentials_rejected' : 'transcription_failed',
      true
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
  language: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const apiKey = envValue(env, 'DEEPGRAM_API_KEY');
  if (!apiKey) throw new SpeechUnavailableError('DEEPGRAM_API_KEY is not configured');
  const query = new URLSearchParams({ model: sttModelFor('deepgram', env), smart_format: 'true' });
  if (language) query.set('language', language);
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
      isCredentialStatus(response.status) ? 'stt_credentials_rejected' : 'transcription_failed',
      true
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
  language: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const apiKey = envValue(env, 'OPENROUTER_API_KEY');
  if (!apiKey) throw new SpeechUnavailableError('OPENROUTER_API_KEY is not configured');
  const response = await fetchImpl('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: sttModelFor('openrouter', env),
      input_audio: { data: wav.toString('base64'), format: 'wav' },
      ...(language ? { language } : {}),
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
      isCredentialStatus(response.status) ? 'stt_credentials_rejected' : 'transcription_failed',
      true
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
  const model = sttModelFor('gemini', env);
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
      isCredentialStatus(response.status) ? 'stt_credentials_rejected' : 'transcription_failed',
      true
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
  language: string,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch
): Promise<string> {
  switch (provider) {
    case 'elevenlabs':
      return transcribeWithElevenLabs(wav, language, env, fetchImpl);
    case 'openai':
      return transcribeWithOpenAiCompatible('openai', wav, language, env, fetchImpl);
    case 'groq':
      return transcribeWithOpenAiCompatible('groq', wav, language, env, fetchImpl);
    case 'openrouter':
      return transcribeWithOpenRouter(wav, language, env, fetchImpl);
    case 'deepgram':
      return transcribeWithDeepgram(wav, language, env, fetchImpl);
    case 'gemini':
      // Gemini is prompted to transcribe "in its original language" and takes no
      // language option, so the request language cannot be pinned here.
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
  fetchImpl: typeof fetch = fetch,
  lang: SpeechLang = 'vi',
  meter?: SpendMeter
): Promise<{ text: string; provider: SttProvider }> {
  const candidates = sttProviderCandidates(env);
  const language = sttLanguageFor(lang, env);
  const deadline = Date.now() + sttChainBudgetMs(env);
  const audioSeconds = wavDurationSeconds(wav);
  let lastError: unknown = null;
  for (const provider of candidates) {
    if (providerCooldown(provider)) continue;
    if (lastError && Date.now() >= deadline) {
      throw new SpeechUnavailableError('the transcription provider chain ran out of time');
    }
    // The call row is written before the clip leaves. A step the ledger could not
    // record is a step nobody could later explain, so that step does not run.
    const handle = await meterOpen(meter, provider, sttModelFor(provider, env));
    if (meter && !handle) {
      throw new SpeechUnavailableError(`${provider} was not metered`, 503, 'cost_ledger_unavailable');
    }
    let settled: AttemptClose | null = null;
    try {
      const text = await transcribeCloud(provider, wav, language, env, fetchImpl);
      settled = priced({ outcome: text.trim() ? 'success' : 'empty' }, durationCharges(audioSeconds));
      return { text, provider };
    } catch (error) {
      if (!(error instanceof SpeechBusyError) && !(error instanceof SpeechUnavailableError)) {
        settled = chargeForFailure(error, false);
        throw error;
      }
      settled = priced(chargeForFailure(error, error.refused), durationCharges(audioSeconds));
      const credentialFailure = error instanceof SpeechUnavailableError && error.code === 'stt_credentials_rejected';
      const window = credentialFailure ? 60_000 : (error instanceof SpeechBusyError ? error.retryAfterMs : null) ?? sttCooldownMs(env);
      coolProvider(provider, `${provider}: ${error.message}`, window);
      lastError = error;
    } finally {
      await meterClose(
        meter,
        handle,
        settled ?? chargeForFailure(new Error(`${provider} attempt ended without a result`), false)
      );
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
    // A recording is account spend and account data (task #84), so the route reads
    // the session itself: calling it directly from a script cannot borrow a quota.
    // Enforcement is opt-in, so production keeps the open route until the pilot is
    // switched on (membership/enforcement.ts).
    const enforced = membershipEnforced();
    const user = (req as AuthedRequest).authUser ?? null;
    if (enforced && !user) return res.status(401).json({ error: 'Sign in to use voice input.', code: 'unauthenticated' });
    if (sttProviderCandidates().length === 0) {
      return res.status(503).json({ error: 'stt_not_configured', code: 'voice_unavailable' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.byteLength < 4 || req.body.byteLength % 4 !== 0) {
      return res.status(400).json({ error: 'invalid_audio', code: 'invalid_audio' });
    }
    if (Number(req.header('x-sample-rate')) !== sampleRate) {
      return res.status(400).json({ error: 'unsupported_sample_rate', code: 'invalid_audio' });
    }

    const samplesCount = req.body.byteLength / Float32Array.BYTES_PER_ELEMENT;
    if (samplesCount > maxSamples) return res.status(413).json({ error: 'audio_too_long', code: 'audio_too_long' });
    if (activeTranscriptions >= sttMaxConcurrency) {
      return res.status(429).json({ error: 'transcription_busy', code: 'transcription_busy' });
    }

    const samples = new Float32Array(samplesCount);
    let squaredAmplitude = 0;
    for (let index = 0; index < samplesCount; index += 1) {
      const value = req.body.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT);
      if (!Number.isFinite(value)) return res.status(400).json({ error: 'invalid_audio', code: 'invalid_audio' });
      samples[index] = value;
      squaredAmplitude += value * value;
    }
    // Silence is decided before any booking, so a pocket-dial spends nothing.
    if (Math.sqrt(squaredAmplitude / samplesCount) < 0.001) {
      return res.status(422).json({ error: 'no_speech', code: 'no_speech' });
    }

    // The voice turn's ledger pair (task #84): the clip's seconds and the chat unit
    // the question will spend are both held before any audio leaves, so an account
    // that cannot pay learns that before a vendor is called. Without enforcement
    // there is no ledger and the clip is transcribed as it always was.
    let ledger: { transcriptionId: string; turnId: string; seconds: number } | null = null;
    if (enforced && user) {
      const entitlement = await resolveEntitlement(user.id);
      if (!entitlement.ok) {
        return res.status(503).json({ error: 'Membership data is unavailable. Try again shortly.', code: 'membership_unavailable' });
      }
      await releaseExpiredTurns(user.id);

      // Seconds come from the validated sample count, never from the client's word.
      const seconds = Math.ceil(samplesCount / sampleRate);
      const headerKey = req.header('x-request-key');
      const requestKey = headerKey && REQUEST_KEY.test(headerKey) ? headerKey : randomUUID();
      // The clip identifies the payload, so a retried upload under the same key is a
      // replay rather than a different question.
      const fingerprint = createHash('sha256')
        .update(req.body)
        .update(`|${req.header('x-sample-rate') ?? ''}|${req.header('x-language') ?? ''}`)
        .digest('hex');

      const speech = await reserve({
        userId: user.id,
        purpose: 'stt_transcribe',
        idempotencyKey: `stt:${requestKey}`,
        payloadSha256: fingerprint,
        plan: entitlement.plan,
        units: { stt_seconds: seconds },
      });
      if (!speech.ok) {
        if (speech.reason === 'duplicate' || speech.reason === 'in_progress') {
          return res.status(409).json({
            error: speech.reason === 'duplicate' ? 'That recording was already transcribed.' : 'That recording is still being transcribed.',
            code: speech.reason === 'duplicate' ? 'already_answered' : 'request_in_progress',
            requestId: speech.requestId,
          });
        }
        if (speech.reason === 'conflict') {
          return res.status(409).json({ error: 'That request key was already used for a different recording.', code: 'request_conflict', requestId: speech.requestId });
        }
        return sendDenial(res, quotaDenial(speech.reason, speech.retryAfterMs), speech.requestId);
      }

      // The chat unit is held before the clip leaves, so an account that cannot pay
      // for the turn learns that before any speech minutes are spent.
      const turn = await reserve({
        userId: user.id,
        purpose: 'coach_turn',
        idempotencyKey: `turn:${requestKey}`,
        payloadSha256: fingerprint,
        plan: entitlement.plan,
        units: { chat: 1 },
        reservationTtlMs: VOICE_TURN_RESERVE_MS,
      });
      if (!turn.ok) {
        await settle(speech.requestId, 'released', { errorCode: turn.reason });
        return sendDenial(res, quotaDenial(turn.reason, turn.retryAfterMs), turn.requestId);
      }

      const dispatched = await markDispatched(speech.requestId);
      if (!dispatched.ok) {
        await settle(speech.requestId, 'released', { errorCode: 'dispatch_not_recorded' });
        await settle(turn.requestId, 'released', { errorCode: 'dispatch_not_recorded' });
        return res.status(503).json({ error: 'assistant is unavailable', code: 'assistant_unavailable' });
      }
      ledger = { transcriptionId: speech.requestId, turnId: turn.requestId, seconds };
    }

    activeTranscriptions += 1;
    try {
      const outcome = await transcribeWithFailover(
        encodeWavPcm16(samples),
        process.env,
        fetch,
        speechLang(req.header('x-language')),
        ledger ? createSpendMeter(ledger.transcriptionId, { tariff: approvedTariff }) : undefined,
      );
      const text = outcome.text.trim();
      if (!text || !/[\p{L}\p{N}]/u.test(text)) {
        // The vendor's attempts stay in the cost ledger; the user is not charged
        // seconds for a clip that produced no words.
        if (ledger) {
          await settle(ledger.transcriptionId, 'released', { errorCode: 'no_speech' });
          await settle(ledger.turnId, 'released', { errorCode: 'no_speech' });
        }
        return res.status(422).json({ error: 'no_speech', code: 'no_speech' });
      }
      if (ledger) {
        // The whole clip left the building and was billed, so its seconds stand even
        // if the question that follows fails.
        await settle(ledger.transcriptionId, 'completed', { consumed: { stt_seconds: ledger.seconds }, resultReference: outcome.provider });
        await extendTurn(ledger.turnId, VOICE_TURN_CLAIM_MS);
      }
      res.setHeader('x-stt-provider', outcome.provider);
      return res.json({ text, ...(ledger ? { turnId: ledger.turnId } : {}) });
    } catch (error) {
      const errorCode = error instanceof SpeechBusyError ? 'transcription_busy' : 'transcription_failed';
      if (ledger) {
        await settle(ledger.transcriptionId, 'released', { errorCode });
        await settle(ledger.turnId, 'released', { errorCode });
      }
      if (error instanceof SpeechBusyError) {
        return res.status(429).json({ error: 'transcription_busy', code: 'transcription_busy' });
      }
      if (error instanceof SpeechUnavailableError) {
        console.error('Voice transcription unavailable', error.message);
        return res.status(502).json({ error: 'transcription_failed', code: 'transcription_failed' });
      }
      throw error;
    } finally {
      activeTranscriptions -= 1;
    }
  }
);

// --- TTS: Deepgram Flux (primary), VieNeu (fallback), one chunk per request ---
//
// The language picks the engine and the endpoint, which Deepgram does not mix:
// Vietnamese uses Flux TTS on the /v2/speak batch REST endpoint (`flux-minh-vi`)
// because Aura/Aura-2 have no Vietnamese voice, and English uses Aura-2 on
// /v1/speak (`aura-2-*`) because /v2/speak rejects anything but Flux. Flux
// Vietnamese is Early Access without text normalization: numbers and dates are
// read as written.
//
// VieNeu is a Vietnamese engine, so an English chunk has no second engine; when
// Deepgram cannot answer, the route says so instead of handing the text to a
// voice that would read English words as Vietnamese.
//
// The client splits an answer into short chunks and plays one while the next is
// still synthesizing. VieNeu uses the OpenAI-compatible POST /v1/audio/speech
// served by the local `apps.openai_speech` server or the hosted
// https://api.vieneu.io cloud.

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

// Deepgram's Vietnamese voices; override to `flux-hoa-vi` for the female voice.
export function deepgramTtsModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.DEEPGRAM_TTS_MODEL?.trim() || 'flux-minh-vi';
}

// Any Aura-2 English voice (verified against this account's key: /v1/speak answers
// a valid 24 kHz wav). Override to change the presenter without a redeploy.
export function deepgramEnglishTtsModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.DEEPGRAM_TTS_MODEL_EN?.trim() || 'aura-2-thalia-en';
}

function deepgramTtsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.DEEPGRAM_API_KEY?.trim());
}

function ttsBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  // No default: the local VieNeu engine was removed from the runtime. VieNeu is
  // only used when a cloud URL is configured explicitly.
  return (env.VIENEU_TTS_URL?.trim() || '').replace(/\/+$/, '');
}

export function vieneuConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(ttsBaseUrl(env));
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
// on the engine, so the fault is remembered per engine ('deepgram', or the
// VieNeu origin) and `/tts/status` reports that engine as unavailable until the
// cooldown expires.
const engineFaults = new Map<string, { until: number; reason: string; code: string }>();

function rememberFault(key: string, reason: string, cooldownMs: number, code: string): void {
  engineFaults.set(key, { until: Date.now() + cooldownMs, reason, code });
}

function activeFault(key: string): { reason: string; code: string } | null {
  const fault = engineFaults.get(key);
  if (!fault) return null;
  if (fault.until <= Date.now()) {
    engineFaults.delete(key);
    return null;
  }
  return { reason: fault.reason, code: fault.code };
}

export function ttsFault(env: NodeJS.ProcessEnv = process.env): { reason: string; code: string } | null {
  const base = ttsBaseUrl(env);
  return base ? activeFault(new URL(base).origin) : null;
}

function deepgramTtsFault(): { reason: string; code: string } | null {
  return activeFault('deepgram');
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
  if (!vieneuConfigured(env) || ttsFault(env)) return false;
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
  if (!vieneuConfigured(env)) {
    throw new SpeechUnavailableError('VieNeu is not configured', 503, 'tts_unavailable', true);
  }
  const limits = ttsLimits(env);
  const format = ttsFormat(env);
  const origin = new URL(ttsBaseUrl(env)).origin;
  const knownFault = ttsFault(env);
  if (knownFault) {
    // A rejected key or a saturated queue stays cheap: the browser gets the
    // answer from the engine it already knows is gone, without another doomed
    // upstream request per chunk.
    throw new SpeechUnavailableError(knownFault.reason, 503, knownFault.code, true);
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
      throw new SpeechUnavailableError(detail, 503, 'tts_credentials_rejected', true);
    }
    if (!upstream.ok) {
      const detail = await upstreamErrorText(upstream);
      if (upstream.status === 404) {
        throw new SpeechUnavailableError('VieNeu is not running', 503, 'tts_unavailable', true);
      }
      // 400 on this route means the engine refused this particular text (its
      // docs reject long consonant-only runs and non-Latin scripts); it is not a
      // reason to stop using the engine for the next answer.
      if (upstream.status === 400) {
        throw new SpeechUnavailableError(detail, 400, 'speech_text_rejected', true);
      }
      throw new SpeechUnavailableError(detail, 502, 'speech_generation_failed', true);
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

// Deepgram batch REST. 24 kHz mono WAV keeps the same <audio> path as VieNeu, so
// a fallback chunk is indistinguishable to the client.
export async function synthDeepgramChunk(
  input: string,
  signal: AbortSignal,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  lang: SpeechLang = 'vi'
): Promise<{ audio: Buffer; contentType: string }> {
  const apiKey = env.DEEPGRAM_API_KEY?.trim();
  if (!apiKey) throw new SpeechUnavailableError('DEEPGRAM_API_KEY is not configured', 503, 'tts_unavailable', true);
  const knownFault = deepgramTtsFault();
  if (knownFault) throw new SpeechUnavailableError(knownFault.reason, 503, knownFault.code, true);
  const limits = ttsLimits(env);
  // /v2/speak is Flux-only and /v1/speak rejects Flux, so the language chooses
  // the path as well as the model.
  const url = new URL(`https://api.deepgram.com/${lang === 'en' ? 'v1' : 'v2'}/speak`);
  url.searchParams.set('model', ttsModelFor('deepgram', lang, env));
  url.searchParams.set('encoding', 'linear16');
  url.searchParams.set('container', 'wav');
  url.searchParams.set('sample_rate', '24000');

  let upstream: Response;
  try {
    upstream = await fetchImpl(url.toString(), {
      method: 'POST',
      headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(limits.timeoutMs)]),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof Error && error.name === 'TimeoutError') throw error;
    throw new SpeechUnavailableError('Deepgram is unreachable', 503, 'tts_unavailable');
  }
  if (upstream.status === 429) {
    void upstream.body?.cancel();
    const wait = retryAfterMs(upstream, 600_000) ?? 30_000;
    rememberFault('deepgram', 'engine rate limited', wait, 'speech_busy');
    throw new SpeechBusyError('Deepgram rate limited', wait);
  }
  if (upstream.status === 401 || upstream.status === 403) {
    const detail = await upstreamErrorText(upstream);
    rememberFault('deepgram', detail, 60_000, 'tts_credentials_rejected');
    console.error('Deepgram rejected TTS credentials', detail);
    throw new SpeechUnavailableError(detail, 503, 'tts_credentials_rejected', true);
  }
  if (!upstream.ok) {
    const detail = await upstreamErrorText(upstream);
    // A rejected chunk is not an engine outage, same rule as VieNeu.
    if (upstream.status === 400) throw new SpeechUnavailableError(detail, 400, 'speech_text_rejected', true);
    throw new SpeechUnavailableError(detail, 502, 'speech_generation_failed', true);
  }
  const audio = Buffer.from(await upstream.arrayBuffer());
  if (audio.length < 4_000 || audio.length > 30 * 1024 * 1024) {
    throw new SpeechUnavailableError('Deepgram returned invalid audio');
  }
  return {
    audio,
    contentType: upstream.headers.get('content-type')?.split(';')[0]?.trim() || 'audio/wav',
  };
}

export type TtsProvider = 'deepgram' | 'vieneu';

// Which engine answers first; the other one stays as the per-chunk fallback.
// `TTS_PROVIDER=vieneu` is the quick switch when the Flux batch endpoint is
// slower than the local/cloud VieNeu engine. English has one engine only, because
// VieNeu speaks Vietnamese.
export function ttsPrimaryProvider(env: NodeJS.ProcessEnv = process.env): TtsProvider {
  return env.TTS_PROVIDER?.trim().toLowerCase() === 'vieneu' ? 'vieneu' : 'deepgram';
}

export function ttsProviderOrder(lang: SpeechLang = 'vi', env: NodeJS.ProcessEnv = process.env): TtsProvider[] {
  if (lang === 'en') return ['deepgram'];
  const primary = ttsPrimaryProvider(env);
  return [primary, primary === 'deepgram' ? 'vieneu' : 'deepgram'];
}

// The voice id the engine is asked for, from the same table the ledger writes, so a
// price keyed on (provider, model) can be matched to the call that was billed.
export function ttsModelFor(provider: TtsProvider, lang: SpeechLang = 'vi', env: NodeJS.ProcessEnv = process.env): string {
  if (provider === 'deepgram') return lang === 'en' ? deepgramEnglishTtsModel(env) : deepgramTtsModel(env);
  return ttsModel(env);
}

// Deepgram first by default; any failure that is not the caller aborting or a
// timeout hands the same chunk to the other engine. When both fail the last
// error surfaces to the client, which reports it instead of switching to the
// browser speech engine.
export async function synthSpeechChunk(
  input: string,
  signal: AbortSignal,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  lang: SpeechLang = 'vi',
  meter?: SpendMeter
): Promise<{ audio: Buffer; contentType: string; provider: TtsProvider }> {
  const characters = characterCharges(input.length);
  let lastError: unknown = null;
  for (const provider of ttsProviderOrder(lang, env)) {
    // No key/URL means the engine cannot start at all; skip without a request.
    if (provider === 'deepgram' && !deepgramTtsConfigured(env)) continue;
    if (provider === 'vieneu' && !vieneuConfigured(env)) continue;
    const handle = await meterOpen(meter, provider, ttsModelFor(provider, lang, env));
    if (meter && !handle) {
      throw new SpeechUnavailableError(`${provider} was not metered`, 503, 'cost_ledger_unavailable', true);
    }
    let settled: AttemptClose | null = null;
    try {
      const audio =
        provider === 'deepgram'
          ? await synthDeepgramChunk(input, signal, env, fetchImpl, lang)
          : await synthVieneuChunk(input, ttsVoice(env), signal, env, fetchImpl);
      settled = priced({ outcome: 'success' }, characters);
      return { ...audio, provider };
    } catch (error) {
      if (signal.aborted) {
        // The listener walked away. The chunk may or may not have been generated,
        // and only one of those readings is free, so it is recorded as unexplained.
        settled = priced({ outcome: 'cancelled', charged: true, error: 'cancelled by the listener' }, characters);
        throw error;
      }
      // The timeout already spent the whole chunk budget; trying the other
      // engine would double the wait, so the route answers 504 instead.
      if (error instanceof Error && error.name === 'TimeoutError') {
        settled = chargeForFailure(error, false);
        throw error;
      }
      if (!(error instanceof SpeechUnavailableError) && !(error instanceof SpeechBusyError)) {
        settled = chargeForFailure(error, false);
        throw error;
      }
      settled = priced(chargeForFailure(error, error.refused), characters);
      lastError = error;
      console.error(`${provider} speech failed, trying the other engine`, error.message);
    } finally {
      await meterClose(meter, handle, settled ?? chargeForFailure(new Error(`${provider} chunk ended without a result`), false));
    }
  }
  throw lastError ?? new SpeechUnavailableError('No TTS engine is configured', 503, 'tts_unavailable');
}

async function ttsProviderAvailable(provider: TtsProvider, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  return provider === 'deepgram' ? deepgramTtsConfigured(env) && !deepgramTtsFault() : vieneuAvailable(env);
}

function engineFault(provider: TtsProvider): { reason: string; code: string } | null {
  return provider === 'deepgram' ? deepgramTtsFault() : ttsFault();
}

router.get('/tts/status', async (req, res) => {
  const order = ttsProviderOrder(speechLang(req.query.lang));
  let provider: TtsProvider | null = null;
  for (const candidate of order) {
    if (await ttsProviderAvailable(candidate)) {
      provider = candidate;
      break;
    }
  }
  const fault = order.map(engineFault).find((entry) => entry !== null);
  res.json({
    available: provider !== null,
    provider: provider ?? order[0],
    primary: order[0],
    maxChars: ttsChunkCharacters(),
    // The upstream message can name hosts and key ids; dev-only so the browser
    // console is enough to diagnose "why is the voice grey".
    ...(provider || process.env.NODE_ENV === 'production' ? {} : { reason: fault?.reason ?? 'no TTS engine answered' }),
  });
});

// The server owns what may be read aloud (task #85): the text is the stored answer
// of the account's own ledger request, normalised and chunked by the shared
// definition, so the browser sends ids and an index and never prose. `version`
// embeds the normalised text, so a client holding a stale chunk list is told to
// re-plan instead of playing audio for a sentence that changed.
type SpeechPlan = { version: string; chunks: string[] };

async function speechPlanFor(userId: string, requestId: string): Promise<SpeechPlan | null> {
  if (!UUID_PATTERN.test(requestId)) return null;
  const source = await getAssistantAnswerForRequest(requestId, userId);
  if (!source) return null;
  const spoken = spokenText(source.answer);
  return {
    version: createHash('sha256').update(spoken).digest('hex'),
    chunks: chunkForSpeech(spoken, ttsChunkCharacters()),
  };
}

router.get('/tts/plan', async (req, res) => {
  if (!membershipEnforced()) {
    return res.status(404).json({ error: 'speech plan is unavailable', code: 'tts_plan_unavailable' });
  }
  const user = (req as AuthedRequest).authUser ?? null;
  if (!user) return res.status(401).json({ error: 'Sign in to read answers aloud.', code: 'unauthenticated' });
  const entitlement = await resolveEntitlement(user.id);
  if (!entitlement.ok) {
    return res.status(503).json({ error: 'Membership data is unavailable. Try again shortly.', code: 'membership_unavailable' });
  }
  // TTS is a paid feature; say so before the client asks for a chunk it can never buy.
  if (entitlement.plan.ttsCharactersPerPeriod <= 0) {
    return res.status(403).json({ error: 'Reading answers aloud is not part of your plan.', code: 'feature_locked' });
  }
  const requestId = typeof req.query.requestId === 'string' ? req.query.requestId : '';
  const plan = await speechPlanFor(user.id, requestId);
  if (!plan) return res.status(404).json({ error: 'That answer is not available for playback.', code: 'not_found' });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ version: plan.version, chunks: plan.chunks.length });
});

router.post('/tts/speech', async (req, res) => {
  const lang = speechLang(req.body?.lang);
  const maxChars = ttsChunkCharacters();
  let input: string;
  // One ledger row per chunk. `characters` is the server's count of the chunk it
  // synthesizes, not anything the client says, and it is also the quota unit.
  let ledger: { requestId: string; characters: number } | null = null;

  if (membershipEnforced()) {
    const user = (req as AuthedRequest).authUser ?? null;
    if (!user) return res.status(401).json({ error: 'Sign in to read answers aloud.', code: 'unauthenticated' });
    const requestId = typeof req.body?.requestId === 'string' ? req.body.requestId : '';
    const version = typeof req.body?.version === 'string' ? req.body.version : '';
    const chunk = Number(req.body?.chunk);
    if (!UUID_PATTERN.test(requestId) || !/^[0-9a-f]{64}$/.test(version) || !Number.isSafeInteger(chunk) || chunk < 0) {
      return res.status(400).json({ error: 'invalid_speech_request', code: 'invalid_request' });
    }

    const entitlement = await resolveEntitlement(user.id);
    if (!entitlement.ok) {
      return res.status(503).json({ error: 'Membership data is unavailable. Try again shortly.', code: 'membership_unavailable' });
    }
    const plan = await speechPlanFor(user.id, requestId);
    if (!plan) return res.status(404).json({ error: 'That answer is not available for playback.', code: 'not_found' });
    if (plan.version !== version) {
      return res.status(409).json({ error: 'That answer changed. Ask for the speech plan again.', code: 'speech_version_mismatch' });
    }
    const text = plan.chunks[chunk];
    if (!text) return res.status(400).json({ error: 'invalid_speech_chunk', code: 'invalid_request', maxChars });

    // One key per playback attempt, suffixed with the chunk index: a transport retry
    // of the same chunk is a replay, a replay the listener asks for again is a new
    // synthesis (and may be charged again, as the public policy says).
    const headerKey = req.header('x-request-key');
    const requestKey = headerKey && REQUEST_KEY.test(headerKey) ? headerKey : randomUUID();
    const payload = createHash('sha256').update(`${requestId}|${version}|${chunk}|${lang}`).digest('hex');
    const reserved = await reserve({
      userId: user.id,
      purpose: 'tts_synthesize',
      idempotencyKey: `tts:${requestKey}:${chunk}`,
      payloadSha256: payload,
      plan: entitlement.plan,
      units: { tts_characters: text.length },
    });
    if (!reserved.ok) {
      if (reserved.reason === 'duplicate' || reserved.reason === 'in_progress') {
        return res.status(409).json({
          error: reserved.reason === 'duplicate' ? 'That chunk was already read aloud.' : 'That chunk is still being synthesized.',
          code: reserved.reason === 'duplicate' ? 'already_answered' : 'request_in_progress',
          requestId: reserved.requestId,
        });
      }
      if (reserved.reason === 'conflict') {
        return res.status(409).json({ error: 'That request key was already used for a different chunk.', code: 'request_conflict', requestId: reserved.requestId });
      }
      return sendDenial(res, quotaDenial(reserved.reason, reserved.retryAfterMs), reserved.requestId);
    }

    const dispatched = await markDispatched(reserved.requestId);
    if (!dispatched.ok) {
      await settle(reserved.requestId, 'released', { errorCode: 'dispatch_not_recorded' });
      return res.status(503).json({ error: 'assistant is unavailable', code: 'assistant_unavailable' });
    }
    ledger = { requestId: reserved.requestId, characters: text.length };
    input = text;
  } else {
    // Pre-pilot path: production still synthesizes the prose the browser already
    // has, because no ledger exists there to authorize a message id.
    input = typeof req.body?.input === 'string' ? req.body.input.trim() : '';
  }

  if (!input || input.length > maxChars) {
    if (ledger) await settle(ledger.requestId, 'released', { errorCode: 'invalid_speech_text' });
    return res.status(400).json({ error: 'invalid_speech_text', maxChars });
  }
  const limits = ttsLimits();
  if (!(await acquireSpeechSlot(limits.maxConcurrency, limits.queueWaitMs))) {
    if (ledger) await settle(ledger.requestId, 'released', { errorCode: 'speech_busy' });
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
    const { audio, contentType, provider } = await synthSpeechChunk(
      input,
      clientGone.signal,
      process.env,
      fetch,
      lang,
      ledger ? createSpendMeter(ledger.requestId, { tariff: approvedTariff }) : undefined,
    );
    // The chunk exists, so its characters are spent whether or not the listener is
    // still there to hear it (public policy: a synthesized chunk may cost quota).
    if (ledger) await settle(ledger.requestId, 'completed', { consumed: { tts_characters: ledger.characters }, resultReference: provider });
    if (clientGone.signal.aborted || res.writableEnded || res.destroyed) return;
    res.type(contentType).setHeader('Cache-Control', 'no-store').setHeader('X-TTS-Provider', provider).send(audio);
  } catch (error) {
    const aborted = clientGone.signal.aborted;
    if (ledger) {
      // A user who stops after dispatch keeps the chunk (it may already have been
      // billed by the engine); a failure that produced no audio gives it back.
      await settle(ledger.requestId, aborted ? 'completed' : 'released', { errorCode: aborted ? 'client_closed_request' : 'speech_generation_failed' });
    }
    if (aborted || res.writableEnded || res.destroyed) return;
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
