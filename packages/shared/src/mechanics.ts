// Set 18 system tables (patch 18.4). Values cross-checked against MetaTFT /
// TFTFlow / LoL Wiki tables — these are game rules, not our statistics, so the
// site only mirrors them: the game stays the source of truth.
export const mechanicsPatch = '18.4';

export const shopOdds: { level: number; odds: number[] }[] = [
  { level: 1, odds: [100, 0, 0, 0, 0] },
  { level: 2, odds: [100, 0, 0, 0, 0] },
  { level: 3, odds: [75, 25, 0, 0, 0] },
  { level: 4, odds: [55, 30, 15, 0, 0] },
  { level: 5, odds: [45, 33, 20, 2, 0] },
  { level: 6, odds: [30, 40, 25, 5, 0] },
  { level: 7, odds: [16, 30, 43, 10, 1] },
  { level: 8, odds: [15, 20, 32, 30, 3] },
  { level: 9, odds: [10, 17, 25, 33, 15] },
  { level: 10, odds: [5, 10, 20, 40, 25] },
  { level: 11, odds: [1, 2, 12, 50, 35] },
];

// XP needed to reach each level (2 XP free every round, 4 XP costs 4 gold).
// Matches the Set 18 leveling table published on tftflow (7→8 costs 56 XP).
export const xpTable: { level: number; xp: number }[] = [
  { level: 2, xp: 2 },
  { level: 3, xp: 2 },
  { level: 4, xp: 6 },
  { level: 5, xp: 10 },
  { level: 6, xp: 20 },
  { level: 7, xp: 36 },
  { level: 8, xp: 56 },
  { level: 9, xp: 68 },
  { level: 10, xp: 68 },
];

export const poolSizes: { cost: number; copies: number; distinct: number }[] = [
  { cost: 1, copies: 30, distinct: 14 },
  { cost: 2, copies: 25, distinct: 13 },
  { cost: 3, copies: 18, distinct: 14 },
  { cost: 4, copies: 10, distinct: 14 },
  { cost: 5, copies: 9, distinct: 10 },
];

export const incomeBase: { rounds: string; gold: number }[] = [
  { rounds: '1-2', gold: 2 },
  { rounds: '1-3', gold: 2 },
  { rounds: '1-4', gold: 3 },
  { rounds: '2-1', gold: 4 },
  { rounds: '2-2+', gold: 5 },
];

export const interest: { hold: string; gold: number }[] = [
  { hold: '0-9', gold: 0 },
  { hold: '10-19', gold: 1 },
  { hold: '20-29', gold: 2 },
  { hold: '30-39', gold: 3 },
  { hold: '40-49', gold: 4 },
  { hold: '50+', gold: 5 },
];

export const streakBonus: { streak: string; gold: number }[] = [
  { streak: '2', gold: 1 },
  { streak: '3', gold: 1 },
  { streak: '4', gold: 1 },
  { streak: '5', gold: 2 },
  { streak: '6+', gold: 3 },
];
