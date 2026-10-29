import { pool } from '../db.ts';
import { calendarMonthWindow, planQuotaFromRow, type PlanQuota } from './quota.ts';

// Membership lifecycle and entitlement (task #86, docs/MEMBERSHIP-PLAN.md section 3).
//
// Coverage is the half-open interval [starts_at, ends_at) stored on the row, and the
// state is read off the clock at request time. No cron firing on time is part of
// correctness: a period that has ended has already stopped granting rights and one
// that has not started has not begun to, whether or not anything woke up.
//
// Two rules decide everything else:
//   - Paid periods on one account never overlap. Renewing while coverage is still
//     running appends after the last period, so buying the same plan twice early
//     buys sixty days of service, not two simultaneous 150-turn allowances.
//   - Entitlement that cannot be read is an error, never a default. A missing,
//     draft or malformed plan row answers `unavailable` instead of handing out the
//     Free allowance - or worse, unlimited usage.
//
// Nothing here prices anything or talks to a payment provider. Fulfilment (#87)
// verifies a payment and then calls grantPeriod; reserve/settle (#81) spends what
// resolveEntitlement names.

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,200}$/;

/** The plan code the fallback tier is seeded under. A user with no paid period
 *  covering them gets this row, and no active row means no entitlement at all.
 *
 *  It is a deploy-time name, not a hard-coded string, because the fallback tier is
 *  data: the same code has to resolve whatever the operator named the free offer,
 *  and a test must be able to point at its own row instead of sharing the one
 *  production account's tier lives on. */
export const FREE_PLAN_CODE = 'free';
const FREE_PLAN_CODE_ENV = 'MEMBERSHIP_FREE_PLAN_CODE';

export function freePlanCode(): string {
  const configured = process.env[FREE_PLAN_CODE_ENV]?.trim();
  return configured && configured.length > 0 && configured.length <= 40 ? configured : FREE_PLAN_CODE;
}

export type PeriodState = 'active' | 'scheduled' | 'expired' | 'revoked';

export type MembershipPeriod = {
  id: string;
  planVersionId: string;
  planCode: string;
  planLabel: string;
  /** The offer's own status. A retired plan can still be running: "no longer
   *  advertised" and "your period ended" are different facts, and a reader that
   *  cannot see this column would merge them. */
  planStatus: string;
  source: 'purchase' | 'grant';
  orderId: string | null;
  grantedBy: string | null;
  startsAt: number;
  endsAt: number;
  status: 'active' | 'revoked';
  /** Derived from the clock and the status: `scheduled` and `expired` are never
   *  stored, so they cannot disagree with the interval they came from. */
  state: PeriodState;
};

export type Entitlement = {
  ok: true;
  /** The plan whose allowances and execution limits apply right now. */
  plan: PlanQuota;
  planCode: string;
  planLabel: string;
  priceVnd: number;
  /** False when the answer is the fallback tier rather than a bought period. */
  paid: boolean;
  /** The paid period granting this, or null on the fallback tier. */
  period: MembershipPeriod | null;
  /** When the next bought period begins, for "Plus starts in 4 days". */
  nextPeriodStartsAt: number | null;
  /** When the most recent bought period ended, for "expired on ...". */
  lastPeriodEndsAt: number | null;
};

export type Unavailable = { ok: false; reason: 'unavailable' };

export type MembershipEvent = {
  id: string;
  membershipId: string | null;
  planCode: string;
  planLabel: string;
  action: string;
  actorId: string | null;
  source: string;
  reason: string;
  periodStart: number | null;
  periodEnd: number | null;
  createdAt: number;
};

