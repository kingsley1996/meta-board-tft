'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { nameBySlug } from '@/lib/data';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

// Segments that group routes but have no page of their own, so they render as text.
const PREFIX_ONLY = new Set(['tierlist', 'learn', 'legal']);
const SMALL_WORDS = new Set(['of', 'the', 'and', 'or', 'in', 'on', 'to']);

function humanize(segment: string): string {
  return decodeURIComponent(segment)
    .split('-')
    .map((word, index) =>
      index > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(' ');
}

export function Breadcrumbs({ lang }: { lang: Lang }) {
  const pathname = usePathname();
  const t = messages[lang];
  const labels: Record<string, string> = {
    tierlist: t.breadcrumb.tierList,
    learn: t.breadcrumb.learn,
    legal: t.breadcrumb.legal,
    about: t.footer.about,
    privacy: t.footer.privacy,
    terms: t.footer.terms,
    champions: t.nav.champions,
    items: t.nav.items,
    augments: t.nav.augments,
    traits: t.traits.title,
    guides: t.nav.guides,
    media: t.nav.media,
    tables: t.nav.tables,
    wisps: t.nav.wisps,
    economy: t.nav.economy,
    comps: t.nav.comps,
    builder: t.nav.builder,
    assistant: t.nav.assistant,
    quiz: t.nav.quiz,
    'tier-maker': t.nav.tierMaker,
    'gold-income': t.tables.incomeTitle,
  };

  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === lang) segments.shift();
  // One segment is a top-level section; breadcrumbs only help once there is a sub item.
  if (segments.length < 2) return null;

  return (
    <nav aria-label={t.breadcrumb.aria} className="flex flex-wrap items-center gap-1.5 py-3 text-xs text-mist">
      <Link href={`/${lang}`} className="smooth inline-flex min-h-6 items-center font-semibold hover:text-fog">
        {t.breadcrumb.home}
      </Link>
      {segments.map((segment, index) => {
        const last = index === segments.length - 1;
        const href = `/${lang}/${segments.slice(0, index + 1).join('/')}`;
        const label = labels[segment] ?? nameBySlug[segment]?.[lang] ?? humanize(segment);
        return (
          <Fragment key={href}>
            <span aria-hidden className="text-mist/50">
              /
            </span>
            {last || PREFIX_ONLY.has(segment) ? (
              <span aria-current={last ? 'page' : undefined} className={last ? 'font-semibold text-fog' : undefined}>
                {label}
              </span>
            ) : (
              <Link href={href} className="smooth inline-flex min-h-6 items-center font-semibold hover:text-fog">
                {label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
