import express, { Router, type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OfflineRecognizer } from 'sherpa-onnx-node';

const router = Router();
const sampleRate = 16_000;
const maxSamples = sampleRate * 60;
const maxSpeechCharacters = 2_000;
const modelDirectory =
  process.env.SHERPA_ASR_MODEL_DIR?.trim() ||
  fileURLToPath(new URL('../models/sherpa-vi/', import.meta.url));
const vieneuBaseUrl = (process.env.VIENEU_TTS_URL?.trim() || 'http://127.0.0.1:8001').replace(/\/+$/, '');

const modelFiles = {
  encoder: 'encoder-epoch-20-avg-10.int8.onnx',
  decoder: 'decoder-epoch-20-avg-10.int8.onnx',
  joiner: 'joiner-epoch-20-avg-10.int8.onnx',
  tokens: 'config.json',
};

type SttProvider = 'elevenlabs' | 'openai' | 'groq' | 'gemini' | 'sherpa';
type TtsProvider = 'gemini' | 'vieneu';

// Accuracy-first auto order; ElevenLabs Scribe and Gemini lead published
// Vietnamese WER benchmarks, whisper-large-v3-turbo on Groq is the cheap fast
// option, and Sherpa stays as the offline fallback when no key is configured.
const cloudProviderOrder: readonly SttProvider[] = ['elevenlabs', 'openai', 'groq', 'gemini'];
const sttLanguage = (process.env.STT_LANGUAGE?.trim() || 'vi').toLowerCase();
const sttMaxConcurrency = Math.max(1, Number(process.env.STT_MAX_CONCURRENCY) || 4);

// Gemini TTS synthesizes off-host and takes concurrent requests; VieNeu is a
// single-slot local engine kept as the fallback. Speech requests queue briefly
// for a slot instead of failing so short bursts do not surface errors.
const ttsMaxConcurrency = Math.max(1, Number(process.env.TTS_MAX_CONCURRENCY) || 4);
const ttsQueueWaitMs = Math.max(0, Number(process.env.TTS_QUEUE_WAIT_MS) || 5_000);

let recognizerPromise: Promise<OfflineRecognizer> | undefined;
let activeTranscriptions = 0;

class SpeechBusyError extends Error {}
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
    case 'elevenlabs':
      return Boolean(envValue(env, 'ELEVENLABS_API_KEY'));
    case 'openai':
      return Boolean(envValue(env, 'OPENAI_API_KEY'));
    case 'groq':
      return Boolean(envValue(env, 'GROQ_API_KEY'));
    case 'gemini':
      return Boolean(envValue(env, 'GOOGLE_API_KEY'));
    case 'sherpa':
      return false;
  }
}

export function resolveSttProvider(env: NodeJS.ProcessEnv = process.env): SttProvider | null {
  const explicit = env.STT_PROVIDER?.trim().toLowerCase();
  if (explicit) {
    if (explicit === 'sherpa') return 'sherpa';
    if ((cloudProviderOrder as readonly string[]).includes(explicit) && cloudConfigured(explicit as SttProvider, env)) {
      return explicit as SttProvider;
    }
    return null;
  }
  for (const provider of cloudProviderOrder) {
    if (cloudConfigured(provider, env)) return provider;
  }
  return 'sherpa';
}

export function resolveTtsProvider(env: NodeJS.ProcessEnv = process.env): TtsProvider | null {
  const explicit = env.TTS_PROVIDER?.trim().toLowerCase();
  if (explicit === 'gemini' || explicit === 'vieneu') return explicit;
  if (explicit && explicit !== 'auto') return null;
  return envValue(env, 'GOOGLE_API_KEY') ? 'gemini' : 'vieneu';
}

function ttsProviderIsAuto(): boolean {
  const explicit = process.env.TTS_PROVIDER?.trim().toLowerCase();
  return !explicit || explicit === 'auto';
}

function vieneuHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const apiKey = process.env.VIENEU_TTS_API_KEY?.trim();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

