// Fetches the public MetaTFT snapshot (comps, unit/item/augment stats), maps it
// onto this set's CommunityDragon names and writes:
//   lib/meta.json          build-time snapshot for static pages
//   server/seed/comps.json comp seed generated from live clusters
// Run: node scripts/fetch-metatft.mjs
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const tft = readJson('lib/tft.json');

const BASE = 'https://api-hc.metatft.com';
const QUEUE = 1100;
const CONCURRENCY = 4;
const WAIT_MS = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(path, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(BASE + path, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
      return await res.json();
    } catch (error) {
      if (attempt >= tries) throw error;
      await sleep(1000 * attempt);
    }
  }
}

// Four requests at a time, with a short gap between fetches.
async function pool(items, worker) {
  let index = 0;
  const runners = Array.from({ length: CONCURRENCY }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await worker(current);
      await sleep(WAIT_MS);
    }
  });
  await Promise.all(runners);
}

const norm = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');

const championByNorm = new Map(tft.champions.map((champion) => [norm(champion.name), champion.name]));
const itemByNorm = new Map(tft.items.map((item) => [norm(item.name), item.name]));
const augmentByApi = new Map(tft.augments.map((augment) => [norm(augment.apiName.replace(/^TFT\d*_Augment_/, '')), augment.name]));
const augmentByName = new Map(tft.augments.map((augment) => [norm(augment.name), augment.name]));
const augmentNameSet = new Set(tft.augments.map((augment) => augment.name));

// MetaTFT keeps Riot's internal item ids; several no longer match this set's
// display names after the mid-set item swaps.
const ITEM_ALIASES = {
  frozenheart: "Protector's Vow",
  protectorsvow: "Protector's Vow",
  redemption: 'Spirit Visage',
  tacticiansring: "Tactician's Cape",
  madredsbloodrazor: 'Giant Slayer',
  guardianangel: 'Edge of Night',
  runaanshurricane: "Kraken's Fury",
  spectralgauntlet: 'Evenshroud',
  leviathan: "Nashor's Tooth",
  forceofnature: "Tactician's Crown",
  tacticiansscepter: "Tactician's Shield",
  statikkshiv: 'Void Staff',
  powergauntlet: "Striker's Flail",
  nightharvester: 'Steadfast Heart',
  unstableconcoction: 'Hand Of Justice',
};
const EMBLEM_ALIASES = { Slayer: 'Ravager', FloraFatalis: 'Flora Fatalis' };

function metaItem(id) {
  if (!id || typeof id !== 'string') return null;
  if (/(_Radiant|Radiant)$/i.test(id)) return null;
  if (/^DA_(Item_)?Artifact_/i.test(id)) return null;
  let base = id.replace(/^DA_(18_)?/i, '').replace(/^Component_/i, '');
  if (/^Emblem/i.test(base)) {
    const trait = base.replace(/^Emblem/i, '').replace(/Augment(Plus)?$/i, '').replace(/Plus$/i, '');
    return itemByNorm.get(norm(`${EMBLEM_ALIASES[trait] ?? trait}Emblem`)) ?? null;
  }
  const alias = ITEM_ALIASES[norm(base)];
  if (alias) return alias;
  const direct = itemByNorm.get(norm(base));
  if (direct) return direct;
  const display = base.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return itemByNorm.get(norm(display)) ?? null;
}

function metaAugment(id) {
  if (!id || typeof id !== 'string') return null;
  const base = id.replace(/^DA_(18_)?/i, '');
  let hit = augmentByApi.get(norm(base)) ?? augmentByName.get(norm(base));
  if (hit) return hit;
  const stripped = base
    .replace(/_(Gold|Silver|Prismatic)$/i, '')
    .replace(/AugmentPlus$/i, '')
    .replace(/Plus$/i, '')
    .replace(/TraitAugment$/i, '')
    .replace(/Augment$/i, '');
  hit = augmentByApi.get(norm(stripped)) ?? augmentByName.get(norm(stripped));
  if (hit) return hit;
  const display = stripped.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return augmentByName.get(norm(display)) ?? null;
}

