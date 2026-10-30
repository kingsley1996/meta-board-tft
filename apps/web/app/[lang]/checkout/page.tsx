import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { formatVnd } from '@tftiq/shared/membership-plans';
import { CheckoutHeading, Rows, Row, StatePlate, Steps } from '@/components/membership/checkout-parts';
import { CheckoutStart } from '@/components/membership/checkout-start';
import { PendingOrder } from '@/components/membership/pending-order';
import type { CatalogOffer, MembershipHistory, MembershipPeriodView, OrderView } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import { checkoutState, periodForOrder, refundEventFor } from '@/lib/checkout';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { currentUser, sessionCookieHeader } from '@/lib/session';

// Checkout and the receipt for one order (task #90). Two entry points:
//   ?plan=<code>   resolve the offer server-side, then the browser creates the order
//   ?order=<uuid>  read the account's own order and render it in its state
//
// The page never trusts a price from the query string: the plan comes from the
// catalog (server-to-server) and the order row is the only source of amounts.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HCM = 'Asia/Ho_Chi_Minh';
const PRIMARY =
  'smooth inline-flex items-center justify-center rounded-full border border-brand bg-brand px-4 py-2 text-[13px] font-semibold text-on-brand hover:bg-brand-deep';
const GHOST =
  'smooth inline-flex items-center justify-center rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-mist hover:border-brand hover:text-fog';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].checkout.title, robots: { index: false } };
}

function formatDay(iso: string | null, lang: Lang): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', {
    day: '2-digit',
    month: lang === 'vi' ? '2-digit' : 'short',
    year: 'numeric',
    timeZone: HCM,
  }).format(date);
}

function formatClock(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: HCM,
  }).format(date);
}

function formatMoment(iso: string | null, lang: Lang): string {
  return `${formatDay(iso, lang)}, ${formatClock(iso)}`;
}

function formatNumber(value: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US').format(value);
}

function quotaLine(order: OrderView, lang: Lang, t: (typeof messages)['en']['checkout']): string | null {
  const allowances = order.plan.allowances;
  if (allowances.chatPerPeriod === null || allowances.sttSecondsPerPeriod === null || allowances.ttsCharactersPerPeriod === null) {
    return null;
  }
  return t.quotaValue(
    formatNumber(allowances.chatPerPeriod, lang),
    formatNumber(Math.round(allowances.sttSecondsPerPeriod / 60), lang),
    formatNumber(allowances.ttsCharactersPerPeriod, lang),
  );
}

function newOrderHref(lang: Lang, planCode: string): string {
  return planCode ? `/${lang}/checkout?plan=${encodeURIComponent(planCode)}` : `/${lang}/membership`;
}

function Shell({ lang }: { lang: Lang }) {
  const t = messages[lang].checkout;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 py-10">
      <CheckoutHeading kicker={t.kicker} title={t.closedTitle} />
      <article className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-6">
        <p className="text-sm leading-relaxed text-mist">{t.closedBody}</p>
        <div>
          <Link href={`/${lang}/membership`} className={PRIMARY}>
            {t.backToPricing}
          </Link>
        </div>
      </article>
    </div>
  );
}

