// MetaTFT's PBE data is the first source with Set 19 strings in Vietnamese (Riot's own client
// files still stop at set 18) and the only source with PBE comp stats. This script does both jobs
// in one fetch pass:
//
//   1. merges the Vietnamese names/descriptions into packages/shared/data/set19.json, next to the
//      fields `scrape-set-update.mjs` writes — run that one first, this one last, because it
//      overrides the set-18 guesses with set-19 text;
//   2. writes packages/shared/data/set19-comps.json from the PBE comp clusters, and downloads the
//      item art those comps use to public/tft/set19/items.
//
// Run from apps/web: node scripts/scrape-metatft-pbe.mjs

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = join(APP, '../../packages/shared/data/set19.json');
const COMPS = join(APP, '../../packages/shared/data/set19-comps.json');
const ITEM_DIR = join(APP, 'public/tft/set19/items');
const LOOKUP = (locale) => `https://data.metatft.com/lookups/TFTSet19_latest_${locale}.json`;
const API = 'https://api-hc.metatft.com/tft-comps-api';
const CDN_ITEM = (icon) => `https://cdn.metatft.com/file/metatft/items/${icon.toLowerCase()}.png`;
// The Mystical Instrument units (Bongos, Maracas, …) are board slots, not champions, so the reveal
// page has no art for them and the comp board would show two initials in a hex.
const CDN_UNIT = (apiName) => `https://cdn.metatft.com/file/metatft/champions/${apiName.toLowerCase()}.png`;
const UA = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36' };

