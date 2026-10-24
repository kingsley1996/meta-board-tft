// Turns the Set 18 comps mirrored from tftflow.com (shared economy data) into the
// site's comp shape so comps that only exist on the source site can be listed
// here too. The site's own comps (apps/api/seed/comps.json) stay authoritative;
// these are added when their slug is free.
import type { CompInput } from '../src/comps.ts';
import { readFileSync } from 'node:fs';
import { sharedDataPath } from '../src/shared-data.ts';

export type EconomyComp = {
  slug: string;
  name: string;
  tier: string | null;
  damageType: string | null;
  strategy: string | null;
  carry: string | null;
  carryCost: number | null;
  board: { apiName: string; name: string; cost: number | null; hexIndex: number }[];
  boardNames: string[];
  openers: string[];
  augmentPriority: string[];
  items: string[];
  augments: string[];
  tips: string[];
  levelCurve: { stage: string; text: string }[];
  url: string;
};

export type KnownNames = {
  champions: Set<string>;
  items: Set<string>;
  augments: Set<string>;
  comps: { slug: string; carry: string | null; units: string[] }[];
};

// tftflow grades S+/S/A/B/C/D, the site S/A/B/C/X.
const TIER: Record<string, string> = { 'S+': 'S', S: 'S', A: 'A', B: 'B', C: 'C', D: 'X' };

// tftflow titles are free-form ("Yunara Executioner Reroll", "Blackthorn Kha'Zix"),
// so translate the champion/trait words and keep everything else as written.
const normName = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]/g, '');
const tftJson = JSON.parse(readFileSync(sharedDataPath('tft.json'), 'utf8')) as {
  champions: { name: string; nameVi?: string | null }[];
  traits: { name: string; nameVi?: string | null }[];
};
const VI_BY_NAME = new Map<string, string>();
for (const entry of [...tftJson.champions, ...tftJson.traits]) {
  if (entry.nameVi) VI_BY_NAME.set(normName(entry.name), entry.nameVi);
}

export function translateCompTitle(title: string): string {
  const emblem = title.match(/^(.*)-Emblem$/i);
  if (emblem) return `Ấn ${translateCompTitle(emblem[1])}`;
  const words = title.split(' ');
  const word = /^[\p{L}\p{N}'’.-]+$/u;
  const out: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    // Both tokens must be words, so separators ("/", "&") never join a lookup.
    const pair =
      word.test(words[index]) && word.test(words[index + 1] ?? '')
        ? VI_BY_NAME.get(normName(`${words[index]} ${words[index + 1]}`))
        : undefined;
    if (pair) {
      out.push(pair);
      index += 1;
    } else {
      out.push(VI_BY_NAME.get(normName(words[index])) ?? words[index]);
    }
  }
  return out.join(' ');
}

const styleFor = (comp: EconomyComp) => {
  if (comp.strategy?.startsWith('Fast')) return 'Fast 8';
  if (/tempo/i.test(comp.name)) return 'Tempo';
  if (/flex/i.test(comp.name)) return 'Flex';
  return 'Reroll';
};

const overlap = (a: string[], b: string[]) => {
  const set = new Set(b);
  const hits = a.filter((name) => set.has(name)).length;
  return a.length ? hits / a.length : 0;
};

// The site and tftflow name the same comp differently ("Zyra Juggernaut" vs
// "Juggernaut Zyra"), so a comp counts as known when it plays the same carry
// on a largely the same board.
const isKnownComp = (comp: EconomyComp, known: KnownNames['comps']) =>
  known.some(
    (site) =>
      site.carry === comp.carry && overlap(comp.boardNames, site.units) >= 0.5
  );

export function buildTftflowComps(
  comps: EconomyComp[],
  known: KnownNames
): { comps: CompInput[]; skipped: { slug: string; reason: string }[] } {
  const built: CompInput[] = [];
  const skipped: { slug: string; reason: string }[] = [];

  for (const comp of comps) {
    if (known.comps.some((site) => site.slug === comp.slug)) continue;
    if (isKnownComp(comp, known.comps)) {
      skipped.push({ slug: comp.slug, reason: 'the site already lists this comp' });
      continue;
    }

    // The site lists every champion once, so double-up boards lose the repeat.
    const seen = new Set<string>();
    const board = comp.board.filter((unit) => {
      if (!known.champions.has(unit.name) || seen.has(unit.name)) return false;
      seen.add(unit.name);
      return true;
    });
    const carry = comp.carry && board.some((unit) => unit.name === comp.carry) ? comp.carry : null;
    const carryItems = comp.items.filter((item) => known.items.has(item)).slice(0, 3);
    const augments = comp.augments.filter((augment) => known.augments.has(augment)).slice(0, 8);
    const early = comp.openers.filter((name) => known.champions.has(name)).slice(0, 4);

    if (board.length < 3) {
      skipped.push({ slug: comp.slug, reason: 'fewer than 3 known champions' });
      continue;
    }
    if (!carry) {
      skipped.push({ slug: comp.slug, reason: 'carry champion unknown' });
      continue;
    }
    if (!carryItems.length) {
      skipped.push({ slug: comp.slug, reason: 'no known carry items' });
      continue;
    }
    if (!augments.length) {
      skipped.push({ slug: comp.slug, reason: 'no known augments' });
      continue;
    }

    const units = board.map((unit) => {
      const isCarry = unit.name === carry;
      return {
        name: unit.name,
        row: Math.floor(unit.hexIndex / 7),
        col: unit.hexIndex % 7,
        stars: isCarry ? 2 : null,
        items: isCarry ? carryItems : [],
      };
    });

    // Fall back to the cheapest units on the board when the opener lists no
    // champion the site knows.
    const earlyUnits = early.length ? early : board.filter((unit) => unit.cost === 1).slice(0, 3).map((unit) => unit.name);
    if (!earlyUnits.length) {
      skipped.push({ slug: comp.slug, reason: 'no early units' });
      continue;
    }

    built.push({
      slug: comp.slug,
      title: comp.name,
      titleVi: translateCompTitle(comp.name),
      tier: TIER[comp.tier ?? 'C'] ?? 'C',
      style: styleFor(comp),
      difficulty: 2,
      trend: null,
      playstyle: `${comp.strategy} · ${carry} carry`,
      playstyleVi: `${comp.strategy} · chủ lực ${carry}`,
      units,
      early: earlyUnits,
      carry,
      items: carryItems,
      augments,
      tips: comp.tips.join(' '),
      tipsVi: null,
      stages: comp.levelCurve.slice(0, 3).map((entry) => ({ stage: `Stage ${entry.stage}`, text: entry.text, textVi: null })),
      alt: [],
      augmentTypes: comp.augmentPriority.length ? comp.augmentPriority : ['ECON', 'ITEMS', 'COMBAT'],
      matchups: [],
    });
  }

  return { comps: built, skipped };
}
