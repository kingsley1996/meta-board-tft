import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sharedDataPath } from '../src/shared-data.ts';

const read = (path: string | URL) => JSON.parse(readFileSync(path, 'utf8'));
const extras = read(sharedDataPath('comp-extras.json'));
const tft = read(sharedDataPath('tft.json'));
const comps = read(new URL('./comps.json', import.meta.url));

const champions = new Set<string>(tft.champions.map((champion: { name: string }) => champion.name));
const items = new Set<string>(tft.items.map((item: { name: string }) => item.name));
const augments = new Set<string>(tft.augments.map((augment: { name: string }) => augment.name));
const boards = new Map<string, Set<string>>(
  comps.map((comp: { slug: string; units: { name: string }[] }) => [comp.slug, new Set(comp.units.map((unit) => unit.name))])
);

test('comp extras resolve against the seed and the set data', () => {
  assert.match(extras.$source, /tftacademy/);
  assert.equal(extras.$set, tft.set.number);
  for (const [slug, extra] of Object.entries<any>(extras.comps)) {
    const board = boards.get(slug);
    assert.ok(board, `${slug} is not in comps.json`);
    if (extra.cover) {
      const known = (extra.cover.kind === 'item' ? items : augments).has(extra.cover.name);
      assert.ok(known, `${slug} cover ${extra.cover.name} is not a known ${extra.cover.kind}`);
    }
    for (const pair of extra.flex ?? []) {
      assert.ok(champions.has(pair.name), `${slug} flex unit ${pair.name} is not a champion`);
      assert.ok(champions.has(pair.replaces), `${slug} flex replaces ${pair.replaces} is not a champion`);
      assert.ok(board.has(pair.replaces), `${slug} flex replaces ${pair.replaces} who is not on the board`);
      assert.ok(!board.has(pair.name), `${slug} flex unit ${pair.name} is already on the board`);
    }
    for (const alt of extra.alt ?? []) {
      assert.ok(board.has(alt.name), `${slug} alt ${alt.name} is not on the board`);
      assert.ok(alt.items.length > 0 && alt.items.length <= 3, `${slug} alt ${alt.name} needs 1-3 items`);
      for (const item of alt.items) assert.ok(items.has(item), `${slug} alt ${alt.name} item ${item} is unknown`);
    }
  }
});
