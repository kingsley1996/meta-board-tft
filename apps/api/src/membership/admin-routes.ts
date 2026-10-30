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
//   GET  /plans                   plan versions with the history that pins them
//   POST /plans                   a new draft version, copied from a source row
//   POST /plans/:id/activate      retire the current version of that code, sell this one
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

// --- Plan versions (#98) -----------------------------------------------------
//
// A plan version that has orders, periods or buckets is history: the database
// trigger refuses to re-price it, so the only supported edit is a new version
// plus an explicit activation. Both writes live here rather than in a settings
// form because they change what every future checkout is charged.

type PlanRow = {
  id: string;
  code: string;
  version: number;
  status: string;
  label: string;
  price_vnd: number;
  currency: string;
  term_days: number | null;
  chat_per_period: number;
  chat_per_day: number;
  stt_seconds_per_period: number;
  tts_characters_per_period: number;
  chat_requests_per_minute: number | null;
  max_concurrent_requests: number | null;
  max_stt_seconds_per_request: number | null;
  max_concurrent_tts_chunks: number | null;
  created_at: Date | string;
  orders: number;
  memberships: number;
  buckets: number;
};

const PLAN_COLUMNS = `p.id, p.code, p.version, p.status, p.label, p.price_vnd, p.currency, p.term_days,
  p.chat_per_period, p.chat_per_day, p.stt_seconds_per_period, p.tts_characters_per_period,
  p.chat_requests_per_minute, p.max_concurrent_requests, p.max_stt_seconds_per_request,
  p.max_concurrent_tts_chunks, p.created_at,
  (SELECT count(*)::int FROM payment_orders o WHERE o.plan_version_id = p.id) AS orders,
  (SELECT count(*)::int FROM memberships m WHERE m.plan_version_id = p.id) AS memberships,
  (SELECT count(*)::int FROM usage_buckets b WHERE b.plan_version_id = p.id) AS buckets`;

function planView(row: PlanRow) {
  return {
    id: String(row.id),
    code: String(row.code),
    version: Number(row.version),
    status: String(row.status),
    label: String(row.label),
    priceVnd: Number(row.price_vnd),
    termDays: row.term_days === null ? null : Number(row.term_days),
    allowances: {
      chatPerPeriod: Number(row.chat_per_period),
      chatPerDay: Number(row.chat_per_day),
      sttSecondsPerPeriod: Number(row.stt_seconds_per_period),
      ttsCharactersPerPeriod: Number(row.tts_characters_per_period),
    },
    limits: {
      chatRequestsPerMinute: row.chat_requests_per_minute === null ? null : Number(row.chat_requests_per_minute),
      maxConcurrentRequests: row.max_concurrent_requests === null ? null : Number(row.max_concurrent_requests),
      maxSttSecondsPerRequest: row.max_stt_seconds_per_request === null ? null : Number(row.max_stt_seconds_per_request),
      maxConcurrentTtsChunks: row.max_concurrent_tts_chunks === null ? null : Number(row.max_concurrent_tts_chunks),
    },
    createdAt: iso(row.created_at),
    history: { orders: Number(row.orders), memberships: Number(row.memberships), buckets: Number(row.buckets) },
  };
}

const count = (value: unknown, min: number, max: number): number | null => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
};

adminMembershipRouter.get('/plans', async (req, res) => {
  if (!(await operator(req, res))) return;
  const rows = await pool
    .query(`SELECT ${PLAN_COLUMNS} FROM plan_versions p ORDER BY p.code, p.version DESC`)
    .catch(() => null);
  if (!rows) {
    return res.status(503).json({ error: 'Membership data is unavailable. Try again shortly.', code: 'membership_unavailable' });
  }
  noStore(res);
  return res.json({ plans: (rows.rows as PlanRow[]).map(planView) });
});

