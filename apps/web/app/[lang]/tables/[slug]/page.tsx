import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AugmentOdds } from '@/components/augment-odds';
import { LootOutcomes, LootPlainTableView, lootKindLabel } from '@/components/loot';
import { Chip, Panel } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import type { Lang } from '@/lib/i18n';
import { lootPageBySlug, lootPages, lootSource, lootTableGroups } from '@/lib/loot';
import { messages } from '@/lib/messages';
import { translateText } from '@/lib/translate';

export function generateStaticParams() {
  return lootPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang; slug: string }> }): Promise<Metadata> {
  const { lang, slug } = await params;
  const page = lootPageBySlug[slug];
  if (!page) return {};
  const description = page.owners.find((owner) => owner.description)?.description ?? messages[lang].tables.loot.hint;
  return {
    title: translateText(lang, 'loot', 'page-title', page.title),
    description: translateText(lang, 'loot', 'owner-description', description).slice(0, 160),
  };
}

export default async function LootTablePage({ params }: { params: Promise<{ lang: Lang; slug: string }> }) {
  const { lang, slug } = await params;
  const page = lootPageBySlug[slug];
  if (!page) notFound();
  const t = messages[lang].tables.loot;

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <div data-section="page-head" className="flex flex-col gap-3">
        <Link href={`/${lang}/tables`} className="w-fit text-sm font-semibold text-mist hover:text-brand">
          {'\u2190'} {t.back}
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-tight text-fog">
          {translateText(lang, 'loot', 'page-title', page.title)}
        </h1>
        {page.owners.map((owner) => (
          <Panel key={owner.kind + owner.name} className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center gap-3">
              {owner.icon ? <img src={owner.icon} alt="" loading="lazy" className="h-10 w-10 rounded" /> : null}
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-lg font-semibold text-fog">
                  {translateText(lang, 'loot', 'owner-name', owner.name)}
                </p>
                <Chip>{lootKindLabel(owner.kind, lang)}</Chip>
                {owner.stages.length ? (
                  <Chip>{t.stages}: {owner.stages.map((stage) => translateText(lang, 'loot', 'owner-stage', stage)).join(', ')}</Chip>
                ) : null}
              </div>
            </div>
            {owner.description ? (
              <p className="text-sm leading-relaxed text-mist">
                {translateText(lang, 'loot', 'owner-description', owner.description)}
              </p>
            ) : null}
          </Panel>
        ))}
      </div>

      {page.owners.flatMap((owner) => owner.tables).map((table) => (
        <Panel key={table.apiName} className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-lg font-semibold text-fog">
              {translateText(lang, 'loot', 'table-title', table.title)}
            </p>
            {table.level !== null ? <Chip>{t.level} {table.level}</Chip> : null}
          </div>
          {table.facts.length ? (
            <div className="flex flex-wrap gap-1.5">
              {table.facts.map((fact) => (
              <Chip key={fact.label}>
                {translateText(lang, 'loot', 'fact-label', fact.label)}: {translateText(lang, 'loot', 'fact-value', fact.value)}
              </Chip>
              ))}
            </div>
          ) : null}
          <LootOutcomes outcomes={table.outcomes} lang={lang} />
        </Panel>
      ))}

      {lootTableGroups(page.tables).map((group) => (
        <Panel key={group.heading} className="flex flex-col gap-3 p-5">
          {group.heading ? (
            <p className="font-display text-lg font-semibold text-fog">
              {translateText(
                lang,
                'loot',
                'table-group',
                group.heading,
                translateText(lang, 'loot', 'table-title', group.heading),
              )}
            </p>
          ) : null}
          {group.tables.map((table, index) => (
            <div key={`${table.title}-${index}`} className="flex flex-col gap-2">
              {table.title && table.title !== group.heading ? (
                <p className="text-xs font-semibold uppercase tracking-wide text-mist">
                  {translateText(lang, 'loot', 'table-title', table.title)}
                </p>
              ) : null}
              {table.note ? (
                <p className="text-xs leading-relaxed text-mist">
                  {translateText(lang, 'loot', 'table-note', table.note)}
                </p>
              ) : null}
              <LootPlainTableView table={table} lang={lang} />
            </div>
          ))}
        </Panel>
      ))}

      {page.augmentDistribution.length ? (
        <Panel className="flex flex-col gap-3 p-5">
          <p className="font-display text-lg font-semibold text-fog">{t.calculator}</p>
          <AugmentOdds cells={page.augmentDistribution} lang={lang} />
        </Panel>
      ) : null}

      {page.boards.map((board) => (
        <Panel key={board.title} className="flex flex-col gap-3 p-5">
          <p className="font-display text-lg font-semibold text-fog">
            {translateText(lang, 'loot', 'board-title', board.title)}
          </p>
          {board.image ? <img src={board.image} alt="" loading="lazy" className="w-full max-w-xl rounded-lg" /> : null}
          <ul className="flex flex-col gap-1 text-sm text-mist">
            {board.features.map((feature) => (
              <li key={feature}>{translateText(lang, 'loot', 'board-feature', feature)}</li>
            ))}
          </ul>
        </Panel>
      ))}

      <p className="text-xs leading-relaxed text-mist">
        {t.source} ·{' '}
        <a href={page.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-line underline-offset-2 hover:text-fog">
          {lootSource.provider}
        </a>
      </p>
    </div>
  );
}
