import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  clearTtsFaults,
  resolveSttProvider,
  synthVieneuChunk,
  ttsChunkCharacters,
  ttsFault,
  ttsFormat,
  ttsLimits,
  ttsModel,
  ttsProbeTimeoutMs,
  vieneuAvailable,
  encodeWavPcm16,
  wavFromPcm16,
} from './voice.ts';

const baseEnv = { ...process.env };

function envWith(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};
  for (const key of [
    'STT_PROVIDER',
    'STT_LANGUAGE',
    'ELEVENLABS_API_KEY',
    'OPENAI_API_KEY',
    'GROQ_API_KEY',
    'GOOGLE_API_KEY',
    'VIENEU_TTS_URL',
    'VIENEU_TTS_VOICE',
    'VIENEU_TTS_MODEL',
    'VIENEU_TTS_FORMAT',
    'VIENEU_TTS_API_KEY',
    'VIENEU_TTS_PROBE_TIMEOUT_MS',
    'TTS_CHUNK_CHARACTERS',
    'TTS_MAX_CONCURRENCY',
    'TTS_QUEUE_WAIT_MS',
    'TTS_TIMEOUT_MS',
  ]) {
    env[key] = undefined;
  }
  return { ...env, ...overrides };
}

afterEach(() => {
  process.env = { ...baseEnv };
  clearTtsFaults();
});

describe('encodeWavPcm16', () => {
  it('writes a mono 16 kHz 16-bit PCM header sized to the samples', () => {
    const wav = encodeWavPcm16(new Float32Array(160));
    assert.equal(wav.byteLength, 44 + 160 * 2);
    assert.equal(wav.subarray(0, 4).toString('latin1'), 'RIFF');
    assert.equal(wav.subarray(8, 12).toString('latin1'), 'WAVE');
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt32LE(24), 16_000);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(40), 320);
  });

  it('converts and clamps samples to 16-bit range', () => {
    const wav = encodeWavPcm16(new Float32Array([0, 1, -1, 1.5, -1.5]));
    assert.equal(wav.readInt16LE(44 + 0 * 2), 0);
    assert.equal(wav.readInt16LE(44 + 1 * 2), 32767);
    assert.equal(wav.readInt16LE(44 + 2 * 2), -32767);
    assert.equal(wav.readInt16LE(44 + 3 * 2), 32767);
    assert.equal(wav.readInt16LE(44 + 4 * 2), -32767);
  });
});

describe('resolveSttProvider', () => {
  it('falls back to sherpa when no cloud key is set', () => {
    assert.equal(resolveSttProvider(envWith({})), 'sherpa');
  });

  it('auto-picks the first configured cloud provider by accuracy order', () => {
    assert.equal(resolveSttProvider(envWith({ ELEVENLABS_API_KEY: 'k', GOOGLE_API_KEY: 'k' })), 'elevenlabs');
    assert.equal(resolveSttProvider(envWith({ OPENAI_API_KEY: 'k', GOOGLE_API_KEY: 'k' })), 'openai');
    assert.equal(resolveSttProvider(envWith({ GROQ_API_KEY: 'k', GOOGLE_API_KEY: 'k' })), 'groq');
    assert.equal(resolveSttProvider(envWith({ GOOGLE_API_KEY: 'k' })), 'gemini');
  });

  it('honors an explicit STT_PROVIDER only when its key is configured', () => {
    assert.equal(resolveSttProvider(envWith({ STT_PROVIDER: 'gemini', GOOGLE_API_KEY: 'k' })), 'gemini');
    assert.equal(resolveSttProvider(envWith({ STT_PROVIDER: 'gemini' })), null);
    assert.equal(resolveSttProvider(envWith({ STT_PROVIDER: 'groq', GOOGLE_API_KEY: 'k' })), null);
    assert.equal(resolveSttProvider(envWith({ STT_PROVIDER: 'sherpa', GOOGLE_API_KEY: 'k' })), 'sherpa');
    assert.equal(resolveSttProvider(envWith({ STT_PROVIDER: 'unknown', GOOGLE_API_KEY: 'k' })), null);
  });
});

describe('ttsChunkCharacters', () => {
  it('defaults to the chunk VieNeu synthesizes in about a second', () => {
    assert.equal(ttsChunkCharacters(envWith({})), 150);
  });

  it('keeps a configured chunk size inside a usable range', () => {
    assert.equal(ttsChunkCharacters(envWith({ TTS_CHUNK_CHARACTERS: '60' })), 60);
    assert.equal(ttsChunkCharacters(envWith({ TTS_CHUNK_CHARACTERS: '4' })), 40);
    assert.equal(ttsChunkCharacters(envWith({ TTS_CHUNK_CHARACTERS: '900' })), 400);
    assert.equal(ttsChunkCharacters(envWith({ TTS_CHUNK_CHARACTERS: 'nonsense' })), 150);
  });
});

