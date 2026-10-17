import tft from './tft.json';
import type { Lang } from './i18n';

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

export const augmentRarity: Record<number, { label: { en: string; vi: string }; color: string }> = {
  1: { label: { en: 'Silver', vi: 'Bạc' }, color: '#c8d2e0' },
  2: { label: { en: 'Gold', vi: 'Vàng' }, color: '#ffd43b' },
  3: { label: { en: 'Prismatic', vi: 'Lăng Kính' }, color: '#7ee0ff' },
};

// Keyword definitions for ability text ("Wound: Reduces healing received.").
export const keywordsFor = (lang: Lang): Record<string, string> => tft.keywords[lang];

type NamedIcon = { name: string; icon: string | null };
type Breakpoint = { minUnits: number; style: string | null; text: string };

const traitByName = new Map(tft.traits.map((trait) => [trait.name, trait]));
const championByName = new Map(tft.champions.map((champion) => [champion.name, champion]));
const itemByName = new Map(tft.items.map((item) => [item.name, item]));
const augmentByName = new Map(tft.augments.map((augment) => [augment.name, augment]));

const iconByName: Record<string, string> = {};
for (const entry of [...tft.champions, ...tft.items, ...tft.augments]) {
  if (entry.icon) iconByName[entry.name] = entry.icon;
}

const pick = <T>(lang: Lang, en: T, vi: T | null | undefined): T => (lang === 'vi' && vi != null && vi !== '' ? vi : en);

// Display-name lookups: data-tip attributes and API payloads always carry the
// English name, so every lookup key stays English and only the output is localized.
export const unitName = (name: string, lang: Lang) => pick(lang, name, championByName.get(name)?.nameVi);
export const unitTraitNames = (name: string, lang: Lang): string[] => {
  const champion = championByName.get(name);
  return pick(lang, champion?.traits ?? [], champion?.traitsVi);
};
export const traitName = (name: string, lang: Lang) => pick(lang, name, traitByName.get(name)?.nameVi);
export const itemName = (name: string, lang: Lang) => pick(lang, name, itemByName.get(name)?.nameVi);
export const augmentName = (name: string, lang: Lang) => pick(lang, name, augmentByName.get(name)?.nameVi);

export function iconFor(name: string): string | null {
  return iconByName[name] ?? null;
}

export type TipData =
  | { kind: 'champion'; name: string; cost: number; traits: { key: string; name: string; icon: string | null }[]; ability: { name: string; desc: string; keywords: string[]; icon: string | null } | null; mana: { start: number; max: number } | null }
  | { kind: 'item'; name: string; desc: string; composition: NamedIcon[] }
  | { kind: 'augment'; name: string; desc: string; rarity: number | null }
  | { kind: 'trait'; name: string; desc: string; icon: string | null; thresholds: number[]; styles: number[]; breakpoints: Breakpoint[] };

export function getTip(kind: string, name: string, lang: Lang): TipData | null {
  if (kind === 'champion') {
    const champion = championByName.get(name);
    if (!champion) return null;
    return {
      kind,
      name: unitName(name, lang),
      cost: champion.cost,
      traits: champion.traits.map((trait) => ({
        key: trait,
        name: traitName(trait, lang),
        icon: traitByName.get(trait)?.icon ?? null,
      })),
      ability: champion.ability
        ? {
            name: pick(lang, champion.ability.name, champion.ability.nameVi),
            desc: pick(lang, champion.ability.desc, champion.ability.descVi),
            keywords: pick(lang, champion.ability.keywords, champion.ability.keywordsVi),
            icon: champion.ability.icon,
          }
        : null,
      mana: champion.mana,
    };
  }
  if (kind === 'item') {
    const item = itemByName.get(name);
    if (!item) return null;
    const componentNames = pick(lang, item.composition, item.compositionVi);
    return {
      kind,
      name: itemName(name, lang),
      desc: pick(lang, item.desc, item.descVi),
      composition: item.composition.map((component, index) => ({
        name: componentNames?.[index] ?? component,
        icon: iconByName[component] ?? null,
      })),
    };
  }
  if (kind === 'augment') {
    const augment = augmentByName.get(name);
    if (!augment) return null;
    return { kind, name: augmentName(name, lang), desc: pick(lang, augment.desc, augment.descVi), rarity: augment.rarity };
  }
  if (kind === 'trait') {
    const trait = traitByName.get(name);
    if (!trait) return null;
    return {
      kind,
      name: traitName(name, lang),
      desc: pick(lang, trait.desc, trait.descVi),
      icon: trait.icon,
      thresholds: trait.thresholds ?? [],
      styles: trait.styles ?? [],
      breakpoints: pick(lang, trait.breakpoints ?? [], trait.breakpointsVi),
    };
  }
  return null;
}