adminMembershipRouter.post('/plans', async (req, res) => {
  const actorId = await operator(req, res);
  if (!actorId) return;
  const body = req.body ?? {};
  if (!UUID.test(String(body.sourceId ?? ''))) {
    return res.status(400).json({ error: 'sourceId must name the version to copy.', code: 'invalid_plan' });
  }
  const priceVnd = count(body.priceVnd, 0, 100_000_000);
  const chatPerPeriod = count(body.chatPerPeriod ?? 0, 0, 10_000_000);
  const chatPerDay = count(body.chatPerDay ?? 0, 0, 10_000_000);
  const sttSecondsPerPeriod = count(body.sttSecondsPerPeriod ?? 0, 0, 10_000_000);
  const ttsCharactersPerPeriod = count(body.ttsCharactersPerPeriod ?? 0, 0, 10_000_000);
  const termRaw = body.termDays;
  const termDays = termRaw === null || termRaw === undefined ? null : count(termRaw, 1, 366);
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (priceVnd === null || chatPerPeriod === null || chatPerDay === null || sttSecondsPerPeriod === null || ttsCharactersPerPeriod === null) {
    return res.status(400).json({ error: 'Prices and allowances must be whole numbers within range.', code: 'invalid_plan' });
  }
  if (termDays === null && termRaw !== null && termRaw !== undefined) {
    return res.status(400).json({ error: 'termDays must be empty or 1-366.', code: 'invalid_plan' });
  }
  if (label.length > 60) {
    return res.status(400).json({ error: 'Label is limited to 60 characters.', code: 'invalid_plan' });
  }

  const client = await pool.connect().catch(() => null);
  if (!client) {
    return res.status(503).json({ error: 'Membership data is unavailable. Try again shortly.', code: 'membership_unavailable' });
  }
  try {
    await client.query('BEGIN');
    // Lock the code's rows so two operators cannot both compute version+1.
    const source = await client.query(
      `SELECT * FROM plan_versions WHERE id = $1 FOR UPDATE`,
      [String(body.sourceId)],
    );
    const base = source.rows[0] as PlanRow | undefined;
    if (!base) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'no such plan version', code: 'not_found' });
    }
    // Lock every row of the code, not just the source, or two creates could
    // both read max(version) and collide on the (code, version) unique key.
    await client.query('SELECT id FROM plan_versions WHERE code = $1 FOR UPDATE', [base.code]);
    const next = await client.query(
      `SELECT coalesce(max(version), 0) + 1 AS version FROM plan_versions WHERE code = $1`,
      [base.code],
    );
    const inserted = await client.query(
      `INSERT INTO plan_versions (
         code, version, status, label, price_vnd, currency, term_days,
         chat_per_period, chat_per_day, stt_seconds_per_period, tts_characters_per_period,
         chat_requests_per_minute, max_concurrent_requests, max_stt_seconds_per_request,
         max_concurrent_tts_chunks)
       VALUES ($1, $2, 'draft', $3, $4, 'VND', $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        base.code,
        Number(next.rows[0].version),
        label || base.label,
        priceVnd,
        termDays,
        chatPerPeriod,
        chatPerDay,
        sttSecondsPerPeriod,
        ttsCharactersPerPeriod,
        base.chat_requests_per_minute,
        base.max_concurrent_requests,
        base.max_stt_seconds_per_request,
        base.max_concurrent_tts_chunks,
      ],
    );
    // Same transaction as the insert: if the audit row cannot be written, the
    // version is not created either.
    await client.query(
      `INSERT INTO admin_audit (actor_id, action, target, detail) VALUES ($1, 'plan_version.create', $2, $3)`,
      [
        actorId,
        `${base.code} v${Number(next.rows[0].version)}`,
        JSON.stringify({
          planVersionId: inserted.rows[0].id,
          sourceId: base.id,
          before: { priceVnd: Number(base.price_vnd), termDays: base.term_days, allowances: { chatPerPeriod: base.chat_per_period, chatPerDay: base.chat_per_day, sttSecondsPerPeriod: base.stt_seconds_per_period, ttsCharactersPerPeriod: base.tts_characters_per_period } },
          after: { priceVnd, termDays, allowances: { chatPerPeriod, chatPerDay, sttSecondsPerPeriod, ttsCharactersPerPeriod } },
        }),
      ],
    );
    const created = await client.query(`SELECT ${PLAN_COLUMNS} FROM plan_versions p WHERE p.id = $1`, [inserted.rows[0].id]);
    await client.query('COMMIT');
    noStore(res);
    return res.status(201).json({ plan: planView(created.rows[0] as PlanRow) });
  } catch {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(503).json({ error: 'Membership data is unavailable. Try again shortly.', code: 'membership_unavailable' });
  } finally {
    client.release();
  }
});

adminMembershipRouter.post('/plans/:id/activate', async (req, res) => {
  const actorId = await operator(req, res);
  if (!actorId) return;
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'no such plan version', code: 'not_found' });
  const client = await pool.connect().catch(() => null);
  if (!client) {
    return res.status(503).json({ error: 'Membership data is unavailable. Try again shortly.', code: 'membership_unavailable' });
  }
  try {
    await client.query('BEGIN');
    const target = await client.query('SELECT code, status, version FROM plan_versions WHERE id = $1 FOR UPDATE', [req.params.id]);
    const row = target.rows[0] as { code: string; status: string; version: number } | undefined;
    if (!row) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'no such plan version', code: 'not_found' });
    }
    if (row.status !== 'active') {
      // Retire first: the partial unique index allows one active row per code,
      // so both statements have to land in the same transaction.
      const retired = await client.query(
        `UPDATE plan_versions SET status = 'retired' WHERE code = $1 AND status = 'active' AND id <> $2 RETURNING id, version`,
        [row.code, req.params.id],
      );
      await client.query(`UPDATE plan_versions SET status = 'active' WHERE id = $1`, [req.params.id]);
      await client.query(
        `INSERT INTO admin_audit (actor_id, action, target, detail) VALUES ($1, 'plan_version.activate', $2, $3)`,
        [
          actorId,
          `${row.code} v${Number(row.version)}`,
          JSON.stringify({
            planVersionId: req.params.id,
            previousStatus: row.status,
            retired: retired.rows.map((entry) => ({ id: entry.id, version: Number(entry.version) })),
          }),
        ],
      );
    }
    const updated = await client.query(`SELECT ${PLAN_COLUMNS} FROM plan_versions p WHERE p.id = $1`, [req.params.id]);
    await client.query('COMMIT');
    noStore(res);
    return res.json({ ok: true, duplicate: row.status === 'active', plan: planView(updated.rows[0] as PlanRow) });
  } catch {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(503).json({ error: 'Membership data is unavailable. Try again shortly.', code: 'membership_unavailable' });
  } finally {
    client.release();
  }
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
