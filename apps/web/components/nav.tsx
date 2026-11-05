'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { AuthNav } from './auth/auth-nav';
import { LangSwitch } from './lang-switch';
import { NavIcon, type NavIconName } from './nav-icons';
import { Search } from './search';

type NavEntry = { label: string; href: string; icon?: NavIconName };
type NavGroup = { label: string; columns: NavEntry[][] };

export function Nav({ lang, patch }: { lang: Lang; patch: string }) {
  const t = messages[lang].nav;
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dismissedDropdown, setDismissedDropdown] = useState<string | null>(null);
  // Tierlist screens (list, comp detail, item/augment boards) keep the search
  // row pinned; the reader is scrolling between tiers, not trying to gain rows.
  const pinned = pathname.startsWith(`/${lang}/tierlist`);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      // The tierlist is browsed by searching and hopping between tiers, so its
      // two bars stay stacked; everywhere else the search row gives the rows
      // back to the content on a downward scroll.
      if (!desktop.matches || pinned || y < 80) setHidden(false);
      else if (y > lastY + 6) setHidden(true);
      else if (y < lastY - 6) setHidden(false);
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [pinned]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const dropdowns: NavGroup[] = [
    {
      label: t.comps,
      columns: [
        [
          { label: t.compRankings, href: `/${lang}/tierlist/comps` },
          { label: t.compMap, href: `/${lang}/tierlist/map` },
          { label: t.itemRankings, href: `/${lang}/tierlist/items` },
          { label: t.augmentRankings, href: `/${lang}/tierlist/augments` },
        ],
      ],
    },
    {
      // One season, both halves: the entities Riot shipped, then the pages that read them.
      label: t.set(patch.split('.')[0]),
      columns: [
        [
          { label: t.champions, href: `/${lang}/champions`, icon: 'champion' },
          { label: t.items, href: `/${lang}/items`, icon: 'item' },
          { label: t.traits, href: `/${lang}/traits`, icon: 'trait' },
          { label: t.augments, href: `/${lang}/augments`, icon: 'augment' },
          { label: t.wisps, href: `/${lang}/wisps`, icon: 'wisp' },
          { label: t.encounters, href: `/${lang}/encounters`, icon: 'encounter' },
        ],
        [
          { label: t.patches, href: `/${lang}/patches`, icon: 'patch' },
          { label: t.tables, href: `/${lang}/tables`, icon: 'tables' },
          { label: t.economy, href: `/${lang}/economy`, icon: 'economy' },
        ],
      ],
    },
    {
      label: t.tools,
      columns: [
        [
          { label: t.builder, href: `/${lang}/builder` },
          { label: t.assistant, href: `/${lang}/assistant` },
          { label: t.tierMaker, href: `/${lang}/tier-maker` },
          { label: t.quiz, href: `/${lang}/quiz` },
          { label: t.itemPriority, href: `/${lang}/item-priority` },
          { label: t.temple, href: `/${lang}/temple` },
        ],
      ],
    },
  ];
  // Media is reachable but not advertised: the page is videos, which is not a
  // reason to spend a top-level slot on it.
  const links = [
    { label: t.guides, href: `/${lang}/guides` },
    { label: t.membership, href: `/${lang}/membership` },
  ];

  // Section stays active on its detail pages too, e.g. /champions/ahri.
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const isCurrent = (href: string) => pathname === href;
  const groupActive = (group: NavGroup) => group.columns.some((column) => column.some((entry) => isActive(entry.href)));

  const glyph = (entry: NavEntry, active: boolean) =>
    entry.icon ? (
      <span
        className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] border transition-colors ${
          active
            ? 'border-brand/50 bg-brand/15 text-brand'
            : 'border-line bg-page group-hover/item:border-brand/50 group-hover/item:text-brand'
        }`}
      >
        <NavIcon name={entry.icon} />
      </span>
    ) : null;

  const dismiss = (group: string) => (event: { currentTarget: HTMLAnchorElement }) => {
    setDismissedDropdown(group);
    // Safari/Firefox focus a clicked link. If that focus stays inside the group,
    // clearing the dismissal on mouseleave lets group-focus-within reopen the menu.
    event.currentTarget.blur();
  };

  // One row style for every dropdown: a single-column panel reads as the wide one, just shorter.
  const navRow = (entry: NavEntry, group: string) => (
    <Link
      key={entry.label}
      href={entry.href}
      onClick={dismiss(group)}
      aria-current={isCurrent(entry.href) ? 'page' : undefined}
      className={`smooth group/item flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-semibold hover:bg-util hover:text-brand ${
        isActive(entry.href) ? 'bg-util text-brand' : 'text-fog'
      }`}
    >
      {glyph(entry, isActive(entry.href))}
      <span className="min-w-0 flex-1">{entry.label}</span>
    </Link>
  );

  return (
    <>
      <header
        ref={headerRef}
        data-section="nav"
        inert={hidden || undefined}
        className={`sticky top-0 z-50 border-b border-line bg-page/95 backdrop-blur transition-transform duration-200 ${hidden ? 'lg:-translate-y-full' : ''}`}
      >
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center gap-3 px-6">
          <Link href={`/${lang}`} data-section="brand" className="flex shrink-0 items-center gap-2.5" aria-label={t.homeAria}>
            {/* The same mark as app/icon.svg, cropped to its own box. */}
            <svg aria-hidden="true" viewBox="6.7 2.9 51.4 58.2" className="h-9 w-[31.8px] shrink-0">
              <defs>
                <linearGradient id="nav-tftiq" gradientUnits="userSpaceOnUse" x1="6" y1="2" x2="46" y2="63">
                  <stop offset="0" stopColor="#FA7F30" />
                  <stop offset="0.42" stopColor="#EA4F21" />
                  <stop offset="1" stopColor="#B32C0C" />
                </linearGradient>
                <mask id="nav-tftiq-notch" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
                  <rect width="64" height="64" fill="#fff" />
                  <path d="M50.9 41.7 L58 45.8 L58 54 L50.9 58.1 L43.8 54 L43.8 45.8 Z" fill="#000" />
                </mask>
              </defs>
              <g fill="url(#nav-tftiq)" mask="url(#nav-tftiq-notch)">
                <path fillRule="evenodd" d="M32 3 L57.11 17.5 L57.11 46.5 L32 61 L6.89 46.5 L6.89 17.5 Z M32 10.5 L50.62 21.25 L50.62 42.75 L32 53.5 L13.38 42.75 L13.38 21.25 Z" />
                <path d="M16.5 35 L32 20.5 L47.5 35 L47.5 43.5 L32 29 L16.5 43.5 Z" />
                <path d="M28 27.5 L36 27.5 L36 51.5 L28 51.5 Z" />
              </g>
              <path d="M50.9 43.1 L56.79 46.5 L56.79 53.3 L50.9 56.7 L45.01 53.3 L45.01 46.5 Z" fill="url(#nav-tftiq)" />
            </svg>
            <span className="hidden font-display text-2xl font-bold tracking-tight text-fog sm:inline">
              TFT<span className="text-brand">IQ</span>
            </span>
          </Link>
          <div className="flex min-w-0 flex-1 justify-center">
            <Search lang={lang} labels={t} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden items-center rounded-md border border-brand/40 bg-brand/10 px-3.5 py-1.5 text-sm font-semibold text-brand lg:inline-flex">
              {t.patch} <span className="ml-1 text-fog">{patch}</span>
            </span>
            <div className="hidden lg:block">
              <AuthNav lang={lang} variant="desktop" />
            </div>
            <div className="hidden lg:block">
              <LangSwitch lang={lang} />
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={t.menuAria}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className="smooth flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel text-fog hover:border-brand lg:hidden"
            >
              <svg viewBox="0 0 20 20" aria-hidden className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
                {menuOpen ? (
                  <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
                ) : (
                  <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
        </div>
        {menuOpen ? (
          <div
            id="mobile-menu"
            className="absolute top-full right-0 left-0 max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-b border-line bg-page shadow-2xl shadow-black/40 lg:hidden"
          >
            <nav className="mx-auto flex w-full max-w-[1280px] flex-col px-6 py-3" aria-label={t.mainAria}>
              {dropdowns.map((dropdown) => (
                <div key={dropdown.label} className="border-b border-line/70 py-2">
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-mist">{dropdown.label}</p>
                  {dropdown.columns.flat().map((entry) => (
                    <Link
                      key={entry.label}
                      href={entry.href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={isCurrent(entry.href) ? 'page' : undefined}
                      className={`smooth block rounded-md px-2 py-2 text-sm font-semibold hover:bg-util hover:text-brand ${
                        isActive(entry.href) ? 'bg-util text-brand' : 'text-fog'
                      }`}
                    >
                      {entry.label}
                    </Link>
                  ))}
                </div>
              ))}
              <div className="flex flex-wrap gap-2 py-3">
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={isCurrent(link.href) ? 'page' : undefined}
                    className={`smooth rounded-md bg-util px-3 py-2 text-sm font-semibold hover:text-brand ${
                      isActive(link.href) ? 'text-brand' : 'text-fog'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line/70 pt-3" onClick={() => setMenuOpen(false)}>
                <AuthNav lang={lang} variant="mobile" />
                <span className="inline-flex items-center rounded-md border border-brand/40 bg-brand/10 px-3.5 py-1.5 text-sm font-semibold text-brand">
                  {t.patch} <span className="ml-1 text-fog">{patch}</span>
                </span>
                <LangSwitch lang={lang} />
              </div>
            </nav>
          </div>
        ) : null}
      </header>
      <div
        data-section="menu"
        className={`sticky top-0 z-40 hidden border-b border-line bg-page/95 backdrop-blur transition-[top] duration-200 lg:block ${hidden ? 'lg:top-0' : 'lg:top-16'}`}
      >
        <div className="mx-auto flex h-12 w-full max-w-[1280px] items-center gap-3 px-6">
          <nav className="flex items-center gap-2" aria-label={t.mainAria}>
            {dropdowns.map((dropdown) => (
              <div
                key={dropdown.label}
                className="group relative"
                onMouseEnter={() => {
                  if (dismissedDropdown === dropdown.label) setDismissedDropdown(null);
                }}
                onMouseLeave={() => {
                  if (dismissedDropdown === dropdown.label) setDismissedDropdown(null);
                }}
              >
                <button
                  type="button"
                  className={`smooth flex items-center gap-1 rounded-md px-3 py-2 text-sm font-semibold group-hover:text-brand ${
                    groupActive(dropdown) ? 'bg-util text-brand' : 'text-fog'
                  }`}
                >
                  {dropdown.label}
                  <span className="text-[10px] text-mist">{'\u25BE'}</span>
                </button>
                <div className={`invisible absolute top-full z-50 origin-top scale-95 opacity-0 transition-all duration-150 ${
                  // A 470px panel cannot sit centred under a button that is 100px from the
                  // left edge; it would hang off the screen. Wide panels grow rightwards.
                  dropdown.columns.length > 1 ? 'left-0' : 'left-1/2 -translate-x-1/2'
                } ${dismissedDropdown === dropdown.label ? '' : 'group-hover:visible group-hover:scale-100 group-hover:opacity-100 group-focus-within:visible group-focus-within:scale-100 group-focus-within:opacity-100'}`}>
                  {dropdown.columns.length > 1 ? (
                    <div className="mt-1 grid w-[470px] grid-cols-2 divide-x divide-line rounded-lg border border-line bg-panel p-1.5 shadow-2xl shadow-black/40">
                      {dropdown.columns.map((column) => (
                        <div key={column[0].label} className="flex flex-col gap-0.5">
                          {column.map((entry) => navRow(entry, dropdown.label))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1 flex w-60 flex-col gap-0.5 rounded-lg border border-line bg-panel p-1.5 shadow-2xl shadow-black/40">
                      {dropdown.columns[0].map((entry) => navRow(entry, dropdown.label))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isCurrent(link.href) ? 'page' : undefined}
                className={`smooth rounded-md px-3 py-2 text-sm font-semibold hover:text-brand ${
                  isActive(link.href) ? 'bg-util text-brand' : 'text-fog'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={`/${lang}/assistant`}
              aria-current={isCurrent(`/${lang}/assistant`) ? 'page' : undefined}
              className={`smooth ml-auto inline-flex items-center gap-2 rounded-lg border px-4 py-1.5 text-sm font-bold ${
                isActive(`/${lang}/assistant`)
                  ? 'border-brand bg-brand/25 text-brand'
                  : 'border-brand/50 bg-brand/15 text-brand hover:border-brand hover:bg-brand/25'
              }`}
            >
              <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 fill-none stroke-current stroke-[1.7]">
                <path strokeLinecap="round" strokeLinejoin="round" d="m10 2 1.5 4.5L16 8l-4.5 1.5L10 14l-1.5-4.5L4 8l4.5-1.5L10 2Z" />
                <path strokeLinecap="round" d="m16 13 .8 1.7 1.7.8-1.7.8L16 18l-.8-1.7-1.7-.8 1.7-.8L16 13Z" />
              </svg>
              {t.assistant}
            </Link>
          </nav>
        </div>
      </div>
    </>
  );
}
