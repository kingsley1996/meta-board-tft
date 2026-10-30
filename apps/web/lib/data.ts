import tft from '@tftiq/shared/data/tft.json';
import meta from '@tftiq/shared/data/meta.json';
import type { Lang } from './i18n';

export type { Tier } from './tiers';
export { tierRank } from './tiers';

import type { Tier } from './tiers';

export type Cost = 1 | 2 | 3 | 4 | 5;

export type Unit = { name: string; cost: Cost; traits: string[]; icon: string | null };

export const setInfo = { number: meta.source.setNumber, patch: meta.source.patch };

export const units: Unit[] = tft.champions
  .map((champion) => ({
    name: champion.name,
    cost: champion.cost as Cost,
    traits: champion.traits,
    icon: champion.icon,
  }))
  .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));

export const unitByName: Record<string, Unit> = Object.fromEntries(units.map((unit) => [unit.name, unit]));

export const iconByName: Record<string, string> = Object.fromEntries(
  [
    ...tft.champions.map((entry) => [entry.name, entry.icon] as const),
    ...tft.items.map((entry) => [entry.name, entry.icon] as const),
    ...tft.augments.map((entry) => [entry.name, entry.icon] as const),
  ].filter(([, icon]) => icon) as [string, string][]
);

export type TierItem = { name: string; tier: Tier; note: { en: string; vi: string } };

export type ItemMetaStats = {
  name: string;
  category?: string;
  tier: Tier;
  avg: number;
  games: number;
  top4: number;
  win: number;
  pick?: number | null;
  champions?: string[];
  championStats?: {
    name: string;
    count: number;
    avg: number;
    top4: number;
    win: number;
    delta: number | null;
    placeChange?: number | null;
    score?: number;
    tier?: string;
  }[];
  stages?: { stage: string; count: number; win: number }[];
  unitGames?: number | null;
  note: { en: string; vi: string };
};

export const itemMetaByName: Record<string, ItemMetaStats> = Object.fromEntries(
  meta.items.map((item) => [item.name, item as unknown as ItemMetaStats])
);

// The tier-list board renders three groups — completed gear (emblems included)
// plus Ornn artifacts and Radiant upgrades, each with its own per-group tiers
// (their smaller samples use MetaTFT's adjusted thresholds).
const itemTiersFor = (category: string): TierItem[] => meta.items
  .filter((item) => item.category === category)
  .map((item) => ({ name: item.name, tier: item.tier as Tier, note: item.note }));

export const itemTiers: TierItem[] = [...itemTiersFor('completed'), ...itemTiersFor('emblem')];
export const artifactTiers: TierItem[] = itemTiersFor('artifact');
export const radiantTiers: TierItem[] = itemTiersFor('radiant');

export const itemTierByName: Record<string, Tier> = Object.fromEntries(
  meta.items.map((item) => [item.name, item.tier as Tier]),
);

export const itemOptions = tft.items.map((item) => ({ name: item.name, icon: item.icon as string | null, tier: itemTierByName[item.name] ?? null }));

// Detail-page link target for every catalog item (null when unknown).
export const itemSlugByName: Record<string, string> = Object.fromEntries(tft.items.map((item) => [item.name, item.slug]));

// Route slugs are data ids ("da-18-akali-ad"), so breadcrumbs read the display
// name from here instead of prettifying the slug.
export const nameBySlug: Record<string, { en: string; vi: string }> = Object.fromEntries([
  ...tft.traits.map((entry) => [entry.slug, { en: entry.name, vi: entry.nameVi }] as const),
  ...tft.champions.map((entry) => [entry.slug, { en: entry.name, vi: entry.nameVi }] as const),
  ...tft.items.map((entry) => [entry.slug, { en: entry.name, vi: entry.nameVi }] as const),
  ...tft.augments.map((entry) => [entry.slug, { en: entry.name, vi: entry.nameVi }] as const),
  ...meta.comps.map((comp) => [comp.slug, { en: comp.title, vi: comp.titleVi }] as const),
]);

export const augmentTiers: TierItem[] = meta.augments.map((augment) => ({ name: augment.name, tier: augment.tier as Tier, note: augment.note }));

export type UnitStatBlock = { games: number; avg: number; top4: number; win: number; pick?: number };
export type UnitMetaStats = UnitStatBlock & {
  items: string[];
  ranks?: { all: UnitStatBlock | null; master: UnitStatBlock | null };
  itemStats?: { name: string; count: number; avg: number; pick: number }[];
  builds?: { items: string[]; count: number; avg: number; pick: number }[];
  stars?: { stars: number; count: number; avg: number; pct: number }[];
  itemCounts?: { items: number; count: number; avg: number; pct: number }[];
  positions?: { cell: string; count: number }[];
};

export type UnitAbilityAttribute = { key: string; label: string; values: number[] };

export const unitAbilityAttributes: Record<string, UnitAbilityAttribute[]> = meta.abilities;

export const unitRoles: Record<string, string> = meta.roles;

export const unitStats: Record<string, UnitMetaStats> = meta.units;

// Champion's global meta tier (S..D by average placement, share-based cut like
// the item tiers). Used for the per-champion badges on item detail pages —
// the badge reflects the champion's standing, not the item's tier.
export const championTierByName: Record<string, Tier> = (() => {
  const ranked = Object.entries(unitStats)
    .filter(([, stats]) => (stats.ranks?.all?.games ?? stats.games) >= 2000)
    .sort(([, a], [, b]) => a.avg - b.avg);
  const cut = (index: number): Tier => {
    const share = index / Math.max(ranked.length, 1);
    return share < 0.15 ? 'S' : share < 0.4 ? 'A' : share < 0.7 ? 'B' : share < 0.88 ? 'C' : 'D';
  };
  return Object.fromEntries(ranked.map(([name], index) => [name, cut(index)]));
})();

export type CompMetaStats = { avg: number; games: number; level: number };

export const compStatsBySlug: Record<string, CompMetaStats> = Object.fromEntries(
  meta.comps.map((comp) => [comp.slug, comp.stats])
);

// Guide tags stay English keys (they are authored on the guides themselves);
// only the chip label is localized.
const guideTags: Record<string, string> = {
  Fundamentals: 'Kiến thức nền tảng',
  Economy: 'Kinh tế',
  Items: 'Trang bị',
  Positioning: 'Xếp đội hình',
  Augments: 'Nâng cấp',
  Meta: 'Meta',
  'Patch notes': 'Cập nhật patch',
  'Meta read': 'Đọc meta',
  'Decision making': 'Ra quyết định',
  'Mid game': 'Giữa trận',
  Leveling: 'Lên cấp',
};

export const guideTag = (name: string, lang: Lang) => (lang === 'vi' ? guideTags[name] ?? name : name);

export const patch = { version: setInfo.patch, updated: `TFTIQ · ${meta.source.updated.slice(0, 10)}` };
