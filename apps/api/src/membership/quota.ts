import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db.ts';

// Quota ledger primitives (task #81, docs/MEMBERSHIP-PLAN.md sections 4-5).
//
// Everything here is a short transaction that commits before the caller touches a
// provider, and no function holds a SQL transaction across a network wait. The
// order is always reserve -> dispatch -> settle, and a settle is exactly one state
// change: the rows themselves say whether it already happened, so a retried request
// cannot debit twice and a crash between steps is recovered from the ledger instead
// of process memory.
//
// Nothing in this file knows what a comp, a transcript or an audio chunk is. It
// counts integer units against integer allowances and returns fixed reason codes.
// Membership resolution (#86) supplies the plan and window; the route integrations
// (#83-#85) decide which units to ask for.
//
// Failure is closed: an unreadable plan, a lost connection or a rejected write
// answers `unavailable` rather than letting the request through uncounted.

export const METRICS = ['chat', 'stt_seconds', 'tts_characters'] as const;
export type Metric = (typeof METRICS)[number];

export const PURPOSES = ['coach_turn', 'stt_transcribe', 'tts_synthesize'] as const;
export type Purpose = (typeof PURPOSES)[number];

type BucketPeriodKind = 'membership_period' | 'calendar_month' | 'calendar_day';

export type QuotaReason =
  | 'locked'
  | 'exhausted'
  | 'daily_cap'
  | 'too_long'
  | 'rate_limited'
  | 'too_many_in_flight'
  | 'expired'
  | 'conflict'
  | 'in_progress'
  | 'duplicate'
  | 'unavailable';

export type PlanQuota = {
  planVersionId: string;
  // null term = calendar month (Free); a number = a fixed paid period window.
  termDays: number | null;
  chatPerPeriod: number;
  chatPerDay: number;
  sttSecondsPerPeriod: number;
  ttsCharactersPerPeriod: number;
  // null is "uncapped": the plan puts no execution limit on that metric.
  chatRequestsPerMinute: number | null;
  maxConcurrentRequests: number | null;
  maxSttSecondsPerRequest: number | null;
  maxConcurrentTtsChunks: number | null;
  periodStart: number;
  periodEnd: number;
};

export type ReserveInput = {
  userId: string;
  purpose: Purpose;
  idempotencyKey: string;
  payloadSha256: string;
  plan: PlanQuota;
  units: Partial<Record<Metric, number>>;
  // A linked request debits nothing itself; it belongs to the same user turn.
  turnRequestId?: string;
  now?: number;
  reservationTtlMs?: number;
};

export type Reservation = { bucketId: string; metric: Metric; periodKind: BucketPeriodKind; units: number };

export type ReserveResult =
  | { ok: true; requestId: string; reservations: Reservation[] }
  | { ok: false; reason: QuotaReason; requestId?: string; status?: string; resultReference?: string | null; retryAfterMs?: number };

export type SettleOutcome = 'completed' | 'released';

export type SettleResult =
  | { ok: true; requestId: string; settled: boolean; consumed: Partial<Record<Metric, number>> }
  | { ok: false; reason: 'conflict' | 'unavailable'; requestId?: string };

export type Balance = { allowance: number; consumed: number; reserved: number };

export type ReconcileResult = { released: string[]; consumed: string[]; needsRecovery: string[]; unavailable: boolean };

// Vietnam has had no daylight saving since 1976, so a fixed offset is exact and
// keeps calendar boundaries independent of the server's TimeZone setting.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const DEFAULT_RESERVATION_TTL_MS = 10 * 60 * 1000;
// A dispatched request nobody can explain is released after this much time so no
// reservation hangs forever; the provider liability stays recorded as unknown.
const ORPHAN_RELEASE_MS = 24 * 60 * 60 * 1000;
const RECOVERY_BACKOFF_MS = 10 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;

// Longest window first, always. The rank is a constant, not a property of the
// windows one request happens to compute, so every path takes bucket row locks
// in the same sequence and a reserve cannot deadlock against a settle.
const KIND_RANK: Record<BucketPeriodKind, number> = { membership_period: 0, calendar_month: 1, calendar_day: 2 };