async function vieneuAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${vieneuBaseUrl}/v1/voices`, {
      headers: vieneuHeaders(),
      signal: AbortSignal.timeout(1_500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function modelAvailable(): Promise<boolean> {
  try {
    await Promise.all(Object.values(modelFiles).map((file) => access(path.join(modelDirectory, file))));
    return true;
  } catch {
    return false;
  }
}

async function getRecognizer(): Promise<OfflineRecognizer> {
  if (!recognizerPromise) {
    const config = {
      featConfig: { sampleRate, featureDim: 80 },
      modelConfig: {
        transducer: {
          encoder: path.join(modelDirectory, modelFiles.encoder),
          decoder: path.join(modelDirectory, modelFiles.decoder),
          joiner: path.join(modelDirectory, modelFiles.joiner),
        },
        tokens: path.join(modelDirectory, modelFiles.tokens),
        numThreads: 2,
        provider: 'cpu',
        debug: 0,
      },
    };
    recognizerPromise = import('sherpa-onnx-node')
      .then(({ default: sherpa }) => sherpa.OfflineRecognizer.createAsync(config))
      .catch((error: unknown) => {
        recognizerPromise = undefined;
        throw error;
      });
  }
  return recognizerPromise;
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

// Bursty speech requests wait up to ttsQueueWaitMs for a free slot; only
// requests that give up surface speech_busy to the client.
const speechSlots = { active: 0, waiters: [] as Array<() => void> };

async function acquireSpeechSlot(limit: number): Promise<boolean> {
  const deadline = Date.now() + ttsQueueWaitMs;
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

async function transcribeWithElevenLabs(wav: Buffer): Promise<string> {
  const apiKey = envValue(process.env, 'ELEVENLABS_API_KEY');
  if (!apiKey) throw new SpeechUnavailableError('ELEVENLABS_API_KEY is not configured');
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'speech.wav');
  form.append('model_id', process.env.STT_ELEVENLABS_MODEL?.trim() || 'scribe_v2');
  if (sttLanguage) form.append('language_code', sttLanguage);
  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 429) throw new SpeechBusyError();
  if (!response.ok) throw new SpeechUnavailableError(`ElevenLabs responded ${response.status}`);
  const result = (await response.json()) as { text?: unknown };
  return typeof result.text === 'string' ? result.text : '';
}

async function transcribeWithOpenAiCompatible(provider: 'openai' | 'groq', wav: Buffer): Promise<string> {
  const isGroq = provider === 'groq';
  const apiKey = envValue(process.env, isGroq ? 'GROQ_API_KEY' : 'OPENAI_API_KEY');
  if (!apiKey) {
    throw new SpeechUnavailableError(isGroq ? 'GROQ_API_KEY is not configured' : 'OPENAI_API_KEY is not configured');
  }
  const baseUrl = isGroq
    ? 'https://api.groq.com/openai/v1'
    : (envValue(process.env, 'STT_OPENAI_BASE_URL', 'OPENAI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = isGroq
    ? process.env.STT_GROQ_MODEL?.trim() || 'whisper-large-v3-turbo'
    : process.env.STT_OPENAI_MODEL?.trim() || 'gpt-4o-transcribe';
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'speech.wav');
  form.append('model', model);
  if (sttLanguage) form.append('language', sttLanguage);
  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 429) throw new SpeechBusyError();
  if (!response.ok) throw new SpeechUnavailableError(`${provider} transcription responded ${response.status}`);
  const result = (await response.json()) as { text?: unknown };
  return typeof result.text === 'string' ? result.text : '';
}

async function transcribeWithGemini(wav: Buffer): Promise<string> {
  const apiKey = envValue(process.env, 'GOOGLE_API_KEY');
  if (!apiKey) throw new SpeechUnavailableError('GOOGLE_API_KEY is not configured');
  const model = process.env.STT_GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite';
  const response = await fetch(
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
  if (response.status === 429) throw new SpeechBusyError();
  if (!response.ok) throw new SpeechUnavailableError(`Gemini transcription responded ${response.status}`);
  const result = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  };
  const parts = result.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => (typeof part.text === 'string' ? part.text : '')).join('').trim();
}

async function transcribeWithSherpa(samples: Float32Array): Promise<string> {
  const recognizer = await getRecognizer();
  const stream = recognizer.createStream();
  stream.acceptWaveform({ sampleRate, samples });
  const result = await recognizer.decodeAsync(stream);
  return result.text;
}

async function transcribe(provider: SttProvider, samples: Float32Array): Promise<string> {
  switch (provider) {
    case 'elevenlabs':
      return transcribeWithElevenLabs(encodeWavPcm16(samples));
    case 'openai':
      return transcribeWithOpenAiCompatible('openai', encodeWavPcm16(samples));
    case 'groq':
      return transcribeWithOpenAiCompatible('groq', encodeWavPcm16(samples));
    case 'gemini':
      return transcribeWithGemini(encodeWavPcm16(samples));
    case 'sherpa':
      return transcribeWithSherpa(samples);
  }
}

async function synthWithGemini(input: string, signal: AbortSignal): Promise<{ audio: Buffer; mime: string }> {
  const apiKey = envValue(process.env, 'GOOGLE_API_KEY');
  if (!apiKey) throw new SpeechUnavailableError('GOOGLE_API_KEY is not configured');
  const model = process.env.TTS_GEMINI_MODEL?.trim() || 'gemini-3.8-flash-lite-tts';
  const voice = process.env.TTS_GEMINI_VOICE?.trim() || 'Charon';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: input }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
      signal,
    }
  );
  if (response.status === 429) throw new SpeechBusyError();
  if (!response.ok) throw new SpeechUnavailableError(`Gemini TTS responded ${response.status}`);
  const result = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: unknown; mimeType?: unknown } }> } }>;
  };
  const inline = result.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inline || typeof inline.data !== 'string' || !inline.data) {
    throw new SpeechUnavailableError('Gemini TTS returned no audio');
  }
  const audio = Buffer.from(inline.data, 'base64');
  const mime = typeof inline.mimeType === 'string' && inline.mimeType ? inline.mimeType : 'audio/wav';
  // The API usually answers audio/wav directly; wrap raw L16 PCM payloads so
  // the browser <audio> element can always decode the response.
  if (/^audio\/L16/i.test(mime)) {
    const rate = Number(mime.match(/rate=(\d+)/i)?.[1]) || 24_000;
    return { audio: wavFromPcm16(audio, rate), mime: 'audio/wav' };
  }
  return { audio, mime };
}

async function synthWithVieneu(input: string, signal: AbortSignal): Promise<Buffer> {
  let upstream: Response;
  try {
    upstream = await fetch(`${vieneuBaseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { ...vieneuHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'vieneu-v3-turbo',
        voice: process.env.VIENEU_TTS_VOICE?.trim() || 'Hải Đăng',
        input,
        response_format: 'wav',
      }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') throw error;
    throw new SpeechUnavailableError('VieNeu is unreachable', 503, 'vieneu_unavailable');
  }
  if (upstream.status === 429) throw new SpeechBusyError();
  if (!upstream.ok) {
    if (upstream.status === 404) {
      throw new SpeechUnavailableError('VieNeu is not running', 503, 'vieneu_unavailable');
    }
    throw new SpeechUnavailableError(`VieNeu responded ${upstream.status}`);
  }
  const audio = Buffer.from(await upstream.arrayBuffer());
  if (!audio.length || audio.length > 30 * 1024 * 1024) {
    throw new SpeechUnavailableError('VieNeu returned invalid audio');
  }
  return audio;
}

