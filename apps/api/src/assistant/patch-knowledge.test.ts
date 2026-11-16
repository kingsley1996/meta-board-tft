import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DIRECTIONS,
  ENTITY_KINDS,
  type PatchArticleRow,
  type PatchNote,
  type PatchNotesDoc,
  type PbeChange,
} from '@tftiq/shared/patch-notes';
import { readPatchNotes } from '../patch-notes-article.ts';
import { getPatchNotes, selectPatchNotes, type PatchNotesPbeFile } from './patch-knowledge.ts';

function row(overrides: Partial<PatchArticleRow> = {}): PatchArticleRow {
  return {
    ref: 'TFT18_Vi', slug: 'vi', kind: 'champion', name: { en: 'Vi' },
    icon: null, cost: 2, field: { en: 'Attack Damage', vi: 'Sức Mạnh Công Kích' },
    from: '50/75/112.5', to: '60/90/135', direction: 'buff',
    table: 'champions', day: null, dayDate: null, heading: 'CHAMPIONS',
    ...overrides,
  };
}

function patch(id: string, rows = [row()], overrides: Partial<PatchNote> = {}): PatchNote {
  return {
    patch: id, release: /[bc]$/.test(id) ? 'mid_patch' : 'base', base: id.replace(/[bc]$/, ''),
    dayDate: null, set: 18, title: `Patch ${id}`, publishedAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-02T00:00:00Z', version: id, sha256: { en: '', vi: '' },
    url: {
      en: `https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/patch-${id.replace(/[bc]$/, '')}`,
      vi: `https://teamfighttactics.leagueoflegends.com/vi-vn/news/game-updates/patch-${id.replace(/[bc]$/, '')}`,
    },
    source: { name: 'Riot Games', label: { en: 'Riot Games' } },
    stats: { articleArrows: rows.length, rows: rows.length, unmatched: 0 },
    counts: { buff: 0, nerf: 0, adjust: 0 }, headings: [], rows, unmatched: [],
    ...overrides,
  };
}

function doc(patches = [patch('18.6')], overrides: Partial<PatchNotesDoc> = {}): PatchNotesDoc {
  return { generatedAt: '2026-10-03T00:00:00Z', latestPatch: '18.5', livePatch: '18.6', patches, ...overrides };
}

function preview(overrides: Partial<PatchNotesPbeFile> = {}): PatchNotesPbeFile {
  return {
    patch: '18.7', baseline: { patch: '18.6' }, set: 18,
    generatedAt: '2026-10-05T00:00:00Z',
    source: { provider: 'tftips-catalog', fetchedAt: '2026-10-04T00:00:00Z' },
    rows: [row()], added: [], removed: [], editorial: [], ...overrides,
  };
}

const refs = (evidence: ReturnType<typeof selectPatchNotes>) => evidence.rows.map((entry) => entry.ref);

test('default is released livePatch, never latestPatch or the first backfill', () => {
  const data = doc([patch('18.5'), patch('18.6')]);
  const result = selectPatchNotes(data, preview(), {}, 'en');
  assert.equal(result.channel, 'released');
  assert.equal(result.patch, '18.6');
  assert.equal(result.requestedPatch, null);
  assert.equal(result.livePatch, '18.6');
  assert.equal(result.baseline, null);
  assert.equal(result.status, 'found');
  assert.doesNotMatch(result.summary, /PBE/);

  for (const livePatch of ['18.6', null]) {
    const missing = selectPatchNotes(doc([patch('18.5')], { livePatch }), preview(), {}, 'en');
    assert.equal(missing.status, 'unavailable');
    assert.equal(missing.patch, null);
    assert.equal(missing.source, null);
    assert.deepEqual(missing.rows, []);
    assert.equal(missing.livePatch, livePatch);
    assert.match(missing.summary, /Cannot confirm changes/);
    assert.match(missing.summary, /Available released patches: 18\.5/);
  }
});