// The ORDER BY every path that locks buckets must use, derived from the same rank
// so the TypeScript order and the SQL order cannot drift apart.
const BUCKET_LOCK_ORDER = `ORDER BY b.metric, CASE b.period_kind ${Object.entries(KIND_RANK)
  .map(([kind, rank]) => `WHEN '${kind}' THEN ${rank}`)
  .join(' ')} END, b.period_start`;

type Client = PoolClient;

function nonNegativeInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

/** An execution limit. SQL NULL is "the plan puts no cap on this metric"; zero is
 *  a closed door. Anything else - a negative count, a fractional value, a missing
 *  column - returns undefined so the caller rejects the row, because reading a
 *  broken limit as uncapped would fail open. */
function limitOf(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

/** Validates a plan_versions row into the shape quota needs. Returns null for a
 *  malformed, incomplete or non-active row so the caller fails closed rather than
 *  inventing an allowance. */
export function planQuotaFromRow(
  row: Record<string, unknown> | null | undefined,
  window: { start: number; end: number },
): PlanQuota | null {
  if (!row) return null;
  if (row.status !== 'active') return null;
  if (!UUID.test(String(row.id ?? ''))) return null;
  if (!Number.isSafeInteger(window.start) || !Number.isSafeInteger(window.end) || window.end <= window.start) return null;
  const termDays = row.term_days === null || row.term_days === undefined ? null : Number(row.term_days);
  if (termDays !== null && (!Number.isSafeInteger(termDays) || termDays < 1)) return null;
  const allowances = [row.chat_per_period, row.chat_per_day, row.stt_seconds_per_period, row.tts_characters_per_period].map(nonNegativeInteger);
  if (allowances.some((value) => value === null)) return null;
  const [chatPerPeriod, chatPerDay, sttSecondsPerPeriod, ttsCharactersPerPeriod] = allowances as number[];
  const limits = [row.chat_requests_per_minute, row.max_concurrent_requests, row.max_stt_seconds_per_request, row.max_concurrent_tts_chunks].map(limitOf);
  if (limits.some((value) => value === undefined)) return null;
  const [chatRequestsPerMinute, maxConcurrentRequests, maxSttSecondsPerRequest, maxConcurrentTtsChunks] = limits as (number | null)[];
  return {
    planVersionId: String(row.id),
    termDays,
    chatPerPeriod,
    chatPerDay,
    sttSecondsPerPeriod,
    ttsCharactersPerPeriod,
    chatRequestsPerMinute,
    maxConcurrentRequests,
    maxSttSecondsPerRequest,
    maxConcurrentTtsChunks,
    periodStart: window.start,
    periodEnd: window.end,
  };
}

function cleanUnits(units: Partial<Record<Metric, number>>): Partial<Record<Metric, number>> | null {
  const clean: Partial<Record<Metric, number>> = {};
  for (const metric of METRICS) {
    const value = units[metric];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 0) return null;
    if (value > 0) clean[metric] = value;
  }
  return clean;
}

/** Calendar windows are computed in Asia/Ho_Chi_Minh and stored as UTC instants,
 *  so a bucket boundary is the same instant for every replica. */
function bucketWindow(kind: BucketPeriodKind, plan: PlanQuota, now: number): { start: number; end: number } {
  if (kind === 'membership_period') return { start: plan.periodStart, end: plan.periodEnd };
  const local = now + VN_OFFSET_MS;
  if (kind === 'calendar_day') {
    const start = Math.floor(local / DAY_MS) * DAY_MS;
    return { start: start - VN_OFFSET_MS, end: start + DAY_MS - VN_OFFSET_MS };
  }
  const date = new Date(local);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return { start: start - VN_OFFSET_MS, end: end - VN_OFFSET_MS };
}

