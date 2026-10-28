'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { AuthNav } from './auth/auth-nav';
import { LangSwitch } from './lang-switch';
import { Search } from './search';

export function Nav({ lang, patch }: { lang: Lang; patch: string }) {
  const t = messages[lang].nav;
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dismissedDropdown, setDismissedDropdown] = useState<string | null>(null);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (!desktop.matches || y < 80) setHidden(false);
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
  }, []);

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

  const dropdowns = [
    {
      label: t.comps,
      items: [
        { label: t.compRankings, href: `/${lang}/tierlist/comps` },
        { label: t.itemRankings, href: `/${lang}/tierlist/items` },
        { label: t.augmentRankings, href: `/${lang}/tierlist/augments` },
      ],
    },
    {
      label: t.database,
      items: [
        { label: t.champions, href: `/${lang}/champions` },
        { label: t.items, href: `/${lang}/items` },
        { label: t.augments, href: `/${lang}/augments` },
        { label: t.wisps, href: `/${lang}/wisps` },
        { label: t.tables, href: `/${lang}/tables` },
        { label: t.economy, href: `/${lang}/economy` },
      ],
    },
    {
      label: t.tools,
      items: [
        { label: t.builder, href: `/${lang}/builder` },
        { label: t.assistant, href: `/${lang}/assistant` },
        { label: t.tierMaker, href: `/${lang}/tier-maker` },
        { label: t.quiz, href: `/${lang}/quiz` },
      ],
    },
  ];
  // Media is reachable but not advertised: the page is videos, which is not a
  // reason to spend a top-level slot on it.
  const links = [{ label: t.guides, href: `/${lang}/guides` }];

  // Section stays active on its detail pages too, e.g. /champions/ahri.
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const isCurrent = (href: string) => pathname === href;
  const groupActive = (items: { href: string }[]) => items.some((item) => isActive(item.href));

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
            {/* The same mark as app/icon.svg, cropped to its own box: a board cell
                with the M cut out of it. Token colours, so a palette change
                reaches the favicon and this pixel-for-pixel the same way. */}
            <svg aria-hidden="true" viewBox="6.89 3 50.22 58" className="h-9 w-[31.2px] shrink-0">
              <polygon className="fill-brand" points="32,3 57.11,17.5 57.11,46.5 32,61 6.89,46.5 6.89,17.5" />
              <path className="stroke-on-brand" d="M21.2 43.25 L21.2 20.75 L32 33.35 L42.8 20.75 L42.8 43.25" fill="none" strokeWidth={8.4} />
            </svg>
            <span className="hidden font-display text-2xl font-bold tracking-tight text-fog sm:inline">MetaBoard</span>
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
                  {dropdown.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={isCurrent(item.href) ? 'page' : undefined}
                      className={`smooth block rounded-md px-2 py-2 text-sm font-semibold hover:bg-util hover:text-brand ${
                        isActive(item.href) ? 'bg-util text-brand' : 'text-fog'
                      }`}
                    >
                      {item.label}
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
                    groupActive(dropdown.items) ? 'bg-util text-brand' : 'text-fog'
                  }`}
                >
                  {dropdown.label}
                  <span className="text-[10px] text-mist">{'\u25BE'}</span>
                </button>
                <div className={`invisible absolute top-full left-1/2 z-50 -translate-x-1/2 origin-top scale-95 opacity-0 transition-all duration-150 ${dismissedDropdown === dropdown.label ? '' : 'group-hover:visible group-hover:scale-100 group-hover:opacity-100 group-focus-within:visible group-focus-within:scale-100 group-focus-within:opacity-100'}`}>
                  <div className="mt-1 flex w-44 flex-col overflow-hidden rounded-lg border border-line bg-panel py-1">
                    {dropdown.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={(event) => {
                          setDismissedDropdown(dropdown.label);
                          // Safari/Firefox focus a clicked link. If that focus
                          // stays inside the group, clearing the dismissal on
                          // mouseleave lets group-focus-within reopen the menu.
                          event.currentTarget.blur();
                        }}
                        aria-current={isCurrent(item.href) ? 'page' : undefined}
                        className={`smooth px-4 py-2 text-sm hover:bg-util hover:text-brand ${
                          isActive(item.href) ? 'bg-util text-brand' : 'text-mist'
                        }`}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
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
