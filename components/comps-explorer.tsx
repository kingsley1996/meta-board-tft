'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchComps, type ApiComp, type CompsResponse } from '@/lib/api';
import { tierLabels, tierRank } from '@/lib/tiers';
import { tierColor, TierChip, TierTabs, UnitHex } from './ui';
import { CompPanel } from './comp-panel';

export function CompsExplorer({ openSlug }: { openSlug?: string }) {
  const [data, setData] = useState<CompsResponse | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [style, setStyle] = useState('All');

  useEffect(() => {
    let live = true;
    setError('');
    fetchComps()
      .then((payload) => {
        if (live) setData(payload);
      })
      .catch((reason) => {
        if (live) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const comps = data?.comps ?? [];
  const styles = ['All', ...new Set(comps.map((comp) => comp.style))];
  const filtered = comps.filter(
    (comp) => comp.title.toLowerCase().includes(query.toLowerCase()) && (style === 'All' || comp.style === style)
  );

  return (
    <div className="flex flex-col gap-5">
      <div data-section="page-head" className="flex flex-wrap items-center justify-between gap-3">
        <TierTabs current="comps" />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search comps"
            aria-label="Search comps"
            className="smooth h-9 w-56 rounded-lg border border-line bg-panel px-4 text-sm text-fog placeholder:text-mist focus:border-brand-soft focus:outline-none"
          />
          <select
            value={style}
            onChange={(event) => setStyle(event.target.value)}
            aria-label="Filter by style"
            className="smooth h-9 rounded-lg border border-line bg-panel px-3 text-sm font-semibold text-fog focus:border-brand-soft focus:outline-none"
          >
            {styles.map((option) => (
              <option key={option} value={option}>{option === 'All' ? 'Comp style' : option}</option>
            ))}
          </select>
        </div>
      </div>
      {error ? (
        <p className="flex items-center justify-center gap-3 rounded-xl border border-line bg-panel p-8 text-center text-sm text-mist">
          Could not load comps from the API — {error}
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="smooth rounded-full border border-brand-hot bg-brand-hot px-4 py-1 text-xs font-semibold text-white hover:bg-brand-deep"
          >
            Retry
          </button>
        </p>
      ) : !data ? (
        <p className="rounded-xl border border-line bg-panel p-8 text-center text-sm text-mist">Loading comps…</p>
      ) : (
        <div data-section="tierlist" className="flex flex-col gap-4">
          {tierRank.map((tier) => {
            const tierComps = filtered.filter((comp) => comp.tier === tier);
            if (!tierComps.length) return null;
            const openComp = openSlug ? tierComps.find((comp) => comp.slug === openSlug) : undefined;
            return (
              <div key={tier} className="flex items-stretch gap-4">
                <TierChip tier={tier} label={tierLabels[tier]} />
                <div className="relative flex-1 rounded-xl border p-3" style={{ borderColor: tierColor[tier] }}>
                  {tier === 'X' ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-panel px-4 py-0.5 text-xs font-semibold uppercase tracking-wide text-tier-x">
                      Situational
                    </span>
                  ) : null}
                  <div className="flex flex-wrap gap-x-4 gap-y-3">
                    {tierComps.map((comp) => (
                      <CompCluster key={comp.slug} comp={comp} active={comp.slug === openSlug} />
                    ))}
                  </div>
                  {openComp ? (
                    <div className="mt-4">
                      <CompPanel comp={openComp} />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
          {!filtered.length ? (
            <p className="rounded-xl border border-line bg-panel p-8 text-center text-sm text-mist">
              No comps match that search — clear the filter to see the full board.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CompCluster({ comp, active }: { comp: ApiComp; active: boolean }) {
  const trend = comp.trend === 'up'
    ? { glyph: '\u25B2', label: 'Trending up', color: 'text-tier-c' }
    : comp.trend === 'down'
      ? { glyph: '\u25BC', label: 'Trending down', color: 'text-tier-s' }
      : null;
  return (
    <Link
      href={`/tierlist/comps/${comp.slug}`}
      aria-label={`${comp.title} (${comp.style})${trend ? ` — ${trend.label}` : ''}`}
      className={`flex items-center gap-3 rounded-lg p-2 ${active ? 'bg-util ring-1 ring-brand-soft' : 'smooth hover:bg-util'}`}
    >
      <UnitHex name={comp.carry.name} cost={comp.carry.cost} icon={comp.carry.icon} size={52} />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-fog">{comp.title}</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-mist">
          {comp.style} · {comp.units.length} units
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
