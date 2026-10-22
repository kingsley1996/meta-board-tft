import { listComps } from '../comps.ts';
import type {
  CatalogEntity,
  CompComparison,
  CompData,
  GameEntityType,
  Lang,
  RankedComp,
  RankingQuery,
} from './contracts.ts';
import { pickEntityMatch, searchCatalog, type Catalog } from './entities.ts';
import { compStats, entityStats, loadMetaStats, type StatEvidence } from './meta-stats.ts';
import type { ProviderTool } from './provider.ts';
import { rankComps } from './ranking.ts';
import { compareComps, getComp, loadCatalog, searchComps } from './tools.ts';

export type AmbiguousEntity = {
  name: string;
  type: GameEntityType;
  candidates: { id: string; name: string; type: GameEntityType }[];
};

export type ToolExecution = {
  tool: string;
  payload: unknown;
  candidates?: RankedComp[];
  comps?: CompData[];
  stats?: StatEvidence[];
  comparison?: CompComparison;
  ambiguous?: AmbiguousEntity[];
  unresolved?: string[];
};

export class AssistantToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssistantToolError';
  }
}

export const ASSISTANT_TOOLS: ProviderTool[] = [
  {
    type: 'function',
    function: {
      name: 'find_comps',
      description: 'Rank comps that match champions, items, augments, playstyle, difficulty or tier. Use for build recommendations.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          champions: { type: 'array', items: { type: 'string', maxLength: 80 }, maxItems: 5, description: 'Champion names, max 5.' },
          items: { type: 'array', items: { type: 'string', maxLength: 80 }, maxItems: 5, description: 'Completed item names, max 5.' },
          augments: { type: 'array', items: { type: 'string', maxLength: 80 }, maxItems: 5, description: 'Augment names, max 5.' },
          style: { type: 'string', maxLength: 30, description: 'Fast 8, Reroll, Flex or Tempo.' },
          difficulty: { type: 'integer', minimum: 1, maximum: 3 },
          tier: { type: 'string', enum: ['S', 'A', 'B', 'C', 'X'] },
          limit: { type: 'integer', minimum: 1, maximum: 5 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_comps',
      description: 'Search comps by name, trait or theme, optionally filtered by tier or playstyle. Use to browse when no champions/items are given.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', maxLength: 80, description: 'Comp name, trait or short theme. Empty string browses all.' },
          tier: { type: 'string', enum: ['S', 'A', 'B', 'C', 'X'] },
          style: { type: 'string', maxLength: 30 },
          limit: { type: 'integer', minimum: 1, maximum: 5 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_comp',
      description: 'Get the full board, items, augments, traits, tips and stages for one comp slug.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { slug: { type: 'string', maxLength: 80, description: 'Comp slug, for example ahri-spellweaver.' } },
        required: ['slug'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_comps',
      description: 'Compare two or three comps: shared units/items/augments and differences.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          slugs: { type: 'array', items: { type: 'string', maxLength: 80 }, minItems: 2, maxItems: 3 },
        },
        required: ['slugs'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_stats',
      description: 'Get MetaTFT stats for a champion, item, augment or comp slug.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', maxLength: 80, description: 'Entity name or comp slug.' },
          type: { type: 'string', enum: ['champion', 'item', 'augment', 'comp'] },
        },
        required: ['name'],
      },
    },
  },
];

function record(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      throw new AssistantToolError('Tool arguments are not valid JSON.');
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AssistantToolError('Tool arguments must be an object.');
  return value as Record<string, unknown>;
}

function allowed(args: Record<string, unknown>, keys: string[]): void {
  const allowedKeys = new Set(keys);
  const unknown = Object.keys(args).find((key) => !allowedKeys.has(key));
  if (unknown) throw new AssistantToolError(`Unknown argument: ${unknown}.`);
}

function text(value: unknown, key: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new AssistantToolError(`${key} must be a string.`);
  const result = value.trim();
  if (result.length > max) throw new AssistantToolError(`${key} is too long.`);
  return result || undefined;
}

function strings(value: unknown, key: string, max: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max) throw new AssistantToolError(`${key} must be an array of at most ${max} names.`);
  return value.map((entry) => {
    if (typeof entry !== 'string' || !entry.trim()) throw new AssistantToolError(`${key} contains an invalid name.`);
    const text = entry.trim();
    if (text.length > 80) throw new AssistantToolError(`${key} contains a name that is too long.`);
    return text;
  });
}

function tier(value: unknown): string | undefined {
  const result = text(value, 'tier', 2)?.toUpperCase();
  if (!result) return undefined;
  if (!['S', 'A', 'B', 'C', 'X'].includes(result)) throw new AssistantToolError('tier must be S, A, B, C or X.');
  return result;
}

