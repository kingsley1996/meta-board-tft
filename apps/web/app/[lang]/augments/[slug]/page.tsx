import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AugmentTile, Panel } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import tft from '@tftiq/shared/data/tft.json';
import { augmentName, augmentRarity, getTip } from '@/lib/tips';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang; slug: string }> }): Promise<Metadata> {
  const { lang, slug } = await params;
  const augment = tft.augments.find((entry) => entry.slug === slug);
  if (!augment) return {};
  const name = augmentName(augment.name, lang);
  const tip = getTip('augment', augment.name, lang);
  return { title: name, description: tip?.kind === 'augment' ? tip.desc : name };
}

export default async function AugmentPage({ params }: { params: Promise<{ lang: Lang; slug: string }> }) {
  const { lang, slug } = await params;
  const augment = tft.augments.find((entry) => entry.slug === slug);
  if (!augment) notFound();
  const t = messages[lang].augmentsDb;
  const tip = getTip('augment', augment.name, lang);
  const rarity = augment.rarity ? augmentRarity[augment.rarity] : null;

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <Link href={`/${lang}/augments`} className="w-fit text-sm font-semibold text-mist hover:text-brand">
        {'\u2190'} {t.back}
      </Link>
      <Panel className="flex flex-wrap items-start gap-5 p-5">
        <AugmentTile name={augment.name} icon={augment.icon} size={88} />
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-3xl font-bold tracking-tight text-fog">{augmentName(augment.name, lang)}</h1>
          {rarity ? <span className="w-fit rounded-md border border-line bg-util px-2 py-0.5 text-xs font-semibold" style={{ color: rarity.color }}>{t.rarity}: {rarity.label[lang]}</span> : null}
          {tip?.kind === 'augment' && tip.desc ? <p className="max-w-3xl text-sm leading-relaxed text-mist">{tip.desc}</p> : null}
        </div>
      </Panel>
    </div>
  );
}
