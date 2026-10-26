import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Chip, ItemTile, Panel, tierColor } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import { itemMetaByName, patch, unitStats } from '@/lib/data';
import type { Tier } from '@/lib/tiers';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import tft from '@metaboard/shared/data/tft.json';
import { getTip, itemName } from '@/lib/tips';

const championByName = new Map(tft.champions.map((champion) => [champion.name, champion]));

type ChampionItemRow = {
  champion: string;
  avg: number;
  win: number;
  count: number;
  pick: number;
  delta: number;
  tier: string;
  score: number;
};

// Champions running this item, in MetaTFT's own order. The scraper scores each
// champion exactly like MetaTFT's item page (bias-adjusted place change +
// small-sample dampening), so tier letters, the "Biên độ" column and the row
// order match their site.
function championsUsingItem(itemName: string): ChampionItemRow[] {
  return (itemMetaByName[itemName]?.championStats ?? [])
    .slice(0, 20)
    .map((entry, _index, rows) => {
      const total = rows.reduce((sum, row) => sum + row.count, 0) || 1;
      return {
        champion: entry.name,
        avg: entry.avg,
        win: entry.win,
        count: entry.count,
        pick: entry.count / total,
        delta: entry.placeChange ?? entry.delta ?? 0,
        tier: entry.tier ?? 'C',
        score: entry.score ?? 0,
      };
    });
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-28 flex-col gap-1 rounded-xl border border-line bg-ink/40 px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-mist">{label}</span>
      <span className="font-display text-xl font-bold text-fog">{value}</span>
      {hint ? <span className="text-xs text-mist">{hint}</span> : null}
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang; slug: string }> }): Promise<Metadata> {
  const { lang, slug } = await params;
  const item = tft.items.find((entry) => entry.slug === slug);
  if (!item) return {};
  const name = itemName(item.name, lang);
  const tip = getTip('item', item.name, lang);
  return { title: name, description: tip?.kind === 'item' ? tip.desc : name };
}

