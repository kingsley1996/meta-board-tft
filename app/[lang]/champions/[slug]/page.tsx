import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Chip, CostDots, ItemRanking, Panel, UnitHex, tierColor } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import type { CompsResponse } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import { iconByName, itemTierByName, itemTiers, unitStats } from '@/lib/data';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { championDetail, championSlugToName, keywordsFor } from '@/lib/tips';

// Champion pages read live comps from the backend (admin edits show up immediately).
export const dynamic = 'force-dynamic';

async function detail(slug: string, lang: Lang) {
  const name = championSlugToName[slug];
  if (!name) return null;
  return championDetail(name, lang);
}

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang; slug: string }> }): Promise<Metadata> {
  const { lang, slug } = await params;
  const champion = await detail(slug, lang);
  if (!champion) return {};
  return {
    title: champion.displayName,
    description: `${champion.displayName} (${champion.cost}-cost): traits, ability and every meta comp that plays this champion this patch.`,
  };
}

export default async function ChampionPage({ params }: { params: Promise<{ lang: Lang; slug: string }> }) {
  const { lang, slug } = await params;
  const champion = await detail(slug, lang);
  if (!champion) notFound();
  const t = messages[lang].champion;
  const keywords = keywordsFor(lang);
  const stats = unitStats[champion.name];

  const data = await backendJson<CompsResponse>(`/api/comps?lang=${lang}`);
  const comps = (data?.comps ?? []).filter((comp) =>
    [...comp.units, ...comp.early, ...comp.alt].some((unit) => unit.name === champion.name)
  );

  // Item frequency, counted from the comps this champion appears in. Carry
  // items count double ("what you actually build first").
  const itemCount = new Map<string, number>();
  for (const comp of comps) {
    if (comp.carry.name === champion.name) {
      for (const item of comp.items) itemCount.set(item.name, (itemCount.get(item.name) ?? 0) + 2);
    }
    for (const unit of comp.units) {
      if (unit.name !== champion.name) continue;
      for (const item of unit.items) itemCount.set(item.name, (itemCount.get(item.name) ?? 0) + 1);
    }
  }
  const topItems = (stats?.items ?? [...itemCount.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)).slice(0, 6);
  const itemRows = topItems.map((name) => ({
    name,
    icon: iconByName[name] ?? null,
    tier: itemTierByName[name] ?? null,
    note: itemTiers.find((item) => item.name === name)?.note[lang],
  }));
  const compact = (value: number) => value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}K` : String(value);

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <div data-section="page-head" className="flex flex-col gap-3">
        <Link href={`/${lang}/champions`} className="w-fit text-sm font-semibold text-mist hover:text-brand-soft">
          {'\u2190'} {t.allChampions}
        </Link>
        <Panel className="flex flex-wrap items-center gap-5 p-5">
          <UnitHex name={champion.name} cost={champion.cost} size={96} icon={champion.icon} />
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-3xl font-bold tracking-tight text-fog">{champion.displayName}</h1>
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip>{t.cost} {champion.cost} <CostDots cost={champion.cost} /></Chip>
              {champion.mana ? <Chip>{t.mana} {champion.mana.start}/{champion.mana.max}</Chip> : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {champion.traits.map((trait) => (
                <Chip key={trait.key}>
                  {trait.icon ? <img src={trait.icon ?? ''} alt="" loading="lazy" className="h-4 w-4 object-contain brightness-0 opacity-70" /> : null}
                  {trait.name}
                </Chip>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {champion.ability ? (
          <Panel className="flex flex-col gap-3 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.ability}</p>
            <p className="font-display text-lg font-semibold text-fog">{champion.ability.name}</p>
            <p className="text-sm leading-relaxed text-mist">{champion.ability.desc}</p>
            {champion.ability.keywords.length ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.keywords}</p>
                <ul className="flex flex-col gap-1 text-xs leading-relaxed text-mist">
                  {champion.ability.keywords.map((keyword) => (
                    <li key={keyword}>
                      <span className="font-semibold text-brand-soft">{keyword}</span>
                      {keywords[keyword] ? ` — ${keywords[keyword]}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Panel>
        ) : null}
        <Panel className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.items}</p>
            {stats ? <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-soft">{t.stats}</p> : null}
          </div>
          {stats ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                [t.avg, stats.avg.toFixed(2)],
                [t.top4, `${(stats.top4 * 100).toFixed(1)}%`],
                [t.win, `${(stats.win * 100).toFixed(1)}%`],
                [t.games, compact(stats.games)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line bg-ink/40 p-2 text-center">
                  <p className="font-display text-lg font-bold text-fog">{value}</p>
                  <p className="text-[11px] uppercase tracking-wide text-mist">{label}</p>
                </div>
              ))}
            </div>
          ) : null}
          {itemRows.length ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.itemRanking}</p>
              <ItemRanking items={itemRows} showTier={false} />
              <p className="text-xs leading-relaxed text-mist">{t.itemsNote}</p>
            </>
          ) : (
            <p className="text-sm text-mist">{t.noComps}</p>
          )}
        </Panel>
      </div>

      <div data-section="champion-comps" className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.inComps}</p>
        {comps.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {comps.map((comp) => (
              <Link
                key={comp.slug}
                href={`/${lang}/tierlist/comps/${comp.slug}`}
                className="smooth flex items-center gap-3 rounded-xl border border-line bg-panel p-4 hover:border-brand-soft"
                style={{ borderLeft: `3px solid ${tierColor[comp.tier]}` }}
              >
                <UnitHex name={comp.carry.name} cost={comp.carry.cost} icon={comp.carry.icon} size={44} />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-fog">{comp.title}</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-mist">{comp.tier} · {comp.style} · {comp.units.length} {messages[lang].compPanel.units}</span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-line bg-panel p-6 text-sm text-mist">{t.noComps}</p>
        )}
      </div>
    </div>
  );
}
