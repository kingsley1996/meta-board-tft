import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import pg from 'pg';
import type { CompInput } from '../src/comps.ts';

const hasPostgres = process.getuid?.() !== 0
  && ['initdb', 'pg_ctl'].every((command) => spawnSync(command, ['--version']).status === 0);

function fixture(slug = 'sync-test-snapshot'): CompInput & Record<string, unknown> {
  return {
    slug,
    title: 'Snapshot test',
    titleVi: 'Snapshot translation',
    tier: 'A',
    situational: false,
    style: 'Reroll',
    difficulty: 2,
    trend: null,
    playstyle: 'Roll at level 7.',
    playstyleVi: null,
    carry: 'Ashe',
    cover: null,
    units: [
      { name: 'Ashe', row: 3, col: 0, stars: 2, items: ['Infinity Edge'] },
      { name: 'Garen', row: 0, col: 0, stars: 2, items: [] },
      { name: 'Sona', row: 3, col: 1, stars: null, items: [] },
    ],
    early: ['Garen'],
    items: ['Infinity Edge'],
    augments: ['Tiny Titans'],
    tips: 'Keep pairs.',
    tipsVi: null,
    stages: [{ stage: 'Stage 2', text: 'Play the strongest board.', textVi: 'Keep this translation.' }],
    alt: [{ name: 'Ashe', stars: 3, items: ['Infinity Edge'] }],
    augmentTypes: ['ECON', 'COMBAT'],
    matchups: [],
  };
}