function allowanceFor(metric: Metric, kind: BucketPeriodKind, plan: PlanQuota): number {
  if (kind === 'calendar_day') return plan.chatPerDay;
  if (metric === 'chat') return plan.chatPerPeriod;
  if (metric === 'stt_seconds') return plan.sttSecondsPerPeriod;
  return plan.ttsCharactersPerPeriod;
}

/** A chat turn spends two windows at once: its period and the VN day. */
function bucketsToHold(metric: Metric, plan: PlanQuota): BucketPeriodKind[] {
  const kinds: BucketPeriodKind[] = [plan.termDays === null ? 'calendar_month' : 'membership_period'];
  if (metric === 'chat' && plan.chatPerDay > 0) kinds.push('calendar_day');
  return [...new Set(kinds)].sort((a, b) => KIND_RANK[a] - KIND_RANK[b]);
}

async function withTransaction<T>(work: (client: Client) => Promise<T>): Promise<T | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('quota transaction failed', error instanceof Error ? error.message : error);
    return null;
  } finally {
    client.release();
  }
}

/** Serialises the quota operations of one account. The pilot policy is one running
 *  request per account, so the per-user lock is both the concurrency gate and the
 *  reason two tabs cannot both believe they found the last turn available. */
async function lockAccount(client: Client, userId: string): Promise<void> {
  await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId]);
}

/** Locks a bucket, creating it from the plan when the window is new. The allowance
 *  only ever grows: an upgrade can raise a window a user has not finished, but a
 *  bucket is never shrunk underneath someone who already spent it. */
async function holdBucket(
  client: Client,
  plan: PlanQuota,
  userId: string,
  metric: Metric,
  kind: BucketPeriodKind,
  now: number,
): Promise<{ id: string; allowance: number; consumed: number; reserved: number } | null> {
  const window = bucketWindow(kind, plan, now);
  const allowance = allowanceFor(metric, kind, plan);
  const { rows: inserted } = await client.query(
    `INSERT INTO usage_buckets (id, user_id, metric, period_kind, period_start, period_end, plan_version_id, allowance_units)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (user_id, metric, period_kind, period_start) DO NOTHING
     RETURNING id, allowance_units, consumed_units, reserved_units`,
    [randomUUID(), userId, metric, kind, new Date(window.start).toISOString(), new Date(window.end).toISOString(), plan.planVersionId, allowance],
  );
  if (inserted.length) {
    // The row was created by this transaction, so it is already locked.
    const bucket = inserted[0];
    return { id: bucket.id, allowance: bucket.allowance_units, consumed: bucket.consumed_units, reserved: bucket.reserved_units };
  }
  const { rows } = await client.query(
    `SELECT id, allowance_units, consumed_units, reserved_units
       FROM usage_buckets
      WHERE user_id = $1 AND metric = $2 AND period_kind = $3 AND period_start = $4
      FOR UPDATE`,
    [userId, metric, kind, new Date(window.start).toISOString()],
  );
  const bucket = rows[0];
  if (!bucket) return null;
  if (bucket.allowance_units < allowance) {
    await client.query("UPDATE usage_buckets SET allowance_units = $2, plan_version_id = $3, updated_at = now() WHERE id = $1", [bucket.id, allowance, plan.planVersionId]);
    bucket.allowance_units = allowance;
  }
  return { id: bucket.id, allowance: bucket.allowance_units, consumed: bucket.consumed_units, reserved: bucket.reserved_units };
}

/** Admission limits: the burst protection that is not money. Counts non-released
 *  requests, so a system error that gave the quota back does not also spend the
 *  account's rate budget. A voice turn counts as the chat turn it belongs to. */
