import test from 'node:test';
import assert from 'node:assert/strict';
import pbe from '@tftiq/shared/data/pbe.json' with { type: 'json' };
import tft from '@tftiq/shared/data/tft.json' with { type: 'json' };
import type { PbeFile } from '@tftiq/shared/patch-notes';
import { previewSeason, type SeasonFile, type UpcomingSeason } from './season-window.ts';

// Self-contained fixtures: the window is a state the fetched feed decides, so the numbers here
// belong to the fixture rather than to whatever season is shipping today.
const LIVE = 18;
const NEXT = LIVE + 1;
const season = (upcoming: UpcomingSeason | null = null): SeasonFile => ({ number: LIVE, upcoming });
const LABEL = { number: NEXT, name: { en: 'Coming Season', vi: 'Mùa Sắp Tới' } };

test('a mid-set preview describes the season already live, so no name is needed', () => {
  assert.equal(previewSeason(season(), LIVE), null);
  assert.equal(previewSeason(season(), null), null);
});

test('a cross-set window names the season the feed carries', () => {
  assert.deepEqual(previewSeason(season(LABEL), NEXT), LABEL);
});

test('a window with no name to show fails the build instead of printing a seasonless board', () => {
  assert.throws(() => previewSeason(season(), NEXT), /chưa ghi tên/);
});

test('a label for the wrong season is the data’s number, not the typed one', () => {
  assert.throws(() => previewSeason(season({ number: NEXT + 1, name: LABEL.name }), NEXT), new RegExp(`upcoming ghi mùa ${NEXT + 1}`));
});

test('the label is deleted on launch day, so one left behind fails the build', () => {
  assert.throws(() => previewSeason(season(LABEL), LIVE), /xoá "upcoming"/);
  assert.throws(() => previewSeason(season(LABEL), null), /xoá "upcoming"/);
});

// D8-3, read off the artifact the app actually publishes: a row may only link to a page the live
// catalog generated, because `[lang]/layout.tsx` sets dynamicParams = false and a link to a
// season that has no routes is a 404 on the board that is supposed to build anticipation.
test('the preview board publishes only slugs the live catalog has a page for', () => {
  const board = pbe as unknown as PbeFile;
  const live = new Set([...tft.champions, ...tft.traits, ...tft.items, ...tft.augments].map((row) => row.slug));
  for (const row of [...board.rows, ...board.added, ...board.removed]) {
    if (!row.slug) continue;
    assert.ok(live.has(row.slug), `${row.slug} has no route while the live game is on set ${tft.set.number}`);
  }
});
