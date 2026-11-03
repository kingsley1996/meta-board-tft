// One-shot setup: applies schema.sql, syncs TFT data from CommunityDragon and
// replaces the comps table with the seed file. Safe to re-run, but it wipes
// comps created through the admin UI. Run: npm run seed
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../src/db.ts';
import { sharedDataPath } from '../src/shared-data.ts';
import { syncTft } from '../src/tft.ts';
import { validateCompPayload, writeComp } from '../src/comps.ts';
import { validateGuidePayload, writeGuide } from '../src/guides.ts';
import { syncPatchNotes } from '../src/patch-notes-article.ts';
import { ensureAdminFromEnv } from '../src/accounts.ts';
import { guideSeeds } from './guides.ts';
import { tipsSeeds } from './tips.ts';
import { buildTftflowComps } from './tftflow-comps.ts';

const here = import.meta.dirname;

await pool.query(await readFile(join(here, '../src/schema.sql'), 'utf8'));
console.log('schema applied');

const data = await syncTft(pool);
console.log(`synced set ${data.set.number}: ${data.champions.length} champions, ${data.traits.length} traits, ${data.items.length} items, ${data.augments.length} augments (patch ${data.patch}, release ${data.release})`);

// The catalog apply already carries MetaTFT's stamps; the Academy sidecar is
// about comps, which only a seed touches.
let tftAcademySource: { retrievedAt?: string } | null = null;
try {
  tftAcademySource = JSON.parse(await readFile(join(here, 'tftacademy-source.json'), 'utf8'));
} catch {
  console.warn('TFT Academy source sidecar missing; refresh it from the crawler repo');
}
if (tftAcademySource?.retrievedAt) {
  await pool.query(
    `INSERT INTO meta (key, value) VALUES ('tftacademy_retrieved_at', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [String(tftAcademySource.retrievedAt)]
  );
}

const seedComps = JSON.parse(await readFile(join(here, 'comps.json'), 'utf8'));
await pool.query('DELETE FROM comps');
let seeded = 0;
for (const raw of seedComps) {
  const result = await validateCompPayload(raw);
  if ('error' in result) {
    console.error(`skipped ${raw.slug}: ${result.error}`);
    continue;
  }
  await writeComp(result.comp);
  seeded += 1;
}
console.log(`seeded ${seeded}/${seedComps.length} comps from seed/comps.json (existing comps replaced)`);

// Comps that only exist on tftflow (Set 18 economy strategies and their
// boards). They are added when their slug is free, so the site also lists the
// comps the source site plays.
try {
  const economy = JSON.parse(await readFile(sharedDataPath('economy.json'), 'utf8'));
  const [champions, items, augments, siteComps, siteUnits] = await Promise.all([
    pool.query('SELECT name FROM champions'),
    pool.query('SELECT name FROM items'),
    pool.query('SELECT name FROM augments'),
    pool.query('SELECT slug, carry FROM comps'),
    pool.query('SELECT comp_slug, name FROM comp_units WHERE role = $1', ['board']),
  ]);
  const unitsByComp = new Map<string, string[]>();
  for (const row of siteUnits.rows) {
    unitsByComp.set(row.comp_slug, [...(unitsByComp.get(row.comp_slug) ?? []), row.name]);
  }
  const { comps: tftflowComps, skipped } = buildTftflowComps(economy.comps, {
    champions: new Set(champions.rows.map((row) => row.name)),
    items: new Set(items.rows.map((row) => row.name)),
    augments: new Set(augments.rows.map((row) => row.name)),
    comps: siteComps.rows.map((row) => ({ slug: row.slug, carry: row.carry, units: unitsByComp.get(row.slug) ?? [] })),
  });
  let seededTftflow = 0;
  for (const raw of tftflowComps) {
    const result = await validateCompPayload(raw);
    if ('error' in result) {
      console.error(`skipped ${raw.slug}: ${result.error}`);
      continue;
    }
    await writeComp(result.comp);
    seededTftflow += 1;
  }
  console.log(`seeded ${seededTftflow}/${tftflowComps.length} tftflow comps (${skipped.length} skipped)`);
  for (const entry of skipped) console.log(`  skipped ${entry.slug}: ${entry.reason}`);
} catch (error) {
  console.warn(`tftflow comps unavailable (${(error as Error).message}); run the economy fetch in the crawler repo`);
}

// The cover badge lives in the comps table now, so the editor owns it. The
// hand-mapped Academy file is only the initial seed; re-running restores it.
const extras = (JSON.parse(await readFile(sharedDataPath('comp-extras.json'), 'utf8')).comps ?? {}) as Record<
  string,
  { cover?: { kind: 'item' | 'augment'; name: string } }
>;
let covers = 0;
for (const [compSlug, extra] of Object.entries(extras)) {
  if (!extra.cover) continue;
  const { rowCount } = await pool.query('UPDATE comps SET cover = $1 WHERE slug = $2', [JSON.stringify(extra.cover), compSlug]);
  covers += rowCount ?? 0;
}
console.log(`seeded ${covers} comp covers from comp-extras.json`);

await pool.query('DELETE FROM guides');
let seededGuides = 0;
for (const raw of [...guideSeeds, ...tipsSeeds]) {
  const result = await validateGuidePayload(raw);
  if ('error' in result) {
    console.error(`skipped guide ${raw.slug}: ${result.error}`);
    continue;
  }
  await writeGuide(result.guide);
  seededGuides += 1;
}
console.log(`seeded ${seededGuides}/${guideSeeds.length + tipsSeeds.length} guides from seed/guides.ts + seed/tips.ts (existing guides replaced)`);

// Patch notes are articles whose numbers nobody types, so they come from the committed
// patch-notes.json through the same path the production sync uses. The prerender of
// /patches/[patch] reads them out of this database, so a seed that skipped them 404s pages.
const patches = await syncPatchNotes();
console.log(`seeded ${patches.written.length} patch notes from patch-notes.json${patches.skipped.length ? ` (${patches.skipped.length} skipped)` : ''}`);
for (const line of patches.skipped) console.error(`skipped patch note: ${line}`);

// Owner account for /admin, from the same two variables the API reads at boot —
// seeding a database and booting an empty one have to arrive at the same result.
// Skipped when an admin already exists, so a re-run never resets that password.
const adminEmail = process.env.ADMIN_EMAIL?.trim();
const adminSeedPassword = process.env.ADMIN_SEED_PASSWORD;
if (adminEmail && adminSeedPassword) {
  const outcome = await ensureAdminFromEnv(adminEmail, adminSeedPassword);
  console.log(
    outcome
      ? `admin account ${outcome.created ? 'created' : 'adopted'}: ${adminEmail.toLowerCase()}`
      : `an admin already exists; ${adminEmail.toLowerCase()} left unchanged`
  );
} else {
  console.warn('ADMIN_EMAIL/ADMIN_SEED_PASSWORD not set — no admin account, so /admin has nobody to sign in with');
}

await pool.end();
