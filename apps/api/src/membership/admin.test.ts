import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import type { Server } from 'node:http';
import type { Pool } from 'pg';

// Membership admin console (task #91).
//
// These routes are the operator's side of the pilot: see every order, refund one
// that spent nothing, mint a term by hand, and read the append-only audit. The
// role check is repeated inside the router, so these tests mount it without the
// site-wide guard and still expect a guest to be refused.

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../../.env'));
  } catch {
    // No .env — the whole file skips.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);

let pool: Pool;
let accounts: typeof import('../accounts.ts');
let adminRoutes: typeof import('./admin-routes.ts');

const planIds: string[] = [];
let schemaApplied = false;

async function applySchema(): Promise<void> {
  if (schemaApplied) return;
  await pool.query(await readFile(join(import.meta.dirname, '../schema.sql'), 'utf8'));
  schemaApplied = true;
}

async function makeAccount(role: 'user' | 'admin' = 'user'): Promise<{ userId: string; email: string; token: string; cleanup: () => Promise<void> }> {
  await applySchema();
  const userId = randomUUID();
  const email = `${role}-${userId}@example.com`;
  await pool.query('INSERT INTO users (id, email, role) VALUES ($1, $2, $3)', [userId, email, role]);
  const token = await accounts.createSession(userId);
  return {
    userId,
    email,
    token,
    cleanup: async () => {
      await pool.query('DELETE FROM payment_events WHERE order_id IN (SELECT id FROM payment_orders WHERE user_id = $1)', [userId]);
      await pool.query('DELETE FROM membership_events WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM memberships WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM payment_orders WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM usage_reservations WHERE request_id IN (SELECT id FROM usage_requests WHERE user_id = $1)', [userId]);
      await pool.query('DELETE FROM usage_attempts WHERE request_id IN (SELECT id FROM usage_requests WHERE user_id = $1)', [userId]);
      await pool.query('DELETE FROM usage_requests WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM usage_buckets WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    },
  };
}

async function insertPlan(seed: { status?: string; termDays?: number | null; priceVnd?: number } = {}): Promise<{ id: string; code: string }> {
  await applySchema();
  const id = randomUUID();
  planIds.push(id);
  const code = `plus-${id.slice(0, 8)}`;
  await pool.query(
    `INSERT INTO plan_versions (
       id, code, version, label, price_vnd, term_days, status,
       chat_per_period, chat_per_day, stt_seconds_per_period, tts_characters_per_period,
       chat_requests_per_minute, max_concurrent_requests, max_stt_seconds_per_request, max_concurrent_tts_chunks
     ) VALUES ($1,$2,1,$3,$4,$5,$6,150,30,600,5000,6,1,60,2)`,
    [id, code, 'Plus test', seed.priceVnd ?? 99_000, 'termDays' in seed ? seed.termDays : 30, seed.status ?? 'active'],
  );
  return { id, code };
}

function snapshot(planId: string, termDays = 30) {
  return {
    plan: { version: 1, code: 'plus', label: 'Plus test', priceVnd: 99_000, currency: 'VND', termDays, allowances: {} },
    planVersionId: planId,
  };
}

async function insertOrder(
  userId: string,
  planVersionId: string,
  seed: { status?: string; paidVnd?: number; settledAt?: string; expiresAt?: string; createdAt?: string } = {},
): Promise<{ id: string; reference: string }> {
  const id = randomUUID();
  const reference = `MB${String(Date.now()).slice(-10)}${Math.floor(Math.random() * 90 + 10)}`;
  const orderCode = Number(String(Date.now()).slice(-12)) * 10 + Math.floor(Math.random() * 9);
  const status = seed.status ?? 'pending';
  const paid = seed.paidVnd ?? (status === 'paid' ? 99_000 : null);
  const paidAt = seed.settledAt ?? (status === 'paid' ? new Date().toISOString() : null);
  const createdAt = seed.createdAt ?? new Date().toISOString();
  await pool.query(
    `INSERT INTO payment_orders
       (id, user_id, plan_version_id, reference, order_code, amount_vnd, offer_snapshot, provider, account_id,
        status, paid_vnd, settled_at, fulfilled_at, created_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,99000,$6,'sepay','acct-test',$7,$8,$9,$9,$10,$11)`,
    [
      id,
      userId,
      planVersionId,
      reference,
      orderCode,
      JSON.stringify(snapshot(planVersionId)),
      status,
      paid,
      paidAt,
      createdAt,
      seed.expiresAt ?? new Date(Date.now() + 15 * 60_000).toISOString(),
    ],
  );
  return { id, reference };
}

async function insertPeriod(userId: string, planVersionId: string, orderId: string | null, seed: { daysAgo?: number } = {}): Promise<string> {
  const id = randomUUID();
  const start = new Date(Date.now() - (seed.daysAgo ?? 1) * 86_400_000);
  const end = new Date(start.getTime() + 30 * 86_400_000);
  await pool.query(
    `INSERT INTO memberships (id, user_id, plan_version_id, starts_at, ends_at, status, source, order_id)
     VALUES ($1,$2,$3,$4,$5,'active',$6,$7)`,
    [id, userId, planVersionId, start.toISOString(), end.toISOString(), orderId ? 'purchase' : 'grant', orderId],
  );
  return id;
}

async function dropPlans(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await pool.query(`DELETE FROM admin_audit WHERE detail->>'planVersionId' = ANY($1) OR detail->>'sourceId' = ANY($1)`, [ids]);
  await pool.query('DELETE FROM membership_events WHERE plan_version_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM memberships WHERE plan_version_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM payment_events WHERE order_id IN (SELECT id FROM payment_orders WHERE plan_version_id = ANY($1))', [ids]);
  await pool.query('DELETE FROM payment_orders WHERE plan_version_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM usage_buckets WHERE plan_version_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM plan_versions WHERE id = ANY($1)', [ids]);
}

test('membership admin console', { skip: !hasDb }, async (t) => {
  pool = (await import('../db.ts')).pool;
  accounts = await import('../accounts.ts');
  adminRoutes = await import('./admin-routes.ts');

  let server: Server | null = null;
  let base = '';
  await new Promise<void>((resolve) => {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json());
    app.use('/api/admin/membership', adminRoutes.adminMembershipRouter);
    server = app.listen(0, '127.0.0.1', () => {
      const address = server?.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      base = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
  t.after(async () => {
    if (server) await new Promise<void>((resolve, reject) => server?.close((error) => (error ? reject(error) : resolve())));
  });

  async function call(
    method: string,
    path: string,
    options: { token?: string; json?: unknown; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.token) headers.cookie = `mb_session=${options.token}`;
    const init: RequestInit = { method, headers };
    if (options.json !== undefined) {
      init.body = JSON.stringify(options.json);
      headers['content-type'] = 'application/json';
    }
    const response = await fetch(`${base}${path}`, init);
    const text = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { raw: text };
    }
    return { status: response.status, body };
  }

  await t.test('only an admin session reaches the console', async () => {
    const member = await makeAccount('user');
    try {
      assert.equal((await call('GET', '/api/admin/membership/orders')).status, 401);
      assert.equal((await call('GET', '/api/admin/membership/orders', { token: member.token })).status, 403);
      const forbiddenGrant = await call('POST', '/api/admin/membership/grants', {
        token: member.token,
        json: { email: member.email, planCode: 'plus', reason: 'granted by mistake' },
        headers: { 'x-request-key': `denied-${randomUUID()}` },
      });
      assert.equal(forbiddenGrant.status, 403);
      assert.equal(Number((await pool.query('SELECT count(*) FROM membership_events WHERE user_id = $1', [member.userId])).rows[0].count), 0);
    } finally {
      await member.cleanup();
    }
  });

  await t.test('the list reports the effective status, account and stats', async () => {
    const admin = await makeAccount('admin');
    const buyer = await makeAccount('user');
    const plan = await insertPlan();
    try {
      const before = (await call('GET', '/api/admin/membership/orders', { token: admin.token })).body.stats as Record<string, unknown>;
      const open = await insertOrder(buyer.userId, plan.id);
      const lapsed = await insertOrder(buyer.userId, plan.id, {
        createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      const paid = await insertOrder(buyer.userId, plan.id, { status: 'paid' });
      await insertPeriod(buyer.userId, plan.id, paid.id);

      const all = await call('GET', '/api/admin/membership/orders', { token: admin.token });
      assert.equal(all.status, 200);
      const orders = all.body.orders as Array<Record<string, unknown>>;
      const byId = new Map(orders.map((order) => [String(order.id), order]));
      assert.equal((byId.get(open.id) as Record<string, unknown>).status, 'pending');
      assert.equal((byId.get(lapsed.id) as Record<string, unknown>).status, 'expired');
      assert.equal((byId.get(paid.id) as Record<string, unknown>).status, 'paid');
      assert.equal((byId.get(paid.id) as Record<string, unknown>).account ? ((byId.get(paid.id) as Record<string, unknown>).account as Record<string, unknown>).email : null, buyer.email);
      assert.equal(((byId.get(paid.id) as Record<string, unknown>).membership as Record<string, unknown>).status, 'active');

      const expiredOnly = await call('GET', `/api/admin/membership/orders?status=expired&q=${buyer.email}`, { token: admin.token });
      assert.deepEqual((expiredOnly.body.orders as Array<Record<string, unknown>>).map((order) => order.id), [lapsed.id]);

      const searched = await call('GET', `/api/admin/membership/orders?q=${open.reference}`, { token: admin.token });
      assert.deepEqual((searched.body.orders as Array<Record<string, unknown>>).map((order) => order.id), [open.id]);

      const stats = all.body.stats as Record<string, unknown>;
      assert.equal(Number(stats.pending) - Number(before.pending), 1);
      assert.equal(Number(stats.paid30) - Number(before.paid30), 1);
      assert.equal(Number(stats.revenue30) - Number(before.revenue30), 99_000);
      assert.equal(Number(stats.activeMembers) - Number(before.activeMembers), 1);
    } finally {
      await buyer.cleanup();
      await admin.cleanup();
      await dropPlans([plan.id]);
    }
  });

  await t.test('a refund ends an unused paid period and refuses every later attempt', async () => {
    const admin = await makeAccount('admin');
    const buyer = await makeAccount('user');
    const plan = await insertPlan();
    try {
      const paid = await insertOrder(buyer.userId, plan.id, { status: 'paid' });
      const membershipId = await insertPeriod(buyer.userId, plan.id, paid.id);

      const refunded = await call('POST', `/api/admin/membership/orders/${paid.id}/refund`, {
        token: admin.token,
        json: { reason: 'customer asked within the window' },
      });
      assert.equal(refunded.status, 200);
      assert.equal(refunded.body.membershipId, membershipId);

      const period = await pool.query('SELECT status FROM memberships WHERE id = $1', [membershipId]);
      assert.equal(period.rows[0].status, 'revoked');
      const audit = await pool.query(
        `SELECT action, source, actor_id, reason FROM membership_events WHERE membership_id = $1`,
        [membershipId],
      );
      assert.equal(audit.rows.length, 1);
      assert.equal(audit.rows[0].action, 'revoke');
      assert.equal(audit.rows[0].source, 'admin');
      assert.equal(audit.rows[0].actor_id, admin.userId);

      const again = await call('POST', `/api/admin/membership/orders/${paid.id}/refund`, {
        token: admin.token,
        json: { reason: 'customer asked within the window' },
      });
      assert.equal(again.status, 409);
      assert.equal(again.body.code, 'membership_missing');

      const old = await insertOrder(buyer.userId, plan.id, {
        status: 'paid',
        settledAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
      });
      await insertPeriod(buyer.userId, plan.id, old.id, { daysAgo: 8 });
      const late = await call('POST', `/api/admin/membership/orders/${old.id}/refund`, {
        token: admin.token,
        json: { reason: 'too late for the pilot window' },
      });
      assert.equal(late.status, 409);
      assert.equal(late.body.code, 'refund_window_closed');

      const missing = await call('POST', `/api/admin/membership/orders/${randomUUID()}/refund`, {
        token: admin.token,
        json: { reason: 'not a real order' },
      });
      assert.equal(missing.status, 404);
    } finally {
      await buyer.cleanup();
      await admin.cleanup();
      await dropPlans([plan.id]);
    }
  });

  await t.test('a hand grant needs a real account, a reason, and one period per key', async () => {
    const admin = await makeAccount('admin');
    const buyer = await makeAccount('user');
    const plan = await insertPlan();
    try {
      const key = `grant-${randomUUID()}`;
      const granted = await call('POST', '/api/admin/membership/grants', {
        token: admin.token,
        json: { email: buyer.email, planCode: plan.code, reason: 'pilot welcome term' },
        headers: { 'x-request-key': key },
      });
      assert.equal(granted.status, 200);
      assert.equal(granted.body.duplicate, false);
      assert.equal(granted.body.state, 'active');
      assert.equal(((granted.body.account as Record<string, unknown>).email), buyer.email);

      const replay = await call('POST', '/api/admin/membership/grants', {
        token: admin.token,
        json: { email: buyer.email, planCode: plan.code, reason: 'pilot welcome term' },
        headers: { 'x-request-key': key },
      });
      assert.equal(replay.status, 200);
      assert.equal(replay.body.duplicate, true);
      assert.equal(replay.body.membershipId, granted.body.membershipId);
      assert.equal(Number((await pool.query('SELECT count(*) FROM memberships WHERE user_id = $1', [buyer.userId])).rows[0].count), 1);

      const audit = await pool.query(
        `SELECT action, source, actor_id, reason FROM membership_events WHERE user_id = $1`,
        [buyer.userId],
      );
      assert.equal(audit.rows.length, 1);
      assert.equal(audit.rows[0].action, 'grant');
      assert.equal(audit.rows[0].source, 'admin');
      assert.equal(audit.rows[0].actor_id, admin.userId);
      assert.equal(audit.rows[0].reason, 'pilot welcome term');

      const unknown = await call('POST', '/api/admin/membership/grants', {
        token: admin.token,
        json: { email: 'nobody@example.invalid', planCode: plan.code, reason: 'real reason' },
        headers: { 'x-request-key': `grant-${randomUUID()}` },
      });
      assert.equal(unknown.status, 404);

      const noReason = await call('POST', '/api/admin/membership/grants', {
        token: admin.token,
        json: { email: buyer.email, planCode: plan.code, reason: '' },
        headers: { 'x-request-key': `grant-${randomUUID()}` },
      });
      assert.equal(noReason.status, 400);
      assert.equal(noReason.body.code, 'invalid_reason');

      const noKey = await call('POST', '/api/admin/membership/grants', {
        token: admin.token,
        json: { email: buyer.email, planCode: plan.code, reason: 'real reason' },
      });
      assert.equal(noKey.status, 400);
      assert.equal(noKey.body.code, 'invalid_request_key');
    } finally {
      await buyer.cleanup();
      await admin.cleanup();
      await dropPlans([plan.id]);
    }
  });

  await t.test('the plan editor is admin-only on every verb', async () => {
    const member = await makeAccount('user');
    try {
      assert.equal((await call('GET', '/api/admin/membership/plans')).status, 401);
      assert.equal((await call('GET', '/api/admin/membership/plans', { token: member.token })).status, 403);
      assert.equal(
        (await call('POST', '/api/admin/membership/plans', { token: member.token, json: { sourceId: randomUUID(), priceVnd: 1 } })).status,
        403,
      );
      assert.equal((await call('POST', `/api/admin/membership/plans/${randomUUID()}/activate`, { token: member.token })).status, 403);
    } finally {
      await member.cleanup();
    }
  });

  await t.test('a new version is a draft until activated, and history is never re-priced', async () => {
    const admin = await makeAccount('admin');
    const buyer = await makeAccount('user');
    const plan = await insertPlan({ priceVnd: 99_000 });
    const extra: string[] = [];
    const activeOf = async (code: string): Promise<string | null> => {
      const { rows } = await pool.query(`SELECT id FROM plan_versions WHERE code = $1 AND status = 'active'`, [code]);
      return rows[0]?.id ?? null;
    };
    try {
      const listed = await call('GET', '/api/admin/membership/plans', { token: admin.token });
      assert.equal(listed.status, 200);
      const mine = (listed.body.plans as Array<Record<string, unknown>>).find((entry) => entry.code === plan.code);
      assert.equal(mine?.version, 1);
      assert.equal(mine?.status, 'active');
      assert.deepEqual(mine?.history, { orders: 0, memberships: 0, buckets: 0 });

      const invalid = await call('POST', '/api/admin/membership/plans', {
        token: admin.token,
        json: { sourceId: plan.id, priceVnd: -1, termDays: 30 },
      });
      assert.equal(invalid.status, 400);
      assert.equal(invalid.body.code, 'invalid_plan');

      const badTerm = await call('POST', '/api/admin/membership/plans', {
        token: admin.token,
        json: { sourceId: plan.id, priceVnd: 129_000, termDays: 0 },
      });
      assert.equal(badTerm.status, 400);
      assert.equal(badTerm.body.code, 'invalid_plan');

      const missing = await call('POST', '/api/admin/membership/plans', {
        token: admin.token,
        json: { sourceId: randomUUID(), priceVnd: 129_000, termDays: 30 },
      });
      assert.equal(missing.status, 404);

      const created = await call('POST', '/api/admin/membership/plans', {
        token: admin.token,
        json: {
          sourceId: plan.id,
          label: 'Plus v2',
          priceVnd: 129_000,
          termDays: 30,
          chatPerPeriod: 400,
          chatPerDay: 80,
          sttSecondsPerPeriod: 1_500,
          ttsCharactersPerPeriod: 12_000,
        },
      });
      assert.equal(created.status, 201);
      const draft = created.body.plan as Record<string, unknown>;
      extra.push(String(draft.id));
      assert.equal(draft.version, 2);
      assert.equal(draft.status, 'draft');
      assert.equal(draft.priceVnd, 129_000);
      assert.equal(draft.termDays, 30);
      assert.equal((draft.allowances as Record<string, unknown>).chatPerDay, 80);
      // Execution limits are not editable here; they come from the source row.
      assert.equal((draft.limits as Record<string, unknown>).chatRequestsPerMinute, 6);
      assert.equal((draft.limits as Record<string, unknown>).maxConcurrentTtsChunks, 2);

      const createAudit = await pool.query(
        `SELECT actor_id, action, target, detail FROM admin_audit WHERE action = 'plan_version.create' AND detail->>'planVersionId' = $1`,
        [draft.id],
      );
      assert.equal(createAudit.rows.length, 1);
      assert.equal(createAudit.rows[0].actor_id, admin.userId);
      assert.equal(createAudit.rows[0].target, `${plan.code} v2`);
      assert.equal(Number(createAudit.rows[0].detail.after.priceVnd), 129_000);
      assert.equal(Number(createAudit.rows[0].detail.before.priceVnd), 99_000);

      // A draft changes nothing for buyers: the catalog still resolves the old row.
      assert.equal(await activeOf(plan.code), plan.id);

      const activated = await call('POST', `/api/admin/membership/plans/${draft.id}/activate`, { token: admin.token });
      assert.equal(activated.status, 200);
      assert.equal(activated.body.duplicate, false);
      assert.equal((activated.body.plan as Record<string, unknown>).status, 'active');
      assert.equal(await activeOf(plan.code), draft.id);
      const old = await pool.query('SELECT status FROM plan_versions WHERE id = $1', [plan.id]);
      assert.equal(old.rows[0].status, 'retired');
      const activateAudit = await pool.query(
        `SELECT actor_id, target, detail FROM admin_audit WHERE action = 'plan_version.activate' AND detail->>'planVersionId' = $1`,
        [draft.id],
      );
      assert.equal(activateAudit.rows.length, 1);
      assert.equal(activateAudit.rows[0].actor_id, admin.userId);
      assert.equal(activateAudit.rows[0].target, `${plan.code} v2`);
      assert.deepEqual(
        (activateAudit.rows[0].detail.retired as Array<{ id: string; version: number }>).map((entry) => entry.id),
        [plan.id],
      );

      const again = await call('POST', `/api/admin/membership/plans/${draft.id}/activate`, { token: admin.token });
      assert.equal(again.status, 200);
      assert.equal(again.body.duplicate, true);

      const next = await call('POST', '/api/admin/membership/plans', {
        token: admin.token,
        json: { sourceId: draft.id, priceVnd: 149_000, termDays: 30 },
      });
      assert.equal(next.status, 201);
      extra.push(String((next.body.plan as Record<string, unknown>).id));
      assert.equal((next.body.plan as Record<string, unknown>).version, 3);
      assert.equal(await activeOf(plan.code), draft.id);

      // The version an order points at is history: the trigger refuses a re-price,
      // which is why the editor can only add versions and activate them.
      await insertOrder(buyer.userId, plan.id);
      const refused = await pool
        .query('UPDATE plan_versions SET price_vnd = 1 WHERE id = $1', [plan.id])
        .then(() => null)
        .catch((error: { code?: string }) => error);
      assert.equal(refused?.code, '23514');
    } finally {
      await buyer.cleanup();
      await admin.cleanup();
      await dropPlans([plan.id, ...extra]);
    }
  });

  await t.test('the audit feed names the plan, the account and the actor', async () => {
    const admin = await makeAccount('admin');
    const buyer = await makeAccount('user');
    const plan = await insertPlan();
    try {
      await call('POST', '/api/admin/membership/grants', {
        token: admin.token,
        json: { email: buyer.email, planCode: plan.code, reason: 'feed check grant' },
        headers: { 'x-request-key': `grant-${randomUUID()}` },
      });
      const feed = await call('GET', '/api/admin/membership/audit', { token: admin.token });
      assert.equal(feed.status, 200);
      const events = feed.body.events as Array<Record<string, unknown>>;
      const mine = events.filter((event) => event.accountEmail === buyer.email);
      assert.equal(mine.length, 1);
      assert.equal(mine[0].action, 'grant');
      assert.equal(mine[0].actorEmail, admin.email);
      assert.equal(mine[0].planCode, plan.code);
      assert.equal(mine[0].planLabel, 'Plus test');
    } finally {
      await buyer.cleanup();
      await admin.cleanup();
      await dropPlans([plan.id]);
    }
  });
});

after(async () => {
  if (pool) await pool.end().catch(() => {});
});
