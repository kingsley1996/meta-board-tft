import Image from 'next/image';
import Link from 'next/link';
import { CompMap } from '@/components/comp-map';
import { CtaLink } from '@/components/ui';
import { getCompMap } from '@/lib/comp-map';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

// Every card is a card with a render: the brand wash at the top, panel below, and
// the art sitting in that space. The plates are all ~400px tall because the art
// renders 184px on a 2x screen; anything smaller gets resampled by the browser.
const features = [
  { key: 'comps', href: '/tierlist/comps', art3d: { src: '/images/tft/penguin-board.webp', width: 1075, height: 969 } },
  { key: 'items', href: '/tierlist/items', art3d: { src: '/images/tft/items-armor.webp', width: 401, height: 400 } },
  { key: 'augments', href: '/tierlist/augments', art3d: { src: '/images/tft/augment-crystal-hd.webp', width: 241, height: 400 } },
  { key: 'guides', href: '/guides', art3d: { src: '/images/tft/spellbook-hd.webp', width: 517, height: 400 } },
  { key: 'tables', href: '/tables', art3d: { src: '/images/tft/mechanics-table-hd.webp', width: 584, height: 400 } },
  { key: 'champions', href: '/learn/champions', art3d: { src: '/images/tft/penguin-gem-hd.webp', width: 424, height: 400 } },
] as const;

