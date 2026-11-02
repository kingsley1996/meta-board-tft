import tft from '@tftiq/shared/data/tft.json';
import type { Lang } from './i18n';

// Trait tier palette, values copied from TFTAcademy's stylesheet (`.bronze`,
// `.silver`, `.gold`, `.prismatic`, `.special`). Their style enum is the same
// CommunityDragon numbering we get from the LCU: 1 bronze, 3 silver, 4 legendary
// (their `special`), 5 gold, 6 prismatic.
// `fill` is a CSS background value — prismatic is a gradient, not a colour — so
// anything that needs a *text* colour on our dark panels takes `ink` instead.
export type TraitStyle = { fill: string; edge: string; ink: string };

const BRONZE: TraitStyle = { fill: '#d7977b', edge: '#6f4939', ink: '#d7977b' };
const SILVER: TraitStyle = { fill: '#cccaca', edge: '#858585', ink: '#cccaca' };
const LEGENDARY: TraitStyle = { fill: '#ff9900', edge: '#a36200', ink: '#ff9900' };
const GOLD: TraitStyle = { fill: '#e5a109', edge: '#a27207', ink: '#e5a109' };
const PRISMATIC: TraitStyle = {
  fill: 'conic-gradient(from 180deg,#b5f9b1 -25.61deg,#aea7f8 .63deg,#b9e8bc 27.2deg,#f6fed8 56.21deg,#c7fbf7 83.01deg,#9af0fe 109.35deg,#f5ecff 129.56deg,#f899f8 154.85deg,#b6fce3 181.24deg,#7e93f2 210.86deg,#e1a4fd 244.3deg,#afe6f0 264.6deg,#f3f1c7 287.41deg,#e99f7e 306.52deg,#b5f9b1 334.39deg,#aea7f8 360.63deg) 0 0/100% 100%',
  edge: '#ffffff',
  // No gradient can be a font colour, so the cyan stop stands in for it.
  ink: '#9af0fe',
};

const traitStyleByNumber: Record<number, TraitStyle> = { 1: BRONZE, 3: SILVER, 4: LEGENDARY, 5: GOLD, 6: PRISMATIC };

// The LCU trait tooltips name the style instead of numbering it.
const traitStyleByName: Record<string, number> = { bronze: 1, silver: 3, unique: 4, legendary: 4, gold: 5, prismatic: 6 };

export const traitStyleForNumber = (style: number | null | undefined): TraitStyle => (style == null ? SILVER : (traitStyleByNumber[style] ?? SILVER));

/** Null when the breakpoint has no style yet — the tier has not been reached. */
export const traitStyleForName = (name: string | null | undefined): TraitStyle | null => {
  if (!name) return null;
  const style = traitStyleByName[name];
  return style == null ? null : (traitStyleByNumber[style] ?? null);
};

// Augments reuse the same three tiers, so they read from the same table.
export const augmentRarity: Record<number, { label: { en: string; vi: string }; color: string }> = {
  1: { label: { en: 'Silver', vi: 'Bạc' }, color: SILVER.ink },
  2: { label: { en: 'Gold', vi: 'Vàng' }, color: GOLD.ink },
  3: { label: { en: 'Prismatic', vi: 'Kim Cương' }, color: PRISMATIC.ink },
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

// Champion pages address champions by their stable tft.json slug.
export const championSlugToName: Record<string, string> = Object.fromEntries(tft.champions.map((champion) => [champion.slug, champion.name]));
export const championNameToSlug: Record<string, string> = Object.fromEntries(tft.champions.map((champion) => [champion.name, champion.slug]));

export type ChampionDetail = {
  name: string;
  displayName: string;
  cost: number;
  icon: string | null;
  traits: { key: string; name: string; icon: string | null }[];
  mana: { start: number; max: number } | null;
  ability: { name: string; desc: string; keywords: string[] } | null;
};

export function championDetail(name: string, lang: Lang): ChampionDetail | null {
  const champion = championByName.get(name);
  if (!champion) return null;
  return {
    name,
    displayName: unitName(name, lang),
    cost: champion.cost,
    icon: champion.icon,
    traits: champion.traits.map((trait) => ({ key: trait, name: traitName(trait, lang), icon: traitByName.get(trait)?.icon ?? null })),
    mana: champion.mana,
    ability: champion.ability
      ? {
          name: pick(lang, champion.ability.name, champion.ability.nameVi),
          desc: pick(lang, champion.ability.desc, champion.ability.descVi),
          keywords: pick(lang, champion.ability.keywords ?? [], champion.ability.keywordsVi ?? []),
        }
      : null,
  };
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
