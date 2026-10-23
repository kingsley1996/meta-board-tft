import express, { Router, type NextFunction, type Request, type Response } from 'express';
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

let recognizerPromise: Promise<OfflineRecognizer> | undefined;
let activeTranscriptions = 0;
let activeSpeechRequests = 0;

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

router.get('/status', async (_req, res) => {
  res.json({ available: await modelAvailable() });
});

router.get('/tts/status', async (_req, res) => {
  res.json({ available: await vieneuAvailable() });
});

router.post('/tts/speech', async (req, res) => {
  const input = typeof req.body?.input === 'string' ? req.body.input.trim() : '';
  if (!input || input.length > maxSpeechCharacters) {
    return res.status(400).json({ error: 'invalid_speech_text' });
  }
  if (activeSpeechRequests >= 1) return res.status(429).json({ error: 'speech_busy' });

  activeSpeechRequests += 1;
  try {
    const upstream = await fetch(`${vieneuBaseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { ...vieneuHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'vieneu-v3-turbo',
        voice: process.env.VIENEU_TTS_VOICE?.trim() || 'Hải Đăng',
        input,
        response_format: 'wav',
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!upstream.ok) {
      if (upstream.status === 404) {
        return res.status(503).json({ error: 'vieneu_unavailable' });
      }
      return res.status(upstream.status === 429 ? 429 : 502).json({ error: 'speech_generation_failed' });
    }
    const audio = Buffer.from(await upstream.arrayBuffer());
    if (!audio.length || audio.length > 30 * 1024 * 1024) {
      return res.status(502).json({ error: 'invalid_speech_audio' });
    }
    res.type('audio/wav').send(audio);
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return res.status(504).json({ error: 'speech_generation_timeout' });
    }
    if (error instanceof TypeError) {
      return res.status(503).json({ error: 'vieneu_unavailable' });
    }
    throw error;
  } finally {
    activeSpeechRequests -= 1;
  }
});

router.post(
  '/transcribe',
  express.raw({ type: 'application/octet-stream', limit: '4mb' }),
  async (req, res) => {
    if (!(await modelAvailable())) return res.status(503).json({ error: 'sherpa_not_configured' });
    if (!Buffer.isBuffer(req.body) || req.body.byteLength < 4 || req.body.byteLength % 4 !== 0) {
      return res.status(400).json({ error: 'invalid_audio' });
    }
    if (Number(req.header('x-sample-rate')) !== sampleRate) {
      return res.status(400).json({ error: 'unsupported_sample_rate' });
    }

    const samplesCount = req.body.byteLength / Float32Array.BYTES_PER_ELEMENT;
    if (samplesCount > maxSamples) return res.status(413).json({ error: 'audio_too_long' });
    if (activeTranscriptions >= 1) return res.status(429).json({ error: 'transcription_busy' });

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
      const recognizer = await getRecognizer();
      const stream = recognizer.createStream();
      stream.acceptWaveform({ sampleRate, samples });
      const result = await recognizer.decodeAsync(stream);
      const text = result.text.trim();
      if (!text || !/[\p{L}\p{N}]/u.test(text)) return res.status(422).json({ error: 'no_speech' });
      return res.json({ text });
    } finally {
      activeTranscriptions -= 1;
    }
  }
);

router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'audio_too_long' });
  }
  return next(error);
});

export const voiceRouter = router;
