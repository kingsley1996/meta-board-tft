'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BoardEditor, type BoardUnit, type ChampionOption, type ItemOption } from './board-editor';

const inputCls =
  'smooth w-full rounded-lg border border-line bg-page px-3 py-2 text-sm text-fog placeholder:text-mist focus:border-brand-soft focus:outline-none';

const lines = (value: string) => value.split(/[\n,]+/).map((part) => part.trim()).filter(Boolean);
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

type IncomingUnit = {
  name: string;
  row: number | null;
  col: number | null;
  stars?: number | null;
  items?: string[];
};

export type CompFormComp = {
  slug: string;
  title: string;
  tier: string;
  style: string;
  difficulty: number;
  trend: 'up' | 'down' | null;
  playstyle: string;
  units: IncomingUnit[];
  early: string[];
  carry: string;
  items: string[];
  augments: string[];
  tips: string;
  stages: { stage: string; text: string }[];
  alt: string[];
};

// Units without coordinates (older comps) fill the board front rows left to right.
function layoutBoard(incoming: IncomingUnit[]): BoardUnit[] {
  const placed: BoardUnit[] = [];
  const unplaced: IncomingUnit[] = [];
  for (const unit of incoming) {
    if (unit.row !== null && unit.col !== null) {
      placed.push({ name: unit.name, row: unit.row, col: unit.col, stars: unit.stars ?? null, items: unit.items ?? [] });
    } else {
      unplaced.push(unit);
    }
  }
  const taken = new Set(placed.map((unit) => `${unit.row}:${unit.col}`));
  for (const unit of unplaced) {
    let spot: [number, number] | null = null;
    for (let row = 0; row < 4 && !spot; row++) {
      for (let col = 0; col < 7 && !spot; col++) {
        if (!taken.has(`${row}:${col}`)) spot = [row, col];
      }
    }
    if (!spot) continue;
    taken.add(`${spot[0]}:${spot[1]}`);
    placed.push({ name: unit.name, row: spot[0], col: spot[1], stars: unit.stars ?? null, items: unit.items ?? [] });
  }
  return placed.sort((a, b) => a.row - b.row || a.col - b.col);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold text-mist">
      {label}
      {children}
    </label>
  );
}

