// The pilot offer (docs/MEMBERSHIP-PLAN.md #79), shared by the API seed that
// inserts it and the public pricing page that shows it. Billing still reads the
// plan_versions row: a number changed here only reaches customers after
// `npm run seed:membership` refreshes the draft offer.
//
// Both rows stay draft until the unit-economics gate (#92) and the deploy (#95),
// so a checkout cannot be priced against an offer that was never approved.

export type PilotPlan = {
  code: 'free' | 'plus';
  version: number;
  label: string;
  priceVnd: number;
  /** null means a calendar month, reset with the month. */
  termDays: number | null;
  chatPerPeriod: number;
  chatPerDay: number;
  sttSecondsPerPeriod: number;
  ttsCharactersPerPeriod: number;
  chatRequestsPerMinute: number;
  maxConcurrentRequests: number;
  maxSttSecondsPerRequest: number | null;
  maxConcurrentTtsChunks: number;
};

export const freePlan: PilotPlan = {
  code: 'free',
  version: 1,
  label: 'Free',
  priceVnd: 0,
  termDays: null,
  chatPerPeriod: 60,
  chatPerDay: 12,
  sttSecondsPerPeriod: 0,
  ttsCharactersPerPeriod: 0,
  chatRequestsPerMinute: 3,
  maxConcurrentRequests: 1,
  maxSttSecondsPerRequest: null,
  maxConcurrentTtsChunks: 0,
};

export const plusPlan: PilotPlan = {
  code: 'plus',
  version: 1,
  label: 'Plus',
  priceVnd: 99_000,
  // Plus is exactly 30 days, not a calendar month.
  termDays: 30,
  chatPerPeriod: 300,
  chatPerDay: 60,
  sttSecondsPerPeriod: 1_200,
  ttsCharactersPerPeriod: 10_000,
  chatRequestsPerMinute: 6,
  maxConcurrentRequests: 1,
  maxSttSecondsPerRequest: 60,
  maxConcurrentTtsChunks: 2,
};

export const pilotPlans: readonly PilotPlan[] = [freePlan, plusPlan];

// "99.000₫" in Vietnamese, "99,000₫" in English. Intl's own VND formatting puts
// a space before the sign, which reads as a different price next to the seed's
// integer, so the sign is appended here.
export function formatVnd(amount: number, lang: string): string {
  const digits = new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US').format(amount);
  return `${digits}₫`;
}
