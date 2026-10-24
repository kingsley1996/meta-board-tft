import { pool } from '../db.ts';
import { assistantLog } from './logger.ts';

export type ReasoningLogStep =
  | 'intent_detection'
  | 'entity_resolution'
  | 'tool_call'
  | 'llm_generation'
  | 'validation'
  | 'fallback'
  | 'deterministic_answer';

export type ReasoningLogRow = {
  id: string;
  conversation_id: string;
  request_id: string;
  step: ReasoningLogStep;
  step_index: number;
  intent: string | null;
  mode: string | null;
  status: string | null;
  input_summary: string | null;
  output_summary: string | null;
  details: Record<string, unknown>;
  duration_ms: number | null;
  created_at: Date;
};

export type InsertReasoningLog = {
  conversationId: string;
  requestId: string;
  step: ReasoningLogStep;
  stepIndex?: number;
  intent?: string | null;
  mode?: string | null;
  status?: string | null;
  inputSummary?: string | null;
  outputSummary?: string | null;
  details?: Record<string, unknown>;
  durationMs?: number | null;
};

export type ReasoningLogInput = Omit<InsertReasoningLog, 'conversationId' | 'requestId' | 'stepIndex'>;
export type ReasoningLogWriter = (input: ReasoningLogInput) => void;

export const REASONING_LOG_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReasoningTrace = {
  requestId: string;
  conversationId: string;
  startedAt: Date;
  steps: ReasoningLogRow[];
};

const SELECT_COLUMNS = `id, conversation_id, request_id, step, step_index, intent, mode, status,
            input_summary, output_summary, details, duration_ms, created_at`;

let tableReady: Promise<void> | undefined;

export function summarizeReasoningText(value: string, max = 200): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export function parseReasoningListQuery(query: {
  conversationId?: unknown;
  requestId?: unknown;
  limit?: unknown;
  offset?: unknown;
}):
  | { ok: true; value: { conversationId?: string; requestId?: string; limit: number; offset: number } }
  | { ok: false } {
  const conversationId = typeof query.conversationId === 'string' ? query.conversationId : undefined;
  const requestId = typeof query.requestId === 'string' ? query.requestId : undefined;
  const rawLimit = typeof query.limit === 'string' ? query.limit : query.limit === undefined ? '50' : String(query.limit);
  const rawOffset = typeof query.offset === 'string' ? query.offset : query.offset === undefined ? '0' : String(query.offset);
  const limit = Number(rawLimit);
  const offset = Number(rawOffset);
  if (
    (conversationId !== undefined && !REASONING_LOG_UUID_PATTERN.test(conversationId)) ||
    (requestId !== undefined && !REASONING_LOG_UUID_PATTERN.test(requestId)) ||
    !/^\d+$/.test(rawLimit) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !/^\d+$/.test(rawOffset) ||
    !Number.isSafeInteger(offset) ||
    offset > 1_000_000
  ) {
    return { ok: false };
  }
  return { ok: true, value: { conversationId, requestId, limit, offset } };
}

