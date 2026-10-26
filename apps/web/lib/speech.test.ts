import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chunkForSpeech, maxSpeechChunkCharacters, spokenText } from './speech.ts';

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
