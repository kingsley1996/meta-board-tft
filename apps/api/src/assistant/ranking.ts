import {
  entityId,
  type CatalogEntity,
  type CompData,
  type EntityId,
  type Lang,
  type RankPart,
  type RankedComp,
  type RankingQuery,
} from './contracts.ts';
import { localizedName, type Catalog } from './entities.ts';

const TIER_SCORE: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, X: 4 };

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function part(key: RankPart['key'], points: number, reason: string, matched: EntityId[]): RankPart {
  return { key, points, reason, matched: unique(matched) };
}

function namesOf(entities: CatalogEntity[], catalog: Catalog, lang: Lang): string {
  return entities.map((entity) => localizedName(catalog, entity.name, lang)).join(', ');
}

export function rankComps(comps: CompData[], query: RankingQuery, catalog: Catalog): RankedComp[] {
  const lang = query.lang ?? 'en';
  const vi = lang === 'vi';
  const say = (en: string, viText: string) => (vi ? viText : en);
  const champions = query.championIds
    .map((id) => catalog.byId.get(id))
    .filter((entity): entity is CatalogEntity => entity?.type === 'champion');
  const items = query.itemIds
    .map((id) => catalog.byId.get(id))
    .filter((entity): entity is CatalogEntity => entity?.type === 'item');
  const augments = query.augmentIds
    .map((id) => catalog.byId.get(id))
    .filter((entity): entity is CatalogEntity => entity?.type === 'augment');

  return comps
    .map((comp): RankedComp | null => {
      const parts: RankPart[] = [];
      const boardNames = new Set(comp.units.map((unit) => unit.name));
      const earlyNames = new Set(comp.early.map((unit) => unit.name));
      const altNames = new Set(comp.alt.map((unit) => unit.name));
      const carryName = comp.carry.name;

      const board = champions.filter((entity) => boardNames.has(entity.name));
      const carry = champions.filter((entity) => entity.name === carryName);
      const early = champions.filter((entity) => earlyNames.has(entity.name));
      const alt = champions.filter((entity) => altNames.has(entity.name));
      if (board.length) parts.push(part('champion', board.length * 3, say(`Board champion match: ${namesOf(board, catalog, lang)}.`, `Khớp tướng board: ${namesOf(board, catalog, lang)}.`), board.map((entity) => entity.id)));
      if (carry.length) parts.push(part('carry', carry.length * 2, say(`Carry match: ${namesOf(carry, catalog, lang)}.`, `Khớp carry: ${namesOf(carry, catalog, lang)}.`), carry.map((entity) => entity.id)));
      if (early.length) parts.push(part('early', early.length, say(`Early unit match: ${namesOf(early, catalog, lang)}.`, `Khớp tướng early: ${namesOf(early, catalog, lang)}.`), early.map((entity) => entity.id)));
      if (alt.length) parts.push(part('alt', alt.length, say(`Alt unit match: ${namesOf(alt, catalog, lang)}.`, `Khớp tướng alt: ${namesOf(alt, catalog, lang)}.`), alt.map((entity) => entity.id)));

      const compItems = new Set<string>([
        ...comp.items.map((item) => item.name),
        ...comp.units.flatMap((unit) => unit.items.map((item) => item.name)),
        ...comp.early.flatMap((unit) => unit.items.map((item) => item.name)),
        ...comp.alt.flatMap((unit) => unit.items.map((item) => item.name)),
      ]);
      const exactItems = items.filter((entity) => compItems.has(entity.name));
      if (exactItems.length) {
        parts.push(part('item', exactItems.length * 2, say(`Item match: ${namesOf(exactItems, catalog, lang)}.`, `Khớp item: ${namesOf(exactItems, catalog, lang)}.`), exactItems.map((entity) => entity.id)));
      }

      let componentMatch = false;
      const craftable = new Set<string>();
      for (const component of items) {
        if (!catalog.components.has(component.name) || compItems.has(component.name)) continue;
        for (const itemName of compItems) {
          const completed = catalog.byName.get(itemName);
          if (completed?.composition.includes(component.name)) {
            craftable.add(itemName);
            componentMatch = true;
          }
        }
      }
      if (componentMatch) {
        const matched = [...craftable]
          .map((name) => catalog.byName.get(name))
          .filter((entity): entity is CatalogEntity => Boolean(entity))
          .map((entity) => entity.id);
        parts.push(part('component', 2, say(`Craftable items from your components: ${[...craftable].map((name) => localizedName(catalog, name, lang)).join(', ')}.`, `Có thể ghép item từ component bạn có: ${[...craftable].map((name) => localizedName(catalog, name, lang)).join(', ')}.`), matched));
      }

      const compAugments = new Set(comp.augments.map((augment) => augment.name));
      const exactAugments = augments.filter((entity) => compAugments.has(entity.name));
      if (exactAugments.length) {
        parts.push(part('augment', exactAugments.length * 2, say(`Augment match: ${namesOf(exactAugments, catalog, lang)}.`, `Khớp augment: ${namesOf(exactAugments, catalog, lang)}.`), exactAugments.map((entity) => entity.id)));
      }

      if (query.style && comp.style === query.style) {
        parts.push(part('style', 1, say(`Style match: ${comp.style}.`, `Khớp lối chơi ${comp.style}.`), []));
      }
      if (query.difficulty !== null && query.difficulty !== undefined && comp.difficulty === query.difficulty) {
        parts.push(part('difficulty', 1, say(`Difficulty match: ${comp.difficulty}.`, `Khớp độ khó ${comp.difficulty}.`), []));
      }

      if (!parts.length) return null;

      const score = parts.reduce((total, entry) => total + entry.points, 0);
      const matchedEntities = unique(parts.flatMap((entry) => entry.matched));
      const limitations = [say('This score reflects comp overlap; see TFTIQ stats for performance.', 'Điểm này phản ánh độ khớp đội hình; xem số liệu TFTIQ để biết hiệu quả.')];
      if (componentMatch) limitations.push(say('Completed items are inferred from your components and are not verified purchases.', 'Item hoàn chỉnh được suy ra từ component, chưa xác minh item thực tế.'));
      if (!board.length && !exactItems.length && !exactAugments.length) {
        limitations.push(say('No champion, item or augment matched; only style or difficulty matched.', 'Chưa khớp tướng/item/augment nào; chỉ khớp lối chơi hoặc độ khó.'));
      }

      return {
        comp,
        compId: entityId('comp', comp.slug),
        score,
        matchedEntities,
        reasons: parts.map((entry) => entry.reason),
        limitations,
        breakdown: parts,
      };
    })
    .filter((candidate): candidate is RankedComp => candidate !== null)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.matchedEntities.length - a.matchedEntities.length ||
        (TIER_SCORE[a.comp.tier] ?? 99) - (TIER_SCORE[b.comp.tier] ?? 99) ||
        a.comp.title.localeCompare(b.comp.title)
    );
}
