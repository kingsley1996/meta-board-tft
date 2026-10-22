import { pool } from './db.ts';
import { translateText } from './assistant/translate.ts';

const TIERS = ['S', 'A', 'B', 'C', 'X'];
const STYLES = ['Reroll', 'Fast 8', 'Flex', 'Tempo'];
const AUGMENT_TYPES = ['ITEMS', 'ECON', 'COMBAT', 'EMBLEM'];

export type BoardUnit = {
  name: string;
  row: number | null;
  col: number | null;
  stars: number | null;
  items: string[];
};

export type AltUnit = {
  name: string;
  stars: number | null;
  items: string[];
};

export type CompInput = {
  slug: string;
  title: string;
  tier: string;
  style: string;
  difficulty: number;
  trend: string | null;
  playstyle: string;
  playstyleVi: string | null;
  units: BoardUnit[];
  early: string[];
  carry: string;
  items: string[];
  augments: string[];
  tips: string;
  tipsVi: string | null;
  stages: { stage: string; text: string; textVi: string | null }[];
  alt: AltUnit[];
  augmentTypes: string[];
  matchups: { slug: string; kind: string }[];
};

async function nameSets() {
  const [champions, items, augments, comps] = await Promise.all([
    pool.query('SELECT name FROM champions'),
    pool.query('SELECT name FROM items'),
    pool.query('SELECT name FROM augments'),
    pool.query('SELECT slug FROM comps'),
  ]);
  return {
    champions: new Set<string>(champions.rows.map((row) => row.name)),
    items: new Set<string>(items.rows.map((row) => row.name)),
    augments: new Set<string>(augments.rows.map((row) => row.name)),
    comps: new Set<string>(comps.rows.map((row) => row.slug)),
  };
}

