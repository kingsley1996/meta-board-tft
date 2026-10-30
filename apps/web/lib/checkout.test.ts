import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkoutState, countdown, periodForOrder, refundEventFor } from './checkout.ts';
import type { MembershipEventView, MembershipPeriodView } from './api.ts';

const period = (state: MembershipPeriodView['state'], orderId: string | null = 'order-1'): MembershipPeriodView => ({
  id: `membership-${state}`,
  planCode: 'plus',
  planLabel: 'Plus',
  source: 'purchase',
  orderId,
  grantedBy: null,
  startsAt: '2026-10-29T05:41:00.123Z',
  endsAt: '2026-11-28T05:41:00.123Z',
  status: state === 'revoked' ? 'revoked' : 'active',
  state,
  planStatus: 'active',
  remainingMs: 1,
});

describe('checkoutState', () => {
  it('keeps an open checkout in waiting state', () => {
    assert.equal(checkoutState({ status: 'pending' }, undefined), 'pending');
    assert.equal(checkoutState({ status: 'processing' }, undefined), 'pending');
  });

  it('reports a lapsed or cancelled checkout as closed', () => {
    assert.equal(checkoutState({ status: 'expired' }, undefined), 'expired');
    assert.equal(checkoutState({ status: 'canceled' }, undefined), 'expired');
  });

  it('separates a payment that needs review from a failure', () => {
    assert.equal(checkoutState({ status: 'review' }, undefined), 'review');
    assert.equal(checkoutState({ status: 'underpaid' }, undefined), 'review');
    assert.equal(checkoutState({ status: 'failed' }, undefined), 'failed');
  });

  it('shows a paid order as active once its period exists', () => {
    assert.equal(checkoutState({ status: 'paid' }, period('active')), 'paid');
    assert.equal(checkoutState({ status: 'paid' }, undefined), 'paid');
  });

  it('lets a revoked period turn the receipt into a refund', () => {
    // The order row keeps status=paid; only the period knows it was taken back.
    assert.equal(checkoutState({ status: 'paid' }, period('revoked')), 'refunded');
    assert.equal(checkoutState({ status: 'expired' }, period('revoked')), 'refunded');
  });

  it('does not let a stale period override a still-open order', () => {
    assert.equal(checkoutState({ status: 'pending' }, period('expired')), 'pending');
  });
});

describe('periodForOrder', () => {
  it('matches the period minted by this order only', () => {
    const periods = [period('active', 'order-1'), period('active', 'order-2'), period('active', null)];
    assert.equal(periodForOrder(periods, 'order-2')?.orderId, 'order-2');
    assert.equal(periodForOrder(periods, 'order-3'), undefined);
  });
});

describe('refundEventFor', () => {
  const target = period('revoked');
  const event = (overrides: Partial<MembershipEventView>): MembershipEventView => ({
    id: 'event-1',
    action: 'revoke',
    planCode: 'plus',
    planLabel: 'Plus',
    actorId: 'admin-1',
    source: 'admin',
    reason: 'refund approved',
    periodStart: target.startsAt,
    periodEnd: target.endsAt,
    createdAt: '2026-10-30T03:00:00.000Z',
    ...overrides,
  });

  it('finds the revoke that closed this exact window', () => {
    const found = refundEventFor(target, [event({}), event({ id: 'event-2', action: 'grant' })]);
    assert.equal(found?.createdAt, '2026-10-30T03:00:00.000Z');
  });

  it('ignores a revoke on another period', () => {
    assert.equal(refundEventFor(target, [event({ periodStart: '2026-09-01T00:00:00.000Z' })]), undefined);
    assert.equal(refundEventFor(undefined, [event({})]), undefined);
  });
});

describe('countdown', () => {
  it('prints m:ss and floors the seconds', () => {
    assert.equal(countdown(12 * 60_000 + 41_000), '12:41');
    assert.equal(countdown(5_900), '0:05');
    assert.equal(countdown(0), '0:00');
  });

  it('never goes below zero', () => {
    assert.equal(countdown(-4_000), '0:00');
  });

  it('does not print NaN when the deadline is unreadable', () => {
    assert.equal(countdown(Number.NaN), '0:00');
  });
});
