'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { tierColor } from '@/components/ui';
import { BoardEditor, type BoardUnit, type ChampionOption, type ItemOption } from './board-editor';

const inputCls =
  'smooth w-full rounded-lg border border-line bg-page px-3 py-2 text-sm text-fog placeholder:text-mist focus:border-brand-soft focus:outline-none';

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

type PickOption = { name: string; icon?: string | null };

// Search-and-click pick list: type to filter, click (or Enter) to add, ✕ to remove.
function EntityList({
  label,
  options,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  options: PickOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = new Set(values);
  const needle = query.trim().toLowerCase();
  const matches = options.filter((option) => option.name.toLowerCase().includes(needle) && !selected.has(option.name)).slice(0, 60);

  const add = (name: string) => {
    onChange([...values, name]);
    setQuery('');
  };
  const remove = (name: string) => onChange(values.filter((value) => value !== name));

  return (
    <div className="flex flex-col gap-2">
      <label className="relative flex flex-col gap-1 text-sm font-semibold text-mist">
        {label}
        <input
          className={inputCls}
          value={query}
          placeholder={placeholder}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && matches.length) {
              event.preventDefault();
              add(matches[0].name);
            }
          }}
        />
        {open ? (
          <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-52 overflow-y-auto rounded-lg border border-line bg-panel shadow-lg">
            {matches.length ? (
              matches.map((option) => (
                <button
                  key={option.name}
                  type="button"
                  data-pick={option.name}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    add(option.name);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm font-medium text-fog hover:bg-util"
                >
                  {option.icon ? <img src={option.icon} alt="" className="h-5 w-5 rounded" /> : null}
                  {option.name}
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-xs font-medium text-mist">No match for “{query}”.</p>
            )}
          </div>
        ) : null}
      </label>
      {values.length ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => {
            const option = options.find((entry) => entry.name === value);
            return (
              <span key={value} className="flex items-center gap-1.5 rounded-full border border-line bg-page py-0.5 pr-1.5 pl-1 text-xs font-semibold text-fog">
                {option?.icon ? <img src={option.icon} alt="" className="h-4 w-4 rounded" /> : null}
                {value}
                <button type="button" onClick={() => remove(value)} aria-label={`Remove ${value}`} className="smooth text-mist hover:text-tier-s">
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

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
  matchups: { slug: string; kind: 'good' | 'bad' }[];
  playstyleVi?: string;
  tipsVi?: string;
  stagesVi?: string[];
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
  const [compOptions, setCompOptions] = useState<{ slug: string; title: string; tier: string }[]>([]);
  const [matchSlug, setMatchSlug] = useState('');
  const [matchKind, setMatchKind] = useState<'good' | 'bad'>('good');

  useEffect(() => {
    fetch('/api/comps')
      .then((res) => res.json())
      .then((body) => setCompOptions((body.comps ?? []).map((entry: { slug: string; title: string; tier: string }) => ({ slug: entry.slug, title: entry.title, tier: entry.tier }))))
      .catch(() => {});
  }, []);
  // tft.json lists rarity/set variants with the same display name — dedupe.
  const augmentOptions = [...new Set(augmentNames)].map((name) => ({ name }));
  const [form, setForm] = useState({
    title: comp?.title ?? '',
    slug: comp?.slug ?? '',
    tier: comp?.tier ?? 'B',
    style: comp?.style ?? 'Tempo',
    difficulty: String(comp?.difficulty ?? 2),
    trend: comp?.trend ?? '',
    playstyle: comp?.playstyle ?? '',
    units: layoutBoard(comp?.units ?? []),
    early: comp?.early ?? [],
    carry: comp?.carry ?? '',
    items: comp?.items ?? [],
    augments: comp?.augments ?? [],
    alt: comp?.alt ?? [],
    matchups: comp?.matchups ?? [],
    tips: comp?.tips ?? '',
    stage2: comp?.stages?.[0]?.text ?? '',
    stage3: comp?.stages?.[1]?.text ?? '',
    stage4: comp?.stages?.[2]?.text ?? '',
    playstyleVi: comp?.playstyleVi ?? '',
    tipsVi: comp?.tipsVi ?? '',
    stage2Vi: comp?.stagesVi?.[0] ?? '',
    stage3Vi: comp?.stagesVi?.[1] ?? '',
    stage4Vi: comp?.stagesVi?.[2] ?? '',
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
      early: form.early,
      carry: form.carry,
      items: form.items,
      augments: form.augments,
      alt: form.alt,
      matchups: form.matchups,
      tips: form.tips,
      stages: [
        { text: form.stage2, textVi: form.stage2Vi },
        { text: form.stage3, textVi: form.stage3Vi },
        { text: form.stage4, textVi: form.stage4Vi },
      ],
      playstyleVi: form.playstyleVi || null,
      tipsVi: form.tipsVi || null,
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
    router.push('/admin/comps');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
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
        <EntityList
          label="Early units (at least one)"
          options={champions}
          values={form.early}
          onChange={(values) => setForm((current) => ({ ...current, early: values }))}
          placeholder="Type to search champions…"
        />
        <div className="flex flex-col gap-4">
          <Field label="Carry (must be one of the board units)">
            <select className={inputCls} value={form.carry} onChange={set('carry')} required>
              <option value="">— pick a unit placed on the board —</option>
              {form.units.map((unit) => (
                <option key={unit.name} value={unit.name}>
                  {unit.name}
                </option>
              ))}
            </select>
          </Field>
          <EntityList
            label="Alt builds (flex carries)"
            options={champions}
            values={form.alt}
            onChange={(values) => setForm((current) => ({ ...current, alt: values }))}
            placeholder="Type to search champions…"
          />
        </div>
        <EntityList
          label="Item priority (at least one)"
          options={items}
          values={form.items}
          onChange={(values) => setForm((current) => ({ ...current, items: values }))}
          placeholder="Type to search items…"
        />
        <EntityList
          label="Augments (at least one)"
          options={augmentOptions}
          values={form.augments}
          onChange={(values) => setForm((current) => ({ ...current, augments: values }))}
          placeholder="Type to search augments…"
        />
      </div>

      <div className="grid gap-4 rounded-xl border border-line bg-panel p-5">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-mist">Matchups (optional)</p>
          <p className="text-xs text-mist">Strong = this comp beats them, weak = they beat this comp. Up to 6; shown on the public comp panel.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Comp">
            <select className={inputCls} value={matchSlug} onChange={(event) => setMatchSlug(event.target.value)}>
              <option value="">— pick a comp —</option>
              {compOptions
                .filter((option) => option.slug !== form.slug && !form.matchups.some((entry) => entry.slug === option.slug))
                .map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.title} ({option.tier})
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Kind">
            <select className={inputCls} value={matchKind} onChange={(event) => setMatchKind(event.target.value as 'good' | 'bad')}>
              <option value="good">Strong against ▲</option>
              <option value="bad">Weak against ▼</option>
            </select>
          </Field>
          <button
            type="button"
            onClick={() => {
              if (!matchSlug) return;
              setForm((current) => ({
                ...current,
                matchups: [...current.matchups.filter((entry) => entry.slug !== matchSlug), { slug: matchSlug, kind: matchKind }].slice(0, 6),
              }));
              setMatchSlug('');
            }}
            className="smooth h-9 rounded-lg border border-line bg-page px-4 text-sm font-semibold text-fog hover:border-brand-soft"
          >
            Add
          </button>
        </div>
        {form.matchups.length ? (
          <div className="flex flex-wrap gap-1.5">
            {form.matchups.map((entry) => {
              const option = compOptions.find((candidate) => candidate.slug === entry.slug);
              return (
                <span
                  key={entry.slug}
                  className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold text-fog"
                  style={{ borderColor: entry.kind === 'good' ? tierColor.C : tierColor.S }}
                >
                  {entry.kind === 'good' ? '▲' : '▼'} {option?.title ?? entry.slug}
                  <button
                    type="button"
                    aria-label={`Remove ${entry.slug}`}
                    onClick={() => setForm((current) => ({ ...current, matchups: current.matchups.filter((candidate) => candidate.slug !== entry.slug) }))}
                    className="smooth text-mist hover:text-tier-s"
                  >
                    ✕
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 rounded-xl border border-line bg-panel p-5">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-mist">Plan (optional)</p>
          <p className="text-xs text-mist">Tips and stage texts are optional — leave a stage empty to omit it (stage numbering stays 2/3/4).</p>
        </div>
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

      <div className="grid gap-4 rounded-xl border border-line bg-panel p-5">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-mist">Vietnamese (optional)</p>
          <p className="text-xs text-mist">Shown on /vi pages. Leave a field empty to fall back to the English text. Seeded translations survive admin saves unless you change them here.</p>
        </div>
        <Field label="Playstyle (vi)">
          <input className={inputCls} value={form.playstyleVi} onChange={set('playstyleVi')} />
        </Field>
        <Field label="Tips (vi)">
          <textarea className={`${inputCls} min-h-20`} value={form.tipsVi} onChange={set('tipsVi')} />
        </Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Stage 2 (vi)">
            <textarea className={`${inputCls} min-h-24`} value={form.stage2Vi} onChange={set('stage2Vi')} />
          </Field>
          <Field label="Stage 3 (vi)">
            <textarea className={`${inputCls} min-h-24`} value={form.stage3Vi} onChange={set('stage3Vi')} />
          </Field>
          <Field label="Stage 4 (vi)">
            <textarea className={`${inputCls} min-h-24`} value={form.stage4Vi} onChange={set('stage4Vi')} />
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
          onClick={() => router.push('/admin/comps')}
          className="smooth rounded-full border border-line bg-panel px-5 py-2 text-sm font-semibold text-mist hover:border-brand-soft hover:text-fog"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