describe('ttsLimits', () => {
  it('keeps two VieNeu requests in flight and queues the rest briefly', () => {
    const limits = ttsLimits(envWith({}));
    assert.equal(limits.maxConcurrency, 2);
    assert.equal(limits.queueWaitMs, 5_000);
    assert.equal(limits.timeoutMs, 45_000);
  });

  it('falls back to the engine default for an unusable slot count', () => {
    const limits = ttsLimits(envWith({ TTS_MAX_CONCURRENCY: '0', TTS_QUEUE_WAIT_MS: '-5' }));
    assert.equal(limits.maxConcurrency, 2);
    assert.equal(limits.queueWaitMs, 0);
  });
});

describe('wavFromPcm16', () => {
  it('wraps raw PCM bytes with a header carrying the given rate', () => {
    const pcm = Buffer.from([0x00, 0x01, 0xff, 0x02]);
    const wav = wavFromPcm16(pcm, 24_000);
    assert.equal(wav.byteLength, 48);
    assert.equal(wav.readUInt32LE(24), 24_000);
    assert.equal(wav.readUInt32LE(40), 4);
    assert.deepEqual(wav.subarray(44), pcm);
  });
});

type RecordedCall = { url: string; init?: RequestInit };
type SpeechError = Error & { code?: string; httpStatus?: number };

// The TTS error class carries the code and HTTP status the route will forward.
async function rejection(work: Promise<unknown>): Promise<SpeechError> {
  return work.then(
    () => {
      throw new Error('expected the request to be rejected');
    },
    (caught: unknown) => caught as SpeechError
  );
}

function fakeFetch(respond: (call: RecordedCall, index: number) => Response) {
  const calls: RecordedCall[] = [];
  const impl = (async (input: string | URL, init?: RequestInit) => {
    const call: RecordedCall = { url: typeof input === 'string' ? input : String(input), init };
    calls.push(call);
    return respond(call, calls.length - 1);
  }) as unknown as typeof fetch;
  return { calls, impl };
}

function jsonBody(call: RecordedCall): Record<string, unknown> {
  return JSON.parse(String(call.init?.body)) as Record<string, unknown>;
}

function headersOf(call: RecordedCall): Record<string, string> {
  return (call.init?.headers ?? {}) as Record<string, string>;
}

const cloudEnv = envWith({ VIENEU_TTS_URL: 'https://cloud.test/api', VIENEU_TTS_API_KEY: 'vn_sk_unit' });

describe('tts engine configuration', () => {
  it('defaults to the v4 engine, wav output and a WAN-sized probe', () => {
    const env = envWith({});
    assert.equal(ttsModel(env), 'vieneu-v4');
    assert.equal(ttsFormat(env), 'wav');
    assert.equal(ttsProbeTimeoutMs(env), 4_000);
  });

  it('honours explicit engine settings', () => {
    const env = envWith({ VIENEU_TTS_MODEL: 'tts-1', VIENEU_TTS_FORMAT: 'MP3', VIENEU_TTS_PROBE_TIMEOUT_MS: '9000' });
    assert.equal(ttsModel(env), 'tts-1');
    assert.equal(ttsFormat(env), 'mp3');
    assert.equal(ttsProbeTimeoutMs(env), 9_000);
  });

  it('ignores formats the cloud rejects and clamps the probe timeout', () => {
    assert.equal(ttsFormat(envWith({ VIENEU_TTS_FORMAT: 'flac' })), 'wav');
    assert.equal(ttsProbeTimeoutMs(envWith({ VIENEU_TTS_PROBE_TIMEOUT_MS: '10' })), 500);
    assert.equal(ttsProbeTimeoutMs(envWith({ VIENEU_TTS_PROBE_TIMEOUT_MS: '99999' })), 15_000);
  });
});

