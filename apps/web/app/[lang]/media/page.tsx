import type { Metadata } from 'next';
import { CtaLink } from '@/components/ui';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: messages[lang].meta.media.title,
    description: messages[lang].meta.media.description,
    // Nothing to play yet: keep the route reachable without advertising an
    // empty page to search engines.
    robots: { index: false, follow: false },
  };
}

export default async function MediaPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = messages[lang].media;
  return (
    <div className="flex flex-col gap-6">
      <section data-section="hero-panel" className="mx-auto flex w-full max-w-[720px] flex-col gap-4 rounded-xl border border-line bg-panel p-6">
        <h1 className="font-display text-4xl leading-none font-bold uppercase tracking-tight text-fog md:text-5xl">
          TFTIQ<br /><span className="text-brand">{t.heading}</span>
        </h1>
        <p className="text-sm font-semibold uppercase tracking-widest text-brand">{t.tagline}</p>
        <p className="text-sm leading-relaxed text-mist">{t.body}</p>
        <CtaLink href={`/${lang}/guides`}>{t.cta}</CtaLink>
      </section>
    </div>
  );
}
