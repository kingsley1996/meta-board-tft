// Fetches TFT set data from CommunityDragon (Riot's public game-data mirror),
// downloads icons and writes lib/tft.json. Run: node scripts/fetch-tft.mjs
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const CDRAGON = 'https://raw.communitydragon.org/latest/cdragon/tft/en_us.json';
const CDRAGON_VI = 'https://raw.communitydragon.org/latest/cdragon/tft/vi_vn.json';
const GAME_BASE = 'https://raw.communitydragon.org/latest/game/';
// The LCU export carries resolved trait tooltips (per-breakpoint rows with
// constants) and the LoL ability list used as ability-icon fallback.
const LCU_BASE = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default';
const LCU_TRAITS = `${LCU_BASE}/v1/tfttraits.json`;
const LCU_TRAITS_VI = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/vi_vn/v1/tfttraits.json';
const CACHE = 'scripts/.cache/tft-en_us.json';
const CACHE_VI = 'scripts/.cache/tft-vi_vn.json';
const LOLD_CACHE = 'scripts/.cache/loldd';
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

async function loadRaw(url = CDRAGON, cache = CACHE) {
  if (existsSync(cache)) {
    const age = (await stat(cache)).mtimeMs;
    if (Date.now() - age < 12 * 3600 * 1000) {
      console.log(`using cached ${cache}`);
      return JSON.parse(await readFile(cache, 'utf8'));
    }
  }
  console.log(`downloading ${url}...`);
  const text = await (await fetchWithRetry(url)).text();
  await mkdir(dirname(cache), { recursive: true });
  await writeFile(cache, text);
  return JSON.parse(text);
}

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.round(parsed * 100) / 100) : String(value);
};

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

// Champion abilities store their numbers as variables ({name, value[perStar]}).
function abilityEffects(variables) {
  const out = {};
  for (const variable of variables ?? []) {
    const value = Array.isArray(variable.value) ? variable.value[0] : variable.value;
    if (variable.name != null && value != null) out[variable.name] = value;
  }
  return out;
}

const STYLE_NAMES = { kBronze: 'bronze', kSilver: 'silver', kGold: 'gold', kPrismatic: 'prismatic', kUnique: 'unique' };

function resolveVars(text, constants) {
  return text
    .replace(/%i:[^%]*%/g, '')
    .replace(/@(\S[^@]*?)@/g, (_, key) => {
      const name = key.includes(':') ? key.split(':').pop() : key;
      const multiplied = name.match(/^(.+?)\s*\*\s*(\d+(?:\.\d+)?)$/);
      const base = multiplied ? multiplied[1] : name;
      const value = constants[base];
      if (value == null || value === '') return '';
      return number(Number(value) * (multiplied ? Number(multiplied[2]) : 1));
    })
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ ([,.;%)\u00a0])/g, '$1')
    .trim();
}

const constantMap = (sets) => Object.fromEntries((sets ?? []).flatMap((set) => set.constants ?? []).map((c) => [c.name, c.value]));

function traitBreakpoints(entry) {
  const rows = [...(entry.tooltip_text ?? '').matchAll(/<row>([\s\S]*?)<\/row>/gi)].map((m) => m[1]);
  const innate = constantMap(entry.innate_trait_sets);
  const sets = entry.conditional_trait_sets ?? [];
  return sets
    .filter((set) => set.min_units != null)
    .map((set, i) => ({
      minUnits: set.min_units,
      style: STYLE_NAMES[set.style_name] ?? null,
      text: rows[i] ? resolveVars(rows[i], { ...innate, ...constantMap([set]), MinUnits: set.min_units, MaxUnits: set.max_units }) : '',
    }));
}

function traitFlavor(entry) {
  const text = entry.tooltip_text ?? '';
  const flavor = (text.match(/<row>/i) ? text.split(/<row>/i)[0] : text).split('<br>')[0] ?? '';
  return resolveVars(flavor, { ...constantMap(entry.conditional_trait_sets), ...constantMap(entry.innate_trait_sets) });
}

