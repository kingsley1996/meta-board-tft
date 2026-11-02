'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchComps, type ApiComp, type CompSummary, type CompsInitial, type CompsResponse } from '@/lib/api';
import { tierRank, type Tier } from '@/lib/tiers';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { compVariants, variantRows } from '@/lib/variants';
import { CoverBadge, costOf, tierColor, TierChip, TierTabs, UnitHex } from './ui';
import { CompPanel } from './comp-panel';

// Tier list ⇄ comp detail are separate routes rendering the same explorer;
// caching the payload keeps the list on screen during the client-side hop
// (no loading collapse, no scroll clamp). Refetched on every mount.
const cache: Record<string, CompsResponse> = {};

// Views are counted once per browser session per comp.
const viewed = new Set<string>();

// A glide that an effect re-run (e.g. StrictMode's double fetch replacing
// `data`) cut short mid-flight — the next run must finish it. Module-level
// because list ⇄ detail navigations remount the explorer, and the check
// inside glide() has to see it across mounts.
let glidePending = false;

// A variant tab swaps the comp under the reader's eyes, so the glide that lands
// a fresh selection must not run for the comp it lands on — not on arrival, and
// not again when the mount fetch replaces the list. It is keyed by slug for that
// second pass, and spent as soon as the reader moves elsewhere. Module-level like
// glidePending: the detail route remounts the explorer, and the check inside
// glide() has to see it across mounts.
let heldSlug = '';

// useLayoutEffect while hydrating in the browser, useEffect during SSR.
const useScrollEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// A detail page seeds only the open comp in full; its siblings arrive as
// summaries until the mount fetch replaces the list.
function isFullComp(comp: ApiComp | CompSummary): comp is ApiComp {
  return 'units' in comp;
}

