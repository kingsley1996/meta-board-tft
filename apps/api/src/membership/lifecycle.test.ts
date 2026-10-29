import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import type { Server } from 'node:http';
import type { Pool } from 'pg';
import type { GrantInput } from './lifecycle.ts';
import type { PlanQuota } from './quota.ts';

// Membership lifecycle and the read API (task #86, docs/MEMBERSHIP-PLAN.md section 3).
//
// Entitlement is a function of stored instants, so the tests read it at chosen
// clocks instead of waiting for a cron: a period that has ended must stop granting
// rights in the same request that notices it. The other half of what is proven here
// is that nothing grants silently - an unreadable plan is an outage, an early
// renewal appends instead of stacking, and an admin action names its author.
//
// Like quota.test.ts, the modules that build a pg Pool are imported inside the test
// so the .env guard below runs first.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../../.env'));
  } catch {
    // No .env — the whole file skips.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);

let pool: Pool;
let lifecycle: typeof import('./lifecycle.ts');
let quota: typeof import('./quota.ts');
let accounts: typeof import('../accounts.ts');
let membershipRoutes: typeof import('./routes.ts');

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const DAY = 86_400_000;
// 2026-11-03T02:00Z is 09:00 in Asia/Ho_Chi_Minh: mid-morning, well inside a VN day
// and well inside a VN month, so a window mismatch shows up as a wrong boundary.
const NOW = Date.parse('2026-11-03T02:00:00.000Z');
// The same instant read as a Vietnamese calendar month.
const VN_MONTH_START = Date.parse('2026-10-31T17:00:00.000Z');
const VN_MONTH_END = Date.parse('2026-11-30T17:00:00.000Z');

/** Every test owns its fallback tier under a code of its own: production's free
 *  plan is one active row per code, and a test that reused that code would either
 *  collide with it or quietly read whatever the developer left behind. */
function useFreeCode(code: string): void {
  process.env.MEMBERSHIP_FREE_PLAN_CODE = code;
}

type PlanSeed = Partial<GrantInput> & {
  code?: string;
  status?: string;
  termDays?: number | null;
  chatPerPeriod?: number;
  chatPerDay?: number;
  priceVnd?: number;
};

const planIds: string[] = [];
let schemaApplied = false;

async function applySchema(): Promise<void> {
  if (schemaApplied) return;
  // Two test processes can reach this DDL at once and Postgres picks one as the
  // deadlock victim; the script is idempotent, so retrying is enough.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await pool.query(await readFile(join(import.meta.dirname, '../schema.sql'), 'utf8'));
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= 3 || !/deadlock|serialized|concurrent access/i.test(message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)));
    }
  }
  schemaApplied = true;
}

