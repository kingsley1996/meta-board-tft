'use client';

// Annotates the real comp panel with leader lines to the field rail. The panel is
// passed as children from the server page, so this component never renders comp
// markup itself — it only measures the [data-pv] hooks CompPanel already carries
// and explains where each region's value comes from.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ApiComp } from '@/lib/api';
import { economyForComp } from '@/lib/economy';
import { PROVENANCE_FIELDS, provenanceFieldByKey, type ApiProvenance, type ProvenanceField, type ProvenanceKey } from '@/lib/provenance';
import { Panel } from './ui';

type Box = { left: number; top: number; width: number; height: number };

const KIND_LABEL: Record<ProvenanceField['kind'], string> = {
  db: 'DB',
  file: 'file',
  derived: 'tính khi đọc',
  mixed: 'DB + file',
};

// The section keys the seed script diffs, seen from the panel region that shows
// them, so the drawer can quote DB vs snapshot for the field under inspection.
const FIELD_SECTIONS: Record<ProvenanceKey, string[]> = {
  carry: ['copy'],
  cover: [],
  rating: ['rating'],
  title: ['copy'],
  playstyle: ['copy'],
  chips: ['rating'],
  counters: [],
  traits: ['board'],
  augments: ['augments'],
  'augment-types': ['types'],
  matchups: ['matchups'],
  board: ['board'],
  early: ['early'],
  items: ['items'],
  positioning: ['board'],
  flex: [],
  alt: ['alt'],
  tips: ['copy'],
  stages: ['stages'],
  economy: [],
};

const SHORT = 110;
const brief = (value: string) => (value.length > SHORT ? `${value.slice(0, SHORT)}…` : value);

const joinNames = (units: { name: string }[]) => units.map((unit) => unit.name).join(', ');

function fieldValue(key: ProvenanceKey, comp: ApiComp, provenance: ApiProvenance, strategy: string): string {
  const row = provenance.row;
  switch (key) {
    case 'carry':
      return comp.carry.name;
    case 'cover':
      return comp.cover ? `${comp.cover.kind} · ${comp.cover.name}` : 'không có';
    case 'rating':
      return [comp.tier, comp.situational ? 'situational' : null, comp.trend ? `trend ${comp.trend}` : null].filter(Boolean).join(' · ');
    case 'title':
      return comp.title;
    case 'playstyle':
      return comp.playstyle;
    case 'chips':
      return `${comp.style} · ${comp.difficulty}/3 · ${comp.units.length} tướng`;
    case 'counters':
      return `${comp.votes} vote · ${comp.views} lượt xem`;
    case 'traits':
      return comp.traits.map((trait) => `${trait.name} ${trait.count}`).join(', ') || 'không đủ mốc';
    case 'augments':
      return joinNames(comp.augments);
    case 'augment-types':
      return (row?.augment_types ?? []).join(' ▸ ') || 'trống';
    case 'matchups':
      return comp.matchups.map((entry) => `${entry.kind === 'good' ? '+' : '-'} ${entry.title}`).join(', ') || 'không có';
    case 'board':
      return joinNames(comp.units);
    case 'early':
      return joinNames(comp.early);
    case 'items':
      return comp.items.map((item) => item.name).join(' ▸ ');
    case 'positioning':
      return `${comp.units.filter((unit) => unit.row !== null && unit.col !== null).length}/${comp.units.length} ô có toạ độ`;
    case 'flex':
      return (provenance.extras?.flex ?? []).map((pair) => `${pair.name} thay ${pair.replaces}`).join(', ') || 'file không có cặp nào';
    case 'alt':
      return joinNames(comp.alt) || 'không có';
    case 'tips':
      return comp.tips || 'trống';
    case 'stages':
      return provenance.stages.map((stage) => `S${stage.stage}`).join(', ') || 'trống';
    case 'economy':
      return `${strategy} · ${provenance.row ? 'khớp theo carry + board' : ''}`.trim();
  }
}

// A section as the seed script sees it: the two string lists, quoted so a drift
// reads as the exact rows that would be rewritten.
function sectionQuote(sections: Record<string, string[]> | null, name: string): string {
  const list = sections?.[name];
  if (!list || !list.length) return '—';
  const shown = list.slice(0, 4).join(' | ');
  return brief(list.length > 4 ? `${shown} (+${list.length - 4})` : shown);
}

