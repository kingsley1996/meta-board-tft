import Link from 'next/link';
import { GrantForm, RefundAction } from '@/components/admin/membership-actions';
import { PlanEditor } from '@/components/admin/plan-editor';
import { AdminPageHeader, AdminStat, AdminTable, btnQuiet, inputCls } from '@/components/admin/ui';
import type { AdminMembershipAuditEvent, AdminMembershipOrder, AdminMembershipStats, AdminPlanVersion, CatalogOffer } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import { sessionCookieHeader } from '@/lib/session';
import { formatVnd } from '@tftiq/shared/membership-plans';

export const dynamic = 'force-dynamic';

// The operator's view of the paid pilot (task #91). Everything here reads the
// same rows as /me/orders and /me/membership; the only two writes are a refund
// that revokes an unused period and a hand grant, and both land on the audit
// feed below with an actor and a reason.

type Search = { status?: string; q?: string };

const FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'review', label: 'Review' },
  { value: 'paid', label: 'Paid' },
  { value: 'expired', label: 'Expired' },
  { value: 'failed', label: 'Failed' },
];

// Orders and audit rows carry eight columns, so the long locale format wrapped
// into four lines. A date is enough for a period; only an event needs the clock.
const clockFormat = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
const dayFormat = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
const moment = (value: string | null): string => (value ? clockFormat.format(new Date(value)) : '—');
const day = (value: string | null): string => (value ? dayFormat.format(new Date(value)) : '—');

