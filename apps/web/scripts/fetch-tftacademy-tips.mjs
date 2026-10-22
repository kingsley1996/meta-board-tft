// Fetches TFT Academy comp guides and merges their tips, Stage 2/3/4 texts,
// augments, augment priority and alt builds into matching comps in
// apps/api/seed/comps.json.
// Run after scripts/fetch-metatft.mjs, which rewrites the seed:
//   node scripts/fetch-tftacademy-tips.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SEED = join(ROOT, '../api/seed/comps.json');
const SOURCE = join(ROOT, '../api/seed/tftacademy-source.json');
const retrievedAt = new Date().toISOString();
const TFT = join(ROOT, '../../packages/shared/data/tft.json');
const COMPS_URL = 'https://tftacademy.com/api/tierlist/comps?set=18';
const CHAMPIONS_URL = 'https://tftacademy.com/api/assets/champions?set=18';
const ITEMS_URL = 'https://tftacademy.com/api/assets/items?set=18';
const AUGMENTS_URL = 'https://tftacademy.com/api/assets/augments?set=18';
const STAGES = ['Stage 2', 'Stage 3', 'Stage 4'];
const AUGMENT_TYPES = ['ITEMS', 'ECON', 'COMBAT', 'EMBLEM'];

// Current MetaTFT comp slug -> TFT Academy compSlug. Only confident matches:
// same carry and core board, or the same named archetype. Unlisted comps keep
// their existing MetaTFT-generated tips.
const MATCHES = {
  'cinderling-pebbles-riftbeast': 'set-18-10-riftbeast',
  'azir-blackthorn': 'set-18-azir-rammus',
  'kha-zix-elderwood': 'set-18-lunarwood-khazix',
  'aphelios-elderwood': 'set-18-aphelios-vanguards-copy',
  'veigar-blackthorn': 'set-18-veigar-consuming-flora-copy',
  'aphelios-lunar': 'set-18-aphelios-nidalee',
  'alune-vanguard': 'set-18-ap-95',
  'master-yi-adaptor': 'set-18-adaptor-reroll-copy',
  'aphelios-rapidfire': 'set-18-aphelios-rapidfire',
  'kayle-solar': 'set-18-eclipse-kayle',
  'warwick-ravager': 'set-18-warwick-rr',
  'teemo-sprykin': 'set-18-sprykin-teemo-copy',
  'draven-bounty': 'set-18-elderwood-executioners-copy',
  'draven-legendaries': 'set-18-dragon-princess',
  'ahri-spellweaver': 'set-18-ahri-morgana',
  'karma-yunara-blossom': 'set-18-solara-yunara',
  'sentinel-invoker': 'set-18-cashout-morgana',
  'ezreal-elderwood': 'set-18-elderwood-executioners',
  'camille-akali-solar': 'set-18-solar-melee',
  'ahri-zyra-blossom': 'set-18-spellweavers',
  'sivir-primal': 'set-18-invoker-nidalee-copy',
  'aphelios-vanguard': 'set-18-moon-fire',
  'scuttlecrab-riftbeast': 'set-18-riftbeast-reroll',
  'cassiopeia-coven': 'set-18-defender-cassio',
  'soraka-executioner': 'set-18-soraka-flex',
  'zyra-juggernaut': 'set-18-6-juggernaut-ap',
  'karma-yunara-blackthorn': 'set-18-moo-nara',
  'ashe-blossom': 'set-18-ashe-juggernauts',
  'mama-beak-vanguard': 'set-18-rengar-rr',
  'elise-coven': 'set-18-coven-elise',
  'caitlyn-juggernaut': 'set-18-caitlyn-hunters',
  'tristana-sprykin-reroll': 'set-18-sprykin-trist',
  'veigar-sprykin': 'set-18-dark-mages',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.json();
    } catch (error) {
      if (attempt >= tries) throw error;
      await sleep(1000 * attempt);
    }
  }
}

// TFT Academy and MetaTFT differ on punctuation/casing ("Wit's End" vs "Wits End").
const norm = (value) => String(value).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();

const [comps, data, taChampions, taItems, taAugments, tft] = await Promise.all([
  readFile(SEED, 'utf8').then(JSON.parse),
  getJson(COMPS_URL),
  getJson(CHAMPIONS_URL),
  getJson(ITEMS_URL),
  getJson(AUGMENTS_URL),
  readFile(TFT, 'utf8').then(JSON.parse),
]);

const guides = new Map(
  data.guides
    .filter((guide) => guide.isPublic && guide.compSlug)
    .map((guide) => [guide.compSlug, guide])
);

// apiName -> current display name, plus a name-based fallback for TFT Academy
// assets that use a different apiName.
const championByApi = new Map(tft.champions.map((champion) => [champion.apiName, champion.name]));
const championByName = new Map(tft.champions.map((champion) => [norm(champion.name), champion.name]));
const itemByApi = new Map(tft.items.map((item) => [item.apiName, item.name]));
const itemByName = new Map(tft.items.map((item) => [norm(item.name), item.name]));
const augmentByApi = new Map(tft.augments.map((augment) => [augment.apiName, augment.name]));
const augmentByName = new Map(tft.augments.map((augment) => [norm(augment.name), augment.name]));
const taChampionName = new Map(taChampions.champions.map((champion) => [champion.apiName, champion.name]));
const taItemName = new Map(taItems.items.map((item) => [item.apiName, item.name]));
const taAugmentName = new Map(taAugments.augments.map((augment) => [augment.apiName, augment.name]));

