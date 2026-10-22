// Fetches the Set 18 Wisp tier list and charm lookup from MetaTFT and writes
// lib/wisps.json. The tier endpoint only returns IDs + tiers; names, effects,
// costs and appear rounds come from the Set 18 charm lookup.
// Run: node scripts/fetch-wisps.mjs
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const TIER_ENDPOINT = 'https://api-hc.metatft.com/tft-stat-api/wisp_tiers';
const LOOKUP_ENDPOINT = 'https://data.metatft.com/lookups/TFTSet18_latest_en_us.json';
const LOOKUP_VI_ENDPOINT = 'https://data.metatft.com/lookups/TFTSet18_latest_vi_vn.json';
const VARIANTS = ['base', 'upgrade', 'prismatic'];
const TIERS = ['S', 'A', 'B', 'C', 'D'];

const get = async (url) => {
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
};

const formatNumber = (value) => String(Math.round(value * 100) / 100);

const curveValue = (charm, row, format) => {
  const cells = charm.curveValues?.[row] ?? charm.curveTable?.[row];
  if (!cells?.length) throw new Error(`${charm.apiName}: missing curve row ${row}`);
  const value = cells[0][1];
  switch (format?.toLowerCase()) {
    case 'percent':
      return `${formatNumber(value * 100)}%`;
    case 'percentminusone':
      return `${formatNumber((value - 1) * 100)}%`;
    case 'invertedpercent':
      return `${formatNumber((1 - value) * 100)}%`;
    default:
      return formatNumber(value);
  }
};

