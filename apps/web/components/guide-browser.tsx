'use client';

import { useState } from 'react';
import Link from 'next/link';
import { guideTag } from '@/lib/data';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { GuideCover } from './guide-cover';
import { Chip, CtaLink } from './ui';

// The fields the hub draws. Article bodies stay on the article route so they are
// not serialised into every list view.
export type GuideCard = {
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  date: string;
  tags: string[];
  featured: boolean;
};

export function GuideBrowser({ lang, tags, guides }: { lang: Lang; tags: string[]; guides: GuideCard[] }) {
  const t = messages[lang].guides;
  const [active, setActive] = useState('');
  const listed = active ? guides.filter((guide) => guide.tags.includes(active)) : guides;
  const featured = listed.find((guide) => guide.featured) ?? listed[0];
  const rest = listed.filter((guide) => guide.slug !== featured?.slug);
  const chipClass = (selected: string) =>
    `smooth rounded-full border px-4 py-1.5 text-xs font-semibold ${selected === active ? 'border-brand bg-brand text-on-brand' : 'border-line bg-panel text-mist hover:border-brand'}`;

  return (
    <div className="flex flex-col gap-8">
      <section data-section="guide-hero" className="grid gap-4 rounded-xl border border-line bg-panel p-5 md:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col items-start justify-center gap-3">
          <div className="flex gap-2">
            {featured.tags.map((tag) => <Chip key={tag}>{guideTag(tag, lang)}</Chip>)}
          </div>
          <h2 className="font-display text-3xl leading-tight font-bold tracking-tight text-fog md:text-4xl">{featured.title}</h2>
          <p className="text-sm leading-relaxed text-mist">{featured.excerpt}</p>
          <p className="text-xs font-semibold text-mist">{featured.author} &middot; {featured.date}</p>
          <CtaLink href={`/${lang}/guides/${featured.slug}`}>{t.readTheGuide}</CtaLink>
        </div>
        <GuideCover tag={featured.tags.at(-1) ?? ''} lang={lang} index={guides.indexOf(featured) + 1} hero />
      </section>

      <div data-section="guide-list" className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setActive('')} className={chipClass('')} aria-pressed={active === ''}>
            {t.all}
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActive(active === tag ? '' : tag)}
              className={chipClass(tag)}
              aria-pressed={active === tag}
            >
              {guideTag(tag, lang)}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((guide) => (
            <Link key={guide.slug} href={`/${lang}/guides/${guide.slug}`} className="group flex flex-col overflow-hidden rounded-xl border border-line bg-panel">
              <GuideCover tag={guide.tags.at(-1) ?? ''} lang={lang} index={guides.indexOf(guide) + 1} />
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex gap-1.5">
                  {guide.tags.map((tag) => <Chip key={tag}>{guideTag(tag, lang)}</Chip>)}
                </div>
                <h3 className="font-display text-lg leading-snug font-semibold text-fog">{guide.title}</h3>
                <p className="text-sm leading-relaxed text-mist">{guide.excerpt}</p>
                <p className="mt-auto text-xs font-semibold text-mist">{guide.author} &middot; {guide.date}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
