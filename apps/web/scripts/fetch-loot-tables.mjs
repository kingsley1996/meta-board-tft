// Builds shared loot-table data from the shared tftflow knowledge base
// (https://tftflow.com, Set 18 loot tables) and downloads every image the site
// shows into public/tft/loot so nothing hotlinks the source site.
// Run: node scripts/fetch-loot-tables.mjs
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const KB = process.env.TFTFLOW_KB ?? join(homedir(), '.local/share/tftflow/kb');
const SOURCE = 'https://tftflow.com';
const OUT_ICONS = 'public/tft/loot';
const CONCURRENCY = 12;

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const fetchText = async (url) => {
  const res = await fetch(url, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
};

// Every tftflow image is copied into public/tft/loot; the local path mirrors
// the source layout so two files with the same name never collide. Relative
// source paths (tooltip icons) are resolved against tftflow.com first.
const assets = new Map();
const localAsset = (url) => {
  if (!url) return null;
  const absolute = url.startsWith('http') ? url : url.startsWith('/') ? `${SOURCE}${url}` : null;
  if (!absolute) return url;
  if (assets.has(absolute)) return assets.get(absolute).local;
  const path = new URL(absolute).pathname.replace(/^\/wp-content\/uploads\//, '');
  const file = join(OUT_ICONS, path);
  const entry = { url: absolute, file, local: `/${file.replace(/^public\//, '')}` };
  assets.set(absolute, entry);
  return entry.local;
};

const pct = (value) => {
  if (value === null || value === undefined) return null;
  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(1) : rounded}%`;
};

const cleanTitle = (title) => (title ?? '').replace(/\s*\[Set \d+\]\s*$/, '').trim();

const decodeEntities = (text) =>
  (text ?? '')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const items = (outcomes) =>
  (outcomes ?? []).map((outcome) => ({
    chance: pct(outcome.probability),
    items: (outcome.items ?? []).map((item) => ({
      kind: item.kind ?? 'unknown',
      name: item.name ?? 'Unknown',
      icon: localAsset(item.icon),
      count: item.count_text ?? (item.quantity > 1 ? `x${item.quantity}` : null),
      cost: item.cost ?? null,
      stars: item.stars ?? null,
    })),
  }));

const lootTables = (owner) =>
  (owner.tables ?? []).map((table) => ({
    apiName: table.apiName,
    title: table.title ?? table.label ?? table.apiName,
    level: table.level ?? null,
    facts: (table.facts ?? []).map((fact) => ({ label: fact.label, value: String(fact.value) })),
    outcomes: items(table.outcomes),
  }));

// Plain header/row tables (carousel odds, shop odds, trait sacrifice values…).
const plainTables = (list) =>
  (list ?? []).map((table) => ({
    title: table.title ?? '',
    note: table.note ?? null,
    headers: table.headers ?? [],
    rows: (table.rows ?? []).map((row, index) =>
      row.map((cell, cellIndex) => ({
        value: cell === null || cell === undefined ? '' : String(cell),
        icon: localAsset(table.row_icons?.[index]?.[cellIndex] ?? null),
      }))
    ),
  }));

// The KB keeps the system tables but drops the "Stage 2" headings that group
// them on the page, so read those headings back from the live page. Only used
// when the live page still lists the exact same tables, otherwise the groups
// would point at the wrong rows.
const groupHeadings = async (slug, titles) => {
  try {
    const html = await fetchText(`${SOURCE}/tables/set18/${slug}`);
    const groups = [];
    for (const match of html.matchAll(/<h2 class="loot-tables-kind">(.*?)<\/h2>|<span class="loot-table-title">(.*?)<\/span>/gs)) {
      if (match[1]) groups.push({ heading: decodeEntities(match[1].trim()), titles: [] });
      else if (groups.length) groups[groups.length - 1].titles.push(decodeEntities(match[2].trim()));
    }
    const flat = groups.flatMap((group) => group.titles);
    if (flat.length !== titles.length || flat.some((title, index) => title !== titles[index])) return [];
    return groups.flatMap((group) => group.titles.map(() => group.heading));
  } catch {
    return [];
  }
};

// The hub page groups the loot tables into System / Traits / Augments / Items
// / Champions / Encounters and carries the card art.
const fetchHub = async () => {
  const html = await fetchText(`${SOURCE}/tables/set18`);
  const categories = [];
  for (const block of html.split('<div class="loot-hub-entity-type-container">').slice(1)) {
    const heading = decodeEntities(block.match(/<h2 class="loot-tables-kind">([^<]*)<\/h2>/)?.[1]?.trim());
    const entries = [...block.matchAll(/<li class="loot-hub-entry[^"]*">\s*<a class="loot-hub-link[^"]*" href="([^"]+)">(.*?)<\/a>/gs)].map((match) => ({
      slug: match[1].split('/').pop(),
      name: decodeEntities(match[2].match(/class="loot-hub-name">([^<]*)</)?.[1] ?? match[2].match(/class="champion-trait-name">([^<]*)</)?.[1]),
      splash: match[2].match(/background-image:\s*url\('([^']+)'\)/)?.[1] ?? null,
      icon: match[2].match(/<img[^>]*src="([^"]+)"/)?.[1] ?? null,
    }));
    if (heading && entries.length) categories.push({ heading, entries });
  }
  return categories;
};

const kb = await readJson(join(KB, 'loot-tables.json'));
const hub = await fetchHub();
const hubBySlug = new Map(hub.flatMap((category) => category.entries.map((entry) => [entry.slug, { ...entry, category: category.heading }])));

const pages = [];
for (const page of kb.pages) {
  const tables = [...plainTables(page.system_tables), ...plainTables(page.trait_tables)];
  const headings = tables.length ? await groupHeadings(page.slug, tables.map((table) => table.title)) : [];
  tables.forEach((table, index) => {
    table.group = headings[index] ?? null;
  });
  const hubEntry = hubBySlug.get(page.slug);
  pages.push({
    slug: page.slug,
    title: cleanTitle(page.title),
    name: hubEntry?.name ?? cleanTitle(page.title),
    category: hubEntry?.category ?? null,
    icon: localAsset(hubEntry?.icon ?? null),
    splash: localAsset(hubEntry?.splash ?? null),
    sourceUrl: page.url,
    owners: (page.owners ?? []).map((owner) => ({
      kind: owner.kind ?? 'item',
      name: owner.name ?? cleanTitle(page.title),
      icon: localAsset(owner.icon),
      description: owner.description ?? null,
      stages: owner.stages ?? [],
      tables: lootTables(owner),
    })),
    tables,
    augmentDistribution: (page.augment_distribution?.cells ?? []).map((cell) => ({
      path: cell.path,
      tier: cell.tier,
      conditional: cell.pct,
      weight: cell.weight,
      title: cell.title,
    })),
    boards: (page.trait_boards ?? []).map((board) => ({
      title: board.title ?? '',
      image: localAsset(board.map_image),
      features: (board.features ?? []).map((feature) => feature.text),
    })),
  });
}

const errors = [];
if (pages.length < 20) errors.push(`only ${pages.length} loot pages`);
if (!pages.some((page) => page.owners.length)) errors.push('no owner tables found');
if (pages.some((page) => !page.slug)) errors.push('page without slug');
if (hubBySlug.size < pages.length) errors.push(`hub lists ${hubBySlug.size} of ${pages.length} pages`);
if (errors.length) throw new Error(`loot snapshot checks failed:\n${errors.join('\n')}`);

// Download the images the site shows; the site never points at tftflow.com.
async function download(entry) {
  const target = join(ROOT, entry.file);
  const existing = existsSync(target) ? await stat(target) : null;
  if (existing && existing.size > 0) return;
  const res = await fetch(entry.url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) throw new Error('empty');
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer);
}

const queue = [...assets.values()];
let downloaded = 0;
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const entry = queue.shift();
      try {
        await download(entry);
        downloaded += 1;
      } catch (error) {
        console.warn(`  asset miss ${entry.url}: ${error.message}`);
      }
    }
  })
);

const snapshot = {
  source: {
    provider: 'tftflow.com',
    page: `${SOURCE}/tables/set18`,
    set: kb.set,
    generatedAt: kb.generated_at,
    fetchedAt: new Date().toISOString(),
  },
  categories: hub.map((category) => ({ heading: category.heading, slugs: category.entries.map((entry) => entry.slug) })),
  // Tables tftflow does not publish: our own hand-checked gold income table.
  localCards: [
    {
      category: 'System',
      slug: 'gold-income',
      name: 'Gold income',
      icon: localAsset(`${SOURCE}/wp-content/uploads/tftImages/items/icon/assistgivegold.png`),
    },
  ],
  pages,
};

// Every image the snapshot points at must exist locally, otherwise the page
// ships a broken image.
const referenced = new Set(
  [...JSON.stringify(snapshot).matchAll(/"(\/[^"]+?\.(?:png|jpg|jpeg|webp|svg|gif))"/g)].map((match) => match[1])
);
const missing = [...referenced].filter((path) => !existsSync(join(ROOT, `public${path}`)));
if (missing.length) throw new Error(`missing local assets:\n${missing.slice(0, 10).join('\n')}`);

await writeFile(join(ROOT, '../../packages/shared/data/loot-tables.json'), `${JSON.stringify(snapshot, null, 2)}\n`);

const owners = pages.reduce((total, page) => total + page.owners.length, 0);
const outcomes = pages.reduce(
  (total, page) => total + page.owners.reduce((sum, owner) => sum + owner.tables.reduce((s, table) => s + table.outcomes.length, 0), 0),
  0
);
console.log(
  `wrote packages/shared/data/loot-tables.json · ${pages.length} pages · ${owners} owners · ${outcomes} outcomes · ` +
    `${assets.size} assets (${downloaded} downloaded)`
);
