import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Tier } from '@/lib/tiers';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export const tierColor: Record<Tier, string> = {
  S: 'var(--color-tier-s)',
  A: 'var(--color-tier-a)',
  B: 'var(--color-tier-b)',
  C: 'var(--color-tier-c)',
  X: 'var(--color-tier-x)',
};

const costBg: Record<number, string> = { 1: 'bg-cost-1', 2: 'bg-cost-2', 3: 'bg-cost-3', 4: 'bg-cost-4', 5: 'bg-cost-5' };

export function TierTabs({ current, lang }: { current: 'comps' | 'items' | 'augments'; lang: Lang }) {
  const t = messages[lang].tierTabs;
  const tabs = [
    { key: 'comps', label: t.comps, href: `/${lang}/tierlist/comps` },
    { key: 'items', label: t.items, href: `/${lang}/tierlist/items` },
    { key: 'augments', label: t.augments, href: `/${lang}/tierlist/augments` },
  ];
  return (
    <nav className="flex items-center gap-1 border-b border-line" aria-label={t.aria}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`smooth -mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab.key === current ? 'border-brand text-brand-soft' : 'border-transparent text-mist hover:text-fog'}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-panel ${className}`}>{children}</div>;
}

export function Chip({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-md border border-line bg-util px-2 py-0.5 text-xs font-semibold text-mist ${className}`}>{children}</span>;
}

export function DisplayTitle({ small, big, accent, sub }: { small: string; big: string; accent?: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-display text-4xl font-bold uppercase tracking-tight text-fog md:text-6xl">{small}</span>
        <span className="text-3xl text-brand">{'\u25B8'}</span>
        <span className="font-display text-4xl font-bold uppercase tracking-tight text-brand-soft md:text-6xl">{big}</span>
      </div>
      {sub ? <p className="max-w-2xl text-sm text-mist">{sub}</p> : null}
    </div>
  );
}

export function CostDots({ cost }: { cost: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: cost }, (_, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${costBg[cost]}`} />
      ))}
    </span>
  );
}

export function UnitHex({ name, cost, size = 56, stars, icon = null, fill = false, className = '' }: { name: string; cost: number; size?: number; stars?: number; icon?: string | null; fill?: boolean; className?: string }) {
  // Regular pointy-top hexagons are taller than wide: height = width * 2/√3.
  const height = fill ? undefined : Math.round(size * 1.1547);
  return (
    <div data-tip={`champion:${name}`} className={`group/hex relative shrink-0 ${fill ? 'h-full w-full' : ''} ${className}`} style={fill ? undefined : { width: size, height }}>
      <div className={`hex smooth relative h-full w-full ${costBg[cost] ?? 'bg-cost-1'} group-hover/hex:scale-110`}>
        <div className="hex absolute inset-0 flex scale-[0.91] items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#2a3245_0%,#121722_100%)] font-display text-xs font-bold text-fog">
          {icon ? (
            <img src={icon} alt="" draggable={false} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            name.slice(0, 2).toUpperCase()
          )}
        </div>
      </div>
      {stars ? (
        <span className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 text-[max(10px,calc(var(--hex-w,56px)*0.2))] leading-none tracking-tight text-tier-b drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          {'★'.repeat(Math.min(stars, 3))}
        </span>
      ) : null}
    </div>
  );
}

export function ItemTile({ name, icon, tier, size = 44 }: { name: string; icon?: string | null; tier?: Tier | null; size?: number }) {
  return (
    <span data-tip={`item:${name}`} className="relative block shrink-0" style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-[22%]" style={{ background: tier ? tierColor[tier] : 'var(--color-line)' }} />
      <span className="absolute overflow-hidden rounded-[16%] bg-panel" style={{ inset: size * 0.09 }}>
        {icon ? <img src={icon} alt="" draggable={false} loading="lazy" className="h-full w-full object-cover" /> : null}
      </span>
    </span>
  );
}

export function AugmentTile({ name, icon, size = 44 }: { name: string; icon?: string | null; size?: number }) {
  return (
    <span data-tip={`augment:${name}`} className="relative block shrink-0 overflow-hidden rounded-[18%] bg-util" style={{ width: size, height: size }}>
      {icon ? <img src={icon} alt="" draggable={false} loading="lazy" className="h-full w-full object-cover" /> : null}
    </span>
  );
}

export function TierChip({ tier, label }: { tier: Tier; label: string }) {
  return (
    <div className="flex h-28 w-24 shrink-0 flex-col items-center justify-center rounded-lg border-2 bg-panel" style={{ borderColor: tierColor[tier] }}>
      <span className="font-display text-5xl font-bold" style={{ color: tierColor[tier] }}>{tier}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-mist">{label}</span>
    </div>
  );
}

export function CtaLink({ href, children, kind = 'solid' }: { href: string; children: ReactNode; kind?: 'solid' | 'ghost' }) {
  const styles = kind === 'solid'
    ? 'border-brand-hot bg-brand-hot text-white hover:bg-brand-deep'
    : 'border-line bg-panel text-fog hover:border-brand-soft';
  return (
    <Link href={href} className={`smooth rounded-full border px-5 py-2 text-sm font-semibold ${styles}`}>
      {children}
    </Link>
  );
}
