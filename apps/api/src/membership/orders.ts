import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db.ts';
import {
  PaymentProviderError,
  type PaymentBinding,
  type PaymentProviderRegistry,
  type PaymentReceipt,
} from '../payments/index.ts';
import { grantPeriod, revokePeriod } from './lifecycle.ts';
import { planQuotaFromRow } from './quota.ts';

// Orders, verified payments and reconciliation (task #87, docs/MEMBERSHIP-PLAN.md
// section 6).
//
// The browser never names a price, an amount or a plan it did not see on the
// catalog: the route reads an active plan row, freezes its terms into the order and
// asks the provider for exactly that amount. Every later step resolves the provider
// binding stored on the order, so switching PAYMENT_PROVIDER never re-routes an old
// order or an old webhook.
//
// A payment is granted only after an authenticated event names the order, matches
// its amount and lands while the order is still payable. The grant itself is
// `lifecycle.grantPeriod`, which is idempotent per order; this module's job is to
// make sure one bank transaction cannot be recorded twice (two unique indexes) and
// that a recorded-but-ungranted event is retried instead of forgotten.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_KEY = /^[A-Za-z0-9_-]{8,64}$/;
const DAY_MS = 86_400_000;
// Checkout lives 15 minutes, the window payOS shows on a payment link. A pending
// order older than this is no longer payable and a late transfer goes to review.
const ORDER_TTL_MS = 15 * 60_000;
// A buyer only needs one open checkout; more than this is a retry loop or abuse.
const PENDING_LIMIT = 3;
// Status refresh is a provider call, so a polling tab cannot turn into a lookup
// storm. The order's updated_at is the throttle, which survives restarts.
const RECONCILE_INTERVAL_MS = 3_000;
// Pilot policy (#79): full refund within seven days of the verified payment and
// only while the bought period has spent nothing.
const REFUND_WINDOW_MS = 7 * DAY_MS;

export type OrderView = {
  id: string;
  reference: string;
  amountVnd: number;
  currency: string;
  status: string;
  provider: string;
  plan: {
    code: string;
    label: string;
    termDays: number | null;
    priceVnd: number;
    allowances: { chatPerPeriod: number | null; sttSecondsPerPeriod: number | null; ttsCharactersPerPeriod: number | null };
  };
  checkout: {
    kind: string | null;
    url: string | null;
    qrImageUrl: string | null;
    // Where a manual transfer goes. Only the checkout screen needs it, and only
    // a bank-QR provider has one.
    bank: { bankName: string; accountNumber: string } | null;
  };
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  // The amount the gateway confirmed, which is what the buyer sees as "received"
  // when a payment needs review. Null until something was actually received.
  paidVnd: number | null;
};

type OrderRecord = {
  id: string;
  user_id: string;
  plan_version_id: string;
  reference: string;
  order_code: string;
  amount_vnd: number;
  status: string;
  provider: string;
  account_id: string;
  external_id: string | null;
  checkout_kind: string | null;
  checkout_url: string | null;
  qr_image_url: string | null;
  offer_snapshot: Record<string, unknown>;
  created_at: Date | string;
  expires_at: Date | string;
  paid_vnd: number | null;
  settled_at: Date | string | null;
  fulfilled_at: Date | string | null;
  updated_at: Date | string;
};

export type CreateOrderResult =
  | { ok: true; order: OrderView }
  | {
      ok: false;
      reason:
        | 'invalid'
        | 'not_sellable'
        | 'membership_active'
        | 'too_many_pending'
        | 'conflict'
        | 'provider_unavailable'
        | 'unavailable';
    };

export type PaymentOutcome = {
  result: 'granted' | 'duplicate' | 'ignored' | 'review';
  orderId: string | null;
  detail: string | null;
};

export type RefundResult =
  | { ok: true; membershipId: string; duplicate: boolean }
  | { ok: false; reason: 'invalid' | 'not_found' | 'not_paid' | 'not_fulfilled' | 'window_expired' | 'used' | 'unavailable' };

function millis(value: unknown): number | null {
  const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
}

