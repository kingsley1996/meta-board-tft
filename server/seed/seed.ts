// One-shot setup: applies schema.sql, syncs TFT data from CommunityDragon and
// replaces the comps table with the seed file. Safe to re-run, but it wipes
// comps created through the admin UI. Run: npm run seed
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../src/db.ts';
import { syncTft } from '../src/tft.ts';
import { validateCompPayload, writeComp } from '../src/comps.ts';
import { validateGuidePayload, writeGuide } from '../src/guides.ts';
import { guideSeeds } from './guides.ts';
import { tipsSeeds } from './tips.ts';
import { buildTftflowComps } from './tftflow-comps.ts';

const here = import.meta.dirname;

await pool.query(await readFile(join(here, '../src/schema.sql'), 'utf8'));
console.log('schema applied');

const data = await syncTft(pool);
console.log(`synced set ${data.set.number} (${data.set.mutator}): ${data.champions.length} champions, ${data.traits.length} traits, ${data.items.length} items, ${data.augments.length} augments (patch ${data.patch})`);

// CommunityDragon's patch stamp lags; the public UI reads MetaTFT's patch.
const metaSnapshot = JSON.parse(await readFile(join(here, '../../lib/meta.json'), 'utf8'));
await pool.query("UPDATE meta SET value = $1 WHERE key = 'patch'", [metaSnapshot.source.patch]);
console.log(`patch label set to ${metaSnapshot.source.patch} (MetaTFT)`);

let tftAcademySource: { retrievedAt?: string } | null = null;
try {
  tftAcademySource = JSON.parse(await readFile(join(here, 'tftacademy-source.json'), 'utf8'));
} catch {
  console.warn('TFT Academy source sidecar missing; run npm run fetch-comp-tips');
}
const provenance = {
  metatft_updated: metaSnapshot.source.updated,
  metatft_fetched_at: metaSnapshot.source.fetchedAt,
  metatft_cluster_id: metaSnapshot.source.clusterId,
  metatft_queue: metaSnapshot.source.queue,
  tftacademy_retrieved_at: tftAcademySource?.retrievedAt,
};
const provenanceRows = Object.entries(provenance)
  .filter(([, value]) => value !== undefined && value !== null && value !== '')
  .map(([key, value]) => ({ key, value: String(value) }));
await pool.query(
  `INSERT INTO meta (key, value) SELECT key, value FROM jsonb_to_recordset($1) AS x(key text, value text)
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  [JSON.stringify(provenanceRows)]
);

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
  const economy = JSON.parse(await readFile(join(here, '../../lib/economy.json'), 'utf8'));
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
  console.warn(`tftflow comps unavailable (${(error as Error).message}); run npm run fetch-economy`);
}

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

await pool.end();
