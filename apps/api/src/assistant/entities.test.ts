import test from 'node:test';
import assert from 'node:assert/strict';
import { entityId, parseEntityId } from './contracts.ts';
import { ENTITY_ALIAS_GROUPS } from './entity-aliases.ts';
import { findFuzzyEntityMentions, localizeEntityNames, normalizeSpaced, type Catalog } from './entities.ts';
import { buildCatalog, findEntityMentions, grantedTrait, normalize, pickEntityMatch, searchCatalog, type DbRows, type EntityMatch } from './entities.ts';
import { loadStaticGameData } from './static-game-data.ts';

function championRow(data: Awaited<ReturnType<typeof loadStaticGameData>>, name: string): DbRows['champions'][number] {
  const champion = data.champions.find((entry) => entry.name === name);
  if (!champion) throw new Error(`missing champion ${name}`);
  return { api_name: champion.apiName, name: champion.name, cost: champion.cost, traits: champion.traits ?? [], icon: null };
}

function itemRow(data: Awaited<ReturnType<typeof loadStaticGameData>>, name: string): DbRows['items'][number] {
  const item = data.items.find((entry) => entry.name === name);
  if (!item) throw new Error(`missing item ${name}`);
  return { api_name: item.apiName, name: item.name, description: item.desc ?? '', composition: item.composition ?? [], icon: null };
}

function traitRow(data: Awaited<ReturnType<typeof loadStaticGameData>>, name: string): DbRows['traits'][number] {
  const trait = data.traits.find((entry) => entry.name === name);
  if (!trait) throw new Error(`missing trait ${name}`);
  return {
    api_name: trait.apiName,
    name: trait.name,
    description: trait.desc ?? '',
    thresholds: trait.thresholds ?? [],
    styles: trait.styles ?? [],
    icon: null,
  };
}

function augmentRow(data: Awaited<ReturnType<typeof loadStaticGameData>>, name: string): DbRows['augments'][number] {
  const augment = data.augments.find((entry) => entry.name === name);
  if (!augment) throw new Error(`missing augment ${name}`);
  return { api_name: augment.apiName, name: augment.name, description: augment.desc ?? '', rarity: augment.rarity ?? null, icon: null };
}

async function fixture(customAliases: { alias: string; entityType: string; entityId: string }[] = []) {
  const data = await loadStaticGameData();
  return buildCatalog(
    {
      champions: [championRow(data, 'Ahri'), championRow(data, 'Gromp'), championRow(data, 'Taric')],
      traits: [traitRow(data, 'Ravager'), traitRow(data, 'Fae')],
      items: [
        itemRow(data, 'B.F. Sword'),
        itemRow(data, "Guinsoo's Rageblade"),
        itemRow(data, 'Giant Slayer'),
        itemRow(data, 'Spirit Visage'),
        itemRow(data, 'Ravager Emblem'),
        itemRow(data, 'Fae Emblem'),
      ],
      augments: [augmentRow(data, 'Cursed Crown'), augmentRow(data, 'Champ Delivery'), augmentRow(data, 'Champ Delivery+')],
    },
    data,
    customAliases
  );
}

test('normalize folds Vietnamese diacritics and punctuation', () => {
  assert.equal(normalize('Cóc Thành Tinh'), 'cocthanhtinh');
  assert.equal(normalize('B.F. Sword'), 'bfsword');
});

test('curated entity aliases target names that exist in the active set', async () => {
  const data = await loadStaticGameData();
  const names: Record<string, Set<string>> = {
    champion: new Set(data.champions.map((entity) => entity.name)),
    trait: new Set(data.traits.map((entity) => entity.name)),
    item: new Set(data.items.map((entity) => entity.name)),
    augment: new Set(data.augments.map((entity) => entity.name)),
  };
  for (const group of ENTITY_ALIAS_GROUPS) {
    assert.ok(names[group.type].has(group.name), `${group.type} alias target "${group.name}" must exist in the current set`);
    assert.ok(group.aliases.length > 0, `${group.type} alias target "${group.name}" must have aliases`);
  }
});

test('search resolves Vietnamese champion names and API names', async () => {
  const catalog = await fixture();
  const vietnamese = searchCatalog(catalog, 'coc thanh tinh', 'champion');
  assert.equal(vietnamese[0]?.entity.name, 'Gromp');
  assert.equal(vietnamese[0]?.score, 100);

  const apiName = searchCatalog(catalog, 'DA_18_Ahri', 'champion');
  assert.equal(apiName[0]?.entity.name, 'Ahri');
});

