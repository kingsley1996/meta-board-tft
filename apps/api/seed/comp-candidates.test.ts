import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { candidatePayload, readCandidateFile, type CompCandidate } from '../src/comp-candidates.ts';
import { sharedDataPath } from '../src/shared-data.ts';

const read = (path: string | URL) => JSON.parse(readFileSync(path, 'utf8'));
const tft = read(sharedDataPath('tft.json'));

const champions = new Set<string>(tft.champions.map((champion: { name: string }) => champion.name));
const items = new Set<string>(tft.items.map((item: { name: string }) => item.name));
const augments = new Set<string>(tft.augments.map((augment: { name: string }) => augment.name));

// The crawler output is the fixture: a stale or hand-edited file is exactly what
// an admin would approve into the tier list, so the shape is checked here instead
// of at write time.
const candidates = read(new URL('./comp-candidates.json', import.meta.url)).candidates as CompCandidate[];

test('the candidate file keeps only boards the ship rule refused', async () => {
  const file = await readCandidateFile();
  assert.deepEqual(file.candidates, candidates);
  assert.ok(candidates.length > 0, 'the crawler wrote no candidates');
  assert.equal(file.set, tft.set.number);
  assert.ok((file.minSources ?? 0) >= 2);

  assert.equal(candidates.length, new Set(candidates.map((c) => c.slug)).size, 'duplicate slug');
  for (const candidate of candidates) {
    const tooFewSources = candidate.sourceCount < (file.minSources ?? 1);
    assert.ok(tooFewSources || candidate.gaps.length > 0, `${candidate.slug} should have shipped`);
    assert.equal(candidate.sourceCount, candidate.sources.length);
  }
});

test('every source behind a board is credited with the tier it publishes', () => {
  for (const candidate of candidates) {
    assert.deepEqual(
      [...new Set(candidate.links.map((link) => link.source))].sort(),
      [...candidate.sources].sort(),
      `${candidate.slug} links do not cover its sources`,
    );
    for (const link of candidate.links) {
      assert.ok(link.name, `${candidate.slug} has a source row with no name`);
      assert.ok(link.tier, `${candidate.slug} / ${link.source} has no tier`);
    }
  }
});

test('candidate boards resolve against the set catalog', () => {
  for (const candidate of candidates) {
    assert.ok(candidate.units.length >= 3 && candidate.units.length <= 12, `${candidate.slug} has ${candidate.units.length} units`);
    assert.equal(new Set(candidate.units.map((unit) => unit.name)).size, candidate.units.length, `${candidate.slug} repeats a unit`);
    for (const unit of candidate.units) {
      assert.ok(champions.has(unit.name), `${candidate.slug} unit ${unit.name} is not a champion`);
      assert.equal(unit.row === null, unit.col === null, `${candidate.slug} ${unit.name} has a half placement`);
      for (const item of unit.items) assert.ok(items.has(item), `${candidate.slug} ${unit.name} item ${item} is unknown`);
    }
    assert.ok(candidate.units.some((unit) => unit.name === candidate.carry), `${candidate.slug} carries someone off the board`);
    for (const name of candidate.items) assert.ok(items.has(name), `${candidate.slug} item ${name} is unknown`);
    for (const name of candidate.augments) assert.ok(augments.has(name), `${candidate.slug} augment ${name} is unknown`);
  }
});

test('a candidate maps onto a payload the comp validator reads', () => {
  for (const candidate of candidates) {
    const payload = candidatePayload(candidate) as Record<string, unknown>;
    // The screen tells the admin which fields block an approve, so an empty one
    // has to be a named gap: these arrays are the ones the validator refuses.
    for (const key of ['early', 'items', 'augments'] as const) {
      if (candidate[key].length === 0) {
        assert.ok(candidate.gaps.includes(key), `${candidate.slug} is empty on ${key} with no gap to say so`);
      }
    }
    // Stage texts flatten to strings in the order the validator labels them.
    assert.deepEqual(payload.stages, candidate.stages.map((stage) => stage.text));
    assert.deepEqual(payload.matchups, []);
    // Alt rows keep their stars and item set, which the admin form cannot edit.
    assert.deepEqual(payload.alt, candidate.alt);
  }
});
