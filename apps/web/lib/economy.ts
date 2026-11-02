import snapshot from '@tftiq/shared/data/economy.json';
import { economyForComp as resolveEconomyForComp } from '@tftiq/shared/economy-match';
import type { CompEconomy, CompEconomyInput } from '@tftiq/shared/economy-match';

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
 * The comp's own style tag names the plan, so the chip beside the rail tag can
 * never read a different level. A tftflow comp with the same carry that shares
 * most of its board only gets to refine that name — and bring its own level
 * curve — while it stays inside the same family of plans.
 */
export function economyForComp(comp: CompEconomyInput): CompEconomy {
  return resolveEconomyForComp(comp, economyComps, economyStrategies);
}
