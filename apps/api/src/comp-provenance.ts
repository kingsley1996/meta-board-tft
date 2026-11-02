// One definition of "what a comp row is supposed to contain". The seed script
// needs it to decide which rows to rewrite; the admin provenance screen needs
// it to show the admin where a field came from and whether the database still
// agrees with the snapshot. Both go through the functions here so a drift the
// page reports is exactly the drift `seed:comps` would fix.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from './db.ts';
import { sharedDataPath } from './shared-data.ts';
import { validateCompPayload, type CompCover, type CompInput } from './comps.ts';

// The columns the diff reads, plus the two counters the panel shows but no
// snapshot owns. Everything else on the row is written by other paths and is not
// a snapshot's business.
export type CompRow = {
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
  votes: number;
  views: number;
};

export type UnitRow = {
  role: string;
  name: string;
  row: number | null;
  col: number | null;
  stars: number | null;
  items: string[];
};

export type StageRow = { stage: number; text: string; text_vi: string | null };

export type StoredComp = {
  row: CompRow;
  units: UnitRow[];
  items: string[];
  augments: string[];
  stages: StageRow[];
};

export type CompExtras = {
  cover?: CompCover;
  flex?: { name: string; replaces: string }[];
  alt?: { name: string; items: string[] }[];
};

const SECTION_KEYS = [
  'board',
  'early',
  'alt',
  'items',
  'augments',
  'types',
  'stages',
  'copy',
  'rating',
  'matchups',
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];
export type Sections = Record<SectionKey, string[]>;

export { SECTION_KEYS };

export const hex = (unit: { name: string; row?: number | null; col?: number | null; stars?: number | null; items?: string[] }) =>
  `${unit.name}@${unit.row ?? '-'},${unit.col ?? '-'}:${unit.stars ?? '-'}[${(unit.items ?? []).join(',')}]`;

// A section only counts as changed when the database holds something other than
// what the snapshot says, so a re-run finds nothing to write. Stage `text_vi` is
// left out because writeComp keeps it through an upsert, exactly like the editor
// does.
const sections = (
  board: string[],
  early: string[],
  alt: string[],
  items: string[],
  augments: string[],
  types: string[],
  stages: string[],
  copy: string[],
  rating: string[],
  matchups: string[]
): Sections => ({ board, early, alt, items, augments, types, stages, copy, rating, matchups });

