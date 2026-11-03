// Brings the patch-note articles onto the committed patch-notes.json.
//
// The numbers are the crawler's; the prose is the editor's. `mergePatchArticle` is what keeps
// those two apart on a re-run: change tables are replaced, prose blocks and any field an admin
// touched survive. Re-running after a Riot micro patch therefore writes the new rows and
// leaves the commentary alone; re-running twice writes nothing at all.
//
// Run: npm run seed:patch-notes -- --dry-run
import { pool } from '../src/db.ts';
import { flushRevalidate, notifyRevalidate } from '../src/revalidate.ts';
import { syncPatchNotes } from '../src/patch-notes-article.ts';

const dryRun = process.argv.includes('--dry-run');
const { written, unchanged, skipped, hijacked } = await syncPatchNotes({ dryRun });

console.log(`${dryRun ? 'dry run:' : 'synced'} ${written.length} written, ${unchanged.length} already matching`);
for (const line of written) console.log(`  ${line}`);
if (hijacked.length) console.error(`refusing to overwrite: ${hijacked.join(', ')}`);
for (const line of skipped) console.error(`skipped ${line}`);
if (skipped.length) console.error('fix the payload and rerun — articles already written are left alone');

if (!dryRun && written.length) {
  notifyRevalidate('guides');
  const revalidated = await flushRevalidate();
  console.log(
    revalidated.length
      ? `told the web app to revalidate: ${revalidated.join(', ')}`
      : 'no revalidation sent (set WEB_REVALIDATE_TOKEN to purge the page cache now)'
  );
}

await pool.end();
process.exitCode = skipped.length || hijacked.length ? 1 : 0;
