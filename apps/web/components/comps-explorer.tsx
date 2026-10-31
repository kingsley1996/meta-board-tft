'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchComps, type ApiComp, type CompSummary, type CompsInitial, type CompsResponse } from '@/lib/api';
import { tierRank } from '@/lib/tiers';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { tierColor, TierChip, TierTabs, UnitHex } from './ui';
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
  // Tier rows default to avatar-only; the names view is opt-in and sticky
  // across sessions.
  const [showNames, setShowNames] = useState(false);
  const router = useRouter();
  const tierRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (localStorage.getItem('comps-show-names') === '1') setShowNames(true);
  }, []);

  useEffect(() => {
    localStorage.setItem('comps-show-names', showNames ? '1' : '0');
  }, [showNames]);

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
  // target accounts for the sticky stack's FINAL state (the top header
  // hides scrolling down past 80px and reappears going up — nav.tsx),
  // landing the tier row right under the bars on the first try. Settle
  // checks clean up late layout shifts; everything cancels as soon as
  // the user scrolls on their own.
  useScrollEffect(() => {
    if (!openSlug || !data) return;
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
      // A pending glide cut short by an effect re-run must always be
      // finished. Otherwise, seated in either valid slot → stay put:
      // this is the same-tier pick while the tier sits at the top. Both
      // slots are legitimate (the header hides or shows depending on the
      // last scroll direction), and checking them by position avoids the
      // 1px coin flip in the goingDown prediction that used to send the
      // page on a 64px round trip. Anything not seated — near-top drift,
      // deep in the panel, another tier — glides to the exact slot.
      const nav = document.querySelector<HTMLElement>('[data-section="nav"]');
      const menu = document.querySelector<HTMLElement>('[data-section="menu"]');
      const navH = nav?.getBoundingClientRect().height ?? 0;
      const menuH = menu?.getBoundingClientRect().height ?? 0;
      const desktop = window.matchMedia('(min-width: 1024px)').matches;
      const from = window.scrollY;
      const rowDocTop = from + row.getBoundingClientRect().top;
      const seated = !desktop
        ? Math.abs(from - (rowDocTop - navH)) <= 6
        : Math.abs(from - (rowDocTop - menuH)) <= 6 || Math.abs(from - (rowDocTop - navH - menuH)) <= 6;
      if (!glidePending && seated) {
        glidePending = false;
        return;
      }
      let stack: number;
      if (!desktop) {
        stack = navH;
      } else {
        // Going down past 80px ends with the header hidden (menu only);
        // going up — or landing near the top — ends with it visible.
        const goingDown = rowDocTop - menuH > from;
        const finalY = Math.max(0, rowDocTop - (goingDown ? menuH : navH + menuH));
        stack = finalY >= 80 && goingDown ? menuH : navH + menuH;
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
            onClick={() => setShowNames((value) => !value)}
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
            const tierComps = filtered.filter((comp) => comp.tier === tier);
            if (!tierComps.length) return null;
            const openComp = openSlug ? tierComps.find((comp) => comp.slug === openSlug) : undefined;
            return (
              <div key={tier} className="flex flex-col gap-4">
                <div ref={openComp ? tierRef : undefined} className="flex scroll-mt-16 flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4 lg:scroll-mt-12">
                  {/* Tier rows read as "S Tier / A Tier / ..." in both locales. */}
                  <TierChip tier={tier} label={`${tier} Tier`} stacked />
                  <div className="relative flex-1 rounded-xl border p-3" style={{ borderColor: tierColor[tier] }}>
                    {tier === 'X' ? (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-panel px-4 py-0.5 text-xs font-semibold uppercase tracking-wide text-tier-x">
                        {t.situational}
                      </span>
                    ) : null}
                    <div className="flex flex-wrap gap-3">
                      {tierComps.map((comp) => (
                        <CompCluster key={comp.slug} comp={comp} active={comp.slug === openSlug} lang={lang} showNames={showNames} />
                      ))}
                    </div>
                  </div>
                </div>
                {/* The detail form lives below its tier row — outside the tier
                    container — and closes via ✕ or by picking another comp. */}
                {openComp && isFullComp(openComp) ? (
                  <div data-section="comp-detail" className="relative">
                    <button
                      type="button"
                      onClick={() => router.push(`/${lang}/tierlist/comps`, { scroll: false })}
                      aria-label={t.close}
                      title={t.close}
                      className="smooth absolute -right-3 -top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-brand bg-brand text-sm font-bold text-on-brand shadow-lg hover:bg-brand-deep"
                    >
                      {'\u2715'}
                    </button>
                    <CompPanel comp={openComp} lang={lang} />
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

function CompCluster({ comp, active, lang, showNames }: { comp: ApiComp | CompSummary; active: boolean; lang: Lang; showNames: boolean }) {
  const t = messages[lang].explorer;
  const trend = comp.trend === 'up'
    ? { glyph: '\u25B2', label: t.trendingUp, color: 'text-tier-c', tri: 'border-x-[7px] border-b-[10px] border-x-transparent border-b-tier-c' }
    : comp.trend === 'down'
      ? { glyph: '\u25BC', label: t.trendingDown, color: 'text-tier-s', tri: 'border-x-[7px] border-t-[10px] border-x-transparent border-t-tier-s' }
      : null;
  const aria = `${comp.title} (${comp.style})${trend ? ` — ${trend.label}` : ''}`;
  // Avatar-only mode: just the carry hex with the trend pinned to its
  // top-left corner; the full row (name + style + units) stays opt-in.
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
          {trend ? (
            // Solid corner triangle like the reference tier lists: green
            // points up, red points down, no badge background.
            <span title={trend.label} className={`absolute -left-1 -top-1.5 z-20 h-0 w-0 ${trend.tri}`}>
              <span className="sr-only">{trend.label}</span>
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
      <UnitHex name={comp.carry.name} cost={comp.carry.cost} icon={comp.carry.icon} size={52} />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-fog">{comp.title}</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-mist">
          {comp.style} · {t.units(isFullComp(comp) ? comp.units.length : comp.unitCount)}
        </span>
      </span>
      {trend ? (
        <span title={trend.label} className={`ml-1 text-sm font-bold ${trend.color}`}>
          {trend.glyph}
          <span className="sr-only">{trend.label}</span>
        </span>
      ) : null}
    </Link>
  );
}
