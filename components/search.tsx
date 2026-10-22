'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Lang } from '@/lib/i18n';
import type { SearchKind, SearchResult } from '@/lib/search';

export type SearchLabels = {
  searchPlaceholder: string;
  searchAria: string;
  searchEmpty: string;
  searchLoading: string;
  searchKinds: Record<SearchKind, string>;
};

export function Search({ lang, labels }: { lang: Lang; labels: SearchLabels }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const value = query.trim();
    if (!value) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?lang=${lang}&q=${encodeURIComponent(value)}`, { signal: controller.signal });
        const data = await res.json();
        setResults(Array.isArray(data.results) ? data.results : []);
        setActive(0);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, lang]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const show = open && query.trim().length > 0;
  const groups = results.reduce<{ kind: SearchKind; items: SearchResult[] }[]>((acc, result) => {
    const group = acc.find((entry) => entry.kind === result.kind);
    if (group) group.items.push(result);
    else acc.push({ kind: result.kind, items: [result] });
    return acc;
  }, []);
  const ordered = groups.flatMap((group) => group.items);

  const choose = (result: SearchResult) => {
    setOpen(false);
    router.push(result.href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!show || !ordered.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (current + 1) % ordered.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (current - 1 + ordered.length) % ordered.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const result = ordered[active] ?? ordered[0];
      if (result) choose(result);
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-0 w-full max-w-md">
      <form
        role="search"
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          const result = ordered[active] ?? ordered[0];
          if (result) choose(result);
        }}
      >
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-mist">
          <svg viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m13 13 4 4" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchAria}
          aria-autocomplete="list"
          aria-expanded={show}
          aria-controls="site-search-results"
          aria-activedescendant={show && ordered[active] ? `search-option-${ordered[active].id}` : undefined}
          role="combobox"
          className="smooth h-9 w-full rounded-lg border border-line bg-panel pr-3 pl-9 text-sm text-fog placeholder:text-mist focus:border-brand-soft focus:outline-none"
        />
      </form>

      {show ? (
        <div
          id="site-search-results"
          role="listbox"
          aria-label={labels.searchAria}
          className="absolute top-full right-0 left-0 z-50 mt-2 max-h-[min(70vh,520px)] overflow-y-auto rounded-xl border border-line bg-panel py-1 shadow-2xl shadow-black/40"
        >
          {loading && !results.length ? (
            <p className="px-4 py-3 text-sm text-mist">{labels.searchLoading}</p>
          ) : groups.length ? (
            groups.map((group) => (
              <div key={group.kind} className="py-1">
                <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-mist">{labels.searchKinds[group.kind]}</p>
                {group.items.map((result) => {
                  const index = ordered.indexOf(result);
                  return (
                    <Link
                      key={result.id}
                      id={`search-option-${result.id}`}
                      href={result.href}
                      role="option"
                      aria-selected={index === active}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => setOpen(false)}
                      className={`smooth flex items-center gap-3 px-3 py-2 ${index === active ? 'bg-util text-brand-soft' : 'text-fog hover:bg-util'}`}
                    >
                      {result.icon ? (
                        <img src={result.icon} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-md object-cover" />
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-util text-xs font-bold text-mist">
                          {result.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{result.name}</span>
                        {result.subtitle ? <span className="block truncate text-xs text-mist">{result.subtitle}</span> : null}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))
          ) : (
            <p className="px-4 py-3 text-sm text-mist">{labels.searchEmpty}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