export async function validateCompPayload(input: unknown, originalSlug?: string): Promise<{ comp: CompInput } | { error: string }> {
  const fail = (message: string) => ({ error: message });
  if (!input || typeof input !== 'object') return fail('invalid payload');
  const raw = input as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const list = (value: unknown) => (Array.isArray(value) ? value.map(str).filter(Boolean) : []);

  const title = str(raw.title);
  if (!title) return fail('title is required');

  const slug = str(raw.slug).toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return fail('slug must be lowercase letters, numbers and dashes');
  if (originalSlug !== undefined && slug !== originalSlug) return fail('slug cannot be changed on an existing comp');

  const tier = str(raw.tier);
  if (!TIERS.includes(tier)) return fail('tier must be one of S, A, B, C, X');
  const style = str(raw.style);
  if (!STYLES.includes(style)) return fail('style must be one of Reroll, Fast 8, Flex, Tempo');
  const difficulty = Number(raw.difficulty);
  if (![1, 2, 3].includes(difficulty)) return fail('difficulty must be 1, 2 or 3');

  const trend = str(raw.trend);
  if (trend && !['up', 'down'].includes(trend)) return fail('trend must be up, down or omitted');

  const playstyle = str(raw.playstyle);
  if (!playstyle) return fail('playstyle is required');
  const playstyleVi = str(raw.playstyleVi) || null;

  // Units accept "Name" or { name, row, col, stars, items } — positions are
  // optional hex coordinates (0-3 rows, 0-6 cols), stars 1-3, items up to 3.
  const cellNumber = (value: unknown) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isInteger(number) ? number : Number.NaN;
  };
  const units: BoardUnit[] = (Array.isArray(raw.units) ? raw.units : [])
    .map((entry) => {
      if (typeof entry === 'string') return { name: entry.trim(), row: null, col: null, stars: null, items: [] };
      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>;
        return {
          name: str(record.name),
          row: cellNumber(record.row),
          col: cellNumber(record.col),
          stars: cellNumber(record.stars),
          items: list(record.items),
        };
      }
      return { name: '', row: null, col: null, stars: null, items: [] };
    })
    .filter((unit) => unit.name);
  if (units.length < 3 || units.length > 12) return fail('units must contain 3 to 12 champion names');

  const unitNames = units.map((unit) => unit.name);
  if (new Set(unitNames).size !== unitNames.length) return fail('duplicate champions on the board');

  for (const unit of units) {
    const placed = unit.row !== null || unit.col !== null;
    const complete = unit.row !== null && unit.col !== null;
    if (placed && !complete) return fail(`unit ${unit.name} needs both row and col`);
    if (complete && (unit.row! < 0 || unit.row! > 3 || unit.col! < 0 || unit.col! > 6)) {
      return fail(`unit ${unit.name} has an off-board position`);
    }
    if (unit.stars !== null && (!Number.isInteger(unit.stars) || unit.stars < 1 || unit.stars > 3)) {
      return fail(`unit ${unit.name} has invalid stars (1-3)`);
    }
    if (unit.items.length > 3) return fail(`unit ${unit.name} can hold at most 3 items`);
  }
  const cells = units.filter((unit) => unit.row !== null).map((unit) => `${unit.row}:${unit.col}`);
  if (new Set(cells).size !== cells.length) return fail('two champions share the same hex');

  const carry = str(raw.carry);
  if (!unitNames.includes(carry)) return fail('carry must be one of the units');

  const early = list(raw.early);
  if (!early.length) return fail('at least one early unit is required');

  const items = list(raw.items);
  if (!items.length) return fail('at least one item is required');

  const augments = list(raw.augments);
  if (!augments.length) return fail('at least one augment is required');

  const augmentTypes = [...new Set(list(raw.augmentTypes).map((type) => type.toUpperCase()))];
  const unknownAugmentType = augmentTypes.find((type) => !AUGMENT_TYPES.includes(type));
  if (unknownAugmentType) return fail(`unknown augment priority: ${unknownAugmentType}`);

  // Alt builds accept "Name" (admin form) or { name, stars, items } (stored shape).
  // Names-only saves keep the items/stars already stored for that name. Alt item
  // names are not checked against `items` because TFT Academy recommends
  // artifacts that CDragon does not list as completed items.
  const altEntries = Array.isArray(raw.alt) ? raw.alt : [];
  const existingAlt = altEntries.some((entry) => typeof entry === 'string')
    ? (await pool.query("SELECT name, stars, items FROM comp_units WHERE comp_slug = $1 AND role = 'alt' ORDER BY position", [slug])).rows
    : [];
  const alt: AltUnit[] = [];
  for (const entry of altEntries) {
    let name = '';
    let stars: number | null = null;
    let altItems: string[] = [];
    if (typeof entry === 'string') {
      name = entry.trim();
      const index = existingAlt.findIndex((row: { name: string }) => row.name === name);
      if (index >= 0) {
        const [row] = existingAlt.splice(index, 1);
        stars = row.stars ?? null;
        altItems = row.items ?? [];
      }
    } else if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      name = str(record.name);
      stars = cellNumber(record.stars);
      altItems = list(record.items);
    }
    if (!name) continue;
    if (stars !== null && (!Number.isInteger(stars) || stars < 1 || stars > 3)) {
      return fail(`alt build ${name} has invalid stars (1-3)`);
    }
    if (altItems.length > 3) return fail(`alt build ${name} can hold at most 3 items`);
    alt.push({ name, stars, items: altItems });
  }

  // Counters: [{ slug, kind: 'good' | 'bad' }], up to 6, other comps only.
  const matchupEntries = Array.isArray(raw.matchups) ? raw.matchups : [];
  if (matchupEntries.length > 6) return fail('at most 6 matchups');
  const matchups = matchupEntries.map((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    return { slug: str(record.slug).toLowerCase(), kind: str(record.kind) };
  });
  for (const entry of matchups) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.slug)) return fail(`invalid matchup slug: ${entry.slug || '(empty)'}`);
    if (!['good', 'bad'].includes(entry.kind)) return fail('matchup kind must be good or bad');
    if (entry.slug === slug) return fail('a comp cannot counter itself');
  }
  if (new Set(matchups.map((entry) => entry.slug)).size !== matchups.length) return fail('duplicate comps in matchups');

  // Tips and stage texts are optional.
  const tips = str(raw.tips);
  const tipsVi = str(raw.tipsVi) || null;

  // Accepts ["text", ...] (admin form / API) and [{ stage, text, textVi? }, ...] (stored shape).
  // Empty slots are skipped, but stage numbers keep their slot (index 0 → stage 2).
  const stageEntries = Array.isArray(raw.stages) ? raw.stages : [];
  if (stageEntries.length > 3) return fail('at most 3 stage texts (stages 2, 3, 4)');
  const stages = stageEntries
    .map((entry, index) => ({
      stage: `Stage ${index + 2}`,
      text: typeof entry === 'string' ? entry.trim() : str((entry as Record<string, unknown> | null)?.text),
      textVi: typeof entry === 'object' && entry ? str((entry as Record<string, unknown>).textVi) || null : null,
    }))
    .filter((stage) => stage.text);

  const known = await nameSets();
  const unknownUnit = [...unitNames, ...early, ...alt.map((unit) => unit.name)].find((name) => !known.champions.has(name));
  if (unknownUnit) return fail(`unknown champion: ${unknownUnit}`);
  const unknownItem = items.find((name) => !known.items.has(name));
  if (unknownItem) return fail(`unknown item: ${unknownItem}`);
  const unitItems = units.flatMap((unit) => unit.items.map((name) => [unit.name, name] as const));
  const unknownUnitItem = unitItems.find(([, name]) => !known.items.has(name));
  if (unknownUnitItem) return fail(`unknown item on ${unknownUnitItem[0]}: ${unknownUnitItem[1]}`);
  const unknownAugment = augments.find((name) => !known.augments.has(name));
  if (unknownAugment) return fail(`unknown augment: ${unknownAugment}`);
  const unknownMatchup = matchups.find((entry) => !known.comps.has(entry.slug));
  if (unknownMatchup) return fail(`unknown comp in matchups: ${unknownMatchup.slug}`);

  return {
    comp: {
      slug,
      title,
      tier,
      style,
      difficulty,
      trend: trend || null,
      playstyle,
      playstyleVi,
      units,
      early,
      carry,
      items,
      augments,
      tips,
      tipsVi,
      stages,
      alt,
      augmentTypes,
      matchups,
    },
  };
}

