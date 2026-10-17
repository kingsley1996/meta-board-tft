// One-shot setup: applies schema.sql, syncs TFT data from CommunityDragon and
// replaces the comps table with the seed file. Safe to re-run, but it wipes
// comps created through the admin UI. Run: npm run seed
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../src/db.ts';
import { syncTft } from '../src/tft.ts';
import { validateCompPayload, writeComp } from '../src/comps.ts';

const here = import.meta.dirname;

await pool.query(await readFile(join(here, '../src/schema.sql'), 'utf8'));
console.log('schema applied');

const data = await syncTft(pool);
console.log(`synced set ${data.set.number} (${data.set.mutator}): ${data.champions.length} champions, ${data.traits.length} traits, ${data.items.length} items, ${data.augments.length} augments (patch ${data.patch})`);

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

await pool.end();
