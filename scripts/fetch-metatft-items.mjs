// Adds MetaTFT's radiant and artifact (Ornn) items to the CommunityDragon
// catalog written by fetch-tft.mjs. MetaTFT supplies the live item list and
// category tags; CommunityDragon supplies resolved text, vi names and icons.
// Run: node scripts/fetch-metatft-items.mjs
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CDRAGON = 'https://raw.communitydragon.org/latest/cdragon/tft/en_us.json';
const CDRAGON_VI = 'https://raw.communitydragon.org/latest/cdragon/tft/vi_vn.json';
const GAME_BASE = 'https://raw.communitydragon.org/latest/game/';
const CACHE = 'scripts/.cache/tft-en_us.json';
const CACHE_VI = 'scripts/.cache/tft-vi_vn.json';
const OUT_JSON = 'lib/tft.json';
const ICON_DIR = 'public/tft/items';

const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.round(parsed * 100) / 100) : String(value);
};

async function fetchWithRetry(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      if (attempt >= tries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function loadRaw(url, cache) {
  if (existsSync(cache)) {
    const age = (await stat(cache)).mtimeMs;
    if (Date.now() - age < 12 * 3600 * 1000) return JSON.parse(await readFile(cache, 'utf8'));
  }
  const text = await (await fetchWithRetry(url)).text();
  await mkdir(dirname(cache), { recursive: true });
  await writeFile(cache, text);
  return JSON.parse(text);
}

function cleanDesc(desc, effects) {
  return (desc ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\\[rn]+/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/%i:[^%]*%/g, '')
    .replace(/@(\S[^@]*?)@/g, (_, key) => {
      if (effects?.[key] != null) return number(effects[key]);
      const multiplied = key.match(/^([A-Za-z0-9_]+)\s*\*\s*(\d+(?:\.\d+)?)$/);
      if (multiplied && effects?.[multiplied[1]] != null) return number(Number(effects[multiplied[1]]) * Number(multiplied[2]));
      return '';
    })
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/ %(?=[\s.,;)]|$)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/ ([,.;])/g, '$1')
    .trim();
}

async function iconFor(item) {
  const slug = slugify(item.apiName);
  const path = join(ICON_DIR, `${slug}.png`);
  if (existsSync(path)) return `/tft/items/${slug}.png`;
  if (!item.icon) return null;
  const res = await fetchWithRetry(GAME_BASE + item.icon.replace(/\.tex$/i, '.png'), 2);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) return null;
  await mkdir(ICON_DIR, { recursive: true });
  await writeFile(path, buffer);
  return `/tft/items/${slug}.png`;
}

const tft = JSON.parse(await readFile(OUT_JSON, 'utf8'));
const raw = await loadRaw(CDRAGON, CACHE);
const set = raw.setData.find((entry) => entry.mutator === tft.set.mutator) ?? raw.setData.find((entry) => entry.number === tft.set.number);
const setIds = new Set(set.items);

let viByName = new Map();
try {
  const rawVi = await loadRaw(CDRAGON_VI, CACHE_VI);
  viByName = new Map(rawVi.items.map((item) => [item.apiName, item]));
} catch (error) {
  console.warn(`vi_vn data unavailable (${error.message}); keeping English names`);
}

const lookup = await (await fetchWithRetry(`https://data.metatft.com/lookups/TFTSet${tft.set.number}_latest_en_us.json`)).json();
const categoryOf = (item) => {
  const tags = new Set(item.tags ?? []);
  if (tags.has('Item.Equippable.Item.Radiant') && !tags.has('Item.Equippable.Consumable')) return 'radiant';
  if (tags.has('Item.Equippable.Item.Artifact')) return 'artifact';
  return null;
};

const score = (item) => (item.desc ? 2 : 0) + (Object.keys(item.effects ?? {}).length ? 1 : 0) - (item.apiName.startsWith('DA_') ? 1 : 0);
const cdragonByName = new Map();
for (const item of raw.items) {
  if (!setIds.has(item.apiName) || item.isAugment) continue;
  const list = cdragonByName.get(item.name) ?? [];
  list.push(item);
  cdragonByName.set(item.name, list);
}

const items = tft.items
  .filter((item) => item.category !== 'radiant' && item.category !== 'artifact')
  .map((item) => ({ ...item, category: item.category ?? (item.composition?.length ? 'completed' : 'component') }));
const known = new Map(items.map((item) => [item.name.toLowerCase(), item]));

let added = 0;
for (const meta of lookup.items) {
  const category = categoryOf(meta);
  if (!category) continue;
  const key = meta.name.toLowerCase();
  if (known.has(key)) {
    if (known.get(key).category !== category) console.warn(`  skipped duplicate name ${meta.name}`);
    continue;
  }
  const candidates = cdragonByName.get(meta.name);
  if (!candidates?.length) {
    console.warn(`  no CommunityDragon match for ${meta.name}`);
    continue;
  }
  const best = [...candidates].sort((a, b) => score(b) - score(a))[0];
  const iconCandidate = candidates.find((item) => existsSync(join(ICON_DIR, `${slugify(item.apiName)}.png`))) ?? best;
  const vi = viByName.get(best.apiName);
  const item = {
    apiName: best.apiName,
    slug: slugify(best.apiName),
    name: best.name,
    desc: cleanDesc(best.desc, best.effects),
    composition: [],
    nameVi: vi?.name ?? null,
    descVi: cleanDesc(vi?.desc, vi?.effects),
    compositionVi: null,
    category,
    icon: await iconFor(iconCandidate),
  };
  items.push(item);
  known.set(key, item);
  added += 1;
}

tft.items = items;
await writeFile(OUT_JSON, JSON.stringify(tft));
const counts = items.reduce((acc, item) => ({ ...acc, [item.category]: (acc[item.category] ?? 0) + 1 }), {});
console.log(`added ${added} MetaTFT items to ${OUT_JSON}: ${JSON.stringify(counts)}`);
