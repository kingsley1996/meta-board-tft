import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SECTION_KEYS,
  changedSections,
  desiredSections,
  storedSections,
  type CompRow,
  type StoredComp,
} from './comp-provenance.ts';
import type { CompInput } from './comps.ts';

const boardUnit = (name: string, row: number | null = null, col: number | null = null, stars: number | null = null, items: string[] = []) => ({
  name,
  row,
  col,
  stars,
  items,
});

const comp: CompInput = {
  slug: 'ashe-reroll',
  title: 'Ashe Reroll',
  titleVi: 'Ashe Cược',
  tier: 'S',
  situational: true,
  style: 'Reroll',
  difficulty: 2,
  trend: 'up',
  playstyle: 'Slow roll at 7.',
  playstyleVi: 'Roll chậm ở 7.',
  units: [boardUnit('Ashe', 2, 3, 2, ['BFS']), boardUnit('Blitzcrank', 0, 3)],
  early: ['Ashe', 'Sona'],
  carry: 'Ashe',
  cover: { kind: 'item', name: 'BFS' },
  items: ['BFS', 'Hand'],
  augments: ['Artful', 'Blast'],
  tips: 'Only with a BF.',
  tipsVi: 'Cần BF.',
  stages: [
    { stage: 'Stage 2', text: 'Open with Ashe.', textVi: 'Mở bằng Ashe.' },
    { stage: 'Stage 4', text: 'Roll at 7.', textVi: null },
  ],
  alt: [{ name: 'Ziggs', stars: 2, items: ['Janniton'] }],
  augmentTypes: ['ITEMS', 'ECON'],
  matchups: [{ slug: 'garen-aura', kind: 'good' }],
};

// The row + child rows writeComp would leave behind, so the "already matching"
// case is the real one rather than a hand-written fixture that happens to agree.
function asStored(input: CompInput): StoredComp {
  const row: CompRow = {
    slug: input.slug,
    title: input.title,
    title_vi: input.titleVi ?? null,
    tier: input.tier,
    situational: input.situational,
    style: input.style,
    difficulty: input.difficulty,
    trend: input.trend,
    playstyle: input.playstyle,
    playstyle_vi: input.playstyleVi,
    carry: input.carry,
    cover: input.cover,
    tips: input.tips,
    tips_vi: input.tipsVi,
    augment_types: input.augmentTypes,
    matchups: input.matchups,
    votes: 0,
    views: 0,
  };
  return {
    row,
    units: [
      ...input.units.map((unit) => ({ role: 'board', ...unit })),
      ...input.early.map((name) => ({ role: 'early', name, row: null, col: null, stars: null, items: [] })),
      ...input.alt.map((unit) => ({ role: 'alt', name: unit.name, row: null, col: null, stars: unit.stars, items: unit.items })),
    ],
    items: input.items,
    augments: input.augments,
    stages: input.stages.map((stage) => ({ stage: Number(stage.stage.replace(/\D+/g, '')), text: stage.text, text_vi: stage.textVi })),
  };
}

describe('comp provenance diff', () => {
  it('finds no drift when the row came from the payload', () => {
    assert.deepEqual(changedSections(desiredSections(comp), storedSections(asStored(comp))), []);
  });

  it('names only the section a hand edit touched', () => {
    const stored = asStored(comp);
    stored.units[1].col = 5;
    assert.deepEqual(changedSections(desiredSections(comp), storedSections(stored)), ['board']);
  });

  it('reads a tier change as rating, not copy', () => {
    const stored = asStored(comp);
    stored.row.tier = 'A';
    stored.row.situational = false;
    assert.deepEqual(changedSections(desiredSections(comp), storedSections(stored)), ['rating']);
  });

  it('compares stage numbering the way writeComp stores it', () => {
    const stored = asStored(comp);
    stored.stages[1].text = 'Roll at 8.';
    assert.deepEqual(changedSections(desiredSections(comp), storedSections(stored)), ['stages']);
  });

  it('ignores augment-type order but not its content', () => {
    const reordered = asStored(comp);
    reordered.row.augment_types = ['ECON', 'ITEMS'];
    assert.deepEqual(changedSections(desiredSections(comp), storedSections(reordered)), []);
    const shorter = asStored(comp);
    shorter.row.augment_types = ['ITEMS'];
    assert.deepEqual(changedSections(desiredSections(comp), storedSections(shorter)), ['types']);
  });

  it('keeps the ten sections the seed script can rewrite', () => {
    assert.deepEqual(SECTION_KEYS, ['board', 'early', 'alt', 'items', 'augments', 'types', 'stages', 'copy', 'rating', 'matchups']);
  });
});