const championName = (apiName) => {
  if (championByApi.has(apiName)) return championByApi.get(apiName);
  const name = taChampionName.get(apiName);
  return name ? championByName.get(norm(name)) ?? name : null;
};

// Artifact/emblem/radiant items have no completed-item record, so they keep
// their TFT Academy display name; the API resolves their icon from the DB.
const ITEM_ALIASES = new Map([
  ["mogul'smail", "Mogul's Mail"],
  ['talisman of ascension', 'Talisman Of Ascension'],
]);
const itemName = (apiName) => {
  if (itemByApi.has(apiName)) return itemByApi.get(apiName);
  const name = taItemName.get(apiName);
  if (!name) return null;
  return itemByName.get(norm(name)) ?? ITEM_ALIASES.get(norm(name)) ?? name;
};

// Unknown augments are skipped (CommunityDragon lags on a couple of new ones).
const augmentName = (apiName) => {
  if (augmentByApi.has(apiName)) return augmentByApi.get(apiName);
  const name = taAugmentName.get(apiName);
  return name ? augmentByName.get(norm(name)) ?? null : null;
};

const errors = [];
const compSlugs = new Set(comps.map((comp) => comp.slug));
const targets = Object.values(MATCHES);
if (new Set(targets).size !== targets.length) errors.push('duplicate TFT Academy compSlug in MATCHES');
for (const [slug, target] of Object.entries(MATCHES)) {
  if (!compSlugs.has(slug)) errors.push(`unknown current comp: ${slug}`);
  const guide = guides.get(target);
  if (!guide) {
    errors.push(`${slug}: TFT Academy guide not public: ${target}`);
    continue;
  }
  if (guide.set !== 18) errors.push(`${slug}: wrong set ${guide.set}`);
  if (!String(guide.augmentsTip ?? '').trim()) errors.push(`${slug}: empty augmentsTip`);
  const byStage = new Map((guide.tips ?? []).map((tip) => [tip.stage, String(tip.tip ?? '').trim()]));
  for (const stage of STAGES) if (!byStage.get(stage)) errors.push(`${slug}: empty ${stage} tip`);
  const types = (guide.augmentTypes ?? []).map((type) => String(type).toUpperCase());
  if (!types.length) errors.push(`${slug}: empty augmentTypes`);
  for (const type of types) if (!AUGMENT_TYPES.includes(type)) errors.push(`${slug}: unknown augment type ${type}`);
  if (!(guide.augments ?? []).some((augment) => !augment.disabled && augmentName(augment.apiName))) {
    errors.push(`${slug}: no mappable augments`);
  }
  for (const build of guide.altBuilds ?? []) {
    if (!championName(build.apiName)) errors.push(`${slug}: unknown alt build champion ${build.apiName}`);
    if ((build.items ?? []).length > 3) errors.push(`${slug}: alt build has more than 3 items`);
    if (build.stars !== null && ![1, 2, 3].includes(build.stars)) errors.push(`${slug}: alt build has invalid stars ${build.stars}`);
  }
}
if (errors.length) throw new Error(`TFT Academy merge checks failed:\n${errors.join('\n')}`);

const warnings = [];
for (const comp of comps) {
  const target = MATCHES[comp.slug];
  if (!target) continue;
  const guide = guides.get(target);
  const byStage = new Map(guide.tips.map((tip) => [tip.stage, tip.tip.trim()]));
  comp.tips = guide.augmentsTip.trim();
  comp.tipsVi = null;
  comp.stages = STAGES.map((stage) => ({ stage, text: byStage.get(stage), textVi: null }));
  comp.augments = [...new Set((guide.augments ?? [])
    .filter((augment) => !augment.disabled)
    .map((augment) => augmentName(augment.apiName))
    .filter(Boolean))];
  comp.augmentTypes = [...new Set((guide.augmentTypes ?? []).map((type) => String(type).toUpperCase()))];
  comp.alt = (guide.altBuilds ?? []).flatMap((build) => {
    const name = championName(build.apiName);
    if (!name) return [];
    return [{ name, stars: build.stars ?? null, items: (build.items ?? []).map(itemName).filter(Boolean) }];
  });
  if (comp.augments.length < 7) warnings.push(`${comp.slug}: only ${comp.augments.length}/8 augments mapped`);
  if (!comp.alt.length) warnings.push(`${comp.slug}: no alt builds`);
}

const matched = Object.keys(MATCHES).length;
const unmatched = comps.filter((comp) => !MATCHES[comp.slug]).map((comp) => comp.slug);
await writeFile(SEED, `${JSON.stringify(comps, null, 2)}\n`);
await writeFile(SOURCE, `${JSON.stringify({ retrievedAt }, null, 2)}\n`);
console.log(`merged TFT Academy data into ${matched}/${comps.length} comps`);
if (warnings.length) console.log(`warnings:\n  ${warnings.join('\n  ')}`);
if (unmatched.length) console.log(`left unchanged: ${unmatched.join(', ')}`);
