'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { tierColor, UnitHex } from '@/components/ui';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import type { Tier } from '@/lib/tiers';
import { itemName, unitName } from '@/lib/tips';

export type QuizChampion = { name: string; cost: number; icon: string | null };
export type QuizItem = { name: string; icon: string | null };
export type QuizComp = { slug: string; title: string; tier: Tier; early: string[]; units: string[]; items: string[] };

const MAX_UNITS = 3;
const MAX_ITEMS = 2;
const tierRank: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, X: 4 };

// Score a comp against the picks: early units weigh most (they decide the line),
// then board units, then items the player already holds.
function scoreComp(comp: QuizComp, unitPicks: string[], itemPicks: string[]) {
  const early = unitPicks.filter((name) => comp.early.includes(name)).length;
  const board = unitPicks.filter((name) => comp.units.includes(name)).length;
  const item = itemPicks.filter((name) => comp.items.includes(name)).length;
  return early * 3 + board * 2 + item * 2;
}

export function Quiz({ lang, champions, items, comps }: { lang: Lang; champions: QuizChampion[]; items: QuizItem[]; comps: QuizComp[] }) {
  const t = messages[lang].quiz;
  const [unitPicks, setUnitPicks] = useState<string[]>([]);
  const [itemPicks, setItemPicks] = useState<string[]>([]);
  const [unitSearch, setUnitSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [showResults, setShowResults] = useState(false);

  const toggle = (picks: string[], setPicks: (value: string[]) => void, max: number, name: string) => {
    if (picks.includes(name)) setPicks(picks.filter((entry) => entry !== name));
    else if (picks.length < max) setPicks([...picks, name]);
    setShowResults(false);
  };

  const results = useMemo(
    () =>
      comps
        .map((comp) => ({ comp, score: scoreComp(comp, unitPicks, itemPicks) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || (tierRank[a.comp.tier] ?? 9) - (tierRank[b.comp.tier] ?? 9))
        .slice(0, 3),
    [comps, unitPicks, itemPicks]
  );

  const unitNeedle = unitSearch.trim().toLowerCase();
  const itemNeedle = itemSearch.trim().toLowerCase();
  const visibleChampions = champions.filter((champion) => unitName(champion.name, lang).toLowerCase().includes(unitNeedle) || champion.name.toLowerCase().includes(unitNeedle));
  const visibleItems = items.filter((item) => itemName(item.name, lang).toLowerCase().includes(itemNeedle) || item.name.toLowerCase().includes(itemNeedle));

  const reset = () => {
    setUnitPicks([]);
    setItemPicks([]);
    setShowResults(false);
  };

  const chipCls = (active: boolean, disabled: boolean) =>
    `smooth flex flex-col items-center gap-1 rounded-lg border p-2 text-center ${active ? 'border-brand-hot bg-brand-hot/15' : disabled ? 'border-line bg-panel opacity-40' : 'border-line bg-panel hover:border-brand-soft'}`;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-mist">{t.champions} · {unitPicks.length}/{MAX_UNITS}</p>
          <input
            value={unitSearch}
            onChange={(event) => setUnitSearch(event.target.value)}
            placeholder={t.search}
            className="smooth h-9 w-52 rounded-lg border border-line bg-page px-3 text-sm text-fog placeholder:text-mist focus:border-brand-soft focus:outline-none"
          />
        </div>
        <div className="grid max-h-80 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6 lg:grid-cols-8">
          {visibleChampions.map((champion) => {
            const active = unitPicks.includes(champion.name);
            return (
              <button
                key={champion.name}
                type="button"
                onClick={() => toggle(unitPicks, setUnitPicks, MAX_UNITS, champion.name)}
                disabled={!active && unitPicks.length >= MAX_UNITS}
                className={chipCls(active, !active && unitPicks.length >= MAX_UNITS)}
              >
                <UnitHex name={champion.name} cost={champion.cost} icon={champion.icon} size={40} />
                <span className="w-full truncate text-xs font-semibold text-fog">{unitName(champion.name, lang)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-mist">{t.items} · {itemPicks.length}/{MAX_ITEMS}</p>
          <input
            value={itemSearch}
            onChange={(event) => setItemSearch(event.target.value)}
            placeholder={t.search}
            className="smooth h-9 w-52 rounded-lg border border-line bg-page px-3 text-sm text-fog placeholder:text-mist focus:border-brand-soft focus:outline-none"
          />
        </div>
        <div className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6 lg:grid-cols-8">
          {visibleItems.map((item) => {
            const active = itemPicks.includes(item.name);
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => toggle(itemPicks, setItemPicks, MAX_ITEMS, item.name)}
                disabled={!active && itemPicks.length >= MAX_ITEMS}
                className={chipCls(active, !active && itemPicks.length >= MAX_ITEMS)}
              >
                {item.icon ? <img src={item.icon} alt="" loading="lazy" className="h-9 w-9 rounded" /> : <span className="h-9 w-9" />}
                <span className="w-full truncate text-xs font-semibold text-fog">{itemName(item.name, lang)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setShowResults(true)}
          disabled={!unitPicks.length}
          className="smooth rounded-full border border-brand-hot bg-brand-hot px-6 py-2 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-40"
        >
          {t.find}
        </button>
        <button
          type="button"
          onClick={reset}
          className="smooth rounded-full border border-line bg-panel px-5 py-2 text-sm font-semibold text-mist hover:border-brand-soft hover:text-fog"
        >
          {t.again}
        </button>
      </div>

      {showResults ? (
        results.length ? (
          <section className="flex flex-col gap-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-mist">{t.results}</p>
            {results.map(({ comp, score }) => (
              <div key={comp.slug} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel p-3">
                <span
                  className="inline-block w-8 rounded-lg border-2 px-1 text-center font-display text-lg font-bold"
                  style={{ borderColor: tierColor[comp.tier], color: tierColor[comp.tier] }}
                >
                  {comp.tier}
                </span>
                <div className="min-w-40 flex-1">
                  <p className="font-semibold text-fog">{comp.title}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {comp.units.slice(0, 8).map((name) => (
                      <span key={name} className={`text-xs font-semibold ${unitPicks.includes(name) ? 'text-brand-soft' : 'text-mist'}`}>
                        {unitName(name, lang)}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="rounded-full border border-line bg-util px-2 py-0.5 text-xs font-semibold text-mist">{score} {t.match}</span>
                <Link
                  href={`/${lang}/tierlist/comps/${comp.slug}`}
                  className="smooth rounded-full border border-line bg-page px-4 py-1.5 text-sm font-semibold text-fog hover:border-brand-soft"
                >
                  {t.view}
                </Link>
              </div>
            ))}
          </section>
        ) : (
          <p className="rounded-xl border border-line bg-panel px-4 py-3 text-sm text-mist">{t.noResult}</p>
        )
      ) : null}
    </div>
  );
}
