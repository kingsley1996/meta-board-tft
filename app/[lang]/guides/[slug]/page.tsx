import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Chip } from '@/components/ui';
import { guides } from '@/lib/data';
import { locales, type Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export function generateStaticParams() {
  return locales.flatMap((lang) => guides.map((guide) => ({ lang, slug: guide.slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang; slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = guides.find((candidate) => candidate.slug === slug);
  if (!guide) return {};
  return { title: guide.title, description: guide.excerpt };
}

export default async function GuideArticlePage({ params }: { params: Promise<{ lang: Lang; slug: string }> }) {
  const { lang, slug } = await params;
  const t = messages[lang].guides;
  const guide = guides.find((candidate) => candidate.slug === slug);
  if (!guide) notFound();
  const related = guides.filter((candidate) => candidate.slug !== guide.slug).slice(0, 3);

  return (
    <div className="flex flex-col gap-10">
      <article data-section="article" className="mx-auto mt-4 flex w-full max-w-[900px] flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            {guide.tags.map((tag) => <Chip key={tag}>{tag}</Chip>)}
          </div>
          <h1 className="font-display text-4xl leading-tight font-bold tracking-tight text-fog md:text-5xl">{guide.title}</h1>
          <p className="text-sm font-semibold text-mist">{t.by} {guide.author} &middot; {guide.date}</p>
        </div>
        <div className="flex flex-col gap-6 text-base leading-relaxed text-mist">
          {guide.sections.map((section) => (
            <section key={section.heading} className="flex flex-col gap-3">
              <h2 className="font-display text-2xl font-bold tracking-tight text-fog">{section.heading}</h2>
              {section.body.map((paragraph) => <p key={paragraph.slice(0, 24)}>{paragraph}</p>)}
              {section.list ? (
                <ul className="flex flex-col gap-2 pl-5 text-mist marker:text-brand">
                  {section.list.map((item) => <li key={item} className="list-disc">{item}</li>)}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </article>

      <section data-section="related" className="mx-auto flex w-full max-w-[900px] flex-col gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight text-fog">{t.keepReading}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {related.map((candidate) => (
            <Link key={candidate.slug} href={`/${lang}/guides/${candidate.slug}`} className="smooth rounded-xl border border-line bg-panel p-4 hover:border-brand-soft">
              <p className="font-display text-sm font-semibold text-fog">{candidate.title}</p>
              <p className="mt-1 text-xs text-mist">{candidate.author} &middot; {candidate.date}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