export default async function ItemPage({ params }: { params: Promise<{ lang: Lang; slug: string }> }) {
  const { lang, slug } = await params;
  const item = tft.items.find((entry) => entry.slug === slug);
  if (!item) notFound();
  const t = messages[lang].itemsDb;
  const vi = lang === 'vi';
  const tip = getTip('item', item.name, lang);
  const stats = itemMetaByName[item.name];
  const category =
    item.category === 'radiant' ? t.radiant : item.category === 'artifact' ? t.ornn : item.category === 'completed' ? t.completed : t.components;
  const buildsInto = tft.items.filter((entry) => (entry.composition as string[]).includes(item.name));
  const description = tip?.kind === 'item' && tip.desc ? tip.desc : vi ? item.descVi || item.desc : item.desc;
  // Same-category peers with the closest average placement ("best similar items").
  const similar = Object.values(itemMetaByName)
    .filter((entry) => entry.name !== item.name && entry.category === item.category)
    .sort((a, b) => Math.abs(a.avg - (stats?.avg ?? 4)) - Math.abs(b.avg - (stats?.avg ?? 4)))
    .slice(0, 4);
  const championRows = (stats?.champions ?? [])
    .map((name) => ({ champion: championByName.get(name), name }))
    .filter((row): row is { champion: NonNullable<typeof row.champion>; name: string } => Boolean(row.champion));
  const itemChampionTable = championsUsingItem(item.name);

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <Link href={`/${lang}/items`} className="w-fit text-sm font-semibold text-mist hover:text-brand-soft">
        {'\u2190'} {t.back}
      </Link>
      <Panel className="flex flex-wrap items-start gap-5 p-5">
        <ItemTile name={item.name} icon={item.icon} tier={stats?.tier ?? null} size={88} />
        <div className="flex min-w-0 max-w-3xl flex-1 flex-col gap-2">
          <h1 className="font-display text-3xl font-bold tracking-tight text-fog">{itemName(item.name, lang)}</h1>
          <div className="flex flex-wrap gap-1.5">
            <Chip>{t.category}: {category}</Chip>
            {stats ? <Chip>{stats.tier} Tier</Chip> : null}
          </div>
          {description ? <p className="text-sm leading-relaxed text-mist">{description}</p> : null}
        </div>
      </Panel>
      {stats ? (
        <Panel className="flex flex-col gap-3 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.statsTitle}</p>
          <div className="flex flex-wrap gap-3">
            <StatCard label={t.avgPlace} value={stats.avg.toFixed(2)} />
            {typeof stats.pick === 'number' ? <StatCard label={t.pickRate} value={`${(stats.pick * 100).toFixed(1)}%`} /> : null}
            <StatCard label={t.top4Rate} value={`${(stats.top4 * 100).toFixed(1)}%`} />
            <StatCard label={t.winRate} value={`${(stats.win * 100).toFixed(1)}%`} />
            <StatCard label={t.gamesPlayed} value={new Intl.NumberFormat(vi ? 'vi-VN' : 'en-US').format(stats.games)} hint={`MetaBoard · ${patch.version}`} />
          </div>
        </Panel>
      ) : (
        <Panel className="p-5 text-sm text-mist">{t.noStats}</Panel>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {itemChampionTable.length ? (
          <Panel className="flex min-w-0 flex-col gap-3 p-5 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.bestOn}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-mist">
                    <th className="px-3 py-2">{t.championCol}</th>
                    <th className="px-3 py-2 text-center">{t.tierCol}</th>
                    <th className="px-3 py-2 text-right">{t.avgPlace}</th>
                    <th className="px-3 py-2 text-right">{t.deltaCol}</th>
                    <th className="px-3 py-2 text-right">{t.winRate}</th>
                    <th className="px-3 py-2 text-right">{t.freqCol}</th>
                  </tr>
                </thead>
                <tbody>
                  {itemChampionTable.map((row, index) => {
                    const champion = championByName.get(row.champion);
                    const tier = (['S', 'A', 'B', 'C', 'D'].includes(row.tier) ? row.tier : 'C') as Tier;
                    return (
                      <tr key={row.champion} className="border-b border-line/60 last:border-b-0 even:bg-ink/40">
                        <td className="px-3 py-2">
                          {champion ? (
                            <Link href={`/${lang}/champions/${champion.slug}`} className="smooth flex items-center gap-2 font-semibold text-fog hover:text-brand-soft">
                              {champion.icon ? <img src={champion.icon} alt="" loading="lazy" className="h-7 w-7 rounded-full" /> : null}
                              {vi && champion.nameVi ? champion.nameVi : champion.name}
                            </Link>
                          ) : (
                            <span className="font-semibold text-fog">{row.champion}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="rounded border px-1.5 py-0.5 font-display text-xs font-bold" style={{ borderColor: tierColor[tier], color: tierColor[tier] }}>
                            {tier}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-display font-bold text-fog">{row.avg.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-semibold" style={{ color: row.delta <= 0 ? '#69db7c' : '#ff9f43' }}>
                          {row.delta > 0 ? '+' : ''}
                          {row.delta.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-fog">{(row.win * 100).toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right">
                          <span className="block font-semibold text-fog">{new Intl.NumberFormat(vi ? 'vi-VN' : 'en-US').format(row.count)}</span>
                          <span className="block text-[11px] text-mist">{(row.pick * 100).toFixed(1)}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-mist">{t.tableNote}</p>
          </Panel>
        ) : championRows.length ? (
          <Panel className="flex flex-col gap-3 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.championsUsing}</p>
            <div className="flex flex-wrap gap-2">
              {championRows.map(({ champion }) => (
                <Link
                  key={champion.name}
                  href={`/${lang}/champions/${champion.slug}`}
                  className="smooth flex items-center gap-2 rounded-lg border border-line bg-ink/40 px-3 py-2 text-sm font-semibold text-fog hover:border-brand-soft"
                >
                  {champion.icon ? <img src={champion.icon} alt="" loading="lazy" className="h-7 w-7 rounded-full" /> : null}
                  {vi && champion.nameVi ? champion.nameVi : champion.name}
                </Link>
              ))}
            </div>
          </Panel>
        ) : null}
        {similar.length ? (
          <Panel className="flex flex-col gap-3 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.similarItems}</p>
            <div className="flex flex-wrap gap-2">
              {similar.map((entry) => {
                const target = tft.items.find((candidate) => candidate.name === entry.name);
                if (!target) return null;
                return (
                  <Link
                    key={entry.name}
                    href={`/${lang}/items/${target.slug}`}
                    className="smooth flex items-center gap-2 rounded-lg border border-line bg-ink/40 px-3 py-2 text-sm font-semibold text-fog hover:border-brand-soft"
                  >
                    <ItemTile name={entry.name} icon={target.icon} tier={entry.tier} size={24} />
                    {itemName(entry.name, lang)}
                    <span className="text-xs font-normal text-mist">{entry.avg.toFixed(2)}</span>
                  </Link>
                );
              })}
            </div>
          </Panel>
        ) : null}
        {(stats?.stages ?? []).length ? (
          <Panel className="flex flex-col gap-3 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.stagePanel}</p>
            <div className="flex flex-col gap-2">
              {(stats?.stages ?? []).map((stage) => {
                const rate = stage.count ? stage.win / stage.count : 0;
                return (
                  <div key={stage.stage} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-xs font-semibold text-mist">{t.stageLabel} {stage.stage}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink/60">
                      <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.min(100, rate * 100)}%` }} />
                    </span>
                    <span className="w-14 shrink-0 text-right font-display text-sm font-bold text-fog">{(rate * 100).toFixed(1)}%</span>
                    <span className="w-16 shrink-0 text-right text-[11px] text-mist">{new Intl.NumberFormat(vi ? 'vi-VN' : 'en-US').format(stage.count)}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-mist">{t.stageNote}</p>
          </Panel>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {tip?.kind === 'item' && tip.composition.length ? (
          <Panel className="flex flex-col gap-3 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.buildsFrom}</p>
            <div className="flex flex-wrap gap-2">
              {tip.composition.map((component, index) => {
                const target = tft.items.find((entry) => entry.name === item.composition[index]);
                const content = (
                  <span className="flex items-center gap-2 rounded-lg border border-line bg-ink/40 px-3 py-2 text-sm font-semibold text-fog">
                    {component.icon ? <img src={component.icon} alt="" loading="lazy" className="h-6 w-6 rounded" /> : null}
                    {component.name}
                  </span>
                );
                return target ? <Link key={`${component.name}-${index}`} href={`/${lang}/items/${target.slug}`} className="smooth hover:opacity-80">{content}</Link> : <span key={`${component.name}-${index}`}>{content}</span>;
              })}
            </div>
          </Panel>
        ) : null}
        {buildsInto.length ? (
          <Panel className="flex flex-col gap-3 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.buildsInto}</p>
            <div className="flex flex-wrap gap-2">
              {buildsInto.map((entry) => (
                <Link key={entry.slug} href={`/${lang}/items/${entry.slug}`} className="smooth flex items-center gap-2 rounded-lg border border-line bg-ink/40 px-3 py-2 text-sm font-semibold text-fog hover:border-brand-soft">
                  <ItemTile name={entry.name} icon={entry.icon} size={24} />
                  {itemName(entry.name, lang)}
                </Link>
              ))}
            </div>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