function ms(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Reads what an account is entitled to at one instant. */
export async function resolveEntitlement(userId: string, now = Date.now()): Promise<Entitlement | Unavailable> {
  if (!UUID.test(String(userId))) return { ok: false, reason: 'unavailable' };
  try {
    const { rows } = await pool.query(
      `SELECT m.id, m.plan_version_id, m.starts_at, m.ends_at, m.status, m.source, m.order_id, m.granted_by,
              p.code, p.label, p.price_vnd, p.term_days, p.status AS plan_status,
              p.chat_per_period, p.chat_per_day, p.stt_seconds_per_period, p.tts_characters_per_period,
              p.chat_requests_per_minute, p.max_concurrent_requests, p.max_stt_seconds_per_request,
              p.max_concurrent_tts_chunks
         FROM memberships m
         JOIN plan_versions p ON p.id = m.plan_version_id
        WHERE m.user_id = $1
        ORDER BY m.starts_at, m.id`,
      [userId],
    );
    const periods = rows
      .map((row: Record<string, unknown>) => toPeriod(row, now))
      .filter((period): period is MembershipPeriod => period !== null);

    const covering = periods.filter((period) => period.status === 'active' && period.startsAt <= now && period.endsAt > now);
    // Overlaps should be impossible; if history ever contains one, the period that
    // runs longest wins instead of whichever row sorts first.
    const granted = covering.length === 0 ? null : covering.reduce((a, b) => (b.endsAt > a.endsAt ? b : a));
    const nextStart = periods
      .filter((period) => period.status === 'active' && period.startsAt > now && period.id !== granted?.id)
      .reduce<number | null>((min, period) => (min === null || period.startsAt < min ? period.startsAt : min), null);
    const lastEnd = periods
      .filter((period) => period.endsAt <= now)
      .reduce<number | null>((max, period) => (max === null || period.endsAt > max ? period.endsAt : max), null);

    if (granted) {
      const row = rows.find((item: Record<string, unknown>) => String(item.id) === granted.id);
      // The period exists but its plan does not read as a plan: the allowances the
      // user bought are unknowable, so this is an outage, not a downgrade to Free.
      if (!row) return { ok: false, reason: 'unavailable' };
      const plan = planQuotaFromRow(planColumns(row), { start: granted.startsAt, end: granted.endsAt }, true);
      if (!plan) return { ok: false, reason: 'unavailable' };
      return {
        ok: true,
        plan,
        planCode: String(row.code),
        planLabel: String(row.label),
        priceVnd: Number(row.price_vnd),
        paid: true,
        period: granted,
        nextPeriodStartsAt: nextStart,
        lastPeriodEndsAt: lastEnd,
      };
    }

    const fallbackCode = freePlanCode();
    const free = await pool.query(`SELECT * FROM plan_versions WHERE code = $1 AND status = 'active' LIMIT 1`, [fallbackCode]);
    const plan = planQuotaFromRow(free.rows[0] ?? null, calendarMonthWindow(now));
    // No active fallback tier means the offer was never activated - the state the
    // pilot ships in. Nothing is entitled to anything yet, and Coach must be told
    // that rather than given an invented allowance.
    if (!plan) return { ok: false, reason: 'unavailable' };
    return {
      ok: true,
      plan,
      planCode: fallbackCode,
      planLabel: String(free.rows[0]?.label ?? 'Free'),
      priceVnd: 0,
      paid: false,
      period: null,
      nextPeriodStartsAt: nextStart,
      lastPeriodEndsAt: lastEnd,
    };
  } catch (error) {
    logFailure('resolve entitlement', error);
    return { ok: false, reason: 'unavailable' };
  }
}

/** The join aliases the plan's own status to plan_status; planQuotaFromRow reads a
 *  plan_versions row, so it gets the columns under the names it expects. */
function planColumns(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, id: row.plan_version_id, status: row.plan_status };
}

/** One definition of what a row means at one instant, used by every reader here:
 *  only `active` and `revoked` are stored, the other two are properties of the
 *  clock, so no scheduled period ever has to be promoted and no expired period
 *  ever has to be swept. */
export function periodState(status: string, startsAt: number, endsAt: number, now: number): PeriodState {
  if (status === 'revoked') return 'revoked';
  if (now < startsAt) return 'scheduled';
  if (now >= endsAt) return 'expired';
  return 'active';
}

/** A period the caller can be trusted with: a row whose own columns all read.
 *  Anything malformed is dropped, which makes the account fall back to Free or to
 *  `unavailable` rather than run on a half-parsed purchase. */