export function ProvenanceView({
  comp,
  provenance,
  drift,
  children,
}: {
  comp: ApiComp;
  provenance: ApiProvenance;
  drift: { section: string; fields: ProvenanceField[] }[];
  children: ReactNode;
}) {
  const [mode, setMode] = useState<'single' | 'all' | 'off'>('single');
  const [active, setActive] = useState<ProvenanceKey>('board');
  const [boxes, setBoxes] = useState<Partial<Record<ProvenanceKey, Box>>>({});
  const [railRow, setRailRow] = useState<Box | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);

  const economy = economyForComp({ style: comp.style, carry: comp.carry, units: comp.units });
  const presentKeys = PROVENANCE_FIELDS.map((field) => field.key).filter((key) => boxes[key]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || mode === 'off') return;
    const measure = () => {
      const frame = root.getBoundingClientRect();
      const next: Partial<Record<ProvenanceKey, Box>> = {};
      for (const el of root.querySelectorAll<HTMLElement>('[data-pv]')) {
        const key = el.dataset.pv as ProvenanceKey;
        const rect = el.getBoundingClientRect();
        next[key] = { left: rect.left - frame.left, top: rect.top - frame.top, width: rect.width, height: rect.height };
      }
      setBoxes(next);
      const row = railRef.current?.querySelector<HTMLElement>(`[data-field="${active}"]`);
      if (row && root.contains(row)) {
        const rect = row.getBoundingClientRect();
        setRailRow({ left: rect.left - frame.left, top: rect.top - frame.top, width: rect.width, height: rect.height });
      } else setRailRow(null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', measure);
    };
  }, [mode, active]);

  // The rail can scroll a field out of view; re-measure once the browser has
  // painted the highlight change, or the line keeps pointing at the old row.
  useEffect(() => {
    const row = railRef.current?.querySelector<HTMLElement>(`[data-field="${active}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const field = provenanceFieldByKey.get(active)!;
  const sections = provenance.sections;
  const driftForField = drift.filter((entry) => entry.fields.some((f) => f.key === active));
  const target = mode === 'off' ? null : boxes[active];
  const outline = mode === 'all' ? presentKeys : target ? [active] : [];
  const lineStart = railRow ? { x: railRow.left, y: railRow.top + railRow.height / 2 } : null;
  const lineEnd =
    target && lineStart
      ? lineStart.x > target.left + target.width / 2
        ? { x: target.left + target.width, y: target.top + target.height / 2 }
        : { x: target.left, y: target.top + target.height / 2 }
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['single', 'all', 'off'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            className={`smooth rounded-full border px-3 py-1 text-xs font-semibold ${
              mode === option ? 'border-brand bg-brand/15 text-fog' : 'border-line bg-util text-mist hover:border-brand hover:text-fog'
            }`}
          >
            {option === 'single' ? 'Từng field' : option === 'all' ? 'Soi hết' : 'Tắt annotation'}
          </button>
        ))}
        <span className="text-xs text-mist">Bấm vào một vùng trên panel để xem field đó đến từ đâu.</span>
      </div>

      <Panel className={`p-4 ${drift.length ? 'border-tier-s/60' : 'border-line'}`}>
        <p className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-line bg-util px-3 py-0.5 text-xs font-semibold text-fog">
            {provenance.inSnapshot ? 'Có trong seed/comps.json' : 'Không có trong snapshot'}
          </span>
          <span className="rounded-full border border-line bg-util px-3 py-0.5 text-xs font-semibold text-fog">
            {provenance.inDb ? 'Có row trong comps' : 'Chưa có row'}
          </span>
          {drift.length ? (
            <span className="rounded-full border border-tier-s/60 bg-tier-s/10 px-3 py-0.5 text-xs font-bold text-tier-s">
              DB lệch snapshot: {drift.map((entry) => entry.section).join(', ')}
            </span>
          ) : (
            <span className="rounded-full border border-tier-c/60 bg-tier-c/10 px-3 py-0.5 text-xs font-bold text-tier-c">DB khớp snapshot</span>
          )}
        </p>
        {drift.length ? (
          <ul className="mt-3 flex flex-col gap-1 text-sm text-mist">
            {drift.map((entry) => (
              <li key={entry.section} className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold text-fog">{entry.section}</span>
                {entry.fields.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => {
                      setActive(f.key);
                      setMode('single');
                    }}
                    className="smooth rounded border border-line bg-util px-2 py-0.5 text-xs font-semibold text-mist hover:border-brand hover:text-fog"
                  >
                    {f.label}
                  </button>
                ))}
                {sections.desired && sections.stored ? (
                  <span className="text-xs">
                    DB: {sectionQuote(sections.stored, entry.section)} · File: {sectionQuote(sections.desired, entry.section)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {provenance.snapshotError ? <p className="mt-2 text-sm text-tier-s">Payload snapshot không hợp lệ: {provenance.snapshotError}</p> : null}
        {provenance.missing.champions.length || provenance.missing.items.length || provenance.missing.augments.length ? (
          <p className="mt-2 text-sm text-tier-s">
            Tên không có trong catalogue (icon sẽ trống, cost rơi về 1):{' '}
            {[...provenance.missing.champions, ...provenance.missing.items, ...provenance.missing.augments].join(', ')}
          </p>
        ) : null}
        <p className="mt-3 text-xs leading-relaxed text-mist">
          {drift.length
            ? 'npm run seed:comps -- --dry-run sẽ in đúng danh sách này rồi ghi lại các section đó qua writeComp. votes, views và cover không bị đụng tới.'
            : 'Chạy npm run seed:comps sẽ không ghi gì cho bài này.'}
        </p>
      </Panel>

      <div
        ref={rootRef}
        onClick={(event) => {
          const el = (event.target as HTMLElement).closest<HTMLElement>('[data-pv]');
          const key = el?.dataset.pv as ProvenanceKey | undefined;
          if (key && provenanceFieldByKey.has(key)) {
            setActive(key);
            if (mode === 'off') setMode('single');
          }
        }}
        className="relative grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_330px]"
      >
        <div className="min-w-0">{children}</div>

        <svg aria-hidden className="pointer-events-none absolute inset-0 z-20 h-full w-full">
          {lineStart && lineEnd ? (
            <path
              d={`M ${lineStart.x} ${lineStart.y} C ${lineStart.x - 60} ${lineStart.y}, ${lineEnd.x + (lineStart.x > lineEnd.x ? 60 : -60)} ${lineEnd.y}, ${lineEnd.x} ${lineEnd.y}`}
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
          ) : null}
        </svg>

        {outline.map((key) => {
          const box = boxes[key];
          if (!box) return null;
          return (
            <span
              key={key}
              aria-hidden
              className={`pointer-events-none absolute z-20 rounded-lg ${key === active ? 'ring-2 ring-brand' : 'ring-1 ring-brand/45'}`}
              style={{ left: box.left - 3, top: box.top - 3, width: box.width + 6, height: box.height + 6 }}
            />
          );
        })}

        <div ref={railRef} className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto rounded-xl border border-line bg-panel p-3 lg:sticky lg:top-4">
          {PROVENANCE_FIELDS.map((entry) => {
            const isActive = entry.key === active;
            const visible = Boolean(boxes[entry.key]);
            const flagged = drift.some((entry2) => entry2.fields.some((f) => f.key === entry.key));
            return (
              <button
                key={entry.key}
                data-field={entry.key}
                type="button"
                onClick={() => {
                  setActive(entry.key);
                  if (mode === 'off') setMode('single');
                }}
                className={`smooth flex flex-col items-start gap-0.5 rounded-lg border px-2.5 py-1.5 text-left ${
                  isActive ? 'border-brand bg-brand/15' : 'border-transparent hover:bg-page'
                } ${visible ? '' : 'opacity-50'}`}
              >
                <span className="flex w-full items-center gap-2">
                  <span className={`text-sm font-semibold ${isActive ? 'text-fog' : 'text-mist'}`}>{entry.label}</span>
                  {flagged ? <span className="ml-auto shrink-0 text-[10px] font-bold uppercase text-tier-s">lệch</span> : null}
                </span>
                <span className="flex w-full items-center gap-2 text-[11px] text-fog/60">
                  <code className="truncate font-mono text-[11px] text-mist">{entry.path}</code>
                  <span className="ml-auto shrink-0 rounded-full border border-line px-1.5 text-[10px] uppercase text-mist">{KIND_LABEL[entry.kind]}</span>
                </span>
              </button>
            );
          })}
        </div>

        <Panel className="flex flex-col gap-2 p-4 lg:col-span-2">
          <p className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-brand/60 bg-util px-3 py-0.5 text-xs font-semibold text-brand">{field.label}</span>
            <span className="text-xs text-mist">{KIND_LABEL[field.kind]}</span>
          </p>
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[110px_minmax(0,1fr)]">
            <dt className="text-mist">Giá trị</dt>
            <dd className="break-words text-fog">{brief(fieldValue(active, comp, provenance, economy.strategy))}</dd>
            <dt className="text-mist">Lưu ở đâu</dt>
            <dd className="break-words font-mono text-xs text-fog">{field.path}</dd>
            <dt className="text-mist">Ai ghi</dt>
            <dd className="text-fog">{field.writer}</dd>
            <dt className="text-mist">Đổi khi</dt>
            <dd className="text-fog">{field.changes}</dd>
            <dt className="text-mist">Cần biết</dt>
            <dd className="text-mist">{field.note}</dd>
          </dl>
          {driftForField.map((entry) => (
            <p key={entry.section} className="rounded-lg border border-tier-s/40 bg-tier-s/10 px-3 py-2 text-xs text-fog">
              <span className="font-bold uppercase text-tier-s">Lệch · {entry.section}</span>
              <br />
              DB đang: {sectionQuote(sections.stored, entry.section)}
              <br />
              Snapshot nói: {sectionQuote(sections.desired, entry.section)}
            </p>
          ))}
          {!FIELD_SECTIONS[active].length ? <p className="text-xs text-mist">Vùng này không nằm trong phần seed:comps so sánh.</p> : null}
        </Panel>
      </div>
    </div>
  );
}
