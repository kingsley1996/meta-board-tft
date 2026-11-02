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
// Run: npm run seed:comps -- --dry-run
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../src/db.ts';
import { sharedDataPath } from '../src/shared-data.ts';
import { validateCompPayload, writeComp, type CompCover, type CompInput } from '../src/comps.ts';
import { flushRevalidate, notifyRevalidate } from '../src/revalidate.ts';

const here = import.meta.dirname;
const dryRun = process.argv.includes('--dry-run');

const source = JSON.parse(await readFile(join(here, 'comps.json'), 'utf8')) as Record<string, unknown>[];
const seen = new Set<string>();
for (const comp of source) {
  const slug = String(comp.slug);
  if (seen.has(slug)) throw new Error(`duplicate slug in seed/comps.json: ${slug}`);
  seen.add(slug);
}

const extras = (JSON.parse(await readFile(sharedDataPath('comp-extras.json'), 'utf8')).comps ?? {}) as Record<
  string,
  { cover?: CompCover }
>;

type NamedRow = { slug: string; name: string };
type UnitRow = NamedRow & { role: string; row: number | null; col: number | null; stars: number | null; items: string[] };
type StageRow = { slug: string; stage: number; text: string };
type CompRow = {
  slug: string;
  title: string;
  title_vi: string | null;
  tier: string;
  situational: boolean;
  style: string;
  difficulty: number;
  trend: string | null;
  playstyle: string;
  playstyle_vi: string | null;
  carry: string;
  cover: CompCover | null;
  tips: string;
  tips_vi: string | null;
  augment_types: string[];
  matchups: { slug: string; kind: string }[];
};

const group = <T extends { slug: string }>(rows: T[]) => {
  const bySlug = new Map<string, T[]>();
  for (const row of rows) bySlug.set(row.slug, [...(bySlug.get(row.slug) ?? []), row]);
  return bySlug;
};

const comps = await pool.query<CompRow>('SELECT slug, title, title_vi, tier, situational, style, difficulty, trend, playstyle, playstyle_vi, carry, cover, tips, tips_vi, augment_types, matchups FROM comps');
const storedComps = new Map(comps.rows.map((row) => [row.slug, row]));
const unitRows = group((await pool.query<UnitRow>('SELECT comp_slug AS slug, role, name, row, col, stars, items FROM comp_units ORDER BY position')).rows);
const itemRows = group((await pool.query<NamedRow>('SELECT comp_slug AS slug, name FROM comp_items ORDER BY position')).rows);
const augmentRows = group((await pool.query<NamedRow>('SELECT comp_slug AS slug, name FROM comp_augments ORDER BY position')).rows);
const stageRows = group((await pool.query<StageRow>('SELECT comp_slug AS slug, stage, text FROM comp_stages ORDER BY stage')).rows);

const hex = (unit: { name: string; row?: number | null; col?: number | null; stars?: number | null; items?: string[] }) =>
  `${unit.name}@${unit.row ?? '-'},${unit.col ?? '-'}:${unit.stars ?? '-'}[${(unit.items ?? []).join(',')}]`;

// The columns and child rows a comp payload owns. A section only counts as
// changed when the database holds something other than what the snapshot says,
// so a re-run finds nothing to write. Stage `text_vi` is left out because
// writeComp keeps it through an upsert, exactly like the editor does.
const sections = (board: string[], early: string[], alt: string[], items: string[], augments: string[], types: string[], stages: string[], copy: string[], rating: string[], matchups: string[]) => ({
  board,
  early,
  alt,
  items,
  augments,
  types,
  stages,
  copy,
  rating,
  matchups,
});

const desired = (comp: CompInput) =>
  sections(
    comp.units.map(hex),
    comp.early,
    comp.alt.map((unit) => hex(unit)),
    comp.items,
    comp.augments,
    [...comp.augmentTypes].sort(),
    comp.stages.map((stage) => `${stage.stage}:${stage.text}`),
    [comp.title, comp.titleVi, comp.playstyle, comp.playstyleVi, comp.tips, comp.tipsVi, comp.carry, comp.difficulty].map(String),
    [comp.tier, comp.trend, comp.situational, comp.style].map(String),
    comp.matchups.map((matchup) => `${matchup.kind}:${matchup.slug}`)
  );

const stored = (slug: string) => {
  const row = storedComps.get(slug);
  if (!row) return null;
  const units = unitRows.get(slug) ?? [];
  return sections(
    units.filter((unit) => unit.role === 'board').map(hex),
    units.filter((unit) => unit.role === 'early').map((unit) => unit.name),
    units.filter((unit) => unit.role === 'alt').map((unit) => hex(unit)),
    (itemRows.get(slug) ?? []).map((unit) => unit.name),
    (augmentRows.get(slug) ?? []).map((unit) => unit.name),
    [...(row.augment_types ?? [])].sort(),
    (stageRows.get(slug) ?? []).map((stage) => `Stage ${stage.stage}:${stage.text}`),
    [row.title, row.title_vi, row.playstyle, row.playstyle_vi, row.tips, row.tips_vi, row.carry, row.difficulty].map(String),
    [row.tier, row.trend, row.situational, row.style].map(String),
    (row.matchups ?? []).map((matchup) => `${matchup.kind}:${matchup.slug}`)
  );
};

const changedSections = (want: ReturnType<typeof desired>, have: ReturnType<typeof desired>) =>
  Object.keys(want).filter((key) => JSON.stringify(want[key as keyof typeof want]) !== JSON.stringify(have[key as keyof typeof have]));

const pending: { comp: CompInput; changed: string[] }[] = [];
const skipped: { slug: string; error: string }[] = [];
for (const raw of source) {
  const result = await validateCompPayload(raw);
  if ('error' in result) {
    skipped.push({ slug: String(raw.slug), error: result.error });
    continue;
  }
  const comp = result.comp;
  comp.cover = extras[comp.slug]?.cover ?? storedComps.get(comp.slug)?.cover ?? null;
  const have = stored(comp.slug);
  const changed = have ? changedSections(desired(comp), have) : ['new'];
  if (changed.length) pending.push({ comp, changed });
}

let inserted = 0;
let rewritten = 0;
for (const { comp, changed } of pending) {
  const isNew = changed[0] === 'new';
  console.log(`${dryRun ? 'would ' : ''}${isNew ? 'insert' : 'rewrite'} ${comp.slug} · ${comp.title} · ${changed.join(', ')}`);
  if (dryRun) {
    if (isNew) inserted += 1;
    else rewritten += 1;
    continue;
  }
  await writeComp(comp);
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

const onlyInDb = comps.rows.map((row) => row.slug).filter((slug) => !seen.has(slug));
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