function harvestKeywords(text, defs) {
  const add = (rawName, rawValue) => {
    const name = rawName.replace(/<[^>]*>/g, '').trim().replace(/\.$/, '');
    const value = rawValue.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().replace(/\.$/, '');
    // Real definitions read like "Reduces healing received."; anything short,
    // placeholder-laden or oddly named is a dynamic value line, not a def.
    if (!/^[\p{L}][\p{L}' -]{1,23}$/u.test(name) || value.length < 12 || value.length > 140) return;
    if (/[@{}]|%i:/.test(value)) return;
    if (!defs[name]) defs[name] = `${value}.`;
  };
  for (const m of (text ?? '').matchAll(/<tftbold>(.*?)<\/tftbold>:\s*([^<]+)/gi)) add(m[1], m[2]);
  for (const m of (text ?? '').matchAll(/<rules>([\s\S]*?)<\/rules>/gi)) {
    const kv = m[1].match(/^\s*([^:<]{2,32}):\s*([\s\S]+?)\s*$/);
    if (kv) add(kv[1], kv[2]);
  }
}

const abilityKeywordNames = (desc) =>
  [...new Set([...(desc ?? '').matchAll(/<(?:Keyword|TFTKeyword)>(.*?)<\//gi)].map((m) => m[1].trim()))];

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

// Vietnamese locale shares apiNames with en_us, so every entity can carry its
// vi name/description alongside the English one (English stays the lookup key).
let viChampions = new Map();
let viTraits = new Map();
let viItems = new Map();
let setVi = { champions: [], traits: [] };
try {
  const rawVi = await loadRaw(CDRAGON_VI, CACHE_VI);
  setVi = pickSet(rawVi);
  viChampions = new Map(setVi.champions.map((champion) => [champion.apiName, champion]));
  viTraits = new Map(setVi.traits.map((trait) => [trait.apiName, trait]));
  viItems = new Map(rawVi.items.map((item) => [item.apiName, item]));
  console.log(`vi_vn: ${viChampions.size} champions, ${viTraits.size} traits, ${viItems.size} items`);
} catch (error) {
  console.warn(`vi_vn data unavailable (${error.message}); output will be English-only`);
}

let lcuTraits = new Map();
let lcuTraitsVi = new Map();
try {
  const list = await (await fetchWithRetry(LCU_TRAITS, 2)).json();
  for (const entry of list) if (entry.set === `TFTSet${set.number}`) lcuTraits.set(entry.display_name, entry);
  console.log(`lcu traits: ${lcuTraits.size} for set ${set.number}`);
} catch (error) {
  console.warn(`lcu traits fetch failed (${error.message}); trait tooltips fall back to cdragon flavour only`);
}
try {
  const list = await (await fetchWithRetry(LCU_TRAITS_VI, 2)).json();
  for (const entry of list) if (entry.set === `TFTSet${set.number}`) lcuTraitsVi.set(entry.trait_id, entry);
} catch (error) {
  console.warn(`lcu vi traits fetch failed (${error.message})`);
}

const traits = set.traits.map((trait) => {
  const effects = (trait.effects ?? []).filter((effect) => effect.minUnits != null && effect.style != null);
  const lcu = lcuTraits.get(trait.name);
  const lcuVi = lcuTraitsVi.get(trait.apiName);
  const vi = viTraits.get(trait.apiName);
  return {
    apiName: trait.apiName,
    slug: slugify(trait.apiName),
    name: trait.name,
    desc: lcu ? traitFlavor(lcu) : cleanDesc((trait.desc ?? '').split(/<row>/i)[0], {}),
    breakpoints: lcu ? traitBreakpoints(lcu) : [],
    nameVi: vi?.name ?? null,
    descVi: lcuVi ? traitFlavor(lcuVi) : vi ? cleanDesc((vi.desc ?? '').split(/<row>/i)[0], {}) : null,
    breakpointsVi: lcuVi ? traitBreakpoints(lcuVi) : [],
    thresholds: effects.map((effect) => effect.minUnits),
    styles: effects.map((effect) => effect.style),
    iconSrc: trait.icon ? GAME_BASE + trait.icon.replace(/\.tex$/i, '.png') : null,
  };
});

const champions = set.champions
  .filter((c) => c.cost >= 1 && c.cost <= 5 && c.traits.length > 0 && !/^Lux \(/.test(c.name))
  .map((c) => {
    const vi = viChampions.get(c.apiName);
    const ability = c.ability && c.ability.name && c.ability.name !== 'None'
      ? {
          name: c.ability.name,
          // <rules> blocks are keyword definitions; the card renders them from
          // the harvested map instead of inline text.
          desc: cleanDesc((c.ability.desc ?? '').replace(/<rules>[\s\S]*?<\/rules>/gi, ' '), abilityEffects(c.ability.variables)),
          keywords: abilityKeywordNames(c.ability.desc),
          nameVi: vi?.ability?.name ?? null,
          descVi: vi?.ability
            ? cleanDesc((vi.ability.desc ?? '').replace(/<rules>[\s\S]*?<\/rules>/gi, ' '), abilityEffects(vi.ability.variables))
            : null,
          keywordsVi: abilityKeywordNames(vi?.ability?.desc),
          iconSrc: c.ability.icon && c.ability.icon !== 'None' ? GAME_BASE + c.ability.icon.replace(/\.tex$/i, '.png') : null,
        }
      : null;
    return {
      apiName: c.apiName,
      slug: slugify(c.apiName),
      name: c.name,
      nameVi: vi?.name ?? null,
      cost: c.cost,
      traits: c.traits,
      traitsVi: vi?.traits ?? null,
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
const items = [...itemByName.values()].map((item) => {
  const vi = viItems.get(item.apiName);
  return {
    apiName: item.apiName,
    slug: slugify(item.apiName),
    name: item.name,
    desc: cleanDesc(item.desc, item.effects),
    composition: item.composition.map((id) => itemsByName.get(id)?.name ?? id),
    nameVi: vi?.name ?? null,
    descVi: cleanDesc(vi?.desc, vi?.effects),
    compositionVi: vi?.composition?.length ? vi.composition.map((id) => viItems.get(id)?.name ?? itemsByName.get(id)?.name ?? id) : null,
    iconSrc: item.icon ? GAME_BASE + item.icon.replace(/\.tex$/i, '.png') : null,
  };
});

// Artifacts, emblems and radiant items have no build path, but comp alt builds
// show them; download their icons for the API. fetch-metatft-items.mjs then
// adds radiant and artifact items to the frontend catalog.
const extraItems = raw.items
  .filter((item) =>
    setItemIds.has(item.apiName) &&
    !item.isAugment &&
    item.icon &&
    item.composition.length === 0 &&
    (/Artifact|Emblem/.test(item.apiName) || /^Radiant /.test(item.name ?? ''))
  )
  .map((item) => ({
    apiName: item.apiName,
    slug: slugify(item.apiName),
    iconSrc: GAME_BASE + item.icon.replace(/\.tex$/i, '.png'),
  }));

const keywordDefs = {};
for (const item of itemByName.values()) harvestKeywords(item.desc, keywordDefs);
for (const champion of set.champions) harvestKeywords(champion.ability?.desc, keywordDefs);
for (const trait of set.traits) harvestKeywords(trait.desc, keywordDefs);
for (const entry of lcuTraits.values()) harvestKeywords(entry.tooltip_text, keywordDefs);
const keywordDefsVi = {};
for (const item of itemByName.values()) harvestKeywords(viItems.get(item.apiName)?.desc, keywordDefsVi);
for (const champion of setVi.champions) harvestKeywords(champion.ability?.desc, keywordDefsVi);
for (const trait of setVi.traits) harvestKeywords(trait.desc, keywordDefsVi);
for (const entry of lcuTraitsVi.values()) harvestKeywords(entry.tooltip_text, keywordDefsVi);
console.log(`keyword definitions: en ${Object.keys(keywordDefs).length}, vi ${Object.keys(keywordDefsVi).length}`);

const setAugmentIds = new Set(set.augments);
const seenAugmentIds = new Set();
const augments = raw.items
  .filter((item) => setAugmentIds.has(item.apiName) && item.isAugment && !seenAugmentIds.has(item.apiName) && seenAugmentIds.add(item.apiName))
  .map((aug) => {
    const rarities = aug.tags.map((tag) => RARITY_TAGS[tag]).filter(Boolean);
    const vi = viItems.get(aug.apiName);
    return {
      apiName: aug.apiName,
      slug: slugify(aug.apiName),
      name: aug.name,
      desc: cleanDesc(aug.desc, aug.effects),
      nameVi: vi?.name ?? null,
      descVi: cleanDesc(vi?.desc, vi?.effects),
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

// Ability icons: the set-18 cdragon dump only ships an icon for a handful of
// units, so fall back to the LoL ability (LCU export) whose name matches the
// TFT ability name. Coverage is partial by nature (remixed/monster abilities).
{
  const norm = (value) => (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const readCache = async (file, url) => {
    if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
    const data = await (await fetchWithRetry(url, 2)).json();
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data));
    return data;
  };
  try {
    const summary = await readCache(join(LOLD_CACHE, 'lcu-champion-summary.json'), `${LCU_BASE}/v1/champion-summary.json`);
    const idByName = new Map(summary.filter((entry) => entry.id > 0).map((entry) => [norm(entry.name), entry.id]));
    const missing = champions.filter((c) => c.ability && !c.ability.iconSrc);
    let matched = 0;
    await pool(missing, 8, async (champion) => {
      const id = idByName.get(norm(champion.name));
      if (!id) return;
      try {
        const detail = await readCache(join(LOLD_CACHE, `lcu-champion-${id}.json`), `${LCU_BASE}/v1/champions/${id}.json`);
        const target = norm(champion.ability.name);
        const spell = (detail.spells ?? []).find((s) => norm(s.name) === target)
          ?? (detail.spells ?? []).find((s) => s.name.includes(' / ') && s.name.split(' / ').some((part) => norm(part) === target));
        const passive = !spell && norm(detail.passive?.name) === target ? detail.passive : null;
        const iconPath = spell?.abilityIconPath ?? passive?.abilityIconPath;
        if (!iconPath) return;
        champion.ability.iconSrc = LCU_BASE + iconPath.replace(/^\/lol-game-data\/assets(\/ASSETS)?/i, '/assets').toLowerCase();
        matched += 1;
      } catch (error) {
        console.warn(`  lcu detail miss ${id}: ${error.message}`);
      }
    });
    console.log(`ability icons matched from lcu abilities: ${matched}/${missing.length}`);
  } catch (error) {
    console.warn(`lcu ability matching unavailable: ${error.message}`);
  }
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
  ...extraItems.map((i) => ['items', i]),
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
    ability: ability
      ? {
          name: ability.name,
          desc: ability.desc,
          keywords: ability.keywords,
          nameVi: ability.nameVi,
          descVi: ability.descVi,
          keywordsVi: ability.keywordsVi,
          icon: ability.icon ?? null,
        }
      : null,
  })),
  keywords: {
    en: Object.fromEntries(Object.entries(keywordDefs).sort(([a], [b]) => a.localeCompare(b))),
    vi: Object.fromEntries(Object.entries(keywordDefsVi).sort(([a], [b]) => a.localeCompare(b))),
  },
  items: items.map(({ iconSrc, ...i }) => ({ ...i, icon: i.icon ?? null })),
  augments: augments.map(({ iconSrc, ...a }) => ({ ...a, icon: a.icon ?? null })),
};

await writeFile(OUT_JSON, JSON.stringify(output));
const missing = [...champions, ...traits, ...items, ...augments].filter((e) => !e.icon).length;
const abilities = champions.filter((c) => c.ability);
console.log(
  `wrote ${OUT_JSON}: ${champions.length} champions, ${traits.length} traits, ${items.length} items, ${augments.length} augments` +
    (missing ? `, ${missing} icons missing` : ', all icons present')
);
console.log(
  `ability icons: ${abilities.filter((c) => c.ability.icon).length}/${abilities.length}, ` +
    `trait breakpoints: ${traits.filter((t) => t.breakpoints.length).length}/${traits.length}, ` +
    `keyword defs: ${Object.keys(keywordDefs).length}`
);
console.log(`patch ${patch}, set ${set.number}`);
