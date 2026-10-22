// Builds the Vietnamese translation worklist.
//
// The app is bilingual: every English string that reaches a reader needs a
// Vietnamese counterpart. Some surfaces already carry `*Vi` fields (game data
// from CommunityDragon, guides, comp stats); the rest is prose nobody has
// translated yet. This script enumerates what is still missing, so the work
// can be handed to a translator as a flat checklist.
//
//   node scripts/extract-translation-tasks.mjs
//
// Output:
//   translations/worklist.json  machine readable, one task per string
//   translations/worklist.md    human readable checklist, grouped by surface
//
// The script never edits data files. It only reads them (and reads the comp
// rows from Postgres when a database is reachable). Existing `vi` answers are
// carried forward by task ID, and all untranslated comp stages are included.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'translations');

const readJson = async (relativePath) => JSON.parse(await readFile(join(ROOT, relativePath), 'utf8'));

async function readExistingWorklist() {
  try {
    const content = await readFile(join(OUT_DIR, 'worklist.json'), 'utf8');
    const worklist = JSON.parse(content);
    if (!Array.isArray(worklist.tasks)) {
      throw new Error('translations/worklist.json must contain a tasks array');
    }
    return worklist;
  } catch (error) {
    if (error.code === 'ENOENT') return { tasks: [] };
    throw error;
  }
}

const existingWorklist = await readExistingWorklist();

// Pure numbers, percentages and punctuation carry nothing to translate; the
// render path shows those as-is in every locale.
const NUMERIC_ONLY = /^[0-9.,%+<>=~×x\-\s/:]*$/i;

const isTranslatable = (value) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  !NUMERIC_ONLY.test(value) &&
  /[A-Za-z]/.test(value);

const tasks = [];

/**
 * Register one string that needs a Vietnamese translation.
 *
 * `id` is unique per (surface, kind, text) so a translator can fill answers in
 * incrementally and a later run can tell what is still missing.
 *
 * `vi` is pre-filled when the canonical game data already carries a
 * Vietnamese equivalent (see `buildEntityDictionary`). Those strings only need
 * a translator to sanity-check the wording, not to write it from scratch.
 *
 * The same English string often shows up in many tables (column headers, item
 * names, stage titles). Tasks are therefore keyed by (surface, kind, text) and
 * carry the full list of locations in `paths`, so a translator writes each
 * unique string once.
 */
const add = (surface, path, value, extra = {}) => {
  if (!isTranslatable(value)) return;
  const kind = extra.kind ?? 'text';
  const key = `${surface}::${kind}::${value.trim().toLowerCase()}`;
  const existing = tasks.find((task) => task.id === key);
  if (existing) {
    existing.paths.push(path);
    // Keep the richest metadata we have seen for this string.
    if (!existing.entity && extra.entity) existing.entity = extra.entity;
    if (extra.mentionsEntity) existing.mentionsEntity = true;
    if (!existing.round && extra.round) existing.round = extra.round;
    return;
  }
  tasks.push({ id: key, surface, kind, paths: [path], en: value, vi: null, ...extra });
};

/** Register every string of a list, keeping the index in the path. */
const addAll = (surface, prefix, values, extra = {}) =>
  values.forEach((value, index) => add(surface, `${prefix}[${index}]`, value, extra));

// ---------------------------------------------------------------------------
// 1. Loot tables (lib/loot-tables.json), mirrored from tftflow.
// ---------------------------------------------------------------------------
const loot = await readJson('lib/loot-tables.json');