async function checkAdmission(client: Client, input: ReserveInput, now: number): Promise<ReserveResult | null> {
  const minuteLimit = input.purpose === 'tts_synthesize' ? null : input.plan.chatRequestsPerMinute;
  if (minuteLimit !== null) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM usage_requests
        WHERE user_id = $1 AND purpose = ANY($2::text[]) AND created_at >= $3 AND status <> 'released'`,
      [input.userId, ['coach_turn', 'stt_transcribe'], new Date(now - 60_000).toISOString()],
    );
    if (rows[0].n >= minuteLimit) return { ok: false, reason: 'rate_limited', retryAfterMs: 60_000 - (now % 60_000) };
  }
  const concurrent = input.purpose === 'tts_synthesize' ? input.plan.maxConcurrentTtsChunks : input.plan.maxConcurrentRequests;
  if (concurrent !== null) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM usage_requests
        WHERE user_id = $1 AND purpose = $2 AND status IN ('reserved','dispatched')`,
      [input.userId, input.purpose],
    );
    if (rows[0].n >= concurrent) return { ok: false, reason: 'too_many_in_flight', retryAfterMs: 1_000 };
  }
  const sttCap = input.plan.maxSttSecondsPerRequest;
  if (sttCap !== null && (input.units.stt_seconds ?? 0) > sttCap) {
    return { ok: false, reason: 'too_long' };
  }
  return null;
}

export async function reserve(input: ReserveInput): Promise<ReserveResult> {
  const now = input.now ?? Date.now();
  if (!UUID.test(input.userId) || !HEX64.test(input.payloadSha256) || !input.idempotencyKey || !PURPOSES.includes(input.purpose)) {
    return { ok: false, reason: 'unavailable' };
  }
  const units = cleanUnits(input.units);
  if (!units) return { ok: false, reason: 'unavailable' };
  const ttl = input.reservationTtlMs ?? DEFAULT_RESERVATION_TTL_MS;

  const outcome = await withTransaction<ReserveResult | null>(async (client) => {
    await lockAccount(client, input.userId);

    const { rows: seen } = await client.query(
      `SELECT id, payload_sha256, status, result_reference FROM usage_requests WHERE user_id = $1 AND idempotency_key = $2`,
      [input.userId, input.idempotencyKey],
    );
    if (seen.length) {
      const request = seen[0];
      if (request.payload_sha256 !== input.payloadSha256) {
        return { ok: false, reason: 'conflict', requestId: request.id };
      }
      if (request.status === 'reserved' || request.status === 'dispatched' || request.status === 'needs_recovery') {
        // Same key, same payload, still running: hand the caller the id it already
        // owns so it resumes or reports progress instead of starting a second spend.
        return { ok: false, reason: 'in_progress', requestId: request.id, status: request.status };
      }
      return { ok: false, reason: 'duplicate', requestId: request.id, status: request.status, resultReference: request.result_reference };
    }

    if (input.plan.periodEnd <= now) return { ok: false, reason: 'expired' };
    // A metric the plan does not include is a locked feature, not a rate limit, so
    // it is answered before any policy check: the UI must never say "try again in
    // a minute" about something the plan will never contain.
    for (const metric of METRICS) {
      if ((units[metric] ?? 0) > 0 && allowanceFor(metric, bucketsToHold(metric, input.plan)[0], input.plan) <= 0) {
        return { ok: false, reason: 'locked' };
      }
    }
    const admission = await checkAdmission(client, input, now);
    if (admission) return admission;

    if (Object.keys(units).length === 0) {
      // A transcript that became a query belongs to the turn that already reserved
      // the chat unit; it must not debit a second time.
      if (!input.turnRequestId) return { ok: false, reason: 'unavailable' };
      const { rows: parent } = await client.query(
        "SELECT id FROM usage_requests WHERE id = $1 AND user_id = $2 AND status IN ('reserved','dispatched') FOR UPDATE",
        [input.turnRequestId, input.userId],
      );
      if (!parent.length) return { ok: false, reason: 'conflict' };
      const requestId = randomUUID();
      await insertRequest(client, input, now, ttl, requestId);
      return { ok: true, requestId, reservations: [] };
    }

    const held: { bucket: { id: string; allowance: number; consumed: number; reserved: number }; metric: Metric; kind: BucketPeriodKind; units: number; window: { start: number; end: number } }[] = [];
    for (const metric of METRICS) {
      const need = units[metric];
      if (!need) continue;
      for (const kind of bucketsToHold(metric, input.plan)) {
        const window = bucketWindow(kind, input.plan, now);
        if (window.end <= now) return { ok: false, reason: 'expired' };
        const bucket = await holdBucket(client, input.plan, input.userId, metric, kind, now);
        if (!bucket) return { ok: false, reason: 'unavailable' };
        if (bucket.consumed + bucket.reserved + need > bucket.allowance) {
          return { ok: false, reason: kind === 'calendar_day' ? 'daily_cap' : 'exhausted', retryAfterMs: Math.max(1, window.end - now) };
        }
        held.push({ bucket, metric, kind, units: need, window });
      }
    }

    const requestId = randomUUID();
    await insertRequest(client, input, now, ttl, requestId);
    for (const item of held) {
      await client.query('UPDATE usage_buckets SET reserved_units = reserved_units + $2, updated_at = now() WHERE id = $1', [item.bucket.id, item.units]);
      await client.query('INSERT INTO usage_reservations (request_id, bucket_id, units) VALUES ($1,$2,$3)', [requestId, item.bucket.id, item.units]);
    }
    return {
      ok: true,
      requestId,
      reservations: held.map((item) => ({ bucketId: item.bucket.id, metric: item.metric, periodKind: item.kind, units: item.units })),
    };
  });

  return outcome ?? { ok: false, reason: 'unavailable' };
}