test('explicit historical and b/c patches are exact, retaining their actual article URL', () => {
  const data = doc(['18.6', '18.5c', '18.5b', '18.5', '17.9'].map((id) => patch(id, [row({ to: id })])));
  for (const id of ['17.9', '18.5', '18.5b', '18.5c']) {
    const result = selectPatchNotes(data, null, { patch: id }, 'en');
    assert.equal(result.status, 'found');
    assert.equal(result.patch, id);
    assert.equal(result.requestedPatch, id);
    assert.equal(result.rows[0].to, id);
    assert.equal(result.source?.url, data.patches.find((entry) => entry.patch === id)!.url.en);
    assert.equal(result.source?.patch, id);
    assert.match(result.summary, new RegExp(`Released patch ${id} — Riot Games`));
  }
  for (const id of ['18.5d', '18.5B', '18.7', '99.9', '']) {
    const result = selectPatchNotes(data, preview(), { patch: id }, 'en');
    assert.equal(result.status, 'unavailable');
    assert.equal(result.requestedPatch, id);
    assert.equal(result.patch, null);
    assert.equal(result.matchedRows, 0);
    assert.match(result.summary, /18\.5c, 18\.5b, 18\.5, 17\.9/);
  }
});

test('all entity kinds filter independently, and a natural query can select multiple kinds', () => {
  const rows = ENTITY_KINDS.map((kind) => row({ kind, ref: `ref_${kind}`, name: { en: `${kind} entity` } }));
  const data = doc([patch('18.6', rows)]);
  for (const kind of ENTITY_KINDS) {
    const result = selectPatchNotes(data, null, { kind }, 'en');
    assert.deepEqual(refs(result), [`ref_${kind}`]);
    assert.equal(result.totalRows, ENTITY_KINDS.length);
    assert.equal(result.matchedRows, 1);
  }
  assert.deepEqual(refs(selectPatchNotes(data, null, { query: 'What changed for champion entity and trait entity?' }, 'en')),
    ['ref_champion', 'ref_trait']);
  assert.deepEqual(refs(selectPatchNotes(data, null, { kind: 'trait', query: 'champion entity and trait entity' }, 'en')),
    ['ref_trait']);
});

test('EN/VI names, unaccented text, refs and slugs match without a catalog', () => {
  const item = row({
    kind: 'item', ref: 'TFT18_Item_Moonblade', slug: 'moon-blade',
    name: { en: 'Moon Blade', vi: 'Đao Ánh Trăng' },
    field: { en: 'Armor', vi: 'Giáp' }, note: { en: 'English note', vi: 'Ghi chú tiếng Việt' },
  });
  const data = doc([patch('18.6', [item, row()])]);
  for (const query of ['MOON BLADE', 'Was Moon Blade buffed?', 'ĐAO ÁNH TRĂNG', 'dao anh trang',
    'Đao Ánh Trăng thay đổi gì?', 'tft18_item_moonblade', 'moon-blade']) {
    assert.deepEqual(refs(selectPatchNotes(data, null, { query }, 'en')), [item.ref], query);
  }
  assert.equal(selectPatchNotes(data, null, { query: 'Moon Blade' }, 'vi').rows[0].name, 'Đao Ánh Trăng');
  assert.equal(selectPatchNotes(data, null, { query: 'dao anh trang' }, 'en').rows[0].name, 'Moon Blade');
  const vi = selectPatchNotes(data, null, { query: 'GIAP' }, 'vi');
  assert.equal(vi.rows[0].field, 'Giáp');
  assert.equal(vi.rows[0].note, 'Ghi chú tiếng Việt');
  assert.match(vi.summary, /Bản đã phát hành 18\.6 — Riot Games/);
  assert.match(vi.summary, /Đao Ánh Trăng — Giáp: 50\/75\/112\.5 → 60\/90\/135/);
});

