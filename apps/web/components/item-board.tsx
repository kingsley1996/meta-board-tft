'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { iconByName, itemSlugByName, tierRank, type TierItem } from '@/lib/data';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { augmentName, itemName } from '@/lib/tips';
import { AugmentTile, ItemTile, tierColor, TierChip, TierTabs } from './ui';

// Both tabs of this board share one tile size, so switching between them does not
// move the grid.
const TILE = 56;

export function ItemBoard({
  items,
  current,
  lang,
  heading,
}: {
  items: TierItem[];
  current: 'items' | 'augments';
  lang: Lang;
  heading?: string;
}) {
  const t = messages[lang][current];
  // Item art is distinctive enough to read on its own, so this board keeps the
  // names behind the same switch the comps list offers, but off by default.
  const [showNames, setShowNames] = useState(false);
  useEffect(() => {
    setShowNames(localStorage.getItem(`${current}-show-names`) === '1');
  }, [current]);
  useEffect(() => {
    localStorage.setItem(`${current}-show-names`, showNames ? '1' : '0');
  }, [current, showNames]);
  const displayName = current === 'items' ? itemName : augmentName;
  return (
    <div className="flex flex-col gap-5">
      {heading ? (
        <p className="mt-2 text-center text-xs font-semibold uppercase tracking-wide text-mist">{heading}</p>
      ) : (
        <div data-section="page-head" className="flex flex-wrap items-center justify-between gap-3">
          <TierTabs current={current} lang={lang} />
          <button
            type="button"
            role="switch"
            aria-checked={showNames}
            title={t.showNames}
            onClick={() => setShowNames((value) => !value)}
            className="smooth flex h-9 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-mist hover:border-brand hover:text-fog"
          >
            <span className={`relative h-4 w-7 rounded-full transition-colors ${showNames ? 'bg-brand' : 'bg-mist/40'}`}>
              <span className={`smooth absolute top-0.5 h-3 w-3 rounded-full bg-white ${showNames ? 'left-3.5' : 'left-0.5'}`} />
            </span>
            <span className="hidden whitespace-nowrap sm:inline">{t.showNames}</span>
          </button>
        </div>
      )}
      <div data-section="tierboard" className="flex flex-col gap-4">
        {tierRank.map((tier) => {
          const tierItems = items.filter((item) => item.tier === tier);
          if (!tierItems.length) return null;
          return (
            <div key={tier} className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-4">
              <TierChip tier={tier} label={`${tier} Tier`} />
              <div className="relative flex-1 rounded-xl border p-3" style={{ borderColor: tierColor[tier] }}>
                <div className="flex flex-wrap gap-3">
                  {tierItems.map((item) => (
                    <div key={item.name} className="group/hex relative flex items-center gap-2">
                      <span className="pointer-events-none absolute -top-9 left-0 z-10 hidden rounded-md border border-line bg-panel px-2 py-1 text-xs font-semibold whitespace-nowrap text-fog opacity-0 transition-opacity group-hover/hex:opacity-100 lg:block">
                        {displayName(item.name, lang)} <span className="ml-1 font-normal text-mist">{item.note[lang]}</span>
                      </span>
                      {current === 'items' ? (
                        <ItemTile name={item.name} icon={iconByName[item.name] ?? null} tier={item.tier} size={TILE} href={`/${lang}/items/${itemSlugByName[item.name]}`} />
                      ) : (
                        <AugmentTile name={item.name} icon={iconByName[item.name] ?? null} size={TILE} />
                      )}
                      {showNames && (
                        current === 'items' && itemSlugByName[item.name] ? (
                          <Link href={`/${lang}/items/${itemSlugByName[item.name]}`} className="smooth text-sm font-semibold text-fog hover:text-brand">{displayName(item.name, lang)}</Link>
                        ) : (
                          <span className="text-sm font-semibold text-fog">{displayName(item.name, lang)}</span>
                        )
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