for (const [pageIndex, page] of (loot.pages ?? []).entries()) {
  const base = `pages[${pageIndex}]`;

  add('loot', `${base}.title`, page.title, { kind: 'page-title' });
  add('loot', `${base}.name`, page.name, { kind: 'page-name' });

  for (const [ownerIndex, owner] of (page.owners ?? []).entries()) {
    const ownerBase = `${base}.owners[${ownerIndex}]`;

    add('loot', `${ownerBase}.name`, owner.name, { kind: 'owner-name', entity: owner.kind });
    add('loot', `${ownerBase}.description`, owner.description, { kind: 'owner-description' });

    for (const [tableIndex, table] of (owner.tables ?? []).entries()) {
      const tableBase = `${ownerBase}.tables[${tableIndex}]`;

      add('loot', `${tableBase}.title`, table.title, { kind: 'table-title' });
      add('loot', `${tableBase}.note`, table.note, { kind: 'table-note' });

      for (const [factIndex, fact] of (table.facts ?? []).entries()) {
        add('loot', `${tableBase}.facts[${factIndex}].label`, fact.label, { kind: 'fact-label' });
      }

      for (const [outcomeIndex, outcome] of (table.outcomes ?? []).entries()) {
        for (const [itemIndex, item] of (outcome.items ?? []).entries()) {
          add('loot', `${tableBase}.outcomes[${outcomeIndex}].items[${itemIndex}].name`, item.name, {
            kind: 'outcome-item',
            entity: item.kind,
          });
        }
      }
    }
  }

  for (const [tableIndex, table] of (page.tables ?? []).entries()) {
    const tableBase = `${base}.tables[${tableIndex}]`;

    add('loot', `${tableBase}.title`, table.title, { kind: 'table-title' });
    add('loot', `${tableBase}.note`, table.note, { kind: 'table-note' });

    for (const [headerIndex, header] of (table.headers ?? []).entries()) {
      add('loot', `${tableBase}.headers[${headerIndex}]`, header, { kind: 'column-header' });
    }

    for (const [rowIndex, row] of (table.rows ?? []).entries()) {
      for (const [cellIndex, cell] of row.entries()) {
        add('loot', `${tableBase}.rows[${rowIndex}][${cellIndex}]`, cell.value, {
          kind: 'cell',
          mentionsEntity: true,
        });
      }
    }
  }

  for (const [cellIndex, cell] of (page.augmentDistribution ?? []).entries()) {
    add('loot', `${base}.augmentDistribution[${cellIndex}].title`, cell.title, {
      kind: 'augment-odds-title',
    });
  }

  for (const [boardIndex, board] of (page.boards ?? []).entries()) {
    const boardBase = `${base}.boards[${boardIndex}]`;

    add('loot', `${boardBase}.title`, board.title, { kind: 'board-title' });
    addAll('loot', `${boardBase}.features`, board.features, { kind: 'board-feature' });
  }
}

for (const [cardIndex, card] of (loot.localCards ?? []).entries()) {
  add('loot', `localCards[${cardIndex}].name`, card.name, { kind: 'card-name' });
}

for (const [categoryIndex, category] of (loot.categories ?? []).entries()) {
  add('loot', `categories[${categoryIndex}].heading`, category.heading, { kind: 'category-heading' });
}