test('resolves a unique fuzzy name typo without guessing between candidates', async () => {
  const catalog = await fixture();
  const matches = searchCatalog(catalog, 'Tarci', 'champion');
  assert.equal(matches[0]?.entity.name, 'Taric');
  assert.equal(matches[0]?.score, 80);
});

test('an exact augment name outranks the longer plus variant', async () => {
  const catalog = await fixture();
  const matches = searchCatalog(catalog, 'Champ Delivery+', 'augment');
  assert.equal(matches[0]?.entity.name, 'Champ Delivery+');
  assert.equal(matches[0]?.score, 110);
});

test('search resolves component aliases and returns stable IDs', async () => {
  const catalog = await fixture();
  const matches = searchCatalog(catalog, 'bf', 'item');
  assert.equal(matches[0]?.entity.name, 'B.F. Sword');
  assert.equal(matches[0]?.score, 90);
  assert.equal(matches[0]?.entity.id, entityId('item', 'TFT_Item_BFSword'));
});

test('catalog aliases resolve historical item names and trait aliases in natural questions', async () => {
  const catalog = await fixture();
  const item = findEntityMentions(catalog, 'Tôi nên ghép Redemption cho Ahri không?');
  assert.ok(item.some((match) => match.entity.name === 'Spirit Visage'));

  const trait = findEntityMentions(catalog, 'Slayer có mốc kích hoạt nào?');
  assert.ok(trait.some((match) => match.entity.name === 'Ravager'));

  const translated = findEntityMentions(catalog, 'Mình đang có Cuồng Đao Guinsoo');
  assert.ok(translated.some((match) => match.entity.name === "Guinsoo's Rageblade"));
});

test('catalog resolves aliases loaded from persistent storage', async () => {
  const catalog = await fixture([{ alias: 'fox mage', entityType: 'champion', entityId: entityId('champion', 'DA_18_Ahri') }]);
  const matches = findEntityMentions(catalog, 'Is Fox Mage good with this item?');
  assert.ok(matches.some((match) => match.entity.name === 'Ahri'));
});

test('search resolves trait and emblem aliases', async () => {
  const catalog = await fixture();
  const trait = searchCatalog(catalog, 'slayer', 'trait');
  assert.equal(trait[0]?.entity.name, 'Ravager');
  const emblem = searchCatalog(catalog, 'slayer emblem', 'item');
  assert.equal(emblem[0]?.entity.name, 'Ravager Emblem');
});

test('search respects type filter and limit', async () => {
  const catalog = await fixture();
  const matches = searchCatalog(catalog, 'a', null, 1);
  assert.equal(matches.length, 1);
  const champions = searchCatalog(catalog, 'a', 'champion');
  assert.ok(champions.every((match) => match.entity.type === 'champion'));
});

test('parseEntityId rejects malformed IDs', () => {
  assert.deepEqual(parseEntityId('item:TFT_Item_BFSword'), { type: 'item', key: 'TFT_Item_BFSword' });
  assert.equal(parseEntityId('nope'), null);
  assert.equal(parseEntityId('unknown:value'), null);
  assert.equal(parseEntityId('comp:'), null);
});

test('longer overlapping names win over their trait suffix', async () => {
  const catalog = await fixture();
  const item = findEntityMentions(catalog, 'Ấn Tiên Linh (Fae Emblem)');
  assert.deepEqual(item.map((match) => match.entity.id), [entityId('item', 'DA_18_EmblemFae')]);

  const trait = findEntityMentions(catalog, 'Tiên Linh (Fae)');
  assert.deepEqual(trait.map((match) => match.entity.id), [entityId('trait', 'DA_18_Fae')]);
});

test('emblem items expose their granted trait', async () => {
  const catalog = await fixture();
  const emblem = catalog.byId.get(entityId('item', 'DA_18_EmblemFae'));
  assert.ok(emblem);
  assert.equal(grantedTrait(catalog, emblem)?.id, entityId('trait', 'DA_18_Fae'));
  const sword = catalog.byId.get(entityId('item', 'TFT_Item_BFSword'));
  assert.ok(sword);
  assert.equal(grantedTrait(catalog, sword), null);
});


test('only accepts exact or alias matches and surfaces ambiguous fuzzy names', () => {
  const match = (name: string, score: number): EntityMatch => ({
    entity: { id: name, name, type: 'champion' } as EntityMatch['entity'],
    score,
  });
  assert.equal(pickEntityMatch([match('Ahri', 100)]).entity?.name, 'Ahri');
  assert.equal(pickEntityMatch([match('bf', 90)]).entity?.name, 'bf');
  assert.equal(pickEntityMatch([match('Ahri', 100), match('Ahri', 100)]).entity, null);
  assert.equal(pickEntityMatch([match('Ahri', 80)]).entity?.name, 'Ahri');
  assert.equal(pickEntityMatch([match('Ahri', 80), match('Ahri', 80)]).ambiguous.length, 2);
});

