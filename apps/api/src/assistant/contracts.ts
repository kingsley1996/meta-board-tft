export const ENTITY_TYPES = ['champion', 'item', 'trait', 'augment', 'comp'] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];
export type GameEntityType = Exclude<EntityType, 'comp'>;
export type EntityId = `${EntityType}:${string}`;
export type Lang = 'en' | 'vi';

export type Ability = {
  name: string;
  desc: string;
  keywords: string[];
  nameVi: string | null;
  descVi: string | null;
  keywordsVi: string[];
  icon: string | null;
};

export type Breakpoint = {
  minUnits: number;
  style: string | null;
  text: string;
};

export type CatalogEntity = {
  id: EntityId;
  type: GameEntityType;
  apiName: string | null;
  slug: string | null;
  name: string;
  nameVi: string | null;
  icon: string | null;
  cost: number | null;
  traits: string[];
  traitsVi: string[];
  mana: { start: number; max: number } | null;
  ability: Ability | null;
  description: string | null;
  descriptionVi: string | null;
  composition: string[];
  compositionVi: string[];
  rarity: number | null;
  thresholds: number[];
  styles: number[];
  breakpoints: Breakpoint[];
  breakpointsVi: Breakpoint[];
};

export type NamedIcon = { name: string; icon: string | null };

export type CompUnit = NamedIcon & {
  cost: number;
  row: number | null;
  col: number | null;
  stars: number | null;
  items: NamedIcon[];
};

export type CompTrait = NamedIcon & {
  count: number;
  thresholds: number[];
  styles: number[];
};

export type CompData = {
  slug: string;
  title: string;
  titleVi: string | null;
  tier: string;
  style: string;
  difficulty: number;
  trend: string | null;
  votes: number;
  views: number;
  playstyle: string;
  units: CompUnit[];
  traits: CompTrait[];
  early: CompUnit[];
  carry: CompUnit;
  items: NamedIcon[];
  augments: NamedIcon[];
  tips: string;
  stages: { stage: string; text: string }[];
  alt: CompUnit[];
  augmentTypes: string[];
  matchups: { slug: string; kind: string; title: string; tier: string }[];
};

// The item build one comp attaches to one champion, extracted for champion
// questions ("Akali nên lên trang bị gì") so the model can recommend real
// builds instead of refusing for lack of data.
export type ChampionBuild = {
  champion: string;
  comp: string;
  compSlug: string;
  isCarry: boolean;
  items: string[];
};

// Mirror direction: which champions hold a queried item across matching comps,
// for "Edge of Night lên cho ai?" — relatedComps alone only names the comps.
export type ItemHolder = {
  item: string;
  comp: string;
  compSlug: string;
  holders: string[];
};

// Winrate-backed builds and per-item placement for one champion, extracted
// from live match stats (meta.json units) rather than curated comps.
export type UnitBuildStat = { items: string[]; count: number; avg: number; pick: number };
export type UnitItemStat = { item: string; count: number; avg: number; pick: number };
export type UnitBuildEvidence = {
  champion: string;
  unitGames: number;
  builds: UnitBuildStat[];
  itemStats: UnitItemStat[];
};

// Live-stat answer to "item X mạnh trên ai / lên ở stage nào": per-champion
// placement while holding the item (delta versus their overall average,
// negative is better) and win rate by completion stage.
export type ItemHolderStat = {
  name: string;
  count: number;
  avg: number;
  top4: number;
  win: number;
  delta: number | null;
  tier: string | null;
};
export type ItemStageStat = { stage: string; games: number; winRate: number };
export type ItemUsageEvidence = {
  item: string;
  unitGames: number;
  topChampions: ItemHolderStat[];
  stages: ItemStageStat[];
};

// Champions carrying one trait, for trait-roster questions ("Quái Rừng gồm
// những con nào?") — derived from the catalog, not the model's memory.
export type TraitRoster = {
  trait: string;
  champions: { name: string; cost: number | null }[];
};

export type EntityMatch = { entity: CatalogEntity; score: number; matchedText?: string };

export type RankingQuery = {
  championIds: EntityId[];
  itemIds: EntityId[];
  augmentIds: EntityId[];
  style?: string | null;
  difficulty?: number | null;
  lang?: Lang;
};

