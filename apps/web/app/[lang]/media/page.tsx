import type { Metadata } from 'next';
import { Chip } from '@/components/ui';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.media.title, description: messages[lang].meta.media.description };
}

export default async function MediaPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = messages[lang].media;
  return (
    <div className="flex flex-col gap-6">
      <section data-section="hero-panel" className="grid gap-6 rounded-xl border border-line bg-panel p-6 lg:grid-cols-2">
        <div className="flex flex-col justify-center gap-4">
          <p className="font-display text-5xl leading-none font-bold uppercase tracking-tight text-fog md:text-6xl">
            MetaBoard<br /><span className="text-brand">{t.heading}</span>
          </p>
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">{t.tagline}</p>
          <p className="text-sm leading-relaxed text-mist">{t.body}</p>
          <div className="flex gap-2">
            <span className="rounded-full border border-brand bg-brand px-4 py-1.5 text-xs font-semibold text-on-brand">{t.showVideo}</span>
            <span className="rounded-full border border-line bg-util px-4 py-1.5 text-xs font-semibold text-mist">{t.showPodcast}</span>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border-2 border-brand/60 bg-gradient-to-br from-util via-panel to-page">
            <span className="hex absolute -top-6 -left-6 h-40 w-32 bg-brand/15" />
            <span className="hex absolute -right-8 -bottom-10 h-48 w-40 bg-cost-3/15" />
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-brand bg-panel text-xl text-brand">{'\u25B6'}</span>
            <span className="absolute bottom-3 left-3">
              <Chip>{t.nowPlaying}</Chip>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {t.episodes.slice(0, 3).map((episode) => (
              <div key={episode.title} className="flex flex-col gap-2">
                <div className="relative h-16 overflow-hidden rounded-md border border-line bg-gradient-to-br from-util to-panel">
                  <span className="hex absolute top-2 left-2 h-10 w-8 bg-fog/5" />
                </div>
                <p className="text-xs leading-snug font-semibold text-fog">{episode.title}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {t.episodes.map((episode) => (
          <div key={episode.title} className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
            <div className="relative h-24 overflow-hidden rounded-md bg-gradient-to-br from-util to-page">
              <span className="hex absolute right-3 bottom-2 h-14 w-12 bg-brand/15" />
            </div>
            <p className="font-display text-sm font-semibold text-fog">{episode.title}</p>
            <p className="text-xs text-mist">{episode.meta}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