function toPeriod(row: Record<string, unknown>, now: number): MembershipPeriod | null {
  const id = String(row.id ?? '');
  const startsAt = ms(row.starts_at);
  const endsAt = ms(row.ends_at);
  const status = String(row.status ?? '');
  const source = String(row.source ?? '');
  if (!UUID.test(id)) return null;
  if (startsAt === null || endsAt === null || endsAt <= startsAt) return null;
  if (status !== 'active' && status !== 'revoked') return null;
  if (source !== 'purchase' && source !== 'grant') return null;
  return {
    id,
    planVersionId: String(row.plan_version_id ?? ''),
    planCode: String(row.code ?? ''),
    planLabel: String(row.label ?? ''),
    planStatus: String(row.plan_status ?? ''),
    source,
    orderId: row.order_id === null || row.order_id === undefined ? null : String(row.order_id),
    grantedBy: row.granted_by === null || row.granted_by === undefined ? null : String(row.granted_by),
    startsAt,
    endsAt,
    status,
    state: periodState(status, startsAt, endsAt, now),
  };
}

export type GrantInput = {
  userId: string;
  planVersionId: string;
  source: 'purchase' | 'grant';
  /** Required for a purchase, forbidden for a grant - the schema CHECK says so too. */
  orderId?: string | null;
  /** Required for a grant: the admin who made it. */
  actorId?: string | null;
  reason: string;
  idempotencyKey?: string | null;
  /** The instant the payment was verified or the decision made. Coverage starts
   *  here unless the account is already covered, in which case it appends. */
  verifiedAt?: number;
};

export type GrantResult =
  | {
      ok: true;
      duplicate: boolean;
      action: 'grant' | 'renew';
      membershipId: string;
      startsAt: number;
      endsAt: number;
      /** `expired` and `revoked` only appear on a replayed key whose period has
       *  since moved on, which is exactly what the caller needs to be told. */
      state: PeriodState;
    }
  | { ok: false; reason: 'invalid' | 'not_sellable' | 'unavailable' };

/** Mints one paid period on an account.
 *
 *  The account row is locked for the whole operation, which is what makes two
 *  simultaneous renewals queue instead of both appending after the same last
 *  period - a lock on memberships alone could not do that for an account that has
 *  never bought anything. The period, its audit row and its idempotency key commit
 *  in one transaction, so a crash leaves either a complete grant or none. */
