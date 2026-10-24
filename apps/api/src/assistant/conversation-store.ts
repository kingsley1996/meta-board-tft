import { pool } from '../db.ts';
import type { Lang } from './contracts.ts';
import { assistantLog } from './logger.ts';

export type AssistantMessageRow = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  intent: string | null;
  mode: string | null;
  status: string | null;
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
 * If clientId is provided, scope the lookup to that client for ownership.
 */
export async function getOrCreateConversation(
  conversationId: string | undefined,
  clientId: string,
  lang: Lang,
): Promise<AssistantConversationRow> {
  if (conversationId) {
    const existing = await pool.query<AssistantConversationRow>(
      'SELECT id, client_id, lang, title, created_at, updated_at FROM assistant_conversations WHERE id = $1 AND client_id = $2',
      [conversationId, clientId],
    );
    if (existing.rows.length) {
      return existing.rows[0];
    }
    // Conversation exists but not owned by this client — create a new one instead of leaking.
    assistantLog('conversation_ownership_mismatch', {
      conversationId,
      clientId,
    });
  }

  const { rows } = await pool.query<AssistantConversationRow>(
    `INSERT INTO assistant_conversations (client_id, lang, title)
     VALUES ($1, $2, $3)
     RETURNING id, client_id, lang, title, created_at, updated_at`,
    [clientId, lang, null],
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
): Promise<AssistantMessageRow> {
  const { rows } = await pool.query<AssistantMessageRow>(
    `INSERT INTO assistant_messages (conversation_id, role, content, intent, mode, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, conversation_id, role, content, intent, mode, status, created_at`,
    [conversationId, role, content, intent, mode, status],
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
): Promise<AssistantMessageRow[]> {
  // Verify ownership first.
  const owner = await pool.query<{ client_id: string }>(
    'SELECT client_id FROM assistant_conversations WHERE id = $1',
    [conversationId],
  );
  if (!owner.rows.length || owner.rows[0].client_id !== clientId) {
    return [];
  }

  const { rows } = await pool.query<AssistantMessageRow>(
    `SELECT id, conversation_id, role, content, intent, mode, status, created_at
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
 * List recent conversations for a client (most recently updated first).
 */
export async function listConversations(
  clientId: string,
  limit = 20,
): Promise<AssistantConversationRow[]> {
  const { rows } = await pool.query<AssistantConversationRow>(
    `SELECT id, client_id, lang, title, created_at, updated_at
     FROM assistant_conversations
     WHERE client_id = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [clientId, limit],
  );
  return rows;
}

/**
 * Delete a conversation and all its messages (cascade).
 */
export async function deleteConversation(
  conversationId: string,
  clientId: string,
): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM assistant_conversations WHERE id = $1 AND client_id = $2',
    [conversationId, clientId],
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