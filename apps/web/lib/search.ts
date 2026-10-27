import tft from '@metaboard/shared/data/tft.json';
import meta from '@metaboard/shared/data/meta.json';
import { messages } from './messages';
import type { Lang } from './i18n';
import { augmentName, augmentRarity, championNameToSlug, itemName, traitName, unitName, unitTraitNames } from './tips';

export type SearchKind = 'champion' | 'item' | 'augment' | 'trait' | 'comp';

export type SearchResult = {
  id: string;
  kind: SearchKind;
  name: string;
  subtitle: string;
  icon: string | null;
  href: string;
};

type Entry = SearchResult & { terms: string };

const kindOrder: Record<SearchKind, number> = { champion: 0, item: 1, augment: 2, trait: 3, comp: 4 };

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const augmentByName = new Map<string, (typeof tft.augments)[number]>();
for (const augment of tft.augments) {
  const current = augmentByName.get(augment.name);
  if (!current || (augment.rarity ?? 0) > (current.rarity ?? 0)) augmentByName.set(augment.name, augment);
}

const championIcon = (name: string) => tft.champions.find((champion) => champion.name === name)?.icon ?? null;

function buildIndex(lang: Lang): Entry[] {
  const t = messages[lang];
  const entries: Entry[] = [];

  for (const champion of tft.champions) {
    const name = unitName(champion.name, lang);
    const traits = [...champion.traits, ...(champion.traitsVi ?? [])];
    entries.push({
      id: `champion:${champion.slug}`,
      kind: 'champion',
      name,
      subtitle: `${champion.cost} ${t.champion.cost}`,
      icon: champion.icon,
      href: `/${lang}/champions/${championNameToSlug[champion.name]}`,
      terms: normalize([name, champion.name, ...traits].join(' ')),
    });
  }

  for (const item of tft.items) {
    const name = itemName(item.name, lang);
    const category =
      item.category === 'radiant'
        ? t.itemsDb.radiant
        : item.category === 'artifact'
          ? t.itemsDb.ornn
          : item.category === 'emblem'
            ? t.itemsDb.emblems
            : item.category === 'completed'
              ? t.itemsDb.completed
              : t.itemsDb.components;
    entries.push({
      id: `item:${item.slug}`,
      kind: 'item',
      name,
      subtitle: category,
      icon: item.icon,
      href: `/${lang}/items/${item.slug}`,
      terms: normalize([name, item.name, category, item.category].join(' ')),
    });
  }

  for (const augment of augmentByName.values()) {
    const name = augmentName(augment.name, lang);
    entries.push({
      id: `augment:${augment.slug}`,
      kind: 'augment',
      name,
      subtitle: augment.rarity ? augmentRarity[augment.rarity].label[lang] : '',
      icon: augment.icon,
      href: `/${lang}/augments/${augment.slug}`,
      terms: normalize([name, augment.name, augment.rarity ? augmentRarity[augment.rarity].label[lang] : ''].join(' ')),
    });
  }

  for (const trait of tft.traits) {
    const name = traitName(trait.name, lang);
    entries.push({
      id: `trait:${trait.slug}`,
      kind: 'trait',
      name,
      subtitle: '',
      icon: trait.icon,
      href: `/${lang}/traits/${trait.slug}`,
      terms: normalize([name, trait.name].join(' ')),
    });
  }

  for (const comp of meta.comps) {
    const title = lang === 'vi' ? comp.titleVi ?? comp.title : comp.title;
    entries.push({
      id: `comp:${comp.slug}`,
      kind: 'comp',
      name: title,
      subtitle: `${comp.tier} · ${comp.style}`,
      icon: championIcon(comp.carry),
      href: `/${lang}/tierlist/comps/${comp.slug}`,
      terms: normalize([title, comp.title, comp.playstyle, comp.playstyleVi ?? '', ...[...comp.units.map((unit) => unit.name), comp.carry].flatMap((name) => [name, unitName(name, lang), ...unitTraitNames(name, lang)])].join(' ')),
    });
  }

  return entries;
}

const indexes = new Map<Lang, Entry[]>();

function score(entry: Entry, query: string): number {
  const names = normalize(entry.name);
  if (names === query) return 0;
  if (names.startsWith(query)) return 1;
  if (names.split(' ').some((word) => word.startsWith(query))) return 2;
  if (names.includes(query)) return 3;
  return entry.terms.includes(query) ? 4 : 9;
}

export function search(lang: Lang, rawQuery: string): SearchResult[] {
  const query = normalize(rawQuery);
  if (!query) return [];
  const index = indexes.get(lang) ?? buildIndex(lang);
  indexes.set(lang, index);
  return index
    .map((entry) => ({ entry, score: score(entry, query) }))
    .filter(({ score }) => score < 9)
    .sort((a, b) => a.score - b.score || kindOrder[a.entry.kind] - kindOrder[b.entry.kind] || a.entry.name.localeCompare(b.entry.name, lang))
    .slice(0, 18)
    .map(({ entry: { terms: _terms, ...result } }) => result);
}