export async function grantPeriod(input: GrantInput): Promise<GrantResult> {
  const invalid = validateGrantInput(input);
  if (invalid) return { ok: false, reason: invalid };
  const verifiedAt = input.verifiedAt ?? Date.now();
  if (!Number.isSafeInteger(verifiedAt)) return { ok: false, reason: 'invalid' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [input.userId]);
    if ((account.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'invalid' };
    }

    if (input.idempotencyKey) {
      const seen = await client.query(
        `SELECT e.membership_id, e.action, m.starts_at, m.ends_at, m.status
           FROM membership_events e
           LEFT JOIN memberships m ON m.id = e.membership_id
          WHERE e.user_id = $1 AND e.idempotency_key = $2`,
        [input.userId, input.idempotencyKey],
      );
      if ((seen.rowCount ?? 0) > 0 && seen.rows[0]?.membership_id) {
        const startsAt = ms(seen.rows[0].starts_at);
        const endsAt = ms(seen.rows[0].ends_at);
        await client.query('COMMIT');
        if (startsAt === null || endsAt === null) return { ok: false, reason: 'unavailable' };
        return {
          ok: true,
          duplicate: true,
          action: seen.rows[0].action === 'renew' ? 'renew' : 'grant',
          membershipId: String(seen.rows[0].membership_id),
          startsAt,
          endsAt,
          state: periodState(String(seen.rows[0].status), startsAt, endsAt, verifiedAt),
        };
      }
    }

    // A purchase can only mint what was actually paid for, against the plan the
    // order was created for: that is what stops a mis-read webhook from turning a
    // Plus order into some other product.
    if (input.source === 'purchase') {
      const order = await client.query(`SELECT user_id, plan_version_id, status FROM payment_orders WHERE id = $1 FOR UPDATE`, [
        input.orderId,
      ]);
      const row = order.rows[0];
      if (!row || String(row.user_id) !== input.userId || String(row.plan_version_id) !== input.planVersionId) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'invalid' };
      }
      // Only a verified payment mints coverage; a pending, review or refunded
      // order is not money received.
      if (row.status !== 'paid') {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'not_sellable' };
      }
      // One order buys one period whether or not the caller brought a key: a
      // fulfilment that runs twice has to be told about the period it already made
      // instead of colliding with the unique index and reporting an outage.
      const bought = await client.query(`SELECT id, starts_at, ends_at, status FROM memberships WHERE order_id = $1`, [input.orderId]);
      const existing = bought.rows[0];
      if (existing) {
        const startsAt = ms(existing.starts_at);
        const endsAt = ms(existing.ends_at);
        await client.query('COMMIT');
        if (startsAt === null || endsAt === null) return { ok: false, reason: 'unavailable' };
        return {
          ok: true,
          duplicate: true,
          action: 'grant',
          membershipId: String(existing.id),
          startsAt,
          endsAt,
          state: periodState(String(existing.status), startsAt, endsAt, verifiedAt),
        };
      }
    }

    const plan = await client.query(`SELECT * FROM plan_versions WHERE id = $1`, [input.planVersionId]);
    const planRow = plan.rows[0];
    // A new period is minted only on an offer that is on sale. Retiring an offer
    // stops new sales and does not touch periods that already exist, which is why
    // resolveEntitlement reads retired rows and this function refuses them. A draft
    // row was never sellable at all.
    if (!planRow || planRow.status !== 'active') {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'not_sellable' };
    }
    const termDays = planRow.term_days === null ? null : Number(planRow.term_days);
    // The fallback tier has no period to buy: a membership row for it would give
    // two overlapping definitions of what the user has.
    if (termDays === null || !Number.isSafeInteger(termDays) || termDays < 1) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'not_sellable' };
    }

    const coverage = await client.query(
      `SELECT MAX(ends_at) AS last_end FROM memberships WHERE user_id = $1 AND status = 'active'`,
      [input.userId],
    );
    const lastEnd = ms(coverage.rows[0]?.last_end);
    const startsAt = lastEnd === null || lastEnd < verifiedAt ? verifiedAt : lastEnd;
    const endsAt = startsAt + termDays * DAY_MS;
    const action: 'grant' | 'renew' = lastEnd === null || lastEnd <= verifiedAt ? 'grant' : 'renew';

    const inserted = await client.query(
      `INSERT INTO memberships (user_id, plan_version_id, starts_at, ends_at, status, source, order_id, granted_by)
       VALUES ($1, $2, $3, $4, 'active', $5, $6, $7) RETURNING id`,
      [
        input.userId,
        input.planVersionId,
        new Date(startsAt).toISOString(),
        new Date(endsAt).toISOString(),
        input.source,
        input.orderId ?? null,
        input.actorId ?? null,
      ],
    );
    const membershipId = String(inserted.rows[0].id);
    await client.query(
      `INSERT INTO membership_events
         (user_id, membership_id, plan_version_id, action, actor_id, source, reason, period_start, period_end, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.userId,
        membershipId,
        input.planVersionId,
        action,
        input.actorId ?? null,
        eventSource(input.source),
        input.reason,
        new Date(startsAt).toISOString(),
        new Date(endsAt).toISOString(),
        input.idempotencyKey ?? null,
      ],
    );
    await client.query('COMMIT');
    return { ok: true, duplicate: false, action, membershipId, startsAt, endsAt, state: startsAt <= verifiedAt ? 'active' : 'scheduled' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    // A unique violation lands here: the order or the key already produced a period
    // in an earlier attempt. Reporting failure rather than a second success is what
    // makes the caller retry and read the period back through its key.
    logFailure('grant period', error);
    return { ok: false, reason: 'unavailable' };
  } finally {
    client.release();
  }
}

function validateGrantInput(input: GrantInput): 'invalid' | null {
  if (!UUID.test(String(input.userId)) || !UUID.test(String(input.planVersionId))) return 'invalid';
  if (input.source === 'purchase') {
    if (!input.orderId || !UUID.test(input.orderId)) return 'invalid';
  } else if (input.source === 'grant') {
    if (!input.actorId || !UUID.test(input.actorId)) return 'invalid';
    if (input.orderId) return 'invalid';
  } else {
    return 'invalid';
  }
  if (typeof input.reason !== 'string' || input.reason.trim().length < 3 || input.reason.length > 500) return 'invalid';
  if (input.idempotencyKey !== undefined && input.idempotencyKey !== null && !IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
    return 'invalid';
  }
  return null;
}

/** The audit answers who authorised the change, which is not the same question as
 *  what the period row is called. `memberships.source` says whether the coverage was
 *  bought or hand-made; `membership_events.source` says whether money, an admin or a
 *  job moved the state - and the CHECK on that column is why a grant must name an
 *  actor. */
function eventSource(source: GrantInput['source']): 'purchase' | 'admin' {
  return source === 'purchase' ? 'purchase' : 'admin';
}

/** Ends one bought period and nothing else.
 *
 *  A confirmed refund revokes the term it refunded; periods bought afterwards keep
 *  their own coverage even though they now start after a gap. Closing that gap
 *  means re-pricing what the user already consumed, which the pilot decided not to
 *  automate - overlapping or duplicate payments go to manual review instead. */
export async function revokePeriod(input: {
  membershipId: string;
  actorId: string;
  reason: string;
  idempotencyKey?: string | null;
}): Promise<RevokeResult> {
  if (!UUID.test(String(input.membershipId)) || !UUID.test(String(input.actorId))) return { ok: false, reason: 'invalid' };
  if (input.reason.trim().length < 3 || input.reason.length > 500) return { ok: false, reason: 'invalid' };
  if (input.idempotencyKey !== undefined && input.idempotencyKey !== null && !IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
    return { ok: false, reason: 'invalid' };
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id, user_id, plan_version_id, starts_at, ends_at, status FROM memberships WHERE id = $1 FOR UPDATE`,
      [input.membershipId],
    );
    const row = existing.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'not_found' };
    }
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [row.user_id]);
    const startsAt = ms(row.starts_at);
    const endsAt = ms(row.ends_at);
    if (startsAt === null || endsAt === null) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'unavailable' };
    }
    if (row.status === 'revoked') {
      await client.query('COMMIT');
      return { ok: true, duplicate: true, membershipId: String(row.id), startsAt, endsAt };
    }
    const updated = await client.query(
      `UPDATE memberships SET status = 'revoked', updated_at = now() WHERE id = $1 AND status = 'active' RETURNING id`,
      [input.membershipId],
    );
    if ((updated.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'unavailable' };
    }
    await client.query(
      `INSERT INTO membership_events
         (user_id, membership_id, plan_version_id, action, actor_id, source, reason, period_start, period_end, idempotency_key)
       VALUES ($1, $2, $3, 'revoke', $4, 'admin', $5, $6, $7, $8)`,
      [
        row.user_id,
        row.id,
        row.plan_version_id,
        input.actorId,
        input.reason,
        new Date(startsAt).toISOString(),
        new Date(endsAt).toISOString(),
        input.idempotencyKey ?? null,
      ],
    );
    await client.query('COMMIT');
    return { ok: true, duplicate: false, membershipId: String(row.id), startsAt, endsAt };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logFailure('revoke period', error);
    return { ok: false, reason: 'unavailable' };
  } finally {
    client.release();
  }
}

