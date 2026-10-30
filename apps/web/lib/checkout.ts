import type { MembershipEventView, MembershipPeriodView, OrderView } from '@/lib/api';

// Order state is derived, not stored: the API reports a pending order as expired
// once its window passed, and a refund is a revoke event on the period while the
// order itself stays paid. The screen has to agree with that, so the mapping lives
// here with tests instead of inside JSX.

export type CheckoutState = 'pending' | 'paid' | 'expired' | 'review' | 'refunded' | 'failed';

const PENDING = new Set(['pending', 'processing']);
const REVIEW = new Set(['review', 'underpaid']);
const EXPIRED = new Set(['expired', 'canceled']);

export function checkoutState(
  order: Pick<OrderView, 'status'>,
  period: Pick<MembershipPeriodView, 'state'> | undefined,
): CheckoutState {
  // A refund does not rewrite the order: it revokes the period. The buyer needs to
  // see the refund, so the revoked period wins over the stored "paid" status.
  if (period?.state === 'revoked') return 'refunded';
  if (order.status === 'paid') return 'paid';
  if (PENDING.has(order.status)) return 'pending';
  if (REVIEW.has(order.status)) return 'review';
  if (EXPIRED.has(order.status)) return 'expired';
  return 'failed';
}

export function periodForOrder(periods: readonly MembershipPeriodView[], orderId: string): MembershipPeriodView | undefined {
  return periods.find((period) => period.orderId === orderId);
}

/** The revoke event that closed this period. It carries when the refund was
 *  approved; its reason is an internal note and is not shown. */
export function refundEventFor(
  period: Pick<MembershipPeriodView, 'startsAt' | 'endsAt'> | undefined,
  events: readonly MembershipEventView[],
): MembershipEventView | undefined {
  if (!period) return undefined;
  return events.find(
    (event) => event.action === 'revoke' && event.periodStart === period.startsAt && event.periodEnd === period.endsAt,
  );
}

/** m:ss for the checkout window. Rounds down, never negative. */
export function countdown(ms: number): string {
  if (!Number.isFinite(ms)) return '0:00';
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