function limit(value: unknown): number {
  if (value === undefined || value === null) return 5;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new AssistantToolError('limit must be an integer.');
  }
  return Math.min(5, Math.max(1, value));
}

function difficulty(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 3) {
    throw new AssistantToolError('difficulty must be 1, 2 or 3.');
  }
  return value;
}

function slug(value: unknown, key = 'slug'): string {
  const result = text(value, key, 80);
  if (!result || !/^[a-z0-9-]+$/i.test(result)) throw new AssistantToolError(`${key} must be a comp slug.`);
  return result;
}

function resolve(
  catalog: Catalog,
  names: string[],
  type: GameEntityType
): { entities: CatalogEntity[]; unresolved: string[]; ambiguous: AmbiguousEntity[] } {
  const entities: CatalogEntity[] = [];
  const unresolved: string[] = [];
  const ambiguous: AmbiguousEntity[] = [];
  for (const name of names) {
    const resolution = pickEntityMatch(searchCatalog(catalog, name, type, 5));
    if (resolution.entity) {
      entities.push(resolution.entity);
    } else if (resolution.ambiguous.length) {
      ambiguous.push({
        name,
        type,
        candidates: resolution.ambiguous.map((entry) => ({ id: entry.entity.id, name: entry.entity.name, type: entry.entity.type })),
      });
    } else {
      unresolved.push(name);
    }
  }
  return { entities, unresolved, ambiguous };
}

function candidatePayload(candidate: RankedComp, index: number) {
  const comp = candidate.comp;
  return {
    rank: index + 1,
    slug: comp.slug,
    title: comp.title,
    tier: comp.tier,
    style: comp.style,
    score: candidate.score,
    reasons: candidate.reasons,
    units: comp.units.map((unit) => unit.name),
    carry: comp.carry.name,
    items: comp.items.map((item) => item.name),
    augments: comp.augments.map((augment) => augment.name),
    traits: comp.traits.map((trait) => ({ name: trait.name, count: trait.count })),
  };
}

function compPayload(comp: CompData) {
  return {
    slug: comp.slug,
    title: comp.title,
    tier: comp.tier,
    style: comp.style,
    difficulty: comp.difficulty,
    units: comp.units.map((unit) => ({ name: unit.name, cost: unit.cost, items: unit.items.map((item) => item.name) })),
    carry: comp.carry.name,
    items: comp.items.map((item) => item.name),
    augments: comp.augments.map((augment) => augment.name),
    traits: comp.traits.map((trait) => ({ name: trait.name, count: trait.count })),
    tips: comp.tips.slice(0, 400),
    stages: comp.stages.slice(0, 4),
  };
}

async function findComps(args: Record<string, unknown>, lang: Lang): Promise<ToolExecution> {
  allowed(args, ['champions', 'items', 'augments', 'style', 'difficulty', 'tier', 'limit']);
  const championNames = strings(args.champions, 'champions', 5);
  const itemNames = strings(args.items, 'items', 5);
  const augmentNames = strings(args.augments, 'augments', 5);
  const playstyle = text(args.style, 'style', 30);
  const level = difficulty(args.difficulty);
  const wantedTier = tier(args.tier);
  const max = limit(args.limit);

  if (!championNames.length && !itemNames.length && !augmentNames.length && !playstyle && level === undefined) {
    const summaries = await searchComps('', { tier: wantedTier, style: playstyle }, max);
    const comps = (await Promise.all(summaries.map((entry) => getComp(entry.slug, lang)))).filter(
      (comp): comp is CompData => comp !== null
    );
    return { tool: 'find_comps', payload: { comps: summaries }, comps };
  }

  const [catalog, comps] = await Promise.all([loadCatalog(), listComps(undefined, lang) as Promise<CompData[]>]);
  const champions = resolve(catalog, championNames, 'champion');
  const items = resolve(catalog, itemNames, 'item');
  const augments = resolve(catalog, augmentNames, 'augment');
  const ambiguous = [...champions.ambiguous, ...items.ambiguous, ...augments.ambiguous];
  const unresolved = [...champions.unresolved, ...items.unresolved, ...augments.unresolved];
  if (ambiguous.length) {
    return { tool: 'find_comps', payload: { ambiguous, unresolved }, ambiguous, unresolved };
  }
  const query: RankingQuery = {
    championIds: champions.entities.map((entity) => entity.id),
    itemIds: items.entities.map((entity) => entity.id),
    augmentIds: augments.entities.map((entity) => entity.id),
    style: playstyle ?? null,
    difficulty: level ?? null,
    lang,
  };
  const candidates = rankComps(comps, query, catalog)
    .filter((candidate) => !wantedTier || candidate.comp.tier === wantedTier)
    .slice(0, max);
  return {
    tool: 'find_comps',
    payload: { candidates: candidates.map(candidatePayload), unresolved },
    candidates,
    comps: candidates.map((candidate) => candidate.comp),
    unresolved,
  };
}