async function insertRequest(client: Client, input: ReserveInput, now: number, ttl: number, requestId: string): Promise<void> {
  await client.query(
    `INSERT INTO usage_requests (id, user_id, idempotency_key, payload_sha256, purpose, turn_request_id, status, reserve_expires_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'reserved',$7,$8,$8)`,
    [
      requestId,
      input.userId,
      input.idempotencyKey,
      input.payloadSha256,
      input.purpose,
      input.turnRequestId ?? null,
      new Date(now + ttl).toISOString(),
      new Date(now).toISOString(),
    ],
  );
}

/** Writes the dispatch intent. The caller must not contact a provider unless this
 *  returns ok: a spend with no durable intent is one nobody can prove or price. */
export async function markDispatched(requestId: string, at = Date.now()): Promise<{ ok: boolean; firstTime: boolean }> {
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT status, dispatched_at FROM usage_requests WHERE id = $1 FOR UPDATE', [requestId]);
    if (!rows.length) return { ok: false, firstTime: false };
    if (rows[0].status === 'dispatched') return { ok: true, firstTime: false };
    if (rows[0].status !== 'reserved') return { ok: false, firstTime: false };
    await client.query("UPDATE usage_requests SET status = 'dispatched', dispatched_at = $2, updated_at = now() WHERE id = $1", [requestId, new Date(at).toISOString()]);
    return { ok: true, firstTime: true };
  });
  return result ?? { ok: false, firstTime: false };
}

/** Turns a reservation into consumption, or gives it back. Exactly once: a second
 *  settle on a terminal row changes nothing and answers settled: false.
 *
 *  `consumed` settles less than reserved for a partial result (5 of the 12 seconds
 *  of audio actually transcribed); the remainder is released, never kept. */
