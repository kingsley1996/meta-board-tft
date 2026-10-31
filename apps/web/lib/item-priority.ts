import meta from '@tftiq/shared/data/meta.json';
import tft from '@tftiq/shared/data/tft.json';
import type { Cost } from './data';
import type { Lang } from './i18n';
import { PRIORITY, bucketFor, shrinkGain, type PriorityBucket } from './item-priority-score';
import type { Tier } from './tiers';
import { itemName, unitName } from './tips';

export type { PriorityBucket } from './item-priority-score';
export { PRIORITY, bucketFor } from './item-priority-score';

export type PriorityItem = {
  name: string;
  display: string;
  icon: string | null;
  bucket: PriorityBucket;
  gain: number;
  share: number;
  avg: number;
  count: number;
};

export type PriorityArtifact = {
  name: string;
  display: string;
  icon: string | null;
  avg: number;
  count: number;
};

export type PriorityEmblem = {
  name: string;
  display: string;
  icon: string | null;
  avg: number;
  count: number;
};

export type PriorityComp = {
  slug: string;
  title: string;
  tier: Tier;
  icon: string | null;
};

export type UnitPriorityRow = {
  name: string;
  display: string;
  icon: string | null;
  cost: Cost;
  games: number;
  items: PriorityItem[];
  artifacts: PriorityArtifact[];
  emblems: PriorityEmblem[];
  comps: PriorityComp[];
  topGain: number;
};

const BUCKET_ORDER: PriorityBucket[] = ['core', 'strong', 'situational', 'overpicked'];
const TIER_ORDER = ['S', 'A', 'B', 'C', 'D', 'X'] as const;

type MetaStats = { count: number; avg: number; placeChange?: number | null };
type MetaItem = { name: string; category?: string; championStats?: ({ name: string } & MetaStats)[] };
type MetaComp = {
  slug: string;
  title: string;
  titleVi?: string | null;
  tier: Tier;
  carry?: string | null;
  stats?: { games?: number };
  units: { name: string }[];
};

const championIcon = new Map(tft.champions.map((champion) => [champion.name, champion.icon]));
const itemIcon = new Map(tft.items.map((item) => [item.name, item.icon]));
const unitGames = new Map(Object.entries(meta.units).map(([name, entry]) => [name, entry.games]));

const tierIndex = (tier: Tier) => {
  const index = TIER_ORDER.indexOf(tier);
  return index === -1 ? TIER_ORDER.length : index;
};

function buildItems(): Map<string, PriorityItem[]> {
  const byUnit = new Map<string, PriorityItem[]>();
  for (const item of meta.items as MetaItem[]) {
    if (item.category !== 'completed') continue;
    for (const stats of item.championStats ?? []) {
      const games = unitGames.get(stats.name);
      if (!games || games <= 0) continue;
      const share = stats.count / games;
      if (stats.count < PRIORITY.minGames || share < PRIORITY.minShare) continue;
      if (stats.placeChange == null) continue;
      const gain = shrinkGain(stats.placeChange, stats.count);
      const bucket = bucketFor(gain, share);
      if (!bucket) continue;
      const list = byUnit.get(stats.name) ?? [];
      list.push({
        name: item.name,
        display: '',
        icon: itemIcon.get(item.name) ?? null,
        bucket,
        gain: Math.round(gain * 100) / 100,
        share,
        avg: stats.avg,
        count: stats.count,
      });
      byUnit.set(stats.name, list);
    }
  }
  for (const list of byUnit.values()) {
    list.sort((a, b) => BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket) || b.gain - a.gain);
  }
  return byUnit;
}

