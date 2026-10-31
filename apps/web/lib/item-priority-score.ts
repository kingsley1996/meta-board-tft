export type PriorityBucket = 'core' | 'strong' | 'situational' | 'overpicked';

// A thin sample overstates an item's effect, so the gain is shrunk toward zero
// by the item's game count. Thresholds are exposed so the method copy and the
// test read the same numbers as the ranking.
export const PRIORITY = {
  shrink: 10_000,
  minGames: 2_000,
  minShare: 0.005,
  minArtifactGames: 1_000,
  minEmblemGames: 1_000,
  minEmblemShare: 0.002,
  core: 0.35,
  strong: 0.2,
  situational: 0.05,
  overpickedShare: 0.04,
  maxComps: 4,
  maxArtifacts: 3,
  maxEmblems: 3,
} as const;

export function bucketFor(gain: number, share: number): PriorityBucket | null {
  if (gain >= PRIORITY.core) return 'core';
  if (gain >= PRIORITY.strong) return 'strong';
  if (gain > PRIORITY.situational) return 'situational';
  if (share >= PRIORITY.overpickedShare) return 'overpicked';
  return null;
}

/** Placement places gained by holding the item, shrunk for small samples. */
export function shrinkGain(placeChange: number, count: number): number {
  const gain = -placeChange;
  return (gain * count) / (count + PRIORITY.shrink);
}
