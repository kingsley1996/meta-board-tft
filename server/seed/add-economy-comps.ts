// Adds the Set 18 comps mirrored from tftflow.com that the site does not
// have yet. Existing comps (and their votes/views) are left alone; re-running
// only adds what is missing. Run: npm run seed:economy
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../src/db.ts';
import { validateCompPayload, writeComp } from '../src/comps.ts';
import { buildTftflowComps } from './tftflow-comps.ts';

const here = import.meta.dirname;

const economy = JSON.parse(await readFile(join(here, '../../lib/economy.json'), 'utf8'));
const [champions, items, augments, comps, units] = await Promise.all([
  pool.query('SELECT name FROM champions'),
  pool.query('SELECT name FROM items'),
  pool.query('SELECT name FROM augments'),
  pool.query('SELECT slug, carry FROM comps'),
  pool.query('SELECT comp_slug, name FROM comp_units WHERE role = $1', ['board']),
]);

const unitsByComp = new Map<string, string[]>();
for (const row of units.rows) {
  unitsByComp.set(row.comp_slug, [...(unitsByComp.get(row.comp_slug) ?? []), row.name]);
}

const { comps: built, skipped } = buildTftflowComps(economy.comps, {
  champions: new Set(champions.rows.map((row) => row.name)),
  items: new Set(items.rows.map((row) => row.name)),
  augments: new Set(augments.rows.map((row) => row.name)),
  comps: comps.rows.map((row) => ({ slug: row.slug, carry: row.carry, units: unitsByComp.get(row.slug) ?? [] })),
});

let added = 0;
for (const raw of built) {
  const result = await validateCompPayload(raw);
  if ('error' in result) {
    console.error(`skipped ${raw.slug}: ${result.error}`);
    continue;
  }
  await writeComp(result.comp);
  added += 1;
  console.log(`added ${raw.slug} · ${raw.title} · ${raw.tier} · ${raw.style}`);
}
console.log(`added ${added} tftflow comps (${skipped.length} skipped, ${economy.comps.length - built.length - skipped.length} already on the site)`);
for (const entry of skipped) console.log(`  skipped ${entry.slug}: ${entry.reason}`);

await pool.end();