export function desiredSections(comp: CompInput): Sections {
  return sections(
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
}

export function storedSections(stored: StoredComp): Sections {
  const { row, units } = stored;
  return sections(
    units.filter((unit) => unit.role === 'board').map(hex),
    units.filter((unit) => unit.role === 'early').map((unit) => unit.name),
    units.filter((unit) => unit.role === 'alt').map(hex),
    stored.items,
    stored.augments,
    [...(row.augment_types ?? [])].sort(),
    stored.stages.map((stage) => `Stage ${stage.stage}:${stage.text}`),
    [row.title, row.title_vi, row.playstyle, row.playstyle_vi, row.tips, row.tips_vi, row.carry, row.difficulty].map(String),
    [row.tier, row.trend, row.situational, row.style].map(String),
    (row.matchups ?? []).map((matchup) => `${matchup.kind}:${matchup.slug}`)
  );
}

export function changedSections(want: Sections, have: Sections): SectionKey[] {
  return SECTION_KEYS.filter((key) => JSON.stringify(want[key]) !== JSON.stringify(have[key]));
}

export async function readCompExtras(): Promise<Record<string, CompExtras>> {
  return (JSON.parse(await readFile(sharedDataPath('comp-extras.json'), 'utf8')).comps ?? {}) as Record<string, CompExtras>;
}

export async function readSnapshot(): Promise<Record<string, unknown>[]> {
  return JSON.parse(await readFile(join(import.meta.dirname, '../seed/comps.json'), 'utf8')) as Record<string, unknown>[];
}

// Everything the admin provenance screen needs about one comp: the raw rows the
// read path joins, the hand-mapped extras, the snapshot entry this row should
// match, and the sections that currently disagree. The panel payload itself comes
// from /api/comps/:slug so the screen annotates what a visitor actually sees.
export type CompProvenance = {
  slug: string;
  inDb: boolean;
  inSnapshot: boolean;
  row: CompRow | null;
  units: (UnitRow & { position: number })[];
  items: string[];
  augments: string[];
  stages: StageRow[];
  extras: CompExtras | null;
  snapshot: Record<string, unknown> | null;
  snapshotError: string | null;
  sections: { desired: Sections | null; stored: Sections | null };
  drift: SectionKey[];
  missing: { champions: string[]; items: string[]; augments: string[] };
};

export async function compProvenance(slug: string): Promise<CompProvenance> {
  const [stored, source, extras, champions, items, augments] = await Promise.all([
    loadStoredComps([slug]),
    readSnapshot(),
    readCompExtras(),
    pool.query<{ name: string }>('SELECT name FROM champions'),
    pool.query<{ name: string }>('SELECT name FROM items'),
    pool.query<{ name: string }>('SELECT name FROM augments'),
  ]);
  const storedComp = stored.get(slug) ?? null;
  const unitRows = storedComp
    ? (
        await pool.query<UnitRow & { position: number }>(
          'SELECT role, name, row, col, stars, items, position FROM comp_units WHERE comp_slug = $1 ORDER BY role, position',
          [slug]
        )
      ).rows
    : [];
  const snapshot = source.find((comp) => String(comp.slug) === slug) ?? null;

  let desired: Sections | null = null;
  let snapshotError: string | null = null;
  if (snapshot) {
    const result = await validateCompPayload(snapshot);
    if ('error' in result) snapshotError = result.error;
    else desired = desiredSections(result.comp);
  }

  const known = (rows: { name: string }[]) => new Set(rows.map((row) => row.name));
  const championNames = known(champions.rows);
  const itemNameSet = known(items.rows);
  const augmentNameSet = known(augments.rows);
  const unitItems = unitRows.flatMap((unit) => unit.items ?? []);
  const absent = (names: string[], set: Set<string>) => [...new Set(names)].filter((name) => !set.has(name)).sort();
  const flexNames = (extras[slug]?.flex ?? []).flatMap((pair) => [pair.name, pair.replaces]);

  return {
    slug,
    inDb: Boolean(storedComp),
    inSnapshot: Boolean(snapshot),
    row: storedComp?.row ?? null,
    units: unitRows,
    items: storedComp?.items ?? [],
    augments: storedComp?.augments ?? [],
    stages: storedComp?.stages ?? [],
    extras: extras[slug] ?? null,
    snapshot,
    snapshotError,
    sections: { desired, stored: storedComp ? storedSections(storedComp) : null },
    drift: desired && storedComp ? changedSections(desired, storedSections(storedComp)) : [],
    missing: {
      champions: absent([...unitRows.map((unit) => unit.name), ...flexNames], championNames),
      items: absent([...(storedComp?.items ?? []), ...unitItems], itemNameSet),
      augments: absent(storedComp?.augments ?? [], augmentNameSet),
    },
  };
}

// The child tables come back in the same order writeComp inserts them, so the
// position column is the display order the panel sees.
export async function loadStoredComps(slugs?: string[]): Promise<Map<string, StoredComp>> {
  const only = slugs && slugs.length ? slugs : null;
  const filter = only ? 'WHERE comp_slug = ANY($1)' : '';
  const args = only ? [only] : [];
  const [comps, units, items, augments, stages] = await Promise.all([
    pool.query<CompRow>(`SELECT * FROM comps${only ? ' WHERE slug = ANY($1)' : ''}`, args),
    pool.query<UnitRow & { comp_slug: string }>(`SELECT comp_slug, role, name, row, col, stars, items FROM comp_units ${filter} ORDER BY position`, args),
    pool.query<{ comp_slug: string; name: string }>(`SELECT comp_slug, name FROM comp_items ${filter} ORDER BY position`, args),
    pool.query<{ comp_slug: string; name: string }>(`SELECT comp_slug, name FROM comp_augments ${filter} ORDER BY position`, args),
    pool.query<StageRow & { comp_slug: string }>(`SELECT comp_slug, stage, text, text_vi FROM comp_stages ${filter} ORDER BY stage`, args),
  ]);
  const bucket = <T extends { comp_slug: string }>(rows: T[], map: (row: T) => unknown) => {
    const bySlug = new Map<string, unknown[]>();
    for (const row of rows) bySlug.set(row.comp_slug, [...(bySlug.get(row.comp_slug) ?? []), map(row)]);
    return bySlug;
  };
  const unitsBy = bucket(units.rows, ({ comp_slug: _slug, ...unit }) => unit);
  const itemsBy = bucket(items.rows, (row) => row.name);
  const augmentsBy = bucket(augments.rows, (row) => row.name);
  const stagesBy = bucket(stages.rows, ({ comp_slug: _slug, ...stage }) => stage);
  return new Map(
    comps.rows.map((row) => [
      row.slug,
      {
        row,
        units: (unitsBy.get(row.slug) ?? []) as UnitRow[],
        items: (itemsBy.get(row.slug) ?? []) as string[],
        augments: (augmentsBy.get(row.slug) ?? []) as string[],
        stages: (stagesBy.get(row.slug) ?? []) as StageRow[],
      },
    ])
  );
}