export function CompsExplorer({ openSlug, lang, initial }: { openSlug?: string; lang: Lang; initial?: CompsInitial }) {
  const t = messages[lang].explorer;
  const [sort, setSort] = useState<'default' | 'popular'>('default');
  const cacheKey = `${lang}:${sort}`;
  // `initial` is the payload the page already paid for while rendering, so the
  // list paints out of the document instead of waiting on a second round-trip.
  // The mount effect still refetches; this only removes the loading state in
  // front of it.
  const [data, setData] = useState<CompsInitial | null>(() => cache[cacheKey] ?? initial ?? null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [style, setStyle] = useState('All');
  // Names are the default view, so this paints with them until the setting is
  // read. Persisting lives in the toggle's own handler, not in an effect keyed
  // on showNames: a write effect would flush the `true` default over the saved
  // '0' on the detail route's mount — and StrictMode's double effect pass then
  // reads that '1' back and locks names on.
  const [showNames, setShowNames] = useState(true);
  const router = useRouter();
  const tierRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setShowNames(localStorage.getItem('comps-show-names') !== '0');
  }, []);

  const toggleNames = () =>
    setShowNames((value) => {
      localStorage.setItem('comps-show-names', value ? '0' : '1');
      return !value;
    });

  useEffect(() => {
    let live = true;
    setError('');
    fetchComps(lang, sort === 'popular' ? 'popular' : undefined)
      .then((payload) => {
        cache[cacheKey] = payload;
        if (live) setData(payload);
      })
      .catch((reason) => {
        if (live) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      live = false;
    };
  }, [attempt, lang, sort, cacheKey]);

  // One eased glide per selection, like TFT Academy's comp list, animated
  // frame-by-frame with instant scrolls. Native behavior:'smooth' is
  // silently suppressed in some page states (observed in WebKit: the call
  // no-ops without firing a single scroll event) while instant scrolls
  // always land — so the ease-out curve is driven by rAF instead. The
  // target lands the tier row right under the sticky stack, whose height is
  // measured live (nav.tsx keeps both bars pinned on these routes). Settle
  // checks clean up late layout shifts; everything cancels as soon as
  // the user scrolls on their own.
  useScrollEffect(() => {
    if (!openSlug || !data) {
      heldSlug = '';
      return;
    }
    if (openSlug === heldSlug) return;
    heldSlug = '';
    let userTookOver = false;
    let animRaf = 0;
    let glided = false;
    const timers: number[] = [];
    const markUser = () => {
      userTookOver = true;
    };
    const liveStackBottom = () => {
      // The whole sticky stack as it visually covers the page: the header
      // when pinned, plus the menu whether it is pinned to the top or
      // sitting right under a pinned header (lg:top-16).
      const nav = document.querySelector<HTMLElement>('[data-section="nav"]');
      const menu = document.querySelector<HTMLElement>('[data-section="menu"]');
      const navRect = nav?.getBoundingClientRect();
      const menuRect = menu?.getBoundingClientRect();
      let bottom = 0;
      if (navRect && navRect.top <= 1 && navRect.bottom > 1) bottom = navRect.bottom;
      if (menuRect && menuRect.bottom > 1) {
        const pinnedTop = menuRect.top <= 1;
        const underNav = !!navRect && Math.abs(menuRect.top - navRect.bottom) < 4;
        if (pinnedTop || (underNav && bottom > 0)) bottom = Math.max(bottom, menuRect.bottom);
      }
      return bottom;
    };
    const jump = (target: number) => window.scrollTo(0, target);
    const glideTo = (target: number) => {
      cancelAnimationFrame(animRaf);
      const from = window.scrollY;
      const distance = target - from;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced || Math.abs(distance) <= 4) {
        jump(target);
        glidePending = false;
        return;
      }
      const duration = Math.min(750, Math.max(250, Math.abs(distance) * 0.5));
      const start = performance.now();
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
      let animated = false;
      glidePending = true;
      animRaf = requestAnimationFrame(function step(now: number) {
        if (userTookOver) return;
        animated = true;
        const t = Math.min(1, (now - start) / duration);
        jump(Math.round(from + distance * easeOutCubic(t)));
        if (t < 1) animRaf = requestAnimationFrame(step);
        else glidePending = false;
      });
      // rAF never fires in an occluded/throttled view (or a hidden tab);
      // land instantly instead of never arriving.
      timers.push(window.setTimeout(() => {
        if (!userTookOver && !animated && Math.abs(window.scrollY - from) < 2) {
          jump(target);
          glidePending = false;
        }
      }, 250));
    };
    // Tiny residual offsets jump instantly (invisible); bigger ones glide.
    const settle = () => {
      const row = tierRef.current;
      if (!row || userTookOver || !glided) return;
      const off = Math.round(row.getBoundingClientRect().top - liveStackBottom());
      if (Math.abs(off) <= 6) {
        glidePending = false;
        return;
      }
      const target = Math.max(0, Math.round(window.scrollY + off));
      if (Math.abs(off) <= 24) {
        jump(target);
        glidePending = false;
      } else glideTo(target);
    };
    const glide = () => {
      const row = tierRef.current;
      if (!row || userTookOver) return;
      // A pending glide cut short by an effect re-run (e.g. StrictMode's double
      // fetch replacing `data`) must always be finished. Otherwise, a row that
      // already sits in the one slot under the bars stays put: the tierlist
      // keeps both bars pinned (nav.tsx), so there is a single correct landing
      // and anything else — near-top drift, deep in the panel, another tier —
      // glides to it.
      const nav = document.querySelector<HTMLElement>('[data-section="nav"]');
      const menu = document.querySelector<HTMLElement>('[data-section="menu"]');
      // The menu is display:none below lg, so its rect adds 0 there and the
      // header alone is the stack.
      const stack = (nav?.getBoundingClientRect().height ?? 0) + (menu?.getBoundingClientRect().height ?? 0);
      const from = window.scrollY;
      const rowDocTop = from + row.getBoundingClientRect().top;
      if (!glidePending && Math.abs(from - (rowDocTop - stack)) <= 6) {
        glidePending = false;
        return;
      }
      const target = Math.max(0, Math.round(rowDocTop - stack));
      if (Math.abs(from - target) <= 4) {
        glidePending = false;
        return;
      }
      glided = true;
      glideTo(target);
      timers.push(window.setTimeout(settle, 500));
    };
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(glide);
    });
    for (const delay of [900, 1700]) timers.push(window.setTimeout(settle, delay));
    window.addEventListener('wheel', markUser, { once: true, passive: true });
    window.addEventListener('touchmove', markUser, { once: true, passive: true });
    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
      cancelAnimationFrame(animRaf);
      timers.forEach((id) => clearTimeout(id));
      window.removeEventListener('wheel', markUser);
      window.removeEventListener('touchmove', markUser);
    };
  }, [openSlug, data]);

  useEffect(() => {
    if (!openSlug || !data || viewed.has(openSlug)) return;
    viewed.add(openSlug);
    fetch(`/api/comps/${openSlug}/view`, { method: 'POST' }).catch(() => {});
  }, [openSlug, data]);

  const comps = data?.comps ?? [];
  const styles = ['All', ...new Set(comps.map((comp) => comp.style))];
  const filtered = comps.filter(
    (comp) => comp.title.toLowerCase().includes(query.toLowerCase()) && (style === 'All' || comp.style === style)
  );
  // A variant group takes one slot on the board and the siblings never get
  // another: the comp that leads the group's tab strip holds the slot, and the
  // open comp's detail always hangs under that row — even when the open comp is
  // a sibling, so switching tabs does not jump to a different tier. Grouping
  // runs on what the board is showing, so a filter that drops the lead promotes
  // the best comp left in the group.
  const rows = variantRows(filtered);
  const shown = new Set(rows.filter((row) => row.lead).map((row) => row.comp.slug));
  const siblings = new Map(rows.map((row) => [row.comp.slug, row.siblings]));
  const slot = openSlug ? compVariants(filtered, openSlug)[0]?.slug ?? openSlug : '';

  return (
    <div className="flex flex-col gap-5">
      <div data-section="page-head" className="flex flex-wrap items-center justify-between gap-3">
        <TierTabs current="comps" lang={lang} />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.search}
            aria-label={t.search}
            className="smooth h-9 w-56 rounded-lg border border-line bg-panel px-4 text-sm text-fog placeholder:text-mist"
          />
          <select
            value={style}
            onChange={(event) => setStyle(event.target.value)}
            aria-label={t.style}
            className="smooth h-9 rounded-lg border border-line bg-panel px-3 text-sm font-semibold text-fog"
          >
            {styles.map((option) => (
              <option key={option} value={option}>{option === 'All' ? t.style : option}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as 'default' | 'popular')}
            aria-label={t.sort}
            className="smooth h-9 rounded-lg border border-line bg-panel px-3 text-sm font-semibold text-fog"
          >
            <option value="default">{t.sortDefault}</option>
            <option value="popular">{t.sortPopular}</option>
          </select>
          <button
            type="button"
            role="switch"
            aria-checked={showNames}
            title={t.showNames}
            onClick={toggleNames}
            className="smooth flex h-9 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-mist hover:border-brand hover:text-fog"
          >
            <span className={`relative h-4 w-7 rounded-full transition-colors ${showNames ? 'bg-brand' : 'bg-mist/40'}`}>
              <span className={`smooth absolute top-0.5 h-3 w-3 rounded-full bg-white ${showNames ? 'left-3.5' : 'left-0.5'}`} />
            </span>
            <span className="hidden whitespace-nowrap sm:inline">{t.showNames}</span>
          </button>
        </div>
      </div>
      {error ? (
        <p className="flex items-center justify-center gap-3 rounded-xl border border-line bg-panel p-8 text-center text-sm text-mist">
          {t.error} — {error}
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="smooth rounded-full border border-brand bg-brand px-4 py-1 text-xs font-semibold text-on-brand hover:bg-brand-deep"
          >
            {t.retry}
          </button>
        </p>
      ) : !data ? (
        <p className="rounded-xl border border-line bg-panel p-8 text-center text-sm text-mist">{t.loading}</p>
      ) : (
        <div data-section="tierlist" className="flex flex-col gap-4">
          {tierRank.map((tier) => {
            // Situational comps live in the X row no matter which band their
            // tier carries; the strong rows only hold comps that can be run.
            const tierComps = filtered.filter(
              (comp) =>
                shown.has(comp.slug) &&
                (tier === 'X' ? comp.situational || comp.tier === 'X' : comp.tier === tier && !comp.situational)
            );
            if (!tierComps.length) return null;
            // The detail belongs to the open comp but sits under the row that
            // holds the group's slot, which for a sibling is the lead's row.
            const openComp =
              openSlug && tierComps.some((comp) => comp.slug === slot)
                ? comps.find((comp) => comp.slug === openSlug)
                : undefined;
            return (
              <div key={tier} className="flex flex-col gap-4">
                <div ref={openComp ? tierRef : undefined} className="flex scroll-mt-16 flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4 lg:scroll-mt-12">
                  {/* Tier rows read as "S Tier / A Tier / ..." in both locales. */}
                  <TierChip tier={tier} label={`${tier} Tier`} />
                  <div className="relative flex-1 rounded-xl border p-3" style={{ borderColor: tierColor[tier] }}>
                    {tier === 'X' ? (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-panel px-4 py-0.5 text-xs font-semibold uppercase tracking-wide text-tier-x">
                        {t.situational}
                      </span>
                    ) : null}
                    <div className="flex flex-wrap gap-3">
                      {tierComps.map((comp) => (
                        <CompCluster
                          key={comp.slug}
                          comp={comp}
                          active={comp.slug === slot}
                          lang={lang}
                          showNames={showNames}
                          siblings={siblings.get(comp.slug) ?? 0}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                {/* The detail form lives below its tier row — outside the tier
                    container — and closes via ✕ or by picking another comp. */}
                {openComp && isFullComp(openComp) ? (
                  <div data-section="comp-detail" className="relative">
                    <CompPanel
                      comp={openComp}
                      lang={lang}
                      toolbar={
                        <DetailToolbar
                          comps={comps}
                          comp={openComp}
                          lang={lang}
                          onSelect={(slug) => (heldSlug = slug)}
                          onClose={() => router.push(`/${lang}/tierlist/comps`, { scroll: false })}
                        />
                      }
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
          {!filtered.length ? (
            <p className="rounded-xl border border-line bg-panel p-8 text-center text-sm text-mist">{t.noMatch}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

// One bar at the head of the detail's content column: the variant tabs, then
// share and close at its right end. Variants are full comp pages of their own,
// so the tabs stay plain links: back, forward and prefetch keep working and each
// tab carries its own tier. A comp with no siblings keeps its own tab so the bar
// never looks like a filter that dropped the row being read.
function DetailToolbar({
  comps,
  comp,
  lang,
  onSelect,
  onClose,
}: {
  comps: (ApiComp | CompSummary)[];
  comp: ApiComp;
  lang: Lang;
  onSelect: (slug: string) => void;
  onClose: () => void;
}) {
  const t = messages[lang].compPanel;
  const closeLabel = messages[lang].explorer.close;
  const tabs = compVariants(comps, comp.slug);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <div data-section="comp-toolbar" className="flex items-center gap-1.5 rounded-xl border border-line bg-panel p-1.5">
      <nav aria-label={t.variants} className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
        {(tabs.length ? tabs : [comp]).map((variant) => {
          const active = variant.slug === comp.slug;
          return (
            <Link
              key={variant.slug}
              href={`/${lang}/tierlist/comps/${variant.slug}`}
              scroll={false}
              onClick={() => onSelect(variant.slug)}
              aria-current={active ? 'page' : undefined}
              className={`smooth flex shrink-0 items-center gap-2 rounded-lg border px-2 py-1 ${active ? 'border-brand bg-util' : 'border-transparent hover:bg-util'}`}
            >
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded font-display text-[11px] font-bold leading-none"
                style={{ color: tierColor[variant.tier], background: `color-mix(in srgb, ${tierColor[variant.tier]} 20%, transparent)` }}
              >
                {variant.tier}
              </span>
              <UnitHex name={variant.carry.name} cost={variant.carry.cost} icon={variant.carry.icon} size={22} />
              <span className="whitespace-nowrap text-xs font-semibold text-fog">{variant.title}</span>
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? t.linkCopied : t.copyLink}
        title={t.copyLink}
        className="smooth flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-util text-fog hover:border-brand"
      >
        {copied ? (
          <span aria-hidden className="text-sm font-bold text-brand">{'\u2713'}</span>
        ) : (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        title={closeLabel}
        className="smooth flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand bg-brand text-sm font-bold text-on-brand hover:bg-brand-deep"
      >
        {'\u2715'}
      </button>
    </div>
  );
}

// Trend marker: a mini hexagon carrying two solid triangles, sized off the
// reference board — a 42x48 chip holds 16x11 triangles 3px apart, stacked a
// hair above centre, black at 0.92 for the leading one and 0.66 for the other.
// The corners are rounded by a same-colour stroke, and the alpha rides on the
// group instead of the paint so the overlap does not double-darken. The chip
// keeps a faint dark edge because it lands on champion art.
function TrendHex({ up, className = '' }: { up: boolean; className?: string }) {
  const shell = '6,0 12,3.464 12,10.392 6,13.856 0,10.392 0,3.464';
  // Measured outer box, pulled in by half the 0.9 stroke it is drawn with.
  const tri = (apex: number, base: number) => `6,${apex} 7.84,${base} 4.16,${base}`;
  const near = up ? tri(3.34, 5.61) : tri(9.66, 7.38);
  const far = up ? tri(7.38, 9.66) : tri(5.61, 3.34);
  const ink = (points: string, opacity: number) => (
    <g opacity={opacity}>
      <polygon points={points} fill="#000" stroke="#000" strokeWidth="0.9" strokeLinejoin="round" />
    </g>
  );
  return (
    <svg viewBox="0 0 12 13.856" aria-hidden className={`h-auto ${className}`}>
      <polygon
        points={shell}
        fill={up ? 'var(--color-tier-c)' : 'var(--color-tier-s)'}
        stroke="rgba(6,9,14,0.35)"
        strokeWidth="0.5"
      />
      {ink(far, 0.66)}
      {ink(near, 0.92)}
    </svg>
  );
}

// The band a situational comp really earns, pinned to the corner the trend
// marker would use — same hex shell, so the two read as one family. Only a
// situational comp with a band of its own gets it; a bare-X one already sits
// in its rail row.
function TierLetterHex({ tier, className = '' }: { tier: Tier; className?: string }) {
  return (
    <svg viewBox="0 0 12 13.856" aria-hidden className={`h-auto ${className}`}>
      <polygon
        points="6,0 12,3.464 12,10.392 6,13.856 0,10.392 0,3.464"
        fill={tierColor[tier]}
        stroke="rgba(6,9,14,0.5)"
        strokeWidth="0.5"
      />
      <text x="6" y="9.7" textAnchor="middle" fontSize="7" fontWeight="700" fill="#0a0f18">
        {tier}
      </text>
    </svg>
  );
}

function CompCluster({
  comp,
  active,
  lang,
  showNames,
  siblings,
}: {
  comp: ApiComp | CompSummary;
  active: boolean;
  lang: Lang;
  showNames: boolean;
  siblings: number;
}) {
  const t = messages[lang].explorer;
  const trend = comp.trend === 'up'
    ? { up: true, label: t.trendingUp }
    : comp.trend === 'down'
      ? { up: false, label: t.trendingDown }
      : null;
  // A situational comp shows its real band on the hex; the letter outranks the
  // trend marker for the top-left corner, so trend gives way when both exist.
  const band = comp.situational && comp.tier !== 'X' && comp.tier !== 'D' ? comp.tier : null;
  const bandLabel = band ? `${t.situational} · ${band}` : '';
  const cornerLabel = band ? bandLabel : trend?.label ?? '';
  const group = siblings ? ` — ${t.groupCount(siblings)}` : '';
  const aria = `${comp.title} (${comp.style})${cornerLabel ? ` — ${cornerLabel}` : ''}${group}`;
  // Avatar-only mode: just the carry hex with the trend pinned to its
  // top-left corner; the full row (name + style + units) is the default.
  if (!showNames) {
    return (
      <Link
        href={`/${lang}/tierlist/comps/${comp.slug}`}
        scroll={false}
        aria-label={aria}
        title={comp.title}
        className={`smooth block rounded-lg p-1.5 ${active ? 'bg-util ring-1 ring-brand' : 'hover:bg-util'}`}
      >
        {/* Smaller on phones so a tier still fits four carries per row under
            the now-larger tier bar; 64px from sm up. */}
        <span className="relative block w-12 sm:w-16" style={{ aspectRatio: '1 / 1.1547' }}>
          <UnitHex name={comp.carry.name} cost={comp.carry.cost} icon={comp.carry.icon} fill />
          {comp.cover ? (
            <span className="absolute inset-x-0 -bottom-1 z-20 mx-auto w-fit">
              <CoverBadge cover={comp.cover} size={24} frame={costOf(comp.carry.cost)} />
            </span>
          ) : null}
          {band || trend ? (
            // Straddles the hexagon's upper-left slant, the way the reference
            // boards place it; the cover badge keeps the bottom point.
            <span title={cornerLabel} className="absolute -left-1 -top-1 z-20">
              <span className="sr-only">{cornerLabel}</span>
              {band ? (
                <TierLetterHex tier={band} className="w-[18px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)] sm:w-6" />
              ) : trend ? (
                <TrendHex up={trend.up} className="w-[18px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)] sm:w-6" />
              ) : null}
            </span>
          ) : null}
        </span>
      </Link>
    );
  }
  return (
    <Link
      href={`/${lang}/tierlist/comps/${comp.slug}`}
      scroll={false}
      aria-label={aria}
      className={`flex items-center gap-3 rounded-lg p-2 ${active ? 'bg-util ring-1 ring-brand' : 'smooth hover:bg-util'}`}
    >
      <span className="relative shrink-0">
        <UnitHex name={comp.carry.name} cost={comp.carry.cost} icon={comp.carry.icon} size={52} />
        {band || trend ? (
          <span title={cornerLabel} className="absolute -left-1.5 -top-1.5 z-20">
            <span className="sr-only">{cornerLabel}</span>
            {band ? (
              <TierLetterHex tier={band} className="w-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]" />
            ) : trend ? (
              <TrendHex up={trend.up} className="w-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]" />
            ) : null}
          </span>
        ) : null}
        {comp.cover ? (
          <span className="absolute inset-x-0 -bottom-1 z-20 mx-auto w-fit">
            <CoverBadge cover={comp.cover} size={24} frame={costOf(comp.carry.cost)} />
          </span>
        ) : null}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-fog">{comp.title}</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-mist">
          {comp.style} · {t.units(isFullComp(comp) ? comp.units.length : comp.unitCount)}
        </span>
      </span>
    </Link>
  );
}
