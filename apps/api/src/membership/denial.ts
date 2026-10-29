import type { Response } from 'express';
import type { QuotaReason } from './quota.ts';

// One mapping from ledger reason to HTTP answer, shared by every route that spends
// quota (Coach text #83, voice #84-#85). The codes are what the client branches on,
// so they must not differ per route: `exhausted` is a paywall, `daily_cap` and the
// admission codes are waits, `locked` is a feature the plan never had, and
// `unavailable` is our outage.

export type QuotaDenial = { status: number; code: string; error: string; retryAfter: number | null };

export function quotaDenial(reason: QuotaReason, retryAfterMs: number | null | undefined): QuotaDenial {
  const retryAfter = retryAfterMs === undefined || retryAfterMs === null ? null : Math.max(1, Math.ceil(retryAfterMs / 1000));
  const denial = (status: number, code: string, error: string): QuotaDenial => ({ status, code, error, retryAfter });
  switch (reason) {
    case 'exhausted':
      return denial(402, 'quota_exhausted', 'You have used every Coach turn in this period.');
    case 'daily_cap':
      return denial(429, 'daily_cap', "Today's Coach turns are used up. The count resets at midnight in Vietnam.");
    case 'locked':
      return denial(403, 'feature_locked', 'This is not part of your plan.');
    case 'rate_limited':
      return denial(429, 'rate_limited', 'Too many Coach requests in one minute.');
    case 'too_many_in_flight':
      return denial(429, 'too_many_in_flight', 'Another Coach request is already running for this account.');
    case 'too_long':
      return denial(413, 'audio_too_long', 'That recording is longer than your plan allows.');
    case 'expired':
      return denial(403, 'period_expired', 'This membership period has ended.');
    default:
      return denial(503, 'membership_unavailable', 'Membership data is unavailable. Try again shortly.');
  }
}

/** Denials carry Retry-After whenever the answer is "wait", and the ledger request id
 *  whenever the client needs to correlate a replay. */
export function sendDenial(res: Response, denial: QuotaDenial, requestId?: string): void {
  if (denial.retryAfter !== null) res.setHeader('Retry-After', String(denial.retryAfter));
  res.status(denial.status).json({ error: denial.error, code: denial.code, ...(requestId ? { requestId } : {}) });
}