for (const [pageIndex, page] of (loot.pages ?? []).entries()) {
  for (const [ownerIndex, owner] of (page.owners ?? []).entries()) {
    addAll('loot', `pages[${pageIndex}].owners[${ownerIndex}].stages`, owner.stages, { kind: 'owner-stage' });
  }

  for (const [tableIndex, table] of (page.tables ?? []).entries()) {
    const base = `pages[${pageIndex}].tables[${tableIndex}]`;
    add('loot', `${base}.group`, table.group, { kind: 'table-group' });
  }

  for (const [ownerIndex, owner] of (page.owners ?? []).entries()) {
    for (const [tableIndex, table] of (owner.tables ?? []).entries()) {
      for (const [factIndex, fact] of (table.facts ?? []).entries()) {
        add('loot', `pages[${pageIndex}].owners[${ownerIndex}].tables[${tableIndex}].facts[${factIndex}].value`, fact.value, {
          kind: 'fact-value',
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Economy strategies (lib/economy.json): the round-by-round plan.
// ---------------------------------------------------------------------------
const economy = await readJson('lib/economy.json');

for (const [strategyIndex, strategy] of (economy.strategies ?? []).entries()) {
  const base = `strategies[${strategyIndex}]`;

  add('economy', `${base}.name`, strategy.name, { kind: 'strategy-name' });

  for (const [roundIndex, round] of (strategy.rounds ?? []).entries()) {
    add('economy', `${base}.rounds[${roundIndex}].text`, round.text, {
      kind: 'round-plan',
      round: round.round,
      mentionsEntity: true,
    });
  }
}

for (const [compIndex, comp] of (economy.comps ?? []).entries()) {
  const base = `comps[${comp.slug ?? compIndex}]`;
  add('economy', `${base}.name`, comp.name, { kind: 'comp-name' });
  add('economy', `${base}.strategy`, comp.strategy, { kind: 'strategy-name' });
  addAll('economy', `${base}.tips`, comp.tips, { kind: 'comp-tip', mentionsEntity: true });
  for (const [curveIndex, curve] of (comp.levelCurve ?? []).entries()) {
    add('economy', `${base}.levelCurve[${curveIndex}].text`, curve.text, {
      kind: 'round-plan',
      round: curve.stage,
      mentionsEntity: true,
    });
  }
}

// ---------------------------------------------------------------------------
// 2b. Authored guides and tips. Translation arrays are positional; report every
// missing heading, paragraph and list entry rather than treating a whole
// partially translated section as complete.
// ---------------------------------------------------------------------------
const { guideSeeds } = await import(pathToFileURL(join(ROOT, 'server/seed/guides.ts')).href);
const { tipsSeeds } = await import(pathToFileURL(join(ROOT, 'server/seed/tips.ts')).href);

function addMissingArticleTranslations(article, surface) {
  const base = `articles[${article.slug}]`;
  if (!article.titleVi) add(surface, `${base}.title`, article.title, { kind: 'article-title', slug: article.slug });
  if (!article.excerptVi) add(surface, `${base}.excerpt`, article.excerpt, { kind: 'article-excerpt', slug: article.slug });

  for (const [sectionIndex, section] of (article.sections ?? []).entries()) {
    const translated = article.sectionsVi?.[sectionIndex];
    const sectionBase = `${base}.sections[${sectionIndex}]`;
    if (!translated?.heading) {
      add(surface, `${sectionBase}.heading`, section.heading, { kind: 'section-heading', slug: article.slug });
    }
    for (const [textIndex, text] of (section.body ?? []).entries()) {
      if (!translated?.body?.[textIndex]) {
        add(surface, `${sectionBase}.body[${textIndex}]`, text, { kind: 'article-paragraph', slug: article.slug });
      }
    }
    for (const [textIndex, text] of (section.list ?? []).entries()) {
      if (!translated?.list?.[textIndex]) {
        add(surface, `${sectionBase}.list[${textIndex}]`, text, { kind: 'article-list-item', slug: article.slug });
      }
    }
  }
}

for (const guide of guideSeeds) addMissingArticleTranslations(guide, 'guides');
for (const tip of tipsSeeds) addMissingArticleTranslations(tip, 'tips');

// ---------------------------------------------------------------------------
// 3. Wisps (lib/wisps.json): only the ones missing a `*Vi` field.
// ---------------------------------------------------------------------------
const wisps = await readJson('lib/wisps.json');

for (const wisp of wisps.wisps ?? []) {
  const base = `wisps[${wisp.apiName}]`;

  if (!wisp.nameVi) {
    add('wisps', `${base}.name`, wisp.name, { kind: 'wisp-name' });
  }
  if (wisp.category) {
    add('wisps', `${base}.category`, wisp.category, { kind: 'wisp-category' });
  }
  if (!wisp.descriptionVi) {
    add('wisps', `${base}.description`, wisp.description, {
      kind: 'wisp-description',
      mentionsEntity: true,
    });
  }
}

// ---------------------------------------------------------------------------
// 4. Mechanics knowledge (lib/mechanics-knowledge.json).
//    Rule bodies already carry parallel `en` / `vi` arrays and line up; the
//    topic titles are still English only.
// ---------------------------------------------------------------------------
const mechanics = await readJson('lib/mechanics-knowledge.json');

for (const group of [mechanics.general, ...Object.values(mechanics.sets ?? {})]) {
  if (group.name && !group.nameVi) {
    add('mechanics', `${group.id}.name`, group.name, { kind: 'set-name' });
  }
  for (const topic of group?.topics ?? []) {
    if (topic.title && !topic.titleVi) {
      add('mechanics', `${group.id}/${topic.id}.title`, topic.title, { kind: 'topic-title' });
    }
  }
}

// ---------------------------------------------------------------------------
// 5. TFT set metadata (lib/tft.json): the set name shown in the header.
// ---------------------------------------------------------------------------
const tft = await readJson('lib/tft.json');

if (tft.set?.name && !tft.set.nameVi) {
  add('tft', 'set.name', tft.set.name, { kind: 'set-name' });
}

// ---------------------------------------------------------------------------
// 5b. UI message catalog. Empty Vietnamese message leaves are untranslated;
// same-language brand names and proper nouns remain intentional.
// ---------------------------------------------------------------------------
const { dictionary: messagesDictionary, missing: untranslatedMessages } = await buildMessagesDictionary();
for (const entry of untranslatedMessages) {
  add('ui', `messages.${entry.path}`, entry.en, { kind: 'message' });
}

// ---------------------------------------------------------------------------
// 6. Comps seeded into Postgres (the MetaTFT/tftflow comp guides).
//    These live in the database, so read them over psql.
// ---------------------------------------------------------------------------
const dbComps = await readDbComps();

for (const comp of dbComps) {
  const base = `comps[${comp.slug}]`;

  if (!comp.tipsVi) {
    add('comps', `${base}.tips`, comp.tips, {
      kind: 'comp-tips',
      slug: comp.slug,
      mentionsEntity: true,
    });
  }
  if (!comp.playstyleVi) {
    add('comps', `${base}.playstyle`, comp.playstyle, { kind: 'comp-playstyle' });
  }
  for (const stage of comp.stages) {
    if (!stage.textVi) {
      add('comps', `${base}.stages[${stage.stage}]`, stage.text, {
        kind: 'comp-stage',
        slug: comp.slug,
        mentionsEntity: true,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 6b. Guide records created through the admin UI are database-backed and may
// not exist in the seed files. Include their untranslated content as well.
// ---------------------------------------------------------------------------
const dbGuides = await readDbGuides();
for (const guide of dbGuides) addMissingArticleTranslations(guide, guide.slug.startsWith('tips-') ? 'tips' : 'guides');

// ---------------------------------------------------------------------------
// 7. Pre-fill what is already translated elsewhere.
//
// Two sources can answer a string without a human translator:
//   - `lib/tft.json`   — champion / item / trait / augment names.
//   - `lib/messages.ts` — the UI chrome (category headings, card names, tier
//                        names, loot kinds, augment column labels).
// ---------------------------------------------------------------------------
const entityDictionary = await buildEntityDictionary();

for (const task of tasks) {
  const key = task.en.trim().toLowerCase();

  const fromMessages = messagesDictionary.get(key);
  if (fromMessages) {
    task.vi = fromMessages;
    task.resolvedBy = 'messages.ts';
    continue;
  }

  const fromEntities = entityDictionary.get(key);
  if (fromEntities) {
    task.vi = fromEntities.vi;
    task.resolvedBy = fromEntities.source;
  }
}

const previousTasks = new Map(
  existingWorklist.tasks
    .filter((task) => typeof task?.id === 'string')
    .map((task) => [task.id, task]),
);

for (const task of tasks) {
  const previous = previousTasks.get(task.id);
  if (typeof previous?.vi !== 'string' || !previous.vi.trim()) continue;

  if (!previous.resolvedBy || previous.vi !== task.vi) {
    task.vi = previous.vi;
    task.resolvedBy = 'worklist.json';
  }
}

// ---------------------------------------------------------------------------
// Write the worklist.
// ---------------------------------------------------------------------------
const bySurface = {};
for (const task of tasks) {
  bySurface[task.surface] ??= [];
  bySurface[task.surface].push(task);
}

const resolvedBy = {};
for (const task of tasks) {
  if (!task.vi) continue;
  resolvedBy[task.resolvedBy] = (resolvedBy[task.resolvedBy] ?? 0) + 1;
}

const summary = Object.fromEntries(
  Object.entries(bySurface).map(([surface, list]) => [
    surface,
    {
      tasks: list.length,
      resolved: list.filter((task) => task.vi).length,
      kinds: [...new Set(list.map((task) => task.kind))].sort(),
    },
  ]),
);

const worklist = {
  generatedAt: new Date().toISOString(),
  locale: 'vi',
  source: 'en',
  counts: {
    total: tasks.length,
    resolved: tasks.filter((task) => task.vi).length,
    resolvedBy,
    bySurface: summary,
  },
  tasks,
};

await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, 'worklist.json'), `${JSON.stringify(worklist, null, 2)}\n`);
await writeFile(join(OUT_DIR, 'worklist.md'), toMarkdown(worklist));
const runtimeTranslations = Object.fromEntries(
  tasks.filter((task) => typeof task.vi === 'string' && task.vi.trim()).map((task) => [task.id, task.vi]),
);
await writeFile(
  join(ROOT, 'lib/translation-catalog.json'),
  `${JSON.stringify({ locale: 'vi', translations: runtimeTranslations }, null, 2)}\n`,
);

console.log(`wrote translations/worklist.json + worklist.md — ${tasks.length} strings`);
console.log(`  wrote lib/translation-catalog.json — ${Object.keys(runtimeTranslations).length} translations`);
console.log(`  already translated: ${worklist.counts.resolved} (${JSON.stringify(resolvedBy)})`);
console.log(`  still to translate: ${tasks.length - worklist.counts.resolved}`);
for (const [surface, info] of Object.entries(summary)) {
  console.log(`  ${surface}: ${info.tasks} (${info.resolved} ready, ${info.tasks - info.resolved} to translate)`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the EN -> VI lookup from the canonical game data.
 *
 * Champions, items, traits and augments all carry a `*Vi` name in
 * `lib/tft.json`. Normalising on the English side lets the worklist treat
 * "Rabadon's Deathcap" as an already-solved string.
 *
 * The map value keeps the source file so the worklist can say where a
 * pre-filled translation came from.
 */
async function buildEntityDictionary() {
  const tft = await readJson('lib/tft.json');
  const dictionary = new Map();

  const put = (en, vi, source) => {
    if (!en || !vi) return;
    dictionary.set(String(en).trim().toLowerCase(), { vi, source });
  };

  for (const champion of tft.champions ?? []) put(champion.name, champion.nameVi, 'tft.json');
  for (const item of tft.items ?? []) put(item.name, item.nameVi, 'tft.json');
  for (const trait of tft.traits ?? []) put(trait.name, trait.nameVi, 'tft.json');
  for (const augment of tft.augments ?? []) put(augment.name, augment.nameVi, 'tft.json');

  // Wisps (Set 18 charms) are their own entity list with their own `nameVi`.
  // The same wisp names show up as loot-table rewards, so resolving them here
  // keeps the reward names out of the translation queue.
  const wisps = await readJson('lib/wisps.json');
  for (const wisp of wisps.wisps ?? []) put(wisp.name, wisp.nameVi, 'wisps.json');

  // Keyword effects are shared by many abilities and carry a Vietnamese
  // description rather than a name.
  const keywords = tft.keywords ?? {};
  for (const [en, vi] of Object.entries(keywords.vi ?? {})) {
    if (keywords.en?.[en]) put(en, vi, 'tft.json');
  }

  return dictionary;
}

/**
 * Build the EN -> VI lookup from `lib/messages.ts`.
 *
 * The UI chrome is already translated: category headings, card names, tier
 * names, loot kinds and augment column labels live there. Parsing the file
 * with the TypeScript compiler (rather than regex) means a string that the
 * render path already resolves never shows up as a worklist task.
 */
async function buildMessagesDictionary() {
  const source = await readFile(join(ROOT, 'lib/messages.ts'), 'utf8');
  const ts = await import('typescript');

  const file = ts.createSourceFile(
    'messages.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const findObject = (node, name) => {
    if (!node || !ts.isVariableDeclaration(node)) return null;
    if (node.name.getText(file) !== name) return null;
    const init = node.initializer;
    return init && ts.isObjectLiteralExpression(init) ? init : null;
  };

  let enObject = null;
  let viObject = null;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node)) {
      const name = node.name.getText(file);
      if (name === 'en') enObject = findObject(node, 'en');
      if (name === 'vi') viObject = findObject(node, 'vi');
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  if (!enObject || !viObject) return { dictionary: new Map(), missing: [] };

  const dictionary = new Map();

  /** Unwrap `expr as Type` / `<Type>expr` so the literal inside is visible. */
  const unwrap = (node) => {
    let current = node;
    while (current) {
      if (ts.isAsExpression(current) || ts.isSatisfiesExpression(current)) {
        current = current.expression;
        continue;
      }
      // `ts.isTypeAssertion` was removed in TypeScript 5; check the kind directly.
      if (current.kind === ts.SyntaxKind.TypeAssertionExpression) {
        current = current.expression;
        continue;
      }
      break;
    }
    return current;
  };

  /** Collect `key -> english literal` from a nested object literal. */
  const collect = (node, prefix, out) => {
    node = unwrap(node);
    if (!node || !ts.isObjectLiteralExpression(node)) return;
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const key = property.name.getText(file).replace(/^['"]|['"]$/g, '');
      const value = unwrap(property.initializer);
      const path = prefix ? `${prefix}.${key}` : key;

      if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
        out.set(path, value.text);
      } else if (ts.isObjectLiteralExpression(value)) {
        collect(value, path, out);
      } else if (ts.isArrayLiteralExpression(value)) {
        value.elements.forEach((element, index) => {
          const entry = unwrap(element);
          const entryPath = `${path}[${index}]`;
          if (ts.isStringLiteral(entry) || ts.isNoSubstitutionTemplateLiteral(entry)) {
            out.set(entryPath, entry.text);
          } else if (ts.isObjectLiteralExpression(entry)) {
            collect(entry, entryPath, out);
          }
        });
      }
    }
  };

  const enStrings = new Map();
  const viStrings = new Map();
  collect(enObject, '', enStrings);
  collect(viObject, '', viStrings);

  // Only English strings whose Vietnamese counterpart differs (i.e. was
  // actually translated) are worth resolving.
  const missing = [];
  for (const [path, enValue] of enStrings) {
    const viValue = viStrings.get(path);
    if (typeof viValue !== 'string' || !viValue.trim()) {
      if (isTranslatable(enValue)) missing.push({ path, en: enValue });
      continue;
    }
    if (viValue === enValue) continue;
    dictionary.set(enValue.trim().toLowerCase(), viValue);
  }

  return { dictionary, missing };
}

/** Read the comp rows that still need a Vietnamese version. */
async function readDbComps() {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);

  const databaseUrl = process.env.DATABASE_URL ?? (await readServerDatabaseUrl());
  if (!databaseUrl) {
    console.warn('no DATABASE_URL found — using server/seed/comps.json');
    return (await readJson('server/seed/comps.json')).map((comp) => ({
      ...comp,
      stages: comp.stages ?? [],
    }));
  }

  const compsSql = `
    SELECT COALESCE(json_agg(row_to_json(comp_rows)), '[]'::json)::text
    FROM (
      SELECT c.slug, c.playstyle, c.tips,
             COALESCE(c.playstyle_vi, '') AS "playstyleVi",
             COALESCE(c.tips_vi, '') AS "tipsVi"
      FROM comps c
      ORDER BY c.slug
    ) AS comp_rows;
  `;

  const stagesSql = `
    SELECT COALESCE(json_agg(row_to_json(stage_rows)), '[]'::json)::text
    FROM (
      SELECT comp_slug AS "compSlug", stage, text,
             COALESCE(text_vi, '') AS "textVi"
      FROM comp_stages
      WHERE COALESCE(text_vi, '') = ''
      ORDER BY comp_slug, stage
    ) AS stage_rows;
  `;

  try {
    const [compsOut, stagesOut] = await Promise.all([
      run('psql', [databaseUrl, '-At', '-F', '\t', '-c', compsSql]),
      run('psql', [databaseUrl, '-At', '-F', '\t', '-c', stagesSql]),
    ]);

    const stagesBySlug = new Map();
    for (const stage of JSON.parse(stagesOut.stdout)) {
      const list = stagesBySlug.get(stage.compSlug) ?? [];
      list.push(stage);
      stagesBySlug.set(stage.compSlug, list);
    }

    return JSON.parse(compsOut.stdout).map((comp) => ({
      ...comp,
      stages: stagesBySlug.get(comp.slug) ?? [],
    }));
  } catch (error) {
    throw new Error(`could not read comps from the database: ${error.message}`, { cause: error });
  }
}

async function readDbGuides() {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);

  const databaseUrl = process.env.DATABASE_URL ?? (await readServerDatabaseUrl());
  if (!databaseUrl) return [];

  const sql = `
    SELECT COALESCE(json_agg(row_to_json(guide_rows)), '[]'::json)::text
    FROM (
      SELECT slug, title, excerpt, sections,
             COALESCE(title_vi, '') AS "titleVi",
             COALESCE(excerpt_vi, '') AS "excerptVi",
             sections_vi AS "sectionsVi"
      FROM guides
      ORDER BY slug
    ) AS guide_rows;
  `;

  try {
    const output = await run('psql', [databaseUrl, '-At', '-c', sql]);
    return JSON.parse(output.stdout);
  } catch (error) {
    throw new Error(`could not read guides from the database: ${error.message}`, { cause: error });
  }
}

/** Pull DATABASE_URL out of server/.env without needing a dotenv dependency. */
async function readServerDatabaseUrl() {
  try {
    const env = await readFile(join(ROOT, 'server/.env'), 'utf8');
    const match = env.match(/^DATABASE_URL=(.+)$/m);
    return match ? match[1].trim() : null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Render the worklist as a translator-friendly Markdown checklist. */
function toMarkdown(list) {
  const lines = [];

  lines.push('# Bản dịch tiếng Việt — danh sách chuỗi cần dịch');
  lines.push('');
  lines.push(`Sinh tự động bởi \`scripts/extract-translation-tasks.mjs\` — ${list.generatedAt}`);
  lines.push('');
  lines.push(`Tổng cộng **${list.counts.total}** chuỗi.`);
  lines.push(`Trong đó **${list.counts.resolved}** đã có bản tiếng Việt từ dữ liệu hiện có,`);
  lines.push(`còn **${list.counts.total - list.counts.resolved}** chuỗi hoặc đoạn nội dung chưa dịch.`);
  lines.push('Sau khi điền `vi`, chạy lại script để tạo `lib/translation-catalog.json`; các trang EN/VI sẽ đọc bản dịch này.');
  lines.push('');
  lines.push('| Nhóm | Tổng | Sẵn có | Cần dịch | Loại |');
  lines.push('|---|---|---|---|---|');
  for (const [surface, info] of Object.entries(list.counts.bySurface)) {
    lines.push(
      `| \`${surface}\` | ${info.tasks} | ${info.resolved} | ${info.tasks - info.resolved} | ${info.kinds.join(', ')} |`,
    );
  }
  lines.push('');
  lines.push('Cách làm: điền giá trị vào trường `vi` trong `translations/worklist.json`.');
  lines.push('Chạy lại `node scripts/extract-translation-tasks.mjs` để cập nhật danh sách; bản dịch đã nhập sẽ được giữ lại.');
  lines.push('');
  lines.push('> Chỉ dịch văn bản tiếng Anh. Giữ nguyên tên tướng, tộc hệ, trang bị,');
  lines.push('> nâng cấp, con số và ký hiệu (`2-1`, `4-2`, `Lv.8`, `%`).');
  lines.push('');

  for (const [surface, info] of Object.entries(list.counts.bySurface)) {
    const surfaceTasks = list.tasks.filter((task) => task.surface === surface);
    const pending = surfaceTasks.filter((task) => !task.vi);
    const ready = surfaceTasks.filter((task) => task.vi);

    lines.push(`## ${surface} (${info.tasks})`);
    lines.push('');

    if (pending.length) {
      lines.push(`### Cần dịch (${pending.length})`);
      lines.push('');
      lines.push('| # | Loại | EN | VI | Xuất hiện |');
      lines.push('|---|---|---|---|---|');
      pending.forEach((task, index) => {
        const en = task.en.replace(/\|/g, '\\|').replace(/\n/g, ' ');
        const count = task.paths.length;
        lines.push(
          `| ${index + 1} | ${task.kind} | ${en} | | ${count > 1 ? `×${count}` : ''} |`,
        );
      });
      lines.push('');
    }

    if (ready.length) {
      lines.push(`### Đã có sẵn — cần kiểm tra lại (${ready.length})`);
      lines.push('');
      lines.push('| # | Loại | EN | VI (từ nguồn sẵn có) | Nguồn |');
      lines.push('|---|---|---|---|---|');
      ready.forEach((task, index) => {
        const en = task.en.replace(/\|/g, '\\|').replace(/\n/g, ' ');
        const vi = String(task.vi).replace(/\|/g, '\\|').replace(/\n/g, ' ');
        lines.push(`| ${index + 1} | ${task.kind} | ${en} | ${vi} | ${task.resolvedBy} |`);
      });
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}
