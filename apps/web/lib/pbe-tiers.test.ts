import test from 'node:test';
import assert from 'node:assert/strict';
import { tierBands } from './pbe-tiers.ts';
import { tierRank } from './tiers.ts';

// 61 averages in the shape the PBE pool has: best 3.55, worst 6.16.
const avgs = Array.from({ length: 61 }, (_, index) => 3.55 + index * 0.0435);

test('every band holds at least one comp', () => {
  const tierOf = tierBands(avgs);
  for (const tier of ['S', 'A', 'B', 'C', 'D']) {
    assert.ok(avgs.some((avg) => tierOf(avg) === tier), `${tier} row is empty`);
  }
});

test('a better average never lands in a worse tier', () => {
  const tierOf = tierBands(avgs);
  const ranked = [...avgs].sort((a, b) => a - b).map((avg) => tierOf(avg));
  for (let index = 1; index < ranked.length; index += 1) {
    assert.ok(tierRank.indexOf(ranked[index]) >= tierRank.indexOf(ranked[index - 1]), `${ranked[index]} sits under ${ranked[index - 1]}`);
  }
});

test('the bands follow the pool instead of a fixed cut-off', () => {
  const easy = tierBands(avgs.map((avg) => avg + 2));
  assert.ok(avgs.every((avg) => easy(avg + 2) === tierBands(avgs)(avg)), 'a shift moves every band with it');
});