function iso(value: unknown): string | null {
  const time = millis(value);
  return time === null ? null : new Date(time).toISOString();
}

function normalizeReference(value: string | null): string {
  // Bank memos arrive in either case; the database stores the printed uppercase
  // form, and the same order must match both.
  return (value ?? '').trim().toUpperCase();
}

/**
 * The order code is derived from the caller's request key, so a retried create is
 * the same order instead of a second pending one. It is also the number the
 * provider sees, which is why it stays a positive safe integer.
 *
 * Ten digits because SePay's payment-code structure (merchant dashboard) caps the
 * suffix at ten characters, and its numeric mode only accepts digits.
 */
function orderCodeFor(userId: string, planVersionId: string, requestKey: string): string {
  const digest = createHash('sha256').update(`order|${userId}|${planVersionId}|${requestKey}`).digest();
  return String(digest.readBigUInt64BE(0) % 9_000_000_000n + 1_000_000_000n);
}

/** A bank memo is the reference itself: the MTFT prefix plus ten digits is the
 *  exact shape configured in SePay, so the gateway can extract `code` and we do
 *  not have to guess the reference out of the memo text. */
function referenceFor(orderCode: string): string {
  return `MTFT${orderCode}`;
}

function webOrigin(): string {
  return (process.env.AUTH_WEB_ORIGIN?.trim() || 'http://localhost:4173').replace(/\/+$/, '');
}

function orderView(row: OrderRecord, registry: PaymentProviderRegistry | null = null): OrderView {
  const snapshot = row.offer_snapshot ?? {};
  const plan = snapshot.plan && typeof snapshot.plan === 'object' ? (snapshot.plan as Record<string, unknown>) : {};
  const allowances = plan.allowances && typeof plan.allowances === 'object' ? (plan.allowances as Record<string, unknown>) : {};
  const allowance = (key: string): number | null => {
    const value = Number(allowances[key]);
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  };
  const termDays = plan.termDays === null || plan.termDays === undefined ? null : Number(plan.termDays);
  const expiresAt = iso(row.expires_at);
  // Checkout lives 15 minutes. The row stays payable for the webhook (money can
  // arrive late), but the API reports what the buyer can act on right now.
  const lapsed = ['pending', 'processing'].includes(row.status) && expiresAt !== null && Date.parse(expiresAt) <= Date.now();
  return {
    id: row.id,
    reference: row.reference,
    amountVnd: Number(row.amount_vnd),
    currency: 'VND',
    status: lapsed ? 'expired' : row.status,
    provider: row.provider,
    plan: {
      code: String(plan.code ?? ''),
      label: String(plan.label ?? ''),
      termDays: Number.isSafeInteger(termDays) ? termDays : null,
      priceVnd: Number(plan.priceVnd ?? row.amount_vnd),
      allowances: {
        chatPerPeriod: allowance('chatPerPeriod'),
        sttSecondsPerPeriod: allowance('sttSecondsPerPeriod'),
        ttsCharactersPerPeriod: allowance('ttsCharactersPerPeriod'),
      },
    },
    checkout: {
      kind: row.checkout_kind,
      url: row.checkout_url,
      qrImageUrl: row.qr_image_url,
      bank: transferInfo(registry, row),
    },
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
    expiresAt: expiresAt ?? new Date(0).toISOString(),
    paidAt: iso(row.settled_at),
    fulfilledAt: iso(row.fulfilled_at),
    paidVnd: row.paid_vnd === null || row.paid_vnd === undefined ? null : Number(row.paid_vnd),
  };
}

/** The bank details belong to the account the order was created on, so an old
 *  order keeps working after the default provider changes. A retired binding is
 *  not a reason to fail the whole receipt. */
function transferInfo(registry: PaymentProviderRegistry | null, row: OrderRecord): { bankName: string; accountNumber: string } | null {
  if (!registry) return null;
  try {
    const transfer = registry.forOrder({ provider: row.provider, accountId: row.account_id }).transfer;
    return transfer ? { bankName: transfer.bankName, accountNumber: transfer.accountNumber } : null;
  } catch {
    return null;
  }
}

