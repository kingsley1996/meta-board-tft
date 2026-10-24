export type Tier = 'S' | 'A' | 'B' | 'C' | 'D' | 'X';

// X is reserved for situational COMPS only; items and augments bottom out at D.
export const tierRank: Tier[] = ['S', 'A', 'B', 'C', 'D', 'X'];
