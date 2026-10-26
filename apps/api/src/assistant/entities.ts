import { clampLimit, entityId, type CatalogEntity, type EntityId, type EntityMatch, type GameEntityType, type Lang } from './contracts.ts';
import { ENTITY_ALIAS_GROUPS } from './entity-aliases.ts';

export type { EntityMatch };
import type { StaticGameData } from './static-game-data.ts';

export type DbChampion = {
  api_name: string;
  name: string;
  cost: number;
  traits: string[] | null;
  icon: string | null;
};

export type DbTrait = {
  api_name: string;
  name: string;
  description: string;
  thresholds: number[] | null;
  styles: number[] | null;
  icon: string | null;
};

export type DbItem = {
  api_name: string;
  name: string;
  description: string;
  composition: string[] | null;
  icon: string | null;
};

export type DbAugment = {
  api_name: string;
  name: string;
  description: string;
  rarity: number | null;
  icon: string | null;
};

export type DbRows = {
  champions: DbChampion[];
  traits: DbTrait[];
  items: DbItem[];
  augments: DbAugment[];
};

export type Catalog = {
  entities: CatalogEntity[];
  byId: Map<string, CatalogEntity>;
  byName: Map<string, CatalogEntity>;
  aliases: Map<string, Set<string>>;
  aliasesSpaced: Map<string, Set<string>>;
  compAliases: Map<string, string[]>;
  components: Set<string>;
};

export type CustomEntityAlias = { alias: string; entityType: string; entityId: string };

export function localizedName(catalog: Catalog, name: string, lang: Lang): string {
  return lang === 'vi' ? (catalog.byName.get(name)?.nameVi ?? name) : name;
}

// Translated prose (comp tips, stage notes) keeps canonical entity names in
// English ("Nâng Cấp Dark Ritual"), while the catalog knows the Vietnamese
// name. Replace those mentions so a vi answer says "Tà Thuật", not "Dark
// Ritual". Longest names replace first so shorter names never corrupt longer
// ones ("Radiant Edge of Night" before "Edge of Night"); short single-word
// names are skipped as too collision-prone.
const localizedNamesCache = new WeakMap<Catalog, [string, string][]>();

function localizedReplacements(catalog: Catalog): [string, string][] {
  let pairs = localizedNamesCache.get(catalog);
  if (!pairs) {
    pairs = [...catalog.byName.entries()]
      .filter(([name, entity]) => entity.nameVi && entity.nameVi !== name && (name.includes(' ') || name.length >= 5))
      .sort((a, b) => b[0].length - a[0].length)
      .map(([name, entity]) => [name, entity.nameVi as string]);
    localizedNamesCache.set(catalog, pairs);
  }
  return pairs;
}

export function localizeEntityNames(text: string, catalog: Catalog, lang: Lang): string {
  if (lang !== 'vi' || !text) return text;
  let result = text;
  for (const [name, nameVi] of localizedReplacements(catalog)) {
    if (result.includes(name)) result = result.replaceAll(name, nameVi);
  }
  return result;
}

const COMPONENT_ALIASES: Record<string, string> = {
  bf: 'B.F. Sword',
  bfs: 'B.F. Sword',
  sword: 'B.F. Sword',
  bow: 'Recurve Bow',
  rod: 'Needlessly Large Rod',
  tear: 'Tear of the Goddess',
  cloak: 'Negatron Cloak',
  vest: 'Chain Vest',
  belt: "Giant's Belt",
  gloves: 'Sparring Gloves',
  spat: 'Spatula',
  spatula: 'Spatula',
  pan: 'Frying Pan',
};

export function normalize(value: string): string {
  return normalizeSpaced(value).replace(/ /g, '');
}

