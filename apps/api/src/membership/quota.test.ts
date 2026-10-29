import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { PlanQuota, ReserveInput } from './quota.ts';

// DB-backed integration for the quota primitives (task #81). Everything that has
// to survive two tabs, a retry or a restart is tested against real PostgreSQL
// rows, because the guarantees are the transaction and the constraints — an
// in-memory double of this module would prove nothing.
// Like accounts.test.ts, db.ts and quota.ts are imported inside the test: a static
// import would build the pg Pool before the .env guard below has DATABASE_URL.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../../.env'));
  } catch {
    // No .env — the whole file skips.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);

let pool: Pool;
let quota: typeof import('./quota.ts');

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const DAY = 86_400_000;
// 2026-11-03T02:00Z is 09:00 in Asia/Ho_Chi_Minh: mid-morning, well inside a day.
const NOW = Date.parse('2026-11-03T02:00:00.000Z');

type PlanSeed = Partial<{
  termDays: number | null;
  chatPerPeriod: number;
  chatPerDay: number;
  sttSecondsPerPeriod: number;
  ttsCharactersPerPeriod: number;
  chatRequestsPerMinute: number | null;
  maxConcurrentRequests: number | null;
  maxSttSecondsPerRequest: number | null;
  maxConcurrentTtsChunks: number | null;
  status: string;
}>;

let schemaApplied = false;
const planIds: string[] = [];

async function applySchema(): Promise<void> {
  if (schemaApplied) return;
  await pool.query(await readFile(join(import.meta.dirname, '../schema.sql'), 'utf8'));
  schemaApplied = true;
}

async function makeAccount(): Promise<{ userId: string; cleanup: () => Promise<void> }> {
  await applySchema();
  const userId = randomUUID();
  await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `test-${userId}@example.com`]);
  return {
    userId,
    cleanup: async () => {
      await pool.query('DELETE FROM usage_reservations WHERE request_id IN (SELECT id FROM usage_requests WHERE user_id = $1)', [userId]);
      await pool.query('DELETE FROM usage_attempts WHERE request_id IN (SELECT id FROM usage_requests WHERE user_id = $1)', [userId]);
      await pool.query('DELETE FROM usage_requests WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM usage_buckets WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    },
  };
}

/** Inserts an offer and returns its row. The plan versions are test-owned rows:
 *  they are deleted once every bucket that references them is gone. */
async function insertPlan(seed: PlanSeed = {}): Promise<Record<string, unknown>> {
  const planVersionId = randomUUID();
  planIds.push(planVersionId);
  const termDays = 'termDays' in seed ? seed.termDays : 30;
  const columns = {
    chatPerPeriod: seed.chatPerPeriod ?? 150,
    chatPerDay: seed.chatPerDay ?? 30,
    sttSecondsPerPeriod: seed.sttSecondsPerPeriod ?? 600,
    ttsCharactersPerPeriod: seed.ttsCharactersPerPeriod ?? 5000,
    chatRequestsPerMinute: 'chatRequestsPerMinute' in seed ? seed.chatRequestsPerMinute : 60,
    maxConcurrentRequests: 'maxConcurrentRequests' in seed ? seed.maxConcurrentRequests : 1,
    maxSttSecondsPerRequest: 'maxSttSecondsPerRequest' in seed ? seed.maxSttSecondsPerRequest : 60,
    maxConcurrentTtsChunks: 'maxConcurrentTtsChunks' in seed ? seed.maxConcurrentTtsChunks : 2,
  };
  await pool.query(
    `INSERT INTO plan_versions (
       id, code, version, label, price_vnd, term_days,
       chat_per_period, chat_per_day, stt_seconds_per_period, tts_characters_per_period,
       chat_requests_per_minute, max_concurrent_requests, max_stt_seconds_per_request,
       max_concurrent_tts_chunks, status
     ) VALUES ($1,$2,1,'Test',99000,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      planVersionId,
      `q-${planVersionId.slice(0, 8)}`,
      termDays,
      columns.chatPerPeriod,
      columns.chatPerDay,
      columns.sttSecondsPerPeriod,
      columns.ttsCharactersPerPeriod,
      columns.chatRequestsPerMinute,
      columns.maxConcurrentRequests,
      columns.maxSttSecondsPerRequest,
      columns.maxConcurrentTtsChunks,
      seed.status ?? 'active',
    ],
  );
  const { rows } = await pool.query('SELECT * FROM plan_versions WHERE id = $1', [planVersionId]);
  return rows[0];
}

const planWindow = () => ({ start: NOW, end: NOW + 30 * DAY });

/** The quota for a seeded offer, or null when the offer is not sellable. */
async function makePlan(seed: PlanSeed = {}): Promise<PlanQuota | null> {
  return quota.planQuotaFromRow(await insertPlan(seed), planWindow());
}

const usablePlan = async (seed: PlanSeed = {}): Promise<PlanQuota> => {
  const plan = await makePlan(seed);
  assert.ok(plan, 'an active offer must read back as usable quota');
  return plan;
};

function ask(userId: string, overrides: Partial<ReserveInput> = {}): ReserveInput {
  return {
    userId,
    purpose: 'coach_turn',
    idempotencyKey: `turn-${randomUUID().slice(0, 12)}`,
    payloadSha256: sha('{"query":"what should I run at stage 4?"}'),
    plan: overrides.plan ?? blankPlan,
    units: { chat: 1 },
    now: NOW,
    ...overrides,
  };
}

let blankPlan: PlanQuota;

test('quota reserve, dispatch and settle', { skip: !hasDb }, async (t) => {
  pool = (await import('../db.ts')).pool;
  quota = await import('./quota.ts');
  blankPlan = await usablePlan();

  const cleanups: (() => Promise<void>)[] = [];
  t.after(async () => {
    // Accounts first: their buckets are the only thing that ties an offer to usage,
    // and the append-only trigger refuses to delete a plan still referenced.
    for (const cleanup of cleanups) await cleanup();
    await pool.query('DELETE FROM plan_versions WHERE id = ANY($1::uuid[])', [planIds]);
    await pool.end();
  });

  async function account(): Promise<string> {
    const created = await makeAccount();
    cleanups.push(created.cleanup);
    return created.userId;
  }

  async function bucketRows(userId: string): Promise<{ metric: string; period_kind: string; period_start: Date; allowance: number; consumed: number; reserved: number }[]> {
    const { rows } = await pool.query(
      `SELECT metric, period_kind, period_start, allowance_units AS allowance, consumed_units AS consumed, reserved_units AS reserved
         FROM usage_buckets WHERE user_id = $1 ORDER BY metric, period_kind`,
      [userId],
    );
    return rows;
  }

  /** The money-bearing window, so a test never reads a stale snapshot after a settle. */
  async function periodUsage(userId: string): Promise<{ reserved: number; consumed: number }> {
    const row = (await bucketRows(userId)).find((item) => item.period_kind === 'membership_period');
    return { reserved: row?.reserved ?? 0, consumed: row?.consumed ?? 0 };
  }

  await t.test('a reserve holds the period and the VN day window, and commits before the caller works', async () => {
    const userId = await account();
    const result = await quota.reserve(ask(userId, { plan: blankPlan }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(
      result.reservations.map((item) => [item.metric, item.periodKind, item.units]).sort(),
      [
        ['chat', 'calendar_day', 1],
        ['chat', 'membership_period', 1],
      ],
    );
    // A different connection must already see the hold: the transaction is closed
    // before any provider is called, so no SQL lock is held across the answer.
    const seen = await bucketRows(userId);
    assert.deepEqual(
      seen.map((row) => [row.metric, row.period_kind, row.reserved]),
      [
        ['chat', 'calendar_day', 1],
        ['chat', 'membership_period', 1],
      ],
    );
    const today = seen.find((row) => row.period_kind === 'calendar_day')!;
    assert.equal(new Date(today.period_start).toISOString(), '2026-11-02T17:00:00.000Z', 'day starts at midnight Asia/Ho_Chi_Minh');
    const summary = await quota.balances(userId, blankPlan, NOW);
    assert.deepEqual([summary.chat, summary.chatToday], [
      { allowance: 150, consumed: 0, reserved: 1 },
      { allowance: 30, consumed: 0, reserved: 1 },
    ]);
  });

  await t.test('only one of two racing requests gets the last turn', async () => {
    const userId = await account();
    const plan = await usablePlan({ chatPerPeriod: 1, chatPerDay: 1, maxConcurrentRequests: null, chatRequestsPerMinute: null });
    const results = await Promise.all([
      quota.reserve(ask(userId, { plan, idempotencyKey: 'race-one', payloadSha256: sha('one') })),
      quota.reserve(ask(userId, { plan, idempotencyKey: 'race-two', payloadSha256: sha('two') })),
    ]);
    const granted = results.filter((result) => result.ok);
    assert.equal(granted.length, 1, 'exactly one request may hold the last unit');
    const refused = results.find((result) => !result.ok);
    assert.ok(refused && !refused.ok);
    assert.equal(refused.reason, 'exhausted', 'the period cap answers before the day cap');
    assert.ok(refused.retryAfterMs && refused.retryAfterMs > 0, 'the caller is told when the window resets');
    const buckets = await bucketRows(userId);
    // Both windows are still at one held unit: the loser of the race left nothing behind.
    assert.deepEqual(buckets.map((row) => [row.allowance, row.consumed, row.reserved]), [
      [1, 0, 1],
      [1, 0, 1],
    ]);
  });

  await t.test('a retry of the same request cannot debit twice', async () => {
    const userId = await account();
    const payload = sha('same body');
    const key = 'retry-key';
    const first = await quota.reserve(ask(userId, { idempotencyKey: key, payloadSha256: payload }));
    assert.equal(first.ok, true);
    const again = await quota.reserve(ask(userId, { idempotencyKey: key, payloadSha256: payload }));
    assert.equal(again.ok, false);
    if (again.ok) return;
    assert.equal(again.reason, 'in_progress');
    assert.equal(again.requestId, first.ok ? first.requestId : undefined, 'the caller gets the request it already owns');
    assert.equal((await bucketRows(userId)).reduce((sum, row) => sum + row.reserved, 0), 2, 'one hold per bucket, not two');

    const conflict = await quota.reserve(ask(userId, { idempotencyKey: key, payloadSha256: sha('different body') }));
    assert.equal(conflict.ok, false);
    if (conflict.ok) return;
    assert.equal(conflict.reason, 'conflict', 'same key with a different payload is a client bug, not a new turn');

    if (first.ok) {
      await quota.settle(first.requestId, 'completed', { resultReference: 'message-1' });
      const replay = await quota.reserve(ask(userId, { idempotencyKey: key, payloadSha256: payload }));
      assert.equal(replay.ok, false);
      if (replay.ok) return;
      assert.equal(replay.reason, 'duplicate');
      assert.equal(replay.status, 'completed');
      assert.equal(replay.resultReference, 'message-1', 'a finished turn can be re-delivered without a new debit');
    }
  });

  await t.test('a plan with zero allowance locks the feature instead of exhausting it', async () => {
    const userId = await account();
    const plan = await usablePlan({ sttSecondsPerPeriod: 0 });
    const result = await quota.reserve(ask(userId, { plan, units: { stt_seconds: 10 } }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, 'locked', 'the UI must be able to say "not in your plan" instead of "used up"');
    assert.deepEqual(await bucketRows(userId), [], 'a locked feature creates no bucket');
  });

  await t.test('a stored zero is a closed door and an impossible limit rejects the offer', async () => {
    const userId = await account();
    // The shape of the seeded Free plan: no voice at all, and zero TTS chunks.
    const row = await insertPlan({ sttSecondsPerPeriod: 0, ttsCharactersPerPeriod: 0, maxConcurrentTtsChunks: 0, chatRequestsPerMinute: null, maxConcurrentRequests: null });
    const plan = quota.planQuotaFromRow(row, planWindow());
    assert.ok(plan);
    assert.equal(plan.maxConcurrentTtsChunks, 0, 'a zero cap must not read as uncapped');
    assert.equal(quota.planQuotaFromRow({ ...row, chat_requests_per_minute: -1 }, planWindow()), null, 'a nonsensical limit fails closed, it does not mean unlimited');
    assert.equal(quota.planQuotaFromRow({ ...row, max_stt_seconds_per_request: undefined }, planWindow()), null, 'a missing column is not a plan');

    const tts = await quota.reserve(ask(userId, { plan, purpose: 'tts_synthesize', units: { tts_characters: 120 }, idempotencyKey: 'zero-limit-tts', payloadSha256: sha('tts') }));
    assert.equal(tts.ok, false);
    if (tts.ok) return;
    assert.equal(tts.reason, 'locked', 'a metric the plan does not contain is not a rate limit');
    const stt = await quota.reserve(ask(userId, { plan, purpose: 'stt_transcribe', units: { stt_seconds: 5 }, idempotencyKey: 'zero-limit-stt', payloadSha256: sha('stt') }));
    assert.equal(stt.ok, false);
    if (stt.ok) return;
    assert.equal(stt.reason, 'locked');
    assert.deepEqual(await bucketRows(userId), [], 'a locked offer creates no bucket');
  });

  await t.test('the daily cap and the period cap are separate answers', async () => {
    const userId = await account();
    const plan = await usablePlan({ chatPerPeriod: 30, chatPerDay: 1, maxConcurrentRequests: null });
    const first = await quota.reserve(ask(userId, { plan, idempotencyKey: 'daily-one', payloadSha256: sha('1') }));
    assert.equal(first.ok, true);
    if (first.ok) await quota.settle(first.requestId, 'completed');
    const second = await quota.reserve(ask(userId, { plan, idempotencyKey: 'daily-two', payloadSha256: sha('2') }));
    assert.equal(second.ok, false);
    if (second.ok) return;
    assert.equal(second.reason, 'daily_cap');
    assert.equal((await quota.balances(userId, plan, NOW)).chat.consumed, 1, 'the period still has room');

    // After midnight in Hanoi the day window rolls; the period does not reset.
    const nextDay = Date.parse('2026-11-03T17:30:00.000Z');
    const third = await quota.reserve(ask(userId, { plan, idempotencyKey: 'daily-three', payloadSha256: sha('3'), now: nextDay }));
    assert.equal(third.ok, true);
    const summary = await quota.balances(userId, plan, nextDay);
    assert.deepEqual([summary.chat.consumed, summary.chatToday], [1, { allowance: 1, consumed: 0, reserved: 1 }]);
  });

  await t.test('burst and concurrency limits are policy, not balance', async () => {
    const userId = await account();
    const plan = await usablePlan({ chatRequestsPerMinute: 1, maxConcurrentRequests: null });
    const first = await quota.reserve(ask(userId, { plan, idempotencyKey: 'burst-one', payloadSha256: sha('1') }));
    assert.equal(first.ok, true);
    const throttled = await quota.reserve(ask(userId, { plan, idempotencyKey: 'burst-two', payloadSha256: sha('2') }));
    assert.equal(throttled.ok, false);
    if (throttled.ok) return;
    assert.equal(throttled.reason, 'rate_limited');
    assert.ok(throttled.retryAfterMs && throttled.retryAfterMs <= 60_000);

    const other = await account();
    const oneAtATime = await usablePlan({ maxConcurrentRequests: 1, chatRequestsPerMinute: null });
    const running = await quota.reserve(ask(other, { plan: oneAtATime, idempotencyKey: 'conc-one', payloadSha256: sha('1') }));
    assert.equal(running.ok, true);
    const queued = await quota.reserve(ask(other, { plan: oneAtATime, idempotencyKey: 'conc-two', payloadSha256: sha('2') }));
    assert.equal(queued.ok, false);
    if (queued.ok) return;
    assert.equal(queued.reason, 'too_many_in_flight');
    if (running.ok) await quota.settle(running.requestId, 'completed');
    const after = await quota.reserve(ask(other, { plan: oneAtATime, idempotencyKey: 'conc-three', payloadSha256: sha('3') }));
    assert.equal(after.ok, true, 'the next request is admitted once the running one is settled');
  });

  await t.test('audio longer than the plan allows is refused before any spend', async () => {
    const userId = await account();
    const plan = await usablePlan({ maxSttSecondsPerRequest: 60 });
    const result = await quota.reserve(ask(userId, { plan, purpose: 'stt_transcribe', units: { stt_seconds: 120 } }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, 'too_long');
    assert.deepEqual(await bucketRows(userId), []);
  });

  await t.test('dispatch is written before the provider call and settles exactly once', async () => {
    const userId = await account();
    const request = await quota.reserve(ask(userId, { plan: blankPlan }));
    assert.equal(request.ok, true);
    if (!request.ok) return;
    const { requestId } = request;

    const { rows: before } = await pool.query('SELECT status, dispatched_at FROM usage_requests WHERE id = $1', [requestId]);
    assert.equal(before[0].status, 'reserved');
    assert.equal(before[0].dispatched_at, null);

    const dispatched = await quota.markDispatched(requestId, NOW + 1000);
    assert.deepEqual(dispatched, { ok: true, firstTime: true });
    // A retry of the same request keeps its intent; a released one gets nothing.
    assert.deepEqual(await quota.markDispatched(requestId, NOW + 2000), { ok: true, firstTime: false });
    assert.equal((await quota.markDispatched(randomUUID())).ok, false, 'an unknown request cannot be dispatched');

    const first = await quota.settle(requestId, 'completed', { resultReference: 'msg-9' });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.settled, true);
    assert.deepEqual(Object.entries(first.consumed), [['chat', 1]], 'a turn held in two windows is still one turn spent');
    // Two replays of the answer, in parallel and with opposite outcomes: neither
    // may move the ledger again, and neither may rewrite the terminal status.
    const [again, undo] = await Promise.all([quota.settle(requestId, 'completed'), quota.settle(requestId, 'released')]);
    assert.equal([again, undo].filter((result) => result.ok && result.settled).length, 0, 'a terminal request converts no settle');
    const buckets = await bucketRows(userId);
    assert.deepEqual(buckets.map((row) => [row.consumed, row.reserved]), [
      [1, 0],
      [1, 0],
    ]);
    const { rows: done } = await pool.query('SELECT status, settled_at, result_reference FROM usage_requests WHERE id = $1', [requestId]);
    assert.equal(done[0].status, 'completed');
    assert.equal(done[0].result_reference, 'msg-9');
    assert.equal((await quota.markDispatched(requestId)).ok, false, 'a settled request is not dispatchable');
  });

  await t.test('a system error with no deliverable gives the unit back', async () => {
    const userId = await account();
    const plan = await usablePlan({ chatPerPeriod: 1, chatPerDay: 1, maxConcurrentRequests: null, chatRequestsPerMinute: 1 });
    const first = await quota.reserve(ask(userId, { plan }));
    assert.equal(first.ok, true);
    if (!first.ok) return;
    await quota.markDispatched(first.requestId);
    const released = await quota.settle(first.requestId, 'released', { errorCode: 'model_unavailable' });
    assert.equal(released.ok, true);
    const buckets = await bucketRows(userId);
    assert.deepEqual(buckets.map((row) => [row.allowance, row.consumed, row.reserved]), [
      [1, 0, 0],
      [1, 0, 0],
    ]);
    // The failed turn is not counted against the rate budget either.
    const retry = await quota.reserve(ask(userId, { plan, idempotencyKey: 'retry-after-error', payloadSha256: sha('retry') }));
    assert.equal(retry.ok, true, 'a refunded request does not spend the minute budget');
  });

  await t.test('a partial result consumes what happened and releases the rest', async () => {
    const userId = await account();
    const plan = await usablePlan({ sttSecondsPerPeriod: 600, maxConcurrentRequests: null });
    const held = await quota.reserve(ask(userId, { plan, purpose: 'stt_transcribe', units: { stt_seconds: 12 } }));
    assert.equal(held.ok, true);
    if (!held.ok) return;
    const result = await quota.settle(held.requestId, 'completed', { consumed: { stt_seconds: 5 } });
    assert.deepEqual(result.ok && result.consumed, { stt_seconds: 5 });
    const buckets = await bucketRows(userId);
    assert.equal(buckets.length, 1);
    assert.deepEqual([buckets[0].consumed, buckets[0].reserved], [5, 0]);
    const overdrawn = await quota.settle(held.requestId, 'completed', { consumed: { stt_seconds: 99 } });
    assert.equal(overdrawn.ok && overdrawn.settled, false, 'a settled request cannot be re-settled for more');
    assert.equal((await bucketRows(userId))[0].consumed, 5);
  });

  await t.test('a transcript that becomes a query reuses the turn instead of debiting again', async () => {
    const userId = await account();
    const plan = await usablePlan({ maxConcurrentRequests: null, chatRequestsPerMinute: null });
    const turn = await quota.reserve(ask(userId, { plan, units: { chat: 1, stt_seconds: 10 }, purpose: 'stt_transcribe' }));
    assert.equal(turn.ok, true);
    if (!turn.ok) return;
    const linked = await quota.reserve(ask(userId, { plan, purpose: 'coach_turn', units: {}, turnRequestId: turn.requestId, idempotencyKey: `q-${randomUUID().slice(0, 8)}`, payloadSha256: sha('transcribed query') }));
    assert.equal(linked.ok, true, 'the query is admitted on the reservation the voice turn already holds');
    if (!linked.ok) return;
    assert.deepEqual(linked.reservations, []);
    const settled = await quota.settle(turn.requestId, 'completed');
    assert.deepEqual(settled.ok && settled.consumed, { chat: 1, stt_seconds: 10 });
    assert.equal((await bucketRows(userId)).reduce((sum, row) => sum + row.reserved, 0), 0);
    await quota.settle(linked.requestId, 'completed');

    const orphanLink = await quota.reserve(ask(userId, { plan, units: {}, idempotencyKey: `orphan-${randomUUID().slice(0, 8)}`, payloadSha256: sha('x') }));
    assert.equal(orphanLink.ok, false, 'a request that debits nothing must name the turn it belongs to');
    const deadLink = await quota.reserve(ask(userId, { plan, units: {}, turnRequestId: turn.requestId, idempotencyKey: `dead-${randomUUID().slice(0, 8)}`, payloadSha256: sha('x') }));
    assert.equal(deadLink.ok, false);
    if (deadLink.ok) return;
    assert.equal(deadLink.reason, 'conflict', 'a settled turn cannot accept a late companion request');
  });

  await t.test('a settle and a reserve over the same two metrics take locks in one order', async () => {
    const userId = await account();
    const plan = await usablePlan({ chatPerPeriod: 200, chatPerDay: 200, maxConcurrentRequests: null, chatRequestsPerMinute: null });
    const first = await quota.reserve(ask(userId, { plan, idempotencyKey: 'order-chat-stt-a', payloadSha256: sha('a'), units: { chat: 1, stt_seconds: 30 } }));
    const second = await quota.reserve(ask(userId, { plan, idempotencyKey: 'order-chat-stt-b', payloadSha256: sha('b'), units: { chat: 1, stt_seconds: 20 } }));
    assert.equal(first.ok && second.ok, true);
    if (!first.ok || !second.ok) return;

    // Two metrics means a request locks the chat windows and the voice window, so
    // the order is observable: a reserve and a settle that disagree on it deadlock,
    // and a deadlock answers `unavailable` instead of corrupting the balance.
    const raced = await Promise.all([
      quota.settle(first.requestId, 'completed', { consumed: { stt_seconds: 10 } }),
      quota.settle(second.requestId, 'released'),
      quota.reserve(ask(userId, { plan, idempotencyKey: 'order-chat-stt-c', payloadSha256: sha('c'), units: { chat: 1, stt_seconds: 5 } })),
      quota.reserve(ask(userId, { plan, idempotencyKey: 'order-chat-stt-d', payloadSha256: sha('d'), units: { chat: 1, stt_seconds: 5 } })),
    ]);
    assert.deepEqual(raced.map((result) => result.ok), [true, true, true, true], 'no operation was refused by a lock collision');

    const rows = await bucketRows(userId);
    const chat = rows.find((row) => row.metric === 'chat' && row.period_kind === 'membership_period')!;
    const voice = rows.find((row) => row.metric === 'stt_seconds')!;
    assert.deepEqual([chat.consumed, chat.reserved], [1, 2], 'one turn spent, two still held');
    assert.deepEqual([voice.consumed, voice.reserved], [10, 10], 'only the seconds actually transcribed are consumed');
  });

  await t.test('recovery releases holds that never dispatched and keeps unknown outcomes for reconciliation', async () => {
    const userId = await account();
    const plan = await usablePlan({ maxConcurrentRequests: null, chatRequestsPerMinute: null });

    const never = await quota.reserve(ask(userId, { plan, idempotencyKey: 'never-sent', payloadSha256: sha('a'), reservationTtlMs: 1000 }));
    assert.equal(never.ok, true);
    const lost = await quota.reserve(ask(userId, { plan, idempotencyKey: 'answered', payloadSha256: sha('b'), reservationTtlMs: 1000 }));
    assert.equal(lost.ok, true);
    const unknown = await quota.reserve(ask(userId, { plan, idempotencyKey: 'outcome-unknown', payloadSha256: sha('c'), reservationTtlMs: 1000 }));
    assert.equal(unknown.ok, true);
    const ancient = await quota.reserve(ask(userId, { plan, idempotencyKey: 'orphan-hold', payloadSha256: sha('d'), reservationTtlMs: 1000 }));
    assert.equal(ancient.ok, true);
    if (!never.ok || !lost.ok || !unknown.ok || !ancient.ok) return;

    await quota.markDispatched(lost.requestId, NOW);
    await quota.markDispatched(unknown.requestId, NOW);
    await quota.markDispatched(ancient.requestId, NOW);
    // The answer was persisted but the process died before the settle.
    assert.equal(await quota.markResultReference(lost.requestId, 'message-42'), true);
    // The unknown one is old enough that the policy stops holding the user's unit.
    await pool.query('UPDATE usage_requests SET created_at = $2 WHERE id = $1', [ancient.requestId, new Date(NOW - 25 * DAY).toISOString()]);

    const recovered = await quota.reconcileStale({ now: NOW + 60_000 });
    assert.deepEqual(recovered.needsRecovery, [unknown.requestId]);
    assert.ok(recovered.released.includes(never.requestId), 'nothing was dispatched, so the unit is owed back');
    assert.ok(recovered.released.includes(ancient.requestId), 'an unexplainable hold cannot hang forever');
    assert.deepEqual(recovered.consumed, [lost.requestId], 'a persisted deliverable is a spent turn');
    assert.equal(recovered.unavailable, false);

    const rows = await pool.query(
      'SELECT id, status FROM usage_requests WHERE id = ANY($1::uuid[])',
      [[never.requestId, lost.requestId, unknown.requestId, ancient.requestId]],
    );
    const statusOf = new Map(rows.rows.map((row) => [row.id, row.status]));
    assert.equal(statusOf.get(never.requestId), 'released');
    assert.equal(statusOf.get(ancient.requestId), 'released');
    assert.equal(statusOf.get(lost.requestId), 'completed');
    assert.equal(statusOf.get(unknown.requestId), 'needs_recovery');
    const period = await periodUsage(userId);
    // 4 reserved, minus the three settled ones; the unknown one still holds.
    assert.deepEqual(period, { reserved: 1, consumed: 1 });

    // An unknown outcome is never re-dispatched and never double-settled.
    assert.equal((await quota.markDispatched(unknown.requestId)).ok, false, 'recovery must not retry a request whose provider outcome is unknown');
    const second = await quota.reconcileStale({ now: NOW + 60_000 });
    assert.deepEqual(second.needsRecovery, [], 'the backoff keeps the same worker from re-claiming it immediately');
    assert.equal(statusOf.get(unknown.requestId), 'needs_recovery');
    const manual = await quota.settle(unknown.requestId, 'completed');
    assert.equal(manual.ok && manual.settled, true, 'the reconciliation path can settle it once the gateway answers');
    assert.deepEqual(
      await periodUsage(userId),
      { reserved: 0, consumed: 2 },
      'the hold is converted by the reconciliation, not dropped',
    );
  });

  await t.test('two recovery workers cannot settle the same request', async () => {
    const userId = await account();
    const plan = await usablePlan({ maxConcurrentRequests: null, chatRequestsPerMinute: null });
    const requests = await Promise.all(
      [1, 2, 3, 4].map((index) => quota.reserve(ask(userId, { plan, idempotencyKey: `stale-hold-${index}`, payloadSha256: sha(String(index)), reservationTtlMs: 1000 }))),
    );
    const ids = requests.map((request) => (request.ok ? request.requestId : ''));
    assert.equal(ids.filter(Boolean).length, 4);

    const [a, b] = await Promise.all([quota.reconcileStale({ now: NOW + 60_000, limit: 10 }), quota.reconcileStale({ now: NOW + 60_000, limit: 10 })]);
    const claimed = [...a.released, ...a.consumed, ...b.released, ...b.consumed];
    assert.equal(new Set(claimed).size, claimed.length, 'no request was settled by both workers');
    assert.equal(claimed.length, 4, 'every stale request was claimed exactly once');
    assert.equal([a, b].some((worker) => worker.unavailable), false, 'neither worker lost the ledger');
    assert.deepEqual(await periodUsage(userId), { reserved: 0, consumed: 0 }, 'four refunds, no double debit');
  });

  await t.test('nothing is admitted on an unreadable entitlement', async () => {
    const userId = await account();
    const closed = { ...blankPlan, periodEnd: NOW - 1 };
    const expired = await quota.reserve(ask(userId, { plan: closed }));
    assert.equal(expired.ok, false);
    if (expired.ok) return;
    assert.equal(expired.reason, 'expired', 'a period that has ended cannot hold a new reservation');

    const stranger = await quota.reserve(ask(randomUUID(), { plan: blankPlan }));
    assert.equal(stranger.ok, false, 'a request for an unknown account must not be counted anywhere');
    if (stranger.ok) return;
    assert.equal(stranger.reason, 'unavailable', 'a rejected write is a refusal, never an uncounted pass');

    const draftPlan = await makePlan({ status: 'draft' });
    assert.equal(draftPlan, null, 'a draft offer is not sellable quota');

    const malformed = await quota.reserve(ask(userId, { plan: blankPlan, payloadSha256: 'not-a-hash' }));
    assert.equal(malformed.ok, false);
    const badUnits = await quota.reserve(ask(userId, { plan: blankPlan, units: { chat: 1.5 } }));
    assert.equal(badUnits.ok, false);
    const negative = await quota.reserve(ask(userId, { plan: blankPlan, units: { chat: -1 } }));
    assert.equal(negative.ok, false);
    assert.deepEqual(await bucketRows(userId), [], 'every refusal left no trace in the ledger');
  });

  await t.test('a closed period window is never used as a balance', async () => {
    const userId = await account();
    const plan = await usablePlan();
    const held = await quota.reserve(ask(userId, { plan }));
    assert.equal(held.ok, true);
    if (held.ok) await quota.settle(held.requestId, 'completed');
    // Once the period has ended, its buckets are history: the answer for a new
    // period is the plan's allowance with nothing spent, not last month's ledger.
    const summary = await quota.balances(userId, plan, plan.periodEnd + DAY);
    assert.deepEqual(summary.chat, { allowance: 150, consumed: 0, reserved: 0 }, 'a closed window is not reported as the current one');
  });
});
