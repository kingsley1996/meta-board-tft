import { Router, type Request, type Response } from 'express';
import { pool } from '../db.ts';
import { currentSessionUser } from '../auth-routes.ts';
import { listActiveOffers, listMembershipEvents, listPeriods, resolveEntitlement, type MembershipPeriod } from './lifecycle.ts';
import { balances, type Metric, type PlanQuota } from './quota.ts';

// The membership read API (task #86).
//
// Three shapes answer three questions, and only one of them may be cached:
//   GET /api/membership/catalog          what is on sale (no account data at all)
//   GET /api/me/membership                what this account has right now
//   GET /api/me/usage                     what it has left, in the units the ledger counts
//   GET /api/me/membership/history        every period and every state change it has had
//
// The /me routes are `no-store`: a balance read from another user's cache is a
// quota bug, and a stale entitlement keeps spending money after a period ended.
// An entitlement that cannot be read is a 503, never an empty answer - the UI has
// to be able to tell "the service is unavailable" apart from "you have no plan".

export const membershipRouter = Router();

const iso = (millis: number | null): string | null => (millis === null ? null : new Date(millis).toISOString());

function unavailable(res: Response): Response {
  res.status(503).json({ error: 'Membership data is unavailable. Try again shortly.', code: 'membership_unavailable' });
  return res;
}

function noStore(res: Response): Response {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Cookie');
  return res;
}

/** The signed-in account, or a 401 that says so. Guest browsing never reaches
 *  these routes, and an unauthenticated response must not look like an empty plan. */
async function userId(req: Request, res: Response): Promise<string | null> {
  const user = await currentSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Sign in to see your plan.', code: 'unauthenticated' });
    return null;
  }
  return user.id;
}

membershipRouter.get('/membership/catalog', async (_req, res) => {
  const catalog = await listActiveOffers();
  if (!catalog.ok) return unavailable(res);
  // The whole response is the published price list: the same for every visitor,
  // so a shared cache may hold it. An empty list means no offer is active yet,
  // which is the pilot's starting state rather than an error.
  res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
  res.json({
    offers: catalog.offers.map((offer) => ({
      planVersionId: offer.planVersionId,
      code: offer.code,
      version: offer.version,
      label: offer.label,
      price: { vnd: offer.priceVnd, currency: offer.currency },
      termDays: offer.termDays,
      // The fallback tier is never bought, so it is listed but not purchasable:
      // a period needs a term to have one.
      buyable: offer.termDays !== null,
      allowances: {
        chatPerPeriod: offer.allowances.chatPerPeriod,
        chatPerDay: offer.allowances.chatPerDay,
        sttSecondsPerPeriod: offer.allowances.sttSecondsPerPeriod,
        ttsCharactersPerPeriod: offer.allowances.ttsCharactersPerPeriod,
      },
    })),
  });
});

membershipRouter.get('/me/membership', async (req, res) => {
  const id = await userId(req, res);
  if (!id) return;
  const now = Date.now();
  const entitlement = await resolveEntitlement(id, now);
  if (!entitlement.ok) return unavailable(res);
  noStore(res);
  res.json({
    asOf: iso(now),
    plan: {
      code: entitlement.planCode,
      label: entitlement.planLabel,
      priceVnd: entitlement.priceVnd,
      // False is the fallback tier. It is not a failure and not an expiry: the UI
      // needs the two apart because one invites an upgrade and the other is normal.
      paid: entitlement.paid,
      termDays: entitlement.plan.termDays,
    },
    period: entitlement.period ? periodJson(entitlement.period, now) : null,
    nextPeriodStartsAt: iso(entitlement.nextPeriodStartsAt),
    lastPeriodEndsAt: iso(entitlement.lastPeriodEndsAt),
    periodStart: iso(entitlement.plan.periodStart),
    periodEnd: iso(entitlement.plan.periodEnd),
  });
});

