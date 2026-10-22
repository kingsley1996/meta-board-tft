import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStaticGameData } from './static-game-data.ts';

test('static game data exposes champion abilities, mana and localized names', async () => {
  const data = await loadStaticGameData();
  const ahri = data.champions.find((champion) => champion.name === 'Ahri');

  assert.ok(ahri);
  assert.equal(ahri.mana?.max, 100);
  assert.equal(ahri.ability?.name, 'Spirit Bomb');
  assert.ok(ahri.ability?.desc);
  assert.ok(ahri.nameVi);
});

test('static game data includes set, items and augments', async () => {
  const data = await loadStaticGameData();
  assert.equal(data.set.number, 18);
  assert.ok(data.traits.length > 0);
  assert.equal(data.items.find((item) => item.name === "Guinsoo's Rageblade")?.composition?.length, 2);
  assert.ok(data.augments.some((augment) => augment.name === 'Cursed Crown'));
});