export function CompForm({
  comp,
  champions,
  items,
  augmentNames,
}: {
  comp?: CompFormComp;
  champions: ChampionOption[];
  items: ItemOption[];
  augmentNames: string[];
}) {
  const router = useRouter();
  const [slugTouched, setSlugTouched] = useState(Boolean(comp));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const championNames = champions.map((champion) => champion.name);
  const itemNames = items.map((item) => item.name);
  const [form, setForm] = useState({
    title: comp?.title ?? '',
    slug: comp?.slug ?? '',
    tier: comp?.tier ?? 'B',
    style: comp?.style ?? 'Tempo',
    difficulty: String(comp?.difficulty ?? 2),
    trend: comp?.trend ?? '',
    playstyle: comp?.playstyle ?? '',
    units: layoutBoard(comp?.units ?? []),
    early: (comp?.early ?? []).join('\n'),
    carry: comp?.carry ?? '',
    items: (comp?.items ?? []).join('\n'),
    augments: (comp?.augments ?? []).join('\n'),
    alt: (comp?.alt ?? []).join(', '),
    tips: comp?.tips ?? '',
    stage2: comp?.stages?.[0]?.text ?? '',
    stage3: comp?.stages?.[1]?.text ?? '',
    stage4: comp?.stages?.[2]?.text ?? '',
  });

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = event.target.value;
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'title' && !slugTouched ? { slug: slugify(value) } : null),
    }));
  };

  const setBoard = (units: BoardUnit[]) => {
    setForm((current) => ({
      ...current,
      units,
      carry: units.some((unit) => unit.name === current.carry) ? current.carry : '',
    }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const payload = {
      title: form.title,
      slug: form.slug,
      tier: form.tier,
      style: form.style,
      difficulty: Number(form.difficulty),
      trend: form.trend || null,
      playstyle: form.playstyle,
      units: form.units.map((unit) => ({
        name: unit.name,
        row: unit.row,
        col: unit.col,
        stars: unit.stars,
        items: unit.items,
      })),
      early: lines(form.early),
      carry: form.carry,
      items: lines(form.items),
      augments: lines(form.augments),
      alt: lines(form.alt),
      tips: form.tips,
      stages: [form.stage2, form.stage3, form.stage4],
    };
    const res = await fetch(comp ? `/api/admin/comps/${comp.slug}` : '/api/admin/comps', {
      method: comp ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? `Save failed (${res.status})`);
      return;
    }
    router.push('/admin');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <datalist id="champion-names">
        {championNames.map((name) => <option key={name} value={name} />)}
      </datalist>
      <datalist id="item-names">
        {itemNames.map((name) => <option key={name} value={name} />)}
      </datalist>
      <datalist id="augment-names">
        {augmentNames.map((name) => <option key={name} value={name} />)}
      </datalist>

      <div className="grid gap-4 rounded-xl border border-line bg-panel p-5 md:grid-cols-2">
        <Field label="Title">
          <input className={inputCls} value={form.title} onChange={set('title')} required />
        </Field>
        <Field label="Slug (URL)">
          <input
            className={inputCls}
            value={form.slug}
            onChange={(event) => {
              setSlugTouched(true);
              set('slug')(event);
            }}
            required
          />
        </Field>
        <Field label="Tier">
          <select className={inputCls} value={form.tier} onChange={set('tier')}>
            {['S', 'A', 'B', 'C', 'X'].map((tier) => <option key={tier}>{tier}</option>)}
          </select>
        </Field>
        <Field label="Style">
          <select className={inputCls} value={form.style} onChange={set('style')}>
            {['Reroll', 'Fast 8', 'Flex', 'Tempo'].map((style) => <option key={style}>{style}</option>)}
          </select>
        </Field>
        <Field label="Difficulty (1-3)">
          <select className={inputCls} value={form.difficulty} onChange={set('difficulty')}>
            {['1', '2', '3'].map((value) => <option key={value}>{value}</option>)}
          </select>
        </Field>
        <Field label="Trend">
          <select className={inputCls} value={form.trend} onChange={set('trend')}>
            <option value="">—</option>
            <option value="up">Trending up ▲</option>
            <option value="down">Trending down ▼</option>
          </select>
        </Field>
        <Field label="Playstyle (one line)">
          <input className={inputCls} value={form.playstyle} onChange={set('playstyle')} placeholder="Fast 8 Ability Power cap" required />
        </Field>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-5">
        <p className="text-sm font-semibold text-mist">Board</p>
        <BoardEditor
          units={form.units}
          champions={champions}
          items={items}
          carry={form.carry}
          onChange={setBoard}
          onCarry={(name) => setForm((current) => ({ ...current, carry: name }))}
        />
      </div>

      <div className="grid gap-4 rounded-xl border border-line bg-panel p-5 md:grid-cols-2">
        <Field label="Early units">
          <textarea className={`${inputCls} min-h-24`} value={form.early} onChange={set('early')} />
        </Field>
        <Field label="Carry (must be one of the board units)">
          <input className={inputCls} list="champion-names" value={form.carry} onChange={set('carry')} required />
        </Field>
        <Field label="Alt builds (flex carries)">
          <input className={inputCls} list="champion-names" value={form.alt} onChange={set('alt')} />
        </Field>
        <Field label="Item priority (one per line)">
          <textarea className={`${inputCls} min-h-24`} value={form.items} onChange={set('items')} />
        </Field>
        <Field label="Augments (one per line)">
          <textarea className={`${inputCls} min-h-24`} value={form.augments} onChange={set('augments')} />
        </Field>
      </div>

      <div className="grid gap-4 rounded-xl border border-line bg-panel p-5">
        <Field label="Tips">
          <textarea className={`${inputCls} min-h-20`} value={form.tips} onChange={set('tips')} />
        </Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Stage 2">
            <textarea className={`${inputCls} min-h-24`} value={form.stage2} onChange={set('stage2')} />
          </Field>
          <Field label="Stage 3">
            <textarea className={`${inputCls} min-h-24`} value={form.stage3} onChange={set('stage3')} />
          </Field>
          <Field label="Stage 4">
            <textarea className={`${inputCls} min-h-24`} value={form.stage4} onChange={set('stage4')} />
          </Field>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-tier-s/50 bg-panel px-4 py-3 text-sm text-tier-s">{error}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="smooth rounded-full border border-brand-hot bg-brand-hot px-6 py-2 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
        >
          {busy ? 'Saving…' : comp ? 'Save changes' : 'Create comp'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin')}
          className="smooth rounded-full border border-line bg-panel px-5 py-2 text-sm font-semibold text-mist hover:border-brand-soft hover:text-fog"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
