'use client';

import { useState } from 'react';
import { HexBoard } from '@/components/hex-board';
import { ItemHex, MiniItem, UnitHex } from '@/components/ui';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import type { Tier } from '@/lib/tiers';
import { itemName, unitName } from '@/lib/tips';

export type BuilderChampion = { name: string; cost: number; icon: string | null; traits: string[] };
export type BuilderItem = { name: string; icon: string | null; tier: Tier | null };
type Placed = { name: string; row: number; col: number; stars: number | null; items: string[] };

const MAX_UNITS = 12;
const MAX_ITEMS = 3;
const cellKey = (row: number, col: number) => `${row}:${col}`;
const sortBoard = (units: Placed[]) => [...units].sort((a, b) => a.row - b.row || a.col - b.col);

// Board state travels in ?b= as base64url JSON: { u: [[name,row,col,stars,[items]]], c }.
function encode(units: Placed[], carry: string): string {
  const payload = JSON.stringify({ u: units.map((unit) => [unit.name, unit.row, unit.col, unit.stars, unit.items]), c: carry || undefined });
  return btoa(String.fromCharCode(...new TextEncoder().encode(payload))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decode(value: string | undefined): { units: Placed[]; carry: string } | null {
  if (!value) return null;
  try {
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
    if (!payload || !Array.isArray(payload.u)) return null;
    const units = payload.u
      .filter((entry: unknown) => Array.isArray(entry) && typeof entry[0] === 'string')
      .map((entry: [string, number, number, number | null, string[]]) => ({
        name: entry[0],
        row: Number(entry[1]) || 0,
        col: Number(entry[2]) || 0,
        stars: entry[3] ?? null,
        items: Array.isArray(entry[4]) ? entry[4].filter((item) => typeof item === 'string') : [],
      }))
      .slice(0, MAX_UNITS);
    return { units, carry: typeof payload.c === 'string' ? payload.c : '' };
  } catch {
    return null;
  }
}

export function Builder({ lang, champions, items, initial }: { lang: Lang; champions: BuilderChampion[]; items: BuilderItem[]; initial?: string }) {
  const t = messages[lang].builder;
  const restored = decode(initial);
  const [units, setUnits] = useState<Placed[]>(restored?.units ?? []);
  const [carry, setCarry] = useState(restored?.carry ?? '');
  const [pending, setPending] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [search, setSearch] = useState('');
  const [traitFilter, setTraitFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [activeSlot, setActiveSlot] = useState(0);
  const [copied, setCopied] = useState('');

  const byCell = new Map(units.map((unit) => [cellKey(unit.row, unit.col), unit]));
  const placed = new Set(units.map((unit) => unit.name));
  const selected = units.find((unit) => unit.name === selectedName) ?? null;
  const full = units.length >= MAX_UNITS;

  const flash = (key: string) => {
    setCopied(key);
    setTimeout(() => setCopied(''), 1500);
  };

  const place = (name: string, row: number, col: number) => {
    if (full && !placed.has(name)) return;
    const next = units.filter((unit) => unit.name !== name && cellKey(unit.row, unit.col) !== cellKey(row, col));
    setUnits(sortBoard([...next, { name, row, col, stars: null, items: [] }]));
    setPending('');
  };

  const remove = (unit: Placed) => {
    if (unit.name === carry) setCarry('');
    if (unit.name === selectedName) setSelectedName('');
    setUnits(units.filter((candidate) => candidate !== unit));
  };

  const move = (from: Placed, row: number, col: number) => {
    const target = byCell.get(cellKey(row, col));
    let next = units.filter((unit) => unit !== from && unit !== target);
    if (target) next = [...next, { ...target, row: from.row, col: from.col }];
    next = [...next, { ...from, row, col }];
    setUnits(sortBoard(next));
  };

  const updateSelected = (patch: Partial<Placed>) => {
    if (!selected) return;
    setUnits(sortBoard(units.map((unit) => (unit === selected ? { ...unit, ...patch } : unit))));
  };

  const assignItem = (name: string) => {
    if (!selected) return;
    const next = [...selected.items];
    next[activeSlot] = next[activeSlot] === name ? '' : name;
    const cleaned = next.filter(Boolean).slice(0, MAX_ITEMS);
    updateSelected({ items: cleaned });
    setActiveSlot(cleaned.length < MAX_ITEMS ? cleaned.length : 0);
  };

  const drop = (event: React.DragEvent, row: number, col: number) => {
    event.preventDefault();
    const payload = event.dataTransfer.getData('text/plain');
    if (payload.startsWith('champ:')) place(payload.slice(6), row, col);
    else if (payload.startsWith('cell:')) {
      const [, fromRow, fromCol] = payload.split(':');
      const from = byCell.get(cellKey(Number(fromRow), Number(fromCol)));
      if (from) move(from, row, col);
    }
  };

  const shareUrl = () => `${window.location.origin}/${lang}/builder?b=${encode(units, carry)}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl());
    flash('link');
  };

  const copyText = async () => {
    const lines = sortBoard(units).map((unit) => {
      const stars = unit.stars ? ` ${'★'.repeat(unit.stars)}` : '';
      const gear = unit.items.length ? ` — ${unit.items.map((name) => itemName(name, lang)).join(', ')}` : '';
      return `${unitName(unit.name, lang)}${stars}${unit.name === carry ? ` (${t.carry})` : ''}${gear}`;
    });
    await navigator.clipboard.writeText(lines.join('\n'));
    flash('text');
  };

  const traitOptions = [...new Set(champions.flatMap((champion) => champion.traits))].sort();
  const visibleChampions = champions.filter(
    (champion) =>
      champion.name.toLowerCase().includes(search.trim().toLowerCase()) &&
      (!traitFilter || champion.traits.includes(traitFilter))
  );
  const visibleItems = items.filter((item) => item.name.toLowerCase().includes(itemFilter.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-4">
      <div data-section="builder-head" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight text-fog">{t.board}</h1>
          <span className="text-sm text-mist">{t.units(units.length)}</span>
          {full ? <span className="text-xs font-semibold text-tier-b">{t.full}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={copyLink} className="smooth rounded-full border border-brand bg-brand px-4 py-1.5 text-xs font-semibold text-on-brand hover:bg-brand-deep">
            {copied === 'link' ? t.copied : t.copyLink}
          </button>
          <button type="button" onClick={copyText} disabled={!units.length} className="smooth rounded-full border border-line bg-panel px-4 py-1.5 text-xs font-semibold text-fog hover:border-brand disabled:opacity-50">
            {copied === 'text' ? t.copyTextDone : t.copyText}
          </button>
          <button
            type="button"
            onClick={() => {
              setUnits([]);
              setCarry('');
              setSelectedName('');
            }}
            className="smooth rounded-full border border-line bg-panel px-4 py-1.5 text-xs font-semibold text-mist hover:border-brand hover:text-fog"
          >
            {t.clear}
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[240px_1fr_250px]">
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
          <input
            className="smooth w-full rounded-lg border border-line bg-page px-3 py-2 text-sm text-fog placeholder:text-mist"
            placeholder={t.searchChampions}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label={t.allTraits}
            className="smooth w-full rounded-lg border border-line bg-page px-2 py-1.5 text-xs font-semibold text-fog"
            value={traitFilter}
            onChange={(event) => setTraitFilter(event.target.value)}
          >
            <option value="">{t.allTraits}</option>
            {traitOptions.map((trait) => (
              <option key={trait} value={trait}>{trait}</option>
            ))}
          </select>
          <div className="grid max-h-[380px] grid-cols-5 gap-1.5 overflow-y-auto pr-1">
            {!visibleChampions.length ? <p className="col-span-5 text-xs text-mist">{t.noMatch}</p> : null}
            {visibleChampions.map((champion) => {
              const onBoard = placed.has(champion.name);
              const isPending = pending === champion.name;
              return (
                <button
                  key={champion.name}
                  type="button"
                  draggable={!onBoard}
                  onDragStart={(event) => event.dataTransfer.setData('text/plain', `champ:${champion.name}`)}
                  onClick={() => setPending(isPending ? '' : champion.name)}
                  title={champion.name}
                  className={`rounded-lg p-0.5 transition ${isPending ? 'bg-brand/40 ring-2 ring-brand' : 'hover:bg-util'} ${onBoard ? 'cursor-not-allowed opacity-25' : ''}`}
                  disabled={onBoard}
                >
                  <UnitHex name={champion.name} cost={champion.cost} icon={champion.icon} size={36} />
                </button>
              );
            })}
          </div>
          <p className="text-xs leading-relaxed text-mist">{t.pickHint}</p>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
          {units.length ? null : <p className="text-center text-xs text-mist">{t.empty}</p>}
          <HexBoard
            renderCell={(row, col) => {
              const unit = byCell.get(cellKey(row, col));
              const champion = unit ? champions.find((entry) => entry.name === unit.name) : null;
              if (unit && champion) {
                const isSelected = selectedName === unit.name;
                return (
                  <>
                    <button
                      type="button"
                      draggable
                      onDragStart={(event) => event.dataTransfer.setData('text/plain', `cell:${row}:${col}`)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => drop(event, row, col)}
                      onClick={() => setSelectedName(isSelected ? '' : unit.name)}
                      title={unitName(unit.name, lang)}
                      aria-label={unitName(unit.name, lang)}
                      className="hex absolute inset-[2px] cursor-grab"
                    />
                    <span className="pointer-events-none absolute inset-[2px] block">
                      <UnitHex name={unit.name} cost={champion.cost} icon={champion.icon} fill stars={unit.stars ?? undefined} />
                      {unit.items.length ? (
                        <span className="absolute -bottom-0.5 left-1/2 z-20 flex -translate-x-1/2 gap-[2px]">
                          {unit.items.slice(0, MAX_ITEMS).map((name, index) => {
                            const option = items.find((item) => item.name === name);
                            return <ItemHex key={`${name}-${index}`} icon={option?.icon} name={itemName(name, lang)} tier={option?.tier} tip={`item:${name}`} size={16} />;
                          })}
                        </span>
                      ) : null}
                    </span>
                    {isSelected ? <span className="hex pointer-events-none absolute inset-0 z-10 border-2 border-brand" /> : null}
                    {unit.name === carry ? (
                      <span className="pointer-events-none absolute -top-2 right-0 z-10 rounded-full border border-line bg-util px-1 text-[10px] font-bold text-brand">
                        {'\u2605'}
                      </span>
                    ) : null}
                  </>
                );
              }
              return (
                <button
                  type="button"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => drop(event, row, col)}
                  onClick={() => (pending ? place(pending, row, col) : undefined)}
                  className={`hex absolute inset-[2px] transition ${pending ? 'hover:bg-brand/25' : ''}`}
                  aria-label={`row ${row + 1} col ${col + 1}`}
                />
              );
            }}
          />
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
          {selected ? (
            <>
              <div>
                <p className="font-display text-lg font-bold text-fog">{unitName(selected.name, lang)}</p>
                <p className="text-xs text-mist">row {selected.row + 1}, col {selected.col + 1}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-mist">{t.stars}</span>
                {[
                  { label: '\u2014', value: null },
                  { label: '\u2605\u2605', value: 2 },
                  { label: '\u2605\u2605\u2605', value: 3 },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => updateSelected({ stars: option.value })}
                    className={`smooth rounded-full border px-2 py-0.5 text-xs font-semibold ${selected.stars === option.value ? 'border-brand text-tier-b' : 'border-line text-mist hover:border-brand'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-mist">{t.items}</span>
                <div className="flex gap-1.5">
                  {Array.from({ length: MAX_ITEMS }, (_, slot) => {
                    const name = selected.items[slot];
                    const option = name ? items.find((item) => item.name === name) : null;
                    return name ? (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => {
                          updateSelected({ items: selected.items.filter((_, index) => index !== slot) });
                          setActiveSlot(Math.min(slot, MAX_ITEMS - 1));
                        }}
                        title={itemName(name, lang)}
                        className={`rounded p-0.5 ${activeSlot === slot ? 'ring-2 ring-brand' : 'hover:bg-util'}`}
                      >
                        <MiniItem icon={option?.icon} name={itemName(name, lang)} tier={option?.tier} size={30} />
                      </button>
                    ) : (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setActiveSlot(slot)}
                        className={`rounded p-0.5 ${activeSlot === slot ? 'bg-util ring-2 ring-brand' : 'hover:bg-util'}`}
                      >
                        <MiniItem size={30} dashed />
                      </button>
                    );
                  })}
                </div>
                <input
                  className="smooth w-full rounded-lg border border-line bg-page px-2.5 py-1.5 text-xs text-fog placeholder:text-mist"
                  placeholder={t.filterItems}
                  value={itemFilter}
                  onChange={(event) => setItemFilter(event.target.value)}
                />
                <div className="grid max-h-40 grid-cols-6 gap-1 overflow-y-auto pr-1">
                  {visibleItems.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => assignItem(item.name)}
                      title={itemName(item.name, lang)}
                      className={`rounded p-0.5 hover:bg-util ${selected.items[activeSlot] === item.name ? 'bg-brand/30 ring-2 ring-brand' : ''}`}
                    >
                      <MiniItem icon={item.icon} name={itemName(item.name, lang)} tier={item.tier} size={24} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCarry(selected.name)}
                  disabled={carry === selected.name}
                  className="smooth rounded-full border border-line bg-page px-3 py-1 text-xs font-semibold text-fog hover:border-brand disabled:opacity-50"
                >
                  {carry === selected.name ? `${t.carry} \u2605` : t.makeCarry}
                </button>
                <button
                  type="button"
                  onClick={() => remove(selected)}
                  className="smooth rounded-full border border-tier-s/50 bg-page px-3 py-1 text-xs font-semibold text-tier-s hover:border-tier-s"
                >
                  {t.remove}
                </button>
              </div>
            </>
          ) : (
            <p className="text-xs leading-relaxed text-mist">{t.selectHint}</p>
          )}
        </div>
      </div>
    </div>
  );
}
