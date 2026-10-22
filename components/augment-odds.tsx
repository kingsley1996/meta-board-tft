'use client';

import { useState } from 'react';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { translateText } from '@/lib/translate';

export type AugmentCell = {
  path: string;
  tier: string;
  conditional: string;
  weight: string;
  title: string;
};

const TIERS = ['Gold', 'Silver', 'Prismatic'] as const;

// Augment tier colours, kept in the TFT augment palette (gold / silver /
// prismatic) so the chart reads the same as the icons.
const TIER_COLOR: Record<string, string> = {
  Gold: '#f0a83a',
  Silver: '#aebbd0',
  Prismatic: '#c79bf2',
};
const TIER_TEXT: Record<string, string> = {
  Gold: '#1b1206',
  Silver: '#101722',
  Prismatic: '#1b0f28',
};

const percent = (value: string) => Number.parseFloat(value) || 0;

export function AugmentOdds({ cells, lang }: { cells: AugmentCell[]; lang: Lang }) {
  const t = messages[lang].tables.loot;
  const [picked, setPicked] = useState<string[]>([]);

  // Cells for one column: same path length and a path that starts with the
  // tiers picked so far.
  const column = (depth: number, prefix: string[]) =>
    cells.filter((cell) => {
      const parts = cell.path.split('|');
      return parts.length === depth + 1 && parts.slice(0, depth).every((part, index) => part === prefix[index]);
    });

  // Selection per column: the user pick when it still fits the current path,
  // otherwise the most likely tier.
  const selection: string[] = [];
  const columns: AugmentCell[][] = [];
  let prefix: string[] = [];
  for (let depth = 0; depth < 3; depth += 1) {
    const candidates = column(depth, prefix);
    if (!candidates.length) break;
    const best = [...candidates].sort((a, b) => percent(b.conditional) - percent(a.conditional))[0];
    const tier = picked[depth] && candidates.some((cell) => cell.tier === picked[depth]) ? picked[depth] : best.tier;
    selection.push(tier);
    prefix = [...prefix, tier];
    columns.push(candidates);
  }

  // Each column is as tall as the block picked in the column before it.
  const heights: number[] = [];
  columns.forEach((candidates, depth) => {
    const share = depth === 0 ? 100 : percent(candidates.find((cell) => cell.tier === selection[depth - 1])?.conditional ?? '0');
    heights.push((heights[depth - 1] ?? 100) * (share / 100));
  });

  const pick = (depth: number, tier: string) => setPicked([...picked.slice(0, depth), tier]);

  const chain = cells.filter((cell) => cell.path === selection.join('|'));
  const jointPercent = chain[0]?.title.match(/([\d.]+)%/)?.[1] ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {selection.map((tier, depth) => (
          <span key={`${tier}-${depth}`} className="flex items-center gap-1.5 rounded-md border border-line bg-util px-2.5 py-1 text-xs font-semibold text-fog">
            <span className="h-3 w-3 rounded-sm" style={{ background: TIER_COLOR[tier] }} />
            <span className="text-mist">{t.augmentColumns[depth]}</span>
            {t.tierNames[tier] ?? tier}
            <span className="text-mist">{percent(columns[depth].find((cell) => cell.tier === tier)?.conditional ?? '0').toFixed(1)}%</span>
          </span>
        ))}
        {jointPercent ? (
          <span className="text-xs text-mist">
            {t.jointOdds}: {jointPercent}% {t.ofGames}
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-3" style={{ height: 520, minWidth: 540 }}>
          {columns.map((candidates, depth) => (
            <div key={depth} className="flex flex-1 flex-col gap-1">
              <p className="text-center text-xs font-semibold uppercase tracking-wide text-mist">{t.augmentColumns[depth]}</p>
              <div className="flex flex-col overflow-hidden rounded-lg border border-line" style={{ height: `${heights[depth]}%`, minHeight: 90 }}>
                {candidates.map((cell) => {
                  const active = cell.tier === selection[depth];
                  return (
                    <button
                      key={cell.path}
                      type="button"
                      onClick={() => pick(depth, cell.tier)}
                      aria-pressed={active}
                      title={translateText(lang, 'loot', 'augment-odds-title', cell.title)}
                      className="flex min-h-[20px] w-full items-center justify-center gap-1 px-2 text-center text-[11px] font-bold transition hover:brightness-110"
                      style={{
                        flex: `${percent(cell.conditional)} 0 0%`,
                        background: TIER_COLOR[cell.tier] ?? 'var(--color-util)',
                        color: TIER_TEXT[cell.tier] ?? '#fff',
                        // The picked block keeps full colour with a white inner
                        // ring; the others fade so the choice reads at a glance.
                        opacity: active ? 1 : 0.55,
                        boxShadow: active ? 'inset 0 0 0 3px #ffffff, inset 0 0 0 5px rgba(24, 30, 43, 0.85)' : 'none',
                        filter: active ? 'brightness(1.08)' : 'none',
                        zIndex: active ? 2 : 1,
                        position: 'relative',
                      }}
                    >
                      <span className="truncate">
                        {active ? '\u2713 ' : ''}
                        {t.tierNames[cell.tier] ?? cell.tier} {cell.conditional}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-mist">{t.pickTier}</p>
    </div>
  );
}
