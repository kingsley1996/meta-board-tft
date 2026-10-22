import snapshot from './economy.json';

export type EconomyRound = { round: string; text: string };
export type EconomyLevelCurve = { stage: string; text: string };

export type EconomyStrategy = {
  id: string;
  name: string;
  rounds: EconomyRound[];
};

export type EconomyComp = {
  slug: string;
  name: string;
  tier: string | null;
  damageType: string | null;
  strategy: string | null;
  carry: string | null;
  carryCost: number | null;
  board: { apiName: string; name: string; cost: number | null; hexIndex: number }[];
  boardNames: string[];
  items: string[];
  augments: string[];
  tips: string[];
  levelCurve: EconomyLevelCurve[];
  url: string;
};

const economy = snapshot as unknown as {
  source: { provider: string; page: string; set: string; generatedAt: string | null; fetchedAt: string };
  strategies: EconomyStrategy[];
  comps: EconomyComp[];
};

export const economySource = economy.source;

export const economyStrategies: EconomyStrategy[] = economy.strategies;

export const economyStrategyByName: Record<string, EconomyStrategy> = Object.fromEntries(
  economy.strategies.map((strategy) => [strategy.name, strategy])
);

export const economyComps: EconomyComp[] = economy.comps;

// tftflow comps grouped by their carry, used to line a site comp up with the
// strategy the source site plays it with.
const byCarry = new Map<string, EconomyComp[]>();
for (const comp of economyComps) {
  if (!comp.carry) continue;
  byCarry.set(comp.carry, [...(byCarry.get(comp.carry) ?? []), comp]);
}

export type CompEconomy = {
  strategy: string;
  source: 'tftflow' | 'derived';
  levelCurve: EconomyLevelCurve[];
};

const overlap = (a: string[], b: string[]) => {
  const set = new Set(b);
  const hits = a.filter((name) => set.has(name)).length;
  return a.length ? hits / a.length : 0;
};

/**
 * Which economy strategy a comp plays.
 *
 * A tftflow comp with the same carry that shares most of its board wins; the
 * level curve of that comp is the comp's own curve. Otherwise the strategy is
 * derived from the comp's style and carry cost.
 */
export function economyForComp(comp: {
  style: string;
  carry: { name: string; cost: number };
  units: { name: string }[];
}): CompEconomy {
  const candidates = byCarry.get(comp.carry.name) ?? [];
  const names = comp.units.map((unit) => unit.name);
  const best = candidates
    .map((candidate) => ({ candidate, score: overlap(candidate.boardNames, names) }))
    .sort((a, b) => b.score - a.score)[0];

  if (best && best.score >= 0.5 && best.candidate.strategy) {
    return { strategy: best.candidate.strategy, source: 'tftflow', levelCurve: best.candidate.levelCurve };
  }

  if (comp.style === 'Reroll') {
    const cost = comp.carry.cost;
    const strategy = cost <= 3 ? `${cost}-Cost Reroll` : '3-Cost Reroll';
    return { strategy, source: 'derived', levelCurve: economyStrategyByName[strategy]?.rounds.map((round) => ({ stage: round.round, text: round.text })) ?? [] };
  }

  const strategy = comp.style === 'Flex' ? 'Fast 8' : comp.style;
  return {
    strategy,
    source: 'derived',
    levelCurve: economyStrategyByName[strategy]?.rounds.map((round) => ({ stage: round.round, text: round.text })) ?? [],
  };
}