export type RankPartKey = 'champion' | 'carry' | 'early' | 'alt' | 'item' | 'component' | 'augment' | 'style' | 'difficulty';

export type RankPart = {
  key: RankPartKey;
  points: number;
  reason: string;
  matched: EntityId[];
};

export type RankedComp = {
  comp: CompData;
  compId: EntityId;
  score: number;
  matchedEntities: EntityId[];
  reasons: string[];
  limitations: string[];
  breakdown: RankPart[];
};

export type CompSummary = {
  compId: EntityId;
  slug: string;
  title: string;
  tier: string;
  style: string;
  difficulty: number;
  carry: string;
  units: string[];
  traits: string[];
};

export type CompComparison = {
  comps: CompData[];
  commonUnits: string[];
  commonItems: string[];
  commonAugments: string[];
  differences: {
    slug: string;
    tier: string;
    style: string;
    difficulty: number;
    uniqueUnits: string[];
    uniqueItems: string[];
    uniqueAugments: string[];
  }[];
};

export function isEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value);
}

export function entityId(type: EntityType, key: string): EntityId {
  return `${type}:${key}`;
}

export function parseEntityId(value: string): { type: EntityType; key: string } | null {
  const separator = value.indexOf(':');
  if (separator < 1) return null;
  const type = value.slice(0, separator);
  const key = value.slice(separator + 1);
  if (!key || !isEntityType(type)) return null;
  return { type, key };
}

export function entityIdList(value: unknown, max = 20): EntityId[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((entry): entry is string => typeof entry === 'string' && parseEntityId(entry) !== null);
  return [...new Set(ids)].slice(0, max) as EntityId[];
}

export function clampLimit(value: unknown, fallback = 8, max = 20): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(number)));
}

export const ASSISTANT_PAGE_TYPES = ['comp', 'champion', 'item', 'augment', 'assistant'] as const;
export type AssistantPageType = (typeof ASSISTANT_PAGE_TYPES)[number];

export const ASSISTANT_STATUSES = ['answered', 'needs_clarification', 'insufficient_data', 'unsupported', 'error'] as const;
export type AssistantStatus = (typeof ASSISTANT_STATUSES)[number];

export const ASSISTANT_INTENTS = [
  'entity_lookup',
  'comp_search',
  'comp_recommendation',
  'comp_comparison',
  'gameplay_knowledge',
  'meta_query',
  'strategy_analysis',
  'patch_change',
  'set_patch',
  'unsupported_or_unknown',
] as const;
export type AssistantIntent = (typeof ASSISTANT_INTENTS)[number];

export type AssistantMode = 'llm' | 'deterministic';

export type AssistantHistoryMessage = { role: 'user' | 'assistant'; content: string };

export type AssistantContext = {
  pageType: AssistantPageType | null;
  compSlug: string | null;
  entityIds: EntityId[];
};

export type AssistantQueryInput = {
  message: string;
  lang: Lang;
  conversationId?: string;
  history: AssistantHistoryMessage[];
  context: AssistantContext;
};

export type AssistantRequest = AssistantQueryInput & { conversationId: string };

export type ResolvedEntity = { type: EntityType; id: EntityId; name: string };

export type AssistantSource = {
  id: string;
  title: string;
  url: string;
  sourceType: 'structured_data' | 'guide' | 'mechanics';
  version: string;
  retrievedAt?: string;
};

export type AssistantSection = {
  heading: string;
  points: string[];
};

export type AssistantRecommendationUnit = {
  name: string;
  slug: string | null;
  icon: string | null;
  cost: number;
};

export type AssistantRecommendationAsset = {
  name: string;
  icon: string | null;
};

export type AssistantRecommendation = {
  compId: EntityId;
  slug: string;
  title: string;
  tier: string;
  style: string;
  score: number;
  reasons: string[];
  units: AssistantRecommendationUnit[];
  items: AssistantRecommendationAsset[];
  augments: AssistantRecommendationAsset[];
  matchedEntities: EntityId[];
  limitations: string[];
};

// Catalog entity named in the final answer, carrying icon/slug so the client
// can render an image chip with a link to the entity detail page.
export type EntityRef = {
  type: 'champion' | 'item' | 'trait' | 'augment';
  id: EntityId;
  name: string;
  slug: string | null;
  icon: string | null;
  cost: number | null;
};