export function normalizeSpaced(value: string): string {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildCatalog(rows: DbRows, staticData: StaticGameData, customAliases: CustomEntityAlias[] = []): Catalog {
  const entities: CatalogEntity[] = [];
  const byId = new Map<string, CatalogEntity>();
  const byName = new Map<string, CatalogEntity>();
  const aliases = new Map<string, Set<string>>();
  const aliasesSpaced = new Map<string, Set<string>>();
  const components = new Set(
    staticData.items.filter((item) => (item.composition ?? []).length === 0).map((item) => item.name)
  );

  const add = (entity: CatalogEntity) => {
    if (byId.has(entity.id)) return;
    entities.push(entity);
    byId.set(entity.id, entity);
    if (!byName.has(entity.name)) byName.set(entity.name, entity);
  };

  const staticChampionByApi = new Map(staticData.champions.map((champion) => [champion.apiName, champion]));
  const staticChampionByName = new Map(staticData.champions.map((champion) => [normalize(champion.name), champion]));
  const staticTraitByApi = new Map(staticData.traits.map((trait) => [trait.apiName, trait]));
  const staticTraitByName = new Map(staticData.traits.map((trait) => [normalize(trait.name), trait]));
  const staticItemByApi = new Map(staticData.items.map((item) => [item.apiName, item]));
  const staticItemByName = new Map(staticData.items.map((item) => [normalize(item.name), item]));
  const staticAugmentByApi = new Map(staticData.augments.map((augment) => [augment.apiName, augment]));
  const staticAugmentByName = new Map(staticData.augments.map((augment) => [normalize(augment.name), augment]));

  for (const row of rows.champions) {
    const extra = staticChampionByApi.get(row.api_name) ?? staticChampionByName.get(normalize(row.name));
    add({
      id: entityId('champion', row.api_name),
      type: 'champion',
      apiName: row.api_name,
      slug: extra?.slug ?? null,
      name: row.name,
      nameVi: extra?.nameVi ?? null,
      icon: row.icon,
      cost: row.cost,
      traits: row.traits ?? [],
      traitsVi: extra?.traitsVi ?? [],
      mana: extra?.mana ?? null,
      ability: extra?.ability
        ? {
            name: extra.ability.name,
            desc: extra.ability.desc,
            keywords: extra.ability.keywords ?? [],
            nameVi: extra.ability.nameVi ?? null,
            descVi: extra.ability.descVi ?? null,
            keywordsVi: extra.ability.keywordsVi ?? [],
            icon: extra.ability.icon ?? null,
          }
        : null,
      description: null,
      descriptionVi: null,
      composition: [],
      compositionVi: [],
      rarity: null,
      thresholds: [],
      styles: [],
      breakpoints: [],
      breakpointsVi: [],
    });
  }

  for (const row of rows.traits) {
    const extra = staticTraitByApi.get(row.api_name) ?? staticTraitByName.get(normalize(row.name));
    add({
      id: entityId('trait', row.api_name),
      type: 'trait',
      apiName: row.api_name,
      slug: extra?.slug ?? null,
      name: row.name,
      nameVi: extra?.nameVi ?? null,
      icon: row.icon,
      cost: null,
      traits: [],
      traitsVi: [],
      mana: null,
      ability: null,
      description: extra?.desc || row.description,
      descriptionVi: extra?.descVi ?? null,
      composition: [],
      compositionVi: [],
      rarity: null,
      thresholds: row.thresholds ?? [],
      styles: row.styles ?? [],
      breakpoints: extra?.breakpoints ?? [],
      breakpointsVi: extra?.breakpointsVi ?? [],
    });
  }

  for (const row of rows.items) {
    const extra = staticItemByApi.get(row.api_name) ?? staticItemByName.get(normalize(row.name));
    add({
      id: entityId('item', row.api_name),
      type: 'item',
      apiName: row.api_name,
      slug: extra?.slug ?? null,
      name: row.name,
      nameVi: extra?.nameVi ?? null,
      icon: row.icon,
      cost: null,
      traits: [],
      traitsVi: [],
      mana: null,
      ability: null,
      description: extra?.desc || row.description,
      descriptionVi: extra?.descVi ?? null,
      composition: row.composition ?? [],
      compositionVi: extra?.compositionVi ?? [],
      rarity: null,
      thresholds: [],
      styles: [],
      breakpoints: [],
      breakpointsVi: [],
    });
  }

  for (const row of rows.augments) {
    const extra = staticAugmentByApi.get(row.api_name) ?? staticAugmentByName.get(normalize(row.name));
    add({
      id: entityId('augment', row.api_name),
      type: 'augment',
      apiName: row.api_name,
      slug: extra?.slug ?? null,
      name: row.name,
      nameVi: extra?.nameVi ?? null,
      icon: row.icon,
      cost: null,
      traits: [],
      traitsVi: [],
      mana: null,
      ability: null,
      description: extra?.desc || row.description,
      descriptionVi: extra?.descVi ?? null,
      composition: [],
      compositionVi: [],
      rarity: row.rarity ?? extra?.rarity ?? null,
      thresholds: [],
      styles: [],
      breakpoints: [],
      breakpointsVi: [],
    });
  }

  const addAlias = (alias: string, entity: CatalogEntity) => {
    const key = normalize(alias);
    if (!key) return;
    const ids = aliases.get(key) ?? new Set<string>();
    ids.add(entity.id);
    aliases.set(key, ids);

    const spaced = normalizeSpaced(alias);
    if (spaced.length < 2) return;
    const spacedIds = aliasesSpaced.get(spaced) ?? new Set<string>();
    spacedIds.add(entity.id);
    aliasesSpaced.set(spaced, spacedIds);
  };

  for (const entity of entities) {
    addAlias(entity.name, entity);
    if (entity.nameVi) addAlias(entity.nameVi, entity);
    if (entity.apiName) {
      addAlias(entity.apiName, entity);
      addAlias(entity.apiName.replace(/^TFT\d*_Augment_/i, ''), entity);
      addAlias(entity.apiName.replace(/^(TFT\d*_|DA_\d+_|DA_)/i, ''), entity);
    }
    if (entity.slug) addAlias(entity.slug, entity);
  }

  for (const group of ENTITY_ALIAS_GROUPS) {
    const entity = byName.get(group.name);
    if (entity?.type !== group.type) continue;
    for (const alias of group.aliases) addAlias(alias, entity);
  }
  for (const [alias, name] of Object.entries(COMPONENT_ALIASES)) {
    const entity = byName.get(name);
    if (entity) addAlias(alias, entity);
  }
  for (const group of ENTITY_ALIAS_GROUPS) {
    if (group.type !== 'trait') continue;
    const trait = byName.get(group.name);
    if (trait?.type !== 'trait') continue;
    for (const alias of group.aliases) {
      const emblem = byName.get(`${group.name} Emblem`);
      if (emblem?.type === 'item') addAlias(`${alias} emblem`, emblem);
    }
  }

  const compAliases = new Map<string, string[]>();
  for (const entry of customAliases) {
    if (entry.entityType === 'comp') {
      const slug = entry.entityId.startsWith('comp:') ? entry.entityId.slice('comp:'.length) : '';
      if (slug) compAliases.set(slug, [...(compAliases.get(slug) ?? []), entry.alias]);
      continue;
    }
    const entity = byId.get(entry.entityId);
    if (entity?.type === entry.entityType) addAlias(entry.alias, entity);
  }

  return { entities, byId, byName, aliases, aliasesSpaced, compAliases, components };
}

export function getCatalogEntity(catalog: Catalog, id: EntityId | string): CatalogEntity | null {
  return catalog.byId.get(id) ?? null;
}

export function grantedTrait(catalog: Catalog, entity: CatalogEntity): CatalogEntity | null {
  if (entity.type !== 'item' || !entity.name.endsWith(' Emblem')) return null;
  const trait = catalog.byName.get(entity.name.slice(0, -' Emblem'.length).trim());
  return trait?.type === 'trait' ? trait : null;
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

export function searchCatalog(
  catalog: Catalog,
  query: string,
  type?: GameEntityType | null,
  limit = 8
): EntityMatch[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const aliasIds = catalog.aliases.get(normalized);
  const matches: EntityMatch[] = [];

  for (const entity of catalog.entities) {
    if (type && entity.type !== type) continue;
    const names = [entity.name, entity.nameVi, entity.apiName, entity.slug].filter(
      (name): name is string => Boolean(name)
    );
    let score = 0;
    if (entity.id === query) score = 120;
    else if (names.some((name) => normalize(name) === normalized)) score = 100;
    else if (aliasIds?.has(entity.id)) score = 90;
    else if (names.some((name) => normalize(name).startsWith(normalized))) score = 80;
    else if (names.some((name) => normalize(name).includes(normalized))) score = 60;
    if (score > 0) matches.push({ entity, score });
  }

  if (!matches.length && normalized.length >= 5) {
    const fuzzy = new Map<string, EntityMatch>();
    for (const entity of catalog.entities) {
      if (type && entity.type !== type) continue;
      const names = [entity.name, entity.nameVi, entity.apiName, entity.slug].filter(
        (name): name is string => Boolean(name)
      );
      if (names.some((name) => editDistance(normalized, normalize(name)) <= 2)) {
        fuzzy.set(entity.id, { entity, score: 70 });
      }
    }
    if (fuzzy.size === 1) {
      const only = [...fuzzy.values()][0];
      only.score = 80;
    }
    matches.push(...fuzzy.values());
  }

  matches.sort((a, b) => b.score - a.score || a.entity.name.localeCompare(b.entity.name));
  return matches.slice(0, clampLimit(limit));
}

export function pickEntityMatch(matches: EntityMatch[]): { entity: CatalogEntity | null; ambiguous: EntityMatch[] } {
  if (!matches.length) return { entity: null, ambiguous: [] };
  const top = matches[0];
  const tied = matches.filter((match) => match.score === top.score);
  if (top.score >= 80 && tied.length === 1) return { entity: top.entity, ambiguous: [] };
  return { entity: null, ambiguous: matches.slice(0, 5) };
}

// Typo/STT fallback: when no alias matches exactly, slide 1–3 token windows
// over the normalized text and match them against the alias index with a
// bounded edit distance (Vietnamese STT errors are typically 1–2 chars).
// Only an unambiguous best entity is returned — competing candidates stay
// unresolved so the clarification paths keep working.
export function findFuzzyEntityMentions(catalog: Catalog, text: string, limit = 4): EntityMatch[] {
  const spaced = normalizeSpaced(text);
  if (!spaced) return [];
  const tokens = spaced.split(' ').filter(Boolean);
  if (tokens.length > 24) return [];
  const candidates = new Map<string, { entity: CatalogEntity; window: string; distance: number }>();

  for (let size = 1; size <= 3; size += 1) {
    for (let start = 0; start + size <= tokens.length; start += 1) {
      const window = tokens.slice(start, start + size).join(' ');
      if (window.length < 4) continue;
      for (const [alias, ids] of catalog.aliases) {
        if (Math.abs(alias.length - window.length) > 2) continue;
        const distance = editDistance(window, alias);
        const allowed = alias.length >= 8 ? 2 : 1;
        if (distance > allowed) continue;
        for (const id of ids) {
          const entity = catalog.byId.get(id);
          if (!entity) continue;
          const existing = candidates.get(id);
          if (!existing || distance < existing.distance || (distance === existing.distance && window.length > existing.window.length)) {
            candidates.set(id, { entity, window, distance });
          }
        }
      }
    }
  }
  if (!candidates.size) return [];

  const best = [...candidates.values()].sort(
    (a, b) => a.distance - b.distance || b.window.length - a.window.length || a.entity.name.localeCompare(b.entity.name)
  );
  const top = best[0];
  // A second entity at the same distance means the typo is ambiguous — do not
  // guess between them.
  const competing = best.filter(
    (entry) => entry.entity.id !== top.entity.id && entry.distance === top.distance
  );
  if (competing.length) return [];

  return [{ entity: top.entity, score: 60, matchedText: top.window }];
}

export function findEntityMentions(catalog: Catalog, text: string, limit = 10): EntityMatch[] {
  const spaced = ` ${normalizeSpaced(text)} `;
  if (!spaced.trim()) return [];
  const found = new Map<string, { entity: CatalogEntity; start: number; length: number }>();

  for (const [alias, ids] of catalog.aliasesSpaced) {
    const index = spaced.indexOf(` ${alias} `);
    if (index < 0) continue;
    const start = index + 1;
    for (const id of ids) {
      const entity = catalog.byId.get(id);
      if (!entity) continue;
      const existing = found.get(id);
      if (!existing || start < existing.start || (start === existing.start && alias.length > existing.length)) {
        found.set(id, { entity, start, length: alias.length });
      }
    }
  }

  const all = [...found.values()];
  return all
    .filter(
      (match) =>
        !all.some(
          (other) =>
            other !== match &&
            other.length > match.length &&
            other.start <= match.start &&
            other.start + other.length >= match.start + match.length
        )
    )
    .sort((a, b) => a.start - b.start || b.length - a.length || a.entity.name.localeCompare(b.entity.name))
    .slice(0, clampLimit(limit))
    .map(({ entity }) => ({ entity, score: 100 }));
}