router.get('/status', async (_req, res) => {
  const provider = resolveSttProvider();
  const available =
    provider === null
      ? false
      : provider === 'sherpa'
        ? await modelAvailable()
        : true;
  res.json({ available, provider });
});

router.get('/tts/status', async (_req, res) => {
  const provider = resolveTtsProvider();
  const available =
    provider === 'vieneu'
      ? await vieneuAvailable()
      : provider === 'gemini'
        ? Boolean(envValue(process.env, 'GOOGLE_API_KEY'))
        : false;
  res.json({ available, provider });
});

router.post('/tts/speech', async (req, res) => {
  const input = typeof req.body?.input === 'string' ? req.body.input.trim() : '';
  if (!input || input.length > maxSpeechCharacters) {
    return res.status(400).json({ error: 'invalid_speech_text' });
  }
  const provider = resolveTtsProvider();
  if (provider === null) return res.status(503).json({ error: 'tts_not_configured' });
  if (!(await acquireSpeechSlot(provider === 'vieneu' ? 1 : ttsMaxConcurrency))) {
    return res.status(429).json({ error: 'speech_busy' });
  }

  // Synthesis of a long answer takes tens of seconds; when the client walks
  // away (new question via mic, stop button, navigation) abort the upstream
  // job so the slot frees immediately instead of staying busy for the full
  // timeout. Listen on the RESPONSE 'close': req 'close' fires as soon as the
  // body is read, res 'close' fires early only on a real premature disconnect.
  const clientGone = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) clientGone.abort();
  };
  res.on('close', onClose);
  try {
    const vieneuSignal = AbortSignal.any([clientGone.signal, AbortSignal.timeout(120_000)]);
    let audio: Buffer;
    let mime = 'audio/wav';
    try {
      if (provider === 'gemini') {
        ({ audio, mime } = await synthWithGemini(input, AbortSignal.any([clientGone.signal, AbortSignal.timeout(30_000)])));
      } else {
        audio = await synthWithVieneu(input, vieneuSignal);
      }
    } catch (error) {
      // Cloud burst or outage: fall back to the local engine in auto mode so a
      // quota blip degrades voice instead of erroring it.
      const fallbackable =
        provider === 'gemini' && ttsProviderIsAuto() && !clientGone.signal.aborted &&
        (error instanceof SpeechBusyError || error instanceof SpeechUnavailableError);
      if (!fallbackable) throw error;
      audio = await synthWithVieneu(input, vieneuSignal);
    }
    if (clientGone.signal.aborted || res.writableEnded || res.destroyed) {
      return;
    }
    res.type(mime).send(audio);
  } catch (error) {
    if (clientGone.signal.aborted || res.writableEnded || res.destroyed) {
      return;
    }
    if (error instanceof SpeechBusyError) {
      return res.status(429).json({ error: 'speech_busy' });
    }
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

router.post(
  '/transcribe',
  express.raw({ type: 'application/octet-stream', limit: '4mb' }),
  async (req, res) => {
    const provider = resolveSttProvider();
    if (provider === null || (provider === 'sherpa' && !(await modelAvailable()))) {
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
    if (activeTranscriptions >= (provider === 'sherpa' ? 1 : sttMaxConcurrency)) {
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
      const text = (await transcribe(provider, samples)).trim();
      if (!text || !/[\p{L}\p{N}]/u.test(text)) return res.status(422).json({ error: 'no_speech' });
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

router.use((error: unknown, _req: Request, res: ExpressResponse, next: NextFunction) => {
  if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'audio_too_long' });
  }
  return next(error);
});

export const voiceRouter = router;
