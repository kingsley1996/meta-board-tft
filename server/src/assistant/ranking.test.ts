import test from 'node:test';
import assert from 'node:assert/strict';
import { entityId, type CompData, type CompUnit, type RankingQuery } from './contracts.ts';
import { buildCatalog, type Catalog, type DbRows } from './entities.ts';
import { rankComps } from './ranking.ts';
import { loadStaticGameData } from './static-game-data.ts';

function row<T extends { apiName: string; name: string }>(data: T[], name: string): T {
  const found = data.find((entry) => entry.name === name);
  if (!found) throw new Error(`missing ${name}`);
  return found;
}

async function fixture(): Promise<Catalog> {
  const data = await loadStaticGameData();
  const champion = (name: string) => {
    const found = row(data.champions, name);
    return { api_name: found.apiName, name: found.name, cost: found.cost, traits: found.traits ?? [], icon: null };
  };
  const item = (name: string) => {
    const found = row(data.items, name);
    return { api_name: found.apiName, name: found.name, description: found.desc ?? '', composition: found.composition ?? [], icon: null };
  };
  const augment = (name: string) => {
    const found = row(data.augments, name);
    return { api_name: found.apiName, name: found.name, description: found.desc ?? '', rarity: found.rarity ?? null, icon: null };
  };
  const rows: DbRows = {
    champions: [champion('Ahri'), champion('Taric'), champion('Gromp')],
    traits: [],
    items: [
      item('B.F. Sword'),
      item('Recurve Bow'),
      item('Needlessly Large Rod'),
      item("Guinsoo's Rageblade"),
      item('Giant Slayer'),
      item('Blue Buff'),
    ],
    augments: [augment('Cursed Crown')],
  };
  return buildCatalog(rows, data);
}

function named(catalog: Catalog, name: string) {
  const entity = catalog.byName.get(name);
  if (!entity) throw new Error(`missing entity ${name}`);
  return { name: entity.name, icon: entity.icon };
}

function unit(catalog: Catalog, name: string, items: string[] = []): CompUnit {
  const entity = catalog.byName.get(name);
  if (!entity) throw new Error(`missing champion ${name}`);
  return {
    name,
    cost: entity.cost ?? 1,
    icon: entity.icon,
    row: null,
    col: null,
    stars: null,
    items: items.map((item) => named(catalog, item)),
  };
}

function comp(catalog: Catalog, overrides: Partial<CompData> = {}): CompData {
  return {
    slug: 'test-comp',
    title: 'Test Comp',
    tier: 'S',
    style: 'Fast 8',
    difficulty: 2,
    trend: null,
    votes: 0,
    views: 0,
    playstyle: 'Test',
    units: [unit(catalog, 'Ahri'), unit(catalog, 'Taric')],
    traits: [],
    early: [unit(catalog, 'Gromp')],
    carry: unit(catalog, 'Ahri'),
    items: [named(catalog, "Guinsoo's Rageblade")],
    augments: [named(catalog, 'Cursed Crown')],
    tips: '',
    stages: [],
    alt: [],
    augmentTypes: [],
    matchups: [],
    ...overrides,
  };
}

function id(catalog: Catalog, name: string) {
  const entity = catalog.byName.get(name);
  if (!entity) throw new Error(`missing entity ${name}`);
  return entity.id;
}

function query(overrides: Partial<RankingQuery> = {}): RankingQuery {
  return { championIds: [], itemIds: [], augmentIds: [], ...overrides };
}

test('champion matches score board and carry', async () => {
  const catalog = await fixture();
  const [result] = rankComps([comp(catalog)], query({ championIds: [id(catalog, 'Ahri')] }), catalog);
  assert.equal(result.score, 5);
  assert.deepEqual(result.breakdown.map((entry) => entry.key), ['champion', 'carry']);
  assert.equal(result.compId, entityId('comp', 'test-comp'));
});

test('exact and craftable items score separately', async () => {
  const catalog = await fixture();
  const exact = comp(catalog, { items: [named(catalog, 'Blue Buff')] });
  const [exactResult] = rankComps([exact], query({ itemIds: [id(catalog, 'Blue Buff')] }), catalog);
  assert.equal(exactResult.score, 2);
  assert.equal(exactResult.limitations.some((line) => line.includes('component')), false);

  const craftable = comp(catalog, { items: [named(catalog, 'Giant Slayer')] });
  const [craftableResult] = rankComps([craftable], query({ itemIds: [id(catalog, 'B.F. Sword')] }), catalog);
  assert.equal(craftableResult.score, 2);
  assert.equal(craftableResult.limitations.some((line) => line.includes('component')), true);
  assert.ok(craftableResult.matchedEntities.includes(id(catalog, 'Giant Slayer')));
});

test('augments, style and difficulty score separately', async () => {
  const catalog = await fixture();
  const [result] = rankComps(
    [comp(catalog)],
    query({ augmentIds: [id(catalog, 'Cursed Crown')], style: 'Fast 8', difficulty: 2 }),
    catalog
  );
  assert.equal(result.score, 4);
  assert.ok(result.limitations.some((line) => line.includes('MetaTFT')));
});

test('no matching input returns no candidates', async () => {
  const catalog = await fixture();
  assert.deepEqual(rankComps([comp(catalog)], query(), catalog), []);
});

test('ranking is deterministic by tier when scores tie', async () => {
  const catalog = await fixture();
  const sTier = comp(catalog, { slug: 's-tier', title: 'S Tier', tier: 'S' });
  const aTier = comp(catalog, { slug: 'a-tier', title: 'A Tier', tier: 'A' });
  const results = rankComps([aTier, sTier], query({ style: 'Fast 8' }), catalog);
  assert.deepEqual(
    results.map((result) => result.comp.slug),
    ['s-tier', 'a-tier']
  );
});

test('localizes reasons and limitations for English answers', async () => {
  const catalog = await fixture();
  const [result] = rankComps([comp(catalog)], query({ championIds: [id(catalog, 'Ahri')], lang: 'en' }), catalog);
  assert.match(result.reasons[0], /Board champion match/);
  assert.match(result.limitations[0], /comp overlap/);
});
