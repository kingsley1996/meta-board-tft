import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// guides.ts imports db.ts, which builds the pg Pool at module load, so every import of it
// happens dynamically inside the tests, after the DATABASE_URL guard below (same convention
// as accounts.test.ts).
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../.env'));
  } catch {
    // No .env — the DB-backed tests below skip.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);

// The kind column and its CHECK ship in schema.sql; applying it keeps a database that
// predates the column usable without a separate migration step (same as the membership tests).
async function applySchema() {
  const { pool } = await import('./db.ts');
  await pool.query(await readFile(join(import.meta.dirname, 'schema.sql'), 'utf8'));
}

const payload = (over: Record<string, unknown> = {}) => ({
  slug: 'qa-kind-check',
  author: 'QA',
  authorSlug: 'qa',
  publishedOn: '2026-11-01',
  title: 'A guide',
  excerpt: 'An excerpt',
  tags: ['QA'],
  featured: false,
  sections: [{ heading: 'Heading', body: ['A paragraph.'] }],
  ...over,
});

// One measured change, in the shape @tftiq/shared/patch-notes calls a PatchRow.
const row = {
  ref: 'TFT18_Caitlyn',
  slug: 'caitlyn',
  kind: 'champion',
  name: { en: 'Caitlyn', vi: 'Caitlyn' },
  icon: null,
  cost: 5,
  field: { en: 'Empowered Auto Damage', vi: 'Sát thương đòn đánh cường hóa' },
  from: '190/285/470',
  to: '200/300/490',
  direction: 'buff',
};

async function validate(input: unknown) {
  const { validateGuidePayload } = await import('./guides.ts');
  return validateGuidePayload(input);
}

test('kind defaults to guide when the payload omits it', async () => {
  const result = await validate(payload());
  assert.equal('error' in result, false);
  assert.equal((result as any).guide.kind, 'guide');
});

test('kind patch_notes is accepted', async () => {
  const result = await validate(payload({ kind: 'patch_notes' }));
  assert.equal((result as any).guide.kind, 'patch_notes');
});

test('an unknown kind is an error, not a silent fallback to guide', async () => {
  for (const bad of ['not_a_kind', 'Patch Notes', 'weekly', 42, true]) {
    const result = await validate(payload({ kind: bad }));
    assert.equal('error' in result, true, `${JSON.stringify(bad)} was accepted`);
    assert.match((result as any).error, /^kind must be one of: /);
  }
});

test('a change block needs rows, not paragraphs', async () => {
  const result = await validate(payload({ kind: 'patch_notes', sections: [{ heading: 'Tướng', rows: [row] }] }));
  assert.equal('error' in result, false, (result as any).error);
  assert.deepEqual((result as any).guide.sections[0].rows, [row]);
});

// A row must survive the shape check, not the prose check: an empty `body` is what makes a
// change block different from a paragraph block.
const rowCases: Record<string, unknown>[] = [
  { rows: [] },
  { rows: [{ ...row, to: undefined }] },
  { rows: [{ ...row, direction: 'increased' }] },
  { rows: [{ ...row, kind: 'relic' }] },
  { rows: 'not a list' },
];

test('rows are validated one by one, so a half-row cannot be stored', async () => {
  for (const over of rowCases) {
    const result = await validate(payload({ kind: 'patch_notes', sections: [{ heading: 'Tướng', ...over }] }));
    assert.equal('error' in result, true, `${JSON.stringify(over)} was accepted`);
  }
});

test('a block may carry intro text above its change rows', async () => {
  const result = await validate(payload({ kind: 'patch_notes', sections: [{ heading: 'Tướng', body: ['One.'], rows: [row] }] }));
  assert.equal('error' in result, false, (result as any).error);
  assert.deepEqual((result as any).guide.sections[0].rows, [row]);
});

test('a block with neither body nor rows is still rejected', async () => {
  const result = await validate(payload({ sections: [{ heading: 'Empty', body: [] }] }));
  assert.equal('error' in result, true);
});

test('the list SQL is kind-scoped, and a slug lookup is not', async () => {
  const { guidesSelect } = await import('./guides.ts');
  assert.match(guidesSelect().sql, /WHERE kind = \$1/);
  assert.deepEqual(guidesSelect().params, ['guide']);
  assert.deepEqual(guidesSelect({ kind: 'patch_notes' }).params, ['patch_notes']);
  assert.equal(guidesSelect({ kind: 'all' }).params.length, 0);
  assert.doesNotMatch(guidesSelect({ kind: 'all' }).sql, /WHERE/);
  // A patch note must stay reachable by slug, otherwise /api/guides/:slug 404s on it.
  const bySlug = guidesSelect({ slug: 'patch-18-5', kind: 'guide' });
  assert.match(bySlug.sql, /WHERE slug = \$1/);
  assert.deepEqual(bySlug.params, ['patch-18-5']);
});

test(
  'the guides list never returns a patch note, and the patch route does',
  { skip: !hasDb },
  async () => {
    await applySchema();
    const { deleteGuide, listGuides, validateGuidePayload, writeGuide } = await import('./guides.ts');
    const slugs = ['qa-guides-kind', 'qa-patches-kind'];
    // writeGuide pokes the web cache; a test run must not purge production over it.
    const savedToken = process.env.WEB_REVALIDATE_TOKEN;
    const savedOrigin = process.env.AUTH_WEB_ORIGIN;
    delete process.env.WEB_REVALIDATE_TOKEN;
    delete process.env.AUTH_WEB_ORIGIN;
    const store = async (slug: string, kind: string) => {
      const result = await validateGuidePayload(payload({ slug, kind, title: `${kind} article` }));
      assert.equal('error' in result, false, (result as any).error);
      await writeGuide((result as any).guide);
    };
    try {
      await store(slugs[0], 'guide');
      await store(slugs[1], 'patch_notes');
      const has = (rows: any[], wanted: string) => rows.some((r) => r.slug === wanted);

      const howTo = await listGuides('en');
      assert.equal(has(howTo, slugs[0]), true, 'the plain list dropped a guide');
      assert.equal(has(howTo, slugs[1]), false, 'the plain list leaked a patch note');

      const patches = await listGuides('en', { kind: 'patch_notes' });
      // Other patch articles may already be seeded, so assert the rule, not the row count.
      assert.equal(has(patches, slugs[1]), true, 'the patch list dropped a patch note');
      assert.equal(
        patches.every((r: any) => r.kind === 'patch_notes'),
        true,
        'the patch list leaked a guide'
      );

      const everything = await listGuides('en', { kind: 'all' });
      assert.equal(has(everything, slugs[0]), true);
      assert.equal(has(everything, slugs[1]), true);

      const [one] = await listGuides('en', { slug: slugs[1] });
      assert.equal(one.kind, 'patch_notes', 'a patch note is not reachable by slug');
    } finally {
      for (const slug of slugs) await deleteGuide(slug);
      if (savedToken !== undefined) process.env.WEB_REVALIDATE_TOKEN = savedToken;
      if (savedOrigin !== undefined) process.env.AUTH_WEB_ORIGIN = savedOrigin;
    }
  }
);

test(
  'the database rejects a kind outside the CHECK',
  { skip: !hasDb },
  async () => {
    await applySchema();
    const { pool } = await import('./db.ts');
    await pool.query("DELETE FROM guides WHERE slug = 'qa-check-kind'");
    await assert.rejects(
      pool.query(
        `INSERT INTO guides (slug, kind, author, author_slug, published_on, title, excerpt, tags, featured, sections)
         VALUES ('qa-check-kind', 'not_a_kind', 'QA', 'qa', '2026-11-01', 't', 'e', '{}', false, '[]')`
      ),
      /guides_kind_values/
    );
  }
);

test(
  'a sync write owns the Vietnamese columns; an admin save never touches them',
  { skip: !hasDb },
  async () => {
    await applySchema();
    const { deleteGuide, listGuides, validateGuidePayload, writeGuide } = await import('./guides.ts');
    const slug = 'qa-guides-sync';
    const savedToken = process.env.WEB_REVALIDATE_TOKEN;
    const savedOrigin = process.env.AUTH_WEB_ORIGIN;
    delete process.env.WEB_REVALIDATE_TOKEN;
    delete process.env.AUTH_WEB_ORIGIN;
    const vi = {
      titleVi: 'Bản 18.5',
      excerptVi: 'Tóm tắt',
      // sections_vi is an index-aligned overlay on sections, so the paragraph counts match.
      sectionsVi: [{ heading: 'Tướng', body: ['Vi một.', 'Vi hai.'] }],
    };
    const english = { sections: [{ heading: 'Champions', body: ['En one.', 'En two.'] }] };
    const store = async (over: Record<string, unknown>, opts?: { sync?: boolean }) => {
      const result = await validateGuidePayload(payload({ slug, ...over }));
      assert.equal('error' in result, false, (result as any).error);
      await writeGuide((result as any).guide, opts);
    };
    const read = async () => (await listGuides('vi', { slug }))[0];
    try {
      await store({ ...english, ...vi });
      assert.equal((await read()).title, 'Bản 18.5');
      assert.deepEqual((await read()).sections[0].body, ['Vi một.', 'Vi hai.']);

      // The admin form posts English only, and must not reclassify or untranslate the row.
      await store({ ...english, title: 'Patch 18.5, edited by hand' });
      assert.equal((await read()).title, 'Bản 18.5', 'an admin save dropped the translation');

      // A seed re-run owns the translation.
      await store({ ...english, ...vi, titleVi: 'Bản 18.5 (máy)' }, { sync: true });
      assert.equal((await read()).title, 'Bản 18.5 (máy)', 'a sync did not refresh the translation');

      // COALESCE: a sync that carries no Vietnamese keeps the one already stored.
      await store({ ...english }, { sync: true });
      assert.equal((await read()).title, 'Bản 18.5 (máy)', 'a sync without translation wiped it');
    } finally {
      await deleteGuide(slug);
      if (savedToken !== undefined) process.env.WEB_REVALIDATE_TOKEN = savedToken;
      if (savedOrigin !== undefined) process.env.AUTH_WEB_ORIGIN = savedOrigin;
    }
  }
);
