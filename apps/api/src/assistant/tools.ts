import { getMeta, pool } from '../db.ts';
import { listComps } from '../comps.ts';
import {
  clampLimit,
  entityId,
  parseEntityId,
  type CatalogEntity,
  type CompComparison,
  type CompData,
  type CompSummary,
  type EntityId,
  type EntityMatch,
  type GameEntityType,
  type Lang,
  type RankedComp,
  type RankingQuery,
} from './contracts.ts';
import { buildCatalog, normalize, searchCatalog, type Catalog, type DbRows } from './entities.ts';
import { rankComps } from './ranking.ts';
import { loadStaticGameData } from './static-game-data.ts';
import { ensureEntityAliasTable, listEntityAliases } from './entity-alias-store.ts';

export async function loadCatalog(): Promise<Catalog> {
  await ensureEntityAliasTable();
  const [champions, traits, items, augments, staticData] = await Promise.all([
    pool.query('SELECT api_name, name, cost, traits, icon FROM champions'),
    pool.query('SELECT api_name, name, description, thresholds, styles, icon FROM traits'),
    pool.query('SELECT api_name, name, description, composition, icon FROM items'),
    pool.query('SELECT api_name, name, description, rarity, icon FROM augments'),
    loadStaticGameData(),
  ]);
  const customAliases = await listEntityAliases();

  return buildCatalog(
    {
      champions: champions.rows,
      traits: traits.rows,
      items: items.rows,
      augments: augments.rows,
    } as DbRows,
    staticData,
    customAliases
  );
}

export async function getActiveSetAndPatch(): Promise<{ setId: string; patch: string; setName: string }> {
  const meta = await getMeta();
  return {
    setId: meta.set_number ?? '',
    patch: meta.patch ?? '',
    setName: meta.set_name ?? '',
  };
}

export async function searchEntities(
  query: string,
  type: GameEntityType | null = null,
  limit = 8
): Promise<EntityMatch[]> {
  const catalog = await loadCatalog();
  return searchCatalog(catalog, query, type, clampLimit(limit));
}

export async function getEntity(id: EntityId | string, lang: Lang = 'en'): Promise<CatalogEntity | CompData | null> {
  const parsed = parseEntityId(id);
  if (!parsed) return null;
  if (parsed.type === 'comp') return getComp(parsed.key, lang);
  const catalog = await loadCatalog();
  return catalog.byId.get(id) ?? null;
}

export async function searchComps(
  query: string,
  filters: { tier?: string | null; style?: string | null } = {},
  limit = 8
): Promise<CompSummary[]> {
  const normalized = normalize(query);
  const comps = (await listComps(undefined, 'en')) as CompData[];
  return comps
    .filter((comp) => !filters.tier || comp.tier === filters.tier)
    .filter((comp) => !filters.style || comp.style === filters.style)
    .filter(
      (comp) =>
        !normalized ||
        normalize(comp.title).includes(normalized) ||
        normalize(comp.slug).includes(normalized) ||
        comp.units.some((unit) => normalize(unit.name).includes(normalized)) ||
        comp.traits.some((trait) => normalize(trait.name).includes(normalized))
    )
    .slice(0, clampLimit(limit))
    .map((comp) => ({
      compId: entityId('comp', comp.slug),
      slug: comp.slug,
      title: comp.title,
      tier: comp.tier,
      style: comp.style,
      difficulty: comp.difficulty,
      carry: comp.carry.name,
      units: comp.units.map((unit) => unit.name),
      traits: comp.traits.map((trait) => trait.name),
    }));
}

export async function getComp(slug: string, lang: Lang = 'en'): Promise<CompData | null> {
  const [comp] = (await listComps(slug, lang)) as CompData[];
  return comp ?? null;
}

export async function findCompsByEntities(
  query: RankingQuery,
  lang: Lang = 'en'
): Promise<{ candidates: RankedComp[]; unresolved: EntityId[] }> {
  const [catalog, comps] = await Promise.all([loadCatalog(), listComps(undefined, lang) as Promise<CompData[]>]);
  const allIds = [...query.championIds, ...query.itemIds, ...query.augmentIds];
  const unresolved = allIds.filter((id) => !catalog.byId.has(id));
  const candidates = rankComps(comps, query, catalog).slice(0, 5);
  return { candidates, unresolved: [...new Set(unresolved)] };
}

export async function compareComps(slugs: string[], lang: Lang = 'en'): Promise<CompComparison | null> {
  const comps = (await Promise.all(slugs.map((slug) => getComp(slug, lang)))).filter(
    (comp): comp is CompData => comp !== null
  );
  if (comps.length < 2) return null;

  const intersect = (sets: Set<string>[]) => [...sets[0]].filter((value) => sets.every((set) => set.has(value)));
  const unitSets = comps.map((comp) => new Set(comp.units.map((unit) => unit.name)));
  const itemSets = comps.map((comp) => new Set(comp.items.map((item) => item.name)));
  const augmentSets = comps.map((comp) => new Set(comp.augments.map((augment) => augment.name)));

  return {
    comps,
    commonUnits: intersect(unitSets),
    commonItems: intersect(itemSets),
    commonAugments: intersect(augmentSets),
    differences: comps.map((comp) => {
      const otherUnits = new Set(comps.filter((other) => other !== comp).flatMap((other) => other.units.map((unit) => unit.name)));
      const otherItems = new Set(comps.filter((other) => other !== comp).flatMap((other) => other.items.map((item) => item.name)));
      const otherAugments = new Set(
        comps.filter((other) => other !== comp).flatMap((other) => other.augments.map((augment) => augment.name))
      );
      return {
        slug: comp.slug,
        tier: comp.tier,
        style: comp.style,
        difficulty: comp.difficulty,
        uniqueUnits: comp.units.map((unit) => unit.name).filter((name) => !otherUnits.has(name)),
        uniqueItems: comp.items.map((item) => item.name).filter((name) => !otherItems.has(name)),
        uniqueAugments: comp.augments.map((augment) => augment.name).filter((name) => !otherAugments.has(name)),
      };
    }),
  };
}