export default async function Home({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = messages[lang].home;
  const snapshot = messages[lang].compMap.snapshot;
  const compMap = getCompMap(lang);
  return (
    <div className="flex flex-col gap-10">
      <section
        data-section="hero"
        className="relative flex min-h-[390px] flex-col items-start justify-center gap-5 overflow-hidden rounded-2xl border border-line px-6 py-10 text-left md:px-12"
        style={{ backgroundImage: 'url("/images/tft/enchanted-wilds-banner.webp")', backgroundSize: 'cover', backgroundPosition: '72% 50%' }}
      >
        {/* Two washes, because one cannot follow the copy. From xl up the
            headline is 760px inside a wider board, so it stays left of the 62%
            stop where the gradient is still 90% opaque and the banner can show
            through on the right. Below that the text runs the full width, straight
            over the brightest part of the photo — measured at 1.13:1 on the orange
            accent at 390px — so there the banner is only a texture under a flat
            near-solid ground. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 bg-page/90 xl:bg-transparent xl:bg-gradient-to-r xl:from-page/95 xl:via-page/90 xl:via-62% xl:to-transparent"
        />
        <div className="relative z-20 flex items-center gap-2 rounded-full border border-line bg-page/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-brand backdrop-blur-sm">
          {t.badge}
        </div>
        <h1 className="relative z-20 max-w-[760px] font-display text-5xl leading-[1.02] font-bold tracking-tight text-fog drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] md:text-7xl">
          {t.headline} <span className="text-brand">{t.headlineAccent}</span>
        </h1>
        <p className="relative z-20 max-w-[560px] text-base leading-relaxed text-fog drop-shadow-[0_1px_5px_rgba(0,0,0,0.95)] md:text-lg">{t.sub}</p>
        <div className="relative z-20 flex flex-wrap items-center gap-2 pt-1">
          <CtaLink href={`/${lang}/tierlist/comps`}>{t.browseComps}</CtaLink>
          <CtaLink href={`/${lang}/guides`} kind="ghost">{t.readGuides}</CtaLink>
        </div>
      </section>

      <section data-section="assistant-spotlight" className="relative isolate flex flex-col gap-6 overflow-hidden rounded-2xl border border-brand/40 bg-gradient-to-br from-brand/20 via-panel to-panel p-5 shadow-[0_16px_48px_color-mix(in_srgb,var(--color-brand)_14%,transparent)] md:flex-row md:items-center md:justify-between md:p-8">
        <div className="hex absolute -top-16 -right-12 -z-10 h-56 w-48 rotate-12 bg-brand/10" />
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <Image
            src="/images/tft/coach-penguin.webp"
            alt=""
            width={771}
            height={1209}
            sizes="104px"
            loading="eager"
            className="-ml-1 h-24 w-[61px] shrink-0 object-contain md:h-32 md:w-[82px]"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand">{t.assistantKicker}</p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-fog md:text-3xl">{t.assistantTitle}</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-mist">{t.assistantBody}</p>
            <Link
              href={`/${lang}/assistant`}
              className="smooth mt-4 inline-flex items-center gap-2 rounded-lg border border-brand bg-brand px-4 py-2.5 text-sm font-bold text-on-brand shadow-lg shadow-brand/20 hover:bg-brand-deep"
            >
              {t.assistantCta}
              <span aria-hidden>{'\u2192'}</span>
            </Link>
          </div>
        </div>
        <div className="hidden w-full max-w-sm shrink-0 flex-col gap-3 md:flex">
          {messages[lang].assistant.samples.slice(0, 2).map((sample, index) => (
            <div key={sample} className={`rounded-xl border border-line/80 bg-page/70 px-4 py-3 text-sm leading-relaxed text-mist ${index === 1 ? 'ml-8' : ''}`}>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-brand">{index === 0 ? '01' : '02'}</span>
              {sample}
            </div>
          ))}
        </div>
      </section>

      {/* The gap has to clear the overhang, and the extra top margin is the
          runway for the render where it breaks the card's edge from sm up. */}
      <section data-section="features" className="grid grid-cols-1 gap-4 sm:mt-8 sm:grid-cols-2 sm:gap-10 lg:grid-cols-3">
        {features.map((entry) => (
          <Link
            key={entry.key}
            href={`/${lang}${entry.href}`}
            className="group relative flex min-h-[220px] flex-col justify-end gap-1 overflow-hidden rounded-xl border border-line bg-gradient-to-b from-brand/30 via-panel to-panel p-5 sm:z-10 sm:overflow-visible"
          >
            {/* The card itself cannot clip, because the render is meant to break
                its edge — so the decoration that must stay inside gets its own
                frame. */}
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[11px]">
              <span className="hex smooth absolute -top-6 -right-6 h-32 w-28 bg-fog/5 group-hover:bg-fog/10" />
            </span>
            {/* A fixed height, not a share of the card, so every plate lands on the
                same art line and the wide ones never grow past their own pixels.
                No pointer-events-none anywhere in here: the part of the render that
                hangs outside the frame is still inside this <a> in the box tree, so
                clicking the overhang follows the card. */}
            <span aria-hidden="true" className="absolute inset-x-0 top-2 flex h-[148px] justify-center sm:top-[-30px] sm:h-[184px]">
              <Image
                src={entry.art3d.src}
                alt=""
                width={entry.art3d.width}
                height={entry.art3d.height}
                sizes="(min-width: 640px) 270px, 250px"
                className="card-art h-full w-auto max-w-none object-contain"
              />
            </span>
            {/* Bottom-up, because the copy sits under the middle of the render
                rather than beside it. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-panel via-panel/85 via-45% to-transparent"
            />
            <span className="relative z-10 text-center font-display text-3xl font-bold uppercase tracking-tight text-fog">
              {t.features[entry.key]}
            </span>
            <span className="relative z-10 text-center text-xs font-semibold uppercase tracking-wide text-mist">{t.openBoard}</span>
          </Link>
        ))}
      </section>

      <section data-section="comp-map-snapshot" className="relative isolate overflow-hidden rounded-2xl border border-line bg-panel p-5 md:p-6">
        <span aria-hidden="true" className="hex pointer-events-none absolute -top-16 -right-12 -z-10 h-56 w-48 rotate-12 bg-brand/10" />
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-8">
          <div className="flex max-w-[340px] flex-col items-start gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand">{snapshot.kicker}</p>
            <h2 className="font-display text-2xl font-bold tracking-tight text-fog md:text-3xl">{snapshot.title}</h2>
            <p className="text-sm leading-relaxed text-mist">{snapshot.sub}</p>
            <CtaLink href={`/${lang}/tierlist/map`}>{snapshot.cta}</CtaLink>
            <p className="text-[11px] text-mist/80">{snapshot.note(18, compMap.patch)}</p>
          </div>
          <div className="min-w-0 flex-1">
            <CompMap rows={compMap.rows} lang={lang} variant="mini" limit={18} />
          </div>
        </div>
      </section>

      <section data-section="promo" className="mx-auto w-full max-w-[720px] rounded-xl border border-line bg-panel p-6 text-center">
        <p className="font-display text-lg font-semibold text-fog">{t.promoTitle}</p>
        <p className="mt-1 mb-4 text-sm text-mist">{t.promoBody}</p>
        <CtaLink href={`/${lang}/guides/tier-list-is-a-queue`}>{t.promoCta}</CtaLink>
      </section>
    </div>
  );
}