test('a repeated augment name resolves to the standard row instead of an ambiguous pair', () => {
  const augment = (apiName: string, name: string): EntityMatch => ({
    entity: { id: `augment:${apiName}`, apiName, name, type: 'augment' } as EntityMatch['entity'],
    score: 100,
  });
  const resolved = (matches: EntityMatch[]) => pickEntityMatch(matches).entity?.apiName;
  assert.equal(resolved([augment('DA_Coronation', 'Coronation'), augment('TFT_Augment_Coronation', 'Coronation')]), 'TFT_Augment_Coronation');
  assert.equal(resolved([augment('TFT6_Augment_SalvageBinHR', 'Salvage Bin'), augment('DA_SalvageBin', 'Salvage Bin'), augment('TFT6_Augment_SalvageBin', 'Salvage Bin')]), 'TFT6_Augment_SalvageBin');
  // Different names are still a real choice.
  assert.equal(pickEntityMatch([augment('TFT_Augment_Coronation', 'Coronation'), augment('TFT_Augment_SpreadingRoots', 'Spreading Roots')]).entity, null);
  // A plus sign marks a different augment, not a duplicate row.
  assert.equal(pickEntityMatch([augment('DA_ChampDelivery', 'Champ Delivery'), augment('DA_ChampDeliveryPlus', 'Champ Delivery+')]).entity, null);
});

test('localizeEntityNames rewrites canonical entity names in prose for vi', () => {
  const coven = { name: 'Dark Ritual', nameVi: 'Tà Thuật' };
  const radiantEdge = { name: 'Radiant Edge of Night', nameVi: 'Vuốt Bóng Đêm Ánh Sáng' };
  const edge = { name: 'Edge of Night', nameVi: 'Vuốt Bóng Đêm' };
  const catalog = {
    byName: new Map(
      [coven, radiantEdge, edge].map((entity) => [entity.name, { ...entity, type: 'augment' }])
    ),
  } as unknown as Catalog;
  const vi = localizeEntityNames('Chơi với Nâng Cấp Dark Ritual để lấy Radiant Edge of Night.', catalog, 'vi');
  assert.equal(vi, 'Chơi với Nâng Cấp Tà Thuật để lấy Vuốt Bóng Đêm Ánh Sáng.');
  // English requests keep canonical names untouched.
  assert.equal(localizeEntityNames('Play Dark Ritual.', catalog, 'en'), 'Play Dark Ritual.');
});

test('findFuzzyEntityMentions resolves typos and STT errors within edit distance', () => {
  const entities = [
    { id: 'champion:DA_18_Akali', type: 'champion', name: 'Akali', nameVi: 'Akali' },
    { id: 'trait:DA_Riftbeast18', type: 'trait', name: 'Riftbeast', nameVi: 'Quái Rừng' },
    { id: 'trait:DA_18_Coven', type: 'trait', name: 'Coven', nameVi: 'Tiên Hắc Ám' },
    { id: 'item:DA_StrikersFlail', type: 'item', name: "Striker's Flail", nameVi: 'Chùy Đoản Côn' },
  ];
  const catalog = {
    byId: new Map(entities.map((entity) => [entity.id, entity])),
    byName: new Map(entities.map((entity) => [entity.name, entity])),
    aliasesSpaced: new Map(
      entities.flatMap((entity) =>
        [entity.name, entity.nameVi].map((alias) => [normalizeSpaced(alias), new Set([entity.id])])
      )
    ),
  } as unknown as Catalog;

  // Typo in an English name (distance 1).
  const typo = findFuzzyEntityMentions(catalog, 'Akli nen len do gi');
  assert.equal(typo.length, 1);
  assert.equal(typo[0].entity.id, 'champion:DA_18_Akali');

  // STT-style Vietnamese confusion ("Tiên" misheard as "Tân", distance 2 on a
  // long alias).
  const stt = findFuzzyEntityMentions(catalog, 'Tan Hac Am nen no hu moc bao nhieu');
  assert.equal(stt.length, 1);
  assert.equal(stt[0].entity.id, 'trait:DA_18_Coven');
  assert.equal(stt[0].matchedText, 'tan hac am');

  // Short windows never fuzzy-match ("con" vs "coven" territory).
  assert.deepEqual(findFuzzyEntityMentions(catalog, 'choi con'), []);

  // Ambiguous typo: two entities at the same distance stay unresolved.
  const ambiguous = findFuzzyEntityMentions(catalog, 'garen darius abcd efgh ijkl');
  assert.deepEqual(ambiguous, []);
});
