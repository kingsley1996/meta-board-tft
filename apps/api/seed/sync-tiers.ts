// Pushes the tier/trend/situational/style the source sites give each comp onto the
// database without rebuilding it. `npm run seed` can't do this: it deletes
// comps first, so the admin's covers, tips and the economy-only comps would go
// with it. This touches four columns on rows that already exist, in one
// transaction, and prints what it changed. New slugs from the crawl are
// reported, never inserted — a comp needs its board, items and augments, which
// a tier column can't carry.
// Run: npm run seed:tiers -- --dry-run
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../src/db.ts';
import { flushRevalidate, notifyRevalidate } from '../src/revalidate.ts';

const here = import.meta.dirname;
const dryRun = process.argv.includes('--dry-run');

const STYLES = ['Reroll', 'Fast 8', 'Fast 9', 'Flex', 'Tempo'];

const source = JSON.parse(await readFile(join(here, 'comps.json'), 'utf8')) as {
  slug: string;
  title: string;
  tier: string;
  situational?: boolean;
  style: string;
  trend: string | null;
}[];

const seen = new Set<string>();
for (const comp of source) {
  if (seen.has(comp.slug)) throw new Error(`duplicate slug in seed/comps.json: ${comp.slug}`);
  seen.add(comp.slug);
  if (!['S', 'A', 'B', 'C', 'X'].includes(comp.tier)) throw new Error(`${comp.slug}: bad tier ${comp.tier}`);
  if (!STYLES.includes(comp.style)) throw new Error(`${comp.slug}: bad style ${comp.style}`);
  if (comp.trend != null && !['up', 'down'].includes(comp.trend)) throw new Error(`${comp.slug}: bad trend ${comp.trend}`);
}

const current = await pool.query<{ slug: string; title: string; tier: string; trend: string | null; situational: boolean; style: string }>(
  'SELECT slug, title, tier, trend, situational, style FROM comps'
);
const bySlug = new Map(current.rows.map((row) => [row.slug, row]));

const changes = source
  .map((comp) => ({ comp, row: bySlug.get(comp.slug) }))
  .filter((entry): entry is { comp: (typeof source)[number]; row: (typeof current.rows)[number] } => Boolean(entry.row))
  .filter(({ comp, row }) => comp.tier !== row.tier || (comp.trend ?? null) !== row.trend || Boolean(comp.situational) !== row.situational || comp.style !== row.style);

const onlyInSource = source.filter((comp) => !bySlug.has(comp.slug));
const onlyInDb = current.rows.filter((row) => !seen.has(row.slug));

for (const { comp, row } of changes) {
  const tier = comp.tier === row.tier ? '' : ` ${row.tier} -> ${comp.tier}`;
  const trend = (comp.trend ?? null) === row.trend ? '' : ` trend ${row.trend ?? '-'} -> ${comp.trend}`;
  const sit = Boolean(comp.situational) === row.situational ? '' : ` situational ${row.situational} -> ${comp.situational}`;
  const style = comp.style === row.style ? '' : ` style ${row.style} -> ${comp.style}`;
  console.log(`${dryRun ? 'would set' : 'set'} ${row.slug} · ${row.title}${tier}${trend}${sit}${style}`);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const { comp } of changes) {
    await client.query('UPDATE comps SET tier = $1, trend = $2, situational = $3, style = $4, updated_at = now() WHERE slug = $5', [
      comp.tier,
      comp.trend ?? null,
      Boolean(comp.situational),
      comp.style,
      comp.slug,
    ]);
  }
  if (dryRun) {
    await client.query('ROLLBACK');
  } else {
    await client.query('COMMIT');
    notifyRevalidate('comps');
  }
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}

const matched = source.length - onlyInSource.length;
console.log(`${dryRun ? 'dry run:' : 'synced'} ${changes.length} of ${matched} matched comps changed tier, trend, situational or style`);
if (onlyInSource.length) {
  console.log(`${onlyInSource.length} slugs in the crawl are not on the site (no board data, so not added):`);
  for (const comp of onlyInSource) console.log(`  ${comp.slug} · ${comp.title} · ${comp.tier}`);
}
if (onlyInDb.length) {
  console.log(`${onlyInDb.length} comps on the site are not in the crawl, left untouched:`);
  console.log(`  ${onlyInDb.map((row) => `${row.slug} (${row.tier})`).join(', ')}`);
}

// The pages are cached for a day, so hand the web app the change instead of
// waiting for the window. Without WEB_REVALIDATE_TOKEN this stays silent and the
// pages refresh on their own schedule.
const revalidated = await flushRevalidate();
console.log(revalidated.length ? `told the web app to revalidate: ${revalidated.join(', ')}` : 'no revalidation sent (set WEB_REVALIDATE_TOKEN to purge the page cache now)');

await pool.end();
