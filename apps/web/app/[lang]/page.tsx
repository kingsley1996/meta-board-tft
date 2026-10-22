import Image from 'next/image';
import Link from 'next/link';
import { CtaLink } from '@/components/ui';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

const features = [
  { key: 'comps', href: '/tierlist/comps', art: 'from-tier-s/30 via-panel to-panel', glyph: '\u25C8' },
  { key: 'items', href: '/tierlist/items', art: 'from-tier-a/30 via-panel to-panel', glyph: '\u2694' },
  { key: 'augments', href: '/tierlist/augments', art: 'from-brand/30 via-panel to-panel', glyph: '\u2726' },
  { key: 'guides', href: '/guides', art: 'from-tier-c/30 via-panel to-panel', glyph: '\u2261' },
  { key: 'media', href: '/media', art: 'from-cost-3/30 via-panel to-panel', glyph: '\u25B6' },
  { key: 'champions', href: '/learn/champions', art: 'from-cost-4/30 via-panel to-panel', glyph: '\u25CE' },
] as const;

export default async function Home({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = messages[lang].home;
  return (
    <div className="flex flex-col gap-10">
      <section
        data-section="hero"
        className="relative flex min-h-[390px] flex-col items-start justify-center gap-5 overflow-hidden rounded-2xl border border-line px-6 py-10 text-left md:px-12"
        style={{ backgroundImage: 'url("/images/tft/enchanted-wilds-banner.webp")', backgroundSize: 'cover', backgroundPosition: '72% 50%' }}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-r from-page/90 via-page/65 to-transparent" />
        <div className="relative z-20 flex items-center gap-2 rounded-full border border-line bg-page/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-brand-soft backdrop-blur-sm">
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

      <section data-section="assistant-spotlight" className="relative isolate flex flex-col gap-6 overflow-hidden rounded-2xl border border-brand/40 bg-gradient-to-br from-brand/20 via-panel to-panel p-5 shadow-[0_16px_48px_rgba(124,58,237,0.12)] md:flex-row md:items-center md:justify-between md:p-8">
        <div className="hex absolute -top-16 -right-12 -z-10 h-56 w-48 rotate-12 bg-brand/10" />
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <Image
            src="/images/tft/coach-mascot.webp"
            alt=""
            width={1232}
            height={978}
            sizes="96px"
            loading="eager"
            className="-ml-2 -mt-3 h-20 w-20 shrink-0 object-contain md:h-24 md:w-24"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-soft">{t.assistantKicker}</p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-fog md:text-3xl">{t.assistantTitle}</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-mist">{t.assistantBody}</p>
            <Link
              href={`/${lang}/assistant`}
              className="smooth mt-4 inline-flex items-center gap-2 rounded-lg border border-brand-hot bg-brand-hot px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-hot/20 hover:bg-brand-deep"
            >
              {t.assistantCta}
              <span aria-hidden>{'\u2192'}</span>
            </Link>
          </div>
        </div>
        <div className="hidden w-full max-w-sm shrink-0 flex-col gap-3 md:flex">
          {messages[lang].assistant.samples.slice(0, 2).map((sample, index) => (
            <div key={sample} className={`rounded-xl border border-line/80 bg-page/70 px-4 py-3 text-sm leading-relaxed text-mist ${index === 1 ? 'ml-8' : ''}`}>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-brand-soft">{index === 0 ? '01' : '02'}</span>
              {sample}
            </div>
          ))}
        </div>
      </section>

      <section data-section="features" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <Link
            key={feature.key}
            href={`/${lang}${feature.href}`}
            className={`group relative flex min-h-[180px] flex-col justify-end overflow-hidden rounded-xl border border-line bg-gradient-to-b ${feature.art} p-5`}
          >
            <span className="hex smooth absolute -top-6 -right-6 h-32 w-28 bg-fog/5 group-hover:bg-fog/10" />
            <span className="absolute top-5 left-5 font-display text-3xl text-brand-soft">{feature.glyph}</span>
            <span className="relative font-display text-3xl font-bold uppercase tracking-tight text-fog">{t.features[feature.key]}</span>
            <span className="relative text-xs font-semibold uppercase tracking-wide text-mist">{t.openBoard}</span>
          </Link>
        ))}
      </section>

      <section data-section="promo" className="mx-auto w-full max-w-[720px] rounded-xl border border-line bg-panel p-6 text-center">
        <p className="font-display text-lg font-semibold text-fog">{t.promoTitle}</p>
        <p className="mt-1 mb-4 text-sm text-mist">{t.promoBody}</p>
        <CtaLink href={`/${lang}/guides/read-a-tier-list`}>{t.promoCta}</CtaLink>
      </section>
    </div>
  );
}