const placementStats = (places) => {
  const total = places.reduce((sum, value) => sum + value, 0);
  if (!total) return null;
  return {
    games: total,
    win: places[0] / total,
    top4: places.slice(0, 4).reduce((sum, value) => sum + value, 0) / total,
    avg: places.reduce((sum, value, index) => sum + value * (index + 1), 0) / total,
  };
};

const addPlaces = (map, name, places) => {
  if (!name) return;
  const current = map.get(name) ?? [0, 0, 0, 0, 0, 0, 0, 0];
  for (let index = 0; index < 8; index++) current[index] += places[index] ?? 0;
  map.set(name, current);
};

const compact = (value) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const titleCase = (value) =>
  String(value)
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/['’]([a-z])/g, (_, letter) => `'${letter.toUpperCase()}`);
const slugify = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const TIERS = ['S', 'A', 'B', 'C', 'X'];
const STYLES = ['Reroll', 'Fast 8', 'Flex', 'Tempo'];
// Stable slugs from the pre-MetaTFT seed; capture fixtures and old links use them.
const LEGACY_SLUGS = {
  Ahri: ['ahri-spellweaver'],
  Ashe: ['ashe-blossom'],
  Amumu: ['amumu-inferno'],
  Ezreal: ['ezreal-elderwood'],
  Cassiopeia: ['cassiopeia-coven'],
  Tristana: ['tristana-sprykin-reroll'],
  Sentinel: ['sentinel-riftbeast'],
  Aphelios: ['aphelios-lunar'],
  Azir: ['azir-blackthorn'],
  Kayle: ['kayle-solar'],
  Sivir: ['sivir-primal'],
  'Elder Dragon': ['elder-dragon-apex'],
  Draven: ['draven-bounty'],
};
const AUGMENT_RANK = { S: 0, A: 1, B: 2, C: 3, D: 4 };

async function main() {
  console.log('fetching cluster metadata...');
  const clusterIdRes = await get('/tft-comps-api/latest_cluster_id');
  const clusterInfo = await get('/tft-comps-api/latest_cluster_info');
  if (clusterIdRes.tft_set !== clusterInfo.tft_set) throw new Error('cluster id/info set mismatch');
  const clusterId = clusterInfo.cluster_id;
  const details = clusterInfo.cluster_info.cluster_details;
  const clusters = details.clusters;

  const unitName = (id) => {
    const entry = details.unit_lookup[String(id).trim()];
    return entry?.name ? championByNorm.get(norm(entry.name)) ?? null : null;
  };
  const traitName = (id) => details.trait_lookup[id]?.name ?? null;

  console.log(`fetching ${clusters.length} comps (cluster ${clusterId})...`);
  const compsRaw = [];
  await pool(clusters, async (cluster) => {
    const response = await get(`/tft-comps-api/comp_details?comp=${cluster.Cluster}&cluster_id=${clusterId}`);
    if (response.tft_set !== clusterInfo.tft_set || response.queue_id !== QUEUE) {
      throw new Error(`unexpected comp payload for ${cluster.Cluster}`);
    }
    compsRaw.push({ cluster, results: response.results });
  });

  console.log('fetching stat snapshots...');
  const [unitDistribution, unitItemsProcessed, itemStats, augmentTiersRaw, compAugmentTiers] = await Promise.all([
    get(`/tft-stat-api/units_distribution?queue=${QUEUE}&days=7&patch=current`),
    get('/tft-comps-api/unit_items_processed'),
    get(`/tft-stat-api/items?queue=${QUEUE}&days=7`),
    get('/tft-stat-api/augments_tiers'),
    get(`/tft-comps-api/comp_augment_tiers?cluster_id=${clusterId}&queue=${QUEUE}`),
  ]);

  // Unit stats: aggregate the numItems rows, then attach the processed item list.
  const unitPlaces = new Map();
  for (const row of unitDistribution.results) addPlaces(unitPlaces, unitName(row.unit), row.places);
  const unitItems = new Map();
  for (const [id, entry] of Object.entries(unitItemsProcessed.units)) {
    const name = unitName(id);
    if (!name) continue;
    const items = new Set(unitItems.get(name) ?? []);
    for (const item of entry.items ?? []) {
      const mapped = metaItem(item.itemName);
      if (mapped) items.add(mapped);
    }
    unitItems.set(name, items);
  }
  const units = {};
  for (const [name, places] of unitPlaces) {
    const stats = placementStats(places);
    if (!stats) continue;
    units[name] = {
      games: stats.games,
      avg: Math.round(stats.avg * 1000) / 1000,
      top4: Math.round(stats.top4 * 10000) / 10000,
      win: Math.round(stats.win * 10000) / 10000,
      items: [...(unitItems.get(name) ?? [])].slice(0, 6),
    };
  }

  // Item tiers: only completed items (components have no composition); rank by average placement.
  const itemPlaces = new Map();
  for (const row of itemStats.results) addPlaces(itemPlaces, metaItem(row.itemName), row.places);
  const completed = new Set(tft.items.filter((item) => item.composition.length === 2).map((item) => item.name));
  const itemRows = [...itemPlaces.entries()]
    .map(([name, places]) => ({ name, ...placementStats(places) }))
    .filter((row) => row && completed.has(row.name) && row.games >= 5000)
    .sort((a, b) => a.avg - b.avg);
  const itemCut = (index) => {
    const share = index / itemRows.length;
    return share < 0.15 ? 'S' : share < 0.4 ? 'A' : share < 0.7 ? 'B' : share < 0.88 ? 'C' : 'X';
  };
  const items = itemRows.map((row, index) => ({
    name: row.name,
    tier: itemCut(index),
    avg: Math.round(row.avg * 100) / 100,
    games: row.games,
    top4: Math.round(row.top4 * 1000) / 1000,
    win: Math.round(row.win * 1000) / 1000,
    note: {
      en: `${row.avg.toFixed(2)} avg · ${compact(row.games)} games`,
      vi: `Hạng TB ${row.avg.toFixed(2)} · ${compact(row.games)} trận`,
    },
  }));

  // Augment tiers come straight from MetaTFT's tier list (D maps to the site's X).
  const augmentRank = new Map();
  for (const tier of augmentTiersRaw.content.content.tierList) {
    for (const entry of tier.content) {
      const name = metaAugment(entry.id);
      if (!name) continue;
      const label = tier.label === 'D' ? 'X' : tier.label;
      if (!TIERS.includes(label)) continue;
      const current = augmentRank.get(name);
      if (!current || AUGMENT_RANK[tier.label] < AUGMENT_RANK[current]) augmentRank.set(name, tier.label);
    }
  }
  const augments = [...augmentRank.entries()]
    .map(([name, rank]) => {
      const tier = rank === 'D' ? 'X' : rank;
      return {
        name,
        tier,
        note: {
          en: `MetaTFT ${rank} tier`,
          vi: `Hạng ${rank} MetaTFT`,
        },
      };
    })
    .sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.name.localeCompare(b.name));

  // Board and plan for one cluster.
  const sourceTitles = compAugmentTiers.results;
  const usedSlugs = new Set();

  const buildComp = ({ cluster, results }) => {
    const titleParts = sourceTitles[cluster.Cluster]?.source_title?.split('>').map((part) => part.trim()) ?? [];
    const sourceCarryPart = titleParts[0] ?? '';
    const sourceCarries = sourceCarryPart
      .split(/[&/]/)
      .map((part) => championByNorm.get(norm(part)))
      .filter(Boolean);
    const sourceTrait = titleParts[1] && !/^lvl/i.test(titleParts[1]) ? titleParts[1] : null;
    const sourceStyle = titleParts.find((part) => /^lvl/i.test(part)) ?? '';

    const buildsByUnit = new Map();
    for (const build of results.builds) {
      const name = unitName(build.unit);
      if (!name) continue;
      const list = buildsByUnit.get(name) ?? [];
      list.push(build);
      buildsByUnit.set(name, list);
    }
    const buildCount = (name) => (buildsByUnit.get(name) ?? []).reduce((sum, build) => sum + build.count, 0);
    const itemNamesByUnit = new Map();
    for (const entry of results.itemNames) {
      const item = metaItem(entry.itemNames);
      if (!item) continue;
      for (const unit of entry.units ?? []) {
        const name = unitName(unit.units);
        if (!name) continue;
        const list = itemNamesByUnit.get(name) ?? [];
        list.push({ name: item, count: unit.count });
        itemNamesByUnit.set(name, list);
      }
    }

    // Final board: the most common option at the most common final level.
    const finalLevel = [...results.final_levels].sort((a, b) => b.count - a.count)[0]?.level;
    const levelOptions = Object.entries(results.options).map(([level, options]) => ({ level: Number(level), options }));
    const nearest = levelOptions.sort((a, b) => Math.abs(a.level - Number(finalLevel)) - Math.abs(b.level - Number(finalLevel)))[0];
    const finalOption = (nearest?.options ?? []).filter((option) => option.count > 0).sort((a, b) => b.count - a.count)[0];
    const optionUnits = finalOption ? finalOption.units_list.split('&').map(unitName).filter(Boolean) : [];
    let board = optionUnits.length >= 3 ? optionUnits : cluster.units_string.split(',').map(unitName).filter(Boolean);

    // Prefer a board option that actually contains the title's carry.
    if (sourceCarries.length && !board.some((name) => sourceCarries.includes(name))) {
      const withCarry = levelOptions
        .flatMap((entry) => entry.options)
        .filter((option) => {
          const names = option.units_list.split('&').map(unitName).filter(Boolean);
          return names.some((name) => sourceCarries.includes(name));
        })
        .sort((a, b) => b.count - a.count)[0];
      if (withCarry) board = withCarry.units_list.split('&').map(unitName).filter(Boolean);
    }
    board = [...new Set(board)];
    const carry =
      sourceCarries.filter((name) => board.includes(name)).sort((a, b) => buildCount(b) - buildCount(a))[0] ??
      [...board].sort((a, b) => buildCount(b) - buildCount(a))[0] ??
      board[0];
    if (!carry) return null;
    if (!board.includes(carry)) board.unshift(carry);
    if (board.length > 12) {
      const rest = board.filter((name) => name !== carry).sort((a, b) => buildCount(b) - buildCount(a));
      board = [carry, ...rest.slice(0, 11)];
    }
    if (board.length < 3) return null;

    // Style from MetaTFT's title when present, otherwise the final-level mode.
    let style;
    if (/reroll/i.test(sourceStyle)) style = 'Reroll';
    else if (sourceStyle) style = 'Fast 8';
    else if (Number(finalLevel) <= 7) style = 'Reroll';
    else style = 'Fast 8';
    if (!STYLES.includes(style)) style = 'Flex';

    // Items: top mapped build per unit, carry first; fill the carry from item frequency.
    const unitItemsByName = new Map();
    const itemBuild = (name) => {
      const builds = (buildsByUnit.get(name) ?? [])
        .map((build) => ({ build, items: [...new Set(build.buildName.map(metaItem).filter(Boolean))] }))
        .filter((entry) => entry.items.length)
        .sort((a, b) => Number(b.build.num_items === 3) - Number(a.build.num_items === 3) || b.build.count - a.build.count);
      return builds[0]?.items ?? [];
    };
    const fillItems = (name, current) => {
      const additions = (itemNamesByUnit.get(name) ?? []).sort((a, b) => b.count - a.count).map((entry) => entry.name);
      return [...new Set([...current, ...additions])].slice(0, 3);
    };
    const carryItems = fillItems(carry, itemBuild(carry));
    if (carryItems.length) unitItemsByName.set(carry, carryItems);
    const itemUnits = [...board]
      .filter((name) => name !== carry)
      .sort((a, b) => buildCount(b) - buildCount(a))
      .slice(0, 3);
    for (const name of itemUnits) {
      const built = fillItems(name, itemBuild(name));
      if (built.length) unitItemsByName.set(name, built);
    }

    const positionByName = new Map();
    for (const [id, entry] of Object.entries(results.positioning?.units ?? {})) {
      const name = unitName(id);
      if (!name) continue;
      const list = positionByName.get(name) ?? [];
      list.push(...(entry.positions ?? []));
      positionByName.set(name, list);
    }
    const positions = new Map();
    const positionFor = (name) => {
      const candidates = positionByName.get(name) ?? [];
      for (const candidate of candidates) {
        if (positions.has(candidate.cell)) continue;
        const number = Number(candidate.cell.replace(/\D+/g, ''));
        if (!number) continue;
        // MetaTFT numbers cells from the back-left row: cell 1-7 is row 3.
        const row = 3 - Math.floor((number - 1) / 7);
        const col = (number - 1) % 7;
        if (row < 0 || row > 3 || col < 0 || col > 6) continue;
        positions.set(candidate.cell, { name, row, col });
        return { row, col };
      }
      return { row: null, col: null };
    };
    const unitRows = board.map((name) => {
      const position = positionFor(name);
      return {
        name,
        row: position.row,
        col: position.col,
        stars: name === carry ? (style === 'Reroll' && (tft.champions.find((champion) => champion.name === name)?.cost ?? 5) <= 3 ? 3 : 2) : null,
        items: unitItemsByName.get(name) ?? [],
      };
    });

    // Early units: most common level 4 option, topped up from level 5.
    const earlyOptions = (levels) =>
      levels
        .flatMap((level) => results.early_options?.[level] ?? [])
        .sort((a, b) => b.count - a.count);
    const early = [...new Set(
      earlyOptions(['4', '5'])
        .flatMap((option) => option.unit_list.split('&').map(unitName).filter(Boolean))
        .filter((name) => board.includes(name) || (tft.champions.find((champion) => champion.name === name)?.cost ?? 9) <= 4)
    )].slice(0, 4);
    if (!early.length) early.push(...board.filter((name) => (tft.champions.find((champion) => champion.name === name)?.cost ?? 9) <= 2).slice(0, 3));
    if (!early.length) early.push(board[0]);

    const carryCost = tft.champions.find((champion) => champion.name === carry)?.cost ?? 4;
    const difficulty = style === 'Reroll' ? (carryCost <= 3 ? 1 : 2) : carryCost >= 5 ? 3 : 2;

    const activeTrait =
      sourceTrait ??
      (cluster.name ?? [])
        .filter((entry) => entry.type === 'trait')
        .map((entry) => traitName(entry.name))
        .filter(Boolean)[0] ??
      'Flex';
    const displayCarry = sourceCarryPart && sourceCarries.length
      ? sourceCarryPart.split(/([&/])/).map((part) => (/^[&/]$/.test(part) ? part : championByNorm.get(norm(part)) ?? titleCase(part))).join(' ')
      : carry;
    const title = `${displayCarry} ${titleCase(activeTrait)}`.replace(/\s+/g, ' ').trim();
    const augmentsForComp = [...(sourceTitles[cluster.Cluster]?.augments ?? [])]
      .sort((a, b) => (AUGMENT_RANK[a.tier] ?? 9) - (AUGMENT_RANK[b.tier] ?? 9))
      .map((entry) => metaAugment(entry.id))
      .filter((name) => name && augmentNameSet.has(name));
    const compAugments = [...new Set(augmentsForComp)].slice(0, 8);
    if (!compAugments.length) compAugments.push(...augments.slice(0, 6).map((augment) => augment.name));

    const avg = results.overall.avg;
    const count = results.overall.count;
    const levelMode = [...results.final_levels].sort((a, b) => b.count - a.count)[0];
    const levelShare = levelMode ? Math.round((levelMode.count / count) * 100) : 0;
    const trendValues = results.trends.map((trend) => trend.avg).filter((value) => Number.isFinite(value));
    const trendDelta = trendValues.length >= 4
      ? trendValues.slice(-2).reduce((a, b) => a + b, 0) / 2 - trendValues.slice(0, 2).reduce((a, b) => a + b, 0) / 2
      : 0;
    const trend = trendDelta <= -0.05 ? 'up' : trendDelta >= 0.05 ? 'down' : null;

    const planText = (level) => {
      const options = results.early_options?.[level] ?? [];
      const option = options.sort((a, b) => b.count - a.count)[0];
      if (!option) return null;
      const names = option.unit_list.split('&').map(unitName).filter(Boolean);
      if (!names.length) return null;
      return { names, count: option.count, avg: option.avg };
    };
    const stage2 = planText('4');
    const stage3 = planText('6');
    const stage4UnitNames = finalOption ? finalOption.units_list.split('&').map(unitName).filter(Boolean) : [];
    const stages = [
      stage2 && {
        stage: 'Stage 2',
        text: `Most common level 4 board: ${stage2.names.join(', ')} (${stage2.count.toLocaleString('en')} games, ${stage2.avg.toFixed(2)} avg).`,
        textVi: `Đội cấp 4 phổ biến nhất: ${stage2.names.join(', ')} (${stage2.count.toLocaleString('vi')} trận, hạng TB ${stage2.avg.toFixed(2)}).`,
      },
      stage3 && {
        stage: 'Stage 3',
        text: `Most common level 6 board: ${stage3.names.join(', ')} (${stage3.count.toLocaleString('en')} games, ${stage3.avg.toFixed(2)} avg).`,
        textVi: `Đội cấp 6 phổ biến nhất: ${stage3.names.join(', ')} (${stage3.count.toLocaleString('vi')} trận, hạng TB ${stage3.avg.toFixed(2)}).`,
      },
      stage4UnitNames.length && {
        stage: 'Stage 4',
        text: `Level ${finalLevel} board: ${stage4UnitNames.join(', ')} (${(finalOption.count ?? 0).toLocaleString('en')} games, ${results.overall.avg.toFixed(2)} avg).`,
        textVi: `Đội cấp ${finalLevel}: ${stage4UnitNames.join(', ')} (${(finalOption.count ?? 0).toLocaleString('vi')} trận, hạng TB ${results.overall.avg.toFixed(2)}).`,
      },
    ].filter(Boolean);

    const itemLine = carryItems.length ? ` Best ${carry} build: ${carryItems.join(', ')}.` : '';
    const itemLineVi = carryItems.length ? ` Trang bị tốt nhất cho ${carry}: ${carryItems.join(', ')}.` : '';
    const tips = `Average placement ${avg.toFixed(2)} across ${count.toLocaleString('en')} games. Level ${levelMode?.level ?? '?'} is the most common finish (${levelShare}%).${itemLine}`;
    const tipsVi = `Hạng trung bình ${avg.toFixed(2)} qua ${count.toLocaleString('vi')} trận. Cấp ${levelMode?.level ?? '?'} là mức kết thúc phổ biến nhất (${levelShare}%).${itemLineVi}`;

    return {
      title,
      tier: 'B', // assigned after the whole set is known
      style,
      difficulty,
      trend,
      playstyle: `${style} · ${carry} carry`,
      playstyleVi: `${style} · chủ lực ${carry}`,
      stats: { avg: Math.round(avg * 100) / 100, games: count, level: Number(levelMode?.level ?? 0) },
      units: unitRows,
      early,
      carry,
      items: carryItems,
      augments: compAugments,
      tips,
      tipsVi,
      stages,
    };
  };

  compsRaw.sort((a, b) => b.results.overall.count - a.results.overall.count);
  const comps = compsRaw.map(buildComp).filter(Boolean);

  // Tiers: rank by average placement; tiny samples stay in the situational tier.
  const ranked = [...comps].sort((a, b) => a.stats.avg - b.stats.avg || b.stats.games - a.stats.games);
  const eligible = ranked.filter((comp) => comp.stats.games >= 2000);
  eligible.forEach((comp, index) => {
    const share = index / eligible.length;
    comp.tier = share < 0.15 ? 'S' : share < 0.4 ? 'A' : share < 0.7 ? 'B' : share < 0.9 ? 'C' : 'X';
  });
  for (const comp of ranked) if (comp.stats.games < 2000) comp.tier = 'X';

  // Deduplicate identical titles (cluster variants of the same line).
  const unique = new Map();
  for (const comp of comps.sort((a, b) => b.stats.games - a.stats.games)) {
    if (!unique.has(comp.title)) unique.set(comp.title, comp);
  }
  const finalComps = [...unique.values()].sort((a, b) => a.stats.avg - b.stats.avg || b.stats.games - a.stats.games);

  // Reuse the seed's established slug for the same carry when possible (keeps
  // existing links and capture fixtures working). Exact title-trait matches go
  // first so e.g. the Lunar Aphelios board keeps aphelios-lunar.
  const pendingSlugs = [];
  for (const comp of finalComps) {
    const baseSlug = slugify(comp.title);
    const candidates = LEGACY_SLUGS[comp.carry] ?? [];
    const exact = candidates.find((candidate) => !usedSlugs.has(candidate) && baseSlug.includes(candidate.slice(slugify(comp.carry).length + 1)));
    if (exact) {
      comp.slug = exact;
      usedSlugs.add(exact);
    } else {
      pendingSlugs.push(comp);
    }
  }
  for (const comp of pendingSlugs) {
    const baseSlug = slugify(comp.title);
    let slug = (LEGACY_SLUGS[comp.carry] ?? []).find((candidate) => !usedSlugs.has(candidate)) ?? baseSlug;
    if (usedSlugs.has(slug) || !slug) {
      let suffix = 2;
      while (usedSlugs.has(`${baseSlug}-${suffix}`)) suffix++;
      slug = `${baseSlug}-${suffix}`;
    }
    comp.slug = slug;
    usedSlugs.add(slug);
  }

  const updated = new Date(clusterIdRes.updated).toISOString();
  const gameMeta = Array.isArray(unitDistribution.games) ? unitDistribution.games[0] : unitDistribution.games;
  const snapshot = {
    source: {
      provider: 'MetaTFT',
      set: clusterInfo.tft_set,
      setNumber: Number(clusterInfo.tft_set.replace(/\D+/g, '')),
      patch: `${gameMeta?.patch ?? 'live'}${gameMeta?.b_patch_version ?? ''}`,
      queue: QUEUE,
      clusterId,
      updated,
      fetchedAt: new Date().toISOString(),
    },
    comps: finalComps,
    items,
    augments,
    units,
  };

  // Self-checks: never write a snapshot the site or seed cannot consume.
  const championNames = new Set(tft.champions.map((champion) => champion.name));
  const itemNames = new Set(tft.items.map((item) => item.name));
  const augmentNames = new Set(tft.augments.map((augment) => augment.name));
  const errors = [];
  if (finalComps.length < 20) errors.push(`only ${finalComps.length} comps`);
  if (items.length < 20) errors.push(`only ${items.length} item tiers`);
  if (augments.length < 50) errors.push(`only ${augments.length} augment tiers`);
  if (Object.keys(units).length < 40) errors.push(`only ${Object.keys(units).length} unit stat rows`);
  for (const comp of finalComps) {
    if (!TIERS.includes(comp.tier)) errors.push(`${comp.slug}: bad tier`);
    if (!STYLES.includes(comp.style)) errors.push(`${comp.slug}: bad style`);
    if (comp.units.length < 3 || comp.units.length > 12) errors.push(`${comp.slug}: ${comp.units.length} units`);
    if (!comp.units.some((unit) => unit.name === comp.carry)) errors.push(`${comp.slug}: carry not on board`);
    if (!comp.items.length) errors.push(`${comp.slug}: no carry items`);
    if (!comp.augments.length) errors.push(`${comp.slug}: no augments`);
    if (!comp.early.length) errors.push(`${comp.slug}: no early units`);
    for (const unit of comp.units) {
      if (!championNames.has(unit.name)) errors.push(`${comp.slug}: unknown champion ${unit.name}`);
      for (const item of unit.items) if (!itemNames.has(item)) errors.push(`${comp.slug}: unknown item ${item}`);
    }
    for (const item of comp.items) if (!itemNames.has(item)) errors.push(`${comp.slug}: unknown carry item ${item}`);
    for (const augment of comp.augments) if (!augmentNames.has(augment)) errors.push(`${comp.slug}: unknown augment ${augment}`);
  }
  const slugs = new Set(finalComps.map((comp) => comp.slug));
  if (slugs.size !== finalComps.length) errors.push('duplicate comp slugs');
  if (errors.length) throw new Error(`snapshot checks failed:\n${errors.slice(0, 20).join('\n')}`);

  await mkdir(dirname(join(ROOT, 'lib/meta.json')), { recursive: true });
  await writeFile(join(ROOT, 'lib/meta.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
  await writeFile(join(ROOT, 'server/seed/comps.json'), `${JSON.stringify(finalComps, null, 2)}\n`);

  const tiers = TIERS.map((tier) => `${tier}:${finalComps.filter((comp) => comp.tier === tier).length}`).join(' ');
  console.log(`wrote lib/meta.json and server/seed/comps.json`);
  console.log(`${finalComps.length} comps (${tiers}), ${items.length} completed item tiers, ${augments.length} augment tiers, ${Object.keys(units).length} units`);
  console.log(`patch ${snapshot.source.patch} · queue ${QUEUE} · cluster ${clusterId} · updated ${updated}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
