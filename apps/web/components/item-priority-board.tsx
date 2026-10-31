'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CostDots, ItemTile, UnitHex, tierColor } from '@/components/ui';
import type { Lang } from '@/lib/i18n';
import { PRIORITY, type PriorityBucket, type PriorityItem, type UnitPriorityRow } from '@/lib/item-priority';
import { messages } from '@/lib/messages';

const BUCKETS: PriorityBucket[] = ['core', 'strong', 'situational', 'overpicked'];
const COSTS = [5, 4, 3, 2, 1];

const gainLabel = (gain: number) => `${gain > 0 ? '+' : ''}${gain.toFixed(2)}`;

const fold = (value: string) =>
  value
    .toLowerCase()
    .replace(/['’]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// "Dragon's Claw" has to answer to both "dragons claw" and "dragon claw", and
// "B.F. Sword" to "bf sword", so the literal and the possessive-free spellings
// are both tried.
const foldPossessive = (value: string) => fold(value.replace(/['’]s\b/gi, ''));
const compact = (value: string) => value.replace(/\s+/g, '');
const hit = (haystack: string, needle: string) =>
  fold(haystack).includes(needle) ||
  foldPossessive(haystack).includes(needle) ||
  (compact(needle) !== '' && compact(fold(haystack)).includes(compact(needle)));

function ItemButton({
  item,
  active,
  onToggle,
}: {
  item: PriorityItem;
  active: boolean;
  onToggle: (name: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={item.display}
      aria-pressed={active}
      onClick={() => onToggle(item.name)}
      className={`smooth flex w-14 flex-col items-center gap-1 rounded-lg p-1 ${
        active ? 'bg-brand/10 ring-1 ring-brand' : 'hover:bg-util/60'
      }`}
    >
      <ItemTile name={item.display} icon={item.icon} size={36} />
      <span className="font-display text-[11px] leading-none text-fog">{gainLabel(item.gain)}</span>
    </button>
  );
}

function SideTiles({
  label,
  entries,
  picked,
  onToggle,
}: {
  label: string;
  entries: { name: string; display: string; icon: string | null; avg: number }[];
  picked: string[];
  onToggle: (name: string) => void;
}) {
  return (
    <div>
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{label}</span>
      <div className="mt-1 flex flex-wrap gap-2">
        {entries.map((entry) => (
          <button
            key={entry.name}
            type="button"
            aria-label={entry.display}
            aria-pressed={picked.includes(entry.name)}
            onClick={() => onToggle(entry.name)}
            className={`smooth flex w-10 flex-col items-center gap-0.5 rounded-lg p-0.5 ${
              picked.includes(entry.name) ? 'bg-brand/10 ring-1 ring-brand' : 'hover:bg-util/60'
            }`}
          >
            <ItemTile name={entry.display} icon={entry.icon} size={26} />
            <span className="font-display text-[10px] leading-none text-mist">{entry.avg.toFixed(2)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ItemPriorityBoard({
  rows,
  lang,
  source,
}: {
  rows: UnitPriorityRow[];
  lang: Lang;
  source: string;
}) {
  const t = messages[lang].itemPriority;
  const number = useMemo(
    () => new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 }),
    [lang],
  );

  const [costs, setCosts] = useState<number[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [logic, setLogic] = useState<'all' | 'any'>('any');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'cost' | 'gain'>('gain');
  const [expanded, setExpanded] = useState<string[]>([]);
  const [method, setMethod] = useState(false);
  const [itemQuery, setItemQuery] = useState('');
  const [itemOpen, setItemOpen] = useState(false);
  const [itemActive, setItemActive] = useState(0);
  const itemRef = useRef<HTMLDivElement>(null);
  const [unitOpen, setUnitOpen] = useState(false);
  const [unitActive, setUnitActive] = useState(0);
  const unitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!itemRef.current?.contains(target)) setItemOpen(false);
      if (!unitRef.current?.contains(target)) setUnitOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const { itemIndex, itemGroups } = useMemo(() => {
    const index = new Map<string, PriorityItem>();
    const completed = new Map<string, PriorityItem>();
    const artifacts = new Map<string, PriorityItem>();
    const emblems = new Map<string, PriorityItem>();
    const side = (name: string, display: string, icon: string | null, avg: number, count: number): PriorityItem => ({
      name,
      display,
      icon,
      bucket: 'situational',
      gain: 0,
      share: 0,
      avg,
      count,
    });
    for (const row of rows) {
      for (const item of row.items) {
        if (!completed.has(item.name)) completed.set(item.name, item);
        index.set(item.name, item);
      }
      for (const emblem of row.emblems) {
        if (emblems.has(emblem.name)) continue;
        const entry = side(emblem.name, emblem.display, emblem.icon, emblem.avg, emblem.count);
        emblems.set(emblem.name, entry);
        index.set(emblem.name, entry);
      }
      for (const artifact of row.artifacts) {
        if (artifacts.has(artifact.name)) continue;
        const entry = side(artifact.name, artifact.display, artifact.icon, artifact.avg, artifact.count);
        artifacts.set(artifact.name, entry);
        index.set(artifact.name, entry);
      }
    }
    const byAvg = (a: PriorityItem, b: PriorityItem) => a.avg - b.avg || b.count - a.count;
    return {
      itemIndex: index,
      itemGroups: [
        { key: 'completed', entries: [...completed.values()].sort((a, b) => b.gain - a.gain || b.count - a.count) },
        { key: 'emblem', entries: [...emblems.values()].sort(byAvg) },
        { key: 'artifact', entries: [...artifacts.values()].sort(byAvg) },
      ],
    };
  }, [rows]);

  const itemNeedle = fold(itemQuery.trim());
  const itemGroupsShown = itemGroups
    .map((group) => ({
      key: group.key,
      label: group.key === 'completed' ? t.itemGroup : group.key === 'emblem' ? t.emblems : t.artifacts,
      entries: itemNeedle
        ? group.entries.filter((entry) => hit(entry.display, itemNeedle) || hit(entry.name, itemNeedle))
        : group.entries.slice(0, 4),
    }))
    .filter((group) => group.entries.length);
  const itemOptions = itemGroupsShown.flatMap((group) => group.entries);

  const unitNeedle = fold(query.trim());
  const unitOptions = unitNeedle
    ? rows.filter((row) => hit(row.display, unitNeedle) || hit(row.name, unitNeedle)).slice(0, 8)
    : [];
  const showUnits = unitOpen && unitNeedle.length > 0;

  const visible = useMemo(() => {
    const needle = fold(query.trim());
    const filtered = rows.filter((row) => {
      if (costs.length && !costs.includes(row.cost)) return false;
      if (needle && !hit(`${row.display} ${row.name}`, needle)) return false;
      if (picked.length) {
        const carried = new Set([
          ...row.items.map((item) => item.name),
          ...row.emblems.map((emblem) => emblem.name),
          ...row.artifacts.map((item) => item.name),
        ]);
        const matches = logic === 'all' ? picked.every((name) => carried.has(name)) : picked.some((name) => carried.has(name));
        if (!matches) return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) =>
      sort === 'gain'
        ? b.topGain - a.topGain || b.cost - a.cost
        : b.cost - a.cost || a.display.localeCompare(b.display, lang),
    );
  }, [rows, costs, picked, logic, query, sort, lang]);

  const toggle = (value: string) =>
    setPicked((prev) => (prev.includes(value) ? prev.filter((name) => name !== value) : [...prev, value]));
  const chooseItem = (name: string) => {
    toggle(name);
    setItemQuery('');
    setItemActive(0);
    setItemOpen(false);
  };
  const chooseUnit = (name: string) => {
    setQuery(name);
    setUnitActive(0);
    setUnitOpen(false);
  };
  const toggleRow = (name: string) =>
    setExpanded((prev) => (prev.includes(name) ? prev.filter((value) => value !== name) : [...prev, name]));

  const pill = (active: boolean) =>
    `smooth rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
      active ? 'border-brand bg-brand text-on-brand' : 'border-line bg-panel text-mist hover:border-brand'
    }`;

  return (
    <div className="flex flex-col gap-5">
      <header data-section="page-head" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brand">{t.kicker}</p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-fog md:text-4xl">{t.title}</h1>
          </div>
          <button
            type="button"
            onClick={() => setMethod((value) => !value)}
            aria-expanded={method}
            className="smooth inline-flex min-h-9 items-center rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-mist hover:border-brand hover:text-fog"
          >
            {method ? t.methodClose : t.methodOpen}
          </button>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-mist">{t.sub}</p>
        {method ? (
          <div className="rounded-xl border border-line bg-panel p-4 text-xs leading-relaxed text-mist">
            <ul className="flex list-disc flex-col gap-1.5 pl-4">
              {t.method.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line/70 pt-2 text-[11px] uppercase tracking-wide text-mist/80">{source}</p>
          </div>
        ) : null}
      </header>

      <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div ref={unitRef} className="relative flex min-w-[200px] flex-1 flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{t.search}</span>
            <input
              type="search"
              value={query}
              role="combobox"
              aria-label={t.search}
              aria-autocomplete="list"
              aria-expanded={showUnits}
              aria-controls="unit-filter-options"
              aria-activedescendant={showUnits && unitOptions[unitActive] ? `unit-filter-option-${unitActive}` : undefined}
              onChange={(event) => {
                setQuery(event.target.value);
                setUnitOpen(true);
                setUnitActive(0);
              }}
              onFocus={() => setUnitOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  // Escape would otherwise clear the search input natively and reopen the list.
                  event.preventDefault();
                  setUnitOpen(false);
                  return;
                }
                if (!unitOptions.length) return;
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setUnitOpen(true);
                  setUnitActive((value) => (value + 1) % unitOptions.length);
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setUnitOpen(true);
                  setUnitActive((value) => (value - 1 + unitOptions.length) % unitOptions.length);
                } else if (event.key === 'Enter') {
                  if (!showUnits) return;
                  event.preventDefault();
                  const row = unitOptions[unitActive] ?? unitOptions[0];
                  if (row) chooseUnit(row.display);
                }
              }}
              placeholder={t.searchPlaceholder}
              className="smooth h-9 w-full rounded-lg border border-line bg-page px-3 text-sm text-fog placeholder:text-mist"
            />
            {showUnits ? (
              <div
                id="unit-filter-options"
                role="listbox"
                aria-label={t.search}
                className="absolute top-full right-0 left-0 z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-line bg-panel py-1 shadow-2xl shadow-black/40"
              >
                {unitOptions.length ? (
                  unitOptions.map((row, index) => (
                    <button
                      key={row.name}
                      id={`unit-filter-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === unitActive}
                      onMouseEnter={() => setUnitActive(index)}
                      onClick={() => chooseUnit(row.display)}
                      className={`smooth flex w-full items-center gap-2 px-3 py-1.5 text-left ${
                        index === unitActive ? 'bg-util text-brand' : 'hover:bg-util'
                      }`}
                    >
                      <UnitHex name={row.display} cost={row.cost} icon={row.icon} size={24} />
                      <span className="min-w-0 flex-1 truncate text-xs text-fog">{row.display}</span>
                      <CostDots cost={row.cost} />
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-3 text-xs text-mist">{t.unitSearchEmpty}</p>
                )}
              </div>
            ) : null}
          </div>
          <div ref={itemRef} className="relative flex min-w-[200px] flex-1 flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{t.itemSearch}</span>
            <input
              type="search"
              value={itemQuery}
              role="combobox"
              aria-label={t.itemSearchAria}
              aria-autocomplete="list"
              aria-expanded={itemOpen}
              aria-controls="item-filter-options"
              aria-activedescendant={itemOpen && itemOptions[itemActive] ? `item-filter-option-${itemActive}` : undefined}
              placeholder={t.itemSearchPlaceholder}
              onChange={(event) => {
                setItemQuery(event.target.value);
                setItemOpen(true);
                setItemActive(0);
              }}
              onFocus={() => setItemOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  // Escape would otherwise clear the search input natively and reopen the list.
                  event.preventDefault();
                  setItemOpen(false);
                  return;
                }
                if (!itemOptions.length) return;
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setItemOpen(true);
                  setItemActive((value) => (value + 1) % itemOptions.length);
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setItemOpen(true);
                  setItemActive((value) => (value - 1 + itemOptions.length) % itemOptions.length);
                } else if (event.key === 'Enter') {
                  // A closed list must not swallow Enter into a pick the user cannot see.
                  if (!itemOpen) return;
                  event.preventDefault();
                  const entry = itemOptions[itemActive] ?? itemOptions[0];
                  if (entry) chooseItem(entry.name);
                }
              }}
              className="smooth h-9 w-full rounded-lg border border-line bg-page px-3 text-sm text-fog placeholder:text-mist"
            />
            {itemOpen ? (
              <div
                id="item-filter-options"
                role="listbox"
                aria-label={t.itemSearchAria}
                className="absolute top-full right-0 left-0 z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-line bg-panel py-1 shadow-2xl shadow-black/40"
              >
                {itemOptions.length ? (
                  itemGroupsShown.map((group) => (
                    <div key={group.key} className="py-1">
                      <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-mist">{group.label}</p>
                      {group.entries.map((entry) => {
                        const index = itemOptions.indexOf(entry);
                        return (
                          <button
                            key={entry.name}
                            id={`item-filter-option-${index}`}
                            type="button"
                            role="option"
                            aria-selected={picked.includes(entry.name)}
                            onMouseEnter={() => setItemActive(index)}
                            onClick={() => chooseItem(entry.name)}
                            className={`smooth flex w-full items-center gap-2 px-3 py-1.5 text-left ${
                              index === itemActive ? 'bg-util text-brand' : 'hover:bg-util'
                            }`}
                          >
                            <ItemTile name={entry.display} icon={entry.icon} size={24} />
                            <span className="min-w-0 flex-1 truncate text-xs text-fog">{entry.display}</span>
                            {picked.includes(entry.name) ? (
                              <span aria-hidden="true" className="text-brand">
                                ✓
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ))
                ) : (
                  <p className="px-3 py-3 text-xs text-mist">{t.itemSearchEmpty}</p>
                )}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{t.costLabel}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {COSTS.map((cost) => (
                <button
                  key={cost}
                  type="button"
                  aria-pressed={costs.includes(cost)}
                  onClick={() => setCosts((prev) => (prev.includes(cost) ? prev.filter((value) => value !== cost) : [...prev, cost]))}
                  className={`smooth h-9 w-9 rounded-full border text-xs font-semibold ${
                    costs.includes(cost) ? 'border-brand bg-brand text-on-brand' : 'border-line bg-page text-mist hover:border-brand'
                  }`}
                >
                  {cost}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{t.sortLabel}</span>
            <div className="flex items-center gap-1.5">
              <button type="button" aria-pressed={sort === 'cost'} onClick={() => setSort('cost')} className={pill(sort === 'cost')}>
                {t.sortCost}
              </button>
              <button type="button" aria-pressed={sort === 'gain'} onClick={() => setSort('gain')} className={pill(sort === 'gain')}>
                {t.sortGain}
              </button>
            </div>
          </div>
          {picked.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{t.matchLabel}</span>
              <div className="flex items-center gap-1.5">
                <button type="button" aria-pressed={logic === 'all'} onClick={() => setLogic('all')} className={pill(logic === 'all')}>
                  {t.matchAll}
                </button>
                <button type="button" aria-pressed={logic === 'any'} onClick={() => setLogic('any')} className={pill(logic === 'any')}>
                  {t.matchAny}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {picked.length ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-line/70 pt-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{t.selected}</span>
            {picked.map((name) => {
              const item = itemIndex.get(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(name)}
                  className="smooth inline-flex items-center gap-1.5 rounded-full border border-brand/60 bg-brand/10 py-0.5 pl-0.5 pr-2 text-xs text-fog"
                >
                  {item?.icon ? <img src={item.icon} alt="" loading="lazy" className="h-6 w-6 rounded" /> : null}
                  {item?.display ?? name}
                  <span aria-hidden="true" className="text-mist">
                    ×
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPicked([])}
              className="text-xs font-semibold text-mist underline decoration-dotted underline-offset-2 hover:text-fog"
            >
              {t.clear}
            </button>
          </div>
        ) : null}

        <p className="text-xs text-mist">{t.result(visible.length, rows.length)}</p>
      </div>

      <section data-section="item-priority" className="flex flex-col gap-3">
        {visible.map((row) => (
          <UnitCard
            key={row.name}
            row={row}
            lang={lang}
            t={t}
            number={number}
            picked={picked}
            expanded={expanded.includes(row.name)}
            onToggleItem={toggle}
            onToggleRow={() => toggleRow(row.name)}
          />
        ))}
        {visible.length === 0 ? (
          <p className="rounded-xl border border-line bg-panel p-8 text-center text-sm text-mist">{t.noMatch}</p>
        ) : null}
      </section>
    </div>
  );
}

function UnitCard({
  row,
  lang,
  t,
  number,
  picked,
  expanded,
  onToggleItem,
  onToggleRow,
}: {
  row: UnitPriorityRow;
  lang: Lang;
  t: (typeof messages)['en']['itemPriority'];
  number: Intl.NumberFormat;
  picked: string[];
  expanded: boolean;
  onToggleItem: (name: string) => void;
  onToggleRow: () => void;
}) {
  const featured = row.items.filter((item) => item.bucket === 'core' || item.bucket === 'strong');
  const showcase = featured.length ? featured : row.items.slice(0, 4);
  const core = showcase.filter((item) => item.bucket === 'core');
  const rest = showcase.filter((item) => item.bucket !== 'core');

  // A picked side item is pinned to the rail even when it ranks below the
  // cut-off, so the reason a row matched the filter is always visible.
  const sideShown = <T extends { name: string; avg: number; count: number }>(entries: T[], limit: number): T[] => {
    const top = entries.slice(0, limit);
    const pinned = entries.filter((entry) => picked.includes(entry.name) && !top.some((item) => item.name === entry.name));
    return pinned.length ? [...top, ...pinned].sort((a, b) => a.avg - b.avg || b.count - a.count) : top;
  };

  return (
    <article className="rounded-xl border border-line bg-panel">
      <div className="grid gap-4 p-4 lg:grid-cols-[200px_minmax(0,1fr)_260px]">
        <div className="flex items-center gap-3">
          <UnitHex name={row.display} cost={row.cost} icon={row.icon} size={44} />
          <div className="min-w-0">
            <p className="truncate font-display text-base font-semibold text-fog">{row.display}</p>
            <div className="mt-1 flex items-center gap-2">
              <CostDots cost={row.cost} />
              <span className="text-[11px] text-mist">{t.games(number.format(row.games))}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {showcase.length ? (
            [
              { key: 'core' as const, items: core },
              { key: 'strong' as const, items: rest },
            ]
              .filter((group) => group.items.length)
              .map((group) => (
                <div key={group.key}>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${
                      group.key === 'core' ? 'text-brand' : 'text-mist'
                    }`}
                  >
                    {t[group.key]}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {group.items.map((item) => (
                      <ItemButton key={item.name} item={item} active={picked.includes(item.name)} onToggle={onToggleItem} />
                    ))}
                  </div>
                </div>
              ))
          ) : (
            <p className="text-xs text-mist">{t.noItems}</p>
          )}
        </div>

        <div className="flex flex-col gap-3 lg:border-l lg:border-line/70 lg:pl-4">
          {row.emblems.length ? (
            <SideTiles label={t.emblems} entries={sideShown(row.emblems, PRIORITY.maxEmblems)} picked={picked} onToggle={onToggleItem} />
          ) : null}
          {row.artifacts.length ? (
            <SideTiles label={t.artifacts} entries={sideShown(row.artifacts, PRIORITY.maxArtifacts)} picked={picked} onToggle={onToggleItem} />
          ) : null}
          {row.comps.length ? (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{t.comps}</span>
              <ul className="mt-1 flex flex-col gap-1">
                {row.comps.slice(0, 3).map((comp) => (
                  <li key={comp.slug}>
                    <Link
                      href={`/${lang}/tierlist/comps/${comp.slug}`}
                      className="smooth flex items-center gap-2 rounded-lg border border-line/70 bg-util/30 px-1.5 py-1 hover:border-brand"
                    >
                      <span className="font-display text-[10px] font-bold" style={{ color: tierColor[comp.tier] }}>
                        {comp.tier}
                      </span>
                      <span className="truncate text-[11px] text-mist">{comp.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {!row.emblems.length && !row.artifacts.length && !row.comps.length ? <p className="text-xs text-mist">—</p> : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line/70 px-4 py-2.5">
        <button
          type="button"
          onClick={onToggleRow}
          aria-expanded={expanded}
          className="smooth inline-flex items-center gap-1.5 text-xs font-semibold text-mist hover:text-fog"
        >
          <span aria-hidden="true">{expanded ? '−' : '+'}</span>
          {expanded ? t.collapse : t.items(row.items.length)}
        </button>
        {row.items.length ? (
          <span className="text-[11px] text-mist">
            {t.gainShort} <span className="font-display text-fog">{gainLabel(row.topGain)}</span>
          </span>
        ) : null}
      </div>

      {expanded ? (
        <div className="border-t border-line/70 bg-page/40 p-4">
          <div className="grid gap-5 md:grid-cols-2">
            {BUCKETS.map((bucket) => {
              const items = row.items.filter((item) => item.bucket === bucket);
              if (!items.length) return null;
              return (
                <section key={bucket}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${bucket === 'core' ? 'text-brand' : 'text-mist'}`}>
                      {t[bucket]} <span className="text-mist/70">{items.length}</span>
                    </h3>
                    <span className="text-[10px] text-mist/70">
                      {t.gainShort} · {t.carry} · {t.avg}
                    </span>
                  </div>
                  <ul className="mt-2 flex flex-col gap-0.5">
                    {items.map((item) => (
                      <li key={item.name}>
                        <button
                          type="button"
                          onClick={() => onToggleItem(item.name)}
                          aria-pressed={picked.includes(item.name)}
                          className="smooth flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-util/60"
                        >
                          <ItemTile name={item.display} icon={item.icon} size={24} />
                          <span className="min-w-0 flex-1 truncate text-xs text-fog">{item.display}</span>
                          <span className="w-11 text-right font-display text-xs text-fog">{gainLabel(item.gain)}</span>
                          <span className="w-11 text-right text-[11px] text-mist">{Math.round(item.share * 100)}%</span>
                          <span className="w-10 text-right text-[11px] text-mist">{item.avg.toFixed(2)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : null}
    </article>
  );
}
