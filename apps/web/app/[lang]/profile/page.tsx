import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatVnd } from '@tftiq/shared/membership-plans';
import { ProfileSignOut } from '@/components/auth/profile-sign-out';
import { UserAvatar } from '@/components/auth/user-avatar';
import { Chip, Panel } from '@/components/ui';
import type { MembershipBalance, MembershipPeriodView, MembershipUsage, MembershipView, OrderView } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { currentUser, sessionCookieHeader } from '@/lib/session';

export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;
// #79 policy: a full refund while the window is open and the period has used nothing.
const REFUND_WINDOW_MS = 7 * DAY_MS;

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].auth.profileTitle, robots: { index: false } };
}

function formatDate(iso: string | null, lang: Lang): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', {
    day: '2-digit',
    month: lang === 'vi' ? '2-digit' : 'short',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
}

function formatNumber(value: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US').format(value);
}

function Bar({ used, reserved, allowance }: { used: number; reserved: number; allowance: number }) {
  if (allowance <= 0) return <div className="mt-1.5 mb-[5px] h-1.5 rounded-full bg-util" />;
  const usedPct = Math.min(100, Math.round((used / allowance) * 1000) / 10);
  const reservedPct = Math.min(100 - usedPct, Math.round((reserved / allowance) * 1000) / 10);
  return (
    <div className="relative mt-1.5 mb-[5px] h-1.5 overflow-hidden rounded-full bg-util">
      <i className="absolute inset-y-0 left-0 bg-brand" style={{ width: `${usedPct}%` }} />
      <i className="absolute inset-y-0 bg-brand/40" style={{ left: `${usedPct}%`, width: `${reservedPct}%` }} />
    </div>
  );
}

function Balance({
  label,
  balance,
  allowanceText,
  foot,
  lang,
}: {
  label: string;
  balance: MembershipBalance;
  allowanceText: string;
  foot: string;
  lang: Lang;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5 text-[12.5px] text-fog">
        <span>{label}</span>
        <span className="ml-auto font-display text-lg font-semibold tabular-nums">
          {balance.allowance > 0 ? formatNumber(balance.remaining, lang) : '—'}
        </span>
        <span className="text-[11.5px] text-mist">{allowanceText}</span>
      </div>
      <Bar used={balance.used} reserved={balance.reserved} allowance={balance.allowance} />
      <div className="text-[11.5px] tabular-nums text-mist">{foot}</div>
    </div>
  );
}

function orderNote(order: OrderView, period: MembershipPeriodView | undefined, t: (typeof messages)['en']['profile'], lang: Lang): string {
  if (period?.state === 'revoked') return t.orderRefundedNote;
  switch (order.status) {
    case 'paid':
      return period?.endsAt ? t.orderPaidNote(formatDate(period.endsAt, lang)) : t.orderStatus.paid;
    case 'pending':
    case 'processing':
      return t.orderPendingNote;
    case 'expired':
      return t.orderExpiredNote;
    case 'review':
      return t.orderReviewNote;
    case 'failed':
      return t.orderFailedNote;
    default:
      return '';
  }
}

