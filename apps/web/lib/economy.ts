import snapshot from '@metaboard/shared/data/economy.json';
import { economyForComp as resolveEconomyForComp } from '@metaboard/shared/economy-match';
import type { CompEconomy, CompEconomyInput } from '@metaboard/shared/economy-match';

export type { CompEconomy };

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

/**
 * Which economy strategy a comp plays.
 *
 * A tftflow comp with the same carry that shares most of its board wins; the
 * level curve of that comp is the comp's own curve. Otherwise the strategy is
 * derived from the comp's style and carry cost.
 */
export function economyForComp(comp: CompEconomyInput): CompEconomy {
  return resolveEconomyForComp(comp, economyComps, economyStrategies);
}
