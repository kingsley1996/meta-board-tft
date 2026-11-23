// Turns tactics.tools' "Set 19 Update" page into packages/shared/data/set19.json, which
// /[lang]/set-19 renders. Run it when the set reveal page changes; it fails loudly if the
// page stops matching the shape it was written against. Icons land in apps/web/public.
//
//   node scripts/scrape-set-update.mjs [saved-page.html]
//
// The optional argument reads a saved copy instead of fetching, for when the site is down
// or Cloudflare answers with a challenge.

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_URL = 'https://tactics.tools/info/set-update';
const OUT = join(APP, '../../packages/shared/data/set19.json');
const IMG_DIR = join(APP, 'public/tft/set19');

const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// The raster art on ap.tft.tools is WebP whatever the query string says, so the files are named
// .webp; saving them as .jpg made Next serve WebP bytes as image/jpeg.
// Icons are keyed by the asset name the page itself uses, so a champion that shares a display
// name with a live-set unit cannot overwrite the live set's file. Existing files are skipped:
// the reveal art is stable and re-downloading ~470 images on every run is not.
const saved = new Map();
async function saveImage(url, folder, file) {
  const relative = `/tft/set19/${folder}/${file}`;
  if (saved.has(url)) return saved.get(url);
  const target = join(IMG_DIR, folder, file);
  let exists = true;
  try {
    await access(target);
  } catch {
    exists = false;
  }
  if (!exists) {
    const response = await fetch(url);
    // A few augment icons are dead links on the source page itself; the card renders without art
    // rather than the run failing over decoration.
    if (response.status === 404) {
      saved.set(url, null);
      return null;
    }
    if (!response.ok) throw new Error(`${response.status} for ${url}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
  }
  saved.set(url, relative);
  return relative;
}


const decode = (text) =>
  text
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

const clean = (html) => decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

const section = (html, id, nextId) => {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) throw new Error(`section ${id} not found`);
  const end = nextId ? html.indexOf(`id="${nextId}"`, start) : html.length;
  return html.slice(start, end < 0 ? html.length : end);
};

const one = (text, re, label) => {
  const match = text.match(re);
  if (!match) throw new Error(`could not read ${label}`);
  return match;
};

function systems(gameplay) {
  const h2 = one(gameplay, /<h2 class="h2 pb-2">([^<]+)<\/h2>/, 'set title')[1];
  const intro = one(gameplay, /<h2 class="h2 pb-2">[^<]+<\/h2>\s*<div>([\s\S]*?)<\/div>/, 'set intro')[1];
  const cards = [...gameplay.matchAll(/<h3 class="h3 pb-1 mt-5">([^<]+)<\/h3>\s*<div>([\s\S]*?)<\/div>/g)].map((m) => ({
    title: clean(m[1]),
    desc: clean(m[2]),
  }));
  const dates = one(gameplay, /<div class="p-6 py-5[\s\S]*?<\/div>\s*<\/div>/, 'release block')[0];
  const pbe = one(dates, /PBE \w+, (\w+ \d+)/, 'PBE date')[1];
  const live = one(dates, /live servers \w+, (\w+ \d+\w*) with patch ([\d.]+)/, 'live date');
  return {
    // The page titles itself "Teamfight Tactics: Prismatic Tour"; the app already says TFT.
    name: clean(h2).replace(/^Teamfight Tactics: /, ''),
    intro: clean(intro),
    systems: cards,
    pbe: isoDate(pbe),
    live: isoDate(live[1]),
    patch: live[2].replace(/\.$/, ''),
  };
}

// The reveal page names no year; set 19 ships in 2026, so that is the year these two dates mean.
const YEAR = 2026;
function isoDate(text) {
  const [, month, day] = one(text, /^(\w+) (\d+)/, `date ${text}`);
  const index = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(month);
  if (index < 0) throw new Error(`unknown month in ${text}`);
  return `${YEAR}-${String(index + 1).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
}

function champions(units) {
  const marker = '<div class=" rounded text-white1 w-[291px] flex flex-col bg-bg">';
  const cards = units.split(marker).slice(1).map((card) => {
    const [, name, cost] = one(card, /rounded-\[3px\] css-\w+">([^<]+)<div class="flex items-end text-\[16px\]">(\d+)/, 'champion name/cost');
    // The card's wide art carries the asset name, and the square portrait is the same asset under
    // /face/. Keying the icon on the asset keeps it distinct from a same-named live-set unit.
    const asset = one(card, /face_full_ultrawide\/([^.\"?]+)\.jpg/, `art of ${name}`)[1];
    const traits = [...card.matchAll(/<div class="pl-1 css-1fxzlo3">([^<]+)<\/div>/g)].map((m) => clean(m[1]));
    const role = one(card, /font-medium self-start">([^<]+)</, `role of ${name}`)[1];
    const range = one(card, /title="Range"[\s\S]*?break-all">(\d+)</, `range of ${name}`)[1];
    const abilityName = one(card, /leading-none"><div class="font-medium text-sm">([^<]+)</, `ability of ${name}`)[1];
    const mana = card.match(/pt-\[1px\]">([^<]+)</)?.[1] ?? null; // manaless champions carry no mana row
    const descStart = card.indexOf('<div class="leading-tight ">');
    const descEnd = card.indexOf('<div class="MuiTabs-root mt-auto', descStart);
    if (descStart < 0 || descEnd < 0) throw new Error(`description of ${name} not found`);
    return {
      name: clean(name),
      cost: Number(cost),
      traits,
      role: clean(role).replace(/^DA_Role_/, ''),
      range: Number(range),
      ability: { name: clean(abilityName), mana: mana ? clean(mana) : null, desc: clean(card.slice(descStart, descEnd)) },
      icon: { url: `https://ap.tft.tools/img/s99/face/${asset.toLowerCase()}.jpg?w=116`, file: `${slugify(asset)}.webp` },
      splash: { url: `https://ap.tft.tools/img/s99/face_full_ultrawide/${asset}.jpg?w=290`, file: `${slugify(asset)}.webp` },
      abilityIcon: { url: decode(one(card, /<img[^>]*src="(https:\/\/ap\.tft\.tools\/img\/s99\/ability\/[^"]+)"/, `ability art of ${name}`)[1]), file: `${slugify(asset)}.webp` },
    };
  });
  return cards;
}

const STAT_LABEL = {
  'Attack speed': 'AS',
  'Attack Damage': 'AD',
  'Ability Power': 'AP',
  'Magic Resist': 'MR',
  'Damage Amplification': 'Damage Amp',
};

function traits(html) {
  const marker = '<div class="p-4 rounded text-white1  bg-bg">';
  return html.split(marker).slice(1).map((card) => {
    const name = one(card, /<h3[^>]*>([^<]+)<\/h3>/, 'trait name')[1];
    const slug = one(card, /href="\/info\/set-\d+\/traits\/([a-z0-9_]+)"/, `slug of ${name}`)[1];
    const blockStart = card.indexOf('<div class="py-3 text-sm leading-tight">');
    const blockEnd = card.indexOf('<div class="flex pt-2 gap-[10px] flex-wrap">', blockStart);
    if (blockStart < 0) throw new Error(`description of ${name} not found`);
    const lines = decode(card.slice(blockStart, blockEnd < 0 ? undefined : blockEnd))
      // A rung is one <div> that mixes text spans with stat icons, and a spacer div separates the
      // paragraphs above the ladder. Turning every div into a line break keeps a rung on one line
      // instead of gluing "(3) … (5) …" into a paragraph. The page marks a rung either "(3)" or
      // "3)", and a star-level rung escapes its star as markup, hence the decode above.
      .replace(/<img[^>]*id="icon\.Star"[^>]*>/g, '★')
      .replace(/<img[^>]*alt="([^"]*)"[^>]*>/g, (_, alt) => ` ${STAT_LABEL[alt] ?? alt} `)
      .replace(/<div[^>]*>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').replace(/\s+([,.;%])/g, '$1').trim())
      .filter(Boolean);
    const desc = [];
    const breakpoints = [];
    for (const line of lines) {
      const mark = line.match(/^\(?(\d+)★?\)\s*(.*)$/);
      if (mark) breakpoints.push({ count: Number(mark[1]), text: mark[2].trim() });
      else if (breakpoints.length) breakpoints[breakpoints.length - 1].text = `${breakpoints[breakpoints.length - 1].text} ${line}`.trim();
      else desc.push(line);
    }
    const units = [...card.matchAll(/<img[^>]*alt="([^"]+)"[^>]*src="https:\/\/ap\.tft\.tools\/img\/[^"]*\/face\//g)].map((m) => decode(m[1]));
    // tactics writes K/DA with a pipe to keep it out of its URL slugs.
    const icon = one(card, /<img[^>]*src="(https:\/\/ap\.tft\.tools\/static\/trait-icons\/[^"]+)"/, `icon of ${name}`)[1];
    return {
      name: clean(name).replace('|', '/'),
      slug,
      desc: desc.join(' ').trim(),
      breakpoints,
      units,
      icon: { url: icon, file: `${slug}.svg` },
    };
  });
}

function augments(html) {
  const marker = '<div class="p-4 rounded text-white1  bg-bg">';
  return html.split(marker).slice(1).map((card) => {
    const name = clean(one(card, /<h4[^>]*>([^<]+)<\/h4>/, 'augment name')[1]);
    const desc = one(card, /<div class="text-sm leading-snug">([\s\S]*?)<\/div><\/div>/, `description of ${name}`)[1];
    const icon = one(card, /<img[^>]*src="(https:\/\/ap\.tft\.tools\/img\/augments\/[^"]+)"/, `icon of ${name}`)[1];
    // Same rule as champion art: the file is keyed on the asset, not the display name. The page
    // ships several variants under one name ("Invested+", "Invested++", "TONS of Stats!"), and a
    // name slug would let them overwrite each other.
    const asset = one(icon, /img\/augments\/([^.?]+)/, `asset of ${name}`)[1];
    // The icon filename ends in the tier digit (1 silver, 2 gold, 3 prismatic); the card itself
    // carries no rarity, and 187 of the 189 augments that also exist in the live set agree with it.
    const rarity = Number(one(icon, /(\d)\.png(?:\?|$)/, `tier of ${name}`)[1]);
    return {
      name,
      desc: clean(desc),
      rarity,
      icon: { url: decode(icon), file: `${slugify(asset)}.webp` },
    };
  });
}

async function attachIcons(rows, folder, field = 'icon') {
  await Promise.all(rows.map(async (row) => {
    row[field] = await saveImage(row[field].url, folder, row[field].file);
  }));
  // Two rows writing the same file would leave one card showing the other's art.
  const files = rows.map((row) => row[field]).filter(Boolean);
  const duplicates = files.filter((file, index) => files.indexOf(file) !== index);
  if (duplicates.length) throw new Error(`duplicate icon files in ${folder}: ${[...new Set(duplicates)].join(', ')}`);
  return rows;
}

const html = process.argv[2] ? await readFile(process.argv[2], 'utf8') : await (await fetch(SOURCE_URL, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36' } })).text();

const gameplay = section(html, 'set-update-gameplay', 'set-update-units');
const set = systems(gameplay);
const championRows = champions(section(html, 'set-update-units', 'set-update-traits'));
const traitRows = traits(section(html, 'set-update-traits', 'set-update-items'));
const augmentRows = augments(section(html, 'set-update-augments', 'set-update-tacticians'));

await attachIcons(championRows, 'champions');
await attachIcons(championRows, 'splash', 'splash');
await attachIcons(championRows, 'abilities', 'abilityIcon');
await attachIcons(traitRows, 'traits');
await attachIcons(augmentRows, 'augments');

// The reveal page 404s the art of augments that are new in this set. Returning augments already
// have theirs in the live set data, so borrow it by name before a card falls back to a plate.
const live = JSON.parse(await readFile(join(APP, '../../packages/shared/data/tft.json'), 'utf8'));
const liveIcons = new Map();
for (const augment of live.augments) {
  if (augment.icon && !liveIcons.has(augment.name)) liveIcons.set(augment.name, augment.icon);
}
for (const row of augmentRows) row.icon ??= liveIcons.get(row.name) ?? null;

// Riot's official Vietnamese strings only cover what the client has already shipped (set 18 and
// earlier), so reuse them where they are guaranteed to describe the same thing: a name on an exact
// name match, a description only when the English text is identical too — a reworked augment must
// not wear last set's translation.
const byName = (rows, field) => new Map(rows.filter((row) => row[field]).map((row) => [row.name, row[field]]));
const byText = (rows, field) => new Map(rows.filter((row) => row[field]).map((row) => [row.desc, row[field]]));
const viNames = {
  champions: byName(live.champions, 'nameVi'),
  traits: byName(live.traits, 'nameVi'),
  augments: byName(live.augments, 'nameVi'),
};
const viTexts = { traits: byText(live.traits, 'descVi'), augments: byText(live.augments, 'descVi') };
for (const [key, rows] of Object.entries({ champions: championRows, traits: traitRows, augments: augmentRows })) {
  for (const row of rows) {
    row.nameVi = viNames[key].get(row.name) ?? null;
    if (key !== 'champions') row.descVi = viTexts[key].get(row.desc) ?? null;
  }
}

// Self-check: the reveal page carries one card per champion and per trait, so a drop means the
// markup moved and the parse above quietly read the wrong nodes.
const problems = [];
if (championRows.length !== 94) problems.push(`champions: ${championRows.length} != 94`);
// The reveal page lists bands, classes and solo-artist traits together; the count is the source's,
// so a range catches a broken parse without pinning this file to today's roster size.
if (traitRows.length < 45 || traitRows.length > 55) problems.push(`traits: ${traitRows.length} outside 45..55`);
if (augmentRows.length < 300) problems.push(`augments: ${augmentRows.length} < 300`);
for (const augment of augmentRows) {
  if (![1, 2, 3].includes(augment.rarity)) problems.push(`tier for ${augment.name}: ${augment.rarity}`);
}
for (const champion of championRows) {
  if (!Number.isInteger(champion.cost) || champion.cost < 1 || champion.cost > 7) problems.push(`bad cost for ${champion.name}`);
  if (champion.traits.length < 1 || champion.traits.length > 3) problems.push(`traits for ${champion.name}: ${champion.traits.length}`);
  if (!champion.ability.desc) problems.push(`no ability text for ${champion.name}`);
}
// Solo-artist traits put their whole text on the (1) rung, and Seraphine's Rising Star/Superstar
// variants have no carrier icon, so neither an empty desc nor an empty units list is an error.
for (const trait of traitRows) if (!trait.desc && !trait.breakpoints.length) problems.push(`incomplete trait ${trait.name}`);
// Most traits carry a ladder; a markup change that swallows it (the PBE launch did) drops this
// count by half while every card still looks parsed.
const ladders = traitRows.filter((trait) => trait.breakpoints.length).length;
if (ladders < 25) problems.push(`traits with a breakpoint ladder: ${ladders} < 25`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const data = {
  generatedAt: new Date().toISOString(),
  source: { url: SOURCE_URL, fetchedAt: new Date().toISOString() },
  set: { number: 19, ...set },
  traits: traitRows,
  champions: championRows.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name)),
  augments: augmentRows,
};

await writeFile(OUT, `${JSON.stringify(data, null, 2)}\n`);
const cards = [...championRows, ...traitRows, ...augmentRows];
const withArt = cards.filter((row) => row.icon).length;
console.log(
  `${OUT}\n${cards.length} cards · ${withArt} with art (${[...saved.values()].filter(Boolean).length} downloaded) · ${cards.length - withArt} on the default plate`,
);
