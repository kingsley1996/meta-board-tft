import tft from './tft.json';

// Trait tier styles from CommunityDragon: 1 bronze, 3 silver, 4 unique, 5 gold, 6 prismatic.
export const traitStyleColors: Record<number, string> = { 1: '#c9a27a', 3: '#c8d2e0', 4: '#d0bfff', 5: '#ffd43b', 6: '#7ee0ff' };

// The LCU trait tooltips name the style instead of numbering it.
export const traitStyleColorByName: Record<string, string> = {
  bronze: '#c9a27a',
  silver: '#c8d2e0',
  gold: '#ffd43b',
  prismatic: '#7ee0ff',
  unique: '#d0bfff',
};

// Keyword definitions for ability text ("Wound: Reduces healing received.").
export const keywordDefs: Record<string, string> = tft.keywords;

export const augmentRarity: Record<number, { label: string; color: string }> = {
  1: { label: 'Silver', color: '#c8d2e0' },
  2: { label: 'Gold', color: '#ffd43b' },
  3: { label: 'Prismatic', color: '#7ee0ff' },
};

type NamedIcon = { name: string; icon: string | null };

const traitByName = new Map(tft.traits.map((trait) => [trait.name, trait]));
const championByName = new Map(tft.champions.map((champion) => [champion.name, champion]));
const itemByName = new Map(tft.items.map((item) => [item.name, item]));
const augmentByName = new Map(tft.augments.map((augment) => [augment.name, augment]));

const iconByName: Record<string, string> = {};
for (const entry of [...tft.champions, ...tft.items, ...tft.augments]) {
  if (entry.icon) iconByName[entry.name] = entry.icon;
}

type Breakpoint = { minUnits: number; style: string | null; text: string };

export type TipData =
  | { kind: 'champion'; name: string; cost: number; traits: NamedIcon[]; ability: { name: string; desc: string; keywords: string[]; icon: string | null } | null; mana: { start: number; max: number } | null }
  | { kind: 'item'; name: string; desc: string; composition: NamedIcon[] }
  | { kind: 'augment'; name: string; desc: string; rarity: number | null }
  | { kind: 'trait'; name: string; desc: string; icon: string | null; thresholds: number[]; styles: number[]; breakpoints: Breakpoint[] };

export function iconFor(name: string): string | null {
  return iconByName[name] ?? null;
}

export function getTip(kind: string, name: string): TipData | null {
  if (kind === 'champion') {
    const champion = championByName.get(name);
    if (!champion) return null;
    return {
      kind,
      name,
      cost: champion.cost,
      traits: champion.traits.map((traitName) => ({ name: traitName, icon: traitByName.get(traitName)?.icon ?? null })),
      ability: champion.ability,
      mana: champion.mana,
    };
  }
  if (kind === 'item') {
    const item = itemByName.get(name);
    if (!item) return null;
    return { kind, name, desc: item.desc, composition: item.composition.map((part) => ({ name: part, icon: iconByName[part] ?? null })) };
  }
  if (kind === 'augment') {
    const augment = augmentByName.get(name);
    if (!augment) return null;
    return { kind, name, desc: augment.desc, rarity: augment.rarity };
  }
  if (kind === 'trait') {
    const trait = traitByName.get(name);
    if (!trait) return null;
    return { kind, name, desc: trait.desc, icon: trait.icon, thresholds: trait.thresholds ?? [], styles: trait.styles ?? [], breakpoints: trait.breakpoints ?? [] };
  }
  return null;
}