export async function settle(
  requestId: string,
  outcome: SettleOutcome,
  options: { consumed?: Partial<Record<Metric, number>>; resultReference?: string | null; errorCode?: string | null; at?: number } = {},
): Promise<SettleResult> {
  const at = options.at ?? Date.now();
  const wanted = options.consumed === undefined ? null : cleanUnits(options.consumed);
  if (options.consumed !== undefined && !wanted) return { ok: false, reason: 'unavailable' };

  const result = await withTransaction<SettleResult | null>(async (client) => {
    const { rows } = await client.query('SELECT id, user_id, status, result_reference FROM usage_requests WHERE id = $1 FOR UPDATE', [requestId]);
    if (!rows.length) return { ok: false, reason: 'conflict', requestId };
    const request = rows[0];
    if (request.status === 'completed' || request.status === 'released') {
      return { ok: true, requestId, settled: false, consumed: {} };
    }
    await lockAccount(client, request.user_id);

    const { rows: reservations } = await client.query(
      `SELECT res.id, res.units, res.state, b.metric, b.id AS bucket_id
         FROM usage_reservations res
         JOIN usage_buckets b ON b.id = res.bucket_id
        WHERE res.request_id = $1
        ${BUCKET_LOCK_ORDER}`,
      [requestId],
    );

    const applied: Partial<Record<Metric, number>> = {};
    for (const row of reservations) {
      if (row.state !== 'reserved') continue;
      const metric = row.metric as Metric;
      const reserve = row.units as number;
      const units = outcome === 'released' ? 0 : Math.min(reserve, wanted?.[metric] === undefined ? reserve : Math.max(0, wanted[metric]));
      await client.query('UPDATE usage_buckets SET reserved_units = reserved_units - $2, updated_at = now() WHERE id = $1', [row.bucket_id, reserve]);
      if (units > 0) {
        await client.query('UPDATE usage_buckets SET consumed_units = consumed_units + $2, updated_at = now() WHERE id = $1', [row.bucket_id, units]);
        // One turn is held in several windows but spent once, so the answer reports
        // the metric, not the sum of its windows.
        applied[metric] = Math.max(applied[metric] ?? 0, units);
      }
      await client.query("UPDATE usage_reservations SET state = $2, updated_at = now() WHERE id = $1", [row.id, units > 0 ? 'settled' : 'released']);
    }

    await client.query(
      `UPDATE usage_requests
          SET status = $2, settled_at = $3, result_reference = coalesce($4, result_reference), error_code = $5, updated_at = now()
        WHERE id = $1`,
      [requestId, outcome === 'released' ? 'released' : 'completed', new Date(at).toISOString(), options.resultReference ?? null, options.errorCode ?? null],
    );
    return { ok: true, requestId, settled: true, consumed: applied };
  });

  return result ?? { ok: false, reason: 'unavailable' };
}

async function settleLocked(client: Client, requestId: string, outcome: SettleOutcome, at: number): Promise<void> {
  const { rows } = await client.query(
    `SELECT res.id, res.units, b.id AS bucket_id
       FROM usage_reservations res
       JOIN usage_buckets b ON b.id = res.bucket_id
      WHERE res.request_id = $1 AND res.state = 'reserved'
      ${BUCKET_LOCK_ORDER}
      FOR UPDATE OF res, b`,
    [requestId],
  );
  for (const row of rows) {
    await client.query('UPDATE usage_buckets SET reserved_units = reserved_units - $2, updated_at = now() WHERE id = $1', [row.bucket_id, row.units]);
    if (outcome === 'completed') {
      await client.query('UPDATE usage_buckets SET consumed_units = consumed_units + $2, updated_at = now() WHERE id = $1', [row.bucket_id, row.units]);
    }
    await client.query("UPDATE usage_reservations SET state = $2, updated_at = now() WHERE id = $1", [row.id, outcome === 'completed' ? 'settled' : 'released']);
  }
  await client.query("UPDATE usage_requests SET status = $2, settled_at = $3, updated_at = now() WHERE id = $1", [
    requestId,
    outcome === 'completed' ? 'completed' : 'released',
    new Date(at).toISOString(),
  ]);
}

/** Recovery for reservations that outlived their deadline. Only provable cases are
 *  settled here; an unknown provider outcome is marked, never re-dispatched and
 *  never silently refunded, because either would be a guess about money. #87
 *  reconciles those rows against the gateway.
 *
 *  Claims use FOR UPDATE SKIP LOCKED, so two workers cannot settle the same request. */