function PaidReceipt({
  lang,
  order,
  period,
}: {
  lang: Lang;
  order: OrderView;
  period: MembershipPeriodView | undefined;
}) {
  const t = messages[lang].checkout;
  const quota = quotaLine(order, lang, t);
  return (
    <>
      <StatePlate glyph="check" label={t.paid} sub={t.paidSub(formatVnd(order.amountVnd, lang))} />
      <article className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-2.5">
          <h2 className="font-display text-[26px] leading-tight font-bold uppercase tracking-tight text-fog">
            {t.activeTitle(order.plan.label)}
          </h2>
          <p className="text-sm text-mist">
            {period?.endsAt ? t.activeUntil(formatDay(period.endsAt, lang), order.reference) : t.activePending}
          </p>
        </div>
        <Rows>
          <Row label={t.amount}>{formatVnd(order.amountVnd, lang)}</Row>
          <Row label={t.reference}>{order.reference}</Row>
          {order.paidAt ? <Row label={t.paidAt}>{formatMoment(order.paidAt, lang)}</Row> : null}
          {quota ? <Row label={t.quota}>{quota}</Row> : null}
        </Rows>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/${lang}/assistant`} className={PRIMARY}>
            {t.openCoach}
          </Link>
          <Link href={`/${lang}/profile`} className={GHOST}>
            {t.orderHistory}
          </Link>
        </div>
        <Steps
          steps={[
            { label: t.stepCreated, tone: 'done' },
            { label: t.stepMatched, tone: 'done' },
            { label: t.stepActivated, tone: 'now' },
          ]}
        />
      </article>
    </>
  );
}

function ExpiredReceipt({ lang, order }: { lang: Lang; order: OrderView }) {
  const t = messages[lang].checkout;
  return (
    <>
      <StatePlate glyph="clock" label={t.closed} sub={t.closedSub} />
      <article className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-2.5">
          <h2 className="font-display text-[26px] leading-tight font-bold uppercase tracking-tight text-fog">{t.expiredTitle}</h2>
          <p className="text-sm leading-relaxed text-mist">{t.expiredBody}</p>
        </div>
        <Rows>
          <Row label={t.order}>{order.reference}</Row>
          <Row label={t.closedAt}>{formatMoment(order.expiresAt, lang)}</Row>
        </Rows>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={newOrderHref(lang, order.plan.code)} className={PRIMARY}>
            {t.newOrder}
          </Link>
          <Link href={`/${lang}/profile`} className={GHOST}>
            {t.backToOrders}
          </Link>
        </div>
        <p className="text-[11.5px] leading-relaxed text-mist">{t.expiredNote}</p>
      </article>
    </>
  );
}

function ReviewReceipt({ lang, order }: { lang: Lang; order: OrderView }) {
  const t = messages[lang].checkout;
  return (
    <>
      <StatePlate glyph="alert" label={t.inReview} sub={t.inReviewSub} />
      <article className="flex min-w-0 flex-col gap-4">
        <span className="self-start rounded-md border border-brand/50 px-2 py-[3px] text-[11px] font-semibold text-brand">
          {t.reviewChip}
        </span>
        <div className="flex flex-col gap-2.5">
          <h2 className="font-display text-[26px] leading-tight font-bold uppercase tracking-tight text-fog">{t.reviewTitle}</h2>
          <p className="text-sm leading-relaxed text-mist">{t.reviewBody}</p>
        </div>
        <Rows>
          {order.paidVnd !== null ? <Row label={t.received}>{formatVnd(order.paidVnd, lang)}</Row> : null}
          <Row label={t.reference}>{order.reference}</Row>
          <Row label={t.membership}>{t.notStarted}</Row>
        </Rows>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/${lang}/about`} className={GHOST}>
            {t.contactSupport}
          </Link>
          <Link href={`/${lang}/profile`} className={GHOST}>
            {t.backToOrders}
          </Link>
        </div>
        <p className="text-[11.5px] leading-relaxed text-mist">{t.reviewNote}</p>
      </article>
    </>
  );
}