async function makeAccount(role: 'user' | 'admin' = 'user'): Promise<{ userId: string; cleanup: () => Promise<void> }> {
  await applySchema();
  const userId = randomUUID();
  await pool.query('INSERT INTO users (id, email, role) VALUES ($1, $2, $3)', [userId, `test-${userId}@example.com`, role]);
  const sessionToken = await accounts.createSession(userId);
  return {
    userId,
    cleanup: async () => {
      await pool.query('DELETE FROM user_sessions WHERE token_hash = $1', [accounts.hashToken(sessionToken)]);
      await pool.query('DELETE FROM membership_events WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM memberships WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM usage_reservations WHERE request_id IN (SELECT id FROM usage_requests WHERE user_id = $1)', [userId]);
      await pool.query('DELETE FROM usage_attempts WHERE request_id IN (SELECT id FROM usage_requests WHERE user_id = $1)', [userId]);
      await pool.query('DELETE FROM usage_requests WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM usage_buckets WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM payment_events WHERE order_id IN (SELECT id FROM payment_orders WHERE user_id = $1)', [userId]);
      await pool.query('DELETE FROM payment_orders WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    },
  };
}

async function insertPlan(seed: PlanSeed = {}): Promise<string> {
  await applySchema();
  const id = randomUUID();
  planIds.push(id);
  await pool.query(
    `INSERT INTO plan_versions (
       id, code, version, label, price_vnd, term_days, status,
       chat_per_period, chat_per_day, stt_seconds_per_period, tts_characters_per_period,
       chat_requests_per_minute, max_concurrent_requests, max_stt_seconds_per_request, max_concurrent_tts_chunks
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      id,
      seed.code ?? `plus-${id.slice(0, 8)}`,
      // Every fixture owns its code, so version 1 never collides with the seeded
      // offers that a developer's database already holds.
      1,
      seed.code ?? 'Plus test',
      seed.priceVnd ?? 99_000,
      'termDays' in seed ? seed.termDays : 30,
      seed.status ?? 'active',
      seed.chatPerPeriod ?? 150,
      seed.chatPerDay ?? 30,
      600,
      5_000,
      6,
      1,
      60,
      2,
    ],
  );
  return id;
}

async function insertOrder(userId: string, planVersionId: string, status = 'paid'): Promise<string> {
  await applySchema();
  const id = randomUUID();
  const code = id.replace(/-/g, '').slice(0, 12);
  await pool.query(
    `INSERT INTO payment_orders (id, user_id, plan_version_id, reference, order_code, amount_vnd, offer_snapshot, provider, account_id, status, expires_at)
     VALUES ($1,$2,$3,$4,$5,99000,'{"label":"Plus test"}','payos','acct-test',$6, now() + interval '1 day')`,
    [id, userId, planVersionId, `TST${code.toUpperCase()}9`, String(BigInt(`0x${code}`)), status],
  );
  return id;
}

async function rowCount(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM (${sql}) q`, params);
  return Number(rows[0]?.n ?? -1);
}

/** A plan that was ever bought, granted or spent against cannot be deleted while
 *  those rows exist: the history trigger refuses it so a report can never re-price
 *  money that was already taken. Cleanup therefore removes the dependents first, in
 *  foreign-key order, and runs only after every account has been torn down. */
async function dropPlans(ids: string[], target: Pool = pool): Promise<void> {
  if (ids.length === 0) return;
  const steps = [
    'DELETE FROM membership_events WHERE plan_version_id = ANY($1)',
    'DELETE FROM memberships WHERE plan_version_id = ANY($1)',
    'DELETE FROM usage_reservations WHERE bucket_id IN (SELECT id FROM usage_buckets WHERE plan_version_id = ANY($1))',
    'DELETE FROM usage_buckets WHERE plan_version_id = ANY($1)',
    'DELETE FROM payment_events WHERE order_id IN (SELECT id FROM payment_orders WHERE plan_version_id = ANY($1))',
    'DELETE FROM payment_orders WHERE plan_version_id = ANY($1)',
    'DELETE FROM plan_versions WHERE id = ANY($1)',
  ];
  for (const sql of steps) await target.query(sql, [ids]).catch(() => {});
}

test('entitlement is read off the clock', { skip: !hasDb }, async (t) => {
  pool = (await import('../db.ts')).pool;
  lifecycle = await import('./lifecycle.ts');
  quota = await import('./quota.ts');
  accounts = await import('../accounts.ts');

  await t.test('with no active fallback tier the answer is unavailable, not free', async () => {
    const kase = await makeAccount();
    const code = `never-activated-${randomUUID().slice(0, 8)}`;
    useFreeCode(code);
    try {
      // A draft row under the configured code exists in every dev database; a plan
      // that has never been put on sale must not be read as one.
      const draft = await insertPlan({ code, status: 'draft', termDays: null });
      const entitlement = await lifecycle.resolveEntitlement(kase.userId, NOW);
      assert.deepEqual(entitlement, { ok: false, reason: 'unavailable' });
      await dropPlans([draft]);
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('the fallback tier gets the Vietnamese calendar month', async () => {
    const kase = await makeAccount();
    const code = `free-${randomUUID().slice(0, 8)}`;
    useFreeCode(code);
    try {
      const freePlan = await insertPlan({ code, termDays: null, chatPerPeriod: 30, chatPerDay: 5, priceVnd: 0, status: 'active' });
      const entitlement = await lifecycle.resolveEntitlement(kase.userId, NOW);
      if (!entitlement.ok) throw new Error('expected an entitlement');
      assert.equal(entitlement.paid, false);
      assert.equal(entitlement.planCode, code);
      assert.equal(entitlement.period, null);
      assert.deepEqual(
        { start: entitlement.plan.periodStart, end: entitlement.plan.periodEnd },
        { start: VN_MONTH_START, end: VN_MONTH_END },
        'the month boundary is Asia/Ho_Chi_Minh expressed as UTC instants',
      );
      assert.equal(entitlement.plan.chatPerPeriod, 30);

      // Same instant, one hour before the boundary: still the October month, so a
      // balance never jumps because a server restarted at midnight.
      const beforeMidnight = await lifecycle.resolveEntitlement(kase.userId, VN_MONTH_END - 1);
      if (!beforeMidnight.ok) throw new Error('expected an entitlement');
      assert.equal(beforeMidnight.plan.periodStart, VN_MONTH_START);
      const after = await lifecycle.resolveEntitlement(kase.userId, VN_MONTH_END);
      if (!after.ok) throw new Error('expected an entitlement');
      assert.ok(after.plan.periodStart >= VN_MONTH_END, 'the next month is a different window');

      await dropPlans([freePlan]);
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('a bought period wins, ends on the clock, and says what comes next', async () => {
    const kase = await makeAccount();
    const code = `free-${randomUUID().slice(0, 8)}`;
    useFreeCode(code);
    try {
      const freePlan = await insertPlan({ code, termDays: null, chatPerPeriod: 30, chatPerDay: 5, priceVnd: 0 });
      const plus = await insertPlan({ termDays: 30, chatPerPeriod: 150 });
      const orderId = await insertOrder(kase.userId, plus);
      const grant = await lifecycle.grantPeriod({
        userId: kase.userId,
        planVersionId: plus,
        source: 'purchase',
        orderId,
        reason: 'payOS payment verified',
        verifiedAt: NOW,
      });
      assert.ok(grant.ok);
      assert.equal(grant.action, 'grant');
      assert.equal(grant.startsAt, NOW);
      assert.equal(grant.endsAt, NOW + 30 * DAY);

      const inside = await lifecycle.resolveEntitlement(kase.userId, NOW);
      if (!inside.ok) throw new Error('expected an entitlement');
      assert.equal(inside.paid, true);
      assert.equal(inside.plan.chatPerPeriod, 150);
      assert.equal(inside.plan.periodStart, NOW);
      assert.equal(inside.plan.periodEnd, NOW + 30 * DAY);
      assert.equal(inside.period?.state, 'active');

      // One second before the boundary the period still runs; at the boundary it is
      // over. Nothing was swept, no cron fired - the interval is the state.
      const lastMs = await lifecycle.resolveEntitlement(kase.userId, NOW + 30 * DAY - 1);
      if (!lastMs.ok) throw new Error('expected an entitlement');
      assert.equal(lastMs.paid, true);
      const expired = await lifecycle.resolveEntitlement(kase.userId, NOW + 30 * DAY);
      if (!expired.ok) throw new Error('expected an entitlement');
      assert.equal(expired.paid, false, 'a period that has ended grants nothing');
      assert.equal(expired.lastPeriodEndsAt, NOW + 30 * DAY, 'and the UI can still say when');

      // A grant made after coverage lapsed opens at the verification instant, and
      // the month between the two periods grants nothing. grantPeriod
      // does not inspect roles - the admin gate is the #91 route's job, and the
      // group below proves the audit keeps the author it is given.
      const future = await lifecycle.grantPeriod({
        userId: kase.userId,
        planVersionId: plus,
        source: 'grant',
        actorId: kase.userId,
        reason: 'support goodwill for a lost week',
        verifiedAt: NOW + 40 * DAY,
      });
      assert.ok(future.ok, JSON.stringify(future));
      // A period granted for a future instant is not scheduled: nothing back-dates
      // coverage, so it starts the moment it is verified and its first day is today.
      // `scheduled` only ever comes from an early renewal, proven in the next group.
      assert.equal(future.state, 'active');
      assert.equal(future.startsAt, NOW + 40 * DAY);
      const beforeItStarts = await lifecycle.resolveEntitlement(kase.userId, NOW + 31 * DAY);
      if (!beforeItStarts.ok) throw new Error('expected an entitlement');
      assert.equal(beforeItStarts.paid, false);
      assert.equal(beforeItStarts.nextPeriodStartsAt, NOW + 40 * DAY);

      await dropPlans([freePlan, plus]);
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('a period whose plan cannot be read is an outage, not a downgrade', async () => {
    const kase = await makeAccount();
    useFreeCode(`free-${randomUUID().slice(0, 8)}`);
    try {
      // A draft plan should never have been sold; if a row says it did, the money
      // and the entitlement are unknowable and the user is told the service is down
      // rather than silently dropped to a smaller allowance.
      const draft = await insertPlan({ status: 'draft' });
      await pool.query(
        `INSERT INTO memberships (user_id, plan_version_id, starts_at, ends_at, status, source, granted_by)
         VALUES ($1, $2, $3, $4, 'active', 'grant', $1)`,
        [kase.userId, draft, new Date(NOW).toISOString(), new Date(NOW + DAY).toISOString()],
      );
      assert.deepEqual(await lifecycle.resolveEntitlement(kase.userId, NOW), { ok: false, reason: 'unavailable' });

      // Retiring an offer stops new sales. It does not take back what was bought.
      await pool.query("UPDATE plan_versions SET status = 'retired' WHERE id = $1", [draft]);
      const retired = await lifecycle.resolveEntitlement(kase.userId, NOW);
      if (!retired.ok) throw new Error('a retired plan must still honour the period it sold');
      assert.equal(retired.paid, true);
      assert.equal(retired.period?.planStatus, 'retired');

      // The same row that a reader must honour is a row nothing new may be minted
      // on: one status, two opposite rules, depending on which side of the sale you
      // are standing on.
      const refused = await lifecycle.grantPeriod({
        userId: kase.userId,
        planVersionId: draft,
        source: 'grant',
        actorId: kase.userId,
        reason: 'trying to sell a retired offer',
        verifiedAt: NOW,
      });
      assert.deepEqual(refused, { ok: false, reason: 'not_sellable' });
      assert.equal(await rowCount('SELECT 1 FROM memberships WHERE user_id = $1', [kase.userId]), 1);
      await dropPlans([draft]);
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('paid time neither adds to nor resets the free month', async () => {
    const kase = await makeAccount();
    const code = `free-${randomUUID().slice(0, 8)}`;
    useFreeCode(code);
    try {
      const freePlan = await insertPlan({ code, termDays: null, chatPerPeriod: 30, chatPerDay: 5 });
      const plus = await insertPlan({ termDays: 30, chatPerPeriod: 150 });
      const entitlement = async (at: number) => {
        const result = await lifecycle.resolveEntitlement(kase.userId, at);
        if (!result.ok) throw new Error('expected an entitlement');
        return result.plan;
      };

      // One free turn used before the purchase.
      const freeTurn = await quota.reserve({
        userId: kase.userId,
        purpose: 'coach_turn',
        idempotencyKey: `free-${randomUUID().slice(0, 8)}`,
        payloadSha256: sha('free turn'),
        plan: await entitlement(NOW),
        units: { chat: 1 },
        now: NOW,
      });
      assert.ok(freeTurn.ok, JSON.stringify(freeTurn));
      await quota.markDispatched(freeTurn.requestId, NOW);
      await quota.settle(freeTurn.requestId, 'completed', { at: NOW, resultReference: 'message-1' });

      const orderId = await insertOrder(kase.userId, plus);
      const grant = await lifecycle.grantPeriod({
        userId: kase.userId,
        planVersionId: plus,
        source: 'purchase',
        orderId,
        reason: 'payOS payment verified',
        verifiedAt: NOW,
      });
      assert.ok(grant.ok);

      // While paid, the period bucket is the paid one and it starts empty: a month
      // of free turns does not top up a period of 150.
      const paidBalances = await quota.balances(kase.userId, await entitlement(NOW + DAY), NOW + DAY);
      assert.equal(paidBalances.chat.allowance, 150);
      assert.equal(paidBalances.chat.consumed, 0);

      // After the refund, the same Vietnamese month is still the one already used.
      await lifecycle.revokePeriod({ membershipId: grant.membershipId, actorId: kase.userId, reason: 'refund confirmed by support' });
      const back = await lifecycle.resolveEntitlement(kase.userId, NOW + DAY);
      if (!back.ok) throw new Error('expected an entitlement');
      assert.equal(back.paid, false, 'revoking ends coverage immediately');
      const after = await quota.balances(kase.userId, back.plan, NOW + DAY);
      assert.equal(after.chat.allowance, 30);
      assert.equal(after.chat.consumed, 1, 'the free month is not reset by paid time');

      await dropPlans([freePlan, plus]);
    } finally {
      await kase.cleanup();
    }
  });
});

test('granting, renewing and revoking', { skip: !hasDb }, async (t) => {
  pool = (await import('../db.ts')).pool;
  lifecycle = await import('./lifecycle.ts');
  accounts = await import('../accounts.ts');

  await t.test('an early renewal appends after the last period instead of stacking', async () => {
    const kase = await makeAccount();
    useFreeCode(`free-${randomUUID().slice(0, 8)}`);
    try {
      const plus = await insertPlan({ termDays: 30 });
      const first = await lifecycle.grantPeriod({
        userId: kase.userId,
        planVersionId: plus,
        source: 'purchase',
        orderId: await insertOrder(kase.userId, plus),
        reason: 'payOS payment verified',
        verifiedAt: NOW,
      });
      assert.ok(first.ok);

      // Day 10 of 30: the user bought the next month early.
      const second = await lifecycle.grantPeriod({
        userId: kase.userId,
        planVersionId: plus,
        source: 'purchase',
        orderId: await insertOrder(kase.userId, plus),
        reason: 'payOS payment verified',
        verifiedAt: NOW + 10 * DAY,
      });
      assert.ok(second.ok);
      assert.equal(second.action, 'renew');
      assert.equal(second.startsAt, NOW + 30 * DAY, 'coverage is joined, never overlapped');
      assert.equal(second.endsAt, NOW + 60 * DAY);
      assert.equal(second.state, 'scheduled');

      const during = await lifecycle.resolveEntitlement(kase.userId, NOW + 10 * DAY);
      if (!during.ok) throw new Error('expected an entitlement');
      assert.equal(during.period?.endsAt, NOW + 30 * DAY);
      assert.equal(during.nextPeriodStartsAt, NOW + 30 * DAY);

      // 225 turns of allowance would be two months sold as one; the account has
      // sixty days of 150-turn periods, spendable one period at a time.
      const buckets = await rowCount('SELECT 1 FROM usage_buckets WHERE user_id = $1 AND period_kind = $2', [kase.userId, 'membership_period']);
      assert.equal(buckets, 0, 'a future period grants nothing until it starts');

      const third = await lifecycle.grantPeriod({
        userId: kase.userId,
        planVersionId: plus,
        source: 'purchase',
        orderId: await insertOrder(kase.userId, plus),
        reason: 'payOS payment verified',
        verifiedAt: NOW + 70 * DAY,
      });
      assert.ok(third.ok);
      assert.equal(third.startsAt, NOW + 70 * DAY, 'a lapse starts coverage at the payment, not back-dated');

      await dropPlans([plus]);
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('two payments verified in the same second still queue', async () => {
    const kase = await makeAccount();
    useFreeCode(`free-${randomUUID().slice(0, 8)}`);
    try {
      const plus = await insertPlan({ termDays: 30 });
      const orders = [await insertOrder(kase.userId, plus), await insertOrder(kase.userId, plus)];
      const results = await Promise.all(
        orders.map((orderId, index) =>
          lifecycle.grantPeriod({
            userId: kase.userId,
            planVersionId: plus,
            source: 'purchase',
            orderId,
            reason: 'two webhooks arrived together',
            verifiedAt: NOW + index,
          }),
        ),
      );
      for (const result of results) assert.ok(result.ok, JSON.stringify(result));
      const spans = results
        .map((result) => (result.ok ? { startsAt: result.startsAt, endsAt: result.endsAt } : null))
        .filter((span): span is { startsAt: number; endsAt: number } => span !== null)
        .sort((a, b) => a.startsAt - b.startsAt);
      assert.equal(spans.length, 2);
      assert.ok(spans[1].startsAt >= spans[0].endsAt, 'the second period begins where the first ended');
      await dropPlans([plus]);
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('a replayed key returns the period it already made', async () => {
    const kase = await makeAccount();
    useFreeCode(`free-${randomUUID().slice(0, 8)}`);
    try {
      const plus = await insertPlan({ termDays: 30 });
      const orderId = await insertOrder(kase.userId, plus);
      const input: GrantInput = {
        userId: kase.userId,
        planVersionId: plus,
        source: 'purchase',
        orderId,
        reason: 'payOS payment verified',
        idempotencyKey: `order:${orderId}`,
        verifiedAt: NOW,
      };
      const first = await lifecycle.grantPeriod(input);
      assert.ok(first.ok);
      assert.equal(first.duplicate, false);
      const replay = await lifecycle.grantPeriod(input);
      assert.ok(replay.ok);
      assert.equal(replay.duplicate, true);
      assert.equal(replay.membershipId, first.membershipId);
      assert.equal(await rowCount('SELECT 1 FROM memberships WHERE user_id = $1', [kase.userId]), 1);
      assert.equal(await rowCount('SELECT 1 FROM membership_events WHERE user_id = $1', [kase.userId]), 1);

      // The same order id cannot mint a second period even under a different key.
      const second = await lifecycle.grantPeriod(input);
      assert.ok(second.ok);
      assert.equal(second.membershipId, first.membershipId);
      assert.equal(await rowCount('SELECT 1 FROM memberships WHERE user_id = $1', [kase.userId]), 1);

      await dropPlans([plus]);
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('money that was not verified cannot buy coverage', async () => {
    const kase = await makeAccount();
    const admin = await makeAccount('admin');
    useFreeCode(`free-${randomUUID().slice(0, 8)}`);
    try {
      const plus = await insertPlan({ termDays: 30 });

      const pending = await lifecycle.grantPeriod({
        userId: kase.userId,
        planVersionId: plus,
        source: 'purchase',
        orderId: await insertOrder(kase.userId, plus, 'pending'),
        reason: 'a webhook that lied',
      });
      assert.deepEqual(pending, { ok: false, reason: 'not_sellable' }, 'a pending order is not money received');

      const otherAccount = await lifecycle.grantPeriod({
        userId: kase.userId,
        planVersionId: plus,
        source: 'purchase',
        orderId: await insertOrder(admin.userId, plus),
        reason: 'an order belonging to someone else',
      });
      assert.deepEqual(otherAccount, { ok: false, reason: 'invalid' });

      const freeAsPeriod = await lifecycle.grantPeriod({
        userId: kase.userId,
        planVersionId: await insertPlan({ termDays: null }),
        source: 'grant',
        actorId: admin.userId,
        reason: 'trying to sell the fallback tier as a period',
      });
      assert.deepEqual(freeAsPeriod, { ok: false, reason: 'not_sellable' }, 'the fallback tier has no period to buy');

      // A grant has to name who made it, in the code and in the database.
      const anonymous = await lifecycle.grantPeriod({ userId: kase.userId, planVersionId: plus, source: 'grant', reason: 'because' });
      assert.deepEqual(anonymous, { ok: false, reason: 'invalid' });
      const unexplained = await lifecycle.grantPeriod({
        userId: kase.userId,
        planVersionId: plus,
        source: 'grant',
        actorId: admin.userId,
        reason: 'ab',
      });
      assert.deepEqual(unexplained, { ok: false, reason: 'invalid' }, 'a two-character reason is not a reason');
      assert.equal(await rowCount('SELECT 1 FROM memberships WHERE user_id = $1', [kase.userId]), 0);

      const sold = await lifecycle.grantPeriod({
        userId: kase.userId,
        planVersionId: plus,
        source: 'grant',
        actorId: admin.userId,
        reason: 'goodwill for a week lost to an outage',
        verifiedAt: NOW,
      });
      assert.ok(sold.ok);
      const { rows } = await pool.query(
        `SELECT e.action, e.source, e.actor_id, e.reason, m.granted_by, m.order_id, u.role AS actor_role
           FROM membership_events e
           JOIN memberships m ON m.id = e.membership_id
           JOIN users u ON u.id = e.actor_id
          WHERE e.user_id = $1`,
        [kase.userId],
      );
      const event = rows[0];
      assert.ok(event);
      assert.equal(event.action, 'grant');
      // The period row says the coverage was hand-made; the event says who
      // authorised it. `grant` and `admin` are not the same column's vocabulary,
      // and the audit reader wants the author.
      assert.equal(event.source, 'admin');
      assert.equal(event.actor_id, admin.userId);
      assert.equal(event.granted_by, admin.userId);
      assert.equal(event.order_id, null, 'a hand-made period never pretends to be revenue');
      assert.equal(event.actor_role, 'admin', 'the audit reads the author from the account table');

      await dropPlans([plus]);
      await admin.cleanup();
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('a refund ends one period and leaves the others alone', async () => {
    const kase = await makeAccount('admin');
    const admin = kase.userId;
    const code = `free-${randomUUID().slice(0, 8)}`;
    useFreeCode(code);
    try {
      // Revoking has to land somewhere: with no fallback tier the answer after the
      // refund would be an outage, and the point of this test is that the account
      // keeps the period it bought afterwards.
      const freePlan = await insertPlan({ code, termDays: null, chatPerPeriod: 30, chatPerDay: 5, priceVnd: 0 });
      const plus = await insertPlan({ termDays: 30 });
      const first = await lifecycle.grantPeriod({
        userId: kase.userId,
        planVersionId: plus,
        source: 'purchase',
        orderId: await insertOrder(kase.userId, plus),
        reason: 'payOS payment verified',
        verifiedAt: NOW,
      });
      assert.ok(first.ok);
      const second = await lifecycle.grantPeriod({
        userId: kase.userId,
        planVersionId: plus,
        source: 'purchase',
        orderId: await insertOrder(kase.userId, plus),
        reason: 'payOS payment verified',
        verifiedAt: NOW + DAY,
      });
      assert.ok(second.ok);

      const revoked = await lifecycle.revokePeriod({
        membershipId: first.ok ? first.membershipId : '',
        actorId: admin,
        reason: 'refund within 7 days, period unused',
        idempotencyKey: `refund:${first.ok ? first.membershipId : ''}`,
      });
      assert.ok(revoked.ok);
      assert.equal(revoked.duplicate, false);
      const again = await lifecycle.revokePeriod({
        membershipId: revoked.membershipId,
        actorId: admin,
        reason: 'the same refund processed twice',
      });
      assert.ok(again.ok);
      assert.equal(again.duplicate, true, 'a second refund of one period mints no second audit row');
      assert.equal(await rowCount('SELECT 1 FROM membership_events WHERE user_id = $1 AND action = $2', [kase.userId, 'revoke']), 1);

      const after = await lifecycle.resolveEntitlement(kase.userId, NOW + 2 * DAY);
      if (!after.ok) throw new Error('expected an entitlement');
      assert.equal(after.paid, false, 'the refunded period stops granting at once');
      assert.equal(after.nextPeriodStartsAt, second.startsAt, 'the period bought afterwards is still theirs');

      const unknown = await lifecycle.revokePeriod({ membershipId: randomUUID(), actorId: admin, reason: 'a period that does not exist' });
      assert.deepEqual(unknown, { ok: false, reason: 'not_found' });

      await dropPlans([freePlan, plus]);
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('lifecycle never touches the account role or the history', async () => {
    const kase = await makeAccount();
    useFreeCode(`free-${randomUUID().slice(0, 8)}`);
    try {
      const plus = await insertPlan({ termDays: 30 });
      await pool.query('INSERT INTO assistant_conversations (id, client_id, user_id, title) VALUES ($1, $2, $3, $4)', [
        randomUUID(),
        `client-${randomUUID().slice(0, 8)}`,
        kase.userId,
        'history that must survive',
      ]);
      const before = await pool.query('SELECT role FROM users WHERE id = $1', [kase.userId]);
      const grant = await lifecycle.grantPeriod({
        userId: kase.userId,
        planVersionId: plus,
        source: 'purchase',
        orderId: await insertOrder(kase.userId, plus),
        reason: 'payOS payment verified',
        verifiedAt: NOW,
      });
      assert.ok(grant.ok);
      await lifecycle.revokePeriod({ membershipId: grant.membershipId, actorId: kase.userId, reason: 'refund confirmed by support' });

      const after = await pool.query('SELECT role FROM users WHERE id = $1', [kase.userId]);
      assert.equal(after.rows[0]?.role, before.rows[0]?.role, 'a period is not a role change');
      assert.equal(await rowCount('SELECT 1 FROM assistant_conversations WHERE user_id = $1', [kase.userId]), 1);
      assert.equal(
        await rowCount('SELECT 1 FROM memberships WHERE user_id = $1 AND status = $2', [kase.userId, 'revoked']),
        1,
        'the revoked period stays readable',
      );
      await pool.query('DELETE FROM assistant_conversations WHERE user_id = $1', [kase.userId]);
      await dropPlans([plus]);
    } finally {
      await kase.cleanup();
    }
  });
});

test('the membership read API', { skip: !hasDb }, async (t) => {
  pool = (await import('../db.ts')).pool;
  lifecycle = await import('./lifecycle.ts');
  accounts = await import('../accounts.ts');
  membershipRoutes = await import('./routes.ts');

  let server: Server | null = null;
  let base = '';
  const cookieFor = new Map<string, string>();

  async function listen(): Promise<void> {
    const app = express();
    app.disable('x-powered-by');
    app.use('/api', membershipRoutes.membershipRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server?.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        base = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  }

  async function get(path: string, userId?: string): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
    const token = userId ? cookieFor.get(userId) : undefined;
    const response = await fetch(`${base}${path}`, { headers: token ? { cookie: `mb_session=${token}` } : {} });
    const text = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { raw: text };
    }
    return { status: response.status, body, headers: response.headers };
  }

  await listen();
  t.after(async () => {
    if (server) await new Promise<void>((resolve, reject) => server?.close((error) => (error ? reject(error) : resolve())));
    for (const token of cookieFor.values()) await pool.query('DELETE FROM user_sessions WHERE token_hash = $1', [accounts.hashToken(token)]);
  });

  await t.test('the price list is public and cacheable, /me answers are not', async () => {
    const kase = await makeAccount();
    const code = `free-${randomUUID().slice(0, 8)}`;
    useFreeCode(code);
    try {
      const freePlan = await insertPlan({ code, termDays: null, chatPerPeriod: 30, chatPerDay: 5, priceVnd: 0 });
      const plus = await insertPlan({ termDays: 30, chatPerPeriod: 150, priceVnd: 99_000 });
      const retired = await insertPlan({ termDays: 30, status: 'retired' });

      const catalog = await get('/api/membership/catalog');
      assert.equal(catalog.status, 200);
      assert.match(String(catalog.headers.get('cache-control')), /public/);
      const offers = (catalog.body.offers ?? []) as Record<string, unknown>[];
      const listed = offers.map((offer) => offer.planVersionId);
      assert.ok(listed.includes(freePlan) && listed.includes(plus), 'active offers are listed');
      assert.ok(!listed.includes(retired), 'a retired offer is not for sale');
      const paid = offers.find((offer) => offer.planVersionId === plus);
      assert.ok(paid);
      assert.equal(paid.buyable, true);
      assert.deepEqual(paid.price, { vnd: 99_000, currency: 'VND' });
      assert.deepEqual((paid.allowances ?? {}) as Record<string, number>, {
        chatPerPeriod: 150,
        chatPerDay: 30,
        sttSecondsPerPeriod: 600,
        ttsCharactersPerPeriod: 5_000,
      });
      const fallback = offers.find((offer) => offer.planVersionId === freePlan);
      assert.ok(fallback);
      assert.equal(fallback.buyable, false, 'there is no such thing as buying the fallback tier');
      assert.ok(!JSON.stringify(catalog.body).includes(kase.userId), 'the catalog carries no account data');

      const anonymous = await get('/api/me/membership');
      assert.equal(anonymous.status, 401);
      assert.equal(anonymous.body.code, 'unauthenticated');

      const token = await accounts.createSession(kase.userId);
      cookieFor.set(kase.userId, token);
      const me = await get('/api/me/membership', kase.userId);
      assert.equal(me.status, 200);
      assert.equal(me.headers.get('cache-control'), 'no-store', 'a balance read from cache is a quota bug');
      const plan = me.body.plan as Record<string, unknown>;
      assert.equal(plan.code, code);
      assert.equal(plan.paid, false);
      assert.equal(me.body.period, null);

      await dropPlans([freePlan, plus, retired]);
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('usage reports what is left, counting what is in flight', async () => {
    const kase = await makeAccount();
    const code = `free-${randomUUID().slice(0, 8)}`;
    useFreeCode(code);
    quota = await import('./quota.ts');
    try {
      const freePlan = await insertPlan({ code, termDays: null, chatPerPeriod: 30, chatPerDay: 5 });
      const plus = await insertPlan({ termDays: 30, chatPerPeriod: 150 });
      const token = await accounts.createSession(kase.userId);
      cookieFor.set(kase.userId, token);

      const before = await get('/api/me/usage', kase.userId);
      assert.equal(before.status, 200);
      assert.equal(before.headers.get('cache-control'), 'no-store');
      const chat = (before.body.metrics as Record<string, Record<string, number>>).chat;
      assert.deepEqual(chat, { allowance: 30, used: 0, reserved: 0, remaining: 30 });

      // A turn that is being answered holds its unit: the next reserve must see it
      // gone, so `remaining` cannot promise a turn the ledger would refuse.
      const entitlement = await lifecycle.resolveEntitlement(kase.userId, Date.now());
      if (!entitlement.ok) throw new Error('expected an entitlement');
      const held = await quota.reserve({
        userId: kase.userId,
        purpose: 'coach_turn',
        idempotencyKey: `api-${randomUUID().slice(0, 8)}`,
        payloadSha256: sha('in flight'),
        plan: entitlement.plan,
        units: { chat: 1 },
      });
      assert.ok(held.ok);
      await quota.markDispatched(held.requestId);
      const during = await get('/api/me/usage', kase.userId);
      const busy = (during.body.metrics as Record<string, Record<string, number>>).chat;
      assert.equal(busy.reserved, 1);
      assert.equal(busy.remaining, 29);
      assert.equal(during.body.requestsInFlight, 1);
      const limits = during.body.limits as Record<string, number | null>;
      assert.equal(limits.maxConcurrentRequests, 1);

      await quota.settle(held.requestId, 'completed', { resultReference: 'message-1' });
      const orderId = await insertOrder(kase.userId, plus);
      const grant = await lifecycle.grantPeriod({
        userId: kase.userId,
        planVersionId: plus,
        source: 'purchase',
        orderId,
        reason: 'payOS payment verified',
      });
      assert.ok(grant.ok);
      const paid = await get('/api/me/usage', kase.userId);
      const paidChat = (paid.body.metrics as Record<string, Record<string, number>>).chat;
      assert.equal(paidChat.allowance, 150, 'the paid period is the window the numbers are read against');
      assert.equal(paidChat.used, 0);
      const membership = await get('/api/me/membership', kase.userId);
      assert.equal((membership.body.plan as Record<string, unknown>).paid, true);
      assert.equal(((membership.body.period ?? {}) as Record<string, unknown>).state, 'active');

      const history = await get('/api/me/membership/history', kase.userId);
      assert.equal(history.status, 200);
      const events = (history.body.events ?? []) as Record<string, unknown>[];
      assert.equal(events.length, 1);
      assert.equal(events[0].action, 'grant');
      assert.equal(events[0].source, 'purchase');
      assert.equal(events[0].reason, 'payOS payment verified');

      await dropPlans([freePlan, plus]);
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('a service that cannot read entitlements says so instead of showing Free', async () => {
    const kase = await makeAccount();
    const code = `never-activated-${randomUUID().slice(0, 8)}`;
    useFreeCode(code);
    try {
      const token = await accounts.createSession(kase.userId);
      cookieFor.set(kase.userId, token);
      for (const path of ['/api/me/membership', '/api/me/usage']) {
        const response = await get(path, kase.userId);
        assert.equal(response.status, 503, `${path}: unavailable is not the same answer as no plan`);
        assert.equal(response.body.code, 'membership_unavailable');
      }

      // History needs no plan to read: it is the account's own record of what it
      // bought and what was done to it. Turning an entitlement outage into an empty
      // history would hide a paid period, which is the opposite of why the other two
      // routes refuse to answer.
      const history = await get('/api/me/membership/history', kase.userId);
      assert.equal(history.status, 200);
      assert.deepEqual(history.body.periods, []);
      assert.deepEqual(history.body.events, []);

      const catalog = await get('/api/membership/catalog');
      assert.equal(catalog.status, 200);
      // A dev database holds other offers, so what this test owns is the absence of
      // the code nothing activated: an unlisted fallback tier is a list, not a failure.
      const offers = (catalog.body.offers ?? null) as Record<string, unknown>[] | null;
      assert.ok(Array.isArray(offers), 'a price list with nothing on sale is still a price list');
      assert.ok(!offers?.some((offer) => offer.code === code));
    } finally {
      await kase.cleanup();
    }
  });
});

after(async () => {
  if (!hasDb) return;
  const { pool: live } = await import('../db.ts');
  // Test-owned offers leave only when nothing references them any more, and a body
  // that aborted mid-run can leave those references behind.
  await dropPlans(planIds, live);
  await live.end();
});
