// Fetches TFT set data from CommunityDragon (Riot's public game-data mirror),
// downloads icons and writes lib/tft.json. Run: node scripts/fetch-tft.mjs
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const CDRAGON = 'https://raw.communitydragon.org/latest/cdragon/tft/en_us.json';
const GAME_BASE = 'https://raw.communitydragon.org/latest/game/';
const CACHE = 'scripts/.cache/tft-en_us.json';
const OUT_JSON = 'lib/tft.json';
const OUT_ICONS = 'public/tft';
const CONCURRENCY = 12;

// Augment rarity is not exposed as a field; these tag GUIDs decode to the
// silver/gold/prismatic tiers (verified against known i/ii/iii augment chains).
const RARITY_TAGS = { '{d11fd6d5}': 1, '{ce1fd21c}': 2, '{cf1fd3af}': 3 };

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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

async function loadRaw() {
  if (existsSync(CACHE)) {
    const age = (await stat(CACHE)).mtimeMs;
    if (Date.now() - age < 12 * 3600 * 1000) {
      console.log('using cached cdragon dump');
      return JSON.parse(await readFile(CACHE, 'utf8'));
    }
  }
  console.log('downloading cdragon dump...');
  const res = await fetchWithRetry(CDRAGON);
  const text = await res.text();
  await mkdir(dirname(CACHE), { recursive: true });
  await writeFile(CACHE, text);
  return JSON.parse(text);
}

function cleanDesc(desc, effects) {
  const number = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(Math.round(parsed * 100) / 100) : String(value);
  };
  return (desc ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\\n/g, ' ')
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

// Champion abilities store their numbers as variables ({name, value[perStar]}).
function abilityEffects(variables) {
  const out = {};
  for (const variable of variables ?? []) {
    const value = Array.isArray(variable.value) ? variable.value[0] : variable.value;
    if (variable.name != null && value != null) out[variable.name] = value;
  }
  return out;
}

function pickSet(data) {
  const max = Math.max(...data.setData.map((entry) => entry.number));
  const candidates = data.setData.filter((entry) => entry.number === max);
  return candidates.find((entry) => entry.mutator === `TFTSet${max}`) ?? candidates[0];
}

async function pool(items, size, fn) {
  const queue = [...items];
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        done += 1;
        await fn(item, done, items.length);
      }
    })
  );
}

async function downloadIcon(entity, folder) {
  if (!entity.iconSrc) return null;
  const file = join(OUT_ICONS, folder, `${entity.slug}.png`);
  try {
    const info = existsSync(file) ? await stat(file) : null;
    if (info && info.size > 0) return `/${file.replace(/^public\//, '')}`;
    const res = await fetchWithRetry(entity.iconSrc, 2);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) throw new Error('empty');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, buffer);
    return `/${file.replace(/^public\//, '')}`;
  } catch (error) {
    console.warn(`  icon miss ${entity.apiName}: ${error.message}`);
    return null;
  }
}

const raw = await loadRaw();
const set = pickSet(raw);
const itemsByName = new Map(raw.items.map((item) => [item.apiName, item]));
console.log(`set ${set.number} (${set.mutator}): ${set.champions.length} champions, ${set.traits.length} traits`);

const traits = set.traits.map((trait) => {
  const effects = (trait.effects ?? []).filter((effect) => effect.minUnits != null && effect.style != null);
  return {
    apiName: trait.apiName,
    slug: slugify(trait.apiName),
    name: trait.name,
    // Breakpoint rows hold @MinUnits@ placeholders we cannot resolve here, so
    // keep the flavour line only; thresholds/styles carry the tier data.
    desc: cleanDesc((trait.desc ?? '').split(/<row>/i)[0], {}),
    thresholds: effects.map((effect) => effect.minUnits),
    styles: effects.map((effect) => effect.style),
    iconSrc: trait.icon ? GAME_BASE + trait.icon.replace(/\.tex$/i, '.png') : null,
  };
});

