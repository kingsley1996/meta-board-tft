// Brings the database onto the committed snapshot instead of only filling its
// gaps. The map and the homepage link out of meta.json while the detail pages
// read comps from the database, so a snapshot that runs ahead of the DB 404s —
// and a snapshot whose board changed keeps showing the old board. `npm run seed`
// fixes both by deleting every comp, taking the admin's covers, votes and views
// with it; `seed:tiers` only moves four columns on rows that already exist. This
// writes each snapshot comp through the editor's own path (validateCompPayload +
// writeComp) but only for the rows that actually differ, so re-running writes
// nothing. votes and views are not part of a comp payload and survive; the cover
// badge is re-applied from comp-extras.json, or kept from the row while the file
// stays silent about it. A payload that fails validation is reported and skipped,
// so a bad name cannot half-write a row.
// The comparison itself lives in src/comp-provenance.ts so the admin provenance
// screen reports exactly the drift this script would fix.
// Run: npm run seed:comps -- --dry-run
import { pool } from '../src/db.ts';
import { validateCompPayload, writeComp, type CompInput } from '../src/comps.ts';
import { flushRevalidate, notifyRevalidate } from '../src/revalidate.ts';
import { changedSections, desiredSections, loadStoredComps, readCompExtras, readSnapshot, storedSections } from '../src/comp-provenance.ts';

const dryRun = process.argv.includes('--dry-run');

const source = await readSnapshot();
const seen = new Set<string>();
for (const comp of source) {
  const slug = String(comp.slug);
  if (seen.has(slug)) throw new Error(`duplicate slug in seed/comps.json: ${slug}`);
  seen.add(slug);
}

const extras = await readCompExtras();
const storedComps = await loadStoredComps();

const pending: { comp: CompInput; changed: string[] }[] = [];
const skipped: { slug: string; error: string }[] = [];
for (const raw of source) {
  const result = await validateCompPayload(raw);
  if ('error' in result) {
    skipped.push({ slug: String(raw.slug), error: result.error });
    continue;
  }
  const comp = result.comp;
  comp.cover = extras[comp.slug]?.cover ?? storedComps.get(comp.slug)?.row.cover ?? null;
  const have = storedComps.get(comp.slug);
  const changed = have ? changedSections(desiredSections(comp), storedSections(have)) : ['new'];
  if (changed.length) pending.push({ comp, changed });
}

let inserted = 0;
let rewritten = 0;
for (const { comp, changed } of pending) {
  const isNew = changed[0] === 'new';
  console.log(`${dryRun ? 'would ' : ''}${isNew ? 'insert' : 'rewrite'} ${comp.slug} · ${comp.title} · ${changed.join(', ')}`);
  if (!dryRun) await writeComp(comp);
  if (isNew) inserted += 1;
  else rewritten += 1;
}

const unchanged = source.length - pending.length - skipped.length;
const covers = pending.filter(({ comp }) => extras[comp.slug]?.cover).length;
console.log(
  `${dryRun ? 'dry run:' : 'synced'} ${inserted} inserted, ${rewritten} rewritten, ${unchanged} already matching${skipped.length ? `, ${skipped.length} skipped` : ''}${covers ? `, ${covers} covers from comp-extras.json` : ''}`
);
if (skipped.length) {
  for (const entry of skipped) console.error(`skipped ${entry.slug}: ${entry.error}`);
  console.log('fix the skipped payloads (rerun completes the set — written comps are left alone)');
}

const onlyInDb = [...storedComps.keys()].filter((slug) => !seen.has(slug));
if (onlyInDb.length) {
  console.log(`${onlyInDb.length} comps in the database are not in the snapshot, left untouched:`);
  console.log(`  ${onlyInDb.join(', ')}`);
}

if (!dryRun && pending.length) {
  notifyRevalidate('comps');
  const revalidated = await flushRevalidate();
  console.log(revalidated.length ? `told the web app to revalidate: ${revalidated.join(', ')}` : 'no revalidation sent (set WEB_REVALIDATE_TOKEN to purge the page cache now)');
}

await pool.end();
