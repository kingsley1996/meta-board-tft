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
 * Create a new conversation or return existing one by ID.
 * Ownership matches the client cookie or, when signed in, the user account.
 * A signed-in user adopts a client-created conversation so the history follows
 * the account across devices.
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
       WHERE id = $1 AND (client_id = $2 OR ($3::uuid IS NOT NULL AND user_id = $3))`,
      [conversationId, clientId, userId ?? null],
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
    // Conversation exists but not owned by this client — create a new one instead of leaking.
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
  // Verify ownership first (client cookie or signed-in user).
  const owner = await pool.query<{ client_id: string; user_id: string | null }>(
    'SELECT client_id, user_id FROM assistant_conversations WHERE id = $1',
    [conversationId],
  );
  const row = owner.rows[0];
  if (!row || (row.client_id !== clientId && (!userId || row.user_id !== userId))) {
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
 * List recent conversations for a client or signed-in user (most recently
 * updated first). Signed-in users see every conversation attached to their
 * account plus the ones created on this client.
 */
export async function listConversations(
  clientId: string,
  limit = 20,
  userId?: string | null,
): Promise<AssistantConversationRow[]> {
  const { rows } = await pool.query<AssistantConversationRow>(
    `SELECT id, client_id, lang, title, created_at, updated_at
     FROM assistant_conversations
     WHERE client_id = $1 OR ($2::uuid IS NOT NULL AND user_id = $2)
     ORDER BY updated_at DESC
     LIMIT $3`,
    [clientId, userId ?? null, limit],
  );
  return rows;
}

/**
 * Delete a conversation and all its messages (cascade).
 */
export async function deleteConversation(
  conversationId: string,
  clientId: string,
  userId?: string | null,
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM assistant_conversations WHERE id = $1 AND (client_id = $2 OR ($3::uuid IS NOT NULL AND user_id = $3))`,
    [conversationId, clientId, userId ?? null],
  );
  return (result.rowCount ?? 0) > 0;
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