async function searchCompsTool(args: Record<string, unknown>, lang: Lang): Promise<ToolExecution> {
  allowed(args, ['query', 'tier', 'style', 'limit']);
  const query = text(args.query, 'query', 80) ?? '';
  const wantedTier = tier(args.tier);
  const playstyle = text(args.style, 'style', 30);
  const summaries = await searchComps(query, { tier: wantedTier, style: playstyle }, limit(args.limit));
  if (!summaries.length && query.length >= 3) {
    const fallback = await findComps({ champions: [query], tier: wantedTier, limit: limit(args.limit) }, lang);
    if (fallback.candidates?.length) return { ...fallback, tool: 'search_comps' };
  }
  const comps = (await Promise.all(summaries.map((entry) => getComp(entry.slug, lang)))).filter(
    (comp): comp is CompData => comp !== null
  );
  return { tool: 'search_comps', payload: { comps: summaries }, comps };
}

async function getCompTool(args: Record<string, unknown>, lang: Lang): Promise<ToolExecution> {
  allowed(args, ['slug']);
  const comp = await getComp(slug(args.slug), lang);
  if (!comp) throw new AssistantToolError('Comp not found.');
  return { tool: 'get_comp', payload: { comp: compPayload(comp) }, comps: [comp] };
}

async function compareCompsTool(args: Record<string, unknown>, lang: Lang): Promise<ToolExecution> {
  allowed(args, ['slugs']);
  const slugs = strings(args.slugs, 'slugs', 3);
  if (slugs.length < 2) throw new AssistantToolError('slugs must contain 2 or 3 comps.');
  const comparison = await compareComps(slugs.map((entry) => slug(entry, 'slugs')), lang);
  if (!comparison) throw new AssistantToolError('Could not load both comps.');
  return {
    tool: 'compare_comps',
    payload: {
      comps: comparison.comps.map(compPayload),
      commonUnits: comparison.commonUnits,
      commonItems: comparison.commonItems,
      commonAugments: comparison.commonAugments,
      differences: comparison.differences,
    },
    comps: comparison.comps,
    comparison,
  };
}

async function getStatsTool(args: Record<string, unknown>, lang: Lang): Promise<ToolExecution> {
  allowed(args, ['name', 'type']);
  const name = text(args.name, 'name', 80);
  const type = text(args.type, 'type', 20);
  if (!name) throw new AssistantToolError('name is required.');
  const [catalog, meta] = await Promise.all([loadCatalog(), loadMetaStats()]);

  if (type === 'comp' || (!type && !catalog.byName.has(name))) {
    const direct = /^[a-z0-9-]+$/i.test(name) ? await getComp(name, lang) : null;
    const summary = direct ? null : (await searchComps(name, {}, 1))[0];
    const comp = direct ?? (summary ? await getComp(summary.slug, lang) : null);
    if (!comp) throw new AssistantToolError('Comp not found.');
    const stats = compStats(meta, comp, lang);
    return { tool: 'get_stats', payload: { stats: stats ? [stats] : [] }, comps: [comp], stats: stats ? [stats] : [] };
  }

  const wanted = type === undefined ? null : type;
  if (wanted !== null && !['champion', 'item', 'augment'].includes(wanted)) {
    throw new AssistantToolError('type must be champion, item, augment or comp.');
  }
  const types: GameEntityType[] = wanted ? [wanted as GameEntityType] : ['champion', 'item', 'augment'];
  for (const candidateType of types) {
    const resolution = resolve(catalog, [name], candidateType);
    if (resolution.ambiguous.length) {
      return { tool: 'get_stats', payload: { ambiguous: resolution.ambiguous }, ambiguous: resolution.ambiguous };
    }
    const entity = resolution.entities[0];
    if (!entity) continue;
    const stats = entityStats(meta, entity, lang);
    return { tool: 'get_stats', payload: { entity: entity.name, stats: stats ? [stats] : [] }, stats: stats ? [stats] : [] };
  }
  throw new AssistantToolError('Entity not found.');
}

export async function executeAssistantTool(name: string, value: unknown, lang: Lang): Promise<ToolExecution> {
  const args = record(value);
  switch (name) {
    case 'find_comps':
      return findComps(args, lang);
    case 'search_comps':
      return searchCompsTool(args, lang);
    case 'get_comp':
      return getCompTool(args, lang);
    case 'compare_comps':
      return compareCompsTool(args, lang);
    case 'get_stats':
      return getStatsTool(args, lang);
    default:
      throw new AssistantToolError('Unknown tool.');
  }
}
