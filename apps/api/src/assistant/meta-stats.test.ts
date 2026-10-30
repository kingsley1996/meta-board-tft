import test from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogEntity, CompData } from './contracts.ts';
import { compStats, entityStats, itemUsageStats, loadMetaStats, unitBuildStats } from './meta-stats.ts';

test('loads public TFTIQ stats for items and units', async () => {
  const meta = await loadMetaStats();
  const item = { id: 'item:DA_18_EmblemFae', type: 'item', name: 'Fae Emblem' } as unknown as CatalogEntity;
  const itemStats = entityStats(meta, item, 'vi');
  assert.ok(itemStats);
  assert.match(itemStats.text, /TFTIQ/);
  // Stats refresh with every meta.json update — assert shape, not exact numbers.
  assert.match(itemStats.text, /\d+,\d{2}/); // avg place, e.g. 4,39
  assert.match(itemStats.text, /\d+,\d+%/); // top-4 rate, e.g. 51,6%
  const champion = { id: 'champion:DA_18_Ahri', type: 'champion', name: 'Ahri' } as unknown as CatalogEntity;
  const championStats = entityStats(meta, champion, 'en');
  assert.ok(championStats);
  assert.match(championStats.text, /\d+% top 4/);
});

test('loads public TFTIQ stats for comps', async () => {
  const meta = await loadMetaStats();
  const comp = { slug: 'tristana-sprykin-reroll', title: 'Tristana Fae' } as unknown as CompData;
  const stats = compStats(meta, comp, 'en');
  assert.ok(stats);
  assert.match(stats.text, /TFTIQ/);
  assert.match(stats.text, /games/);
});

test('unitBuildStats returns winrate-backed builds for a champion with build data', async () => {
  const meta = await loadMetaStats();
  const entity = { type: 'champion', name: 'Akali' } as unknown as CatalogEntity;
  const evidence = unitBuildStats(meta, entity);
  assert.ok(evidence);
  assert.equal(evidence.champion, 'Akali');
  assert.ok(evidence.unitGames > 0);
  assert.ok(evidence.builds.length > 0);
  for (const build of evidence.builds) {
    assert.ok(build.items.length >= 1 && build.items.length <= 3);
    assert.ok(build.count > 0);
    assert.ok(build.avg > 0 && build.avg < 9);
  }
  assert.ok(evidence.itemStats.length > 0);
  // Non-champion entities never produce unit builds.
  assert.equal(unitBuildStats(meta, { type: 'item', name: 'Akali' } as unknown as CatalogEntity), null);
});

test('itemUsageStats returns top holders and stage win rates for an item with data', async () => {
  const meta = await loadMetaStats();
  const entity = { type: 'item', name: 'Edge of Night' } as unknown as CatalogEntity;
  const evidence = itemUsageStats(meta, entity);
  assert.ok(evidence);
  assert.equal(evidence.item, 'Edge of Night');
  assert.ok(evidence.unitGames > 0);
  assert.ok(evidence.topChampions.length > 0);
  for (const holder of evidence.topChampions) {
    assert.ok(holder.count > 0);
    assert.ok(holder.avg > 0 && holder.avg < 9);
  }
  // Stage win rates are computed from raw counts and stay in (0, 1].
  for (const stage of evidence.stages) {
    assert.ok(stage.games > 0);
    assert.ok(stage.winRate > 0 && stage.winRate <= 1);
  }
  // Non-item entities never produce item usage.
  assert.equal(itemUsageStats(meta, { type: 'champion', name: 'Edge of Night' } as unknown as CatalogEntity), null);
});
