import test from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogEntity, CompData } from './contracts.ts';
import { compStats, entityStats, loadMetaStats } from './meta-stats.ts';

test('loads public MetaTFT stats for items and units', async () => {
  const meta = await loadMetaStats();
  const item = { id: 'item:DA_18_EmblemFae', type: 'item', name: 'Fae Emblem' } as unknown as CatalogEntity;
  const itemStats = entityStats(meta, item, 'vi');
  assert.ok(itemStats);
  assert.match(itemStats.text, /MetaTFT/);
  assert.match(itemStats.text, /4,48/);
  assert.match(itemStats.text, /49,9%/);

  const champion = { id: 'champion:DA_18_Ahri', type: 'champion', name: 'Ahri' } as unknown as CatalogEntity;
  const championStats = entityStats(meta, champion, 'en');
  assert.ok(championStats);
  assert.match(championStats.text, /50\.8% top 4/);
});

test('loads public MetaTFT stats for comps', async () => {
  const meta = await loadMetaStats();
  const comp = { slug: 'tristana-sprykin-reroll', title: 'Tristana Fae' } as unknown as CompData;
  const stats = compStats(meta, comp, 'en');
  assert.ok(stats);
  assert.match(stats.text, /MetaTFT/);
  assert.match(stats.text, /games/);
});
