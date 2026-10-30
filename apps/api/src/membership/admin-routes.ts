import { Router, type Request, type Response } from 'express';
import { pool } from '../db.ts';
import { currentSessionUser, type AuthedRequest } from '../auth-routes.ts';
import { findUserByEmail } from '../accounts.ts';
import { grantPeriod, listActiveOffers } from './lifecycle.ts';
import { refundOrder } from './orders.ts';

// Membership admin (task #91): what the operator needs to run the pilot.
//
//   GET  /orders?status=&q=       every order with its account and period
//   POST /orders/:id/refund       revoke the period of an unused, paid order
//   POST /grants                  mint a term by hand (actor + reason on the audit)
//   GET  /audit                   append-only membership event feed
//
// Refunds here never move money: both pilot adapters have automated refunds off,
// so this records "the operator has already sent it back". The route is mounted
// under /api/admin and repeats the role check: a router that is safe only because
// of its mount point is one refactor away from being open.

export const adminMembershipRouter = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_KEY = /^[A-Za-z0-9._:-]{8,200}$/;
const ORDER_STATUSES = ['pending', 'processing', 'paid', 'underpaid', 'expired', 'canceled', 'failed', 'review'] as const;

type OrderStatus = (typeof ORDER_STATUSES)[number];

function noStore(res: Response): Response {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Cookie');
  return res;
}

async function operator(req: Request, res: Response): Promise<string | null> {
  const user = await currentSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Sign in as an admin to use this page.', code: 'unauthenticated' });
    return null;
  }
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'admin account required', code: 'admin_only' });
    return null;
  }
  (req as AuthedRequest).authUser = user;
  return user.id;
}

const millis = (value: unknown): number | null => {
  const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
};

const iso = (value: unknown): string | null => {
  const time = millis(value);
  return time === null ? null : new Date(time).toISOString();
};

/** A pending order past its deadline is closed for the buyer even though the row
 *  stays payable for a late transfer; both screens have to agree on that. */
function effectiveStatus(status: string, expiresAt: number | null, now: number): string {
  if ((status === 'pending' || status === 'processing') && expiresAt !== null && expiresAt <= now) return 'expired';
  return status;
}

function planSnapshot(value: unknown): { code: string | null; label: string | null; termDays: number | null } {
  const snapshot = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const plan = snapshot.plan && typeof snapshot.plan === 'object' ? (snapshot.plan as Record<string, unknown>) : {};
  const termDays = Number(plan.termDays);
  return {
    code: typeof plan.code === 'string' ? plan.code : null,
    label: typeof plan.label === 'string' ? plan.label : null,
    termDays: Number.isSafeInteger(termDays) && termDays > 0 ? termDays : null,
  };
}