function RefundReceipt({
  lang,
  order,
  requestedAt,
}: {
  lang: Lang;
  order: OrderView;
  requestedAt: string | null;
}) {
  const t = messages[lang].checkout;
  return (
    <>
      <StatePlate glyph="refund" label={t.refundedPlate} sub={t.refundedSub(formatVnd(order.amountVnd, lang))} />
      <article className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-2.5">
          <h2 className="font-display text-[26px] leading-tight font-bold uppercase tracking-tight text-fog">{t.refundTitle}</h2>
          <p className="text-sm leading-relaxed text-mist">{t.refundBody(order.plan.label)}</p>
        </div>
        <Rows>
          <Row label={t.refunded}>{formatVnd(order.amountVnd, lang)}</Row>
          {requestedAt ? <Row label={t.requested}>{formatDay(requestedAt, lang)}</Row> : null}
          <Row label={t.order}>{`${order.reference} · ${t.staysPaid}`}</Row>
        </Rows>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/${lang}/membership`} className={PRIMARY}>
            {t.backToPricing}
          </Link>
        </div>
        <p className="text-[11.5px] leading-relaxed text-mist">{t.refundNote}</p>
      </article>
    </>
  );
}

function FailedReceipt({ lang, order }: { lang: Lang; order: OrderView }) {
  const t = messages[lang].checkout;
  return (
    <>
      <StatePlate glyph="off" label={t.failedPlate} sub={t.failedSub} />
      <article className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-2.5">
          <h2 className="font-display text-[26px] leading-tight font-bold uppercase tracking-tight text-fog">{t.failedTitle}</h2>
          <p className="text-sm leading-relaxed text-mist">{t.failedBody}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={newOrderHref(lang, order.plan.code)} className={PRIMARY}>
            {t.newOrder}
          </Link>
          <Link href={`/${lang}/profile`} className={GHOST}>
            {t.backToOrders}
          </Link>
        </div>
      </article>
    </>
  );
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: Lang }>;
  searchParams: Promise<{ order?: string | string[]; plan?: string | string[] }>;
}) {
  const { lang } = await params;
  const t = messages[lang].checkout;
  const query = await searchParams;
  const orderId = typeof query.order === 'string' ? query.order : '';
  const planCode = typeof query.plan === 'string' ? query.plan : '';
  const nextPath = `/${lang}/checkout${orderId ? `?order=${encodeURIComponent(orderId)}` : planCode ? `?plan=${encodeURIComponent(planCode)}` : ''}`;

  // Buying needs an account: the quota and the receipt belong to it, and an order
  // created for nobody could never be fulfilled.
  const user = await currentUser();
  if (!user) redirect(`/${lang}/login?next=${encodeURIComponent(nextPath)}`);

  // Same rollout flag as the API: with enforcement off there is nothing for sale,
  // and that has to say so instead of failing at the POST.
  if (process.env.MEMBERSHIP_ENFORCEMENT !== 'enforce') return <Shell lang={lang} />;

  const cookie = await sessionCookieHeader();

  if (orderId) {
    if (!UUID.test(orderId)) notFound();
    const payload = await backendJson<{ order: OrderView }>(`/api/me/orders/${orderId}`, { headers: { cookie } });
    if (!payload?.order) notFound();
    const order = payload.order;
    // A refund lives on the period, not on the order, so a paid order has to read
    // its history before the screen can tell "active" from "refunded".
    const history =
      order.status === 'paid'
        ? await backendJson<MembershipHistory>('/api/me/membership/history', { headers: { cookie } }).catch(() => null)
        : null;
    const period = history ? periodForOrder(history.periods, order.id) : undefined;
    const state = checkoutState(order, period);
    const refund = refundEventFor(period, history?.events ?? []);

    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 py-8">
        <CheckoutHeading kicker={t.kicker} title={t.planTitle(order.plan.label, order.plan.termDays)} />
        <div className="grid items-start gap-5 lg:grid-cols-[296px_minmax(0,1fr)]">
          {state === 'pending' ? <PendingOrder lang={lang} order={order} /> : null}
          {state === 'paid' ? <PaidReceipt lang={lang} order={order} period={period} /> : null}
          {state === 'expired' ? <ExpiredReceipt lang={lang} order={order} /> : null}
          {state === 'review' ? <ReviewReceipt lang={lang} order={order} /> : null}
          {state === 'refunded' ? (
            <RefundReceipt lang={lang} order={order} requestedAt={refund?.createdAt ?? null} />
          ) : null}
          {state === 'failed' ? <FailedReceipt lang={lang} order={order} /> : null}
        </div>
      </div>
    );
  }

  if (planCode) {
    // The catalog is the same published price list the pricing page shows, and it
    // is the only place a planVersionId can come from.
    const catalog = await backendJson<{ offers: CatalogOffer[] }>('/api/membership/catalog', { revalidate: 60 });
    const offer = catalog?.offers.find((entry) => entry.code === planCode && entry.buyable);
    if (!offer) return <Shell lang={lang} />;

    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 py-8">
        <CheckoutHeading kicker={t.kicker} title={t.planTitle(offer.label, offer.termDays)} />
        <div className="grid items-start gap-5 lg:grid-cols-[296px_minmax(0,1fr)]">
          <CheckoutStart
            lang={lang}
            planVersionId={offer.planVersionId}
            code={offer.code}
            label={offer.label}
            termDays={offer.termDays}
            price={formatVnd(offer.price.vnd, lang)}
          />
        </div>
      </div>
    );
  }

  redirect(`/${lang}/membership`);
}
