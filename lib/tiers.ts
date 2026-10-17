export type Tier = 'S' | 'A' | 'B' | 'C' | 'X';

export const tierRank: Tier[] = ['S', 'A', 'B', 'C', 'X'];
export const tierLabels: Record<Tier, string> = { S: 'Top meta', A: 'Strong', B: 'Solid', C: 'Conditional', X: 'Situational' };
