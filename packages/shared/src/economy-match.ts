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

// The style bucket on the comp and the plan name on the economy page are two
// vocabularies for one fact, so the plan is read off the comp's own tag: Reroll
// says which cost ladder to roll on, and Flex and Tempo — which have no ladder of
// their own — level up fast and roll at 8 like the Fast 8 plan does.
function planOf(comp: CompEconomyInput): string {
  if (comp.style === 'Reroll') return comp.carry.cost <= 3 ? `${comp.carry.cost}-Cost Reroll` : '3-Cost Reroll';
  if (comp.style === 'Flex' || comp.style === 'Tempo') return 'Fast 8';
  return comp.style;
}

// Two plans are the same plan when they roll at the same level. The published
// boards refine the name inside a family ("1 & 2-Cost Reroll") but never across
// one, so the family is what a match has to agree on.
const planFamily = (name: string) => (/reroll/i.test(name) ? 'reroll' : /fast\s*9/i.test(name) ? '9' : /fast\s*[78]/i.test(name) ? '8' : name);

export function economyForComp(
  comp: CompEconomyInput,
  economyComps: EconomyPlanComp[],
  strategies: EconomyPlanStrategy[]
): CompEconomy {
  const strategy = planOf(comp);
  // A carry is shared by several published boards and they do not all run the
  // same plan, so the best-overlap match only gets to name the plan when it is
  // already the plan this comp's tag claims. Taking the name from the match alone
  // put "Fast 8" beside a "Fast 9" rail tag on eight of the 54 boards.
  const match = matchEconomyComp(comp, economyComps);
  if (match && planFamily(match.comp.strategy!) === planFamily(strategy)) {
    return { strategy: match.comp.strategy!, source: 'tftflow', levelCurve: match.comp.levelCurve };
  }

  const plan = strategies.find((entry) => entry.name === strategy);
  return {
    strategy,
    source: 'derived',
    levelCurve: plan?.rounds.map((round) => ({ stage: round.round, text: round.text })) ?? [],
  };
}
