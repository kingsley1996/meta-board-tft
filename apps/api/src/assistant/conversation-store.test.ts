import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AssistantResponse } from './contracts.ts';

// DB-backed test: skips when no Postgres is configured. Falls back to the
// workspace .env (not loaded by `npm test`) before deciding. Guards the
// history-ordering bug fixed in getConversationHistory (first N vs last N).
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../../.env'));
  } catch {
    // No .env — the test below skips.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);

test(
  'conversation history returns the newest N messages, oldest first',
  { skip: !hasDb },
  async () => {
    const { pool } = await import('../db.ts');
    const {
      appendMessage,
      deleteConversation,
      getConversationHistory,
      getOrCreateConversation,
    } = await import('./conversation-store.ts');

    try {
      // Idempotent schema (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
      const schema = await readFile(join(import.meta.dirname, '../schema.sql'), 'utf8');
      await pool.query(schema);

      const clientId = randomUUID();
      const conversation = await getOrCreateConversation(undefined, clientId, 'vi');
      for (let index = 1; index <= 8; index += 1) {
        await appendMessage(conversation.id, index % 2 ? 'user' : 'assistant', `message ${index}`);
      }

      const history = await getConversationHistory(conversation.id, clientId, 6);
      assert.equal(history.length, 6);
      assert.deepEqual(
        history.map((row) => row.content),
        ['message 3', 'message 4', 'message 5', 'message 6', 'message 7', 'message 8'],
      );

      // Ownership: another client must not read the conversation.
      assert.deepEqual(await getConversationHistory(conversation.id, randomUUID(), 6), []);

      // Structured response survives reload/other devices (jsonb round-trip).
      const structured = {
        requestId: 'test-request',
        conversationId: conversation.id,
        answer: 'structured answer',
        sections: [{ heading: 'Source', points: ['kb'] }],
        intent: 'comp_search',
        mode: 'deterministic',
        resolvedContext: { setId: 'set18', patchId: '18.5', lang: 'vi', entities: [] },
        recommendations: [],
        sources: [],
        limitations: [],
        followUpQuestions: [],
        status: 'answered',
      } as AssistantResponse;
      await appendMessage(conversation.id, 'assistant', 'structured answer', 'comp_search', 'deterministic', 'answered', structured);
      const [, reloaded] = await getConversationHistory(conversation.id, clientId, 2);
      assert.deepEqual(reloaded.response, structured);

      assert.equal(await deleteConversation(conversation.id, clientId), true);
      assert.equal(await deleteConversation(conversation.id, clientId), false);
    } finally {
      await pool.end();
    }
  }
);