test('full entity phrases avoid Vi/Sivir and partial multiword-name collisions', () => {
  const data = doc([patch('18.6', [
    row(), row({ ref: 'TFT18_Sivir', slug: 'sivir', name: { en: 'Sivir' } }),
    row({ ref: 'TFT18_XinZhao', slug: 'xin-zhao', name: { en: 'Xin Zhao' } }),
  ])]);
  for (const query of ['Vi', 'Did Vi get buffed?', 'Vi Attack Damage']) {
    assert.deepEqual(refs(selectPatchNotes(data, null, { query }, 'en')), ['TFT18_Vi']);
  }
  assert.deepEqual(refs(selectPatchNotes(data, null, { query: 'Sivir' }, 'en')), ['TFT18_Sivir']);
  for (const query of ['Siv', 'Xin', 'violin', '!!!', 'unknown hero']) {
    const result = selectPatchNotes(data, null, { query }, 'en');
    assert.equal(result.status, 'no_match', query);
    assert.match(result.summary, /cannot confirm changes/);
    assert.doesNotMatch(result.summary, /not buffed|not nerfed|no changes/i);
  }
  const onlySivir = doc([patch('18.6', [row({ ref: 'Sivir', slug: 'sivir', name: { en: 'Sivir' } })])]);
  assert.equal(selectPatchNotes(onlySivir, null, { query: 'Vi' }, 'en').status, 'no_match');
});

test('field queries narrow an entity without pulling unrelated entities with the same field', () => {
  const data = doc([patch('18.6', [row(), row({ field: { en: 'Armor', vi: 'Giáp' } }),
    row({ ref: 'Sivir', slug: 'sivir', name: { en: 'Sivir' } })])]);
  assert.equal(selectPatchNotes(data, null, { query: 'Vi' }, 'en').matchedRows, 2);
  const specific = selectPatchNotes(data, null, { query: 'Vi giap' }, 'en');
  assert.deepEqual(refs(specific), ['TFT18_Vi']);
  assert.equal(specific.rows[0].field, 'Armor');
  assert.equal(selectPatchNotes(data, null, { query: 'Attack Damage' }, 'en').matchedRows, 2);
  assert.equal(selectPatchNotes(data, null, { query: 'Damage' }, 'en').matchedRows, 2);
  assert.equal(selectPatchNotes(data, null, { query: '  ' }, 'en').matchedRows, 3);
});

test('removed historical entities remain queryable with their historical set', () => {
  const removed = row({ ref: 'retired-ref', slug: null, name: { en: 'Forgotten Archivist' },
    direction: 'removed', from: 'Available', to: 'Removed' });
  const result = selectPatchNotes(doc([patch('16.2', [removed], { set: 16 })]), null,
    { patch: '16.2', query: 'What happened to Forgotten Archivist?' }, 'en');
  assert.equal(result.status, 'found');
  assert.equal(result.setId, '16');
  assert.equal(result.source?.set, '16');
  assert.equal(result.rows[0].direction, 'removed');
  assert.match(result.summary, /Available → Removed/);
});

test('all five directions and exact strings survive; neither numeric sign nor card overrides them', () => {
  const rows = DIRECTIONS.map((direction) => row({ direction, card: 'buff', from: '12/30/50/55%', to: '12/30/55/65%' }));
  const result = selectPatchNotes(doc([patch('18.6', rows)]), null, {}, 'en');
  assert.deepEqual(result.rows.map((entry) => entry.direction), DIRECTIONS);
  assert.ok(result.rows.every((entry) => entry.from === '12/30/50/55%' && entry.to === '12/30/55/65%'));
  assert.match(result.summary, /\(adjustment\)/);
  assert.match(result.summary, /\(nerf\)/);
  assert.match(selectPatchNotes(doc([patch('18.6', rows)]), null, {}, 'vi').summary, /điều chỉnh/);
});

