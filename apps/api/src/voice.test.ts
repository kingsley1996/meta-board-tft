import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  clearSttCooldowns,
  clearTtsFaults,
  deepgramTtsModel,
  sttProviderCandidates,
  sttProviderStatus,
  synthDeepgramChunk,
  synthSpeechChunk,
  synthVieneuChunk,
  transcribeWithFailover,
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
    'STT_BUSY_COOLDOWN_MS',
    'STT_CHAIN_BUDGET_MS',
    'STT_DEEPGRAM_MODEL',
    'STT_GROQ_MODEL',
    'STT_OPENROUTER_MODEL',
    'DEEPGRAM_API_KEY',
    'OPENROUTER_API_KEY',
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
    'DEEPGRAM_TTS_MODEL',
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
  clearSttCooldowns();
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

describe('sttProviderCandidates', () => {
  it('has no plan at all when no cloud key is configured', () => {
    assert.deepEqual(sttProviderCandidates(envWith({})), []);
  });

  it('builds the chain in the measured failover order', () => {
    assert.deepEqual(
      sttProviderCandidates(
        envWith({ DEEPGRAM_API_KEY: 'k', GROQ_API_KEY: 'k', OPENAI_API_KEY: 'k', GOOGLE_API_KEY: 'k' })
      ),
      ['deepgram', 'groq', 'openai', 'gemini']
    );
  });

  it('keeps OpenRouter out of the chain until it is asked for by name', () => {
    assert.deepEqual(sttProviderCandidates(envWith({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: 'k' })), ['groq']);
    assert.deepEqual(sttProviderCandidates(envWith({ STT_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'k' })), [
      'openrouter',
    ]);
  });

  it('treats a pin with no key as unconfigured instead of falling back', () => {
    assert.deepEqual(sttProviderCandidates(envWith({ STT_PROVIDER: 'groq', GOOGLE_API_KEY: 'k' })), []);
    assert.deepEqual(sttProviderCandidates(envWith({ STT_PROVIDER: 'gemini', GOOGLE_API_KEY: 'k' })), ['gemini']);
    assert.deepEqual(sttProviderCandidates(envWith({ STT_PROVIDER: 'sherpa', GROQ_API_KEY: 'k' })), []);
    assert.deepEqual(sttProviderCandidates(envWith({ STT_PROVIDER: 'unknown', GROQ_API_KEY: 'k' })), []);
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

function fakeFetch(respond: (call: RecordedCall, index: number) => Response | Promise<Response>) {
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

describe('Deepgram TTS and the VieNeu fallback', () => {
  const okAudio = () => new Response(Buffer.alloc(5_000), { headers: { 'content-type': 'audio/wav' } });

  it('defaults to the male Vietnamese Flux voice and honours an override', () => {
    assert.equal(deepgramTtsModel(envWith({})), 'flux-minh-vi');
    assert.equal(deepgramTtsModel(envWith({ DEEPGRAM_TTS_MODEL: 'flux-hoa-vi' })), 'flux-hoa-vi');
  });

  it('posts the Flux batch shape and returns wav audio', async () => {
    const { calls, impl } = fakeFetch(okAudio);
    const env = envWith({ DEEPGRAM_API_KEY: 'dg_key' });
    const result = await synthDeepgramChunk('Xin chào', new AbortController().signal, env, impl);

    const url = new URL(calls[0]!.url);
    assert.equal(`${url.origin}${url.pathname}`, 'https://api.deepgram.com/v2/speak');
    assert.equal(url.searchParams.get('model'), 'flux-minh-vi');
    assert.equal(url.searchParams.get('encoding'), 'linear16');
    assert.equal(url.searchParams.get('container'), 'wav');
    assert.equal(url.searchParams.get('sample_rate'), '24000');
    assert.equal(headersOf(calls[0]!).Authorization, 'Token dg_key');
    assert.deepEqual(jsonBody(calls[0]!), { text: 'Xin chào' });
    assert.equal(result.audio.length, 5_000);
    assert.equal(result.contentType, 'audio/wav');
  });

  it('hands the chunk to VieNeu when Deepgram fails', async () => {
    const { calls, impl } = fakeFetch((call) =>
      call.url.includes('api.deepgram.com') ? new Response('', { status: 500 }) : okAudio()
    );
    const result = await synthSpeechChunk(
      'Xin chào',
      new AbortController().signal,
      envWith({ DEEPGRAM_API_KEY: 'dg_key' }),
      impl
    );

    assert.equal(result.provider, 'vieneu');
    assert.equal(calls.length, 2);
    assert.ok(calls[1]!.url.endsWith('/v1/audio/speech'));
  });

  it('surfaces the VieNeu error when both engines fail', async () => {
    const { impl } = fakeFetch((call) =>
      call.url.includes('api.deepgram.com') ? new Response('', { status: 500 }) : new Response('', { status: 503 })
    );
    await assert.rejects(
      () => synthSpeechChunk('Xin chào', new AbortController().signal, envWith({ DEEPGRAM_API_KEY: 'dg_key' }), impl),
      /HTTP 503/
    );
  });

  it('remembers a rejected Deepgram key instead of retrying it on every chunk', async () => {
    const { calls, impl } = fakeFetch((call) =>
      call.url.includes('api.deepgram.com')
        ? new Response(JSON.stringify({ err_msg: 'invalid credentials' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          })
        : okAudio()
    );
    const env = envWith({ DEEPGRAM_API_KEY: 'dg_key' });
    const first = await synthSpeechChunk('Xin chào', new AbortController().signal, env, impl);
    const second = await synthSpeechChunk('Tạm biệt', new AbortController().signal, env, impl);

    assert.equal(first.provider, 'vieneu');
    assert.equal(second.provider, 'vieneu');
    assert.equal(calls.filter((call) => call.url.includes('api.deepgram.com')).length, 1);
  });
});

const sttWav = encodeWavPcm16(new Float32Array(1600));

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('transcribeWithFailover', () => {
  it('sends Deepgram the raw WAV body and reads the nested transcript', async () => {
    const { calls, impl } = fakeFetch(() =>
      jsonResponse({ results: { channels: [{ alternatives: [{ transcript: 'hôm nay chơi comps gì' }] }] } })
    );
    const env = envWith({ DEEPGRAM_API_KEY: 'dg_key', STT_DEEPGRAM_MODEL: 'nova-3' });
    const outcome = await transcribeWithFailover(sttWav, env, impl);

    assert.equal(outcome.provider, 'deepgram');
    assert.equal(outcome.text, 'hôm nay chơi comps gì');
    const url = new URL(calls[0]!.url);
    assert.equal(`${url.origin}${url.pathname}`, 'https://api.deepgram.com/v1/listen');
    assert.equal(url.searchParams.get('model'), 'nova-3');
    assert.equal(url.searchParams.get('smart_format'), 'true');
    assert.equal(headersOf(calls[0]!).Authorization, 'Token dg_key');
    assert.ok(Buffer.compare(calls[0]!.init!.body as Buffer, sttWav) === 0, 'the audio must be the raw wav body');
  });

  it('sends OpenRouter base64 JSON instead of a multipart upload', async () => {
    const { calls, impl } = fakeFetch(() => jsonResponse({ text: 'lên tier nào đây' }));
    const env = envWith({ STT_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'or_key' });
    const outcome = await transcribeWithFailover(sttWav, env, impl);

    assert.equal(outcome.text, 'lên tier nào đây');
    assert.equal(calls[0]!.url, 'https://openrouter.ai/api/v1/audio/transcriptions');
    assert.equal(headersOf(calls[0]!).Authorization, 'Bearer or_key');
    const body = jsonBody(calls[0]!);
    assert.equal(body.model, 'openai/whisper-large-v3-turbo');
    assert.equal(body.response_format, 'json');
    const audio = body.input_audio as { data: string; format: string };
    assert.equal(audio.format, 'wav');
    assert.equal(Buffer.from(audio.data, 'base64').compare(sttWav), 0);
  });

  it('hands a rate limited turn to the next provider and cools the first', async () => {
    const { calls, impl } = fakeFetch((call) =>
      call.url.startsWith('https://api.deepgram.com')
        ? jsonResponse({ error: { message: 'exceeded quota' } }, 429, { 'retry-after': '20' })
        : jsonResponse({ text: 'chơi gì đó' })
    );
    const env = envWith({ DEEPGRAM_API_KEY: 'dg', GROQ_API_KEY: 'gq' });
    const outcome = await transcribeWithFailover(sttWav, env, impl);

    assert.equal(outcome.provider, 'groq', 'a 429 must not end the user turn');
    assert.equal(calls.length, 2);
    const [first, second] = sttProviderStatus(env);
    assert.equal(first?.provider, 'deepgram');
    assert.match(first?.coolingDown ?? '', /Deepgram rate limited/);
    assert.equal(second?.provider, 'groq');
    assert.equal(second?.coolingDown, null);

    await transcribeWithFailover(sttWav, env, impl);
    assert.equal(calls.filter((call) => call.url.startsWith('https://api.deepgram.com')).length, 1);
  });

  for (const status of [401, 402]) {
    it(`cools a vendor that answers ${status} instead of retrying bad credentials`, async () => {
      const { calls, impl } = fakeFetch((call) =>
        call.url.startsWith('https://api.deepgram.com')
          ? jsonResponse({ error: { message: status === 401 ? 'invalid credentials' : 'insufficient balance' } }, status)
          : jsonResponse({ text: 'ok' })
      );
      const env = envWith({ DEEPGRAM_API_KEY: 'dg', GROQ_API_KEY: 'gq' });
      const outcome = await transcribeWithFailover(sttWav, env, impl);

      assert.equal(outcome.provider, 'groq');
      assert.match(sttProviderStatus(env)[0]?.coolingDown ?? '', status === 401 ? /invalid credentials/ : /insufficient balance/);

      await transcribeWithFailover(sttWav, env, impl);
      assert.equal(calls.filter((call) => call.url.startsWith('https://api.deepgram.com')).length, 1);
    });
  }

  it('reports busy once every configured provider is cooling down', async () => {
    const { calls, impl } = fakeFetch(() => jsonResponse({ error: { message: 'too many requests' } }, 429));
    const env = envWith({ DEEPGRAM_API_KEY: 'dg', STT_BUSY_COOLDOWN_MS: '60000' });

    const error = await rejection(transcribeWithFailover(sttWav, env, impl));
    assert.match(error.message, /too many requests|rate limited/);
    await assert.rejects(
      () => transcribeWithFailover(sttWav, env, impl),
      /every transcription provider is cooling down/
    );
    assert.equal(calls.length, 1, 'the second turn must not spend a doomed request');
  });

  it('keeps a vendor Retry-After inside the configured cooldown ceiling', async () => {
    const { calls, impl } = fakeFetch((call) =>
      call.url.startsWith('https://api.deepgram.com')
        ? jsonResponse({}, 429, { 'retry-after': '30' })
        : jsonResponse({ text: 'ok' })
    );
    const env = envWith({ DEEPGRAM_API_KEY: 'dg', GROQ_API_KEY: 'gq', STT_BUSY_COOLDOWN_MS: '1000' });
    await transcribeWithFailover(sttWav, env, impl);
    assert.match(sttProviderStatus(env)[0]?.coolingDown ?? '', /rate limited/);

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await transcribeWithFailover(sttWav, env, impl);
    assert.equal(calls.filter((call) => call.url.startsWith('https://api.deepgram.com')).length, 2);
  });

  it('stops walking the chain once the shared budget is gone', async () => {
    const { calls, impl } = fakeFetch((call) =>
      call.url.startsWith('https://api.deepgram.com')
        ? new Promise<Response>((resolve) =>
            setTimeout(() => resolve(jsonResponse({ error: { message: 'hang' } }, 500)), 2_200)
          )
        : jsonResponse({ text: 'không tới lượt' })
    );
    const env = envWith({ DEEPGRAM_API_KEY: 'dg', GROQ_API_KEY: 'gq', STT_CHAIN_BUDGET_MS: '2000' });
    const error = await rejection(transcribeWithFailover(sttWav, env, impl));

    assert.match(error.message, /ran out of time/);
    assert.equal(calls.length, 1, 'an expired budget must not add another vendor latency');
  });

  it('gives every provider one try before failing the turn', async () => {
    const { calls, impl } = fakeFetch(() => jsonResponse({ error: { message: 'upstream exploded' } }, 500));
    const env = envWith({ DEEPGRAM_API_KEY: 'dg', GROQ_API_KEY: 'gq' });
    const error = await rejection(transcribeWithFailover(sttWav, env, impl));

    assert.equal(error.code, 'transcription_failed');
    assert.equal(calls.length, 2, 'both providers get one try before the turn fails');
  });
});
