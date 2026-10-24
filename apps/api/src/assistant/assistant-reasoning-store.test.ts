import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createReasoningLogWriter,
  parseReasoningListQuery,
  summarizeReasoningText,
  type InsertReasoningLog,
} from './assistant-reasoning-store.ts';

test('summarizes reasoning text without cutting short values', () => {
  assert.equal(summarizeReasoningText('  Ahri items  '), 'Ahri items');
  assert.equal(summarizeReasoningText('x'.repeat(200)), 'x'.repeat(200));
  assert.equal(summarizeReasoningText('x'.repeat(201)), `${'x'.repeat(200)}…`);
});

test('reasoning log writer assigns incrementing step indexes', async () => {
  const inserts: InsertReasoningLog[] = [];
  const write = createReasoningLogWriter('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', async (input) => {
    inserts.push(input);
  });
  write({ step: 'intent_detection' });
  write({ step: 'entity_resolution', intent: 'entity_lookup' });
  await Promise.resolve();
  assert.equal(inserts.length, 2);
  assert.equal(inserts[0].stepIndex, 1);
  assert.equal(inserts[1].stepIndex, 2);
  assert.equal(inserts[1].intent, 'entity_lookup');
});

test('reasoning log writer never throws into the request path', async () => {
  const write = createReasoningLogWriter('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', () => {
    throw new Error('db down');
  });
  assert.doesNotThrow(() => write({ step: 'intent_detection' }));

  const rejecting = createReasoningLogWriter('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', async () => {
    throw new Error('db down');
  });
  assert.doesNotThrow(() => rejecting({ step: 'intent_detection' }));
  await Promise.resolve();
});

test('parseReasoningListQuery accepts valid filters and rejects bad pagination', () => {
  const requestId = '550e8400-e29b-41d4-a716-446655440000';
  const conversationId = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';
  assert.deepEqual(parseReasoningListQuery({ requestId, conversationId, limit: '20', offset: '40' }), {
    ok: true,
    value: { requestId, conversationId, limit: 20, offset: 40 },
  });
  assert.deepEqual(parseReasoningListQuery({}), {
    ok: true,
    value: { conversationId: undefined, requestId: undefined, limit: 50, offset: 0 },
  });
  assert.equal(parseReasoningListQuery({ requestId: 'not-a-uuid' }).ok, false);
  assert.equal(parseReasoningListQuery({ limit: '0' }).ok, false);
  assert.equal(parseReasoningListQuery({ limit: '101' }).ok, false);
  assert.equal(parseReasoningListQuery({ offset: '-1' }).ok, false);
});
