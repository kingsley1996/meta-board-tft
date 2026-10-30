'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getMembershipUsage, type MembershipUsage } from '@/lib/api';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

// The pricing page is cached HTML, so the account's own plan can only arrive after
// hydration. One fetch serves both cards; a guest (401) and an unreachable API both
// fall back to the public state, and the server still refuses a second purchase.

let pending: Promise<MembershipUsage | null> | null = null;

// Dedupes the two cards' requests, but only while one is in flight: a plan can
// change mid-session (checkout succeeds, then the user comes back here), so a
// settled answer must never be reused.
function load(): Promise<MembershipUsage | null> {
  if (!pending) {
    pending = getMembershipUsage().catch(() => null).finally(() => {
      pending = null;
    });
  }
  return pending;
}

type State = { kind: 'loading' } | { kind: 'guest' } | { kind: 'plan'; paid: boolean; endsAt: string | null };

const disabledBase =
  'inline-flex cursor-not-allowed items-center justify-center rounded-full border border-line px-[18px] py-2.5 text-[13.5px] font-semibold text-mist opacity-50';
const disabled = `mx-[18px] mt-auto mb-[18px] ${disabledBase}`;

function formatDay(iso: string | null, lang: Lang): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', {
    day: '2-digit',
    month: lang === 'vi' ? '2-digit' : 'short',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
}

export function PlanCta({ lang, plan, price, paused = false }: { lang: Lang; plan: 'free' | 'plus'; price?: string; paused?: boolean }) {
  const t = messages[lang].membership;
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    load().then((usage) => {
      if (!live) return;
      setState(usage ? { kind: 'plan', paid: usage.plan.paid, endsAt: usage.period?.endsAt ?? null } : { kind: 'guest' });
    });
    return () => {
      live = false;
    };
  }, []);

  const active = state.kind === 'plan' && state.paid;

  if (plan === 'free') {
    if (state.kind === 'loading') return <span className={disabled}>{t.checking}</span>;
    return <span className={disabled}>{active ? t.free.includedInPlus : t.free.cta}</span>;
  }

  if (state.kind === 'loading') return <span className={disabled}>{t.checking}</span>;
  if (active) {
    const until = formatDay(state.kind === 'plan' ? state.endsAt : null, lang);
    return <span className={disabled}>{until ? t.plus.current(until) : t.plus.currentNoDate}</span>;
  }
  if (paused) {
    return (
      <div className="mx-[18px] mt-auto mb-[18px] flex flex-col items-stretch gap-1.5">
        <span className={`w-full ${disabledBase}`}>{t.plus.pausedCta}</span>
        <p className="text-center text-[11px] leading-snug text-mist">{t.plus.pausedNote}</p>
      </div>
    );
  }
  return (
    <Link
      href={`/${lang}/checkout?plan=plus`}
      className="smooth mx-[18px] mt-auto mb-[18px] inline-flex items-center justify-center rounded-full border border-brand bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-on-brand hover:bg-brand-deep"
    >
      {t.plus.cta(price ?? '')}
    </Link>
  );
}
