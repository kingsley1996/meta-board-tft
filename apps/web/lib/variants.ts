import type { Tier } from './tiers.ts';
import { tierRank } from './tiers.ts';

// The fields a variant tab needs; generic so callers keep their own comp type.
export type VariantComp = {
  slug: string;
  title: string;
  tier: Tier;
  carry: { name: string };
};

// Comp variants are the same carry in a different shell (Ezreal Elderwood vs
// Ezreal Executioner). Grouping by carry matches how TFT Academy lists comps;
// a carry with no sibling gets no tabs at all.
//
// Sometimes two comps share a carry but are not the same build. Those pairs go
// here — hand-mapped, undirected, each pair with the reason next to it.
const excludes: { pair: [string, string]; reason: string }[] = [
  // A 1-cost Pebbles tempo shell and a Pebbles reroll, not two versions of one comp.
  { pair: ['pebbles-reroll', 'riftbeast-tempo'], reason: 'different strategy and shell' },
];

const excluded = (a: string, b: string) =>
  a !== b && excludes.some((entry) => entry.pair.includes(a) && entry.pair.includes(b));

export function compVariants<T extends VariantComp>(comps: T[], slug: string): T[] {
  const current = comps.find((comp) => comp.slug === slug);
  if (!current) return [];
  const group = comps.filter((comp) => comp.carry.name === current.carry.name && !excluded(comp.slug, slug));
  return group.length < 2
    ? []
    : group.sort((a, b) => tierRank.indexOf(a.tier) - tierRank.indexOf(b.tier) || a.title.localeCompare(b.title));
}

// A variant group is one entry on the tier board: the comp that leads its tab
// strip carries the group, and its siblings are reached through those tabs (or
// their own URLs) instead of taking a second avatar. Grouping runs on whatever
// list the board is showing, so a filter that drops the lead promotes the best
// comp left in the group.
export function variantRows<T extends VariantComp>(comps: T[]): { comp: T; lead: boolean; siblings: number }[] {
  return comps.map((comp) => {
    const group = compVariants(comps, comp.slug);
    return { comp, lead: !group.length || group[0].slug === comp.slug, siblings: Math.max(0, group.length - 1) };
  });
}
