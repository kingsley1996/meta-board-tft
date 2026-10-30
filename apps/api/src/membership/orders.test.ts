import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import express from 'express';
import type { Server } from 'node:http';
import type { Pool } from 'pg';
import type { PlanQuota } from './quota.ts';

// Orders, webhooks, reconciliation and refunds (task #87, docs/MEMBERSHIP-PLAN.md
// section 6).
//
// The HTTP routes are exercised with the real SePay adapter and a stubbed fetch, so
// the signature check, the lookup pagination and the dedupe indexes are the same
// code that runs in production while no merchant API is contacted. What is proven:
// the browser cannot name a price, one bank transaction cannot mint two periods
// no matter whether it arrives by webhook, by lookup or both, a wrong or late
// transfer never pays, and a refund ends exactly the period it was taken from.

// The test owns its provider binding before any module reads the environment.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../../.env'));
  } catch {
    // No .env — the whole file skips.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);

const BANK_ACCOUNT_ID = randomUUID();
const SECRET = 'test-sepay-webhook-secret';
process.env.PAYMENT_PROVIDER = 'sepay';
process.env.SEPAY_ACCOUNT_ID = 'acct-test';
process.env.SEPAY_API_KEY = 'test-sepay-api-key';
process.env.SEPAY_WEBHOOK_SECRET = SECRET;
process.env.SEPAY_BANK_ACCOUNT_ID = BANK_ACCOUNT_ID;
process.env.SEPAY_BANK_ACCOUNT_NUMBER = '0123456789';
process.env.SEPAY_BANK_CODE = 'vietcombank';
process.env.SEPAY_BANK_NAME = 'Vietcombank';
process.env.AUTH_WEB_ORIGIN = 'http://localhost:4173';
// A developer .env may also carry payOS keys; the registry would then build a second
// adapter whose network calls this file does not stub. The default binding is SePay.
for (const key of ['PAYOS_ACCOUNT_ID', 'PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY']) delete process.env[key];

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

let pool: Pool;
let lifecycle: typeof import('./lifecycle.ts');
let quota: typeof import('./quota.ts');
let orders: typeof import('./orders.ts');
let accounts: typeof import('../accounts.ts');
let paymentRoutes: typeof import('../payments/routes.ts');

const planIds: string[] = [];
let schemaApplied = false;

async function applySchema(): Promise<void> {
  if (schemaApplied) return;
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

async function makeAccount(): Promise<{ userId: string; token: string; cleanup: () => Promise<void> }> {
  await applySchema();
  const userId = randomUUID();
  await pool.query('INSERT INTO users (id, email, role) VALUES ($1, $2, $3)', [userId, `test-${userId}@example.com`, 'user']);
  const token = await accounts.createSession(userId);
  return {
    userId,
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

async function insertPlan(seed: { status?: string; termDays?: number | null; priceVnd?: number } = {}): Promise<string> {
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
  return id;
}

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

async function countRows(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM (${sql}) q`, params);
  return Number(rows[0]?.n ?? -1);
}

/** SePay's transaction page, served from memory: the lookup path is the real
 *  adapter's pagination and matching code, only the network answer is canned. */
const transactions = new Map<string, { amount: number; bankReference: string }>();
let lookupCalls = 0;
const originalFetch = globalThis.fetch;
type FetchInput = Parameters<typeof originalFetch>[0];
globalThis.fetch = (async (input: FetchInput, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
  if (url.hostname !== 'userapi.sepay.vn') return originalFetch(input, init);
  lookupCalls += 1;
  const reference = url.searchParams.get('transaction_content') ?? '';
  const hit = transactions.get(reference);
  const data = hit
    ? [
        {
          id: randomUUID(),
          bank_account_id: BANK_ACCOUNT_ID,
          account_number: process.env.SEPAY_BANK_ACCOUNT_NUMBER,
          amount_in: hit.amount,
          amount_out: 0,
          currency: 'VND',
          transaction_content: `META BOARD ${reference}`,
          code: reference,
          reference_number: hit.bankReference,
          transaction_date: '2026-10-29T20:00:00+07:00',
          transfer_type: 'in',
        },
      ]
    : [];
  const total = data.length;
  return new Response(
    JSON.stringify({
      status: 'success',
      data,
      meta: { pagination: { total, per_page: 100, current_page: 1, last_page: 1, has_more: false } },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}) as typeof globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

function signedWebhook(payload: Record<string, unknown>): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', SECRET).update(`${timestamp}.`).update(body).digest('hex');
  return {
    body,
    headers: {
      'content-type': 'application/json',
      'x-sepay-timestamp': timestamp,
      'x-sepay-signature': `sha256=${signature}`,
    },
  };
}

function transferFor(order: { reference: string; amountVnd: number; bankReference?: string; amount?: number }) {
  return {
    id: Number(String(Date.now()).slice(-9)) * 10 + Math.floor(Math.random() * 9),
    gateway: 'Vietcombank',
    transactionDate: '2026-10-29 20:00:00',
    accountNumber: process.env.SEPAY_BANK_ACCOUNT_NUMBER,
    code: order.reference,
    content: `META BOARD ${order.reference}`,
    transferType: 'in',
    transferAmount: order.amount ?? order.amountVnd,
    accumulated: order.amount ?? order.amountVnd,
    subAccount: null,
    referenceCode: order.bankReference ?? `FT${randomUUID().slice(0, 8).toUpperCase()}`,
    description: '',
    currency: 'VND',
  };
}

test('orders, webhooks and refunds', { skip: !hasDb }, async (t) => {
  pool = (await import('../db.ts')).pool;
  lifecycle = await import('./lifecycle.ts');
  quota = await import('./quota.ts');
  orders = await import('./orders.ts');
  accounts = await import('../accounts.ts');
  paymentRoutes = await import('../payments/routes.ts');

  let server: Server | null = null;
  let base = '';

  await new Promise<void>((resolve) => {
    const app = express();
    app.disable('x-powered-by');
    // Same order as src/index.ts: the webhook needs the raw bytes.
    app.use('/api/payments/webhook', express.raw({ type: '*/*', limit: '64kb' }), paymentRoutes.paymentWebhookRouter);
    app.use(express.json());
    app.use('/api', paymentRoutes.paymentRouter);
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
    options: { token?: string; json?: unknown; body?: string; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.token) headers.cookie = `mb_session=${options.token}`;
    const init: RequestInit = { method, headers };
    if (options.body !== undefined) init.body = options.body;
    else if (options.json !== undefined) {
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
    return { status: response.status, body, headers: response.headers };
  }

  async function createOrder(token: string, planVersionId: string, key = `key-${randomUUID()}`) {
    return call('POST', '/api/orders', { token, json: { planVersionId }, headers: { 'x-request-key': key } });
  }

  await t.test('a guest cannot start a checkout and no order is written', async () => {
    const plus = await insertPlan();
    try {
      const response = await call('POST', '/api/orders', { json: { planVersionId: plus }, headers: { 'x-request-key': 'guest-key-1' } });
      assert.equal(response.status, 401);
      assert.equal(response.body.code, 'unauthenticated');
      assert.equal(await countRows('SELECT 1 FROM payment_orders WHERE plan_version_id = $1', [plus]), 0);
    } finally {
      await dropPlans([plus]);
    }
  });

  await t.test('the price, term and plan come from the catalog, not the browser', async () => {
    const kase = await makeAccount();
    const plus = await insertPlan({ priceVnd: 99_000, termDays: 30 });
    const draft = await insertPlan({ status: 'draft' });
    const fallback = await insertPlan({ termDays: null, priceVnd: 0 });
    try {
      const created = await createOrder(kase.token, plus);
      assert.equal(created.status, 200);
      const order = created.body.order as Record<string, unknown>;
      assert.equal(order.amountVnd, 99_000);
      assert.equal(order.status, 'pending');
      assert.equal(order.provider, 'sepay');
      assert.deepEqual((order.plan as Record<string, unknown>).termDays, 30);
      assert.equal((order.plan as Record<string, unknown>).priceVnd, 99_000);
      // The adapter's own QR is the SePay bank Qr carrying exactly the order amount.
      const checkout = order.checkout as Record<string, unknown>;
      assert.equal(checkout.kind, 'bank_qr');
      assert.match(String(checkout.qrImageUrl), /amount=99000/);
      assert.match(String(checkout.qrImageUrl), new RegExp(`des=${order.reference}`));
      // The checkout screen prints where to send the money; those values come from
      // the adapter's own binding, not from anything the browser sent.
      assert.deepEqual(checkout.bank, { bankName: 'Vietcombank', accountNumber: '0123456789' });
      assert.deepEqual((order.plan as Record<string, unknown>).allowances, {
        chatPerPeriod: 150,
        sttSecondsPerPeriod: 600,
        ttsCharactersPerPeriod: 5000,
      });
      assert.equal(order.paidVnd, null);

      const stored = await pool.query(`SELECT amount_vnd, offer_snapshot FROM payment_orders WHERE id = $1`, [order.id]);
      assert.equal(Number(stored.rows[0].amount_vnd), 99_000);
      assert.equal(Number(stored.rows[0].offer_snapshot.plan.priceVnd), 99_000);

      // A draft row and the fallback tier have no term to sell.
      const notOnSale = await createOrder(kase.token, draft);
      assert.equal(notOnSale.status, 409);
      assert.equal(notOnSale.body.code, 'offer_not_sellable');
      const notSellable = await createOrder(kase.token, fallback);
      assert.equal(notSellable.status, 409);
      assert.equal(await countRows('SELECT 1 FROM payment_orders WHERE plan_version_id = ANY($1)', [[draft, fallback]]), 0);
    } finally {
      await kase.cleanup();
      await dropPlans([plus, draft, fallback]);
    }
  });

  await t.test('a retried create is the same order, and a fourth open checkout is refused', async () => {
    const kase = await makeAccount();
    const plus = await insertPlan();
    try {
      const key = `retry-${randomUUID()}`;
      const first = await createOrder(kase.token, plus, key);
      const second = await createOrder(kase.token, plus, key);
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      const a = first.body.order as Record<string, unknown>;
      const b = second.body.order as Record<string, unknown>;
      assert.equal(a.id, b.id);
      assert.equal(a.reference, b.reference);
      assert.equal(a.amountVnd, b.amountVnd);
      assert.equal(await countRows('SELECT 1 FROM payment_orders WHERE user_id = $1', [kase.userId]), 1);

      for (let i = 0; i < 2; i += 1) assert.equal((await createOrder(kase.token, plus)).status, 200);
      const tooMany = await createOrder(kase.token, plus);
      assert.equal(tooMany.status, 429);
      assert.equal(tooMany.body.code, 'too_many_pending_orders');
      assert.equal(await countRows('SELECT 1 FROM payment_orders WHERE user_id = $1', [kase.userId]), 3);
    } finally {
      await kase.cleanup();
      await dropPlans([plus]);
    }
  });

  await t.test('order history is account-scoped and never cached', async () => {
    const owner = await makeAccount();
    const stranger = await makeAccount();
    const plus = await insertPlan();
    try {
      const created = await createOrder(owner.token, plus);
      const order = created.body.order as Record<string, unknown>;
      const mine = await call('GET', '/api/me/orders', { token: owner.token });
      assert.equal(mine.status, 200);
      assert.equal((mine.body.orders as unknown[]).length, 1);
      assert.match(String(mine.headers.get('cache-control')), /no-store/);

      const theirs = await call('GET', '/api/me/orders', { token: stranger.token });
      assert.deepEqual(theirs.body.orders, []);
      const peek = await call('GET', `/api/me/orders/${order.id}`, { token: stranger.token });
      assert.equal(peek.status, 404);
    } finally {
      await owner.cleanup();
      await stranger.cleanup();
      await dropPlans([plus]);
    }
  });

  await t.test('an unverifiable webhook changes nothing', async () => {
    const kase = await makeAccount();
    const plus = await insertPlan();
    try {
      const created = await createOrder(kase.token, plus);
      const order = created.body.order as Record<string, unknown>;
      const payload = transferFor({ reference: String(order.reference), amountVnd: 99_000 });
      const signed = signedWebhook(payload);
      const forged = await call('POST', '/api/payments/webhook/sepay', {
        body: signed.body,
        headers: { ...signed.headers, 'x-sepay-signature': `sha256=${'0'.repeat(64)}` },
      });
      assert.equal(forged.status, 401);
      assert.equal(forged.body.code, 'invalid_webhook');
      assert.equal(await countRows('SELECT 1 FROM payment_events WHERE order_id = $1', [order.id]), 0);
      assert.equal(await countRows(`SELECT 1 FROM payment_orders WHERE id = $1 AND status = 'pending'`, [order.id]), 1);
      assert.equal(await countRows('SELECT 1 FROM memberships WHERE user_id = $1', [kase.userId]), 0);

      // A stale timestamp is a replay and is rejected the same way.
      const staleStamp = String(Math.floor(Date.now() / 1000) - 3_600);
      const staleSignature = createHmac('sha256', SECRET).update(`${staleStamp}.`).update(signed.body).digest('hex');
      const stale = await call('POST', '/api/payments/webhook/sepay', {
        body: signed.body,
        headers: { ...signed.headers, 'x-sepay-timestamp': staleStamp, 'x-sepay-signature': `sha256=${staleSignature}` },
      });
      assert.equal(stale.status, 401);
    } finally {
      await kase.cleanup();
      await dropPlans([plus]);
    }
  });

  const payloadReference = (body: string): string => String((JSON.parse(body) as Record<string, unknown>).referenceCode);

  await t.test('a verified transfer pays the order and mints exactly one period', async () => {
    const kase = await makeAccount();
    const plus = await insertPlan({ termDays: 30 });
    try {
      const created = await createOrder(kase.token, plus);
      const order = created.body.order as Record<string, unknown>;
      const signed = signedWebhook(transferFor({ reference: String(order.reference), amountVnd: 99_000 }));
      const delivered = await call('POST', '/api/payments/webhook/sepay', { body: signed.body, headers: signed.headers });
      assert.equal(delivered.status, 200);

      const paid = await pool.query(`SELECT status, paid_vnd, fulfilled_at FROM payment_orders WHERE id = $1`, [order.id]);
      assert.equal(paid.rows[0].status, 'paid');
      assert.equal(Number(paid.rows[0].paid_vnd), 99_000);
      assert.ok(paid.rows[0].fulfilled_at, 'fulfilment is stamped');

      // A read after payment exposes the confirmed amount and still the bank
      // details, so the receipt screen does not depend on the creating render.
      const receipt = await call('GET', `/api/me/orders/${order.id}`, { token: kase.token });
      assert.equal(receipt.status, 200);
      const readOrder = receipt.body.order as Record<string, unknown>;
      assert.equal(readOrder.status, 'paid');
      assert.equal(readOrder.paidVnd, 99_000);
      assert.deepEqual((readOrder.checkout as Record<string, unknown>).bank, { bankName: 'Vietcombank', accountNumber: '0123456789' });

      const periods = await pool.query(`SELECT id, plan_version_id, source, starts_at, ends_at FROM memberships WHERE order_id = $1`, [order.id]);
      assert.equal(periods.rows.length, 1);
      assert.equal(periods.rows[0].plan_version_id, plus);
      assert.equal(periods.rows[0].source, 'purchase');

      const entitlement = await lifecycle.resolveEntitlement(kase.userId);
      if (!entitlement.ok) throw new Error('expected an entitlement');
      assert.equal(entitlement.paid, true);
      assert.equal(entitlement.plan.chatPerPeriod, 150);

      const event = await pool.query(`SELECT result, event_type, transaction_reference FROM payment_events WHERE order_id = $1`, [order.id]);
      assert.equal(event.rows.length, 1);
      assert.equal(event.rows[0].result, 'granted');
      assert.equal(event.rows[0].event_type, 'webhook');

      // A second delivery of the same bank transaction is acknowledged and ignored.
      const replay = await call('POST', '/api/payments/webhook/sepay', { body: signed.body, headers: signed.headers });
      assert.equal(replay.status, 200);
      assert.equal(await countRows('SELECT 1 FROM memberships WHERE order_id = $1', [order.id]), 1);
      // The same money under a different provider event id is still the same bank
      // transaction: the reference dedupe catches it before a second grant.
      const twin = transferFor({ reference: String(order.reference), amountVnd: 99_000, bankReference: payloadReference(signed.body) });
      const twinSigned = signedWebhook(twin);
      const twinResponse = await call('POST', '/api/payments/webhook/sepay', { body: twinSigned.body, headers: twinSigned.headers });
      assert.equal(twinResponse.status, 200);
      assert.equal(await countRows('SELECT 1 FROM memberships WHERE order_id = $1', [order.id]), 1);
    } finally {
      await kase.cleanup();
      await dropPlans([plus]);
    }
  });

  await t.test('a wrong amount lands in review and buys nothing', async () => {
    const kase = await makeAccount();
    const plus = await insertPlan();
    try {
      const created = await createOrder(kase.token, plus);
      const order = created.body.order as Record<string, unknown>;
      const short = signedWebhook(transferFor({ reference: String(order.reference), amountVnd: 99_000, amount: 50_000 }));
      const response = await call('POST', '/api/payments/webhook/sepay', { body: short.body, headers: short.headers });
      assert.equal(response.status, 200);

      const stored = await pool.query(`SELECT status, fulfilled_at FROM payment_orders WHERE id = $1`, [order.id]);
      assert.equal(stored.rows[0].status, 'review');
      assert.equal(stored.rows[0].fulfilled_at, null);
      assert.equal(await countRows('SELECT 1 FROM memberships WHERE user_id = $1', [kase.userId]), 0);
      const event = await pool.query(`SELECT result, result_detail FROM payment_events WHERE order_id = $1`, [order.id]);
      assert.equal(event.rows[0].result, 'review');
      assert.equal(event.rows[0].result_detail, 'amount_mismatch');
      // The money is not payable later either: a review order stays unpayable.
      const late = signedWebhook(transferFor({ reference: String(order.reference), amountVnd: 99_000 }));
      assert.equal((await call('POST', '/api/payments/webhook/sepay', { body: late.body, headers: late.headers })).status, 200);
      assert.equal(await countRows('SELECT 1 FROM memberships WHERE user_id = $1', [kase.userId]), 0);
    } finally {
      await kase.cleanup();
      await dropPlans([plus]);
    }
  });

  await t.test('a transfer in another currency buys nothing', async () => {
    const kase = await makeAccount();
    const plus = await insertPlan();
    try {
      const created = await createOrder(kase.token, plus);
      const order = created.body.order as Record<string, unknown>;
      // SePay settles VND only, so a receipt in another unit is not a SePay
      // transaction at all: the adapter refuses it and the checkout is untouched.
      const payload = { ...transferFor({ reference: String(order.reference), amountVnd: 99_000 }), currency: 'USD' };
      const signed = signedWebhook(payload);
      const response = await call('POST', '/api/payments/webhook/sepay', { body: signed.body, headers: signed.headers });
      assert.equal(response.status, 401);
      assert.equal((response.body as Record<string, unknown>).code, 'invalid_webhook');

      const stored = await pool.query(`SELECT status, fulfilled_at FROM payment_orders WHERE id = $1`, [order.id]);
      assert.equal(stored.rows[0].status, 'pending', 'the checkout is untouched');
      assert.equal(stored.rows[0].fulfilled_at, null);
      assert.equal(await countRows('SELECT 1 FROM memberships WHERE user_id = $1', [kase.userId]), 0);
      assert.equal(await countRows('SELECT 1 FROM payment_events WHERE order_id = $1', [order.id]), 0);
    } finally {
      await kase.cleanup();
      await dropPlans([plus]);
    }
  });

  await t.test('a transfer after the checkout expired is review, not a resurrection', async () => {
    const kase = await makeAccount();
    const plus = await insertPlan();
    try {
      const created = await createOrder(kase.token, plus);
      const order = created.body.order as Record<string, unknown>;
      // Let the 15-minute checkout lapse on the clock, without a background job.
      await pool.query(
        `UPDATE payment_orders SET created_at = now() - interval '20 minutes', expires_at = now() - interval '1 minute' WHERE id = $1`,
        [order.id],
      );
      const seen = await call('GET', `/api/me/orders/${order.id}`, { token: kase.token });
      assert.equal((seen.body.order as Record<string, unknown>).status, 'expired');
      // A closed checkout is not polled: the answer cannot change by asking.
      const before = lookupCalls;
      const refreshed = await call('POST', `/api/me/orders/${order.id}/refresh`, { token: kase.token });
      assert.equal((refreshed.body.order as Record<string, unknown>).status, 'expired');
      assert.equal(lookupCalls, before);

      const signed = signedWebhook(transferFor({ reference: String(order.reference), amountVnd: 99_000 }));
      assert.equal((await call('POST', '/api/payments/webhook/sepay', { body: signed.body, headers: signed.headers })).status, 200);

      const stored = await pool.query(`SELECT status FROM payment_orders WHERE id = $1`, [order.id]);
      assert.equal(stored.rows[0].status, 'expired');
      assert.equal(await countRows('SELECT 1 FROM memberships WHERE user_id = $1', [kase.userId]), 0);
      const event = await pool.query(`SELECT result, result_detail FROM payment_events WHERE order_id = $1`, [order.id]);
      assert.equal(event.rows[0].result, 'review');
      assert.equal(event.rows[0].result_detail, 'order_expired');
    } finally {
      await kase.cleanup();
      await dropPlans([plus]);
    }
  });

  await t.test('a transfer with no matching order is kept for audit', async () => {
    const payload = transferFor({ reference: 'MB000000000000', amountVnd: 99_000 });
    const signed = signedWebhook(payload);
    const response = await call('POST', '/api/payments/webhook/sepay', { body: signed.body, headers: signed.headers });
    assert.equal(response.status, 200);
    const rows = await pool.query(
      `SELECT order_id, result, result_detail FROM payment_events WHERE provider = 'sepay' AND provider_transaction_id = $1`,
      [String(payload.id)],
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].order_id, null);
    assert.equal(rows.rows[0].result, 'review');
    assert.equal(rows.rows[0].result_detail, 'order_not_found');
    await pool.query(`DELETE FROM payment_events WHERE provider_transaction_id = $1 AND provider = 'sepay'`, [String(payload.id)]);
  });

  await t.test('refresh asks the gateway once, is throttled, and cannot double-grant with a webhook', async () => {
    const kase = await makeAccount();
    const plus = await insertPlan();
    try {
      const created = await createOrder(kase.token, plus);
      const order = created.body.order as Record<string, unknown>;
      const reference = String(order.reference);
      transactions.set(reference, { amount: 99_000, bankReference: `FT${randomUUID().slice(0, 8).toUpperCase()}` });
      // The order was just written, and the stored updated_at is the throttle: a
      // poll is only meaningful after the interval.
      await pool.query(`UPDATE payment_orders SET updated_at = now() - interval '5 seconds' WHERE id = $1`, [order.id]);

      const before = lookupCalls;
      const refreshed = await call('POST', `/api/me/orders/${order.id}/refresh`, { token: kase.token });
      assert.equal(refreshed.status, 200);
      assert.equal(lookupCalls, before + 1);
      const refreshedOrder = refreshed.body.order as Record<string, unknown>;
      assert.equal(refreshedOrder.status, 'paid');
      assert.ok(refreshedOrder.fulfilledAt);
      assert.equal(await countRows('SELECT 1 FROM memberships WHERE order_id = $1', [order.id]), 1);

      // Immediately again: the provider is not called, the stored answer is shown.
      const throttled = await call('POST', `/api/me/orders/${order.id}/refresh`, { token: kase.token });
      assert.equal(throttled.status, 200);
      assert.equal(lookupCalls, before + 1);
      assert.equal((throttled.body.order as Record<string, unknown>).status, 'paid');

      // The webhook for the same transfer now arrives; it is a duplicate of the
      // lookup receipt and adds no period.
      const bankReference = transactions.get(reference)!.bankReference;
      const signed = signedWebhook(transferFor({ reference, amountVnd: 99_000, bankReference }));
      assert.equal((await call('POST', '/api/payments/webhook/sepay', { body: signed.body, headers: signed.headers })).status, 200);
      assert.equal(await countRows('SELECT 1 FROM memberships WHERE order_id = $1', [order.id]), 1);
      transactions.delete(reference);
    } finally {
      await kase.cleanup();
      await dropPlans([plus]);
    }
  });

  await t.test('refreshing someone else’s order is 404 and calls no provider', async () => {
    const owner = await makeAccount();
    const stranger = await makeAccount();
    const plus = await insertPlan();
    try {
      const created = await createOrder(owner.token, plus);
      const order = created.body.order as Record<string, unknown>;
      const before = lookupCalls;
      const response = await call('POST', `/api/me/orders/${order.id}/refresh`, { token: stranger.token });
      assert.equal(response.status, 404);
      assert.equal(lookupCalls, before);
    } finally {
      await owner.cleanup();
      await stranger.cleanup();
      await dropPlans([plus]);
    }
  });

  /** Pays one order through the webhook and returns what a refund needs. */
  async function paidOrder(kase: { token: string; userId: string }, plus: string) {
    const created = await createOrder(kase.token, plus);
    const order = created.body.order as Record<string, unknown>;
    const signed = signedWebhook(transferFor({ reference: String(order.reference), amountVnd: 99_000 }));
    assert.equal((await call('POST', '/api/payments/webhook/sepay', { body: signed.body, headers: signed.headers })).status, 200);
    const period = await pool.query(`SELECT id FROM memberships WHERE order_id = $1 AND status = 'active'`, [order.id]);
    assert.equal(period.rows.length, 1, 'the fixture must produce one active period');
    return { orderId: String(order.id), membershipId: String(period.rows[0].id) };
  }

  await t.test('a fresh unused period is refunded, and the audit names the actor', async () => {
    const kase = await makeAccount();
    const admin = await makeAccount();
    const plus = await insertPlan();
    try {
      const { orderId, membershipId } = await paidOrder(kase, plus);
      const refunded = await orders.refundOrder({ orderId, actorId: admin.userId, reason: 'requested within seven days' });
      assert.deepEqual(refunded, { ok: true, membershipId, duplicate: false });

      const period = await pool.query(`SELECT status FROM memberships WHERE id = $1`, [membershipId]);
      assert.equal(period.rows[0].status, 'revoked');
      const entitlement = await lifecycle.resolveEntitlement(kase.userId);
      // A revoked period is no coverage: the answer is the fallback tier, or an
      // unavailable plan when this database has no fallback row — never Plus.
      assert.equal(entitlement.ok ? entitlement.paid : false, false, 'a revoked period grants nothing');

      const audit = await pool.query(
        `SELECT action, source, actor_id, reason FROM membership_events WHERE membership_id = $1 AND action = 'revoke'`,
        [membershipId],
      );
      // The purchase already wrote a 'grant' event; the refund adds exactly one
      // revoke that names the admin who confirmed the money went back.
      assert.equal(audit.rows.length, 1);
      assert.equal(audit.rows[0].action, 'revoke');
      assert.equal(audit.rows[0].source, 'admin');
      assert.equal(audit.rows[0].actor_id, admin.userId);

      // The order stays paid: the money did go out, and the order is the receipt.
      assert.equal(await countRows(`SELECT 1 FROM payment_orders WHERE id = $1 AND status = 'paid'`, [orderId]), 1);
      // A second confirmation is refused without a second audit row.
      const again = await orders.refundOrder({ orderId, actorId: admin.userId, reason: 'requested within seven days' });
      assert.equal(again.ok, false);
      assert.equal(await countRows(`SELECT 1 FROM membership_events WHERE membership_id = $1 AND action = 'revoke'`, [membershipId]), 1);
    } finally {
      await kase.cleanup();
      await admin.cleanup();
      await dropPlans([plus]);
    }
  });

  await t.test('a period that spent quota is not refunded', async () => {
    const kase = await makeAccount();
    const admin = await makeAccount();
    const plus = await insertPlan();
    try {
      const { orderId } = await paidOrder(kase, plus);
      const entitlement = await lifecycle.resolveEntitlement(kase.userId);
      if (!entitlement.ok) throw new Error('expected an entitlement');
      const plan: PlanQuota = entitlement.plan;
      const reserved = await quota.reserve({
        userId: kase.userId,
        purpose: 'coach_turn',
        idempotencyKey: `refund-use-${randomUUID()}`,
        payloadSha256: sha('one Coach turn'),
        plan,
        units: { chat: 1 },
      });
      if (!reserved.ok) throw new Error(`expected a reservation, got ${reserved.reason}`);
      assert.ok((await quota.settle(reserved.requestId, 'completed', { consumed: { chat: 1 } })).ok);

      const refunded = await orders.refundOrder({ orderId, actorId: admin.userId, reason: 'changed my mind' });
      assert.deepEqual(refunded, { ok: false, reason: 'used' });
      assert.equal(await countRows(`SELECT 1 FROM memberships WHERE order_id = $1 AND status = 'active'`, [orderId]), 1);
    } finally {
      await kase.cleanup();
      await admin.cleanup();
      await dropPlans([plus]);
    }
  });

  await t.test('the refund window closes after seven days of the verified payment', async () => {
    const kase = await makeAccount();
    const admin = await makeAccount();
    const plus = await insertPlan();
    try {
      const { orderId } = await paidOrder(kase, plus);
      await pool.query(`UPDATE payment_orders SET settled_at = now() - interval '8 days' WHERE id = $1`, [orderId]);
      const refunded = await orders.refundOrder({ orderId, actorId: admin.userId, reason: 'late request' });
      assert.deepEqual(refunded, { ok: false, reason: 'window_expired' });
      assert.equal(await countRows(`SELECT 1 FROM memberships WHERE order_id = $1 AND status = 'active'`, [orderId]), 1);
    } finally {
      await kase.cleanup();
      await admin.cleanup();
      await dropPlans([plus]);
    }
  });

  await t.test('a paid order with no period is not refundable as a purchase', async () => {
    const kase = await makeAccount();
    const admin = await makeAccount();
    const plus = await insertPlan();
    try {
      const created = await createOrder(kase.token, plus);
      const order = created.body.order as Record<string, unknown>;
      await pool.query(`UPDATE payment_orders SET status = 'paid', paid_vnd = amount_vnd, settled_at = now() WHERE id = $1`, [order.id]);
      const refunded = await orders.refundOrder({ orderId: String(order.id), actorId: admin.userId, reason: 'manual review' });
      assert.deepEqual(refunded, { ok: false, reason: 'not_fulfilled' });
    } finally {
      await kase.cleanup();
      await admin.cleanup();
      await dropPlans([plus]);
    }
  });

  await t.test('an unknown provider is 404 and a provider outage is a 503', async () => {
    const response = await call('POST', '/api/payments/webhook/stripe', { body: '{}', headers: { 'content-type': 'application/json' } });
    assert.equal(response.status, 404);
    const selected = process.env.PAYMENT_PROVIDER;
    delete process.env.PAYMENT_PROVIDER;
    try {
      const down = await call('POST', '/api/payments/webhook/sepay', { body: '{}', headers: { 'content-type': 'application/json' } });
      assert.equal(down.status, 503);
      assert.equal(down.body.code, 'payments_unavailable');
    } finally {
      if (selected !== undefined) process.env.PAYMENT_PROVIDER = selected;
    }
  });
});
