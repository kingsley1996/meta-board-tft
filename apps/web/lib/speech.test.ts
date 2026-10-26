import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chunkForSpeech,
  loadVoices,
  maxSpeechChunkCharacters,
  needsSpeechPriming,
  pickVoice,
  speechLanguageFor,
  spokenText,
  voicesForLanguage,
  type VoiceLike,
} from './speech.ts';

describe('spokenText', () => {
  it('strips markdown and decorations', () => {
    const text = spokenText('# Title\n\n**Bold** answer with [link](https://example.com) 🎉\n\n- item one');
    assert.equal(text, 'Title Bold answer with link item one');
  });

  it('cuts at a sentence boundary near the limit', () => {
    const answer = `${'a'.repeat(400)}. ${'b'.repeat(400)}.`;
    const text = spokenText(answer);
    assert.ok(text.length <= 500);
    assert.ok(text.endsWith('.'));
    assert.ok(!text.includes('b'));
  });

  it('honors a custom limit', () => {
    const answer = `${'a'.repeat(100)}. ${'b'.repeat(100)}.`;
    assert.equal(spokenText(answer, 120), `${'a'.repeat(100)}.`);
  });
});

describe('chunkForSpeech', () => {
  it('keeps short text in one chunk', () => {
    assert.deepEqual(chunkForSpeech('Xin chào.'), ['Xin chào.']);
  });

  it('returns no chunks for blank text', () => {
    assert.deepEqual(chunkForSpeech('   '), []);
  });

  it('splits long text at sentence boundaries without exceeding the limit', () => {
    const sentence = 'Đây là một câu khá dài về đội hình.';
    const text = Array.from({ length: 12 }, () => sentence).join(' ');
    const chunks = chunkForSpeech(text);
    assert.ok(chunks.length > 1);
    for (const chunk of chunks) assert.ok(chunk.length <= maxSpeechChunkCharacters);
    assert.equal(chunks.join(' '), text);
  });

  it('breaks a very long sentence at spaces', () => {
    const text = Array.from({ length: 120 }, () => 'từ').join(' ');
    const chunks = chunkForSpeech(text);
    assert.ok(chunks.length > 1);
    for (const chunk of chunks) assert.ok(chunk.length <= maxSpeechChunkCharacters);
    assert.equal(chunks.join(' '), text);
  });
});

describe('pickVoice', () => {
  const voices: VoiceLike[] = [
    { name: 'English', lang: 'en-US', default: true },
    { name: 'Vietnamese remote', lang: 'vi-VN', localService: false },
    { name: 'Vietnamese local', lang: 'vi-VN', localService: true },
  ];

  it('prefers an exact language match that runs locally', () => {
    assert.equal(pickVoice(voices, 'vi-VN')?.name, 'Vietnamese local');
  });

  it('matches on the language prefix', () => {
    assert.equal(pickVoice([{ name: 'Vietnamese', lang: 'vi' }], 'vi-VN')?.name, 'Vietnamese');
  });

  it('returns null when the language is unavailable', () => {
    assert.equal(pickVoice([{ name: 'English', lang: 'en-US' }], 'vi-VN'), null);
  });
});

describe('speechLanguageFor', () => {
  it('reads a Vietnamese answer on the English UI with a Vietnamese voice', () => {
    const answer = 'Bùa Xanh giúp nhận thêm 10% Sức Mạnh Công Kích và Sức Mạnh Phép Thuật.';
    assert.equal(speechLanguageFor(answer, 'en'), 'vi-VN');
  });

  it('keeps English answers on the English UI in English', () => {
    assert.equal(speechLanguageFor('Blue Buff grants 10% attack damage.', 'en'), 'en-US');
  });

  it('uses Vietnamese for the Vietnamese UI even without diacritics', () => {
    assert.equal(speechLanguageFor('Reroll 4 vang o vong 2-1.', 'vi'), 'vi-VN');
  });
});

describe('voicesForLanguage', () => {
  const voices: VoiceLike[] = [
    { name: 'Samantha', lang: 'en-US' },
    { name: 'Linh', lang: 'vi-VN', localService: true },
    { name: 'Google Tiếng Việt', lang: 'vi-VN', localService: false },
  ];

  it('lists every candidate for the target language', () => {
    assert.deepEqual(
      voicesForLanguage(voices, 'vi-VN').map((voice) => voice.name),
      ['Linh', 'Google Tiếng Việt']
    );
  });

  it('returns an empty list when the language is unavailable', () => {
    assert.deepEqual(voicesForLanguage([{ name: 'Samantha', lang: 'en-US' }], 'vi-VN'), []);
  });
});

describe('loadVoices', () => {
  it('keeps asking until Chrome fills the voice list', async () => {
    let calls = 0;
    const handlers = new Set<() => void>();
    const fake = {
      getVoices: () => {
        calls += 1;
        return calls > 3
          ? ([{ name: 'Linh', lang: 'vi-VN', voiceURI: 'Linh', default: false, localService: true }] as unknown as SpeechSynthesisVoice[])
          : [];
      },
      addEventListener: (_type: string, handler: () => void) => handlers.add(handler),
      removeEventListener: (_type: string, handler: () => void) => handlers.delete(handler),
    } as unknown as SpeechSynthesis;
    const voices = await loadVoices(fake, 3_000);
    assert.equal(voices.length, 1);
    assert.equal(handlers.size, 0);
  });

  it('resolves without waiting when voices are already listed', async () => {
    let listened = 0;
    const fake = {
      getVoices: () =>
        [{ name: 'Linh', lang: 'vi-VN' }] as unknown as SpeechSynthesisVoice[],
      addEventListener: () => {
        listened += 1;
      },
      removeEventListener: () => {},
    } as unknown as SpeechSynthesis;
    const voices = await loadVoices(fake, 50);
    assert.equal(voices.length, 1);
    assert.equal(listened, 0);
  });
});

describe('needsSpeechPriming', () => {
  it('primes iOS Safari', () => {
    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    assert.equal(needsSpeechPriming(iphone), true);
  });

  it('primes iPadOS, which reports a desktop user agent', () => {
    const ipad =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
    assert.equal(needsSpeechPriming(ipad, 5), true);
  });

  it('leaves desktop browsers unprimed', () => {
    const chrome =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
    assert.equal(needsSpeechPriming(chrome), false);
    // A Mac without a touch screen is not an iPad.
    assert.equal(needsSpeechPriming('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0), false);
  });
});
