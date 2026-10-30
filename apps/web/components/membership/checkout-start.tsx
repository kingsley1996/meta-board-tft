'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { startOrder, type OrderActionResult } from '@/lib/api';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { Rows, Row, StatePlate } from './checkout-parts';

// Creating the order is the only moment the browser asks the API to spend
// anything. The request key comes from sessionStorage so a reload mid-request
// replays the same order instead of opening a second QR.

function readRequestKey(code: string): string {
  const storageKey = `mb.checkout.${code}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    // Storage blocked: a reload can at worst open one extra order, never a charge.
    return crypto.randomUUID();
  }
}

function clearRequestKey(code: string): void {
  try {
    sessionStorage.removeItem(`mb.checkout.${code}`);
  } catch {
    // Nothing to clean up.
  }
}

export function CheckoutStart({
  lang,
  planVersionId,
  code,
  label,
  termDays,
  price,
}: {
  lang: Lang;
  planVersionId: string;
  code: string;
  label: string;
  termDays: number | null;
  price: string;
}) {
  const t = messages[lang].checkout;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const request = useRef<Promise<OrderActionResult> | null>(null);

  useEffect(() => {
    // One POST per attempt, shared across React's mount/remount: the strict-mode
    // second pass re-attaches to the same promise instead of opening a second order.
    if (!request.current) request.current = startOrder(planVersionId, readRequestKey(code));
    let live = true;
    request.current
      .then((result) => {
        if (!live) return;
        if (result.ok) {
          clearRequestKey(code);
          router.replace(`/${lang}/checkout?order=${result.order.id}`);
          return;
        }
        if (result.status === 401) {
          router.replace(`/${lang}/login?next=${encodeURIComponent(`/${lang}/checkout?plan=${code}`)}`);
          return;
        }
        setError(result.code);
      })
      .catch(() => {
        if (live) setError('unavailable');
      });
    return () => {
      live = false;
    };
  }, [attempt, code, lang, planVersionId, router]);

  const retry = () => {
    request.current = null;
    setError(null);
    setAttempt((value) => value + 1);
  };

  return (
    <>
      <StatePlate
        glyph={error ? 'alert' : 'clock'}
        label={error ? t.failedPlate : t.starting}
        sub={error ? t.failedSub : t.startingSub}
      />
      <article className="flex min-w-0 flex-col gap-4">
        <h2 className="font-display text-[26px] leading-tight font-bold uppercase tracking-tight text-fog">
          {error ? t.failedTitle : t.planTitle(label, termDays)}
        </h2>
        <p className="text-sm leading-relaxed text-mist">
          {error ? (t.startError[error] ?? t.startError.unavailable) : t.startingBody}
        </p>
        <Rows>
          <Row label={t.amount}>{price}</Row>
        </Rows>
        {error ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={retry}
              className="smooth inline-flex items-center justify-center rounded-full border border-brand bg-brand px-4 py-2 text-[13px] font-semibold text-on-brand hover:bg-brand-deep"
            >
              {t.startRetry}
            </button>
            <Link
              href={`/${lang}/membership`}
              className="smooth inline-flex items-center justify-center rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-mist hover:border-brand hover:text-fog"
            >
              {t.backToPricing}
            </Link>
          </div>
        ) : (
          <p aria-live="polite" className="text-[11.5px] text-mist">
            {t.autoCheckWaiting}
          </p>
        )}
      </article>
    </>
  );
}