function statusChip(status: string): string {
  if (status === 'paid') return 'border-brand/40 bg-brand/15 text-brand';
  if (status === 'pending' || status === 'processing' || status === 'review') return 'border-line bg-page text-fog';
  return 'border-line bg-page text-mist';
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${statusChip(status)}`}>
      {status}
    </span>
  );
}

export default async function AdminMembershipPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const status = typeof params.status === 'string' && FILTERS.some((filter) => filter.value === params.status) ? params.status : '';
  const query = typeof params.q === 'string' ? params.q.trim().slice(0, 80) : '';
  const queryString = new URLSearchParams({ ...(status ? { status } : {}), ...(query ? { q: query } : {}) }).toString();

  const cookie = await sessionCookieHeader();
  const [ordersData, auditData, catalogData, plansData] = await Promise.all([
    backendJson<{ orders: AdminMembershipOrder[]; stats: AdminMembershipStats }>(`/api/admin/membership/orders${queryString ? `?${queryString}` : ''}`, { headers: { cookie } }),
    backendJson<{ events: AdminMembershipAuditEvent[] }>('/api/admin/membership/audit?limit=30', { headers: { cookie } }),
    backendJson<{ offers: CatalogOffer[] }>('/api/membership/catalog'),
    backendJson<{ plans: AdminPlanVersion[] }>('/api/admin/membership/plans', { headers: { cookie } }),
  ]);
  if (!ordersData) throw new Error('backend is unreachable');
  const { orders, stats } = ordersData;
  const events = auditData?.events ?? [];
  const plans = (catalogData?.offers ?? []).filter((offer) => offer.buyable).map((offer) => ({ code: offer.code, label: offer.label }));

  return (
    <>
      <AdminPageHeader
        title="Membership"
        sub="Live orders, manual grants and the audit trail behind every period. Refunds revoke the period here — the transfer back is done in the bank."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat label="Pending" value={stats.pending} hint="Open checkouts inside their deadline" />
        <AdminStat label="In review" value={stats.review} hint="Paid but the amount or reference needs a human" />
        <AdminStat label="Paid · 30d" value={stats.paid30} hint={formatVnd(stats.revenue30, 'en')} />
        <AdminStat label="Active members" value={stats.activeMembers} hint={`${stats.needsRecovery} usage request(s) need recovery`} />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold tracking-tight text-fog">Orders</h2>
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((filter) => {
              const href = `/admin/membership?${new URLSearchParams({ ...(filter.value ? { status: filter.value } : {}), ...(query ? { q: query } : {}) })}`;
              const active = status === filter.value;
              return (
                <Link key={filter.value || 'all'} href={href} className={active ? `${btnQuiet} border-brand text-fog` : btnQuiet}>
                  {filter.label}
                </Link>
              );
            })}
          </div>
        </div>

        <form action="/admin/membership" method="get" className="flex flex-wrap items-center gap-2">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <input name="q" defaultValue={query} placeholder="Search reference, email or name" className={`${inputCls} w-full sm:w-72`} />
          <button type="submit" className={btnQuiet}>
            Search
          </button>
          {query ? (
            <Link href={`/admin/membership${status ? `?status=${status}` : ''}`} className="text-xs font-semibold text-mist hover:text-fog">
              Clear
            </Link>
          ) : null}
        </form>

        <AdminTable head={['Order', 'Account', 'Plan', 'Amount', 'Status', 'Created', 'Period', '']}>
          {orders.map((order) => {
            const refundable = order.status === 'paid' && order.membership?.status === 'active';
            return (
              <tr key={order.id}>
                <td>
                  <Link href={`/en/checkout?order=${order.id}`} className="font-semibold text-fog hover:text-brand">
                    {order.reference}
                  </Link>
                  <p className="text-xs text-mist">{order.provider}</p>
                </td>
                <td>
                  <p className="text-fog">{order.account.email}</p>
                  {order.account.name ? <p className="text-xs text-mist">{order.account.name}</p> : null}
                </td>
                <td className="text-mist">
                  {order.plan.label ?? order.plan.code ?? '—'}
                  {order.plan.termDays ? <p className="text-xs text-mist">{order.plan.termDays}d</p> : null}
                </td>
                <td className="text-mist">
                  {formatVnd(order.paidVnd ?? order.amountVnd, 'en')}
                  {order.paidVnd !== null && order.paidVnd !== order.amountVnd ? <p className="text-xs text-mist">of {formatVnd(order.amountVnd, 'en')}</p> : null}
                </td>
                <td>
                  <StatusChip status={order.status} />
                </td>
                <td className="text-mist">{moment(order.createdAt)}</td>
                <td className="text-mist">
                  {order.membership ? (
                    <>
                      <span className="whitespace-nowrap">
                        {day(order.membership.startsAt)} → {day(order.membership.endsAt)}
                      </span>
                      <p className="text-xs text-mist">{order.membership.status}</p>
                    </>
                  ) : (
                    <span className="whitespace-nowrap" title="Checkout deadline">
                      by {moment(order.expiresAt)}
                    </span>
                  )}
                </td>
                <td>
                  <div className="flex justify-end">{refundable ? <RefundAction orderId={order.id} reference={order.reference} /> : null}</div>
                </td>
              </tr>
            );
          })}
        </AdminTable>
        {!orders.length ? <p className="text-xs text-mist">{query || status ? 'No orders match this filter.' : 'No orders yet.'}</p> : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight text-fog">Grant a term</h2>
        <GrantForm plans={plans} />
        <p className="text-xs text-mist">A grant creates a period with no order and no payment. It is for support cases and comped access, and it is idempotent per request key.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight text-fog">Audit</h2>
        <AdminTable head={['When', 'Action', 'Account', 'Plan', 'Actor', 'Reason', 'Period']}>
          {events.map((event) => (
            <tr key={event.id}>
              <td className="text-mist">{moment(event.createdAt)}</td>
              <td>
                <StatusChip status={event.action} />
                <p className="text-xs text-mist">{event.source}</p>
              </td>
              <td className="text-fog">{event.accountEmail}</td>
              <td className="text-mist">{event.planLabel}</td>
              <td className="text-mist">{event.actorEmail ?? 'system'}</td>
              <td className="max-w-[260px] text-mist">{event.reason}</td>
              <td className="text-mist">
                {event.periodStart ? (
                  <span className="whitespace-nowrap">
                    {day(event.periodStart)} → {day(event.periodEnd)}
                  </span>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </AdminTable>
        {!events.length ? <p className="text-xs text-mist">No membership events yet.</p> : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight text-fog">Plans</h2>
        {plansData?.plans.length ? (
          <PlanEditor plans={plansData.plans} />
        ) : (
          <p className="text-xs text-mist">Plan versions are unavailable right now.</p>
        )}
        <p className="text-xs text-mist">
          One version per plan code is the selling one. Pricing keys, quotas and copy on the public pages follow the active version; a version that already has orders or periods keeps its numbers.
        </p>
      </section>
    </>
  );
}
