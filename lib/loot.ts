import snapshot from './loot-tables.json';

export type LootItem = {
  kind: string;
  name: string;
  icon: string | null;
  count: string | null;
  cost: number | null;
  stars: number | null;
};

export type LootOutcome = { chance: string | null; items: LootItem[] };

export type LootTable = {
  apiName: string;
  title: string;
  level: number | null;
  facts: { label: string; value: string }[];
  outcomes: LootOutcome[];
};

export type LootOwner = {
  kind: string;
  name: string;
  icon: string | null;
  description: string | null;
  stages: string[];
  tables: LootTable[];
};

export type LootCell = { value: string; icon: string | null };

export type LootPlainTable = {
  title: string;
  note: string | null;
  group: string | null;
  headers: string[];
  rows: LootCell[][];
};

export type LootBoard = { title: string; image: string | null; features: string[] };

export type LootPage = {
  slug: string;
  title: string;
  name: string;
  category: string | null;
  icon: string | null;
  splash: string | null;
  sourceUrl: string;
  owners: LootOwner[];
  tables: LootPlainTable[];
  augmentDistribution: {
    path: string;
    tier: string;
    conditional: string;
    weight: string;
    title: string;
  }[];
  boards: LootBoard[];
};

export type LootSource = {
  provider: string;
  page: string;
  set: string;
  generatedAt: string;
  fetchedAt: string;
};

export type LootLocalCard = {
  category: string;
  slug: string;
  name: string;
  icon: string | null;
};

const loot = snapshot as unknown as {
  source: LootSource;
  categories: { heading: string; slugs: string[] }[];
  localCards: LootLocalCard[];
  pages: LootPage[];
};

export const lootSource = loot.source;

export const lootPages: LootPage[] = loot.pages;

// Tables tftflow does not publish (our own gold income table).
export const lootLocalCards: LootLocalCard[] = loot.localCards;

export const lootPageBySlug: Record<string, LootPage> = Object.fromEntries(
  loot.pages.map((page) => [page.slug, page])
);

// The hub groups the tables the way tftflow does: System, Traits, Augments,
// Items, Champions, Encounters.
export const lootCategories = loot.categories.map((category) => ({
  heading: category.heading,
  pages: category.slugs.map((slug) => lootPageBySlug[slug]).filter(Boolean),
}));

// Consecutive plain tables that share a stage heading render as one panel.
export const lootTableGroups = (tables: LootPlainTable[]) => {
  const groups: { heading: string; tables: LootPlainTable[] }[] = [];
  for (const table of tables) {
    const heading = table.group ?? table.title;
    const last = groups[groups.length - 1];
    if (last && last.heading === heading) last.tables.push(table);
    else groups.push({ heading, tables: [table] });
  }
  return groups;
};
