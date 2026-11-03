import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// Node needs the attribute; Next resolves the same import in the app through its own loader.
import patchNotes from '@tftiq/shared/data/patch-notes.json' with { type: 'json' };
import { cardGroups, countEntities, DIRECTIONS, ENTITY_KINDS, type PatchArticleRow } from '@tftiq/shared/patch-notes';
import { DIRECTION_TONE, entityHref, patchToSlug, rowsOf, slugToPatch, textOf } from './patches.ts';

const row = (over: Partial<PatchArticleRow>): PatchArticleRow => ({
  ref: 'DA_18_Ahri',
  slug: 'da-18-ahri',
  kind: 'champion',
  table: 'champions',
  name: { en: 'Ahri' },
  icon: '/tft/champions/da-18-ahri.png',
  cost: 4,
  day: null,
  dayDate: null,
  heading: 'UNITS: TIER 4',
  field: { en: 'Ability Damage' },
  from: '100',
  to: '120',
  direction: 'buff',
  ...over,
});

describe('patch slug', () => {
  it('round-trips the number the URL carries', () => {
    assert.equal(patchToSlug('18.5'), 'patch-18-5');
    assert.equal(slugToPatch('patch-18-5'), '18.5');
    assert.equal(slugToPatch(patchToSlug('18.5c')), '18.5c');
  });
});

describe('entityHref', () => {
  it('links the kinds that have a page and leaves the ones that do not', () => {
    assert.equal(entityHref(row({}), 'vi'), '/vi/champions/da-18-ahri');
    assert.equal(entityHref(row({ kind: 'item', slug: 'shojin' }), 'en'), '/en/items/shojin');
    // An emblem is catalogued as an item; a wisp has no detail page yet.
    assert.equal(entityHref(row({ kind: 'emblem', slug: 'elderwood-emblem' }), 'en'), '/en/items/elderwood-emblem');
    assert.equal(entityHref(row({ kind: 'wisp', slug: 'hand-of-baron' }), 'en'), undefined);
    // `removed` entities are out of the catalog, so they have no slug to link to.
    assert.equal(entityHref(row({ slug: null }), 'en'), undefined);
  });
});

describe('textOf', () => {
  it('falls back to the English Riot wrote instead of inventing a translation', () => {
    assert.equal(textOf({ en: 'Blue Buff' }, 'vi'), 'Blue Buff');
    assert.equal(textOf({ en: 'Blue Buff', vi: 'Bùa Xanh' }, 'vi'), 'Bùa Xanh');
    assert.equal(textOf({ en: 'Bùa Xanh', vi: 'no' }, 'en'), 'Bùa Xanh');
    assert.equal(textOf(undefined, 'vi'), '');
  });
});

describe('rowsOf', () => {
  it('keeps the change rows and drops the prose blocks', () => {
    const sections = [{ heading: 'Notes', body: ['a paragraph'] }, { heading: 'CHAMPIONS', body: [], rows: [row({})] }];
    assert.deepEqual(
      rowsOf(sections).map((entry) => entry.ref),
      ['DA_18_Ahri']
    );
    assert.deepEqual(rowsOf([{ heading: 'Notes', body: ['only prose'] }]), []);
  });
});

describe('DIRECTION_TONE', () => {
  it('colours every direction the parser can emit', () => {
    for (const direction of DIRECTIONS) {
      assert.ok(DIRECTION_TONE[direction], direction);
    }
    // A buff and a nerf cannot share a colour: the tone is how the row reads.
    assert.notEqual(DIRECTION_TONE.buff, DIRECTION_TONE.nerf);
  });
});

describe('cardGroups', () => {
  const many = (kind: 'champion' | 'wisp', n: number): PatchArticleRow[] =>
    Array.from({ length: n }, (_, i) => row({ ref: `DA_18_${i}`, slug: `da-18-${i}`, name: { en: `Unit ${i}` }, kind, table: kind === 'champion' ? 'champions' : 'items' }));

  it('keeps every champion a tile, however many Riot moved', () => {
    const [group] = cardGroups(many('champion', 11));
    assert.equal(group.entities.length, 11);
    assert.equal(group.merged, false, 'a reader asks which champions moved, and a count answers nothing');
  });

  it('still folds a kind that overruns the list row into one cell', () => {
    const [five] = cardGroups(many('wisp', 5));
    assert.equal(five.merged, true);
    const [four] = cardGroups(many('wisp', 4));
    assert.equal(four.merged, false, 'the limit is the last size a row can hold');
  });

  it('leaves the entities of a folded bucket in the group', () => {
    // The article card draws them all, so folding is a rule about the list row and not about data.
    const [group] = cardGroups(many('wisp', 12));
    assert.equal(group.entities.length, 12);
  });

  it('shows an entity once per bucket, whichever row came first', () => {
    const groups = cardGroups([
      row({ ref: 'DA_18_Sivir', name: { en: 'Sivir' }, field: { en: 'Attack Speed' } }),
      row({ ref: 'DA_18_Sivir', name: { en: 'Sivir' }, field: { en: 'Ability Damage' }, from: '300', to: '280', direction: 'nerf' }),
    ]);
    assert.deepEqual(groups.map((group) => [group.direction, group.entities.length]), [['buff', 1], ['nerf', 1]]);
    assert.equal(groups[0].entities[0].field.en, 'Attack Speed');
  });
});

// The tab row counts with this, so a kind that moved in three fields is one tab with one on it.
describe('countEntities', () => {
  it('counts the things that moved, not the lines they wrote', () => {
    const counts = countEntities([
      row({ ref: 'DA_18_Ahri' }),
      row({ ref: 'DA_18_Ahri', field: { en: 'Health' } }),
      row({ ref: 'TFT_Item_SomeWisp', kind: 'wisp', name: { en: 'Awi Wisp' } }),
    ]);
    assert.equal(counts.champion, 1);
    assert.equal(counts.wisp, 1);
    // Every kind gets a number, even the one no row uses: a tab reading 0 is the answer to
    // "did anything there change", which is what a reader of the tab row is asking.
    assert.equal(counts.encounter, 0);
    assert.deepEqual(Object.keys(counts), ENTITY_KINDS);
  });
});

// The split is what the pages read: a hotfix is an entry of its own, so the app can only ever
// link to a base article that is in the file too.
describe('patch-notes.json', () => {
  it('gives each micro patch its own entry, in the order the game shipped them', () => {
    const slugs = patchNotes.patches.map((note) => patchToSlug(note.patch));
    assert.equal(new Set(slugs).size, slugs.length, 'one entry per slug or the store loses an article');
    for (const note of patchNotes.patches) {
      if (note.release === 'base') continue;
      const base = patchNotes.patches.find((other) => other.patch === note.base);
      assert.ok(base, `${note.patch} claims a base article that is not in the file`);
      assert.ok((note.dayDate ?? '') > (base.publishedAt ?? '').slice(0, 10), `${note.patch} lands before the patch it updates`);
    }
    const dates = patchNotes.patches.map((note) => (note.publishedAt ?? '').slice(0, 10));
    assert.deepEqual([...dates].sort().reverse(), dates, 'the list page trusts this order for its Latest chip');
  });
});