export function ensureReasoningLogTable(): Promise<void> {
  tableReady ??= pool
    .query(`
      CREATE TABLE IF NOT EXISTS assistant_reasoning_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL,
        request_id text NOT NULL,
        step text NOT NULL CHECK (step IN ('intent_detection', 'entity_resolution', 'tool_call', 'llm_generation', 'validation', 'fallback', 'deterministic_answer')),
        step_index int NOT NULL DEFAULT 0,
        intent text,
        mode text,
        status text,
        input_summary text,
        output_summary text,
        details jsonb NOT NULL DEFAULT '{}',
        duration_ms int CHECK (duration_ms IS NULL OR duration_ms >= 0),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    .then(() =>
      pool.query('ALTER TABLE assistant_reasoning_logs DROP CONSTRAINT IF EXISTS assistant_reasoning_logs_conversation_id_fkey')
    )
    .then(() =>
      pool.query(`
        CREATE INDEX IF NOT EXISTS assistant_reasoning_logs_conversation_id_idx
          ON assistant_reasoning_logs (conversation_id, created_at DESC)
      `)
    )
    .then(() =>
      pool.query(`
        CREATE INDEX IF NOT EXISTS assistant_reasoning_logs_request_order_idx
          ON assistant_reasoning_logs (request_id, step_index)
      `)
    )
    .then(() =>
      pool.query(`
        CREATE INDEX IF NOT EXISTS assistant_reasoning_logs_step_idx
          ON assistant_reasoning_logs (step)
      `)
    )
    .then(() => undefined)
    .catch((error: unknown) => {
      tableReady = undefined;
      throw error;
    });
  return tableReady;
}

export function createReasoningLogWriter(
  conversationId: string,
  requestId: string,
  insert: (input: InsertReasoningLog) => Promise<unknown> = insertReasoningLog,
): ReasoningLogWriter {
  let stepIndex = 0;

  const report = (step: ReasoningLogStep, error: unknown): void => {
    assistantLog('reasoning_log_insert_error', {
      requestId,
      step,
      message: error instanceof Error ? error.message.slice(0, 300) : 'unknown error',
    });
  };

  // Observability must never break an answer: swallow sync throws as well as rejections.
  return (input) => {
    stepIndex += 1;
    try {
      void insert({ ...input, conversationId, requestId, stepIndex }).catch((error: unknown) => {
        report(input.step, error);
      });
    } catch (error) {
      report(input.step, error);
    }
  };
}

export async function insertReasoningLog(input: InsertReasoningLog): Promise<ReasoningLogRow> {
  await ensureReasoningLogTable();
  const { rows } = await pool.query<ReasoningLogRow>(
    `INSERT INTO assistant_reasoning_logs (
      conversation_id, request_id, step, step_index, intent, mode, status,
      input_summary, output_summary, details, duration_ms
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING ${SELECT_COLUMNS}`,
    [
      input.conversationId,
      input.requestId,
      input.step,
      input.stepIndex ?? 0,
      input.intent ?? null,
      input.mode ?? null,
      input.status ?? null,
      input.inputSummary ?? null,
      input.outputSummary ?? null,
      JSON.stringify(input.details ?? {}),
      input.durationMs ?? null,
    ],
  );
  return rows[0];
}

function buildFilters(options: { conversationId?: string; requestId?: string }): {
  params: unknown[];
  where: string;
} {
  const params: unknown[] = [];
  const filters: string[] = [];
  if (options.conversationId) {
    params.push(options.conversationId);
    filters.push(`conversation_id = $${params.length}`);
  }
  if (options.requestId) {
    params.push(options.requestId);
    filters.push(`request_id = $${params.length}`);
  }
  return { params, where: filters.length ? `WHERE ${filters.join(' AND ')}` : '' };
}

export async function listReasoningTraces({
  conversationId,
  requestId,
  limit = 100,
  offset = 0,
}: {
  conversationId?: string;
  requestId?: string;
  limit?: number;
  offset?: number;
}): Promise<ReasoningTrace[]> {
  await ensureReasoningLogTable();
  const { params, where } = buildFilters({ conversationId, requestId });
  const safeLimit = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
  const safeOffset = Number.isSafeInteger(offset) ? Math.max(offset, 0) : 0;
  const pageParams = [...params, safeLimit, safeOffset];

  // Page by request so a trace is never split across pages.
  const page = await pool.query<{ request_id: string }>(
    `SELECT request_id
     FROM assistant_reasoning_logs
     ${where}
     GROUP BY request_id
     ORDER BY max(created_at) DESC, request_id
     LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
    pageParams,
  );
  const requestIds = page.rows.map((row) => row.request_id);
  if (!requestIds.length) return [];

  const { rows } = await pool.query<ReasoningLogRow>(
    `SELECT ${SELECT_COLUMNS}
     FROM assistant_reasoning_logs
     WHERE request_id = ANY($1::text[])
     ORDER BY request_id, step_index, created_at`,
    [requestIds],
  );
  const byRequest = new Map<string, ReasoningLogRow[]>();
  for (const row of rows) {
    const steps = byRequest.get(row.request_id) ?? [];
    steps.push(row);
    byRequest.set(row.request_id, steps);
  }
  return requestIds.map((id) => {
    const steps = byRequest.get(id) ?? [];
    return {
      requestId: id,
      conversationId: steps[0]?.conversation_id ?? conversationId ?? '',
      startedAt: steps[0]?.created_at ?? new Date(),
      steps,
    };
  });
}

export async function countReasoningTraces({
  conversationId,
  requestId,
}: {
  conversationId?: string;
  requestId?: string;
}): Promise<number> {
  await ensureReasoningLogTable();
  const { params, where } = buildFilters({ conversationId, requestId });
  const result = await pool.query<{ count: string }>(
    `SELECT count(DISTINCT request_id)::text AS count FROM assistant_reasoning_logs ${where}`,
    params,
  );
  return Number(result.rows[0]?.count ?? 0);
}

/** Purge traces for a conversation the user deleted (they contain truncated message text). */
export async function deleteReasoningLogsForConversation(conversationId: string): Promise<number> {
  await ensureReasoningLogTable();
  const result = await pool.query('DELETE FROM assistant_reasoning_logs WHERE conversation_id = $1', [conversationId]);
  return result.rowCount ?? 0;
}

/**
 * Daily retention. Without it the table grows forever; traces are debug data with
 * truncated user text, so they should not outlive their usefulness.
 */
export function scheduleReasoningLogCleanup(olderThanDays: number): void {
  const purge = (): void => {
    void deleteOldReasoningLogs(olderThanDays)
      .then((count) => {
        if (count > 0) assistantLog('reasoning_log_pruned', { count, olderThanDays });
      })
      .catch((error: unknown) => {
        assistantLog('reasoning_log_prune_error', {
          message: error instanceof Error ? error.message.slice(0, 300) : 'unknown error',
        });
      });
  };
  purge();
  setInterval(purge, 24 * 60 * 60 * 1000).unref();
}

export async function deleteOldReasoningLogs(olderThanDays: number): Promise<number> {
  if (!Number.isSafeInteger(olderThanDays) || olderThanDays < 1) {
    throw new RangeError('olderThanDays must be a positive integer');
  }
  await ensureReasoningLogTable();
  const result = await pool.query(
    `DELETE FROM assistant_reasoning_logs
     WHERE created_at < now() - ($1 || ' days')::interval`,
    [olderThanDays],
  );
  return result.rowCount ?? 0;
}