const renderDescription = (charm) =>
  charm.desc
    .replace(/<TFTCurveTable\s+([^>]*?)\/>/g, (_, attrs) => {
      const row = /row="([^"]+)"/.exec(attrs)?.[1];
      const format = /format="([^"]+)"/.exec(attrs)?.[1];
      if (!row) throw new Error(`${charm.apiName}: curve placeholder without row`);
      return curveValue(charm, row, format);
    })
    .replace(/<\/?Set18CharmUpgrade>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const formatRound = (span) => (span?.start && span?.end ? `${span.start} \u2192 ${span.end}` : null);

const iconUrl = (categoryIcon) =>
  categoryIcon
    ? `https://cdn.metatft.com/cdn-cgi/image/width=64,format=auto/https://cdn.metatft.com/file/metatft/charms/categories/${categoryIcon.toLowerCase()}.png`
    : null;

const humanize = (apiName) =>
  apiName
    .replace(/^DA_/, '')
    .replace(/^18_/, '')
    .replace(/18$/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();

const [tierResponse, lookup, lookupVi] = await Promise.all([get(TIER_ENDPOINT), get(LOOKUP_ENDPOINT), get(LOOKUP_VI_ENDPOINT)]);
const tierList = tierResponse.content?.content?.tierList;
const charms = lookup.charms;
const charmsVi = lookupVi.charms;
if (!Array.isArray(tierList)) throw new Error('wisp_tiers response is missing content.content.tierList');
if (!Array.isArray(charms)) throw new Error('lookup response is missing charms');
if (!Array.isArray(charmsVi)) throw new Error('vi lookup response is missing charms');

const byId = new Map(charms.map((charm) => [charm.apiName, charm]));
const viById = new Map(charmsVi.map((charm) => [charm.apiName, charm]));
const prismaticByName = new Map(
  charms
    .filter((charm) => !charm.isUpgrade && /Prismatic/.test(charm.apiName))
    .map((charm) => [charm.name, charm])
);

const missingLookup = [];
const groups = [];
for (const tierEntry of tierList) {
  if (!TIERS.includes(tierEntry.label)) throw new Error(`unknown tier ${tierEntry.label}`);
  for (const entry of tierEntry.content) {
    const base = byId.get(entry.id);
    if (!base) {
      missingLookup.push(entry.id);
      groups.push({ apiName: entry.id, name: humanize(entry.id), tier: tierEntry.label, variants: {} });
      continue;
    }
    const prismatic = prismaticByName.get(base.name);
    const upgrade = byId.get(base.upgrade ?? prismatic?.upgrade ?? '');
    groups.push({
      name: base.name,
      tier: tierEntry.label,
      variants: { base, ...(upgrade ? { upgrade } : {}), ...(prismatic ? { prismatic } : {}) },
    });
  }
}

const wisps = [];
for (const group of groups) {
  if (!group.variants.base) {
    wisps.push({
      apiName: group.apiName,
      name: group.name,
      nameVi: null,
      tier: group.tier,
      category: null,
      cost: null,
      variant: 'base',
      description: null,
      descriptionVi: null,
      icon: null,
      round: null,
    });
    continue;
  }
  for (const variant of VARIANTS) {
    const charm = group.variants[variant];
    if (!charm) continue;
    const vi = viById.get(charm.apiName);
    wisps.push({
      apiName: charm.apiName,
      name: group.name,
      nameVi: vi?.name && vi.name !== charm.name ? vi.name : null,
      tier: group.tier,
      category: charm.category ?? group.variants.base.category ?? null,
      cost: charm.cost ?? group.variants.base.cost ?? null,
      variant,
      description: renderDescription(charm),
      descriptionVi: vi ? renderDescription(vi) : null,
      icon: iconUrl(charm.categoryIcon ?? group.variants.base.categoryIcon),
      round: formatRound(charm.roundSpan),
    });
  }
}

const tierOrder = new Map(TIERS.map((tier, index) => [tier, index]));
const variantOrder = new Map(VARIANTS.map((variant, index) => [variant, index]));
wisps.sort(
  (a, b) =>
    tierOrder.get(a.tier) - tierOrder.get(b.tier) ||
    a.name.localeCompare(b.name) ||
    variantOrder.get(a.variant) - variantOrder.get(b.variant)
);

const errors = [];
const tierIds = tierList.flatMap((entry) => entry.content.map((wisp) => wisp.id));
if (tierIds.length < 150) errors.push(`only ${tierIds.length} tier-list wisps`);
if (wisps.length < 300) errors.push(`only ${wisps.length} wisp records`);
if (new Set(wisps.map((wisp) => wisp.apiName)).size !== wisps.length) errors.push('duplicate apiName');
if (new Set(tierIds).size !== tierIds.length) errors.push('duplicate tier-list id');
for (const wisp of wisps) {
  if (!wisp.apiName || !wisp.name || !TIERS.includes(wisp.tier)) {
    errors.push(`incomplete record: ${wisp.apiName || wisp.name}`);
  }
  if (!VARIANTS.includes(wisp.variant)) errors.push(`${wisp.apiName}: bad variant ${wisp.variant}`);
  if (wisp.description !== null && (!wisp.description || /<[^>]+>|TFTCurveTable/.test(wisp.description))) {
    errors.push(`${wisp.apiName}: unrendered description`);
  }
  if (wisp.descriptionVi !== null && (!wisp.descriptionVi || /<[^>]+>|TFTCurveTable/.test(wisp.descriptionVi))) {
    errors.push(`${wisp.apiName}: unrendered vi description`);
  }
  if (wisp.icon !== null && !wisp.icon.startsWith('https://cdn.metatft.com/')) errors.push(`${wisp.apiName}: bad icon url`);
}
if (wisps.filter((wisp) => wisp.descriptionVi).length < 300) errors.push('vi lookup coverage is too low');
for (const name of new Set(wisps.map((wisp) => wisp.name))) {
  const variants = wisps.filter((wisp) => wisp.name === name).map((wisp) => wisp.variant);
  if (!variants.includes('base')) errors.push(`${name}: missing base`);
  if (new Set(variants).size !== variants.length) errors.push(`${name}: duplicate variant`);
}
if (missingLookup.length > 5) errors.push(`too many tier-list ids missing from lookup: ${missingLookup.length}`);
if (errors.length) throw new Error(`wisp snapshot checks failed:\n${errors.slice(0, 20).join('\n')}`);

const snapshot = {
  source: {
    provider: 'MetaTFT',
    tierList: TIER_ENDPOINT,
    lookup: LOOKUP_ENDPOINT,
    lookupVi: LOOKUP_VI_ENDPOINT,
    fetchedAt: new Date().toISOString(),
    tierListUpdated: new Date(tierResponse.updated).toISOString(),
    curatedAt: tierResponse.content.updated_at ?? null,
    tftSet: lookup._metadata?.set ?? null,
    lookupPatch: lookup._metadata?.patch ?? null,
    missingLookup,
  },
  wisps,
};

await writeFile(join(ROOT, 'lib/wisps.json'), `${JSON.stringify(snapshot, null, 2)}\n`);

const names = new Set(wisps.map((wisp) => wisp.name)).size;
console.log(`wrote lib/wisps.json · ${wisps.length} records · ${names} names · ${missingLookup.length} missing lookup`);