export async function reconcileStale(options: { limit?: number; now?: number } = {}): Promise<ReconcileResult> {
  const now = options.now ?? Date.now();
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 200);
  const outcome: ReconcileResult = { released: [], consumed: [], needsRecovery: [], unavailable: false };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, status, dispatched_at, result_reference, created_at, updated_at
         FROM usage_requests
        WHERE status IN ('reserved','dispatched','needs_recovery') AND reserve_expires_at <= $1
        ORDER BY reserve_expires_at
        LIMIT $2
        FOR UPDATE SKIP LOCKED`,
      [new Date(now).toISOString(), limit],
    );
    for (const row of rows) {
      // Never dispatched: no provider was called, so the allowance is owed back.
      if (row.status === 'reserved') {
        await settleLocked(client, row.id, 'released', now);
        outcome.released.push(row.id);
        continue;
      }
      // The deliverable exists, so the turn was spent even though the settle was lost.
      if (row.result_reference) {
        await settleLocked(client, row.id, 'completed', now);
        outcome.consumed.push(row.id);
        continue;
      }
      if (now - Date.parse(row.created_at) >= ORPHAN_RELEASE_MS) {
        // Nothing can explain it any more: the user is made whole and the provider
        // liability stays unknown in usage_attempts for the #92 report.
        await settleLocked(client, row.id, 'released', now);
        outcome.released.push(row.id);
        continue;
      }
      // Either way the row is not worth looking at again until the backoff ends:
      // for a needs_recovery row, reserve_expires_at is its next review deadline.
      await client.query("UPDATE usage_requests SET status = 'needs_recovery', reserve_expires_at = $2, updated_at = now() WHERE id = $1", [
        row.id,
        new Date(now + RECOVERY_BACKOFF_MS).toISOString(),
      ]);
      outcome.needsRecovery.push(row.id);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('quota recovery failed', error instanceof Error ? error.message : error);
    outcome.unavailable = true;
  } finally {
    client.release();
  }
  return outcome;
}

export async function markResultReference(requestId: string, resultReference: string): Promise<boolean> {
  // The deliverable is recorded before the settle so recovery can tell an answer
  // that was written but not settled from an outcome nobody knows, without
  // reading any chat content.
  const { rowCount } = await pool.query(
    "UPDATE usage_requests SET result_reference = $2, updated_at = now() WHERE id = $1 AND status IN ('reserved', 'dispatched')",
    [requestId, resultReference],
  );
  return (rowCount ?? 0) > 0;
}

/** What the account still has, for the usage API (#86) and the Coach UI (#89).
 *  Reports the windows the resolved entitlement actually uses, and adds the daily
 *  cap of chat so the UI can tell "month left, day used up" apart. */
export async function balances(userId: string, plan: PlanQuota, now = Date.now()): Promise<Record<Metric, Balance> & { chatToday: Balance }> {
  const kinds: BucketPeriodKind[] = [plan.termDays === null ? 'calendar_month' : 'membership_period', 'calendar_day'];
  const windows = new Map(kinds.map((kind) => [kind, bucketWindow(kind, plan, now)]));
  const empty: Balance = { allowance: 0, consumed: 0, reserved: 0 };
  const result = {
    chat: { ...empty, allowance: plan.chatPerPeriod },
    stt_seconds: { ...empty, allowance: plan.sttSecondsPerPeriod },
    tts_characters: { ...empty, allowance: plan.ttsCharactersPerPeriod },
    chatToday: { ...empty, allowance: plan.chatPerDay },
  };
  const { rows } = await pool.query(
    `SELECT metric, period_kind, period_start, allowance_units, consumed_units, reserved_units
       FROM usage_buckets
      WHERE user_id = $1 AND period_kind = ANY($2) AND period_end > $3`,
    [userId, kinds, new Date(now).toISOString()],
  );
  for (const row of rows) {
    const window = windows.get(row.period_kind as BucketPeriodKind);
    if (!window || Date.parse(row.period_start) !== window.start) continue;
    const balance = { allowance: row.allowance_units, consumed: row.consumed_units, reserved: row.reserved_units };
    if (row.period_kind === 'calendar_day') {
      if (row.metric === 'chat') result.chatToday = balance;
      continue;
    }
    if (row.metric in result) (result as Record<string, Balance>)[row.metric] = balance;
  }
  return result;
}
