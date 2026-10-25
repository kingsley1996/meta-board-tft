import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { encodeWavPcm16, resolveSttProvider, resolveTtsProvider, wavFromPcm16 } from './voice.ts';

const baseEnv = { ...process.env };

function envWith(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};
  for (const key of [
    'STT_PROVIDER',
    'STT_LANGUAGE',
    'TTS_PROVIDER',
    'ELEVENLABS_API_KEY',
    'OPENAI_API_KEY',
    'GROQ_API_KEY',
    'GOOGLE_API_KEY',
  ]) {
    env[key] = undefined;
  }
  return { ...env, ...overrides };
}

afterEach(() => {
  process.env = { ...baseEnv };
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

describe('resolveTtsProvider', () => {
  it('auto-picks gemini with a Google key and falls back to vieneu without one', () => {
    assert.equal(resolveTtsProvider(envWith({ GOOGLE_API_KEY: 'k' })), 'gemini');
    assert.equal(resolveTtsProvider(envWith({})), 'vieneu');
  });

  it('honors explicit providers regardless of keys', () => {
    assert.equal(resolveTtsProvider(envWith({ TTS_PROVIDER: 'vieneu', GOOGLE_API_KEY: 'k' })), 'vieneu');
    assert.equal(resolveTtsProvider(envWith({ TTS_PROVIDER: 'gemini' })), 'gemini');
    assert.equal(resolveTtsProvider(envWith({ TTS_PROVIDER: 'unknown' })), null);
    assert.equal(resolveTtsProvider(envWith({ TTS_PROVIDER: 'auto', GOOGLE_API_KEY: 'k' })), 'gemini');
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