export async function createOrder(input: {
  userId: string;
  planVersionId: string;
  requestKey: string;
  registry: PaymentProviderRegistry;
}): Promise<CreateOrderResult> {
  if (!UUID.test(input.userId) || !UUID.test(input.planVersionId) || !REQUEST_KEY.test(input.requestKey)) {
    return { ok: false, reason: 'invalid' };
  }

  const plan = await pool.query(`SELECT * FROM plan_versions WHERE id = $1`, [input.planVersionId]).catch(() => null);
  if (!plan) return { ok: false, reason: 'unavailable' };
  const planRow = plan.rows[0];
  // The fallback tier has no term to sell; a draft or retired offer is not on sale.
  // planQuotaFromRow also rejects a malformed allowance instead of freezing one.
  const quota = planQuotaFromRow(planRow, { start: 0, end: 1 });
  const price = Number(planRow?.price_vnd);
  if (!planRow || !quota || quota.termDays === null || !Number.isSafeInteger(price) || price <= 0) {
    return { ok: false, reason: 'not_sellable' };
  }

  const orderCode = orderCodeFor(input.userId, input.planVersionId, input.requestKey);
  const reference = referenceFor(orderCode);
  const now = Date.now();
  const snapshot = {
    plan: {
      version: Number(planRow.version),
      code: String(planRow.code),
      label: String(planRow.label),
      priceVnd: price,
      currency: 'VND',
      termDays: quota.termDays,
      allowances: {
        chatPerPeriod: quota.chatPerPeriod,
        chatPerDay: quota.chatPerDay,
        sttSecondsPerPeriod: quota.sttSecondsPerPeriod,
        ttsCharactersPerPeriod: quota.ttsCharactersPerPeriod,
      },
      limits: {
        chatRequestsPerMinute: quota.chatRequestsPerMinute,
        maxConcurrentRequests: quota.maxConcurrentRequests,
        maxSttSecondsPerRequest: quota.maxSttSecondsPerRequest,
        maxConcurrentTtsChunks: quota.maxConcurrentTtsChunks,
      },
    },
  };

  const client = await pool.connect();
  let inserted: OrderRecord | null = null;
  let existing: OrderRecord | null = null;
  try {
    await client.query('BEGIN');
    // Lock the account so two tabs cannot both pass the pending limit and then
    // insert; the same lock also serialises a replay with its first attempt.
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [input.userId]);
    const seen = await client.query(`SELECT * FROM payment_orders WHERE order_code = $1`, [orderCode]);
    if (seen.rows[0]) {
      existing = seen.rows[0] as OrderRecord;
      if (existing.user_id !== input.userId || existing.plan_version_id !== input.planVersionId) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'conflict' };
      }
    } else {
      // One paid plan exists, and a second order while it runs could only stack a
      // second period nobody promised. A retry of an order that already exists is
      // still answered above, so a payment in flight is never blocked.
      const active = await client.query(
        `SELECT 1 FROM memberships WHERE user_id = $1 AND status = 'active' AND ends_at > now() LIMIT 1`,
        [input.userId],
      );
      if (active.rows[0]) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'membership_active' };
      }
      const busy = await client.query(
        `SELECT count(*)::int AS n FROM payment_orders
          WHERE user_id = $1 AND status IN ('pending', 'processing') AND expires_at > now()`,
        [input.userId],
      );
      if (busy.rows[0].n >= PENDING_LIMIT) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'too_many_pending' };
      }
      const binding = input.registry.forNewOrder().binding;
      const created = await client.query(
        `INSERT INTO payment_orders
           (id, user_id, plan_version_id, reference, order_code, amount_vnd, offer_snapshot, provider, account_id, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
         ON CONFLICT (order_code) DO NOTHING
         RETURNING *`,
        [
          randomUUID(),
          input.userId,
          input.planVersionId,
          reference,
          orderCode,
          price,
          JSON.stringify(snapshot),
          binding.provider,
          binding.accountId,
          new Date(now + ORDER_TTL_MS).toISOString(),
        ],
      );
      inserted = (created.rows[0] as OrderRecord | undefined) ?? null;
      if (!inserted) {
        const raced = await client.query(`SELECT * FROM payment_orders WHERE order_code = $1`, [orderCode]);
        existing = (raced.rows[0] as OrderRecord | undefined) ?? null;
        if (!existing || existing.user_id !== input.userId) {
          await client.query('ROLLBACK');
          return { ok: false, reason: 'conflict' };
        }
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logFailure('create order', error);
    return { ok: false, reason: 'unavailable' };
  } finally {
    client.release();
  }

  let order = inserted ?? existing;
  if (!order) return { ok: false, reason: 'unavailable' };

  // The checkout call is a network write, so it happens after the row commits and
  // is never re-issued for an order that already carries a checkout. A replay of
  // the same request key therefore returns the link the buyer already has.
  if (['pending', 'processing'].includes(order.status) && !order.external_id && !order.checkout_url && !order.qr_image_url) {
    const createdAt = iso(order.created_at);
    const expiresAt = iso(order.expires_at);
    if (!createdAt || !expiresAt) return { ok: false, reason: 'unavailable' };
    let provider;
    try {
      provider = input.registry.forOrder({ provider: order.provider, accountId: order.account_id });
    } catch {
      return { ok: false, reason: 'provider_unavailable' };
    }
    try {
      const returnUrl = `${webOrigin()}/checkout?order=${order.id}`;
      const checkout = await provider.createCheckout({
        orderCode: Number(order.order_code),
        reference: order.reference,
        amountVnd: Number(order.amount_vnd),
        createdAt,
        expiresAt,
        returnUrl,
        cancelUrl: `${returnUrl}&canceled=1`,
      });
      const updated = await pool.query(
        `UPDATE payment_orders
            SET external_id = $2, checkout_kind = $3, checkout_url = $4, qr_image_url = $5, updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [order.id, checkout.externalId, checkout.kind, checkout.checkoutUrl, checkout.qrImageUrl],
      );
      order = (updated.rows[0] as OrderRecord | undefined) ?? order;
    } catch (error) {
      // A timed-out write may already exist at the provider; the order is left as
      // failed so a retry with a fresh key starts clean, while reconciliation can
      // still match a late transfer by reference.
      await pool.query(`UPDATE payment_orders SET status = 'failed', updated_at = now() WHERE id = $1 AND status = 'pending'`, [order.id]).catch(() => {});
      logFailure('create checkout', error);
      return { ok: false, reason: 'provider_unavailable' };
    }
  }

  return { ok: true, order: orderView(order, input.registry) };
}

export async function listOrders(
  userId: string,
  registry: PaymentProviderRegistry | null = null,
  limit = 20,
): Promise<{ orders: OrderView[] } | null> {
  if (!UUID.test(userId)) return null;
  const size = Math.min(Math.max(Math.trunc(limit), 1), 50);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM payment_orders WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
      [userId, size],
    );
    return { orders: (rows as OrderRecord[]).map((row) => orderView(row, registry)) };
  } catch (error) {
    logFailure('list orders', error);
    return null;
  }
}

export async function getOrder(
  userId: string,
  orderId: string,
  registry: PaymentProviderRegistry | null = null,
): Promise<OrderView | null> {
  if (!UUID.test(userId) || !UUID.test(orderId)) return null;
  try {
    const { rows } = await pool.query(`SELECT * FROM payment_orders WHERE id = $1 AND user_id = $2`, [orderId, userId]);
    const row = rows[0] as OrderRecord | undefined;
    return row ? orderView(row, registry) : null;
  } catch (error) {
    logFailure('read order', error);
    return null;
  }
}

/**
 * Reconciles a pending order with the gateway, for the webhook that never arrived.
 * Only an account-scoped read calls this; the browser never reaches a provider
 * directly. A result is intentionally best-effort: the stored order is the answer
 * even when the provider cannot be asked right now.
 */
export async function reconcileOrder(input: {
  userId: string;
  orderId: string;
  registry: PaymentProviderRegistry | null;
  now?: number;
}): Promise<OrderView | null> {
  const now = input.now ?? Date.now();
  const order = await getOrder(input.userId, input.orderId, input.registry);
  if (!order) return null;
  if (!input.registry || !['pending', 'processing'].includes(order.status)) return order;

  try {
    const { rows } = await pool.query(`SELECT * FROM payment_orders WHERE id = $1 AND user_id = $2`, [input.orderId, input.userId]);
    const row = rows[0] as OrderRecord | undefined;
    if (!row) return null;
    const lastTouch = millis(row.updated_at);
    if (lastTouch !== null && now - lastTouch < RECONCILE_INTERVAL_MS) return orderView(row, input.registry);

    // A closed checkout is not asked about: a late transfer reaches us as a webhook
    // and goes to review, so polling the gateway cannot change the answer.
    const deadline = millis(row.expires_at);
    if (deadline !== null && deadline <= now) return orderView(row, input.registry);

    // Touch first: a provider outage must still throttle the next poll.
    await pool.query(`UPDATE payment_orders SET updated_at = now() WHERE id = $1`, [row.id]);

    const createdAt = iso(row.created_at);
    const expiresAt = iso(row.expires_at);
    if (!createdAt || !expiresAt) return order;
    const provider = input.registry.forOrder({ provider: row.provider, accountId: row.account_id });
    const lookup = await provider.lookup({
      orderCode: Number(row.order_code),
      reference: row.reference,
      amountVnd: Number(row.amount_vnd),
      createdAt,
      expiresAt,
      externalId: row.external_id,
    });

    // A provider that says "paid" without a receipt cannot authorise a grant: the
    // receipt is the evidence that names the bank transaction. It goes to review.
    const nextStatus = lookup.status === 'paid' && lookup.receipts.length === 0 ? 'review' : lookup.status;
    await pool.query(
      `UPDATE payment_orders SET status = $2, updated_at = now()
        WHERE id = $1 AND status IN ('pending', 'processing')`,
      [row.id, nextStatus],
    );
    for (const receipt of lookup.receipts) {
      await recordReceipt({
        binding: { provider: row.provider, accountId: row.account_id },
        eventType: 'lookup',
        eventId: receipt.providerTransactionId,
        payloadSha256: createHash('sha256').update(JSON.stringify(receipt)).digest('hex'),
        receipt,
      });
    }
  } catch (error) {
    // `configuration`, a provider outage or a malformed response: show the stored
    // order, never a made-up paid status.
    logFailure('reconcile order', error);
  }
  return getOrder(input.userId, input.orderId, input.registry);
}

async function findOrder(binding: PaymentBinding, receipt: PaymentReceipt): Promise<OrderRecord | null> {
  const reference = normalizeReference(receipt.orderReference);
  if (receipt.orderCode !== null) {
    const { rows } = await pool.query(
      `SELECT * FROM payment_orders WHERE order_code = $1 AND provider = $2 AND account_id = $3`,
      [String(receipt.orderCode), binding.provider, binding.accountId],
    );
    return (rows[0] as OrderRecord | undefined) ?? null;
  }
  if (!reference) return null;
  const { rows } = await pool.query(
    `SELECT * FROM payment_orders WHERE reference = $1 AND provider = $2 AND account_id = $3`,
    [reference, binding.provider, binding.accountId],
  );
  return (rows[0] as OrderRecord | undefined) ?? null;
}

async function insertEvent(
  client: Pick<PoolClient, 'query'>,
  input: {
    binding: PaymentBinding;
    receipt: PaymentReceipt;
    orderId: string | null;
    eventType: 'webhook' | 'lookup' | 'manual';
    payloadSha256: string;
    result: 'duplicate' | 'review';
    detail: string;
  },
): Promise<string | null> {
  const { rows } = await client.query(
    `INSERT INTO payment_events
       (provider, account_id, provider_transaction_id, transaction_reference, order_id, event_type,
        amount_vnd, currency, occurred_at, payload_sha256, receipt, result, result_detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      input.binding.provider,
      input.binding.accountId,
      input.receipt.providerTransactionId,
      input.receipt.transactionReference,
      input.orderId,
      input.eventType,
      input.receipt.amountVnd,
      input.receipt.currency,
      input.receipt.occurredAt,
      input.payloadSha256,
      JSON.stringify(input.receipt),
      input.result,
      input.detail,
    ],
  );
  return rows[0] ? String(rows[0].id) : null;
}

async function grantFor(order: OrderRecord, eventId: string | null): Promise<{ ok: boolean; detail: string }> {
  const grant = await grantPeriod({
    userId: order.user_id,
    planVersionId: order.plan_version_id,
    source: 'purchase',
    orderId: order.id,
    reason: `payment confirmed for order ${order.reference}`,
    idempotencyKey: `order:${order.id}`,
  });
  if (!grant.ok) {
    if (eventId) {
      await pool.query(`UPDATE payment_events SET result = 'review', result_detail = $2 WHERE id = $1 AND result = 'review'`, [
        eventId,
        `grant_${grant.reason}`,
      ]).catch(() => {});
    }
    return { ok: false, detail: `grant_${grant.reason}` };
  }
  await pool.query(`UPDATE payment_orders SET fulfilled_at = coalesce(fulfilled_at, now()), updated_at = now() WHERE id = $1`, [order.id]);
  if (eventId) {
    // A crash between recording the event and granting leaves the event in review;
    // replaying the same provider transaction finishes the job here. An event that
    // was already a duplicate never becomes the granting event.
    await pool.query(`UPDATE payment_events SET result = 'granted', result_detail = $2 WHERE id = $1 AND result = 'review'`, [
      eventId,
      grant.action,
    ]).catch(() => {});
  }
  return { ok: true, detail: grant.action };
}

/**
 * Records one provider receipt and turns a matching, payable order into coverage.
 * The receipt is either a webhook payload or a lookup transaction; the identity
 * columns are the same, so a payment seen first by a webhook and again by a
 * reconciliation lookup cannot mint two periods.
 */
export async function recordReceipt(input: {
  binding: PaymentBinding;
  eventType: 'webhook' | 'lookup' | 'manual';
  eventId: string;
  payloadSha256: string;
  receipt: PaymentReceipt;
}): Promise<PaymentOutcome> {
  const { receipt, binding } = input;
  if (receipt.currency !== 'VND' || !Number.isSafeInteger(receipt.amountVnd) || receipt.amountVnd <= 0) {
    return { result: 'review', orderId: null, detail: 'invalid_amount' };
  }
  const order = await findOrder(binding, receipt);
  if (!order) {
    const eventId = await insertEvent(pool, {
      ...input,
      orderId: null,
      result: 'review',
      detail: 'order_not_found',
    });
    return { result: eventId ? 'review' : 'duplicate', orderId: null, detail: eventId ? 'order_not_found' : 'duplicate_event' };
  }

  const reference = normalizeReference(receipt.orderReference);
  if (receipt.orderCode !== null && Number(order.order_code) !== receipt.orderCode) {
    const eventId = await insertEvent(pool, { ...input, orderId: order.id, result: 'review', detail: 'order_code_mismatch' });
    return { result: eventId ? 'review' : 'duplicate', orderId: order.id, detail: 'order_code_mismatch' };
  }
  if (reference && reference !== order.reference) {
    const eventId = await insertEvent(pool, { ...input, orderId: order.id, result: 'review', detail: 'reference_mismatch' });
    return { result: eventId ? 'review' : 'duplicate', orderId: order.id, detail: 'reference_mismatch' };
  }

  let eventId: string | null = null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(`SELECT * FROM payment_orders WHERE id = $1 FOR UPDATE`, [order.id]);
    const current = locked.rows[0] as OrderRecord | undefined;
    if (!current) {
      await client.query('ROLLBACK');
      return { result: 'review', orderId: order.id, detail: 'order_missing' };
    }

    if (receipt.amountVnd !== Number(current.amount_vnd)) {
      // A partial or extra transfer is money that needs a human, not a cheaper
      // period: leave the order unpayable and record the receipt for review.
      await client.query(
        `UPDATE payment_orders SET status = 'review', updated_at = now() WHERE id = $1 AND status IN ('pending', 'processing')`,
        [current.id],
      );
      eventId = await insertEvent(client, { ...input, orderId: current.id, result: 'review', detail: 'amount_mismatch' });
      await client.query('COMMIT');
      return { result: eventId ? 'review' : 'duplicate', orderId: current.id, detail: 'amount_mismatch' };
    }

    if (current.status === 'paid') {
      eventId = await insertEvent(client, { ...input, orderId: current.id, result: 'duplicate', detail: 'already_paid' });
      await client.query('COMMIT');
    } else if (['pending', 'processing'].includes(current.status) && (millis(current.expires_at) ?? 0) <= Date.now()) {
      // Money for a checkout that had already closed is a human's call, not a
      // resurrection: the order ends expired and the transfer waits in review.
      await client.query(
        `UPDATE payment_orders SET status = 'expired', updated_at = now() WHERE id = $1 AND status IN ('pending', 'processing')`,
        [current.id],
      );
      eventId = await insertEvent(client, { ...input, orderId: current.id, result: 'review', detail: 'order_expired' });
      await client.query('COMMIT');
      return { result: eventId ? 'review' : 'duplicate', orderId: current.id, detail: 'order_expired' };
    } else if (!['pending', 'processing'].includes(current.status)) {
      // A transfer that arrives after expiry or cancellation is a late payment, not
      // a resurrection: it stays in review with the original order attached.
      eventId = await insertEvent(client, { ...input, orderId: current.id, result: 'review', detail: `order_${current.status}` });
      await client.query('COMMIT');
      return { result: eventId ? 'review' : 'duplicate', orderId: current.id, detail: `order_${current.status}` };
    } else {
      const paid = await client.query(
        `UPDATE payment_orders
            SET status = 'paid', paid_vnd = $2, settled_at = now(), updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [current.id, receipt.amountVnd],
      );
      eventId = await insertEvent(client, { ...input, orderId: current.id, result: 'review', detail: 'grant_pending' });
      await client.query('COMMIT');
      if (!eventId) {
        // A concurrent webhook already recorded this bank transaction; the winner
        // pays and grants, so this one only reports the duplicate.
        return { result: 'duplicate', orderId: current.id, detail: 'duplicate_event' };
      }
      const fresh = paid.rows[0] as OrderRecord | undefined;
      if (!fresh) return { result: 'review', orderId: current.id, detail: 'order_missing' };
      const granted = await grantFor(fresh, eventId);
      return { result: granted.ok ? 'granted' : 'review', orderId: fresh.id, detail: granted.detail };
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logFailure('record payment', error);
    return { result: 'review', orderId: order.id, detail: 'unavailable' };
  } finally {
    client.release();
  }

  // Already paid before this receipt: retry a grant that a previous attempt left
  // unfinished, then report the payment as a duplicate.
  const fresh = await pool.query(`SELECT * FROM payment_orders WHERE id = $1`, [order.id]);
  const paidOrder = fresh.rows[0] as OrderRecord | undefined;
  if (!paidOrder || paidOrder.status !== 'paid') {
    return { result: 'review', orderId: order.id, detail: 'unavailable' };
  }
  if (!paidOrder.fulfilled_at) {
    const granted = await grantFor(paidOrder, eventId);
    return { result: granted.ok ? 'granted' : 'review', orderId: paidOrder.id, detail: granted.detail };
  }
  return { result: 'duplicate', orderId: paidOrder.id, detail: eventId ? 'already_paid' : 'duplicate_event' };
}

/** Verifies a raw webhook against every configured account of that vendor, then
 *  records each receipt. An invalid signature is the caller's 401; a verified
 *  event with nothing payable is a 200 so the gateway stops retrying. */
export async function handleWebhook(input: {
  provider: string;
  body: Buffer;
  headers: Headers;
  registry: PaymentProviderRegistry;
}): Promise<{ ok: true; outcomes: PaymentOutcome[] } | { ok: false; reason: 'invalid_webhook' | 'unavailable' }> {
  const adapters = input.registry.all().filter((provider) => provider.binding.provider === input.provider);
  if (adapters.length === 0) return { ok: false, reason: 'unavailable' };
  let webhook;
  for (const adapter of adapters) {
    try {
      webhook = await adapter.verifyWebhook({ body: input.body, headers: input.headers });
      break;
    } catch (error) {
      if (error instanceof PaymentProviderError && error.code === 'invalid_webhook') continue;
      return { ok: false, reason: error instanceof PaymentProviderError && error.code === 'configuration' ? 'unavailable' : 'invalid_webhook' };
    }
  }
  if (!webhook) return { ok: false, reason: 'invalid_webhook' };
  const payloadSha256 = createHash('sha256').update(input.body).digest('hex');
  const outcomes: PaymentOutcome[] = [];
  for (const receipt of webhook.receipts) {
    outcomes.push(
      await recordReceipt({
        binding: webhook.binding,
        eventType: 'webhook',
        eventId: webhook.eventId,
        payloadSha256,
        receipt,
      }),
    );
  }
  return { ok: true, outcomes };
}

/**
 * Confirms a manual refund: the money has already gone back, so this ends the
 * period that was bought and writes the audit row. It is deliberately not a
 * provider call - both pilot adapters have automated refunds switched off - and it
 * refuses when the period has spent any quota or the seven-day window has closed.
 */
export async function refundOrder(input: {
  orderId: string;
  actorId: string;
  reason: string;
  now?: number;
}): Promise<RefundResult> {
  if (!UUID.test(input.orderId) || !UUID.test(input.actorId) || input.reason.trim().length < 3 || input.reason.length > 500) {
    return { ok: false, reason: 'invalid' };
  }
  const now = input.now ?? Date.now();
  const order = await pool.query(`SELECT * FROM payment_orders WHERE id = $1`, [input.orderId]).catch(() => null);
  if (!order) return { ok: false, reason: 'unavailable' };
  const row = order.rows[0] as OrderRecord | undefined;
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status !== 'paid') return { ok: false, reason: 'not_paid' };
  const settledAt = millis(row.settled_at);
  if (settledAt === null) return { ok: false, reason: 'not_paid' };
  if (now - settledAt > REFUND_WINDOW_MS) return { ok: false, reason: 'window_expired' };

  const membership = await pool.query(
    `SELECT id, starts_at, ends_at, status FROM memberships WHERE order_id = $1 AND user_id = $2`,
    [row.id, row.user_id],
  ).catch(() => null);
  if (!membership) return { ok: false, reason: 'unavailable' };
  const period = membership.rows[0];
  if (!period) return { ok: false, reason: 'not_fulfilled' };
  if (period.status !== 'active') return { ok: false, reason: 'not_fulfilled' };

  // "Unused" is the membership-period buckets, the same rows quota reserved
  // against; a running request shows up as reserved, not consumed.
  const usage = await pool.query(
    `SELECT coalesce(sum(consumed_units), 0)::int AS consumed, coalesce(sum(reserved_units), 0)::int AS reserved
       FROM usage_buckets
      WHERE user_id = $1 AND period_kind = 'membership_period' AND period_start = $2 AND period_end = $3`,
    [row.user_id, period.starts_at, period.ends_at],
  ).catch(() => null);
  if (!usage) return { ok: false, reason: 'unavailable' };
  if (Number(usage.rows[0].consumed) > 0 || Number(usage.rows[0].reserved) > 0) {
    return { ok: false, reason: 'used' };
  }

  const revoked = await revokePeriod({
    membershipId: String(period.id),
    actorId: input.actorId,
    reason: input.reason,
    idempotencyKey: `refund:${row.id}`,
  });
  if (!revoked.ok) return { ok: false, reason: revoked.reason === 'not_found' ? 'not_found' : 'unavailable' };
  return { ok: true, membershipId: revoked.membershipId, duplicate: revoked.duplicate };
}

function logFailure(what: string, error: unknown): void {
  console.error(`payment ${what} failed`, error instanceof Error ? error.message : error);
}
