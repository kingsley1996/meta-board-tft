import { pathToFileURL } from 'node:url';
import { pool } from '../src/db.ts';
import { validateCompPayload, writeComp, type CompInput } from '../src/comps.ts';
import { flushRevalidate, notifyRevalidate } from '../src/revalidate.ts';
import { changedSections, desiredSections, loadStoredComps, readCompExtras, readSnapshot, storedSections } from '../src/comp-provenance.ts';

export async function syncComps(source: Record<string, unknown>[], options: { dryRun?: boolean; check?: boolean } = {}) {
  const dryRun = options.dryRun || options.check;
  if (!source.length) throw new Error('empty seed/comps.json');
  const seen = new Set<string>();
  for (const comp of source) {
    const slug = String(comp.slug ?? '').trim().toLowerCase();
    if (seen.has(slug)) throw new Error(`duplicate slug in seed/comps.json: ${slug}`);
    seen.add(slug);
  }

  const extras = await readCompExtras();
  const storedComps = await loadStoredComps();
  const pending: { comp: CompInput; changed: string[] }[] = [];
  const invalid: { slug: string; error: string }[] = [];
  for (const raw of source) {
    const slug = String(raw.slug ?? '').trim().toLowerCase();
    const have = storedComps.get(slug);
    const cover = extras[slug]?.cover ?? have?.row.cover ?? null;
    const result = await validateCompPayload({ ...raw, cover });
    if ('error' in result) {
      invalid.push({ slug, error: result.error });
      continue;
    }
    const comp = result.comp;
    const changed: string[] = have ? changedSections(desiredSections(comp), storedSections(have)) : ['new'];
    if (have && (comp.cover?.kind !== have.row.cover?.kind || comp.cover?.name !== have.row.cover?.name)) changed.push('cover');
    if (changed.length) pending.push({ comp, changed });
  }

  // Validate the entire snapshot before the first write, including in dry-run mode.
  if (invalid.length) {
    for (const entry of invalid) console.error(`invalid ${entry.slug}: ${entry.error}`);
    throw new Error(`${invalid.length} invalid comps; nothing written`);
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

  const unchanged = source.length - pending.length;
  console.log(`${dryRun ? 'dry run:' : 'synced'} ${inserted} inserted, ${rewritten} rewritten, ${unchanged} already matching`);
  const onlyInDb = [...storedComps.keys()].filter((slug) => !seen.has(slug));
  if (onlyInDb.length) console.log(`${onlyInDb.length} comps outside the snapshot, left untouched: ${onlyInDb.join(', ')}`);
  if (options.check && pending.length) throw new Error(`${pending.length} comps do not match the snapshot`);

  if (!dryRun && pending.length) {
    notifyRevalidate('comps');
    const revalidated = await flushRevalidate();
    console.log(revalidated.length ? `told the web app to revalidate: ${revalidated.join(', ')}` : 'no revalidation sent (set WEB_REVALIDATE_TOKEN to purge the page cache now)');
  }
  return { inserted, rewritten, unchanged };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await syncComps(await readSnapshot(), { dryRun: process.argv.includes('--dry-run'), check: process.argv.includes('--check') });
  } finally {
    await pool.end();
  }
}