test('released provenance uses locale URL with EN fallback and only sourced dates', () => {
  const entry = patch('18.6', [row({ name: { en: 'Vi', vi: '' }, field: { en: 'Mana' }, note: { en: 'Only English', vi: '' } })]);
  const data = doc([entry]);
  const vi = selectPatchNotes(data, null, {}, 'vi');
  assert.deepEqual(vi.source, { provider: 'Riot Games', url: entry.url.vi, set: '18', patch: '18.6', updatedAt: entry.updatedAt });
  assert.equal(vi.rows[0].name, 'Vi');
  assert.equal(vi.rows[0].field, 'Mana');
  assert.equal(vi.rows[0].note, 'Only English');
  const fallback = selectPatchNotes(doc([{ ...entry, url: { en: entry.url.en, vi: '' }, updatedAt: null }]), null, {}, 'vi');
  assert.equal(fallback.source?.url, entry.url.en);
  assert.equal(fallback.source?.updatedAt, entry.publishedAt);
  assert.equal(selectPatchNotes(doc([{ ...entry, updatedAt: null, publishedAt: null }]), null, {}, 'en').source?.updatedAt, data.generatedAt);
  assert.equal(selectPatchNotes(doc(), null, {}, 'en').rows[0].note, null);
});

test('coverage counts, 24-row truncation and six-change summary subsets are explicit', () => {
  const rows = Array.from({ length: 30 }, (_, index) => row({ ref: `ref-${index}`, name: { en: `Entity ${index}` } }));
  const data = doc([patch('18.6', rows, { unmatched: ['unparsed'], stats: { articleArrows: 33, rows: 30, unmatched: 3 } })]);
  const before = JSON.stringify(data);
  const result = selectPatchNotes(data, null, {}, 'en');
  assert.equal(result.totalRows, 30);
  assert.equal(result.matchedRows, 30);
  assert.equal(result.rows.length, 24);
  assert.equal(result.truncated, true);
  assert.equal(result.unmatched, 3);
  assert.match(result.limitations.join(' '), /3 source entries are unmatched/);
  assert.match(result.limitations.join(' '), /first 24 of 30/);
  assert.match(result.summary, /first 6 of 30/);
  assert.match(result.summary, /Entity 5/);
  assert.doesNotMatch(result.summary, /Entity 6/);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(selectPatchNotes(data, null, {}, 'en'), result);
  const empty = selectPatchNotes(data, null, { kind: 'encounter' }, 'vi');
  assert.equal(empty.status, 'no_match');
  assert.equal(empty.source?.provider, 'Riot Games');
  assert.equal(empty.totalRows, 30);
  assert.equal(empty.matchedRows, 0);
  assert.equal(empty.truncated, false);
  assert.equal(empty.unmatched, 3);
  assert.match(empty.summary, /chưa thể xác nhận/);
  assert.match(empty.limitations.join(' '), /3 mục nguồn chưa khớp/);
  for (const count of [6, 7, 24]) {
    const subset = selectPatchNotes(doc([patch('18.6', rows.slice(0, count))]), null, {}, 'en');
    assert.equal(subset.truncated, false);
    assert.equal(subset.rows.length, count);
    assert.equal(subset.summary.includes('Summary shows the first 6'), count > 6);
  }
  assert.equal(selectPatchNotes(doc([patch('18.6', [], { unmatched: ['a', 'b'] })]), null, {}, 'en').unmatched, 2);
});

test('null, stale and mismatched PBE previews are unavailable without released fallback', () => {
  for (const pbe of [null, preview({ patch: null }), preview({ patch: '18.6' }), preview()]) {
    const result = selectPatchNotes(doc(), pbe, { channel: 'pbe', patch: '18.8' }, 'en');
    assert.equal(result.channel, 'pbe');
    assert.equal(result.status, 'unavailable');
    assert.equal(result.source, null);
    assert.equal(result.patch, null);
    assert.deepEqual(result.rows, []);
    assert.match(result.summary, /PBE/);
    assert.match(result.summary, /cannot confirm changes/);
    assert.match(result.limitations.join(' '), /Experimental PBE preview, not a Riot-released patch/);
  }
  for (const pbe of [null, preview({ patch: null }), preview({ patch: '18.6' })]) {
    assert.equal(selectPatchNotes(doc(), pbe, { channel: 'pbe' }, 'vi').status, 'unavailable');
  }
  assert.equal(selectPatchNotes(doc(), preview(), { patch: '18.7' }, 'en').status, 'unavailable');
  const oldPreview = selectPatchNotes(doc([patch('18.6'), patch('18.5')]), preview({ patch: '18.5' }), { channel: 'pbe' }, 'en');
  assert.equal(oldPreview.status, 'unavailable');
  assert.match(oldPreview.summary, /already been released/);
});