function buildArtifacts(): Map<string, PriorityArtifact[]> {
  const byUnit = new Map<string, PriorityArtifact[]>();
  for (const item of meta.items as MetaItem[]) {
    if (item.category !== 'artifact' && item.category !== 'radiant') continue;
    for (const stats of item.championStats ?? []) {
      if (stats.count < PRIORITY.minArtifactGames) continue;
      if (!unitGames.has(stats.name)) continue;
      const list = byUnit.get(stats.name) ?? [];
      list.push({
        name: item.name,
        display: '',
        icon: itemIcon.get(item.name) ?? null,
        avg: stats.avg,
        count: stats.count,
      });
      byUnit.set(stats.name, list);
    }
  }
  // The rail shows the best few, but the full list still travels with the row
  // so the item picker and its filter can see artifacts that never make top 3.
  for (const list of byUnit.values()) list.sort((a, b) => a.avg - b.avg || b.count - a.count);
  return byUnit;
}

function buildEmblems(): Map<string, PriorityEmblem[]> {
  const byUnit = new Map<string, PriorityEmblem[]>();
  for (const item of meta.items as MetaItem[]) {
    if (item.category !== 'emblem') continue;
    for (const stats of item.championStats ?? []) {
      const games = unitGames.get(stats.name);
      if (!games) continue;
      if (stats.count < PRIORITY.minEmblemGames || stats.count / games < PRIORITY.minEmblemShare) continue;
      const list = byUnit.get(stats.name) ?? [];
      list.push({
        name: item.name,
        display: '',
        icon: itemIcon.get(item.name) ?? null,
        avg: stats.avg,
        count: stats.count,
      });
      byUnit.set(stats.name, list);
    }
  }
  for (const list of byUnit.values()) list.sort((a, b) => a.avg - b.avg || b.count - a.count);
  return byUnit;
}

function buildComps(lang: Lang): Map<string, PriorityComp[]> {
  const byUnit = new Map<string, (PriorityComp & { games: number })[]>();
  for (const comp of meta.comps as MetaComp[]) {
    const icon = championIcon.get(comp.carry ?? comp.units[0]?.name ?? '') ?? null;
    for (const unit of comp.units) {
      const list = byUnit.get(unit.name) ?? [];
      list.push({
        slug: comp.slug,
        title: lang === 'vi' && comp.titleVi ? comp.titleVi : comp.title,
        tier: comp.tier,
        icon,
        games: comp.stats?.games ?? 0,
      });
      byUnit.set(unit.name, list);
    }
  }
  for (const list of byUnit.values()) {
    list.sort((a, b) => tierIndex(a.tier) - tierIndex(b.tier) || b.games - a.games);
    list.length = Math.min(list.length, PRIORITY.maxComps);
  }
  return byUnit as Map<string, PriorityComp[]>;
}

export function getUnitPriorityRows(lang: Lang): UnitPriorityRow[] {
  const itemsByUnit = buildItems();
  const artifactsByUnit = buildArtifacts();
  const emblemsByUnit = buildEmblems();
  const compsByUnit = buildComps(lang);

  return (tft.champions as { name: string; cost: number; icon: string | null }[])
    .map((champion) => {
      const items = (itemsByUnit.get(champion.name) ?? []).map((item) => ({
        ...item,
        display: itemName(item.name, lang),
      }));
      const artifacts = (artifactsByUnit.get(champion.name) ?? []).map((artifact) => ({
        ...artifact,
        display: itemName(artifact.name, lang),
      }));
      const emblems = (emblemsByUnit.get(champion.name) ?? []).map((emblem) => ({
        ...emblem,
        display: itemName(emblem.name, lang),
      }));
      return {
        name: champion.name,
        display: unitName(champion.name, lang),
        icon: champion.icon,
        cost: champion.cost as Cost,
        games: unitGames.get(champion.name) ?? 0,
        items,
        artifacts,
        emblems,
        comps: compsByUnit.get(champion.name) ?? [],
        topGain: items.reduce((best, item) => Math.max(best, item.gain), 0),
      };
    })
    .sort((a, b) => b.cost - a.cost || a.display.localeCompare(b.display, lang));
}
