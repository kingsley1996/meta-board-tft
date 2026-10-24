import test from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogEntity, CompData } from './contracts.ts';
import { compStats, entityStats, loadMetaStats } from './meta-stats.ts';

test('loads public MetaBoard stats for items and units', async () => {
  const meta = await loadMetaStats();
  const item = { id: 'item:DA_18_EmblemFae', type: 'item', name: 'Fae Emblem' } as unknown as CatalogEntity;
  const itemStats = entityStats(meta, item, 'vi');
  assert.ok(itemStats);
  assert.match(itemStats.text, /MetaBoard/);
  // Stats refresh with every meta.json update — assert shape, not exact numbers.
  assert.match(itemStats.text, /\d+,\d{2}/); // avg place, e.g. 4,39
  assert.match(itemStats.text, /\d+,\d+%/); // top-4 rate, e.g. 51,6%
  const champion = { id: 'champion:DA_18_Ahri', type: 'champion', name: 'Ahri' } as unknown as CatalogEntity;
  const championStats = entityStats(meta, champion, 'en');
  assert.ok(championStats);
  assert.match(championStats.text, /\d+% top 4/);
});

test('loads public MetaBoard stats for comps', async () => {
  const meta = await loadMetaStats();
  const comp = { slug: 'tristana-sprykin-reroll', title: 'Tristana Fae' } as unknown as CompData;
  const stats = compStats(meta, comp, 'en');
  assert.ok(stats);
  assert.match(stats.text, /MetaBoard/);
  assert.match(stats.text, /games/);
});
