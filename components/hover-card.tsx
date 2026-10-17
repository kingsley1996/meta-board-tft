'use client';

import { useEffect, useRef, useState } from 'react';
import { augmentRarity, getTip, traitStyleColors, type TipData } from '@/lib/tips';
import { CostDots } from './ui';

function ChampionCard({ tip }: { tip: Extract<TipData, { kind: 'champion' }> }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-lg font-bold tracking-tight text-fog">{tip.name}</span>
        <CostDots cost={tip.cost} />
      </div>
      <div className="mt-1.5 flex flex-col gap-1">
        {tip.traits.map((trait) => (
          <div key={trait.name} className="flex items-center gap-1.5 text-xs font-semibold text-mist">
            {trait.icon ? <img src={trait.icon} alt="" draggable={false} className="h-4 w-4 object-contain brightness-0 invert opacity-70" /> : null}
            <span className="uppercase tracking-wide">{trait.name}</span>
          </div>
        ))}
      </div>
      {tip.ability ? (
        <div className="mt-2.5 flex gap-2.5 border-t border-line pt-2.5">
          {tip.ability.icon ? <img src={tip.ability.icon} alt="" draggable={false} className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover" /> : null}
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-fog">{tip.ability.name}</span>
              {tip.mana ? <span className="shrink-0 text-xs font-semibold whitespace-nowrap text-brand-soft">{tip.mana.start} / {tip.mana.max}</span> : null}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-mist">{tip.ability.desc}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ItemCard({ tip }: { tip: Extract<TipData, { kind: 'item' }> }) {
  return (
    <div>
      <span className="text-sm font-bold text-fog">{tip.name}</span>
      <p className="mt-1 text-xs leading-relaxed text-mist">{tip.desc}</p>
      {tip.composition.length ? (
        <div className="mt-2 border-t border-line pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-mist">Builds from</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {tip.composition.map((part) => (
              <span key={part.name} className="flex items-center gap-1.5 rounded-md border border-line bg-util py-0.5 pr-2 pl-0.5 text-xs font-semibold text-fog">
                {part.icon ? <img src={part.icon} alt="" draggable={false} className="h-5 w-5 rounded-[22%]" /> : null}
                {part.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AugmentCard({ tip }: { tip: Extract<TipData, { kind: 'augment' }> }) {
  const rarity = tip.rarity ? augmentRarity[tip.rarity] : null;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-fog">{tip.name}</span>
        {rarity ? (
          <span className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black/75" style={{ background: rarity.color }}>
            {rarity.label}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-mist">{tip.desc}</p>
    </div>
  );
}

function TraitCard({ tip }: { tip: Extract<TipData, { kind: 'trait' }> }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        {tip.icon ? <img src={tip.icon} alt="" draggable={false} className="h-6 w-6 object-contain brightness-0 invert opacity-80" /> : null}
        <span className="font-display text-base font-bold tracking-tight text-fog">{tip.name}</span>
      </div>
      {tip.thresholds.length ? (
        <div className="mt-2 flex gap-1.5">
          {tip.thresholds.map((threshold, index) => (
            <span
              key={threshold}
              className="flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-bold text-black/75"
              style={{ background: traitStyleColors[tip.styles[index]] ?? traitStyleColors[3] }}
            >
              {threshold}
            </span>
          ))}
        </div>
      ) : null}
      {tip.desc ? <p className="mt-2 text-xs leading-relaxed text-mist">{tip.desc}</p> : null}
    </div>
  );
}

function Card({ tip }: { tip: TipData }) {
  if (tip.kind === 'champion') return <ChampionCard tip={tip} />;
  if (tip.kind === 'item') return <ItemCard tip={tip} />;
  if (tip.kind === 'augment') return <AugmentCard tip={tip} />;
  return <TraitCard tip={tip} />;
}

type Hover = { tip: TipData; rect: { top: number; right: number; bottom: number; left: number } };

// One delegated layer for the whole app: any element with data-tip="kind:name"
// gets a detail card on hover (champion / item / augment / trait).
export function HoverCardLayer() {
  const [hover, setHover] = useState<Hover | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const resolve = (target: EventTarget | null) => (target instanceof Element ? (target.closest('[data-tip]') as HTMLElement | null) : null);
    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    const over = (event: PointerEvent) => {
      const el = resolve(event.target);
      if (!el || el === active.current) return;
      active.current = el;
      const [kind, ...rest] = (el.dataset.tip ?? '').split(':');
      const tip = getTip(kind, rest.join(':'));
      clear();
      if (!tip) return;
      const box = el.getBoundingClientRect();
      timer.current = setTimeout(() => setHover({ tip, rect: { top: box.top, right: box.right, bottom: box.bottom, left: box.left } }), 120);
    };
    const out = (event: PointerEvent) => {
      const el = resolve(event.target);
      if (!el) return;
      if (event.relatedTarget instanceof Node && el.contains(event.relatedTarget)) return;
      active.current = null;
      clear();
      setHover(null);
    };
    const hide = () => {
      active.current = null;
      clear();
      setHover(null);
    };
    document.addEventListener('pointerover', over, true);
    document.addEventListener('pointerout', out, true);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('pointerdown', hide, true);
    return () => {
      document.removeEventListener('pointerover', over, true);
      document.removeEventListener('pointerout', out, true);
      document.removeEventListener('scroll', hide, true);
      document.removeEventListener('pointerdown', hide, true);
      clear();
    };
  }, []);

  if (!hover) return null;
  const { tip, rect } = hover;
  const width = 340;
  const gap = 12;
  const margin = 8;
  const left = window.innerWidth - rect.right - gap >= width + margin ? rect.right + gap : Math.max(margin, rect.left - gap - width);
  const anchor = rect.top > window.innerHeight * 0.5
    ? { bottom: Math.max(margin, window.innerHeight - rect.bottom) }
    : { top: Math.max(margin, rect.top) };
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 max-h-[calc(100vh-16px)] w-[340px] overflow-hidden rounded-xl border border-line bg-panel px-3.5 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
      style={{ left, ...anchor }}
    >
      <Card tip={tip} />
    </div>
  );
}
