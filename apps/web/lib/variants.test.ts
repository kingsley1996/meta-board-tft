import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compVariants, variantRows } from './variants.ts';
import type { Tier } from './tiers.ts';

const comp = (slug: string, carry: string, tier: Tier) => ({ slug, title: slug, tier, carry: { name: carry } });

describe('comp variants', () => {
  it('groups comps by carry and sorts them by tier', () => {
    const comps = [comp('ez-b', 'Ezreal', 'B'), comp('other', 'Ahri', 'S'), comp('ez-s', 'Ezreal', 'S')];
    assert.deepEqual(compVariants(comps, 'ez-b').map((entry) => entry.slug), ['ez-s', 'ez-b']);
  });

  it('returns nothing when the carry has no sibling', () => {
    const comps = [comp('ahri', 'Ahri', 'A'), comp('ezreal', 'Ezreal', 'B')];
    assert.deepEqual(compVariants(comps, 'ahri'), []);
  });

  it('splits a hand-mapped pair and leaves the rest of the carry group', () => {
    const comps = [comp('pebbles-reroll', 'Pebbles', 'X'), comp('riftbeast-tempo', 'Pebbles', 'A'), comp('pebbles-third', 'Pebbles', 'B')];
    assert.deepEqual(compVariants(comps, 'pebbles-reroll').map((entry) => entry.slug), ['pebbles-third', 'pebbles-reroll']);
    assert.deepEqual(compVariants(comps, 'riftbeast-tempo').map((entry) => entry.slug), ['riftbeast-tempo', 'pebbles-third']);
  });

  it('returns nothing for an unknown slug', () => {
    assert.deepEqual(compVariants([comp('ahri', 'Ahri', 'A')], 'missing'), []);
  });

  it('keeps one row per variant group and counts the rest as siblings', () => {
    const comps = [comp('ez-s', 'Ezreal', 'S'), comp('ez-b', 'Ezreal', 'B'), comp('ahri', 'Ahri', 'A')];
    const rows = variantRows(comps);
    assert.deepEqual(
      rows.map((row) => [row.comp.slug, row.lead, row.siblings]),
      [
        ['ez-s', true, 1],
        ['ez-b', false, 1],
        ['ahri', true, 0],
      ]
    );
  });

  it('promotes the best comp left when a filter drops the lead', () => {
    const all = [comp('ez-s', 'Ezreal', 'S'), comp('ez-b', 'Ezreal', 'B')];
    const rows = variantRows(all.slice(1));
    assert.deepEqual(
      rows.map((row) => [row.comp.slug, row.lead, row.siblings]),
      [['ez-b', true, 0]]
    );
  });
});
