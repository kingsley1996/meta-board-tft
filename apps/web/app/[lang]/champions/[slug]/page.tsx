import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ItemRanking, ItemTile, Panel, UnitHex, itemHref, tierColor } from '@/components/ui';
import { HexBoard } from '@/components/hex-board';
import { PatchBar } from '@/components/patch-bar';
import type { CompsResponse } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import { compStatsBySlug, iconByName, itemTierByName, itemTiers, unitAbilityAttributes, unitRoles, unitStats } from '@/lib/data';
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

export default async function ChampionPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: Lang; slug: string }>;
  searchParams: Promise<{ rank?: string }>;
}) {
  const [{ lang, slug }, query] = await Promise.all([params, searchParams]);
  const champion = await detail(slug, lang);
  if (!champion) notFound();
  const t = messages[lang].champion;
  const keywords = keywordsFor(lang);
  const stats = unitStats[champion.name];
  const rank = query.rank === 'master' ? 'master' : 'all';
  const rankStats = stats?.ranks?.[rank] ?? stats ?? null;
  const rankHref = (nextRank: string) => {
    const qs = new URLSearchParams();
    if (nextRank === 'master') qs.set('rank', 'master');
    const search = qs.toString();
    return `/${lang}/champions/${slug}${search ? `?${search}` : ''}`;
  };
  const rankTabs = [
    { key: 'all', label: t.rankAll, href: rankHref('all') },
    { key: 'master', label: t.rankMaster, href: rankHref('master') },
  ];
  const abilityAttributes = unitAbilityAttributes[champion.name] ?? [];
  const role = unitRoles[champion.name] ?? null;
  const roleLabel = (value: string) => {
    if (lang !== 'vi') return value;
    const [damage, ...rest] = value.split(' ');
    const base = rest.join(' ');
    const viDamage = damage === 'Attack' ? 'Vật Lý' : damage === 'Magic' ? 'Phép' : 'Lai';
    const viBase: Record<string, string> = {
      Fighter: 'Đấu Sĩ',
      Assassin: 'Sát Thủ',
      Caster: 'Pháp Sư',
      Marksman: 'Xạ Thủ',
      Tank: 'Đỡ Đòn',
      Specialist: 'Chuyên Gia',
    };
    return `${viBase[base] ?? base} ${viDamage}`;
  };
  const abilityLabel = (label: string) => {
    if (lang !== 'vi') return label;
    const labels: Record<string, string> = {
      Damage: 'Sát thương',
      'Full Moon Damage': 'Sát thương trăng tròn',
      'Bonus Damage': 'Sát thương cộng thêm',
      'Passive Damage': 'Sát thương nội tại',
      Heal: 'Hồi máu',
      Shield: 'Lá chắn',
      'Stun Duration': 'Thời gian choáng',
      Duration: 'Thời gian',
    };
    return labels[label] ?? label;
  };

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
  const metaItemRows = (stats?.itemStats ?? []).slice(0, 6).map((item) => ({
    name: item.name,
    icon: iconByName[item.name] ?? null,
    tier: itemTierByName[item.name] ?? null,
    note: `${(item.pick * 100).toFixed(1)}% · ${t.avg} ${item.avg.toFixed(2)}`,
  }));
  const itemRows = metaItemRows.length ? metaItemRows : topItems.map((name) => ({
    name,
    icon: iconByName[name] ?? null,
    tier: itemTierByName[name] ?? null,
    note: itemTiers.find((item) => item.name === name)?.note[lang],
  }));
  const combos = stats?.builds ?? [];
  const compact = (value: number) => value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}K` : String(value);

  const positionCells = new Map<string, { count: number; pct: number }>();
  const positionTotal = (stats?.positions ?? []).reduce((sum, position) => sum + position.count, 0);
  for (const position of stats?.positions ?? []) {
    const number = Number(position.cell.replace(/\D+/g, ''));
    if (!number) continue;
    const row = 3 - Math.floor((number - 1) / 7);
    const col = (number - 1) % 7;
    if (row < 0 || row > 3 || col < 0 || col > 6) continue;
    positionCells.set(`${row}-${col}`, { count: position.count, pct: positionTotal ? position.count / positionTotal : 0 });
  }
  const maxPosition = Math.max(0, ...[...positionCells.values()].map((cell) => cell.count));

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <div data-section="page-head" className="flex flex-col gap-3">
        <Link href={`/${lang}/champions`} className="w-fit text-sm font-semibold text-mist hover:text-brand">
          {'\u2190'} {t.allChampions}
        </Link>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)_minmax(0,380px)]">
          <Panel className="overflow-hidden">
          <div className="relative min-h-[280px] overflow-hidden">
            {champion.icon ? (
              <img src={champion.icon} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_22%]" />
            ) : null}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,14,20,0.92)_0%,rgba(11,14,20,0.7)_45%,rgba(11,14,20,0.3)_100%)]"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-panel/80 via-transparent to-transparent" />
            <div className="relative flex min-h-[280px] flex-col gap-5 p-5">
              <div className="flex flex-col gap-1">
                <h1 className="font-display text-3xl font-bold tracking-tight text-fog drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">{champion.displayName}</h1>
                {role ? <p className="text-sm font-medium text-fog/80">{roleLabel(role)}</p> : null}
              </div>
              <ul className="flex flex-col gap-2.5">
                {champion.traits.map((trait) => (
                  <li key={trait.key} className="flex items-center gap-2 text-base font-semibold text-fog">
                    {trait.icon ? (
                      <img src={trait.icon} alt="" loading="lazy" className="h-5 w-5 object-contain brightness-0 invert" />
                    ) : null}
                    {trait.name}
                  </li>
                ))}
              </ul>
            </div>
            <span
              className="absolute bottom-3 right-4 inline-flex items-center gap-1.5 rounded-md border bg-page/80 px-2.5 py-1 font-display text-sm font-bold backdrop-blur-sm"
              style={{
                color: `var(--color-cost-${champion.cost})`,
                borderColor: `color-mix(in srgb, var(--color-cost-${champion.cost}) 50%, transparent)`,
              }}
            >
              <span aria-hidden="true" className="h-2 w-2 rotate-45 rounded-[1px]" style={{ backgroundColor: `var(--color-cost-${champion.cost})` }} />
              {champion.cost}
            </span>
          </div>
          <div className="border-b border-line py-3 text-center text-sm font-semibold text-brand">{t.abilityTab}</div>
          <div className="p-5">
            {champion.ability ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="relative block h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-line bg-ink">
                    {champion.icon ? (
                      <img src={champion.icon} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xl text-brand">{'\u2726'}</span>
                    )}
                  </span>
                  <p className="min-w-0 flex-1 font-display text-lg font-semibold text-fog">{champion.ability.name}</p>
                  {champion.mana ? (
                    <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-[#58b7ff]">
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                        <path d="M12 2.4S5.5 10 5.5 14.6a6.5 6.5 0 0 0 13 0C18.5 10 12 2.4 12 2.4Z" />
                      </svg>
                      {champion.mana.start}/{champion.mana.max}
                    </span>
                  ) : null}
                </div>
                <p className="text-[15px] leading-relaxed text-fog/90">{champion.ability.desc}</p>
                {abilityAttributes.length ? (
                  <div className="flex flex-col gap-3 border-t border-line pt-3">
                    {abilityAttributes.map((attribute) => (
                      <div key={attribute.key} className="flex items-start justify-between gap-4">
                        <span className="text-sm font-semibold text-[#58b7ff]">{abilityLabel(attribute.label)}:</span>
                        <span className="flex flex-col items-end gap-0.5">
                          <span className="font-display text-sm font-bold text-fog">{attribute.values.join('/')}</span>
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-[#58b7ff]">
                            {attribute.values.join('/')} <span aria-hidden="true">×</span>
                            <span className="rounded border border-brand/40 bg-brand/10 px-1 text-[9px] font-bold text-brand">AP</span>
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {champion.ability.keywords.length ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.keywords}</p>
                    <ul className="flex flex-col gap-1 text-xs leading-relaxed text-mist">
                      {champion.ability.keywords.map((keyword) => (
                        <li key={keyword}>
                          <span className="font-semibold text-brand">{keyword}</span>
                          {keywords[keyword] ? ` — ${keywords[keyword]}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-mist">{t.ability}</p>
            )}
          </div>
          </Panel>

          <div data-section="champion-builds" className="min-w-0">
            <Panel className="flex flex-col overflow-hidden">
              <div className="flex flex-col gap-1 border-b border-line p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.itemCombos}</p>
                <p className="text-[11px] text-mist">{t.itemCombosNote}</p>
              </div>
              {combos.length ? (
                <div className="flex flex-col">
                  {combos.map((combo, index) => (
                    <div key={[...combo.items].sort().join('|')} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                      <span className="w-5 shrink-0 text-center font-display text-sm font-bold text-mist">{index + 1}</span>
                      <span className="flex shrink-0 gap-1">
                        {combo.items.map((item) => (
                          <ItemTile key={item} name={item} icon={iconByName[item] ?? null} tier={itemTierByName[item] ?? null} size={34} href={itemHref(item, lang)} />
                        ))}
                      </span>
                      <span className="min-w-0 flex-1 text-[11px] text-mist">{compact(combo.count)} {t.games.toLowerCase()}</span>
                      <span className="shrink-0 text-right">
                        <span className="block font-display text-sm font-bold text-fog">{(combo.pick * 100).toFixed(1)}%</span>
                        <span className="block text-[11px] text-mist">{t.avg} {combo.avg.toFixed(2)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-4 text-sm text-mist">{t.noCombos}</p>
              )}
            </Panel>
          </div>

          <div data-section="champion-stats" className="min-w-0 lg:col-span-2 xl:col-span-1">
            <Panel className="flex flex-col overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">{t.statsTab}</p>
                {stats?.ranks?.master ? (
                  <div className="flex overflow-hidden rounded-md border border-line">
                    {rankTabs.map((rankTab) => (
                      <Link
                        key={rankTab.key}
                        href={rankTab.href}
                        scroll={false}
                        className={`smooth px-2.5 py-1 text-[11px] font-semibold ${rank === rankTab.key ? 'bg-brand text-on-brand' : 'text-mist hover:text-fog'}`}
                        aria-current={rank === rankTab.key ? 'page' : undefined}
                      >
                        {rankTab.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col gap-3 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-mist">{t.stats}</p>
                {rankStats ? (
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: t.avg, value: rankStats.avg.toFixed(2) },
                      { label: t.top4, value: `${(rankStats.top4 * 100).toFixed(1)}%` },
                      { label: t.win, value: `${(rankStats.win * 100).toFixed(1)}%` },
                      rankStats.pick != null ? { label: t.pick, value: `${(rankStats.pick * 100).toFixed(1)}%` } : null,
                      { label: t.games, value: compact(rankStats.games) },
                    ].filter((row): row is { label: string; value: string } => row !== null).map((row) => (
                      <div key={row.label} className="rounded-lg border border-line bg-ink/40 p-2 text-center last:col-span-2">
                        <p className="font-display text-lg font-bold text-fog">{row.value}</p>
                        <p className="text-[11px] uppercase tracking-wide text-mist">{row.label}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {itemRows.length ? (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.items}</p>
                    <ItemRanking items={itemRows} showTier={false} lang={lang} />
                    <p className="text-xs leading-relaxed text-mist">{t.itemsNote}</p>
                  </>
                ) : (
                  <p className="text-sm text-mist">{t.noComps}</p>
                )}
              </div>
            </Panel>
          </div>
        </div>
      </div>

      {(positionCells.size || stats?.stars?.length || stats?.itemCounts?.length) ? (
        <div className="grid gap-4 md:grid-cols-2">
          {positionCells.size ? (
            <Panel className="flex flex-col gap-3 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.positions}</p>
              <HexBoard
                renderCell={(row, col) => {
                  const cell = positionCells.get(`${row}-${col}`);
                  if (!cell) return null;
                  const ratio = maxPosition ? cell.count / maxPosition : 0;
                  return (
                    <span
                      className="hex absolute inset-[2px] flex items-center justify-center font-display text-[10px] font-bold text-fog"
                      style={{
                        // The blend stops short of a full brand fill on purpose:
                        // text-fog stays ≥ 4.5 on the mix in every palette, while
                        // solid brand needs the dark on-brand ink.
                        backgroundColor: `color-mix(in srgb, var(--color-brand) ${Math.round((0.14 + ratio * 0.48) * 100)}%, var(--color-panel))`,
                      }}
                      title={`${(cell.pct * 100).toFixed(1)}%`}
                    >
                      {cell.pct >= 0.1 ? `${Math.round(cell.pct * 100)}%` : ''}
                    </span>
                  );
                }}
              />
              <p className="text-xs leading-relaxed text-mist">{t.positionsNote}</p>
            </Panel>
          ) : null}
          {(stats?.stars?.length || stats?.itemCounts?.length) ? (
            <Panel className="flex flex-col gap-4 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.distribution}</p>
              {stats?.stars?.length ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-fog">{t.stars}</p>
                  {stats.stars.map((row) => (
                    <div key={row.stars} className="flex items-center gap-2">
                      <span className="w-9 shrink-0 text-xs font-semibold text-fog">{'\u2605'.repeat(row.stars)}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink">
                        <span className="block h-full rounded-full bg-brand" style={{ width: `${row.pct * 100}%` }} />
                      </span>
                      <span className="w-24 shrink-0 text-right text-[11px] text-mist">{(row.pct * 100).toFixed(1)}% · {row.avg.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {stats?.itemCounts?.length ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-fog">{t.itemsHeld}</p>
                  {stats.itemCounts.map((row) => (
                    <div key={row.items} className="flex items-center gap-2">
                      <span className="w-9 shrink-0 text-xs font-semibold text-fog">{row.items}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink">
                        <span className="block h-full rounded-full bg-brand" style={{ width: `${row.pct * 100}%` }} />
                      </span>
                      <span className="w-24 shrink-0 text-right text-[11px] text-mist">{(row.pct * 100).toFixed(1)}% · {row.avg.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </Panel>
          ) : null}
        </div>
      ) : null}

      <div data-section="champion-comps" className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.inComps}</p>
        {comps.length ? (
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            <div className="hidden grid-cols-[minmax(0,1fr)_72px_72px_56px] gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-mist sm:grid">
              <span>{t.compBoard}</span>
              <span className="text-right">{t.compAvg}</span>
              <span className="text-right">{t.compGames}</span>
              <span className="text-right">{t.compLevel}</span>
            </div>
            {comps.map((comp) => {
              const metaStats = compStatsBySlug[comp.slug];
              return (
                <Link
                  key={comp.slug}
                  href={`/${lang}/tierlist/comps/${comp.slug}`}
                  className="smooth grid gap-2 border-t border-line px-4 py-3 hover:bg-ink/40 sm:grid-cols-[minmax(0,1fr)_72px_72px_56px] sm:items-center sm:gap-3"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex shrink-0 -space-x-2">
                      {comp.units.slice(0, 9).map((unit) => (
                        <UnitHex key={unit.name} name={unit.name} cost={unit.cost} icon={unit.icon} size={26} />
                      ))}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-semibold text-fog">{comp.title}</span>
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-mist">
                        <span style={{ color: tierColor[comp.tier] }}>{comp.tier}</span> · {comp.style}
                      </span>
                    </span>
                  </span>
                  {[
                    { label: t.compAvg, value: metaStats ? metaStats.avg.toFixed(2) : '\u2014' },
                    { label: t.compGames, value: metaStats ? compact(metaStats.games) : '\u2014' },
                    { label: t.compLevel, value: metaStats?.level ? String(metaStats.level) : '\u2014' },
                  ].map((cell) => (
                    <span key={cell.label} className="flex items-center justify-between gap-2 text-xs sm:block sm:text-right">
                      <span className="text-mist sm:hidden">{cell.label}</span>
                      <span className="font-display text-sm font-bold text-fog">{cell.value}</span>
                    </span>
                  ))}
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-line bg-panel p-6 text-sm text-mist">{t.noComps}</p>
        )}
      </div>
    </div>
  );
}