const getJson = async (url) => {
  const response = await fetch(url, { headers: UA, signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
};

// Descriptions carry `<TFTCurveTable row="X" [column="N"] [format="..."]/>` where a number belongs.
// The curve values are stage keyed (`[[stage, value], ...]`); `column` names the stage and its
// absence means the number does not change. Semantics below were checked against the English text
// on the reveal page, which spells the same numbers out (0.25 → "25%", 1.3 → "30%", 0.89 → "11%").
const PERCENT = (value) => `${Math.round(value * 100)}%`;
const FORMATS = {
  percent: PERCENT,
  Percent: PERCENT,
  p: PERCENT,
  percentMinusOne: (value) => PERCENT(value - 1),
  invertedPercent: (value) => PERCENT(1 - value),
};

function resolveDesc(desc, curveValues) {
  return desc
    .replace(/<TFTCurveTable([^>]*)\/>/g, (_, attrs) => {
      const attr = (name) => (attrs.match(new RegExp(`${name}="([^"]*)"`)) || [])[1];
      const row = attr('row');
      const values = curveValues?.[row];
      if (!values?.length) return '\u0000';
      const column = attr('column');
      // A row whose value changes with the stage cannot be written into a sentence that does not
      // say which stage (Boy Band's "2/2/9/9 clones"): the English text stays instead.
      if (!column && new Set(values.map(([, value]) => value)).size > 1) return '\u0000';
      const want = Number(column ?? 0) || 0;
      let picked = values[0][1];
      for (const [key, value] of values) if (key <= want) picked = value;
      const format = FORMATS[attr('format')];
      return format ? format(picked) : String(Math.round(picked * 100) / 100);
    })
    .replace(/<br\s*\/?>/gi, ' ')
    .trim();
}

// A description that keeps a tag we cannot resolve is worse than the English one, so both are
// rejected the same way.
const usable = (text) => Boolean(text) && !text.includes('<') && !text.includes('\u0000');

const [vi, en, scraped] = await Promise.all([getJson(LOOKUP('vi_vn')), getJson(LOOKUP('en_us')), readFile(DATA, 'utf8').then(JSON.parse)]);
const enUnits = new Map(en.units.map((unit) => [unit.apiName, unit]));
const enTraits = new Map(en.traits.map((trait) => [trait.apiName, trait]));

// MetaTFT keys units and traits by API name and ships the English name beside the localised one,
// so every join below is a name join on `en_name`; the localised `name` can be Vietnamese even in
// the English file (Wukong arrives as "Ngộ Không").
const viTraitByName = new Map(vi.traits.filter((trait) => trait.en_name).map((trait) => [trait.en_name, trait]));
const viUnitByName = new Map(vi.units.map((unit) => [unit.en_name, unit]));
const viAugmentByName = new Map(vi.augments.filter((augment) => augment.en_name).map((augment) => [augment.en_name, augment]));
const viItemByApi = new Map(vi.items.map((item) => [item.apiName, item]));

const keep = (meta, current) => (meta && meta !== '' ? meta : (current ?? null));
const stats = { traitName: 0, traitDesc: 0, unitName: 0, abilityName: 0, augmentName: 0, augmentDesc: 0, fallbacks: [] };

for (const trait of scraped.traits) {
  const meta = viTraitByName.get(trait.name);
  if (!meta) continue;
  // An untranslated string in this source is the English one again, so the value the set-18 merge
  // already found (same English name, same English description) is the better fallback.
  if (meta.name !== meta.en_name) {
    trait.nameVi = meta.name;
    stats.traitName++;
  }
  const desc = resolveDesc(meta.desc ?? '', meta.curveValues);
  const translated = meta.desc !== (enTraits.get(meta.apiName)?.desc ?? '');
  if (translated && usable(desc)) trait.descVi = desc;
  if (trait.descVi) stats.traitDesc++;
}

for (const champion of scraped.champions) {
  const meta = viUnitByName.get(champion.name);
  if (!meta) continue;
  if (meta.name !== meta.en_name) {
    champion.nameVi = meta.name;
    stats.unitName++;
  }
  // The reveal page and the game disagree on a few ability names (Elise: "Cocoon" there, "Bite
  // Marks" in the client) and the description numbers come from the reveal page, so only the
  // localised name is taken here and the scraped text stays the source of the numbers.
  const englishAbility = enUnits.get(meta.apiName)?.ability?.name;
  const viAbility = meta.ability?.name;
  if (viAbility && viAbility !== englishAbility) {
    champion.ability.nameVi = viAbility;
    stats.abilityName++;
  }
  champion.traitsVi = champion.traits.map((trait) => {
    const translated = viTraitByName.get(trait);
    return translated && translated.name !== translated.en_name ? translated.name : null;
  });
  if (!champion.traitsVi.some(Boolean)) champion.traitsVi = null;
}

const enAugments = new Map(en.augments.map((augment) => [augment.en_name, augment]));
for (const augment of scraped.augments) {
  const meta = viAugmentByName.get(augment.name);
  if (!meta) {
    stats.fallbacks.push(augment.name);
    continue;
  }
  if (meta.name !== meta.en_name) augment.nameVi = meta.name;
  const desc = resolveDesc(meta.desc ?? '', meta.curveValues);
  const translated = meta.desc !== (enAugments.get(augment.name)?.desc ?? '');
  if (translated && usable(desc)) augment.descVi = desc;
  else if (translated) stats.fallbacks.push(augment.name);
}

await writeFile(DATA, `${JSON.stringify(scraped, null, 2)}\n`);

// --- comps ---------------------------------------------------------------------------------------

const clusterId = await getJson(`${API}/latest_cluster_id?tft_set=TFTSet19`);
const clusterInfo = await getJson(`${API}/latest_cluster_info?tft_set=TFTSet19`);
const clusters = clusterInfo.cluster_info.cluster_details.clusters.map((entry) => entry.Cluster);

const details = [];
for (let index = 0; index < clusters.length; index += 6) {
  const batch = clusters.slice(index, index + 6);
  details.push(...(await Promise.all(batch.map((comp) => getJson(`${API}/comp_details?comp=${comp}&cluster_id=${clusterId.cluster_id}&tft_set=TFTSet19`)))));
}

const championByName = new Map(scraped.champions.map((champion) => [champion.name, champion]));
const traitStyle = (trait) => {
  const label = viTraitByName.get(trait);
  return label ? label.name : trait;
};
const itemEntry = (api) => {
  const item = viItemByApi.get(api);
  if (!item) return null;
  return {
    name: item.en_name ?? item.name,
    nameVi: item.name,
    icon: `/tft/set19/items/${item.icon.toLowerCase()}.png`,
  };
};

const comps = details.map(({ results: comp }) => {
  // Boards live in `options` keyed by level; the deepest level with games is the finished comp.
  // `unit_stats` cannot be used for the board: it lists every unit that ever touched the comp.
  // The level the comp is finished at most often — not the deepest one, because the handful of
  // level 10 boards would turn every card into a ten-unit wall.
  const levels = Object.keys(comp.options ?? {})
    .map(Number)
    .filter((level) => comp.options[level]?.length);
  const gamesAt = (level) => comp.options[level].reduce((sum, entry) => sum + entry.count, 0);
  const level = levels.reduce((best, entry) => (gamesAt(entry) > gamesAt(best) ? entry : best));
  const board = comp.options[level].reduce((best, entry) => (entry.count > best.count ? entry : best));
  const units = board.units_list.split('&').map((api) => vi.units.find((unit) => unit.apiName === api)).filter(Boolean);

  // One build per unit keeps the card readable: the most played three-item build for each unit of
  // this board, and nothing for the units that never carry. Every unit has a best build (a 0.3%
  // one is noise), so only the three most built units on this board show their items.
  const buildsByUnit = new Map();
  for (const build of comp.builds ?? []) {
    if (build.num_items !== 3) continue;
    const current = buildsByUnit.get(build.unit);
    if (!current || build.count > current.count) buildsByUnit.set(build.unit, build);
  }
  const carriers = new Set(
    units
      .map((unit) => buildsByUnit.get(unit.apiName))
      .filter(Boolean)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((build) => build.unit),
  );

  // `traits_list` names each trait with its breakpoint tier ("..._3"), not its unit count, so the
  // count players recognise ("K/DA 8") is counted off the board instead.
  const traitCounts = new Map();
  for (const unit of units) for (const api of unit.traitApiNames ?? []) traitCounts.set(api, (traitCounts.get(api) ?? 0) + 1);

  const traits = board.traits_list
    .split('&')
    .map((entry) => {
      const tier = Number(entry.split('_').at(-1));
      const api = entry.slice(0, entry.lastIndexOf('_'));
      const meta = vi.traits.find((trait) => trait.apiName === api);
      if (!meta?.en_name || !Number.isFinite(tier)) return null;
      return {
        name: meta.en_name,
        nameVi: meta.name !== meta.en_name ? meta.name : null,
        tier,
        count: traitCounts.get(api) ?? 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.tier - a.tier || b.count - a.count);

  // A trait sitting at one unit is not active; those are the solo artist traits every champion
  // carries, and they bury the breakpoints the comp actually hits.
  const active = traits.filter((trait) => trait.count >= 2);

  return {
    id: comp.cluster,
    level,
    count: comp.overall.count,
    avg: comp.overall.avg,
    traits: active.length ? active : traits,
    units: units.map((unit) => ({
      api: unit.apiName,
      name: unit.en_name,
      nameVi: unit.name !== unit.en_name ? unit.name : null,
      cost: unit.cost,
      icon: championByName.get(unit.en_name)?.icon ?? null,
      items: (carriers.has(unit.apiName) ? (buildsByUnit.get(unit.apiName)?.buildName ?? []) : [])
        .map(itemEntry)
        .filter(Boolean),
    })),
  };
});

comps.sort((a, b) => b.count - a.count);

// Self-check: a cluster whose board failed to parse produces an empty unit list, which would look
// like a legitimately tiny comp on the page.
const problems = [];
if (comps.length < 30) problems.push(`comps: ${comps.length} < 30`);
for (const comp of comps) {
  if (comp.units.length < 5) problems.push(`comp ${comp.id}: ${comp.units.length} units`);
  if (!comp.traits.length) problems.push(`comp ${comp.id}: no traits`);
}
if (problems.length) throw new Error(problems.join('\n'));

const CHAMPION_DIR = join(APP, 'public/tft/set19/champions');
await mkdir(CHAMPION_DIR, { recursive: true });
for (const [apiName, units] of Map.groupBy(comps.flatMap((comp) => comp.units).filter((unit) => !unit.icon), (unit) => unit.api)) {
  if (!apiName) continue;
  const file = `${apiName.toLowerCase()}.png`;
  const response = await fetch(CDN_UNIT(apiName), { headers: UA, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) continue;
  await writeFile(join(CHAMPION_DIR, file), Buffer.from(await response.arrayBuffer()));
  for (const unit of units) unit.icon = `/tft/set19/champions/${file}`;
}

await writeFile(COMPS, `${JSON.stringify({ cluster: clusterId.cluster_id, updated: new Date(clusterInfo.cluster_info.updated_at).toISOString(), queue: 'pbe', comps }, null, 2)}\n`);

await mkdir(ITEM_DIR, { recursive: true });
const icons = new Set(comps.flatMap((comp) => comp.units.flatMap((unit) => unit.items.map((item) => item.icon.split('/').pop()))));
let downloaded = 0;
const failed = [];
for (const file of icons) {
  const target = join(ITEM_DIR, file);
  const exists = await access(target).then(() => true, () => false);
  if (exists) continue;
  const response = await fetch(CDN_ITEM(file.replace(/\.png$/, '')), { headers: UA, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    failed.push(file);
    continue;
  }
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  downloaded++;
}

const count = (rows, field) => rows.filter((row) => (field.includes('.') ? field.split('.').reduce((value, key) => value?.[key], row) : row[field])).length;
console.log(
  [
    `champions ${scraped.champions.length} · traits ${scraped.traits.length} · augments ${scraped.augments.length}`,
    `VI: trait names ${count(scraped.traits, 'nameVi')}, trait descs ${count(scraped.traits, 'descVi')}, unit names ${count(scraped.champions, 'nameVi')}, ability names ${count(scraped.champions, 'ability.nameVi')}, augment names ${count(scraped.augments, 'nameVi')}, augment descs ${count(scraped.augments, 'descVi')}`,
    `comps ${comps.length} (id ${clusterId.cluster_id}, ${comps[0].count}..${comps.at(-1).count} games)`,
    `item icons: ${icons.size} referenced, ${downloaded} downloaded${failed.length ? `, ${failed.length} missing (${failed.slice(0, 4).join(', ')})` : ''}`,
    `left in English: ${[...new Set(stats.fallbacks)].slice(0, 8).join(', ')}${stats.fallbacks.length > 8 ? '…' : ''}`,
  ].join('\n'),
);
