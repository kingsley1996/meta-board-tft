'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { fetchComps, type ApiComp, type CompsResponse } from '@/lib/api';
import { tierRank } from '@/lib/tiers';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { tierColor, TierChip, TierTabs, UnitHex } from './ui';
import { CompPanel } from './comp-panel';

// Tier list ⇄ comp detail are separate routes rendering the same explorer;
// caching the payload keeps the list on screen during the client-side hop
// (no loading collapse, no scroll clamp). Refetched on every mount.
const cache: Record<string, CompsResponse> = {};

// Views are counted once per browser session per comp.
const viewed = new Set<string>();

// useLayoutEffect while hydrating in the browser, useEffect during SSR.
const useScrollEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function CompsExplorer({ openSlug, lang }: { openSlug?: string; lang: Lang }) {
  const t = messages[lang].explorer;
  const [sort, setSort] = useState<'default' | 'popular'>('default');
  const cacheKey = `${lang}:${sort}`;
  const [data, setData] = useState<CompsResponse | null>(() => cache[cacheKey] ?? null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [style, setStyle] = useState('All');
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let live = true;
    setError('');
    fetchComps(lang, sort === 'popular' ? 'popular' : undefined)
      .then((payload) => {
        cache[cacheKey] = payload;
        if (live) setData(payload);
      })
      .catch((reason) => {
        if (live) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      live = false;
    };
  }, [attempt, lang, sort, cacheKey]);

  // Bring the expanded comp panel into view (and skip Next's scroll-to-top).
  useScrollEffect(() => {
    if (openSlug && data) panelRef.current?.scrollIntoView({ block: 'start' });
  }, [openSlug, data]);

  useEffect(() => {
    if (!openSlug || !data || viewed.has(openSlug)) return;
    viewed.add(openSlug);
    fetch(`/api/comps/${openSlug}/view`, { method: 'POST' }).catch(() => {});
  }, [openSlug, data]);

  const comps = data?.comps ?? [];
  const styles = ['All', ...new Set(comps.map((comp) => comp.style))];
  const filtered = comps.filter(
    (comp) => comp.title.toLowerCase().includes(query.toLowerCase()) && (style === 'All' || comp.style === style)
  );

  return (
    <div className="flex flex-col gap-5">
      <div data-section="page-head" className="flex flex-wrap items-center justify-between gap-3">
        <TierTabs current="comps" lang={lang} />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.search}
            aria-label={t.search}
            className="smooth h-9 w-56 rounded-lg border border-line bg-panel px-4 text-sm text-fog placeholder:text-mist focus:border-brand-soft focus:outline-none"
          />
          <select
            value={style}
            onChange={(event) => setStyle(event.target.value)}
            aria-label={t.style}
            className="smooth h-9 rounded-lg border border-line bg-panel px-3 text-sm font-semibold text-fog focus:border-brand-soft focus:outline-none"
          >
            {styles.map((option) => (
              <option key={option} value={option}>{option === 'All' ? t.style : option}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as 'default' | 'popular')}
            aria-label={t.sort}
            className="smooth h-9 rounded-lg border border-line bg-panel px-3 text-sm font-semibold text-fog focus:border-brand-soft focus:outline-none"
          >
            <option value="default">{t.sortDefault}</option>
            <option value="popular">{t.sortPopular}</option>
          </select>
        </div>
      </div>
      {error ? (
        <p className="flex items-center justify-center gap-3 rounded-xl border border-line bg-panel p-8 text-center text-sm text-mist">
          {t.error} — {error}
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="smooth rounded-full border border-brand-hot bg-brand-hot px-4 py-1 text-xs font-semibold text-white hover:bg-brand-deep"
          >
            {t.retry}
          </button>
        </p>
      ) : !data ? (
        <p className="rounded-xl border border-line bg-panel p-8 text-center text-sm text-mist">{t.loading}</p>
      ) : (
        <div data-section="tierlist" className="flex flex-col gap-4">
          {tierRank.map((tier) => {
            const tierComps = filtered.filter((comp) => comp.tier === tier);
            if (!tierComps.length) return null;
            const openComp = openSlug ? tierComps.find((comp) => comp.slug === openSlug) : undefined;
            return (
              <div key={tier} className="flex items-stretch gap-4">
                <TierChip tier={tier} label={messages[lang].tiers[tier]} />
                <div className="relative flex-1 rounded-xl border p-3" style={{ borderColor: tierColor[tier] }}>
                  {tier === 'X' ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-panel px-4 py-0.5 text-xs font-semibold uppercase tracking-wide text-tier-x">
                      {t.situational}
                    </span>
                  ) : null}
                  <div className="flex flex-wrap gap-x-4 gap-y-3">
                    {tierComps.map((comp) => (
                      <CompCluster key={comp.slug} comp={comp} active={comp.slug === openSlug} lang={lang} />
                    ))}
                  </div>
                  {openComp ? (
                    <div ref={panelRef} className="mt-4 scroll-mt-20">
                      <CompPanel comp={openComp} lang={lang} />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
          {!filtered.length ? (
            <p className="rounded-xl border border-line bg-panel p-8 text-center text-sm text-mist">{t.noMatch}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CompCluster({ comp, active, lang }: { comp: ApiComp; active: boolean; lang: Lang }) {
  const t = messages[lang].explorer;
  const trend = comp.trend === 'up'
    ? { glyph: '\u25B2', label: t.trendingUp, color: 'text-tier-c' }
    : comp.trend === 'down'
      ? { glyph: '\u25BC', label: t.trendingDown, color: 'text-tier-s' }
      : null;
  return (
    <Link
      href={`/${lang}/tierlist/comps/${comp.slug}`}
      scroll={false}
      aria-label={`${comp.title} (${comp.style})${trend ? ` — ${trend.label}` : ''}`}
      className={`flex items-center gap-3 rounded-lg p-2 ${active ? 'bg-util ring-1 ring-brand-soft' : 'smooth hover:bg-util'}`}
    >
      <UnitHex name={comp.carry.name} cost={comp.carry.cost} icon={comp.carry.icon} size={52} />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-fog">{comp.title}</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-mist">
          {comp.style} · {t.units(comp.units.length)}
        </span>
      </span>
      {trend ? (
        <span title={trend.label} className={`ml-1 text-sm font-bold ${trend.color}`}>
          {trend.glyph}
          <span className="sr-only">{trend.label}</span>
        </span>
      ) : null}
    </Link>
  );
}
