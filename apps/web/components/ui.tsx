import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Tier } from '@/lib/tiers';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { itemSlugByName } from '@/lib/data';
import { itemName } from '@/lib/tips';

// Detail-page link for a catalog item; undefined when unknown or no lang context.
export function itemHref(name: string, lang?: Lang): string | undefined {
  const slug = itemSlugByName[name];
  return slug && lang ? `/${lang}/items/${slug}` : undefined;
}

export const tierColor: Record<Tier, string> = {
  S: 'var(--color-tier-s)',
  A: 'var(--color-tier-a)',
  B: 'var(--color-tier-b)',
  C: 'var(--color-tier-c)',
  D: 'var(--color-tier-d)',
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
          className={`smooth -mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab.key === current ? 'border-brand text-brand' : 'border-transparent text-mist hover:text-fog'}`}
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

export function DisplayTitle({ small, big, accent, sub, compact = false }: { small: string; big: string; accent?: string; sub?: string; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="flex flex-wrap items-baseline gap-3">
        <span className={`font-display font-bold uppercase tracking-tight text-fog ${compact ? 'text-lg' : 'text-4xl md:text-6xl'}`}>{small}</span>
        <span className={compact ? 'text-base text-brand' : 'text-3xl text-brand'}>{'\u25B8'}</span>
        <span className={`font-display font-bold uppercase tracking-tight text-brand ${compact ? 'text-lg' : 'text-4xl md:text-6xl'}`}>{big}</span>
      </h1>
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

export function UnitHex({ name, cost, size = 56, stars, icon = null, fill = false, frame, className = '' }: { name: string; cost: number; size?: number; stars?: number; icon?: string | null; fill?: boolean; frame?: string; className?: string }) {
  // Regular pointy-top hexagons are taller than wide: height = width * 2/√3.
  const height = fill ? undefined : Math.round(size * 1.1547);
  return (
    <div data-tip={`champion:${name}`} className={`group/hex relative shrink-0 ${fill ? 'h-full w-full' : ''} ${className}`} style={fill ? undefined : { width: size, height }}>
      <div className={`hex smooth relative h-full w-full ${frame ? '' : costBg[cost] ?? 'bg-cost-1'} group-hover/hex:scale-110`} style={frame ? { background: frame } : undefined}>
        <div className="hex absolute inset-0 flex scale-[0.91] items-center justify-center overflow-hidden bg-[linear-gradient(180deg,var(--color-line)_0%,var(--color-panel)_100%)] font-display text-xs font-bold text-fog">
          {icon ? (
            <img src={icon} alt="" draggable={false} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            name.slice(0, 2).toUpperCase()
          )}
        </div>
      </div>
      {stars ? (
        <span
          className={`pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 border border-black/30 bg-[#f5c542] leading-none tracking-[0.08em] text-[#201a0a] shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${
            fill
              ? 'top-[3%] rounded-[0.2em] px-[0.12em] py-[0.06em] text-[max(6px,calc(var(--hex-w,56px)*0.22))]'
              : 'top-0.5 rounded-[5px] px-1.5 py-[1px] text-[max(9px,calc(var(--hex-w,56px)*0.18))]'
          }`}
        >
          {'★'.repeat(Math.min(stars, 3))}
        </span>
      ) : null}
    </div>
  );
}

export function ItemTile({ name, icon, tier, size = 44, href }: { name: string; icon?: string | null; tier?: Tier | null; size?: number; href?: string }) {
  // One ring fraction for every tile size, so a 24px chip and an 88px hero read
  // as the same object. 18% keeps the inner corners concentric with the outer 22%.
  const ring = size * 0.055;
  const tile = (
    <span data-tip={`item:${name}`} className="relative block shrink-0" style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-[22%]" style={{ background: tier ? tierColor[tier] : 'var(--color-line)' }} />
      <span className="absolute overflow-hidden rounded-[18%] bg-panel" style={{ inset: ring }}>
        {icon ? <img src={icon} alt="" draggable={false} loading="lazy" className="h-full w-full object-cover" /> : null}
      </span>
    </span>
  );
  // Optional link to the item detail page; board/tile contexts without href
  // (hex board, pickers) stay non-interactive.
  return href ? (
    <Link href={href} className="smooth relative block shrink-0 hover:brightness-110" style={{ width: size, height: size }}>
      {tile}
    </Link>
  ) : (
    tile
  );
}

export function ItemRanking({
  items,
  size = 36,
  showTier = true,
  lang,
}: {
  items: { name: string; icon?: string | null; tier?: Tier | null; note?: string }[];
  size?: number;
  showTier?: boolean;
  lang?: Lang;
}) {
  return (
    <ol className="flex flex-col gap-1.5">
      {items.map((item, index) => (
        <li key={`${item.name}-${index}`} className="flex items-center gap-3 rounded-lg border border-line bg-ink/40 px-3 py-2">
          <span className="w-5 shrink-0 text-center font-display text-sm font-bold text-mist">{index + 1}</span>
          <ItemTile name={item.name} icon={item.icon} tier={item.tier} size={size} href={itemHref(item.name, lang)} />
          <span className="min-w-0 flex-1">
            {itemHref(item.name, lang) ? (
              <Link href={itemHref(item.name, lang)!} className="smooth block truncate text-sm font-semibold text-fog hover:text-brand">
                {lang ? itemName(item.name, lang) : item.name}
              </Link>
            ) : (
              <span className="block truncate text-sm font-semibold text-fog">{lang ? itemName(item.name, lang) : item.name}</span>
            )}
            {item.note ? <span className="block truncate text-[11px] text-mist">{item.note}</span> : null}
          </span>
          {showTier && item.tier ? (
            <span className="shrink-0 rounded border px-1.5 py-0.5 font-display text-xs font-bold" style={{ borderColor: tierColor[item.tier], color: tierColor[item.tier] }}>
              {item.tier}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

// Small item icon with a tier-coloured ring, shared by the admin board editor
// and the public team builder.
export function MiniItem({ icon, name, tier, size = 20, dashed = false }: { icon?: string | null; name?: string; tier?: Tier | null; size?: number; dashed?: boolean }) {
  if (dashed) {
    return <span className="block shrink-0 rounded-[22%] border border-dashed border-line" style={{ width: size, height: size }} />;
  }
  return (
    <span title={name} className="relative block shrink-0" style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-[22%]" style={{ background: tier ? tierColor[tier] : 'var(--color-line)' }} />
      <span className="absolute overflow-hidden rounded-[16%] bg-panel" style={{ inset: Math.max(1, Math.round(size * 0.09)) }}>
        {icon ? <img src={icon} alt="" draggable={false} className="h-full w-full object-cover" /> : null}
      </span>
    </span>
  );
}

// Small pointy-top hex used for items sitting under a unit on the board.
// `fill` sizes it from its flex parent instead of a fixed pixel size, so the
// same row shrinks with the hex board on a phone.
export function ItemHex({ name, icon, tier, size = 16, tip, fill = false }: { name: string; icon?: string | null; tier?: Tier | null; size?: number; tip?: string; fill?: boolean }) {
  return (
    <span
      data-tip={tip}
      title={name}
      className={fill ? 'relative block min-w-0 flex-1' : 'relative block shrink-0'}
      style={fill ? { aspectRatio: '1 / 1.1547' } : { width: size, height: Math.round(size * 1.1547) }}
    >
      <span className="hex absolute inset-0" style={{ background: tier ? tierColor[tier] : 'var(--color-line)' }} />
      <span className="hex absolute overflow-hidden bg-panel" style={{ inset: fill ? '12%' : Math.max(1, Math.round(size * 0.12)) }}>
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

export function TierChip({ tier, label, stacked = false }: { tier: Tier; label: string; stacked?: boolean }) {
  // min-h (not fixed h) so the chip stretches to the full height of its
  // tier row when the comp/item list beside it wraps to several lines.
  // stacked: below sm the chip is its own full-width row above the list.
  return (
    <div
      className={`flex shrink-0 rounded-lg border-2 bg-panel ${
        stacked
          ? 'w-full flex-row items-center justify-center gap-3 px-3 py-2.5 sm:min-h-28 sm:w-24 sm:flex-col sm:items-center sm:gap-0 sm:justify-center sm:px-0 sm:py-0'
          : 'min-h-28 w-24 flex-col items-center justify-center'
      }`}
      style={{ borderColor: tierColor[tier] }}
    >
      <span className={`font-display font-bold ${stacked ? 'text-4xl sm:text-5xl' : 'text-5xl'}`} style={{ color: tierColor[tier] }}>{tier}</span>
      <span className={`font-semibold uppercase tracking-wide text-mist ${stacked ? 'text-xs sm:text-[10px]' : 'text-[10px]'}`}>{label}</span>
    </div>
  );
}

export function CtaLink({ href, children, kind = 'solid' }: { href: string; children: ReactNode; kind?: 'solid' | 'ghost' }) {
  const styles = kind === 'solid'
    ? 'border-brand bg-brand text-on-brand hover:bg-brand-deep'
    : 'border-line bg-panel text-fog hover:border-brand';
  return (
    <Link href={href} className={`smooth rounded-full border px-5 py-2 text-sm font-semibold ${styles}`}>
      {children}
    </Link>
  );
}