test('explicit PBE preserves provider, fetched date, baseline and added/removed directions', () => {
  const entry = (name: string, change: 'added' | 'removed'): PbeChange => ({
    ref: name, slug: name.toLowerCase(), name: { en: name }, change,
    kind: 'augment', icon: null, cost: null, table: 'augments', heading: 'AUGMENTS',
  });
  const pbe = preview({
    rows: [row({ direction: 'adjust' })], added: [entry('New Augment', 'added')], removed: [entry('Old Augment', 'removed')],
    stats: { unmatched: 2 }, unmatched: ['unmatched'],
    editorial: [{ name: 'Vi', kind: 'champion', heading: 'CHAMPIONS', field: 'desc', from: 'old text', to: 'new text' }],
  });
  const before = JSON.stringify(pbe);
  const result = selectPatchNotes(doc(), pbe, { channel: 'pbe', patch: '18.7' }, 'vi');
  assert.equal(result.status, 'found');
  assert.equal(result.channel, 'pbe');
  assert.equal(result.requestedPatch, '18.7');
  assert.equal(result.patch, '18.7');
  assert.equal(result.livePatch, '18.6');
  assert.equal(result.baseline, '18.6');
  assert.equal(result.setId, '18');
  assert.deepEqual(result.source, { provider: 'tftips-catalog', url: '/vi/patches', set: '18', patch: '18.7', updatedAt: pbe.source!.fetchedAt });
  assert.deepEqual(result.rows.map((entry) => entry.direction), ['adjust', 'added', 'removed']);
  assert.equal(result.rows[1].from, '');
  assert.equal(result.rows[1].to, '');
  assert.equal(result.totalRows, 3);
  assert.equal(result.unmatched, 2);
  assert.match(result.summary, /Bản xem trước PBE 18\.7 — tftips-catalog \(so với bản nền 18\.6\)/);
  assert.match(result.summary, /thử nghiệm, không phải bản Riot đã phát hành/);
  assert.match(result.limitations.join(' '), /1 thay đổi chỉ về văn bản/);
  assert.equal(JSON.stringify(pbe), before);
  const en = selectPatchNotes(doc(), pbe, { channel: 'pbe', kind: 'augment', query: 'Old Augment' }, 'en');
  assert.deepEqual(refs(en), ['Old Augment']);
  assert.equal(en.source?.url, '/en/patches');
  assert.match(en.summary, /baseline 18\.6/);
});

test('missing PBE metadata is not invented or borrowed from the released snapshot', () => {
  const generated = selectPatchNotes(doc(), preview({ source: { provider: 'catalog-only' } }), { channel: 'pbe' }, 'en');
  assert.equal(generated.source?.updatedAt, '2026-10-05T00:00:00Z');
  const bare = preview({ source: undefined, generatedAt: undefined, set: undefined });
  const result = selectPatchNotes(doc(), bare, { channel: 'pbe' }, 'en');
  assert.equal(result.source?.provider, 'Unknown PBE provider');
  assert.equal(result.source?.updatedAt, '');
  assert.equal(result.source?.set, '');
  assert.equal(result.setId, null);
  assert.match(result.limitations.join(' '), /metadata is incomplete/);
});

test('getPatchNotes reads the committed released snapshot (offline smoke)', async () => {
  const snapshot = await readPatchNotes();
  const result = await getPatchNotes({}, 'en');
  assert.deepEqual(result, selectPatchNotes(snapshot, null, {}, 'en'));
  assert.equal(result.livePatch, snapshot.livePatch);
  assert.equal(result.channel, 'released');
  assert.equal(result.patch, snapshot.livePatch);
  assert.equal(result.status, 'found');
  assert.equal(result.source?.provider, 'Riot Games');
  assert.equal(result.source?.url, snapshot.patches.find((entry) => entry.patch === snapshot.livePatch)!.url.en);
});
