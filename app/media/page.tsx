import type { Metadata } from 'next';
import { Chip } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Media',
  description: 'MetaBoard video and podcast: meta reads, patch breakdowns and coaching sessions.',
};

const episodes = [
  { title: 'Patch 26.3 first look: the 3-cost shakeup', meta: '18 min \u00b7 Video' },
  { title: 'Economy clinic: 10 games, 10 stage 2s', meta: '42 min \u00b7 Podcast' },
  { title: 'Positioning workshop with a Challenger lobby', meta: '31 min \u00b7 Video' },
  { title: 'Why X-tier comps win tournaments', meta: '26 min \u00b7 Podcast' },
];

export default function MediaPage() {
  return (
    <div className="flex flex-col gap-6">
      <section data-section="hero-panel" className="grid gap-6 rounded-xl border border-line bg-panel p-6 lg:grid-cols-2">
        <div className="flex flex-col justify-center gap-4">
          <p className="font-display text-5xl leading-none font-bold uppercase tracking-tight text-fog md:text-6xl">
            MetaBoard<br /><span className="text-brand-soft">Media</span>
          </p>
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-soft">The patch, explained out loud</p>
          <p className="text-sm leading-relaxed text-mist">
            Video breakdowns and a weekly podcast on where the meta is moving. Every episode is written the
            morning the patch lands, so the takeaways are live before your first game.
          </p>
          <div className="flex gap-2">
            <span className="rounded-full border border-brand-hot bg-brand-hot px-4 py-1.5 text-xs font-semibold text-white">Show video</span>
            <span className="rounded-full border border-line bg-util px-4 py-1.5 text-xs font-semibold text-mist">Show podcast</span>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border-2 border-brand/60 bg-gradient-to-br from-util via-panel to-page">
            <span className="hex absolute -top-6 -left-6 h-40 w-32 bg-brand/15" />
            <span className="hex absolute -right-8 -bottom-10 h-48 w-40 bg-cost-3/15" />
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-brand-soft bg-panel text-xl text-brand-soft">{'\u25B6'}</span>
            <span className="absolute bottom-3 left-3">
              <Chip>Now playing &middot; Patch 26.3 first look</Chip>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {episodes.slice(0, 3).map((episode) => (
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
        {episodes.map((episode) => (
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