export type AssistantResponse = {
  requestId: string;
  conversationId: string;
  answer: string;
  sections: AssistantSection[];
  intent: AssistantIntent;
  mode: AssistantMode;
  resolvedContext: {
    setId: string;
    patchId: string;
    lang: Lang;
    entities: ResolvedEntity[];
  };
  recommendations: AssistantRecommendation[];
  sources: AssistantSource[];
  limitations: string[];
  followUpQuestions: string[];
  status: AssistantStatus;
  mentions: EntityRef[];
};

export type AssistantAnswer = Omit<AssistantResponse, 'requestId'>;

export type AssistantFeedback = {
  requestId: string;
  conversationId: string;
  helpful: boolean;
};

export type QueryValidation = { ok: true; value: AssistantQueryInput } | { ok: false; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateAssistantQuery(input: unknown): QueryValidation {
  if (!input || typeof input !== 'object') return { ok: false, error: 'body must be an object' };
  const raw = input as Record<string, unknown>;

  const message = typeof raw.message === 'string' ? raw.message.trim() : '';
  if (!message) return { ok: false, error: 'message is required' };
  if (message.length > 2000) return { ok: false, error: 'message must be at most 2000 characters' };

  if (raw.lang !== undefined && raw.lang !== 'en' && raw.lang !== 'vi') {
    return { ok: false, error: 'lang must be en or vi' };
  }
  const lang: Lang = raw.lang === 'vi' ? 'vi' : 'en';

  if (raw.conversationId !== undefined && (typeof raw.conversationId !== 'string' || !UUID_PATTERN.test(raw.conversationId))) {
    return { ok: false, error: 'conversationId must be a UUID' };
  }

  const history: AssistantHistoryMessage[] = [];
  if (raw.history !== undefined) {
    if (!Array.isArray(raw.history)) return { ok: false, error: 'history must be an array' };
    if (raw.history.length > 6) return { ok: false, error: 'history must contain at most 6 messages' };
    for (const entry of raw.history) {
      if (!entry || typeof entry !== 'object') return { ok: false, error: 'history entry must be an object' };
      const record = entry as Record<string, unknown>;
      if (record.role !== 'user' && record.role !== 'assistant') {
        return { ok: false, error: 'history role must be user or assistant' };
      }
      const content = typeof record.content === 'string' ? record.content.trim() : '';
      if (!content || content.length > 2000) return { ok: false, error: 'history content must be 1-2000 characters' };
      history.push({ role: record.role, content });
    }
  }

  const contextRaw = raw.context;
  if (contextRaw !== undefined && (!contextRaw || typeof contextRaw !== 'object')) {
    return { ok: false, error: 'context must be an object' };
  }
  const contextRecord = (contextRaw ?? {}) as Record<string, unknown>;
  const pageType = contextRecord.pageType;
  if (pageType !== undefined && pageType !== null && !(ASSISTANT_PAGE_TYPES as readonly unknown[]).includes(pageType)) {
    return { ok: false, error: 'context.pageType is not supported' };
  }
  const compSlug = contextRecord.compSlug;
  if (compSlug !== undefined && compSlug !== null) {
    if (typeof compSlug !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(compSlug)) {
      return { ok: false, error: 'context.compSlug is invalid' };
    }
  }

  const entityIds: EntityId[] = [];
  if (contextRecord.entityIds !== undefined) {
    if (!Array.isArray(contextRecord.entityIds)) return { ok: false, error: 'context.entityIds must be an array' };
    if (contextRecord.entityIds.length > 10) return { ok: false, error: 'context.entityIds must contain at most 10 IDs' };
    for (const value of contextRecord.entityIds) {
      if (typeof value !== 'string' || !parseEntityId(value)) {
        return { ok: false, error: 'context.entityIds contains an invalid ID' };
      }
      if (!entityIds.includes(value as EntityId)) entityIds.push(value as EntityId);
    }
  }

  return {
    ok: true,
    value: {
      message,
      lang,
      conversationId: raw.conversationId as string | undefined,
      history,
      context: {
        pageType: (pageType as AssistantPageType | null | undefined) ?? null,
        compSlug: (compSlug as string | null | undefined) ?? null,
        entityIds,
      },
    },
  };
}
