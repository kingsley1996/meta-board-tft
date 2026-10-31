import type { Lang } from './i18n';
import type { Tier } from './tiers';

export type CompMapRow = {
  slug: string;
  name: string;
  tier: Tier;
  // Share of every tracked comp game, in percent. A comp's `games` counts each
  // match once, so the sum of shares is 100.
  pick: number;
  avg: number;
  games: number;
  carry: string;
  icon: string | null;
};

type RawComp = {
  slug: string;
  title: string;
  titleVi?: string | null;
  tier: string;
  carry: string;
  stats: { games: number; avg: number };
};

type RawChampion = { name: string; icon: string | null };

export function buildCompMapRows(
  comps: RawComp[],
  champions: RawChampion[],
  lang: Lang,
): { rows: CompMapRow[]; totalGames: number } {
  const championIcon = new Map(champions.map((champion) => [champion.name, champion.icon]));
  const totalGames = comps.reduce((sum, comp) => sum + comp.stats.games, 0);
  const rows = comps
    .map((comp) => ({
      slug: comp.slug,
      name: lang === 'vi' && comp.titleVi ? comp.titleVi : comp.title,
      tier: comp.tier as Tier,
      pick: totalGames ? (comp.stats.games / totalGames) * 100 : 0,
      avg: comp.stats.avg,
      games: comp.stats.games,
      carry: comp.carry,
      icon: championIcon.get(comp.carry) ?? null,
    }))
    .sort((a, b) => b.games - a.games);

  return { rows, totalGames };
}