export type RevokeResult =
  | { ok: true; duplicate: boolean; membershipId: string; startsAt: number; endsAt: number }
  | { ok: false; reason: 'not_found' | 'invalid' | 'unavailable' };

export type Offer = {
  planVersionId: string;
  code: string;
  version: number;
  label: string;
  priceVnd: number;
  currency: string;
  termDays: number | null;
  allowances: {
    chatPerPeriod: number;
    chatPerDay: number;
    sttSecondsPerPeriod: number;
    ttsCharactersPerPeriod: number;
  };
};

/** What a pricing page may show: active offers only, no account data, which is the
 *  one membership response a cache is allowed to hold. An empty list means nothing
 *  is on sale - the pilot's starting state, not an error. */
export async function listActiveOffers(): Promise<{ ok: true; offers: Offer[] } | Unavailable> {
  try {
    const { rows } = await pool.query(
      `SELECT id, code, version, label, price_vnd, currency, term_days,
              chat_per_period, chat_per_day, stt_seconds_per_period, tts_characters_per_period
         FROM plan_versions WHERE status = 'active' ORDER BY price_vnd, code, version`,
    );
    return {
      ok: true,
      offers: rows.map((row: Record<string, unknown>) => ({
        planVersionId: String(row.id),
        code: String(row.code),
        version: Number(row.version),
        label: String(row.label),
        priceVnd: Number(row.price_vnd),
        currency: String(row.currency),
        termDays: row.term_days === null ? null : Number(row.term_days),
        allowances: {
          chatPerPeriod: Number(row.chat_per_period),
          chatPerDay: Number(row.chat_per_day),
          sttSecondsPerPeriod: Number(row.stt_seconds_per_period),
          ttsCharactersPerPeriod: Number(row.tts_characters_per_period),
        },
      })),
    };
  } catch (error) {
    logFailure('list offers', error);
    return { ok: false, reason: 'unavailable' };
  }
}

