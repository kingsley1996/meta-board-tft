import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeChunks, searchKnowledge } from './retrieval.ts';

test('knowledge corpus has unique, bounded chunks', () => {
  const chunks = knowledgeChunks();
  assert.ok(chunks.length > 100);
  assert.equal(new Set(chunks.map((chunk) => chunk.id)).size, chunks.length);
  for (const chunk of chunks) {
    assert.ok(chunk.text.trim());
    assert.ok(chunk.text.length <= 1260, `${chunk.id} is too long`);
    assert.match(chunk.checksum, /^[a-f0-9]{16}$/);
    assert.ok(chunk.lang === 'en' || chunk.lang === 'vi');
  }
});

test('retrieval finds set 18 mechanics before related topics', () => {
  const hits = searchKnowledge('How do Wisps work?', { lang: 'en', limit: 3 });
  assert.equal(hits[0]?.chunk.id, 'mechanics:18:en:wisps:0');
  assert.ok(hits.some((hit) => hit.chunk.id === 'mechanics:18:en:blossom:0'));
});

test('retrieval respects language and declines unrelated queries', () => {
  const hits = searchKnowledge('Lãi vàng được tính thế nào?', { lang: 'vi', limit: 5 });
  assert.ok(hits.length > 0);
  assert.ok(hits.every((hit) => hit.chunk.lang === 'vi'));
  assert.equal(searchKnowledge('What is the weather in Paris?', { lang: 'en' }).length, 0);
});
