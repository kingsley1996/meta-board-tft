export type EconomyPlanRound = { round: string; text: string };
export type EconomyLevelCurve = { stage: string; text: string };

export type EconomyPlanStrategy = {
  name: string;
  rounds: EconomyPlanRound[];
};

export type EconomyPlanComp = {
  slug: string;
  name: string;
  strategy: string | null;
  carry: string | null;
  boardNames: string[];
  levelCurve: EconomyLevelCurve[];
  tips: string[];
};

export type CompEconomyInput = {
  style: string;
  carry: { name: string; cost: number };
  units: { name: string }[];
};

export type CompEconomyMatch = {
  comp: EconomyPlanComp;
  score: number;
};

export type CompEconomy = {
  strategy: string;
  source: 'tftflow' | 'derived';
  levelCurve: EconomyLevelCurve[];
};

function overlap(a: string[], b: string[]): number {
  const set = new Set(b);
  const hits = a.filter((name) => set.has(name)).length;
  return a.length ? hits / a.length : 0;
}

export function matchEconomyComp(comp: CompEconomyInput, economyComps: EconomyPlanComp[]): CompEconomyMatch | null {
  const names = comp.units.map((unit) => unit.name);
  const best = economyComps
    .filter((candidate) => candidate.carry === comp.carry.name)
    .map((candidate) => ({ comp: candidate, score: overlap(candidate.boardNames, names) }))
    .sort((a, b) => b.score - a.score)[0];
  return best && best.score >= 0.5 && best.comp.strategy ? best : null;
}

export function economyForComp(
  comp: CompEconomyInput,
  economyComps: EconomyPlanComp[],
  strategies: EconomyPlanStrategy[]
): CompEconomy {
  const match = matchEconomyComp(comp, economyComps);
  if (match) {
    return { strategy: match.comp.strategy!, source: 'tftflow', levelCurve: match.comp.levelCurve };
  }

  const strategy =
    comp.style === 'Reroll'
      ? comp.carry.cost <= 3
        ? `${comp.carry.cost}-Cost Reroll`
        : '3-Cost Reroll'
      : comp.style === 'Flex'
        ? 'Fast 8'
        : comp.style;
  const plan = strategies.find((entry) => entry.name === strategy);
  return {
    strategy,
    source: 'derived',
    levelCurve: plan?.rounds.map((round) => ({ stage: round.round, text: round.text })) ?? [],
  };
}
