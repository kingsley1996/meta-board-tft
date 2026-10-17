import Link from 'next/link';
import { CtaLink } from '@/components/ui';

const features = [
  { label: 'Comp rankings', href: '/tierlist/comps', art: 'from-tier-s/30 via-panel to-panel', glyph: '\u25C8' },
  { label: 'Item tiers', href: '/tierlist/items', art: 'from-tier-a/30 via-panel to-panel', glyph: '\u2694' },
  { label: 'Augment tiers', href: '/tierlist/augments', art: 'from-brand/30 via-panel to-panel', glyph: '\u2726' },
  { label: 'Guides', href: '/guides', art: 'from-tier-c/30 via-panel to-panel', glyph: '\u2261' },
  { label: 'Media', href: '/media', art: 'from-cost-3/30 via-panel to-panel', glyph: '\u25B6' },
  { label: 'Champions', href: '/learn/champions', art: 'from-cost-4/30 via-panel to-panel', glyph: '\u25CE' },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      <section data-section="hero" className="relative flex flex-col items-center gap-5 pt-10 pb-2 text-center">
        <div className="hex absolute top-6 left-0 hidden h-40 w-36 -rotate-12 bg-brand/20 md:block" />
        <div className="hex absolute top-24 right-2 hidden h-32 w-28 rotate-12 bg-cost-3/20 md:block" />
        <div className="flex items-center gap-2 rounded-full border border-line bg-panel px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-brand-soft">
          Set 26 <span className="text-mist">&middot;</span> Frostborn Rising
        </div>
        <h1 className="z-10 max-w-[840px] font-display text-5xl leading-[1.02] font-bold tracking-tight text-fog md:text-7xl">
          Every board that wins, <span className="text-brand">one comp away.</span>
        </h1>
        <p className="max-w-[560px] text-base leading-relaxed text-mist md:text-lg">
          MetaBoard ranks the comps, items and augments that actually climb this patch — curated from
          thousands of matches, rebuilt every morning before you queue.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <CtaLink href="/tierlist/comps">Browse comps</CtaLink>
          <CtaLink href="/guides" kind="ghost">Read the guides</CtaLink>
        </div>
      </section>

      <section data-section="features" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <Link
            key={feature.href}
            href={feature.href}
            className={`group relative flex min-h-[180px] flex-col justify-end overflow-hidden rounded-xl border border-line bg-gradient-to-b ${feature.art} p-5`}
          >
            <span className="hex smooth absolute -top-6 -right-6 h-32 w-28 bg-fog/5 group-hover:bg-fog/10" />
            <span className="absolute top-5 left-5 font-display text-3xl text-brand-soft">{feature.glyph}</span>
            <span className="relative font-display text-3xl font-bold uppercase tracking-tight text-fog">{feature.label}</span>
            <span className="relative text-xs font-semibold uppercase tracking-wide text-mist">Open board {'\u2192'}</span>
          </Link>
        ))}
      </section>

      <section data-section="promo" className="mx-auto w-full max-w-[720px] rounded-xl border border-line bg-panel p-6 text-center">
        <p className="font-display text-lg font-semibold text-fog">New patch, new boards.</p>
        <p className="mt-1 mb-4 text-sm text-mist">Patch 26.3 moved three comps up a tier overnight. See what changed before your next game.</p>
        <CtaLink href="/guides/read-a-tier-list">How to read the list</CtaLink>
      </section>
    </div>
  );
}
