'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { LangSwitch } from './lang-switch';
import { Search } from './search';

export function Nav({ lang, patch }: { lang: Lang; patch: string }) {
  const t = messages[lang].nav;
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
  const links = [
    { label: t.guides, href: `/${lang}/guides` },
    { label: t.media, href: `/${lang}/media` },
  ];

  return (
    <>
      <header
        ref={headerRef}
        data-section="nav"
        inert={hidden || undefined}
        className={`sticky top-0 z-50 border-b border-line bg-page/95 backdrop-blur transition-transform duration-200 ${hidden ? 'lg:-translate-y-full' : ''}`}
      >
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center gap-3 px-6">
          <Link href={`/${lang}`} className="flex shrink-0 items-center gap-2.5" aria-label={t.homeAria}>
            <span className="hex flex h-9 w-9 items-center justify-center bg-brand">
              <span className="hex flex h-full w-full items-center justify-center bg-panel font-display text-base font-bold text-brand-soft">M</span>
            </span>
            <span className="hidden font-display text-2xl font-bold tracking-tight text-fog sm:inline">MetaBoard</span>
          </Link>
          <div className="flex min-w-0 flex-1 justify-center">
            <Search lang={lang} labels={t} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden items-center rounded-md border border-brand/40 bg-brand/10 px-3.5 py-1.5 text-sm font-semibold text-brand-soft lg:inline-flex">
              {t.patch} <span className="ml-1 text-fog">{patch}</span>
            </span>
            <div className="hidden lg:block">
              <LangSwitch lang={lang} />
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={t.menuAria}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className="smooth flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel text-fog hover:border-brand-soft lg:hidden"
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
                      className="smooth block rounded-md px-2 py-2 text-sm font-semibold text-fog hover:bg-util hover:text-brand-soft"
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
                    className="smooth rounded-md bg-util px-3 py-2 text-sm font-semibold text-fog hover:text-brand-soft"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line/70 pt-3" onClick={() => setMenuOpen(false)}>
                <span className="inline-flex items-center rounded-md border border-brand/40 bg-brand/10 px-3.5 py-1.5 text-sm font-semibold text-brand-soft">
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
                <button type="button" className="smooth flex items-center gap-1 rounded-md px-3 py-2 text-sm font-semibold text-fog group-hover:text-brand-soft">
                  {dropdown.label}
                  <span className="text-[10px] text-mist">{'\u25BE'}</span>
                </button>
                <div className={`invisible absolute top-full left-1/2 z-50 -translate-x-1/2 origin-top scale-95 opacity-0 transition-all duration-150 ${dismissedDropdown === dropdown.label ? '' : 'group-hover:visible group-hover:scale-100 group-hover:opacity-100 group-focus-within:visible group-focus-within:scale-100 group-focus-within:opacity-100'}`}>
                  <div className="mt-1 flex w-44 flex-col overflow-hidden rounded-lg border border-line bg-panel py-1">
                    {dropdown.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setDismissedDropdown(dropdown.label)}
                        className="smooth px-4 py-2 text-sm text-mist hover:bg-util hover:text-brand-soft"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="smooth rounded-md px-3 py-2 text-sm font-semibold text-fog hover:text-brand-soft">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}
