import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { readSnapshot } from './tft.ts';
import { sharedDataPath } from './shared-data.ts';

test('the catalog is built from the committed snapshot', async () => {
  const data = await readSnapshot();
  const raw = JSON.parse(readFileSync(sharedDataPath('tft.json'), 'utf8'));

  assert.equal(data.champions.length, raw.champions.length);
  assert.equal(data.traits.length, raw.traits.length);
  assert.equal(data.items.length, raw.items.length);
  assert.equal(data.augments.length, raw.augments.length);
});

test('rows carry the columns the catalog tables insert', async () => {
  const data = await readSnapshot();

  for (const champion of data.champions.slice(0, 20)) {
    assert.equal(typeof champion.api_name, 'string');
    assert.match(champion.icon, /^\/tft\/champions\/[a-z0-9.-]+\.png$/);
    assert.ok(Array.isArray(champion.traits));
  }
  for (const trait of data.traits.slice(0, 20)) {
    assert.equal(trait.thresholds.length, trait.styles.length);
    assert.ok(trait.thresholds.every((value: number) => Number.isInteger(value)));
  }
  for (const item of data.items.slice(0, 20)) {
    assert.ok(Array.isArray(item.composition));
    assert.match(item.icon, /^\/tft\/items\//);
  }
  for (const augment of data.augments.slice(0, 20)) {
    assert.ok(augment.rarity === null || [1, 2, 3].includes(augment.rarity));
  }
});

test("the patch label is MetaTFT's, and provenance rides with it", async () => {
  const data = await readSnapshot();
  const meta = JSON.parse(readFileSync(sharedDataPath('meta.json'), 'utf8'));

  assert.equal(data.patch, meta.source.patch);
  assert.equal(data.provenance.metatft_fetched_at, String(meta.source.fetchedAt));
});

test('the release id is stable for one snapshot and 12 hex chars', async () => {
  const first = await readSnapshot();
  const second = await readSnapshot();

  assert.match(first.release, /^[0-9a-f]{12}$/);
  assert.equal(first.release, second.release);
});