export async function writeComp(comp: CompInput): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO comps (slug, title, tier, style, difficulty, trend, playstyle, playstyle_vi, carry, tips, tips_vi, augment_types, matchups)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title, tier = EXCLUDED.tier, style = EXCLUDED.style,
         difficulty = EXCLUDED.difficulty, trend = EXCLUDED.trend, playstyle = EXCLUDED.playstyle,
         playstyle_vi = EXCLUDED.playstyle_vi, carry = EXCLUDED.carry, tips = EXCLUDED.tips,
         tips_vi = EXCLUDED.tips_vi, augment_types = EXCLUDED.augment_types,
         matchups = EXCLUDED.matchups, updated_at = now()`,
      [comp.slug, comp.title, comp.tier, comp.style, comp.difficulty, comp.trend, comp.playstyle, comp.playstyleVi, comp.carry, comp.tips, comp.tipsVi, comp.augmentTypes, JSON.stringify(comp.matchups)]
    );
    for (const table of ['comp_units', 'comp_items', 'comp_augments']) {
      await client.query(`DELETE FROM ${table} WHERE comp_slug = $1`, [comp.slug]);
    }
    const insertNamed = async (table: string, names: string[]) => {
      for (let position = 0; position < names.length; position++) {
        await client.query(`INSERT INTO ${table} (comp_slug, position, name) VALUES ($1, $2, $3)`, [comp.slug, position, names[position]]);
      }
    };
    for (let position = 0; position < comp.units.length; position++) {
      const unit = comp.units[position];
      await client.query(
        'INSERT INTO comp_units (comp_slug, role, position, name, row, col, stars, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [comp.slug, 'board', position, unit.name, unit.row, unit.col, unit.stars, unit.items]
      );
    }
    const insertUnits = async (names: string[], unitRole: string) => {
      for (let position = 0; position < names.length; position++) {
        await client.query('INSERT INTO comp_units (comp_slug, role, position, name) VALUES ($1, $2, $3, $4)', [comp.slug, unitRole, position, names[position]]);
      }
    };
    await insertUnits(comp.early, 'early');
    for (let position = 0; position < comp.alt.length; position++) {
      const unit = comp.alt[position];
      await client.query(
        'INSERT INTO comp_units (comp_slug, role, position, name, stars, items) VALUES ($1, $2, $3, $4, $5, $6)',
        [comp.slug, 'alt', position, unit.name, unit.stars, unit.items]
      );
    }
    await insertNamed('comp_items', comp.items);
    await insertNamed('comp_augments', comp.augments);
    // Stages upsert instead of delete+insert so an admin save keeps the vi text.
    // Slots emptied in the editor are dropped (stage numbers are kept per slot).
    const stageNumbers = comp.stages.map((stage) => Number(stage.stage.replace(/\D+/g, '')));
    await client.query('DELETE FROM comp_stages WHERE comp_slug = $1 AND stage <> ALL($2::int[])', [comp.slug, stageNumbers]);
    for (const stage of comp.stages) {
      await client.query(
        `INSERT INTO comp_stages (comp_slug, stage, text, text_vi) VALUES ($1, $2, $3, $4)
         ON CONFLICT (comp_slug, stage) DO UPDATE SET text = EXCLUDED.text`,
        [comp.slug, Number(stage.stage.replace(/\D+/g, '')), stage.text, stage.textVi]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Community counters. Returns the new value, or null when the slug is unknown.
export async function bumpComp(slug: string, field: 'votes' | 'views'): Promise<number | null> {
  const { rows } = await pool.query(`UPDATE comps SET ${field} = ${field} + 1 WHERE slug = $1 RETURNING ${field}`, [slug]);
  return rows.length ? (rows[0][field] as number) : null;
}

export async function compExists(slug: string): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM comps WHERE slug = $1', [slug]);
  return (rowCount ?? 0) > 0;
}

export async function deleteComp(slug: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM comps WHERE slug = $1', [slug]);
  return (rowCount ?? 0) > 0;
}

export async function listComps(slug?: string, lang: 'en' | 'vi' = 'en', sort?: string): Promise<any[]> {
  const vi = lang === 'vi';
  const order = !slug && sort === 'popular' ? 'ORDER BY votes DESC, created_at, slug' : 'ORDER BY created_at, slug';
  const comps = await pool.query(
    slug ? 'SELECT * FROM comps WHERE slug = $1' : `SELECT * FROM comps ${order}`,
    slug ? [slug] : []
  );
  if (!comps.rows.length) return [];
  const slugs = comps.rows.map((row) => row.slug);

  const [units, items, augments, stages, champions, traitRows, itemIcons, augmentIcons] = await Promise.all([
    pool.query('SELECT comp_slug, role, name, row, col, stars, items FROM comp_units WHERE comp_slug = ANY($1) ORDER BY comp_slug, role, position', [slugs]),
    pool.query('SELECT comp_slug, name FROM comp_items WHERE comp_slug = ANY($1) ORDER BY comp_slug, position', [slugs]),
    pool.query('SELECT comp_slug, name FROM comp_augments WHERE comp_slug = ANY($1) ORDER BY comp_slug, position', [slugs]),
    pool.query('SELECT comp_slug, stage, text, text_vi FROM comp_stages WHERE comp_slug = ANY($1) ORDER BY comp_slug, stage', [slugs]),
    pool.query('SELECT name, cost, icon, traits FROM champions'),
    pool.query('SELECT name, thresholds, styles, icon FROM traits'),
    pool.query('SELECT name, icon FROM items'),
    pool.query('SELECT DISTINCT ON (name) name, icon FROM augments ORDER BY name'),
  ]);

  const championByName = new Map<string, { cost: number; icon: string | null; traits: string[] }>(
    champions.rows.map((row) => [row.name, { cost: row.cost, icon: row.icon, traits: row.traits ?? [] }])
  );
  const traitByName = new Map<string, { thresholds: number[]; styles: number[]; icon: string | null }>(
    traitRows.rows.map((row) => [row.name, { thresholds: row.thresholds ?? [], styles: row.styles ?? [], icon: row.icon ?? null }])
  );
  const itemIconByName = new Map<string, string | null>(itemIcons.rows.map((row) => [row.name, row.icon]));
  const augmentIconByName = new Map<string, string | null>(augmentIcons.rows.map((row) => [row.name, row.icon]));

  // Resolve matchup slugs to titles/tiers; entries pointing at deleted comps are dropped.
  const referenced = new Set<string>();
  for (const row of comps.rows) for (const entry of row.matchups ?? []) referenced.add(entry.slug);
  const matchupInfo = new Map<string, { title: string; tier: string }>(
    referenced.size
      ? (await pool.query('SELECT slug, title, tier FROM comps WHERE slug = ANY($1)', [[...referenced]])).rows.map((row) => [row.slug, { title: row.title, tier: row.tier }])
      : []
  );

  const group = (rows: any[], key: string) => {
    const map = new Map<string, any[]>();
    for (const row of rows) {
      if (!map.has(row[key])) map.set(row[key], []);
      map.get(row[key])!.push(row);
    }
    return map;
  };
  const unitsBySlug = group(units.rows, 'comp_slug');
  const itemsBySlug = group(items.rows, 'comp_slug');
  const augmentsBySlug = group(augments.rows, 'comp_slug');
  const stagesBySlug = group(stages.rows, 'comp_slug');

  const icon = (name: string, map: Map<string, string | null>) => ({ name, icon: map.get(name) ?? null });
  const unit = (entry: any) => {
    const found = championByName.get(entry.name);
    return {
      name: entry.name,
      cost: found?.cost ?? 1,
      icon: found?.icon ?? null,
      row: entry.row ?? null,
      col: entry.col ?? null,
      stars: entry.stars ?? null,
      items: (entry.items ?? []).map((name: string) => icon(name, itemIconByName)),
    };
  };

  const compTraits = (boardNames: string[]) => {
    const counts = new Map<string, number>();
    for (const name of boardNames) {
      for (const trait of championByName.get(name)?.traits ?? []) {
        counts.set(trait, (counts.get(trait) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count, ...(traitByName.get(name) ?? { thresholds: [], styles: [], icon: null }) }))
      .sort((a, b) => {
        const level = (trait: typeof a) => trait.thresholds.filter((threshold) => trait.count >= threshold).length;
        return level(b) - level(a) || b.count - a.count || a.name.localeCompare(b.name);
      });
  };

  return comps.rows.map((row) => {
    const compUnits = unitsBySlug.get(row.slug) ?? [];
    const role = (value: string) => compUnits.filter((entry) => entry.role === value).map(unit);
    return {
      slug: row.slug,
      title: row.title,
      tier: row.tier,
      style: row.style,
      difficulty: row.difficulty,
      trend: row.trend ?? null,
      votes: row.votes ?? 0,
      views: row.views ?? 0,
      playstyle: vi
        ? translateText('vi', 'comps', 'comp-playstyle', row.playstyle, row.playstyle_vi)
        : row.playstyle,
      units: role('board'),
      traits: compTraits(compUnits.filter((entry) => entry.role === 'board').map((entry) => entry.name)),
      early: role('early'),
      carry: unit({ name: row.carry }),
      items: (itemsBySlug.get(row.slug) ?? []).map((entry) => icon(entry.name, itemIconByName)),
      augments: (augmentsBySlug.get(row.slug) ?? []).map((entry) => icon(entry.name, augmentIconByName)),
      tips: vi ? translateText('vi', 'comps', 'comp-tips', row.tips, row.tips_vi) : row.tips,
      stages: (stagesBySlug.get(row.slug) ?? []).map((entry) => ({
        stage: vi ? `Giai đoạn ${entry.stage}` : `Stage ${entry.stage}`,
        text: vi ? translateText('vi', 'comps', 'comp-stage', entry.text, entry.text_vi) : entry.text,
      })),
      alt: role('alt'),
      augmentTypes: row.augment_types ?? [],
      matchups: (row.matchups ?? []).flatMap((entry: { slug: string; kind: string }) => {
        const info = matchupInfo.get(entry.slug);
        return info ? [{ slug: entry.slug, kind: entry.kind, title: info.title, tier: info.tier }] : [];
      }),
    };
  });
}
