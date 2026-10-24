import tft from '@metaboard/shared/data/tft.json';
import meta from '@metaboard/shared/data/meta.json';
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

export const itemTiers: TierItem[] = meta.items.map((item) => ({ name: item.name, tier: item.tier as Tier, note: item.note }));

export const itemTierByName: Record<string, Tier> = Object.fromEntries(itemTiers.map((item) => [item.name, item.tier]));

export const itemOptions = tft.items.map((item) => ({ name: item.name, icon: item.icon as string | null, tier: itemTierByName[item.name] ?? null }));

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

export const patch = { version: setInfo.patch, updated: `MetaBoard · ${meta.source.updated.slice(0, 10)}` };

export const socials = [
  { label: 'YouTube', href: '#' },
  { label: 'X', href: '#' },
  { label: 'Discord', href: '#' },
  { label: 'Reddit', href: '#' },
];