describe('synthVieneuChunk against the cloud contract', () => {
  it('posts the OpenAI-compatible speech shape and keeps the upstream content type', async () => {
    const { calls, impl } = fakeFetch(() => new Response(Buffer.alloc(5_000), { headers: { 'content-type': 'audio/mpeg' } }));
    const env = envWith({ ...cloudEnv, VIENEU_TTS_FORMAT: 'mp3' });
    const result = await synthVieneuChunk('Xin chào', 'Ngọc Lan', new AbortController().signal, env, impl);

    assert.equal(calls[0]?.url, 'https://cloud.test/api/v1/audio/speech');
    assert.equal(headersOf(calls[0]!).Authorization, 'Bearer vn_sk_unit');
    assert.equal(headersOf(calls[0]!)['Content-Type'], 'application/json');
    assert.deepEqual(jsonBody(calls[0]!), {
      model: 'vieneu-v4',
      voice: 'Ngọc Lan',
      input: 'Xin chào',
      response_format: 'mp3',
    });
    assert.equal(result.contentType, 'audio/mpeg');
    assert.equal(result.audio.length, 5_000);
  });

  it('falls back to the configured format when the upstream sends no content type', async () => {
    const { impl } = fakeFetch(() => new Response(Buffer.alloc(4_500)));
    const result = await synthVieneuChunk('a'.repeat(60), 'Hải Đăng', new AbortController().signal, cloudEnv, impl);
    assert.equal(result.contentType, 'audio/wav');
  });

  it('rejects a body too small to be speech', async () => {
    const { impl } = fakeFetch(() => new Response(Buffer.alloc(120), { headers: { 'content-type': 'audio/wav' } }));
    await assert.rejects(
      () => synthVieneuChunk('a'.repeat(60), 'Hải Đăng', new AbortController().signal, cloudEnv, impl),
      /invalid audio/
    );
  });

  for (const status of [401, 403]) {
    it(`never retries a ${status} credential/quota rejection and reports the engine unavailable`, async () => {
      const { calls, impl } = fakeFetch(
        () =>
          new Response(JSON.stringify({ error: { message: 'GRANT_TOKENS_EXHAUSTED', type: 'insufficient_quota', code: null } }), {
            status,
            headers: { 'content-type': 'application/json' },
          })
      );
      const error = await rejection(
        synthVieneuChunk('a'.repeat(60), 'Hải Đăng', new AbortController().signal, cloudEnv, impl)
      );
      assert.equal(error.code, 'tts_credentials_rejected');
      assert.equal(error.httpStatus, 503);
      assert.equal(calls.length, 1, 'a permanent rejection must not be retried');
      assert.match(ttsFault(cloudEnv)?.reason ?? '', /insufficient_quota|GRANT_TOKENS_EXHAUSTED/);
      assert.equal(await vieneuAvailable(cloudEnv, impl), false, 'the probe must respect the sticky fault');

      // The next chunk of the same answer must not reach the upstream again.
      await assert.rejects(
        () => synthVieneuChunk('a'.repeat(60), 'Hải Đăng', new AbortController().signal, cloudEnv, impl),
        (caught: unknown) => (caught as Error & { code: string }).code === 'tts_credentials_rejected'
      );
      assert.equal(calls.length, 1, 'the remembered fault short-circuits further chunk requests');
    });
  }

  it('waits for Retry-After before retrying a busy engine', async () => {
    const { calls, impl } = fakeFetch((call, index) =>
      index === 0 && call.url.endsWith('/audio/speech')
        ? new Response('', { status: 429, headers: { 'Retry-After': '1' } })
        : new Response(Buffer.alloc(5_000), { headers: { 'content-type': 'audio/wav' } })
    );
    const started = Date.now();
    const result = await synthVieneuChunk('a'.repeat(60), 'Hải Đăng', new AbortController().signal, cloudEnv, impl);
    assert.equal(calls.length, 2);
    assert.ok(Date.now() - started >= 900, 'the header delay must be respected');
    assert.equal(result.audio.length, 5_000);
  });

  it('keeps the engine usable when only the text was rejected', async () => {
    const { calls, impl } = fakeFetch((call) =>
      call.url.endsWith('/audio/speech')
        ? new Response(JSON.stringify({ statusCode: 400, message: 'text validation failed', code: 'INVALID_TEXT' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          })
        : new Response(JSON.stringify({ voices: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    );
    const error = await rejection(synthVieneuChunk('a'.repeat(60), 'Hải Đăng', new AbortController().signal, cloudEnv, impl));
    assert.equal(error.code, 'speech_text_rejected');
    assert.equal(calls.length, 1, 'a rejected chunk is not worth retrying');
    assert.equal(ttsFault(cloudEnv), null);
    assert.equal(await vieneuAvailable(cloudEnv, impl), true, 'a rejected text is not an engine outage');
  });

  it('reports the engine unavailable when the voices probe itself fails', async () => {
    const { impl } = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    const env = envWith({ VIENEU_TTS_URL: 'http://127.0.0.1:1' });
    assert.equal(await vieneuAvailable(env, impl), false);
  });
});