/** The account's own history, newest first. Expiry and revocation are reported,
 *  not hidden: losing sight of a period you paid for is worse than seeing that it
 *  ended, and losing a revoked one would make a refund impossible to explain. */
export async function listPeriods(userId: string, now = Date.now(), limit = 50): Promise<{ periods: MembershipPeriod[] } | Unavailable> {
  if (!UUID.test(String(userId))) return { ok: false, reason: 'unavailable' };
  try {
    const { rows } = await pool.query(
      `SELECT m.id, m.plan_version_id, m.starts_at, m.ends_at, m.status, m.source, m.order_id, m.granted_by,
              p.code, p.label, p.status AS plan_status
         FROM memberships m
         JOIN plan_versions p ON p.id = m.plan_version_id
        WHERE m.user_id = $1
        ORDER BY m.starts_at DESC, m.id DESC
        LIMIT $2`,
      [userId, boundedLimit(limit)],
    );
    return {
      periods: rows
        .map((row: Record<string, unknown>) => toPeriod(row, now))
        .filter((period): period is MembershipPeriod => period !== null),
    };
  } catch (error) {
    logFailure('list periods', error);
    return { ok: false, reason: 'unavailable' };
  }
}

/** Every state change the account has ever had, including the ones an admin made.
 *  This is what a support conversation and #91 read; a period without a matching
 *  event row cannot exist, because grant and revoke write both together. */
export async function listMembershipEvents(userId: string, limit = 50): Promise<{ events: MembershipEvent[] } | Unavailable> {
  if (!UUID.test(String(userId))) return { ok: false, reason: 'unavailable' };
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.membership_id, e.action, e.actor_id, e.source, e.reason,
              e.period_start, e.period_end, e.created_at, p.code, p.label
         FROM membership_events e
         JOIN plan_versions p ON p.id = e.plan_version_id
        WHERE e.user_id = $1
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT $2`,
      [userId, boundedLimit(limit)],
    );
    return {
      events: rows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        membershipId: row.membership_id === null || row.membership_id === undefined ? null : String(row.membership_id),
        planCode: String(row.code),
        planLabel: String(row.label),
        action: String(row.action),
        actorId: row.actor_id === null || row.actor_id === undefined ? null : String(row.actor_id),
        source: String(row.source),
        reason: String(row.reason),
        periodStart: ms(row.period_start),
        periodEnd: ms(row.period_end),
        createdAt: ms(row.created_at) ?? 0,
      })),
    };
  } catch (error) {
    logFailure('list membership events', error);
    return { ok: false, reason: 'unavailable' };
  }
}

function boundedLimit(limit: number): number {
  return Math.min(Math.max(1, Math.trunc(Number(limit) || 50)), 200);
}

function logFailure(what: string, error: unknown): void {
  console.error(`membership ${what} failed`, error instanceof Error ? error.message : error);
}

export type { PlanQuota };