export default async function ProfilePage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const user = await currentUser();
  // The login page needs a next path so a fresh sign-in lands back here.
  if (!user) redirect(`/${lang}/login?next=/${lang}/profile`);
  const t = messages[lang].auth;
  const p = messages[lang].profile;
  // Same rollout flag as /assistant and the API: the plan panel only appears once
  // the pilot is being enforced, so pre-pilot builds keep their account page.
  const enforced = process.env.MEMBERSHIP_ENFORCEMENT === 'enforce';

  let membership: MembershipView | null = null;
  let usage: MembershipUsage | null = null;
  let orders: OrderView[] = [];
  let periods: MembershipPeriodView[] = [];
  if (enforced) {
    const cookie = await sessionCookieHeader();
    const [membershipResult, usageResult, ordersResult, historyResult] = await Promise.allSettled([
      backendJson<MembershipView>('/api/me/membership', { headers: { cookie } }),
      backendJson<MembershipUsage>('/api/me/usage', { headers: { cookie } }),
      backendJson<{ orders: OrderView[] }>('/api/me/orders', { headers: { cookie } }),
      backendJson<{ periods: MembershipPeriodView[] }>('/api/me/membership/history', { headers: { cookie } }),
    ]);
    membership = membershipResult.status === 'fulfilled' ? membershipResult.value : null;
    usage = usageResult.status === 'fulfilled' ? usageResult.value : null;
    if (ordersResult.status === 'fulfilled') orders = ordersResult.value?.orders ?? [];
    if (historyResult.status === 'fulfilled') periods = historyResult.value?.periods ?? [];
  }

  const now = Date.now();
  const startedAt = membership?.period?.startsAt ? Date.parse(membership.period.startsAt) : null;
  const termDays = membership?.plan.termDays ?? null;
  const dayOfTerm =
    startedAt !== null && termDays !== null
      ? Math.min(termDays, Math.max(1, Math.floor((now - startedAt) / DAY_MS) + 1))
      : null;
  const periodOrder = membership?.period?.orderId ? orders.find((order) => order.id === membership?.period?.orderId) : undefined;
  const usedTotal = usage
    ? usage.metrics.chat.used + usage.metrics.stt_seconds.used + usage.metrics.tts_characters.used
    : 0;
  const refundDays =
    periodOrder?.paidAt && usedTotal === 0
      ? Math.max(0, Math.ceil((Date.parse(periodOrder.paidAt) + REFUND_WINDOW_MS - now) / DAY_MS))
      : 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 py-8">
      <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-fog">{t.profileTitle}</h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar user={user} sizeClass="h-12 w-12 text-base" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-fog">{user.name ?? user.email}</p>
            <p className="truncate text-xs text-mist">{user.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {enforced && membership ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-brand/55 px-2 py-0.5 text-[11px] font-semibold text-brand">
              {membership.plan.label}
            </span>
          ) : null}
          <Chip className="text-[11px]">{user.role === 'admin' ? t.roleAdmin : t.roleMember}</Chip>
          <Chip className="text-[11px]">{user.emailVerified ? t.verifiedBadge : t.unverifiedBadge}</Chip>
        </div>
      </div>

      {!enforced ? (
        <Panel className="flex flex-col gap-4 p-6">
          <p className="text-sm leading-relaxed text-mist">{t.profileSub}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/${lang}/assistant`}
              className="smooth rounded-full border border-brand bg-brand px-5 py-2 text-sm font-semibold text-on-brand hover:bg-brand-deep"
            >
              {messages[lang].nav.assistant}
            </Link>
            {user.role === 'admin' ? (
              <Link
                href="/admin"
                className="smooth rounded-full border border-line px-4 py-2 text-sm font-semibold text-mist hover:border-brand hover:text-fog"
              >
                {t.admin}
              </Link>
            ) : null}
            <ProfileSignOut lang={lang} label={t.logout} />
          </div>
        </Panel>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5 sm:p-6">
            {!membership || !usage ? (
              <p className="text-sm leading-relaxed text-mist">{p.unavailable}</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mist">{p.plan}</p>
                  <span className="inline-flex items-center gap-1 rounded-md border border-brand/55 px-2 py-0.5 text-[11px] font-semibold text-brand">
                    {membership.plan.label}
                  </span>
                </div>
                {membership.plan.paid && membership.period ? (
                  <p className="text-sm text-fog">
                    {p.activeUntil}{' '}
                    <b className="font-display text-[17px]">{formatDate(membership.period.endsAt, lang)}</b>
                    {dayOfTerm !== null && termDays !== null ? ` · ${p.dayOf(dayOfTerm, termDays)}` : ''}
                  </p>
                ) : (
                  <p className="text-sm text-fog">{p.freeNote}</p>
                )}
                {membership.plan.paid && membership.period && periodOrder ? (
                  <p className="-mt-2 text-[12.5px] leading-relaxed text-mist">
                    {p.bought(formatDate(membership.period.startsAt, lang), periodOrder.reference)}
                  </p>
                ) : null}

                <div className="flex flex-col gap-3.5">
                  <Balance
                    label={p.coachMessages}
                    balance={usage.metrics.chat}
                    allowanceText={`/ ${formatNumber(usage.metrics.chat.allowance, lang)}`}
                    foot={
                      usage.chatToday.allowance > 0
                        ? `${p.balanceFoot(formatNumber(usage.metrics.chat.used, lang), formatNumber(usage.metrics.chat.reserved, lang))} · ${p.todayLeft(formatNumber(usage.chatToday.remaining, lang))}`
                        : p.balanceFoot(formatNumber(usage.metrics.chat.used, lang), formatNumber(usage.metrics.chat.reserved, lang))
                    }
                    lang={lang}
                  />
                  <Balance
                    label={p.voiceIn}
                    balance={usage.metrics.stt_seconds}
                    allowanceText={`/ ${formatNumber(usage.metrics.stt_seconds.allowance, lang)} s`}
                    foot={
                      usage.metrics.stt_seconds.allowance > 0
                        ? p.balanceFoot(
                            formatNumber(usage.metrics.stt_seconds.used, lang),
                            formatNumber(usage.metrics.stt_seconds.reserved, lang)
                          )
                        : p.notInPlan
                    }
                    lang={lang}
                  />
                  <Balance
                    label={p.readAloud}
                    balance={usage.metrics.tts_characters}
                    allowanceText={`/ ${formatNumber(usage.metrics.tts_characters.allowance, lang)}`}
                    foot={
                      usage.metrics.tts_characters.allowance > 0
                        ? p.balanceFoot(
                            formatNumber(usage.metrics.tts_characters.used, lang),
                            formatNumber(usage.metrics.tts_characters.reserved, lang)
                          )
                        : p.notInPlan
                    }
                    lang={lang}
                  />
                </div>

                {membership.plan.paid && membership.period ? (
                  <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-page px-3.5 py-3 text-xs leading-relaxed text-mist">
                    <b className="text-[12.5px] font-semibold text-fog">{p.nextNone}</b>
                    <span>{p.nextPaid(membership.plan.label, formatDate(membership.period.endsAt, lang))}</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-page px-3.5 py-3 text-xs leading-relaxed text-mist">
                    <b className="text-[12.5px] font-semibold text-fog">{p.nextFree}</b>
                    <span>{p.nextFreeBody(formatDate(membership.periodEnd, lang))}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {membership.period?.orderId ? (
                    <Link
                      href={`/${lang}/checkout?order=${membership.period.orderId}`}
                      className="smooth inline-flex items-center rounded-full border border-line bg-util px-3.5 py-1.5 text-xs font-semibold text-fog hover:border-brand"
                    >
                      {p.viewReceipt}
                    </Link>
                  ) : null}
                  <Link
                    href={`/${lang}/legal/terms`}
                    className="smooth inline-flex items-center rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-mist hover:border-brand hover:text-fog"
                  >
                    {p.refundPolicy}
                    {refundDays > 0 ? p.refundWindow(refundDays) : ''}
                  </Link>
                  {!membership.plan.paid ? (
                    <Link
                      href={`/${lang}/membership`}
                      className="smooth inline-flex items-center rounded-full border border-brand bg-brand px-3.5 py-1.5 text-xs font-semibold text-on-brand hover:bg-brand-deep"
                    >
                      {p.upgrade}
                    </Link>
                  ) : null}
                </div>
              </>
            )}
          </article>

          <article className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5 sm:p-6">
            <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.1em] text-fog">{p.orderHistory}</h2>
            {orders.length ? (
              <ul className="flex list-none flex-col">
                {orders.slice(0, 8).map((order) => {
                  const period = periods.find((entry) => entry.orderId === order.id);
                  const status = period?.state === 'revoked' ? 'refunded' : order.status;
                  const brandStatus = status === 'paid';
                  return (
                    <li key={order.id} className="flex flex-col gap-0.5 border-t border-line py-2.5 first:border-t-0 first:pt-0">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/${lang}/checkout?order=${order.id}`}
                          className="smooth font-display text-[12.5px] tracking-[0.04em] text-fog hover:text-brand"
                        >
                          {order.reference}
                        </Link>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${
                            brandStatus ? 'border-brand/55 text-brand' : 'border-line text-mist'
                          }`}
                        >
                          {p.orderStatus[status] ?? status}
                        </span>
                      </div>
                      <div className="text-[11.5px] text-mist">
                        {p.orderMeta(
                          order.plan.label,
                          order.plan.termDays ?? 0,
                          formatVnd(order.amountVnd, lang),
                          formatDate(order.createdAt, lang)
                        )}
                      </div>
                      <div className="text-[11.5px] text-mist">{orderNote(order, period, p, lang)}</div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-mist">{p.noOrders}</p>
            )}
            <p className="border-t border-line pt-3 text-[11.5px] leading-relaxed text-mist">{p.refundRule}</p>
          </article>
        </div>
      )}
    </div>
  );
}
