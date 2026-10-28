'use client';

import { useState } from 'react';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import type { Tier } from '@/lib/tiers';
import { ItemRanking, Panel } from './ui';

export type StatBlock = { avg: number; top4: number; win: number; pick: number | null; games: number };
export type StatItemRow = { name: string; icon?: string | null; tier?: Tier | null; note?: string };

// The all/master split used to be a `?rank=` round-trip through the server, which
// kept the whole champion route dynamic. Both blocks ship with the document and
// the toggle is state, so switching costs nothing.
export function ChampionStatsPanel({ lang, ranks, itemRows }: { lang: Lang; ranks: { key: 'all' | 'master'; stats: StatBlock }[]; itemRows: StatItemRow[] }) {
  const t = messages[lang].champion;
  const [rank, setRank] = useState<'all' | 'master'>('all');
  const stats = ranks.find((entry) => entry.key === rank)?.stats ?? ranks[0]?.stats ?? null;
  const label = { all: t.rankAll, master: t.rankMaster };
  const compact = (value: number) => value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}K` : String(value);

  return (
    <div data-section="champion-stats" className="min-w-0 lg:col-span-2 xl:col-span-1">
      <Panel className="flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">{t.statsTab}</p>
          {ranks.length > 1 ? (
            <div className="flex overflow-hidden rounded-md border border-line">
              {ranks.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setRank(entry.key)}
                  className={`smooth px-2.5 py-1 text-[11px] font-semibold ${rank === entry.key ? 'bg-brand text-on-brand' : 'text-mist hover:text-fog'}`}
                  aria-pressed={rank === entry.key}
                >
                  {label[entry.key]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-mist">{t.stats}</p>
          {stats ? (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: t.avg, value: stats.avg.toFixed(2) },
                { label: t.top4, value: `${(stats.top4 * 100).toFixed(1)}%` },
                { label: t.win, value: `${(stats.win * 100).toFixed(1)}%` },
                stats.pick != null ? { label: t.pick, value: `${(stats.pick * 100).toFixed(1)}%` } : null,
                { label: t.games, value: compact(stats.games) },
              ].filter((row): row is { label: string; value: string } => row !== null).map((row) => (
                <div key={row.label} className="rounded-lg border border-line bg-ink/40 p-2 text-center last:col-span-2">
                  <p className="font-display text-lg font-bold text-fog">{row.value}</p>
                  <p className="text-[11px] uppercase tracking-wide text-mist">{row.label}</p>
                </div>
              ))}
            </div>
          ) : null}
          {itemRows.length ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.items}</p>
              <ItemRanking items={itemRows} showTier={false} lang={lang} />
              <p className="text-xs leading-relaxed text-mist">{t.itemsNote}</p>
            </>
          ) : (
            <p className="text-sm text-mist">{t.noComps}</p>
          )}
        </div>
      </Panel>
    </div>
  );
}
