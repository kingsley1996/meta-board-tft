import type { Metadata } from 'next';
import Link from 'next/link';
import { CostDots, Chip, UnitHex } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import { units } from '@/lib/data';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { championNameToSlug, traitName, unitName, unitTraitNames } from '@/lib/tips';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.champions.title, description: messages[lang].meta.champions.description };
}

const costs = [1, 2, 3, 4, 5] as const;

export default async function ChampionsPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = messages[lang].champions;
  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <div data-section="page-head" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-brand-hot bg-brand-hot px-4 py-1.5 text-xs font-semibold text-white">{t.allCosts}</span>
          {costs.map((cost) => (
            <span key={cost} className="flex items-center gap-2 rounded-full border border-line bg-panel px-4 py-1.5 text-xs font-semibold text-mist">
              {t.cost(cost)} <CostDots cost={cost} />
            </span>
          ))}
        </div>
      </div>
      <div data-section="champ-grid" className="grid w-full gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {units.map((unit) => (
          <Link
            key={unit.name}
            href={`/${lang}/champions/${championNameToSlug[unit.name]}`}
            className="smooth flex flex-col items-center gap-3 rounded-xl border border-line bg-panel p-4 hover:border-brand-soft"
          >
            <UnitHex name={unit.name} cost={unit.cost} size={72} icon={unit.icon} />
            <p className="font-display text-lg font-semibold text-fog">{unitName(unit.name, lang)}</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {unitTraitNames(unit.name, lang).map((trait) => <Chip key={trait}>{traitName(trait, lang)}</Chip>)}
            </div>
            <CostDots cost={unit.cost} />
          </Link>
        ))}
      </div>
    </div>
  );
}