const champions = set.champions
  .filter((c) => c.cost >= 1 && c.cost <= 5 && c.traits.length > 0 && !/^Lux \(/.test(c.name))
  .map((c) => {
    const ability = c.ability && c.ability.name && c.ability.name !== 'None'
      ? {
          name: c.ability.name,
          desc: cleanDesc(c.ability.desc, abilityEffects(c.ability.variables)),
          iconSrc: c.ability.icon && c.ability.icon !== 'None' ? GAME_BASE + c.ability.icon.replace(/\.tex$/i, '.png') : null,
        }
      : null;
    return {
      apiName: c.apiName,
      slug: slugify(c.apiName),
      name: c.name,
      cost: c.cost,
      traits: c.traits,
      iconSrc: c.squareIcon ? GAME_BASE + c.squareIcon.replace(/\.tex$/i, '.png') : null,
      ability,
      mana: c.stats?.mana ? { start: c.stats.initialMana ?? 0, max: c.stats.mana } : null,
    };
  });

const setItemIds = new Set(set.items);
// Components (composition of others) are kept so build paths can show icons;
// the rest of the 680+ no-composition entries are loot/encounter noise.
const componentIds = new Set(
  raw.items.filter((item) => setItemIds.has(item.apiName) && !item.isAugment && item.composition.length > 0).flatMap((item) => item.composition)
);
// The same item name ships as several api entries; DA_* variants carry no
// description/effects, so score entries and keep the richest one per name.
const itemScore = (item) => (item.desc ? 2 : 0) + (Object.keys(item.effects ?? {}).length ? 1 : 0) - (item.apiName.startsWith('DA_') ? 1 : 0);
const itemByName = new Map();
for (const item of raw.items) {
  if (!setItemIds.has(item.apiName) || item.isAugment) continue;
  if (item.composition.length === 0 && !componentIds.has(item.apiName)) continue;
  const key = item.name.toLowerCase();
  const current = itemByName.get(key);
  if (!current || itemScore(item) > itemScore(current)) itemByName.set(key, item);
}
const items = [...itemByName.values()].map((item) => ({
  apiName: item.apiName,
  slug: slugify(item.apiName),
  name: item.name,
  desc: cleanDesc(item.desc, item.effects),
  composition: item.composition.map((id) => itemsByName.get(id)?.name ?? id),
  iconSrc: item.icon ? GAME_BASE + item.icon.replace(/\.tex$/i, '.png') : null,
}));

const setAugmentIds = new Set(set.augments);
const seenAugmentIds = new Set();
const augments = raw.items
  .filter((item) => setAugmentIds.has(item.apiName) && item.isAugment && !seenAugmentIds.has(item.apiName) && seenAugmentIds.add(item.apiName))
  .map((aug) => {
    const rarities = aug.tags.map((tag) => RARITY_TAGS[tag]).filter(Boolean);
    return {
      apiName: aug.apiName,
      slug: slugify(aug.apiName),
      name: aug.name,
      desc: cleanDesc(aug.desc, aug.effects),
      rarity: rarities.length ? Math.max(...rarities) : null,
      iconSrc: aug.icon ? GAME_BASE + aug.icon.replace(/\.tex$/i, '.png') : null,
    };
  });

let patch = 'latest';
try {
  const versions = await (await fetchWithRetry('https://ddragon.leagueoflegends.com/api/versions.json', 2)).json();
  patch = versions[0];
} catch {
  console.warn('could not fetch patch version, keeping "latest"');
}

const jobs = [
  ...champions.map((c) => ['champions', c]),
  ...champions.filter((c) => c.ability?.iconSrc).map((c) => ['abilities', {
    apiName: c.apiName,
    slug: `${c.slug}-ability`,
    iconSrc: c.ability.iconSrc,
    done: (icon) => { c.ability.icon = icon; },
  }]),
  ...traits.map((t) => ['traits', t]),
  ...items.map((i) => ['items', i]),
  ...augments.map((a) => ['augments', a]),
];
console.log(`downloading ${jobs.length} icons (concurrency ${CONCURRENCY})...`);
await pool(jobs, CONCURRENCY, async ([folder, entity], done) => {
  entity.icon = await downloadIcon(entity, folder);
  if (entity.done) entity.done(entity.icon);
  delete entity.iconSrc;
  delete entity.done;
  if (done % 100 === 0) console.log(`  ${done}/${jobs.length}`);
});

const output = {
  patch,
  set: { number: set.number, mutator: set.mutator, name: set.name },
  traits: traits.map(({ iconSrc, ...t }) => ({ ...t, icon: t.icon ?? null })),
  champions: champions.map(({ iconSrc, ability, ...c }) => ({
    ...c,
    icon: c.icon ?? null,
    ability: ability ? { name: ability.name, desc: ability.desc, icon: ability.icon ?? null } : null,
  })),
  items: items.map(({ iconSrc, ...i }) => ({ ...i, icon: i.icon ?? null })),
  augments: augments.map(({ iconSrc, ...a }) => ({ ...a, icon: a.icon ?? null })),
};

await writeFile(OUT_JSON, JSON.stringify(output));
const missing = [...champions, ...traits, ...items, ...augments].filter((e) => !e.icon).length;
console.log(
  `wrote ${OUT_JSON}: ${champions.length} champions, ${traits.length} traits, ${items.length} items, ${augments.length} augments` +
    (missing ? `, ${missing} icons missing` : ', all icons present')
);
console.log(`patch ${patch}, set ${set.number}`);
