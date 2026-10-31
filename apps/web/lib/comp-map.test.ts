import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildCompMapRows } from './comp-map-core.ts';
import type { Lang } from './i18n.ts';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../../../packages/shared/data/${name}`, import.meta.url), 'utf8'));
const meta = read('meta.json');
const tft = read('tft.json');

const map = (lang: Lang) => buildCompMapRows(meta.comps, tft.champions, lang);

describe('comp map rows', () => {
  it('turns per-comp games into a share that sums to 100', () => {
    const { rows, totalGames } = map('en');
    const total = rows.reduce((sum, row) => sum + row.games, 0);
    assert.equal(total, totalGames);
    const share = rows.reduce((sum, row) => sum + row.pick, 0);
    assert.ok(Math.abs(share - 100) < 1e-9);
    for (const row of rows) {
      assert.ok(Math.abs(row.pick - (row.games / totalGames) * 100) < 1e-9);
    }
  });

  it('gives every bubble a carry avatar', () => {
    const { rows } = map('en');
    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.ok(row.icon, `${row.slug} carries ${row.carry} without an icon`);
    }
  });

  it('localizes the comp name without touching the numbers', () => {
    const en = map('en').rows;
    const bySlug = new Map(map('vi').rows.map((row) => [row.slug, row]));
    for (const row of en) {
      const twin = bySlug.get(row.slug);
      assert.ok(twin);
      assert.equal(twin.avg, row.avg);
      assert.equal(twin.games, row.games);
      assert.equal(twin.tier, row.tier);
    }
    assert.ok(bySlug.size === en.length);
  });

  it('sorts the most played comps first', () => {
    const games = map('en').rows.map((row) => row.games);
    assert.deepEqual(games, [...games].sort((a, b) => b - a));
  });
});
