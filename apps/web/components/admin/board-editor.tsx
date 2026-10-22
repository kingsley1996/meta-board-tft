'use client';

import { useState } from 'react';
import type { Tier } from '@/lib/tiers';
import { HexBoard } from '@/components/hex-board';
import { ItemHex, MiniItem, UnitHex } from '@/components/ui';

export type BoardUnit = {
  name: string;
  row: number;
  col: number;
  stars: number | null;
  items: string[];
};
export type ChampionOption = { name: string; cost: number; icon: string | null; traits?: string[] };
export type ItemOption = { name: string; icon: string | null; tier: Tier | null };

const MAX_ITEMS = 3;

const cellKey = (row: number, col: number) => `${row}:${col}`;
const sortBoard = (units: BoardUnit[]) => [...units].sort((a, b) => a.row - b.row || a.col - b.col);

function ItemSlots({
  unit,
  items,
  activeSlot,
  onPickSlot,
  onClearSlot,
}: {
  unit: BoardUnit;
  items: ItemOption[];
  activeSlot: number;
  onPickSlot: (slot: number) => void;
  onClearSlot: (slot: number) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: MAX_ITEMS }, (_, slot) => {
        const name = unit.items[slot];
        const option = name ? items.find((item) => item.name === name) : null;
        return name ? (
          <button key={slot} type="button" onClick={() => onClearSlot(slot)} title={`${name} — click to remove`} className={`rounded p-0.5 ${activeSlot === slot ? 'ring-2 ring-brand-soft' : 'hover:bg-util'}`}>
            <MiniItem icon={option?.icon} name={name} tier={option?.tier} size={30} />
          </button>
        ) : (
          <button
            key={slot}
            type="button"
            onClick={() => onPickSlot(slot)}
            title={`Empty slot ${slot + 1} — pick an item below`}
            className={`rounded p-0.5 ${activeSlot === slot ? 'bg-util ring-2 ring-brand-soft' : 'hover:bg-util'}`}
          >
            <MiniItem size={30} dashed />
          </button>
        );
      })}
    </div>
  );
}