membershipRouter.get('/me/usage', async (req, res) => {
  const id = await userId(req, res);
  if (!id) return;
  const now = Date.now();
  const entitlement = await resolveEntitlement(id, now);
  if (!entitlement.ok) return unavailable(res);
  const [quota, inFlight] = await Promise.all([balances(id, entitlement.plan, now), countInFlight(id)]);
  if (inFlight === null) return unavailable(res);
  noStore(res);
  res.json({
    asOf: iso(now),
    plan: { code: entitlement.planCode, label: entitlement.planLabel, paid: entitlement.paid },
    period: entitlement.period ? periodJson(entitlement.period, now) : null,
    periodStart: iso(entitlement.plan.periodStart),
    periodEnd: iso(entitlement.plan.periodEnd),
    // Keys are the ledger's own metric names, so a UI cannot quietly rename a
    // unit and start comparing numbers that no longer mean the same thing.
    metrics: {
      chat: metricJson(quota.chat),
      stt_seconds: metricJson(quota.stt_seconds),
      tts_characters: metricJson(quota.tts_characters),
    },
    // The day cap lives beside the period balance on purpose: "month left, day
    // used up" is a different message from "month over", and only the two numbers
    // together tell them apart.
    chatToday: metricJson(quota.chatToday),
    limits: {
      chatRequestsPerMinute: entitlement.plan.chatRequestsPerMinute,
      maxConcurrentRequests: entitlement.plan.maxConcurrentRequests,
      maxSttSecondsPerRequest: entitlement.plan.maxSttSecondsPerRequest,
      maxConcurrentTtsChunks: entitlement.plan.maxConcurrentTtsChunks,
    },
    requestsInFlight: inFlight,
  });
});

membershipRouter.get('/me/membership/history', async (req, res) => {
  const id = await userId(req, res);
  if (!id) return;
  const now = Date.now();
  const [periods, events] = await Promise.all([listPeriods(id, now), listMembershipEvents(id)]);
  if (!('periods' in periods) || !('events' in events)) return unavailable(res);
  noStore(res);
  res.json({
    asOf: iso(now),
    periods: periods.periods.map((period) => periodJson(period, now)),
    events: events.events.map((event) => ({
      id: event.id,
      action: event.action,
      planCode: event.planCode,
      planLabel: event.planLabel,
      // A purchase names no actor because the payment is the authorisation; an
      // admin action always does, and this is the field that proves it.
      actorId: event.actorId,
      source: event.source,
      reason: event.reason,
      periodStart: iso(event.periodStart),
      periodEnd: iso(event.periodEnd),
      createdAt: iso(event.createdAt),
    })),
  });
});

function periodJson(period: MembershipPeriod, now: number) {
  return {
    id: period.id,
    planCode: period.planCode,
    planLabel: period.planLabel,
    source: period.source,
    // The order reference is the user's own receipt handle; it is their transaction
    // and #90 has to be able to ask support about it.
    orderId: period.orderId,
    grantedBy: period.grantedBy,
    startsAt: iso(period.startsAt),
    endsAt: iso(period.endsAt),
    status: period.status,
    state: period.state,
    planStatus: period.planStatus,
    remainingMs: Math.max(0, period.endsAt - now),
  };
}

function metricJson(balance: { allowance: number; consumed: number; reserved: number }) {
  return {
    allowance: balance.allowance,
    used: balance.consumed,
    reserved: balance.reserved,
    // A reservation is money already promised to a request in flight, so it is not
    // available: showing allowance-used here would let the UI offer a turn that
    // the next reserve refuses.
    remaining: Math.max(0, balance.allowance - balance.consumed - balance.reserved),
  };
}

async function countInFlight(userIdValue: string): Promise<number | null> {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM usage_requests
        WHERE user_id = $1 AND status IN ('reserved', 'dispatched', 'needs_recovery')`,
      [userIdValue],
    );
    const n = Number(rows[0]?.n);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/** Re-exported so the Coach and voice integrations (#83-#85) read the plan the same
 *  way the API does instead of inventing their own lookup. */
export { resolveEntitlement };
export type { Metric, PlanQuota };
