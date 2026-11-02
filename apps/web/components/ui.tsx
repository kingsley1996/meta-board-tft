import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import type { Tier } from '@/lib/tiers';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { itemSlugByName } from '@/lib/data';
import { itemName } from '@/lib/tips';
import championFocus from '@/lib/champion-focus.json';

// Portrait art is square and the hexagon is 2/sqrt(3) taller than wide, so
// object-cover already fills the height exactly and only has width to spare.
const COVER_X = 1.1547;
// object-position 0% and 100% are the two ends of that spare width, so they
// reveal source x 0.5/COVER_X and (COVER_X-0.5)/COVER_X around the centre.
const FOCUS_MIN = 0.5 / COVER_X;
const FOCUS_MAX = 1 - FOCUS_MIN;

// Where each champion's face sits, measured off the art. Only the horizontal
// axis can be honoured: cover leaves no vertical slack, so nudging the crop up
// or down slides the art out of the hexagon and shows the panel behind it.
function focusPosition(icon: string) {
  const [fx = 0.5] = (championFocus as Record<string, number[]>)[icon.split('/').pop() ?? ''] ?? [];
  const p = ((fx - FOCUS_MIN) / (FOCUS_MAX - FOCUS_MIN)) * 100;
  return `${Math.round(Math.min(100, Math.max(0, p)))}% 50%`;
}

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

// A champion's colour is its cost, and it is data, not decoration: the hex rim,
// the cost dots and the ring around every item that champion carries.
export const costColor: Record<number, string> = {
  1: 'var(--color-cost-1)',
  2: 'var(--color-cost-2)',
  3: 'var(--color-cost-3)',
  4: 'var(--color-cost-4)',
  5: 'var(--color-cost-5)',
};

export const costOf = (cost: number) => costColor[cost] ?? costColor[1];

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

// `pv` is a provenance hook: /admin/comps/*/provenance outlines that box and
// draws its leader line to the field rail. It has no effect anywhere else.
export function Panel({ children, className = '', section, pv }: { children: ReactNode; className?: string; section?: string; pv?: string }) {
  return <div data-section={section} data-pv={pv} className={`rounded-xl border border-line bg-panel ${className}`}>{children}</div>;
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
        <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: costOf(cost) }} />
      ))}
    </span>
  );
}

export function UnitHex({ name, cost, size = 56, stars, icon = null, fill = false, frame, className = '' }: { name: string; cost: number; size?: number; stars?: number; icon?: string | null; fill?: boolean; frame?: string; className?: string }) {
  // Regular pointy-top hexagons are taller than wide: height = width * 2/√3.
  const height = fill ? undefined : Math.round(size * 1.1547);
  const focus = icon ? focusPosition(icon) : undefined;
  return (
    <div data-tip={`champion:${name}`} className={`group/hex relative shrink-0 ${fill ? 'h-full w-full' : ''} ${className}`} style={fill ? undefined : { width: size, height }}>
      <div className="hex smooth relative h-full w-full group-hover/hex:scale-110" style={{ background: frame ?? costOf(cost) }}>
        <div className="hex absolute inset-0 flex scale-[0.87] items-center justify-center overflow-hidden bg-[linear-gradient(180deg,var(--color-line)_0%,var(--color-panel)_100%)] font-display text-xs font-bold text-fog">
          {icon ? (
            <img
              src={icon}
              alt=""
              draggable={false}
              loading="lazy"
              className="h-full w-full object-cover"
              style={focus ? { objectPosition: focus } : undefined}
            />
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
// same row shrinks with the hex board on a phone. Pass an explicit width class
// (e.g. `w-[32%]`) when the plate must keep one size whatever the row holds.
export function ItemHex({ name, icon, tier, frame, size = 16, tip, fill = false, className }: { name: string; icon?: string | null; tier?: Tier | null; frame?: string; size?: number; tip?: string; fill?: boolean; className?: string }) {
  return (
    <span
      data-tip={tip}
      title={name}
      className={`${className ?? (fill ? 'min-w-0 flex-1' : 'shrink-0')} relative block`}
      style={fill ? { aspectRatio: '1 / 1.1547' } : { width: size, height: Math.round(size * 1.1547) }}
    >
      <span className="hex absolute inset-0" style={{ background: frame ?? (tier ? tierColor[tier] : 'var(--color-line)') }} />
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

// The badge TFT Academy pins to a comp's avatar: the item, emblem or augment
// that defines the build. Always a hex, like the source site. `frame` is the
// rim of the unit it sits on, so the badge reads as part of that hexagon.
export function CoverBadge({ cover, size, frame }: { cover: { kind: 'item' | 'augment'; name: string; icon: string | null }; size: number; frame?: string }) {
  return (
    <span className="block drop-shadow-[0_2px_4px_rgba(0,0,0,.65)]">
      <ItemHex name={cover.name} icon={cover.icon} size={size} frame={frame} tip={`${cover.kind}:${cover.name}`} />
    </span>
  );
}

export function TierChip({ tier, label, compact = false }: { tier: Tier; label: string; compact?: boolean }) {
  // Layout lives in globals.css (.tier-chip): a colour band with the label
  // beside the glyph on desktop, a full-width bar with the band on top below sm.
  return (
    <div className={`tier-chip${compact ? ' tier-chip-sm' : ''}`} style={{ '--tc': tierColor[tier] } as CSSProperties}>
      <span className="tier-chip-band">{label}</span>
      <span className="tier-chip-letter">{tier}</span>
      <span className="tier-chip-spark" aria-hidden="true">
        <svg width="100%" height="100%" viewBox="0 0 24 24">
          <path d="M12 0c1.1 6.4 4.5 9.8 12 12-7.5 2.2-10.9 5.6-12 12-1.1-6.4-4.5-9.8-12-12C7.5 9.8 10.9 6.4 12 0z" fill="currentColor" />
        </svg>
      </span>
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
