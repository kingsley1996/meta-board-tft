import type { Metadata } from 'next';
import Link from 'next/link';
import { Chip, CtaLink } from '@/components/ui';
import type { GuidesResponse } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import { guideTag } from '@/lib/data';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.guides.title, description: messages[lang].meta.guides.description };
}

const tags = ['Fundamentals', 'Economy', 'Items', 'Positioning', 'Augments', 'Meta'];

export default async function GuidesPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = messages[lang].guides;
  const data = await backendJson<GuidesResponse>(`/api/guides?lang=${lang}`);
  if (!data) throw new Error('backend is unreachable');
  const guides = data.guides;
  if (!guides.length) throw new Error('no guides in the store');
  const featured = guides.find((guide) => guide.featured) ?? guides[0];
  const rest = guides.filter((guide) => guide.slug !== featured.slug);

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
        <div className="relative min-h-[200px] overflow-hidden rounded-lg border border-line bg-gradient-to-br from-brand/25 via-panel to-panel">
          <span className="hex absolute top-8 left-10 h-28 w-24 rotate-12 bg-fog/5" />
          <span className="hex absolute right-10 bottom-6 h-36 w-32 -rotate-6 bg-brand/20" />
          <span className="absolute bottom-4 left-4 font-display text-4xl font-bold uppercase tracking-tight text-fog/80">{guideTag(featured.tags.at(-1) ?? '', lang)}</span>
        </div>
      </section>

      <div data-section="guide-list" className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-brand-hot bg-brand-hot px-4 py-1.5 text-xs font-semibold text-white">{t.all}</span>
          {tags.map((tag) => (
            <span key={tag} className="rounded-full border border-line bg-panel px-4 py-1.5 text-xs font-semibold text-mist">
              {guideTag(tag, lang)}
            </span>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((guide) => (
            <Link key={guide.slug} href={`/${lang}/guides/${guide.slug}`} className="group flex flex-col overflow-hidden rounded-xl border border-line bg-panel">
              <div className="relative h-32 bg-gradient-to-br from-util via-panel to-panel">
                <span className="hex absolute top-6 left-6 h-20 w-16 bg-fog/5 transition-transform group-hover:scale-110" />
              </div>
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