adminMembershipRouter.get('/orders', async (req, res) => {
  if (!(await operator(req, res))) return;
  const wanted = typeof req.query.status === 'string' ? req.query.status : '';
  const status = (ORDER_STATUSES as readonly string[]).includes(wanted) ? (wanted as OrderStatus) : null;
  const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  const limitRaw = Number(req.query.limit);
  const limit = Number.isSafeInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 100;
  const now = Date.now();

  const where: string[] = [];
  const values: unknown[] = [];
  if (query) {
    values.push(`%${query}%`);
    where.push(`(o.reference ILIKE $${values.length} OR u.email ILIKE $${values.length} OR coalesce(u.name, '') ILIKE $${values.length})`);
  }
  if (status) {
    values.push(status);
    // Filter on the same effective status the row is rendered with, otherwise a
    // lapsed pending order would answer "pending" searches forever.
    where.push(
      `(CASE WHEN o.status IN ('pending', 'processing') AND o.expires_at <= now() THEN 'expired' ELSE o.status END) = $${values.length}`,
    );
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await pool.query(
    `SELECT o.id, o.reference, o.status, o.amount_vnd, o.paid_vnd, o.provider, o.offer_snapshot,
            o.created_at, o.expires_at, o.settled_at, o.fulfilled_at,
            u.id AS user_id, u.email, u.name,
            m.id AS membership_id, m.status AS membership_status, m.starts_at, m.ends_at
       FROM payment_orders o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN memberships m ON m.order_id = o.id
       ${clause}
      ORDER BY o.created_at DESC
      LIMIT $${values.length + 1}`,
    [...values, limit],
  ).catch(() => null);
  if (!rows) {
    return res.status(503).json({ error: 'Membership data is unavailable. Try again shortly.', code: 'membership_unavailable' });
  }

  const orders = rows.rows
    .map((row) => {
      const expiresAt = millis(row.expires_at);
      const plan = planSnapshot(row.offer_snapshot);
      return {
        id: String(row.id),
        reference: String(row.reference),
        status: effectiveStatus(String(row.status), expiresAt, now),
        amountVnd: Number(row.amount_vnd),
        paidVnd: row.paid_vnd === null ? null : Number(row.paid_vnd),
        provider: String(row.provider),
        createdAt: iso(row.created_at),
        expiresAt: iso(row.expires_at),
        paidAt: iso(row.settled_at),
        plan,
        account: { id: String(row.user_id), email: String(row.email), name: row.name === null ? null : String(row.name) },
        membership: row.membership_id
          ? {
              id: String(row.membership_id),
              status: String(row.membership_status),
              startsAt: iso(row.starts_at),
              endsAt: iso(row.ends_at),
            }
          : null,
      };
    })
    .slice(0, limit);

  const stats = await pool.query(
    `SELECT
       count(*) FILTER (WHERE eff = 'pending')::int AS pending,
       count(*) FILTER (WHERE eff = 'review')::int AS review,
       count(*) FILTER (WHERE status = 'paid' AND settled_at >= now() - interval '30 days')::int AS paid30,
       coalesce(sum(amount_vnd) FILTER (WHERE status = 'paid' AND settled_at >= now() - interval '30 days'), 0)::int AS revenue30
     FROM (
       SELECT status, settled_at, amount_vnd,
              CASE WHEN status IN ('pending', 'processing') AND expires_at <= now() THEN 'expired' ELSE status END AS eff
         FROM payment_orders
     ) o`,
  ).catch(() => null);
  const members = await pool.query(
    `SELECT count(*)::int AS active FROM memberships WHERE status = 'active' AND starts_at <= now() AND ends_at > now()`,
  ).catch(() => null);
  const stale = await pool.query(
    `SELECT count(*) FILTER (WHERE status = 'needs_recovery')::int AS needs_recovery
       FROM usage_requests`,
  ).catch(() => null);

  noStore(res);
  return res.json({
    orders,
    stats: {
      pending: Number(stats?.rows[0]?.pending ?? 0),
      review: Number(stats?.rows[0]?.review ?? 0),
      paid30: Number(stats?.rows[0]?.paid30 ?? 0),
      revenue30: Number(stats?.rows[0]?.revenue30 ?? 0),
      activeMembers: Number(members?.rows[0]?.active ?? 0),
      needsRecovery: Number(stale?.rows[0]?.needs_recovery ?? 0),
    },
  });
});

adminMembershipRouter.post('/orders/:id/refund', async (req, res) => {
  const actorId = await operator(req, res);
  if (!actorId) return;
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'no such order', code: 'not_found' });
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 500) {
    return res.status(400).json({ error: 'A reason of 3-500 characters is required.', code: 'invalid_reason' });
  }
  const result = await refundOrder({ orderId: req.params.id, actorId, reason });
  if (result.ok) {
    noStore(res);
    return res.json({ ok: true, membershipId: result.membershipId, duplicate: result.duplicate });
  }
  const map: Record<string, [number, string]> = {
    invalid: [400, 'invalid_refund'],
    not_found: [404, 'not_found'],
    not_paid: [409, 'order_not_paid'],
    not_fulfilled: [409, 'membership_missing'],
    window_expired: [409, 'refund_window_closed'],
    used: [409, 'period_used'],
    unavailable: [503, 'membership_unavailable'],
  };
  const [code, errorCode] = map[result.reason] ?? [503, 'membership_unavailable'];
  return res.status(code).json({ error: result.reason, code: errorCode });
});

