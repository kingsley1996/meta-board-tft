// The article generator and the re-sync merge, tested without a database.
// `mergePatchArticle` is the only thing standing between a Riot micro patch and an editor's
// paragraphs, so its rules are pinned here rather than discovered in production.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mergePatchArticle, patchArticle, readPatchNotes, summaryFor, type PatchArticle, type StoredArticle,
} from './patch-notes-article.ts';
import { blocksOf, isDayHeading, patchSlug } from '@tftiq/shared/patch-notes';
import type { PatchArticleRow, PatchNote } from '@tftiq/shared/patch-notes';

const row = (over: Partial<PatchArticleRow>): PatchArticleRow => ({
  ref: 'DA_18_Ahri',
  slug: 'ahri',
  kind: 'champion',
  table: 'champions',
  name: { en: 'Ahri', vi: 'Ahri' },
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

const patch: PatchNote = {
  patch: '18.6',
  // A base entry keeps any day block the snapshots could not prove, so this fixture exercises
  // exactly the shape the split leaves behind.
  release: 'base',
  base: '18.6',
  dayDate: null,
  set: 18,
  title: 'TFT patch 18.6',
  titleVi: 'Bản cập nhật 18.6',
  publishedAt: '2026-11-03T18:00:00.000Z',
  updatedAt: null,
  version: '18.6',
  revision: 'rev-1',
  sha256: { en: 'aa', vi: 'bb' },
  url: { en: 'https://example.com/en', vi: 'https://example.com/vi' },
  source: { name: 'Riot Games', label: { en: 'Riot Games', vi: 'Riot Games' } },
  stats: { articleArrows: 3, rows: 3, unmatched: 0 },
  counts: { buff: 1, nerf: 1, adjust: 1 },
  headings: [
    { en: 'UNITS: TIER 4', vi: 'TƯỚNG: BẬC 4' },
    { en: 'TRAITS', vi: 'TỘC/HỆ' },
  ],
  rows: [
    row({}),
    row({ ref: 'DA_18_KhaZix', slug: 'da-18-khazix', heading: 'OCTOBER 27TH', day: 'OCTOBER 27TH', dayDate: '2026-10-27', direction: 'nerf' }),
    row({ ref: 'DA_18_Blackthorn', slug: 'da-18-blackthorn', kind: 'trait', table: 'traits', heading: 'TRAITS', direction: 'adjust', cost: null }),
  ],
  unmatched: [],
};

const storedOf = (article: PatchArticle, over: Partial<StoredArticle> = {}): StoredArticle => ({
  title: article.title,
  titleVi: article.titleVi ?? null,
  excerpt: article.excerpt,
  excerptVi: article.excerptVi,
  author: article.author,
  authorSlug: article.authorSlug,
  publishedOn: article.publishedOn,
  tags: article.tags,
  featured: article.featured,
  sections: article.sections,
  sectionsVi: article.sectionsVi,
  ...over,
});

describe('patch note article', () => {
  it('writes one block per Riot group, in the order the article lists them', () => {
    const article = patchArticle(patch);
    assert.equal(article.slug, 'patch-18-6');
    assert.equal(article.kind, 'patch_notes');
    assert.deepEqual(article.sections.map((section) => section.heading), ['UNITS: TIER 4', 'October 27', 'TRAITS']);
    assert.deepEqual(article.sectionsVi.map((section) => section.heading), ['TƯỚNG: BẬC 4', '27/10', 'TỘC/HỆ']);
    assert.deepEqual(article.sections.map((section) => section.rows?.length), [1, 1, 1]);
  });

  it('keeps a day-shaped heading as a date the reader can parse, not Riot uppercase', () => {
    const block = patchArticle(patch).sections[1];
    assert.equal(block.heading, 'October 27');
    assert.equal(patch.rows[1].heading, 'OCTOBER 27TH', 'the raw row still carries Riot own label');
  });

  it('carries every row of the file into the article untouched', () => {
    const rows = patchArticle(patch).sections.flatMap((section) => section.rows ?? []);
    assert.deepEqual(rows, patch.rows);
  });

  it('summarises the article in the counts of its own rows, in both languages', () => {
    const article = patchArticle(patch);
    // A count of one does not buy a plural noun — 18.5b is an article with exactly one nerf.
    assert.match(article.excerpt, /1 buff, 1 nerf, 1 adjustment/);
    assert.match(article.excerptVi, /1 tăng sức mạnh, 1 giảm sức mạnh, 1 điều chỉnh/);
    assert.match(summaryFor('18.5', { buff: 2, nerf: 1, adjust: 6 }, 'en'), /2 buffs, 1 nerf, 6 adjustments/);
    assert.equal(article.titleVi, 'Bản cập nhật 18.6');
  });

  it('writes a fresh article when the database has none', () => {
    const { article, changed } = mergePatchArticle(null, patch);
    assert.equal(changed, true);
    assert.equal(article.sections.length, 3);
  });

  it('reads a re-run of the same file as no change, even after jsonb reordered the keys', () => {
    const written = patchArticle(patch);
    // Postgres sorts object keys, so a stored row serialises differently from the file's.
    const reversed = JSON.parse(
      JSON.stringify(written.sections, (key, value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(Object.keys(value).reverse().map((k) => [k, value[k]]))
          : value
      )
    );
    const { changed } = mergePatchArticle(storedOf(written, { sections: reversed }), patch);
    assert.equal(changed, false, 'a byte order the editor never touched must not look like an edit');
  });

  it('keeps the paragraphs an editor wrote and the tables Riot published', () => {
    const withProse = patchArticle(patch);
    withProse.sections.unshift({ heading: 'How it plays', body: ['Two streaks, one decision.'] });
    withProse.sectionsVi.unshift({ heading: 'Cách nó vận hành', body: ['Hai chuỗi, một quyết định.'] });
    const stored = storedOf(withProse);
    const { article, changed, prose } = mergePatchArticle(stored, patch);
    assert.equal(changed, false, 'prose already in place is not a change');
    assert.equal(prose, 1);
    assert.deepEqual(article.sections[0], { heading: 'How it plays', body: ['Two streaks, one decision.'] });
    assert.deepEqual(article.sectionsVi[0], { heading: 'Cách nó vận hành', body: ['Hai chuỗi, một quyết định.'] });
    assert.equal(article.sections.length, 4);
  });

  it('refreshes its own summary when the rows moved, and never an editor sentence', () => {
    const written = patchArticle(patch);
    const dropped = written.sections.filter((section) => section.rows?.[0]?.direction !== 'adjust');
    const machine = storedOf(written, {
      sections: dropped,
      excerpt: summaryFor(patch.patch, { buff: 1, nerf: 1, adjust: 0 }, 'en'),
      excerptVi: summaryFor(patch.patch, { buff: 1, nerf: 1, adjust: 0 }, 'vi'),
    });
    const refreshed = mergePatchArticle(machine, patch);
    assert.equal(refreshed.changed, true);
    assert.equal(refreshed.article.excerpt, written.excerpt, 'the machine wrote it, the machine may update it');

    const authored = storedOf(written, { sections: dropped, excerpt: 'A line the editor typed.' });
    const kept = mergePatchArticle(authored, patch);
    assert.equal(kept.article.excerpt, 'A line the editor typed.');
    assert.equal(kept.article.title, written.title);
  });

  it('names the slug the route will look a patch up under', () => {
    assert.equal(patchSlug('18.5'), 'patch-18-5');
  });

  it('builds a block for every group of the committed file', async () => {
    const doc = await readPatchNotes();
    assert.ok(doc.patches.length, 'patch-notes.json has to carry at least one patch');
    for (const note of doc.patches) {
      const article = patchArticle(note);
      const rows = article.sections.flatMap((section) => section.rows ?? []);
      assert.equal(rows.length, note.rows.length, `${note.patch} lost rows on the way into the article`);
      const blocks = blocksOf(note);
      assert.equal(article.sections.length, blocks.length, `${note.patch}: one block per Riot group`);
      assert.equal(article.sectionsVi.length, blocks.length, `${note.patch}: sections and sectionsVi are index-paired`);
      const riot = new Map(note.headings.map((heading) => [heading.en, heading.vi]));
      for (const [index, block] of blocks.entries()) {
        const heading = article.sectionsVi[index].heading;
        assert.notEqual(heading, '', `${note.patch} has a block with no Vietnamese heading`);
        // A block is either Riot's own translation, one of their days, or — only when the
        // Vietnamese article has no such group yet — the English label it falls back to.
        if (isDayHeading(block.rows[0])) {
          assert.match(heading, /^\d+\/\d+$/, `${note.patch}: day block "${block.heading}" is not a date in Vietnamese`);
          continue;
        }
        assert.equal(
          heading,
          riot.get(block.heading) ?? block.heading,
          `${note.patch}: Vietnamese heading "${heading}" is not Riot's own for "${block.heading}"`
        );
      }
    }
  });
});
