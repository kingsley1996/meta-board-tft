import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// DB-backed test for the membership/payment/quota schema (task #80,
// docs/MEMBERSHIP-PLAN.md section 5). It asserts the invariants the later tasks
// rely on, so a bug in reserve-settle (#81), fulfilment (#87) or lifecycle (#86)
// cannot be introduced by the schema quietly allowing it.
// Same .env guard as conversation-store.test.ts: dynamic imports keep the pg Pool
// from being created before DATABASE_URL is loaded.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../.env'));
  } catch {
    // No .env — the test below skips.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

/** Postgres error text for a query that must fail, so assertions name the constraint. */
async function errorOf(query: () => Promise<unknown>): Promise<string> {
  return query()
    .then(() => 'query unexpectedly succeeded')
    .catch((error: unknown) => String(error));
}

test('membership and usage schema holds the invariants the ledger depends on', { skip: !hasDb }, async (t) => {
  const { pool } = await import('./db.ts');
  await pool.query(await readFile(join(import.meta.dirname, 'schema.sql'), 'utf8'));

  /** One isolated user + plan + provider account, removed in FK order afterwards. */
  async function makeCase(): Promise<{
    userId: string;
    planId: string;
    code: string;
    accountId: string;
    order: (overrides?: Record<string, unknown>) => Promise<string>;
    cleanup: () => Promise<void>;
  }> {
    const userId = randomUUID();
    const planId = randomUUID();
    const code = `t-${planId.slice(0, 8)}`;
    const accountId = `acct-${planId.slice(0, 8)}`;
    // Every case owns its reference space and a random orderCode base, so no
    // insert can collide with a parallel case or with rows an aborted run left.
    const hex = planId.replace(/-/g, '').toUpperCase();
    const base = 100 + Math.floor(Math.random() * 900);
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `test-${userId}@example.com`]);
    await pool.query(
      `INSERT INTO plan_versions (id, code, version, label, price_vnd, term_days, chat_per_period, chat_per_day)
       VALUES ($1, $2, 1, 'Test Plan', 99000, 30, 150, 30)`,
      [planId, code],
    );
    let sequence = 0;
    const order = async (overrides: Record<string, unknown> = {}) => {
      sequence += 1;
      const id = randomUUID();
      await pool.query(
        `INSERT INTO payment_orders (
           id, user_id, plan_version_id, reference, order_code, amount_vnd, offer_snapshot,
           provider, account_id, created_at, expires_at
         ) VALUES ($1,$2,$3,$4,$5,$6,'{}'::jsonb,$7,$8, now(), now() + interval '1 day')`,
        [
          id,
          userId,
          planId,
          (overrides.reference as string) ?? `MB${hex.slice(0, 10)}${sequence}`,
          (overrides.orderCode as number) ?? base * 10_000_000 + sequence,
          (overrides.amountVnd as number) ?? 99_000,
          (overrides.provider as string) ?? 'sepay',
          (overrides.accountId as string) ?? accountId,
        ],
      );
      return id;
    };
    const cleanup = async () => {
      await pool.query(
        `DELETE FROM usage_reservations WHERE request_id IN (SELECT id FROM usage_requests WHERE user_id = $1)`,
        [userId],
      );
      await pool.query(`DELETE FROM usage_attempts WHERE request_id IN (SELECT id FROM usage_requests WHERE user_id = $1)`, [userId]);
      await pool.query('DELETE FROM usage_requests WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM usage_buckets WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM memberships WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM payment_events WHERE account_id = $1', [accountId]);
      await pool.query('DELETE FROM payment_orders WHERE user_id = $1', [userId]);
      // Every version row this case created shares its code, so no draft leaks
      // out of the suite for the next run to trip over.
      await pool.query('DELETE FROM plan_versions WHERE code = $1', [code]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    };
    return { userId, planId, code, accountId, order, cleanup };
  }

  await t.test('the file is idempotent and the pilot offer seeds once per version', async () => {
    await pool.query(await readFile(join(import.meta.dirname, 'schema.sql'), 'utf8'));
    const seedScript = join(import.meta.dirname, '../seed/membership-plans.ts');
    for (const run of [1, 2]) {
      // Running the real CLI (not a copy of its SQL) is what keeps the seed and
      // this schema honest with each other.
      const { stdout } = await execFileAsync(process.execPath, [seedScript], {
        cwd: join(import.meta.dirname, '..'),
        env: process.env as NodeJS.ProcessEnv,
      });
      assert.match(stdout, /free v1: 1 row\(s\)/, `seed run ${run}`);
      assert.match(stdout, /plus v1: 1 row\(s\)/, `seed run ${run}`);
    }
    const { rows } = await pool.query(
      `SELECT count(*)::int AS versions, bool_and(status = 'draft') AS all_draft,
              count(*) FILTER (WHERE price_vnd = 99000 AND term_days = 30)::int AS plus_rows
         FROM plan_versions WHERE code IN ('free', 'plus')`,
    );
    assert.equal(rows[0].versions, 2, 'two seed runs do not duplicate a version');
    assert.equal(rows[0].all_draft, true, 'both pilot offers stay draft until gate #92');
    assert.equal(rows[0].plus_rows, 1);
  });

  await t.test('an offer is priced and allowed in integers, and only one version sells at a time', async () => {
    const kase = await makeCase();
    try {
      for (const [label, values] of [
        ['negative price', [99_000, -1, 150, 30]],
        ['negative allowance', [99_000, 30, -1, 30]],
        ['negative daily cap', [99_000, 30, 150, -1]],
      ] as const) {
        assert.match(
          await errorOf(() =>
            pool.query(
              `INSERT INTO plan_versions (code, version, label, price_vnd, term_days, chat_per_period, chat_per_day)
               VALUES ($1, $2, 'X', $3, $4, $5, $6)`,
              [kase.code, 2, ...values],
            ),
          ),
          /check constraint/,
          label,
        );
      }
      // Activation is a gate, not a default; and one code has one sellable version.
      await pool.query("UPDATE plan_versions SET status = 'active' WHERE id = $1", [kase.planId]);
      assert.match(
        await errorOf(() =>
          pool.query(
            `INSERT INTO plan_versions (code, version, label, price_vnd, term_days, chat_per_period, chat_per_day, status)
             VALUES ($1, 2, 'Plus v2', 99000, 30, 150, 30, 'active')`,
            [kase.code],
          ),
        ),
        /one_active_per_code/,
      );
      await pool.query("UPDATE plan_versions SET status = 'retired' WHERE id = $1", [kase.planId]);
      await pool.query("INSERT INTO plan_versions (code, version, label, price_vnd, chat_per_period) VALUES ($1, 2, 'v2', 0, 1)", [kase.code]);
      assert.match(
        await errorOf(() =>
          pool.query(
            `INSERT INTO plan_versions (code, version, label, price_vnd, currency, chat_per_period) VALUES ($1, 3, 'v3', 1, 'USD', 1)`,
            [kase.code],
          ),
        ),
        /currency/,
        'a VND-only pilot cannot accept another currency',
      );
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('an offer with history cannot be re-priced or deleted underneath it', async () => {
    const kase = await makeCase();
    try {
      await pool.query(
        `INSERT INTO usage_buckets (id, user_id, metric, period_kind, period_start, period_end, plan_version_id, allowance_units)
         VALUES ($1, $2, 'chat', 'calendar_month', now(), now() + interval '30 days', $3, 30)`,
        [randomUUID(), kase.userId, kase.planId],
      );
      assert.match(
        await errorOf(() => pool.query('UPDATE plan_versions SET price_vnd = 1 WHERE id = $1', [kase.planId])),
        /retire it and insert a new version/,
      );
      assert.match(
        await errorOf(() => pool.query('UPDATE plan_versions SET chat_per_period = 900000 WHERE id = $1', [kase.planId])),
        /retire it and insert a new version/,
      );
      assert.match(await errorOf(() => pool.query('DELETE FROM plan_versions WHERE id = $1', [kase.planId])), /referenced by orders/);
      // Renaming and retiring stay allowed: they change nothing already paid for.
      await pool.query("UPDATE plan_versions SET label = 'Renamed', status = 'retired' WHERE id = $1", [kase.planId]);

      // The guard must not swallow the ordinary case. A BEFORE DELETE trigger that
      // answers the wrong tuple deletes nothing at all, and an offer nobody bought
      // has to be removable or the ledger can never be cleaned up.
      const spare = randomUUID();
      await pool.query(
        `INSERT INTO plan_versions (id, code, version, label, price_vnd, chat_per_period)
         VALUES ($1, $2, 1, 'Spare', 0, 10)`,
        [spare, `spare-${spare.slice(0, 8)}`],
      );
      assert.equal(
        (await pool.query('DELETE FROM plan_versions WHERE id = $1', [spare])).rowCount,
        1,
        'an unreferenced offer deletes',
      );
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('an order pins its provider binding, reference and expiry', async () => {
    const kase = await makeCase();
    try {
      for (const bad of ['abcdef12', 'MB12', 'MB-123456', 'MB1234567890123456789012345']) {
        assert.match(
          await errorOf(() => kase.order({ reference: bad })),
          /reference/,
          `"${bad}" is not a bank-safe reference`,
        );
      }
      const id = await kase.order();
      const { rows } = await pool.query('SELECT provider, account_id, external_id, status FROM payment_orders WHERE id = $1', [id]);
      assert.deepEqual(rows[0], { provider: 'sepay', account_id: kase.accountId, external_id: null, status: 'pending' });
      // The same external id cannot belong to two orders of one account.
      await pool.query('UPDATE payment_orders SET external_id = $2 WHERE id = $1', [id, 'ext-1']);
      const duplicate = await errorOf(() =>
        pool.query(
          `INSERT INTO payment_orders (user_id, plan_version_id, reference, order_code, amount_vnd, offer_snapshot, provider, account_id, external_id, created_at, expires_at)
           VALUES ($1,$2,$3,$4,99000,'{}'::jsonb,'sepay',$5,'ext-1', now(), now() + interval '1 day')`,
          [kase.userId, kase.planId, 'MBZZ9901', 9990002n, kase.accountId],
        ),
      );
      assert.match(duplicate, /provider_external_id/);
      assert.match(
        await errorOf(() =>
          pool.query(
            `INSERT INTO payment_orders (user_id, plan_version_id, reference, order_code, amount_vnd, offer_snapshot, provider, account_id, created_at, expires_at)
             VALUES ($1,$2,'MBZZ9902',9990003,99000,'{}'::jsonb,'sepay',$3, now(), now())`,
            [kase.userId, kase.planId, kase.accountId],
          ),
        ),
        /deadline_in_future/,
      );
      assert.match(
        await errorOf(() =>
          pool.query(
            `INSERT INTO payment_orders (user_id, plan_version_id, reference, order_code, amount_vnd, offer_snapshot, provider, account_id, created_at, expires_at)
             VALUES ($1,$2,'MBZZ9903',9990004,99000,'{}'::jsonb,'viettelpay',$3, now(), now() + interval '1 day')`,
            [kase.userId, kase.planId, kase.accountId],
          ),
        ),
        /provider/,
        'an order cannot pin a provider the adapter layer does not have',
      );
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('the same bank transaction cannot grant twice, and no reference means review', async () => {
    const kase = await makeCase();
    const orderId = await kase.order();
    const event = (overrides: Record<string, unknown> = {}) =>
      pool.query(
        `INSERT INTO payment_events (
           provider, account_id, provider_transaction_id, transaction_reference, order_id,
           event_type, amount_vnd, occurred_at, payload_sha256, receipt, result
         ) VALUES ('sepay', $1, $2, $3, $4, $5, 99000, now(), $6, '{}'::jsonb, $7)`,
        [
          kase.accountId,
          overrides.providerTransactionId ?? '12345',
          overrides.transactionReference === undefined ? 'MB000001' : overrides.transactionReference,
          overrides.orderId === undefined ? orderId : overrides.orderId,
          overrides.eventType ?? 'webhook',
          overrides.payloadSha ?? sha('{"amount":99000}'),
          overrides.result ?? 'granted',
        ],
      );
    try {
      await event();
      // Webhook id (numeric) and REST id (UUID) differ for the same bank transfer,
      // so the reference index — not the transaction index — is what stops a
      // reconciliation lookup from paying the order out a second time.
      assert.match(await errorOf(() => event({ providerTransactionId: randomUUID(), eventType: 'lookup' })), /bank_reference/);
      assert.match(await errorOf(() => event({ providerTransactionId: '12345' })), /provider_transaction/);
      // No bank reference => nothing to reconcile against => it cannot be a grant.
      assert.match(
        await errorOf(() => event({ providerTransactionId: '67890', transactionReference: null })),
        /granted_is_reconcilable/,
      );
      assert.match(
        await errorOf(() => event({ providerTransactionId: '67891', orderId: null })),
        /granted_has_order/,
      );
      // Such a row is still worth keeping, as review, for manual audit.
      await event({ providerTransactionId: '67892', transactionReference: null, orderId: null, result: 'review' });
      assert.match(await errorOf(() => event({ providerTransactionId: '67893', payloadSha: 'not-a-hash' })), /payload_sha256/);
      assert.match(
        await errorOf(() => event({ providerTransactionId: '67894', eventType: 'guess' })),
        /event_type/,
      );
      // Zero or negative money is never a receipt, even from a signed webhook.
      assert.match(
        await errorOf(() =>
          pool.query(
            `INSERT INTO payment_events (provider, account_id, provider_transaction_id, order_id, event_type, amount_vnd, occurred_at, payload_sha256, receipt)
             VALUES ('sepay', $1, '67895', $2, 'webhook', 0, now(), $3, '{}'::jsonb)`,
            [kase.accountId, orderId, sha('x')],
          ),
        ),
        /amount_vnd/,
      );
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('membership coverage is interval-based and each order grants at most one period', async () => {
    const kase = await makeCase();
    const orderId = await kase.order();
    const start = '2026-11-01T00:00:00.000Z';
    const grant = (overrides: Record<string, unknown> = {}) =>
      pool.query(
        `INSERT INTO memberships (id, user_id, plan_version_id, starts_at, ends_at, source, order_id, granted_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          randomUUID(),
          kase.userId,
          kase.planId,
          overrides.startsAt ?? start,
          overrides.endsAt ?? '2026-12-01T00:00:00.000Z',
          overrides.source ?? 'purchase',
          overrides.orderId === undefined ? orderId : overrides.orderId,
          overrides.grantedBy,
        ],
      );
    try {
      await grant();
      assert.match(await errorOf(() => grant()), /memberships_order_idx/, 'one verified order cannot mint two periods');
      assert.match(await errorOf(() => grant({ startsAt: '2026-12-01T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z', orderId: null })), /period_is_forward/);
      assert.match(await errorOf(() => grant({ source: 'grant', orderId: null })), /grant_has_author/, 'a hand-made period needs an admin');
      assert.match(
        await errorOf(() => grant({ grantedBy: kase.userId })),
        /grant_has_author/,
        'a row cannot be both a purchase and a hand-made grant',
      );
      const { rows } = await pool.query('SELECT status, source FROM memberships WHERE user_id = $1', [kase.userId]);
      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0], { status: 'active', source: 'purchase' });
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('a bucket balance never goes negative, even from a bad settle', async () => {
    const kase = await makeCase();
    const bucketId = randomUUID();
    await pool.query(
      `INSERT INTO usage_buckets (id, user_id, metric, period_kind, period_start, period_end, plan_version_id, allowance_units, consumed_units, reserved_units)
       VALUES ($1,$2,'chat','calendar_month',$3,$4,$5,30,25,5)`,
      [bucketId, kase.userId, '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z', kase.planId],
    );
    try {
      assert.match(
        await errorOf(() => pool.query('UPDATE usage_buckets SET consumed_units = 26 WHERE id = $1', [bucketId])),
        /balance_never_negative/,
      );
      assert.match(await errorOf(() => pool.query('UPDATE usage_buckets SET reserved_units = -1 WHERE id = $1', [bucketId])), /reserved_units/);
      assert.match(
        await errorOf(() =>
          pool.query(
            `INSERT INTO usage_buckets (id, user_id, metric, period_kind, period_start, period_end, plan_version_id, allowance_units)
             VALUES ($1,$2,'chat','calendar_month',$3,$4,$5,-1)`,
            [randomUUID(), kase.userId, '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z', kase.planId],
          ),
        ),
        /allowance_units/,
      );
      // A monthly and a daily bucket for the same metric coexist; a zero-allowance
      // bucket models a locked feature (Free has no STT).
      await pool.query(
        `INSERT INTO usage_buckets (id, user_id, metric, period_kind, period_start, period_end, plan_version_id, allowance_units)
         VALUES ($1,$2,'chat','calendar_day',$3,$4,$5,5)`,
        [randomUUID(), kase.userId, '2026-11-03T00:00:00.000Z', '2026-11-04T00:00:00.000Z', kase.planId],
      );
      await pool.query(
        `INSERT INTO usage_buckets (id, user_id, metric, period_kind, period_start, period_end, plan_version_id, allowance_units)
         VALUES ($1,$2,'stt_seconds','membership_period',$3,$4,$5,0)`,
        [randomUUID(), kase.userId, '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z', kase.planId],
      );
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM usage_buckets WHERE user_id = $1', [kase.userId])).rows[0].n, 3);
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('a request is idempotent per account and its status records what happened', async () => {
    const kase = await makeCase();
    const other = await makeCase();
    const key = `idem-${randomUUID().slice(0, 12)}`;
    const reserve = (userId = kase.userId, idempotencyKey = key, payloadHash = sha('{"query":"a"}')) =>
      pool.query(
        `INSERT INTO usage_requests (id, user_id, idempotency_key, payload_sha256, purpose, status, reserve_expires_at)
         VALUES ($1,$2,$3,$4,'coach_turn','reserved', now() + interval '10 minutes')`,
        [randomUUID(), userId, idempotencyKey, payloadHash],
      );
    try {
      await reserve();
      assert.match(
        await errorOf(() => reserve(kase.userId, key, sha('{"query":"b"}'))),
        /idempotency_key/,
        'the same key with a different payload must conflict, not debit twice',
      );
      await reserve(other.userId);
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM usage_requests WHERE idempotency_key = $1', [key]);
      assert.equal(rows[0].n, 2, 'two accounts may reuse the same key string');
      const requestId = (await pool.query('SELECT id FROM usage_requests WHERE user_id = $1', [kase.userId])).rows[0].id;
      assert.match(
        await errorOf(() => pool.query("UPDATE usage_requests SET status = 'dispatched' WHERE id = $1", [requestId])),
        /dispatched_has_time/,
      );
      assert.match(
        await errorOf(() => pool.query("UPDATE usage_requests SET status = 'completed' WHERE id = $1", [requestId])),
        /completed_is_settled/,
        'a completed turn must show when it was settled',
      );
      assert.match(
        await errorOf(() => pool.query("UPDATE usage_requests SET status = 'reserved', settled_at = now() WHERE id = $1", [requestId])),
        /settled_is_terminal/,
      );
      assert.match(
        await errorOf(() => reserve(kase.userId, 'short')),
        /idempotency_key/,
        'a short key is too easy to collide',
      );
      // A transcript that becomes a query belongs to the same user turn.
      await pool.query(
        `INSERT INTO usage_requests (id, user_id, idempotency_key, payload_sha256, purpose, turn_request_id, status, reserve_expires_at)
         VALUES ($1,$2,$3,$4,'stt_transcribe',$5,'reserved', now() + interval '10 minutes')`,
        [randomUUID(), kase.userId, `idem-${randomUUID().slice(0, 12)}`, sha('audio'), requestId],
      );
    } finally {
      await kase.cleanup();
      await other.cleanup();
    }
  });

  await t.test('reservations follow the request while the bucket outlives it', async () => {
    const kase = await makeCase();
    const bucketId = randomUUID();
    const requestId = randomUUID();
    await pool.query(
      `INSERT INTO usage_buckets (id, user_id, metric, period_kind, period_start, period_end, plan_version_id, allowance_units, reserved_units)
       VALUES ($1,$2,'tts_characters','membership_period',$3,$4,$5,5000,40)`,
      [bucketId, kase.userId, '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z', kase.planId],
    );
    await pool.query(
      `INSERT INTO usage_requests (id, user_id, idempotency_key, payload_sha256, purpose, status, reserve_expires_at)
       VALUES ($1,$2,$3,$4,'tts_synthesize','reserved', now() + interval '10 minutes')`,
      [requestId, kase.userId, `idem-${randomUUID().slice(0, 12)}`, sha('chunk-0')],
    );
    try {
      await pool.query("INSERT INTO usage_reservations (request_id, bucket_id, units) VALUES ($1,$2,40)", [requestId, bucketId]);
      assert.match(
        await errorOf(() => pool.query("INSERT INTO usage_reservations (request_id, bucket_id, units) VALUES ($1,$2,0)", [requestId, bucketId])),
        /units_check/,
      );
      assert.match(
        await errorOf(() => pool.query("INSERT INTO usage_reservations (request_id, bucket_id, units) VALUES ($1,$2,10)", [requestId, bucketId])),
        /request_id_bucket_id_key/,
        'one request reserves each bucket once',
      );
      assert.match(
        await errorOf(() => pool.query("UPDATE usage_reservations SET state = 'consumed' WHERE request_id = $1", [requestId])),
        /state/,
      );
      await pool.query('DELETE FROM usage_requests WHERE id = $1', [requestId]);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM usage_reservations WHERE bucket_id = $1', [bucketId])).rows[0].n, 0);
      assert.equal((await pool.query('SELECT 1 FROM usage_buckets WHERE id = $1', [bucketId])).rowCount, 1, 'ledger history outlives the request');
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('every provider attempt is recorded, with unknown cost kept unknown', async () => {
    const kase = await makeCase();
    const requestId = randomUUID();
    await pool.query(
      `INSERT INTO usage_requests (id, user_id, idempotency_key, payload_sha256, purpose, status, reserve_expires_at)
       VALUES ($1,$2,$3,$4,'coach_turn','needs_recovery', now() + interval '10 minutes')`,
      [requestId, kase.userId, `idem-${randomUUID().slice(0, 12)}`, sha('turn')],
    );
    const attempt = (overrides: Record<string, unknown> = {}) =>
      pool.query(
        `INSERT INTO usage_attempts (request_id, attempt, provider, model, dispatch_state, billed_quantity, billed_unit, cost_micro_vnd, tariff_version, outcome)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          requestId,
          overrides.attempt ?? 1,
          overrides.provider ?? 'deepgram',
          overrides.model ?? 'nova-3',
          overrides.dispatchState ?? 'completed',
          'billedQuantity' in overrides ? overrides.billedQuantity : 12,
          overrides.billedUnit ?? 'second',
          'costMicroVnd' in overrides ? overrides.costMicroVnd : 4800,
          'tariffVersion' in overrides ? overrides.tariffVersion : '2026-10',
          overrides.outcome ?? 'success',
        ],
      );
    try {
      await attempt();
      // The line key is (attempt, unit), so the same unit twice under one call is the
      // duplicate - which is what lets one LLM answer hold two billing lines.
      assert.match(await errorOf(() => attempt({ provider: 'groq' })), /request_line_idx/, 'one billing line per unit per attempt');
      await attempt({ attempt: 2, provider: 'groq', dispatchState: 'unknown', outcome: 'unknown' });
      assert.match(await errorOf(() => attempt({ attempt: 3, dispatchState: 'guessed' })), /dispatch_state/);
      assert.match(
        await errorOf(() => attempt({ attempt: 3, billedQuantity: null })),
        /quantity_has_unit/,
      );
      assert.match(
        await errorOf(() => attempt({ attempt: 3, costMicroVnd: 5000, tariffVersion: null })),
        /cost_has_tariff/,
        'a number without a price sheet cannot be re-costed later',
      );
      // Unknown cost is not zero cost: it has to be readable as absent.
      const { rows } = await pool.query(
        'SELECT dispatch_state, cost_micro_vnd, tariff_version FROM usage_attempts WHERE request_id = $1 ORDER BY attempt',
        [requestId],
      );
      assert.equal(rows.length, 2);
      assert.equal(rows[1].dispatch_state, 'unknown');
      const unknownCost = await pool.query(
        `INSERT INTO usage_attempts (request_id, attempt, provider, dispatch_state, cost_micro_vnd, outcome)
         VALUES ($1, 4, 'vieneu', 'unknown', NULL, 'unknown') RETURNING cost_micro_vnd IS NULL AS cost_is_null`,
        [requestId],
      );
      assert.equal(unknownCost.rows[0].cost_is_null, true);
      assert.match(
        await errorOf(() =>
          pool.query(
            `INSERT INTO usage_attempts (request_id, attempt, provider, dispatch_state, started_at, finished_at)
             VALUES ($1, 5, 'vieneu', 'unknown', '2026-11-01T00:00:00Z', '2026-10-31T00:00:00Z')`,
            [requestId],
          ),
        ),
        /time_order/,
      );
    } finally {
      await kase.cleanup();
    }
  });

  await t.test('the ledger survives deleting chat history but not deleting an account', async () => {
    const kase = await makeCase();
    const { userId } = kase;
    const conversationId = randomUUID();
    try {
      await pool.query('INSERT INTO assistant_conversations (id, client_id, user_id) VALUES ($1, $2, $3)', [conversationId, 'client-1', userId]);
      await pool.query(
        `INSERT INTO usage_buckets (id, user_id, metric, period_kind, period_start, period_end, plan_version_id, allowance_units, consumed_units)
         VALUES ($1,$2,'chat','calendar_month',$3,$4,$5,30,4)`,
        [randomUUID(), userId, '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z', kase.planId],
      );
      const orderId = await kase.order();
      await pool.query(
        `INSERT INTO memberships (id, user_id, plan_version_id, starts_at, ends_at, source, order_id)
         VALUES ($1,$2,$3,'2026-11-01T00:00:00Z','2026-12-01T00:00:00Z','purchase',$4)`,
        [randomUUID(), userId, kase.planId, orderId],
      );
      await pool.query('DELETE FROM assistant_conversations WHERE id = $1', [conversationId]);
      const { rows } = await pool.query(
        'SELECT (SELECT count(*) FROM usage_buckets WHERE user_id = $1) AS buckets, (SELECT count(*) FROM memberships WHERE user_id = $1) AS periods',
        [userId],
      );
      assert.deepEqual(rows[0], { buckets: '1', periods: '1' }, 'deleting history cannot touch the ledger');
      assert.match(await errorOf(() => pool.query('DELETE FROM users WHERE id = $1', [userId])), /user_id_fkey/);
    } finally {
      await kase.cleanup();
    }
  });
});
