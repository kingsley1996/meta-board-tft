import type { Tier } from './tiers.ts';

// Average placement is the only quality signal PBE has, so it doubles as the tier band. Fixed
// cut-offs drift with the patch: the best PBE comp on 24/11 averaged 3.55 while the live editorial
// S line was 3.4, so the whole board rendered without an S row. The bands come from the pool's own
// spread instead, which survives a patch that shifts every average and keeps S meaning "the top of
// what is being played right now": 10% S, 30% down to A, 60% down to B, 85% down to C, the rest D.
export function tierBands(avgs: number[]): (avg: number) => Tier {
  const sorted = [...avgs].sort((a, b) => a - b);
  const cutAt = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
  const cuts = { S: cutAt(0.1), A: cutAt(0.3), B: cutAt(0.6), C: cutAt(0.85) };
  return (avg) => (avg <= cuts.S ? 'S' : avg <= cuts.A ? 'A' : avg <= cuts.B ? 'B' : avg <= cuts.C ? 'C' : 'D');
}
