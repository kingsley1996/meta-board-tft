'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatVnd } from '@metaboard/shared/membership-plans';
import { refreshOrder, type OrderActionResult, type OrderView } from '@/lib/api';
import { countdown } from '@/lib/checkout';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { QrPlate, Rows, Row, StatePlate, Steps } from './checkout-parts';

// A pending order lives 15 minutes. The page polls while it is open and visible,
// stops at the deadline, and pauses in a background tab: the mock's three-second
// cadence is a promise to the buyer, not a reason to keep a closed tab polling.

function hcmClock(): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date());
}

function CopyValue({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard permission can be refused; the value is on screen anyway.
        }
      }}
      className="smooth rounded-[5px] border border-line bg-util px-1.5 py-px text-[10px] font-medium text-mist hover:border-brand hover:text-fog"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}

export function PendingOrder({ lang, order }: { lang: Lang; order: OrderView }) {
  const t = messages[lang].checkout;
  const router = useRouter();
  const expiresAt = Date.parse(order.expiresAt);
  const [remaining, setRemaining] = useState(() => Math.max(0, (Number.isFinite(expiresAt) ? expiresAt : 0) - Date.now()));
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const lapsed = useRef(false);
  const loginPath = `/${lang}/login?next=${encodeURIComponent(`/${lang}/checkout?order=${order.id}`)}`;

  const check = useCallback(
    async (manual: boolean) => {
      if (busy.current) return;
      busy.current = true;
      if (manual) {
        setChecking(true);
        setFailed(false);
      }
      let result: OrderActionResult | null = null;
      try {
        result = await refreshOrder(order.id);
      } catch {
        result = null;
      }
      busy.current = false;
      if (manual) setChecking(false);
      if (!result) {
        if (manual) setFailed(true);
        return;
      }
      if (!result.ok) {
        if (result.status === 401) {
          router.replace(loginPath);
          return;
        }
        if (manual) setFailed(true);
        return;
      }
      setLastChecked(hcmClock());
      // Anything but "still waiting" changes the whole screen; the server renders
      // the paid, review or closed state from the stored order.
      if (!['pending', 'processing'].includes(result.order.status)) router.refresh();
    },
    [loginPath, order.id, router],
  );

  useEffect(() => {
    const tick = () => {
      const left = Number.isFinite(expiresAt) ? Math.max(0, expiresAt - Date.now()) : 0;
      setRemaining(left);
      if (left === 0 && !lapsed.current) {
        lapsed.current = true;
        router.refresh();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, router]);

  useEffect(() => {
    const autoCheck = () => {
      if (document.visibilityState !== 'visible') return;
      if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) return;
      void check(false);
    };
    const timer = window.setInterval(autoCheck, 3000);
    document.addEventListener('visibilitychange', autoCheck);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', autoCheck);
    };
  }, [check, expiresAt]);

  const bank = order.checkout.bank;

  return (
    <>
      {order.checkout.qrImageUrl ? (
        <QrPlate caption={t.scan}>
          <img src={order.checkout.qrImageUrl} alt={t.scan} className="h-full w-full object-contain" />
        </QrPlate>
      ) : (
        <StatePlate glyph="clock" label={t.stepWaiting} sub={`${t.closesIn} ${countdown(remaining)}`} />
      )}
      <article className="flex min-w-0 flex-col gap-4">
        <div>
          <p className="mb-0.5 text-[11.5px] text-mist">{order.checkout.kind === 'hosted' ? t.hostedNote : t.transferExactly}</p>
          <Rows>
            {bank ? <Row label={t.bank}>{bank.bankName}</Row> : null}
            {bank ? (
              <Row label={t.account}>
                <span>{bank.accountNumber}</span>
                <CopyValue value={bank.accountNumber.replace(/\s+/g, '')} label={t.copy} copiedLabel={t.copied} />
              </Row>
            ) : null}
            <Row label={t.amount}>
              <span>{formatVnd(order.amountVnd, lang)}</span>
              <CopyValue value={String(order.amountVnd)} label={t.copy} copiedLabel={t.copied} />
            </Row>
            <Row label={t.reference}>
              <span>{order.reference}</span>
              <CopyValue value={order.reference} label={t.copy} copiedLabel={t.copied} />
            </Row>
            <Row label={t.closesIn}>
              <span className="font-display text-xl tracking-[0.02em] text-brand">{countdown(remaining)}</span>
            </Row>
          </Rows>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {order.checkout.url ? (
            <a
              href={order.checkout.url}
              target="_blank"
              rel="noreferrer noopener"
              className="smooth inline-flex items-center justify-center rounded-full border border-brand bg-brand px-4 py-2 text-[13px] font-semibold text-on-brand hover:bg-brand-deep"
            >
              {t.hostedPay}
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => void check(true)}
            disabled={checking}
            className="smooth inline-flex items-center justify-center gap-1.5 rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-fog hover:border-brand disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" />
              <path d="M4 4v4h4" />
              <path d="M4 13a8 8 0 0 0 14.5 4.5L20 16" />
              <path d="M20 20v-4h-4" />
            </svg>
            {checking ? t.checking : t.checkNow}
          </button>
          <span aria-live="polite" className="text-[11.5px] text-mist">
            {failed ? t.checkFailed : lastChecked ? t.autoCheck(lastChecked) : t.autoCheckWaiting}
          </span>
        </div>
        <Steps
          steps={[
            { label: t.stepCreated, tone: 'done' },
            { label: t.stepWaiting, tone: 'now' },
            { label: t.stepActivated, tone: 'todo' },
          ]}
        />
        <p className="text-[11.5px] leading-relaxed text-mist">{t.pendingNote}</p>
      </article>
    </>
  );
}
