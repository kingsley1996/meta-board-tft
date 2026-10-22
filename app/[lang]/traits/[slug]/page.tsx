import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Panel, UnitHex } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import tft from '@/lib/tft.json';
import { championNameToSlug, getTip, traitName, traitStyleColorByName, unitName, unitTraitNames } from '@/lib/tips';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang; slug: string }> }): Promise<Metadata> {
  const { lang, slug } = await params;
  const trait = tft.traits.find((entry) => entry.slug === slug);
  if (!trait) return {};
  const name = traitName(trait.name, lang);
  const tip = getTip('trait', trait.name, lang);
  return { title: name, description: tip?.kind === 'trait' ? tip.desc : name };
}

export default async function TraitPage({ params }: { params: Promise<{ lang: Lang; slug: string }> }) {
  const { lang, slug } = await params;
  const trait = tft.traits.find((entry) => entry.slug === slug);
  if (!trait) notFound();
  const t = messages[lang].traits;
  const tip = getTip('trait', trait.name, lang);
  const champions = tft.champions.filter((champion) => champion.traits.includes(trait.name));

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <Link href={`/${lang}/champions`} className="w-fit text-sm font-semibold text-mist hover:text-brand-soft">
        {'\u2190'} {t.back}
      </Link>
      <Panel className="flex flex-wrap items-center gap-5 p-5">
        {trait.icon ? <img src={trait.icon} alt="" className="h-20 w-20 object-contain" /> : null}
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-3xl font-bold tracking-tight text-fog">{traitName(trait.name, lang)}</h1>
          {tip?.kind === 'trait' && tip.desc ? <p className="max-w-3xl text-sm leading-relaxed text-mist">{tip.desc}</p> : null}
        </div>
      </Panel>
      {tip?.kind === 'trait' && tip.breakpoints.length ? (
        <Panel className="flex flex-col gap-3 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.breakpoints}</p>
          <ul className="flex flex-col gap-2">
            {tip.breakpoints.map((breakpoint) => (
              <li key={breakpoint.minUnits} className="flex gap-3 text-sm leading-relaxed">
                <span className="w-8 shrink-0 font-display font-bold" style={{ color: traitStyleColorByName[breakpoint.style ?? ''] ?? 'var(--color-mist)' }}>{breakpoint.minUnits}</span>
                <span className="text-mist">{breakpoint.text}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.champions}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {champions.map((champion) => (
            <Link key={champion.slug} href={`/${lang}/champions/${championNameToSlug[champion.name]}`} className="smooth flex items-center gap-3 rounded-xl border border-line bg-panel p-4 hover:border-brand-soft">
              <UnitHex name={champion.name} cost={champion.cost} icon={champion.icon} size={44} />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-fog">{unitName(champion.name, lang)}</span>
                <span className="text-xs text-mist">{unitTraitNames(champion.name, lang).join(' · ')}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