adminMembershipRouter.post('/grants', async (req, res) => {
  const actorId = await operator(req, res);
  if (!actorId) return;
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const planCode = typeof req.body?.planCode === 'string' ? req.body.planCode.trim() : '';
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  const requestKey = (req.get('x-request-key') ?? '').trim();
  if (!email || !planCode) return res.status(400).json({ error: 'email and planCode are required', code: 'invalid_grant' });
  if (reason.length < 3 || reason.length > 500) {
    return res.status(400).json({ error: 'A reason of 3-500 characters is required.', code: 'invalid_reason' });
  }
  if (!REQUEST_KEY.test(requestKey)) {
    return res.status(400).json({ error: 'x-request-key header is required', code: 'invalid_request_key' });
  }
  const account = await findUserByEmail(email).catch(() => null);
  if (!account) return res.status(404).json({ error: 'no such account', code: 'not_found' });
  const offers = await listActiveOffers();
  if (!('offers' in offers)) {
    return res.status(503).json({ error: 'Membership data is unavailable. Try again shortly.', code: 'membership_unavailable' });
  }
  const offer = offers.offers.find((entry) => entry.code === planCode);
  if (!offer) return res.status(409).json({ error: 'plan is not on sale', code: 'offer_not_sellable' });

  const granted = await grantPeriod({
    userId: account.id,
    planVersionId: offer.planVersionId,
    source: 'grant',
    actorId,
    reason,
    idempotencyKey: `admin-grant:${actorId}:${requestKey}`.slice(0, 200),
  });
  if (!granted.ok) {
    const code = granted.reason === 'not_sellable' ? 409 : granted.reason === 'invalid' ? 400 : 503;
    return res.status(code).json({ error: granted.reason, code: granted.reason === 'not_sellable' ? 'offer_not_sellable' : 'grant_failed' });
  }
  noStore(res);
  return res.json({
    ok: true,
    duplicate: granted.duplicate,
    action: granted.action,
    membershipId: granted.membershipId,
    startsAt: new Date(granted.startsAt).toISOString(),
    endsAt: new Date(granted.endsAt).toISOString(),
    state: granted.state,
    account: { id: account.id, email: account.email, name: account.name },
  });
});

adminMembershipRouter.get('/audit', async (req, res) => {
  if (!(await operator(req, res))) return;
  const limitRaw = Number(req.query.limit);
  const limit = Number.isSafeInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
  const rows = await pool.query(
    `SELECT e.id, e.action, e.source, e.reason, e.period_start, e.period_end, e.created_at,
            u.email AS account_email,
            a.email AS actor_email,
            p.code AS plan_code, p.label AS plan_label
       FROM membership_events e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN users a ON a.id = e.actor_id
       JOIN plan_versions p ON p.id = e.plan_version_id
      ORDER BY e.created_at DESC
      LIMIT $1`,
    [limit],
  ).catch(() => null);
  if (!rows) {
    return res.status(503).json({ error: 'Membership data is unavailable. Try again shortly.', code: 'membership_unavailable' });
  }
  noStore(res);
  return res.json({
    events: rows.rows.map((row) => ({
      id: String(row.id),
      action: String(row.action),
      source: String(row.source),
      reason: String(row.reason),
      accountEmail: String(row.account_email),
      actorEmail: row.actor_email === null ? null : String(row.actor_email),
      planCode: String(row.plan_code),
      planLabel: String(row.plan_label),
      periodStart: iso(row.period_start),
      periodEnd: iso(row.period_end),
      createdAt: iso(row.created_at),
    })),
  });
});
