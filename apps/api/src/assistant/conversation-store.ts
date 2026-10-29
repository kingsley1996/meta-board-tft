import { pool } from '../db.ts';
import type { AssistantResponse, Lang } from './contracts.ts';
import { assistantLog } from './logger.ts';

export type AssistantMessageRow = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  intent: string | null;
  mode: string | null;
  status: string | null;
  response: AssistantResponse | null;
  created_at: Date;
};

export type AssistantConversationRow = {
  id: string;
  client_id: string;
  lang: Lang;
  title: string | null;
  created_at: Date;
  updated_at: Date;
};

/**
 * Create a new conversation or return the one this account already owns.
 *
 * Ownership is the account, not the browser (task #83): a conversation that
 * already belongs to someone is never readable by whoever happens to hold the
 * same cookie. Pre-sign-in guest rows have no owner, and continuing one adopts
 * it for the account that was already using it — the old history is carried
 * over instead of being deleted or handed to a stranger.
 */
export async function getOrCreateConversation(
  conversationId: string | undefined,
  clientId: string,
  lang: Lang,
  userId?: string | null,
): Promise<AssistantConversationRow> {
  if (conversationId) {
    const existing = await pool.query<AssistantConversationRow>(
      `SELECT id, client_id, lang, title, created_at, updated_at FROM assistant_conversations
       WHERE id = $1
         AND (user_id = $2::uuid OR (user_id IS NULL AND client_id = $3))`,
      [conversationId, userId ?? null, clientId],
    );
    if (existing.rows.length) {
      if (userId) {
        await pool.query(
          'UPDATE assistant_conversations SET user_id = COALESCE(user_id, $2) WHERE id = $1',
          [conversationId, userId],
        );
      }
      return existing.rows[0];
    }
    // Conversation exists but not owned by this account — create a new one
    // instead of leaking it.
    assistantLog('conversation_ownership_mismatch', {
      conversationId,
      clientId,
    });
  }

  const { rows } = await pool.query<AssistantConversationRow>(
    `INSERT INTO assistant_conversations (client_id, lang, title, user_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, client_id, lang, title, created_at, updated_at`,
    [clientId, lang, null, userId ?? null],
  );
  return rows[0];
}

/**
 * Append a message to a conversation. Returns the inserted row.
 */
export async function appendMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  intent: string | null = null,
  mode: string | null = null,
  status: string | null = null,
  response: AssistantResponse | null = null,
): Promise<AssistantMessageRow> {
  const { rows } = await pool.query<AssistantMessageRow>(
    `INSERT INTO assistant_messages (conversation_id, role, content, intent, mode, status, response)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, conversation_id, role, content, intent, mode, status, response, created_at`,
    [conversationId, role, content, intent, mode, status, response],
  );

  // Update conversation updated_at and derive title from first user message if missing.
  if (role === 'user') {
    await pool.query(
      `UPDATE assistant_conversations
       SET updated_at = now(),
           title = COALESCE(NULLIF(title, ''), $2)
       WHERE id = $1`,
      [conversationId, content.slice(0, 80)],
    );
  } else {
    await pool.query(
      'UPDATE assistant_conversations SET updated_at = now() WHERE id = $1',
      [conversationId],
    );
  }

  return rows[0];
}

/**
 * Load the last N messages for a conversation, ordered oldest first.
 * Default limit = 6 to match the existing frontend history cap.
 */
export async function getConversationHistory(
  conversationId: string,
  clientId: string,
  limit = 6,
  userId?: string | null,
): Promise<AssistantMessageRow[]> {
  // Verify ownership first: the account it belongs to, or an unclaimed guest
  // conversation on this exact browser.
  const owner = await pool.query<{ client_id: string; user_id: string | null }>(
    'SELECT client_id, user_id FROM assistant_conversations WHERE id = $1',
    [conversationId],
  );
  const row = owner.rows[0];
  if (!row || (row.user_id ? row.user_id !== userId : row.client_id !== clientId)) {
    return [];
  }

  const { rows } = await pool.query<AssistantMessageRow>(
    `SELECT id, conversation_id, role, content, intent, mode, status, response, created_at
     FROM assistant_messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [conversationId, limit],
  );
  // Newest-first from SQL; callers expect oldest-first (chat order).
  return rows.reverse();
}

/**
 * List recent conversations for one account (most recently updated first).
 *
 * A signed-in caller claims the guest conversations sitting on this browser as a
 * side effect, so history made before sign-in follows the account instead of
 * vanishing from the list. Rows already owned by someone else are never claimed.
 */
export async function listConversations(
  clientId: string,
  limit = 20,
  userId?: string | null,
): Promise<AssistantConversationRow[]> {
  if (userId) {
    await pool.query('UPDATE assistant_conversations SET user_id = $2 WHERE user_id IS NULL AND client_id = $1', [clientId, userId]);
  }
  const { rows } = await pool.query<AssistantConversationRow>(
    `SELECT id, client_id, lang, title, created_at, updated_at
     FROM assistant_conversations
     WHERE user_id = $2::uuid OR ($2::uuid IS NULL AND user_id IS NULL AND client_id = $1)
     ORDER BY updated_at DESC
     LIMIT $3`,
    [clientId, userId ?? null, limit],
  );
  return rows;
}

/**
 * Delete a conversation and all its messages (cascade). An account can also clear
 * the unclaimed guest conversations on its own browser.
 */
export async function deleteConversation(
  conversationId: string,
  clientId: string,
  userId?: string | null,
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM assistant_conversations
     WHERE id = $1 AND (user_id = $3::uuid OR (user_id IS NULL AND client_id = $2))`,
    [conversationId, clientId, userId ?? null],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * The stored answer for a ledger request that already completed. A replayed turn
 * is answered from here instead of generating a second one.
 */
export async function getAssistantMessage(messageId: string): Promise<AssistantMessageRow | null> {
  const { rows } = await pool.query<AssistantMessageRow>(
    `SELECT id, conversation_id, role, content, intent, mode, status, response, created_at
     FROM assistant_messages WHERE id = $1 AND role = 'assistant'`,
    [messageId],
  );
  return rows[0] ?? null;
}

/**
 * The answer behind a completed ledger request, only when its conversation belongs
 * to the asking account (task #85). Voice output reads text from here; the browser
 * sends ids, never prose, so the route cannot be used as a text-to-speech proxy.
 */
export async function getAssistantAnswerForRequest(
  requestId: string,
  userId: string,
): Promise<{ messageId: string; answer: string } | null> {
  const { rows } = await pool.query<{ id: string; answer: string | null; content: string }>(
    `SELECT m.id, m.response->>'answer' AS answer, m.content
       FROM usage_requests r
       JOIN assistant_messages m ON m.id::text = r.result_reference
       JOIN assistant_conversations c ON c.id = m.conversation_id
      WHERE r.id = $1 AND r.user_id = $2 AND c.user_id = $2 AND m.role = 'assistant'`,
    [requestId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  const answer = typeof row.answer === 'string' && row.answer ? row.answer : row.content;
  return { messageId: row.id, answer };
}

/**
 * Count total messages for a conversation (used for pagination metadata).
 */
export async function countMessages(conversationId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM assistant_messages WHERE conversation_id = $1',
    [conversationId],
  );
  return Number(result.rows[0]?.count ?? 0);
}