test('syncComps with disposable PostgreSQL', { skip: !hasPostgres && !process.env.CI && 'requires initdb and pg_ctl as a non-root user' }, async (t) => {
  assert.ok(hasPostgres, 'CI must provide initdb and pg_ctl for the isolated seed tests');
  // Redirect the app pool to an isolated socket-only cluster, never an existing database.
  const directory = mkdtempSync('/tmp/upsert-comps-');
  const data = join(directory, 'data');
  const childEnv = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))),
    LC_ALL: 'C',
  };
  const run = (command: string, args: string[]) => execFileSync(command, args, {
    env: childEnv, stdio: 'pipe', timeout: 30_000,
  });
  const database = new pg.Pool({
    host: directory, port: 5432, database: 'postgres', user: 'sync_test',
    password: 'unused', ssl: false, options: '', connectionTimeoutMillis: 2_000,
  });
  t.after(async () => {
    try {
      await database.end();
    } finally {
      if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
      rmSync(directory, { recursive: true, force: true });
    }
  });
  run('initdb', ['-D', data, '-U', 'sync_test', '--auth=trust', '--no-locale', '--encoding=UTF8']);
  try {
    run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-w', 'start', '-o',
      `-F -c listen_addresses='' -c unix_socket_directories='${directory}' -c unix_socket_permissions=0700`]);
  } catch (error) {
    throw new Error(readFileSync(join(directory, 'postgres.log'), 'utf8'), { cause: error });
  }

  const { pool } = await import('../src/db.ts');
  const query = t.mock.method(pool, 'query', database.query.bind(database));
  const connect = t.mock.method(pool, 'connect', database.connect.bind(database));
  const end = t.mock.method(pool, 'end', async () => { assert.fail('syncComps must not close the pool'); });
  const fetch = t.mock.method(globalThis, 'fetch', async () => { assert.fail('no external revalidation in tests'); });
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const oldToken = process.env.WEB_REVALIDATE_TOKEN;
  delete process.env.WEB_REVALIDATE_TOKEN;
  t.after(() => {
    if (oldToken === undefined) delete process.env.WEB_REVALIDATE_TOKEN;
    else process.env.WEB_REVALIDATE_TOKEN = oldToken;
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal(end.mock.callCount(), 0);
  });

  const { syncComps } = await import('./upsert-comps.ts');
  await t.test('import neither queries nor closes the pool', () => {
    assert.equal(query.mock.callCount(), 0);
    assert.equal(connect.mock.callCount(), 0);
    assert.equal(end.mock.callCount(), 0);
  });
  const { writeComp } = await import('../src/comps.ts');
  const { readCompExtras } = await import('../src/comp-provenance.ts');
  assert.ok(!Object.keys(await readCompExtras()).some((slug) => slug.startsWith('sync-test-')));

  await database.query(readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8'));
  await database.query(`
    INSERT INTO champions (api_name, name, cost, traits) VALUES
      ('test-ashe', 'Ashe', 1, '{}'), ('test-garen', 'Garen', 1, '{}'), ('test-sona', 'Sona', 1, '{}');
    INSERT INTO items (api_name, name, description, composition) VALUES ('test-item', 'Infinity Edge', '', '{}');
    INSERT INTO augments (api_name, name, description) VALUES ('test-augment', 'Tiny Titans', '');
  `);
  t.beforeEach(async () => { await database.query('TRUNCATE comps CASCADE'); });

  // Compare stored rows rather than the enriched API representation.
  const tables = [
    ['comps', 'slug', 'slug'],
    ['comp_units', 'comp_slug', 'comp_slug, role, position'],
    ['comp_items', 'comp_slug', 'comp_slug, position'],
    ['comp_augments', 'comp_slug', 'comp_slug, position'],
    ['comp_stages', 'comp_slug', 'comp_slug, stage'],
  ];
  const snapshot = (slug?: string) => Promise.all(tables.map(async ([table, key, order]) => (
    await database.query(`SELECT * FROM ${table}${slug ? ` WHERE ${key} = $1` : ''} ORDER BY ${order}`, slug ? [slug] : [])
  ).rows));

  function readsOnly(context: TestContext) {
    const reads = context.mock.method(pool, 'query', async (sql: string, args?: unknown[]) => {
      assert.match(sql, /^SELECT\b/i, 'syncComps must only issue reads');
      return database.query(sql, args);
    });
    const writes = context.mock.method(pool, 'connect', async () => {
      assert.fail('syncComps must not acquire a write client');
    });
    context.after(() => { assert.equal(writes.mock.callCount(), 0); });
    return reads;
  }

  await t.test('rejects an empty snapshot before any database access', async (t) => {
    const reads = readsOnly(t);
    await assert.rejects(syncComps([]), /empty seed\/comps\.json/);
    assert.equal(reads.mock.callCount(), 0);
  });

  await t.test('rejects duplicate slugs before any database access', async (t) => {
    const reads = readsOnly(t);
    await assert.rejects(syncComps([fixture(), { ...fixture(), title: 'Duplicate' }]), /duplicate slug.*sync-test-snapshot/);
    assert.equal(reads.mock.callCount(), 0);
  });

  await t.test('rejects slugs that become duplicates after validation normalizes them', async (t) => {
    const reads = readsOnly(t);
    await assert.rejects(syncComps([fixture(), fixture(' SYNC-TEST-SNAPSHOT ')]), /duplicate slug.*sync-test-snapshot/);
    assert.equal(reads.mock.callCount(), 0);
  });

  function mockCover(context: TestContext, name: string) {
    const original = fs.readFile;
    const mocked = context.mock.method(fs, 'readFile', async (...args: Parameters<typeof fs.readFile>) => {
      if (String(args[0]).endsWith('/comp-extras.json')) {
        return JSON.stringify({ comps: { [fixture().slug]: { cover: { kind: 'item', name } } } });
      }
      return original(...args);
    });
    syncBuiltinESMExports();
    context.after(() => { mocked.mock.restore(); syncBuiltinESMExports(); });
  }

  await t.test('detects and writes a cover-only change from extras', async (t) => {
    const source = fixture();
    await writeComp(source);
    mockCover(t, 'Infinity Edge');
    await assert.rejects(syncComps([source], { check: true }), /1 comps do not match the snapshot/);
    assert.deepEqual(await syncComps([source]), { inserted: 0, rewritten: 1, unchanged: 0 });
    assert.deepEqual((await database.query('SELECT cover FROM comps WHERE slug = $1', [source.slug])).rows[0].cover,
      { kind: 'item', name: 'Infinity Edge' });
    readsOnly(t);
    assert.deepEqual(await syncComps([source], { check: true }), { inserted: 0, rewritten: 0, unchanged: 1 });
  });

  await t.test('rejects an unknown extras cover before writing', async (t) => {
    mockCover(t, 'Unknown item');
    readsOnly(t);
    await assert.rejects(syncComps([fixture()]), /1 invalid comps; nothing written/);
  });

  for (const [mode, options] of [
    ['sync', {}], ['dry run', { dryRun: true }], ['check', { check: true }],
  ] as const) {
    await t.test(`${mode} validates the entire snapshot before writing anything`, async (t) => {
      await writeComp(fixture('sync-test-outside'));
      const before = await snapshot();
      const reads = readsOnly(t);
      const errors = t.mock.method(console, 'error', () => {});
      const source = [
        fixture(),
        { ...fixture('sync-test-bad-name'), augments: ['Not a known augment'] },
        { ...fixture('sync-test-bad-title'), title: '' },
        fixture('sync-test-last-valid'),
      ];
      await assert.rejects(syncComps(source, options), /2 invalid comps; nothing written/);
      assert.deepEqual(errors.mock.calls.map((call) => call.arguments[0]), [
        'invalid sync-test-bad-name: unknown augment: Not a known augment',
        'invalid sync-test-bad-title: title is required',
      ]);
      assert.equal(reads.mock.calls.filter((call) => call.arguments[0] === 'SELECT name FROM champions').length, 3,
        'validation continues through the last valid comp after both invalid entries');
      assert.deepEqual(await snapshot(), before);
    });
  }

  await t.test('dry run reports inserts, rewrites and matches without writing', async (t) => {
    const existing = fixture('sync-test-existing');
    const matching = fixture('sync-test-matching');
    await writeComp(existing);
    await writeComp(matching);
    const before = await snapshot();
    readsOnly(t);
    assert.deepEqual(await syncComps([
      { ...existing, title: 'Changed title' }, fixture(), matching,
    ], { dryRun: true }), { inserted: 1, rewritten: 1, unchanged: 1 });
    assert.deepEqual(await snapshot(), before);
  });

  await t.test('check rejects a missing comp without inserting it', async (t) => {
    const before = await snapshot();
    readsOnly(t);
    await assert.rejects(syncComps([fixture()], { check: true }), /1 comps do not match the snapshot/);
    assert.deepEqual(await snapshot(), before);
  });

  await t.test('check detects drift in raw board rows without rewriting', async (t) => {
    const source = fixture();
    await writeComp(source);
    await database.query("UPDATE comp_units SET col = 2 WHERE comp_slug = $1 AND role = 'board' AND name = 'Ashe'", [source.slug]);
    const before = await snapshot();
    readsOnly(t);
    await assert.rejects(syncComps([source], { check: true }), /1 comps do not match the snapshot/);
    assert.deepEqual(await snapshot(), before);
  });

  await t.test('check accepts matching rows despite unrelated comps, counters and stage translations', async (t) => {
    const source = fixture();
    await writeComp(source);
    await writeComp(fixture('sync-test-outside'));
    await database.query('UPDATE comps SET votes = 17, views = 99');
    await database.query("UPDATE comp_stages SET text_vi = 'Editor translation'");
    const before = await snapshot();
    readsOnly(t);
    assert.deepEqual(await syncComps([source], { check: true }), { inserted: 0, rewritten: 0, unchanged: 1 });
    assert.deepEqual(await snapshot(), before);
  });

  await t.test('regular sync preserves unrelated rows and counters through real writeComp upserts', async (t) => {
    const existing = fixture('sync-test-existing');
    const matching = fixture('sync-test-matching');
    const outside = fixture('sync-test-outside');
    for (const comp of [existing, matching, outside]) await writeComp(comp);
    await database.query(`UPDATE comps SET votes = 17, views = 99, cover = '{"kind":"item","name":"Infinity Edge"}'`);
    const untouched = await snapshot(outside.slug);
    const alreadyMatching = await snapshot(matching.slug);
    const preserved = (await database.query('SELECT votes, views, cover, created_at FROM comps WHERE slug = $1', [existing.slug])).rows[0];
    const changed = {
      ...existing,
      title: 'Updated snapshot',
      units: existing.units.map((unit) => unit.name === 'Ashe' ? { ...unit, col: 2 } : unit),
      stages: [{ stage: 'Stage 2', text: 'Updated stage.', textVi: 'Do not replace the stored translation.' }],
    };
    const source = [changed, fixture(), matching];

    assert.deepEqual(await syncComps(source), { inserted: 1, rewritten: 1, unchanged: 1 });
    assert.deepEqual(await snapshot(outside.slug), untouched);
    assert.deepEqual(await snapshot(matching.slug), alreadyMatching);
    assert.deepEqual((await database.query('SELECT votes, views, cover, created_at FROM comps WHERE slug = $1', [existing.slug])).rows[0], preserved);
    assert.deepEqual((await database.query('SELECT text, text_vi FROM comp_stages WHERE comp_slug = $1', [existing.slug])).rows, [
      { text: 'Updated stage.', text_vi: 'Keep this translation.' },
    ]);
    assert.deepEqual((await database.query('SELECT votes, views FROM comps WHERE slug = $1', [fixture().slug])).rows, [
      { votes: 0, views: 0 },
    ]);

    // Idempotency must hold against the real writer's output.
    const after = await snapshot();
    readsOnly(t);
    assert.deepEqual(await syncComps(source), { inserted: 0, rewritten: 0, unchanged: 3 });
    assert.deepEqual(await syncComps(source, { check: true }), { inserted: 0, rewritten: 0, unchanged: 3 });
    assert.deepEqual(await snapshot(), after);
  });
});