export function BoardEditor({
  units,
  champions,
  items,
  carry,
  onChange,
  onCarry,
}: {
  units: BoardUnit[];
  champions: ChampionOption[];
  items: ItemOption[];
  carry: string;
  onChange: (units: BoardUnit[]) => void;
  onCarry: (name: string) => void;
}) {
  const [pending, setPending] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [championSearch, setChampionSearch] = useState('');
  const [championTrait, setChampionTrait] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [activeSlot, setActiveSlot] = useState(0);

  const byCell = new Map(units.map((unit) => [cellKey(unit.row, unit.col), unit]));
  const placed = new Set(units.map((unit) => unit.name));
  const selected = units.find((unit) => unit.name === selectedName) ?? null;

  const place = (name: string, row: number, col: number) => {
    const next = units.filter((unit) => unit.name !== name && cellKey(unit.row, unit.col) !== cellKey(row, col));
    onChange(sortBoard([...next, { name, row, col, stars: null, items: [] }]));
    setPending('');
  };

  const remove = (unit: BoardUnit) => {
    if (unit.name === carry) onCarry('');
    if (unit.name === selectedName) setSelectedName('');
    onChange(units.filter((candidate) => candidate !== unit));
  };

  const move = (from: BoardUnit, row: number, col: number) => {
    const target = byCell.get(cellKey(row, col));
    let next = units.filter((unit) => unit !== from && unit !== target);
    if (target) next = [...next, { ...target, row: from.row, col: from.col }];
    next = [...next, { ...from, row, col }];
    onChange(sortBoard(next));
  };

  const updateSelected = (patch: Partial<BoardUnit>) => {
    if (!selected) return;
    onChange(sortBoard(units.map((unit) => (unit === selected ? { ...unit, ...patch } : unit))));
  };

  const assignItem = (name: string) => {
    if (!selected) return;
    const current = selected.items[activeSlot];
    const next = [...selected.items];
    if (current === name) next[activeSlot] = '';
    else next[activeSlot] = name;
    const cleaned = next.filter(Boolean).slice(0, MAX_ITEMS);
    updateSelected({ items: cleaned });
    const firstFree = cleaned.length < MAX_ITEMS ? cleaned.length : 0;
    setActiveSlot(firstFree);
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

  const traitOptions = [...new Set(champions.flatMap((champion) => champion.traits ?? []))].sort();
  const visibleChampions = champions.filter(
    (champion) =>
      champion.name.toLowerCase().includes(championSearch.trim().toLowerCase()) &&
      (!championTrait || champion.traits?.includes(championTrait))
  );
  const visibleItems = items.filter((item) => item.name.toLowerCase().includes(itemSearch.trim().toLowerCase()));

  return (
    <div className="grid gap-4 xl:grid-cols-[240px_1fr_250px]">
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
        <input
          className="smooth w-full rounded-lg border border-line bg-page px-3 py-2 text-sm text-fog placeholder:text-mist focus:border-brand-soft focus:outline-none"
          placeholder="Search champions…"
          value={championSearch}
          onChange={(event) => setChampionSearch(event.target.value)}
        />
        <select
          aria-label="Filter by trait"
          className="smooth w-full rounded-lg border border-line bg-page px-2 py-1.5 text-xs font-semibold text-fog focus:border-brand-soft focus:outline-none"
          value={championTrait}
          onChange={(event) => setChampionTrait(event.target.value)}
        >
          <option value="">All traits</option>
          {traitOptions.map((trait) => (
            <option key={trait} value={trait}>
              {trait}
            </option>
          ))}
        </select>
        <div className="grid max-h-[380px] grid-cols-5 gap-1.5 overflow-y-auto pr-1">
          {!visibleChampions.length ? <p className="col-span-5 text-xs text-mist">No champion matches the filter.</p> : null}
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
                title={onBoard ? `${champion.name} (on board)` : champion.name}
                className={`rounded-lg p-0.5 transition ${isPending ? 'bg-brand-hot/40 ring-2 ring-brand-soft' : 'hover:bg-util'} ${onBoard ? 'cursor-not-allowed opacity-25' : ''}`}
                disabled={onBoard}
              >
                <UnitHex name={champion.name} cost={champion.cost} icon={champion.icon} size={36} />
              </button>
            );
          })}
        </div>
        <p className="text-xs leading-relaxed text-mist">
          Pick a champion, then click an empty hex. Drag to move or swap.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-mist">Enemy side · {units.length}/12 units</p>
          <button
            type="button"
            onClick={() => {
              onChange([]);
              onCarry('');
              setSelectedName('');
            }}
            className="smooth rounded-full border border-line bg-page px-3 py-1 text-xs font-semibold text-mist hover:border-brand-soft hover:text-fog"
          >
            Clear board
          </button>
        </div>
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
                    title={unit.name}
                    aria-label={unit.name}
                    className="hex absolute inset-[2px] cursor-grab"
                  />
                  <span className="pointer-events-none absolute inset-[2px] block">
                    <UnitHex name={unit.name} cost={champion.cost} icon={champion.icon} fill stars={unit.stars ?? undefined} />
                    {unit.items.length ? (
                      <span className="absolute -bottom-0.5 left-1/2 z-20 flex -translate-x-1/2 gap-[2px]">
                        {unit.items.slice(0, MAX_ITEMS).map((name, index) => {
                          const option = items.find((item) => item.name === name);
                          return <ItemHex key={`${name}-${index}`} icon={option?.icon} name={name} tier={option?.tier} tip={`item:${name}`} size={16} />;
                        })}
                      </span>
                    ) : null}
                  </span>
                  {isSelected ? <span className="hex pointer-events-none absolute inset-0 z-10 border-2 border-brand-hot" /> : null}
                  {unit.name === carry ? (
                    <span className="pointer-events-none absolute -top-2 right-0 z-10 rounded-full border border-line bg-util px-1 text-[10px] font-bold text-brand-soft">
                      ★
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
                className={`hex absolute inset-[2px] transition ${pending ? 'hover:bg-brand-hot/25' : ''}`}
                aria-label={`Place at row ${row + 1} column ${col + 1}`}
              />
            );
          }}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
        {selected ? (
          <>
            <div>
              <p className="font-display text-lg font-bold text-fog">{selected.name}</p>
              <p className="text-xs text-mist">row {selected.row + 1}, col {selected.col + 1}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-mist">Stars</span>
              {[
                { label: '—', value: null },
                { label: '★★', value: 2 },
                { label: '★★★', value: 3 },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => updateSelected({ stars: option.value })}
                  className={`smooth rounded-full border px-2 py-0.5 text-xs font-semibold ${selected.stars === option.value ? 'border-brand-hot text-tier-b' : 'border-line text-mist hover:border-brand-soft'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-mist">Items</span>
              <ItemSlots
                unit={selected}
                items={items}
                activeSlot={activeSlot}
                onPickSlot={setActiveSlot}
                onClearSlot={(slot) => {
                  updateSelected({ items: selected.items.filter((_, index) => index !== slot) });
                  setActiveSlot(Math.min(slot, MAX_ITEMS - 1));
                }}
              />
              <input
                className="smooth w-full rounded-lg border border-line bg-page px-2.5 py-1.5 text-xs text-fog placeholder:text-mist focus:border-brand-soft focus:outline-none"
                placeholder="Filter items…"
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
              />
              <div className="grid max-h-40 grid-cols-6 gap-1 overflow-y-auto pr-1">
                {visibleItems.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => assignItem(item.name)}
                    title={item.name}
                    className={`rounded p-0.5 hover:bg-util ${selected.items[activeSlot] === item.name ? 'bg-brand-hot/30 ring-2 ring-brand-soft' : ''}`}
                  >
                    <MiniItem icon={item.icon} name={item.name} tier={item.tier} size={24} />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onCarry(selected.name)}
                disabled={carry === selected.name}
                className="smooth rounded-full border border-line bg-page px-3 py-1 text-xs font-semibold text-fog hover:border-brand-soft disabled:opacity-50"
              >
                {carry === selected.name ? 'Carry ★' : 'Make carry'}
              </button>
              <button
                type="button"
                onClick={() => remove(selected)}
                className="smooth rounded-full border border-tier-s/50 bg-page px-3 py-1 text-xs font-semibold text-tier-s hover:border-tier-s"
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <p className="text-xs leading-relaxed text-mist">
            Click a champion on the board to set stars, attach items, mark the carry or remove it.
          </p>
        )}
      </div>
    </div>
  );
}
