import { readFileSync } from 'node:fs';
import { listComps } from '../comps.ts';
import { resolveEntitlement, type Entitlement } from '../membership/lifecycle.ts';
import { balances, type Balance } from '../membership/quota.ts';
import { incomeBase, interest, mechanicsPatch, poolSizes, shopOdds, streakBonus, xpTable } from '@tftiq/shared/mechanics';
import { economyForComp, matchEconomyComp, type EconomyPlanComp, type EconomyPlanStrategy } from '@tftiq/shared/economy-match';
import { sharedDataPath } from '../shared-data.ts';
import type {
  CatalogEntity,
  CompComparison,
  CompData,
  CompSummary,
  GameEntityType,
  EntityType,
  Lang,
  RankedComp,
  RankingQuery,
} from './contracts.ts';
import { localizeEntityNames, localizedName, normalizeSpaced, pickEntityMatch, searchCatalog, type Catalog } from './entities.ts';
import { compStats, entityStats, loadMetaStats, type StatEvidence } from './meta-stats.ts';
import type { ProviderTool } from './provider.ts';
import { rankComps } from './ranking.ts';
import { translateText } from './translate.ts';
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
  unresolvedCandidates?: { name: string; entityType: EntityType | null }[];
};

export class AssistantToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssistantToolError';
  }
}

type LootItemData = { kind: string; name: string; count: string | null; cost: number | null; stars: number | null };
type LootOutcomeData = { chance: string | null; items: LootItemData[] };
type LootTableData = {
  title: string;
  level: number | null;
  facts: { label: string; value: string }[];
  outcomes: LootOutcomeData[];
};
type LootPlainTableData = {
  title: string;
  note: string | null;
  group: string | null;
  headers: string[];
  rows: { value: string }[][];
};
type LootPageData = {
  slug: string;
  title: string;
  sourceUrl: string;
  owners: { kind: string; name: string; description: string | null; stages: string[]; tables: LootTableData[] }[];
  tables: LootPlainTableData[];
  augmentDistribution: { path: string; tier: string; conditional: string; weight: string; title: string }[];
};
type LootSnapshot = {
  source: { provider: string; page: string; set: string; generatedAt: string; fetchedAt: string };
  pages: LootPageData[];
};
type EconomySnapshot = {
  source: { provider: string; page: string; set: string; generatedAt: string | null; fetchedAt: string };
  strategies: EconomyPlanStrategy[];
  comps: EconomyPlanComp[];
};

const economyData = JSON.parse(readFileSync(sharedDataPath('economy.json'), 'utf8')) as EconomySnapshot;
const lootData = JSON.parse(readFileSync(sharedDataPath('loot-tables.json'), 'utf8')) as LootSnapshot;

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
      description:
        'Get the full board (with row/col positions), items, augments, traits, matchups (counters), tips and stages for one comp slug.',
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
      description: 'Get TFTIQ stats for a champion, item, augment or comp slug.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', maxLength: 80, description: 'Entity name or comp slug.' },
          type: { type: 'string', enum: ['champion', 'item', 'trait', 'augment', 'comp'] },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_game_mechanics',
      description:
        'Retrieve exact Set 18 system mechanics tables or a specific TFT loot/augment table. Use instead of recalling numbers from memory for income, interest, shop odds, leveling XP, champion pool, loot tables or augment odds. Mechanic milestone/cashout reward tables (Coven harvests, Golden Egg, Teemo, Kayle, Primal, Warpath, Expedition, Baron’s Lair, Booster Packs, Bounty Seeker, Cooking Pot, Greenfather, Blackthorn, Call to Chaos, Caretaker’s Favor) are loot_tables pages.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          table: {
            type: 'string',
            enum: ['income', 'shop_odds', 'leveling', 'champion_pool', 'loot_tables', 'augment_odds'],
            description: 'Which structured game table to retrieve.',
          },
          slug: { type: 'string', maxLength: 80, description: 'Optional loot-table page slug, for example stage-loot-orbs or coven.' },
          query: { type: 'string', maxLength: 80, description: 'Optional table title, outcome, item or rule to narrow a loot-table page.' },
        },
        required: ['table'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_economy_plan',
      description: 'Retrieve sourced, stage-by-stage economy guidance. Use for Fast 8/9, reroll plans, a comp-specific level curve, or advice for when to level, roll and save.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          strategy: { type: 'string', maxLength: 50, description: 'Named strategy, for example Fast 8 or 2-Cost Reroll.' },
          comp_slug: { type: 'string', maxLength: 80, description: 'TFTIQ comp slug for its matched or derived economy curve.' },
          query: { type: 'string', maxLength: 80, description: 'Search a comp, carry or strategy from the sourced economy dataset.' },
        },
      },
    },
  },
];

// Account-scoped, so it is not part of ASSISTANT_TOOLS: a guest turn has no
// account to read and must never be offered a tool that can only fail.
export const USER_USAGE_TOOL: ProviderTool = {
  type: 'function',
  function: {
    name: 'get_my_usage',
    description:
      "Look up the signed-in user's TFTIQ plan and quota: Coach turns left this period and today, voice seconds, read-aloud characters, period dates and request limits. Use for questions about the user's own plan, remaining usage, quota or renewal date.",
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
};

type UsageBalances = Record<'chat' | 'stt_seconds' | 'tts_characters', Balance> & { chatToday: Balance };

function metricPayload(balance: Balance) {
  return {
    allowance: balance.allowance,
    used: balance.consumed,
    reserved: balance.reserved,
    // A reserved unit is already promised to an in-flight request, so it is not
    // available to the next turn (same rule as GET /api/me/usage).
    remaining: Math.max(0, balance.allowance - balance.consumed - balance.reserved),
  };
}

export function usagePayload(
  entitlement: Extract<Entitlement, { ok: true }>,
  quota: UsageBalances,
  lang: Lang,
  now: number
) {
  const periodEnd = new Date(entitlement.plan.periodEnd).toISOString();
  // The product's calendar is Asia/Ho_Chi_Minh, so a prose date must not be the
  // UTC slice: 2026-10-31T17:00Z is already 1 November in Vietnam.
  const endDay = new Date(entitlement.plan.periodEnd + 7 * 3_600_000).toISOString().slice(0, 10);
  const chat = metricPayload(quota.chat);
  const chatToday = metricPayload(quota.chatToday);
  return {
    plan: {
      code: entitlement.planCode,
      label: entitlement.planLabel,
      paid: entitlement.paid,
      termDays: entitlement.plan.termDays,
    },
    periodStart: new Date(entitlement.plan.periodStart).toISOString(),
    periodEnd,
    periodRemainingMs: Math.max(0, entitlement.plan.periodEnd - now),
    nextPeriodStartsAt: entitlement.nextPeriodStartsAt === null ? null : new Date(entitlement.nextPeriodStartsAt).toISOString(),
    lastPeriodEndsAt: entitlement.lastPeriodEndsAt === null ? null : new Date(entitlement.lastPeriodEndsAt).toISOString(),
    metrics: {
      chat,
      stt_seconds: metricPayload(quota.stt_seconds),
      tts_characters: metricPayload(quota.tts_characters),
    },
    chatToday,
    limits: {
      chatRequestsPerMinute: entitlement.plan.chatRequestsPerMinute,
      maxConcurrentRequests: entitlement.plan.maxConcurrentRequests,
      maxSttSecondsPerRequest: entitlement.plan.maxSttSecondsPerRequest,
      maxConcurrentTtsChunks: entitlement.plan.maxConcurrentTtsChunks,
    },
    summary: lang === 'vi'
      ? `Gói ${entitlement.planLabel}${entitlement.paid ? '' : ' (miễn phí)'}: còn ${chat.remaining}/${chat.allowance} lượt hỏi trong kỳ, hôm nay còn ${chatToday.remaining}/${chatToday.allowance} lượt; kỳ hiện tại kết thúc ${endDay}.`
      : `Plan ${entitlement.planLabel}${entitlement.paid ? '' : ' (free)'}: ${chat.remaining} of ${chat.allowance} Coach turns left this period and ${chatToday.remaining} of ${chatToday.allowance} today; the current period ends ${endDay}.`,
  };
}

async function getMyUsageTool(args: Record<string, unknown>, lang: Lang, userId?: string | null): Promise<ToolExecution> {
  allowed(args, []);
  if (!userId) throw new AssistantToolError('Plan and usage lookup requires a signed-in account.');
  const now = Date.now();
  const entitlement = await resolveEntitlement(userId, now);
  if (!entitlement.ok) throw new AssistantToolError('Membership data is unavailable.');
  let quota: UsageBalances;
  try {
    quota = await balances(userId, entitlement.plan, now);
  } catch {
    // A failed balance read is an outage, never "you have nothing left".
    throw new AssistantToolError('Membership data is unavailable.');
  }
  return { tool: 'get_my_usage', payload: usagePayload(entitlement, quota, lang, now) };
}

function normalized(value: string): string {
  return normalizeSpaced(value);
}

// Per-mechanic reward tables (cashouts, harvests, milestones) as opposed to
// the system-wide reference tables. Bare cashout questions ("nên nổ hũ mốc
// nào?") name no mechanic, so the assistant clarifies with this list instead
// of searching the loot dataset for nothing.
export const MECHANIC_TABLE_SLUGS = [
  'coven', 'the-golden-egg', 'teemo', 'kayle', 'primal', 'warpath', 'expedition',
  'barons-lair', 'booster-pack', 'booster-pack-plus', 'booster-pack-plus-plus',
  'bounty-seeker', 'cooking-pot', 'greenfather', 'blackthorn', 'call-to-chaos',
  'caretakers-favor', 'gold-subscription', 'slightly-magic-roll', 'magic-roll',
];

export function mechanicTablePages(lang: Lang): { slug: string; title: string }[] {
  return lootData.pages
    .filter((page) => MECHANIC_TABLE_SLUGS.includes(page.slug))
    .map((page) => ({ slug: page.slug, title: translateLoot(page.title, 'page-title', lang) }));
}

// Sources are rendered under the reply, so they point at the page on this site
// that shows the same numbers. The feeds these tables were collected from are
// ours to know about, not something a reader should be sent to.
function mechanicsSource(path: string, lang: Lang) {
  return {
    provider: 'TFTIQ',
    url: `/${lang}/${path}`,
    set: lootData.source.set,
    patch: mechanicsPatch,
    updatedAt: lootData.source.fetchedAt,
  };
}

function translateLoot(value: string, kind: string, lang: Lang): string {
  return translateText(lang, 'loot', kind, value);
}

function lootQueryMatches(value: unknown, query: string, lang: Lang): boolean {
  const needle = normalized(query);
  if (!needle) return true;
  const raw = JSON.stringify(value);
  if (normalized(raw).includes(needle)) return true;
  if (lang !== 'vi') return false;
  const stringsIn = (entry: unknown): string[] => {
    if (typeof entry === 'string') return [entry];
    if (Array.isArray(entry)) return entry.flatMap(stringsIn);
    if (entry && typeof entry === 'object') return Object.values(entry).flatMap(stringsIn);
    return [];
  };
  const kinds = [
    'page-title', 'owner-name', 'owner-description', 'table-title', 'table-note', 'table-group',
    'fact-label', 'fact-value', 'column-header', 'cell', 'outcome-item', 'augment-odds-title',
  ];
  return stringsIn(value).some((source) =>
    kinds.some((kind) => normalized(translateLoot(source, kind, lang)).includes(needle))
  );
}

function augmentTier(tier: string, lang: Lang): string {
  if (lang !== 'vi') return tier;
  return tier === 'Gold' ? 'Vàng' : tier === 'Silver' ? 'Bạc' : tier === 'Prismatic' ? 'Lăng kính' : tier;
}

function lootTablePayload(table: LootTableData, lang: Lang) {
  return {
    title: translateLoot(table.title, 'table-title', lang),
    level: table.level,
    facts: table.facts.map((fact) => ({
      label: translateLoot(fact.label, 'fact-label', lang),
      value: translateLoot(fact.value, 'fact-value', lang),
    })),
    outcomes: table.outcomes.map((outcome) => ({
      chance: outcome.chance,
      // Null-heavy item objects blow the tool-message budget on multi-table
      // pages; omit fields the row does not carry.
      items: outcome.items.map((item) => ({
        kind: item.kind,
        name: translateLoot(item.name, 'outcome-item', lang),
        ...(item.count !== null ? { count: item.count } : {}),
        ...(item.cost !== null ? { cost: item.cost } : {}),
        ...(item.stars !== null ? { stars: item.stars } : {}),
      })),
    })),
  };
}

function lootPagePayload(page: LootPageData, lang: Lang, query?: string) {
  const needle = normalized(query ?? '');
  const matches = (value: unknown) => lootQueryMatches(value, query ?? '', lang);
  const ownerTables = page.owners.flatMap((owner) => {
    const ownerMatches = matches({ name: owner.name, description: owner.description });
    const tables = ownerMatches ? owner.tables : owner.tables.filter(matches);
    return tables.map((table) => ({
      owner: translateLoot(owner.name, 'owner-name', lang),
      title: translateLoot(table.title, 'table-title', lang),
      level: table.level,
      facts: table.facts.map((fact) => ({
        label: translateLoot(fact.label, 'fact-label', lang),
        value: translateLoot(fact.value, 'fact-value', lang),
      })),
      outcomes: lootTablePayload(table, lang).outcomes.slice(0, 8).map((outcome) => ({
        ...outcome,
        items: outcome.items.slice(0, 8),
      })),
    }));
  });
  const plainTables = page.tables
    .filter(matches)
    .map((table) => ({
      title: translateLoot(table.title, 'table-title', lang),
      note: table.note ? translateLoot(table.note, 'table-note', lang) : null,
      group: table.group ? translateLoot(table.group, 'table-group', lang) : null,
      headers: table.headers.map((header) => translateLoot(header, 'column-header', lang)),
      rows: table.rows.slice(0, 12).map((row) => row.map((cell) => ({
        value: translateLoot(cell.value, 'cell', lang),
      }))),
    }));
  const augmentDistribution = page.augmentDistribution
    .filter(matches)
    .map((entry) => ({
      path: entry.path,
      tier: entry.tier,
      conditional: entry.conditional,
      weight: entry.weight,
      title: translateLoot(entry.title, 'augment-odds-title', lang),
    }));
  const allTables = [...ownerTables, ...plainTables];
  return {
    slug: page.slug,
    title: translateLoot(page.title, 'page-title', lang),
    ...(needle
      ? {
          summary: lang === 'vi'
            ? `Tìm thấy ${allTables.length + augmentDistribution.length} bảng phù hợp trong ${translateLoot(page.title, 'page-title', lang)}.`
            : `${allTables.length + augmentDistribution.length} matching tables found in ${translateLoot(page.title, 'page-title', lang)}.`,
          tables: allTables.slice(0, 3),
          augmentDistribution: augmentDistribution.slice(0, 12),
          matchedCount: allTables.length + augmentDistribution.length,
          truncated:
            allTables.length > 3 ||
            augmentDistribution.length > 12 ||
            page.tables.some((table) => matches(table) && table.rows.length > 12) ||
            page.owners.some((owner) =>
              owner.tables.some((table) =>
                (matches({ name: owner.name, description: owner.description }) || matches(table)) &&
                (table.outcomes.length > 8 || table.outcomes.some((outcome) => outcome.items.length > 8))
              )
            ),
        }
      : allTables.length > 0 && allTables.length <= 12
        ? // Small pages (mechanic cashout tables, e.g. the nine Coven harvests)
          // return every table at once: a table-index round-trip made the model
          // stop at the listing instead of fetching the reward details.
          {
            summary: lang === 'vi'
              ? `${translateLoot(page.title, 'page-title', lang)}: trả về đầy đủ ${allTables.length} bảng.`
              : `${translateLoot(page.title, 'page-title', lang)}: all ${allTables.length} tables returned.`,
            tables: allTables,
            tableCount: allTables.length,
          }
        : {
            summary: lang === 'vi'
              ? `${translateLoot(page.title, 'page-title', lang)} có ${page.owners.reduce((total, owner) => total + owner.tables.length, 0) + page.tables.length} bảng; hãy chọn bảng cần tra.`
              : `${translateLoot(page.title, 'page-title', lang)} has ${page.owners.reduce((total, owner) => total + owner.tables.length, 0) + page.tables.length} tables; choose one to inspect.`,
            tableIndex: [
              ...page.owners.flatMap((owner) => owner.tables.map((table) => translateLoot(table.title, 'table-title', lang))),
              ...page.tables.map((table) => translateLoot(table.title, 'table-title', lang)),
            ],
            augmentDistributionCount: page.augmentDistribution.length,
            instruction: lang === 'vi'
              ? 'Gọi lại get_game_mechanics với query là tên bảng hoặc vật phẩm cần tra để lấy số liệu chi tiết.'
              : 'Call get_game_mechanics again with query set to a table or item name to retrieve its details.',
          }),
  };
}

async function getGameMechanicsTool(args: Record<string, unknown>, lang: Lang): Promise<ToolExecution> {
  allowed(args, ['table', 'slug', 'query']);
  const table = text(args.table, 'table', 30);
  const pageSlug = text(args.slug, 'slug', 80);
  const query = text(args.query, 'query', 80);
  if (!table || !['income', 'shop_odds', 'leveling', 'champion_pool', 'loot_tables', 'augment_odds'].includes(table)) {
    throw new AssistantToolError('table must be income, shop_odds, leveling, champion_pool, loot_tables or augment_odds.');
  }
  if ((pageSlug || query) && table !== 'loot_tables' && table !== 'augment_odds') {
    throw new AssistantToolError('slug and query are only supported for loot_tables and augment_odds.');
  }

  if (table === 'loot_tables' || table === 'augment_odds') {
    if (!pageSlug) {
      if (query && table === 'loot_tables') {
        const matches = lootData.pages.flatMap((page) => {
          const result = lootPagePayload(page, lang, query);
          return 'matchedCount' in result && result.matchedCount > 0 ? [result] : [];
        });
        if (!matches.length) {
          // A query that matches nothing must not read as "the data has no
          // such table" — hand back the page index so the model can name the
          // mechanics the user might mean.
          const pages = lootData.pages
            .map((page) => ({ slug: page.slug, title: translateLoot(page.title, 'page-title', lang) }));
          return {
            tool: 'get_game_mechanics',
            payload: {
              table,
              noMatch: query,
              pages,
              source: mechanicsSource('tables', lang),
              summary: lang === 'vi'
                ? `Không có trang nào khớp "${query}"; đây là danh sách các trang bảng có sẵn.`
                : `No page matched "${query}"; here is the list of available table pages.`,
            },
          };
        }
        return {
          tool: 'get_game_mechanics',
          payload: {
            table,
            results: matches.slice(0, 3),
            matchedPages: matches.length,
            truncated: matches.length > 3,
            source: mechanicsSource('tables', lang),
            summary: lang === 'vi'
              ? `Tìm thấy kết quả "${query}" trong ${matches.length} trang bảng loot.`
              : `Found "${query}" in ${matches.length} loot-table pages.`,
          },
        };
      }
      if (query && table === 'augment_odds') {
        const matches = lootData.pages.flatMap((page) =>
          page.augmentDistribution
            .filter((entry) =>
              normalized(JSON.stringify(entry)).includes(normalized(query)) ||
              normalized(translateLoot(entry.title, 'augment-odds-title', lang)).includes(normalized(query)) ||
              normalized(augmentTier(entry.tier, lang)).includes(normalized(query))
            )
            .map((entry) => ({
              page: translateLoot(page.title, 'page-title', lang),
              slug: page.slug,
              path: entry.path,
              tier: augmentTier(entry.tier, lang),
              conditional: entry.conditional,
              weight: entry.weight,
              title: translateLoot(entry.title, 'augment-odds-title', lang),
            }))
        );
        return {
          tool: 'get_game_mechanics',
          payload: {
            table,
            entries: matches.slice(0, 12),
            matchedCount: matches.length,
            truncated: matches.length > 12,
            source: mechanicsSource('tables', lang),
            summary: lang === 'vi'
              ? `Tìm thấy ${matches.length} kết quả tỉ lệ nâng cấp cho "${query}".`
              : `Found ${matches.length} augment-odds rows matching "${query}".`,
          },
        };
      }
      const pages = lootData.pages
        .filter((page) => table === 'loot_tables' || page.augmentDistribution.length > 0)
        .map((page) => ({ slug: page.slug, title: translateLoot(page.title, 'page-title', lang) }));
      return {
        tool: 'get_game_mechanics',
        payload: {
          table,
          pages,
          source: mechanicsSource('tables', lang),
          summary: lang === 'vi'
            ? 'Đây là danh sách các trang bảng. Chọn slug phù hợp rồi gọi lại để lấy bảng chi tiết.'
            : 'This is the table-page index. Select a matching slug and call again for the table details.',
        },
      };
    }
    const page = lootData.pages.find((entry) => entry.slug === pageSlug);
    if (!page) throw new AssistantToolError('Loot table page not found.');
    if (table === 'augment_odds' && !page.augmentDistribution.length) {
      throw new AssistantToolError('This page has no augment odds table.');
    }
    if (table === 'loot_tables' && !query) {
      return {
        tool: 'get_game_mechanics',
        payload: { ...lootPagePayload(page, lang), source: mechanicsSource(`tables/${page.slug}`, lang) },
      };
    }
    if (table === 'augment_odds') {
      const entries = page.augmentDistribution.filter((entry) =>
        !query ||
        normalized(JSON.stringify(entry)).includes(normalized(query)) ||
        normalized(translateLoot(entry.title, 'augment-odds-title', lang)).includes(normalized(query)) ||
        normalized(augmentTier(entry.tier, lang)).includes(normalized(query))
      );
      return {
        tool: 'get_game_mechanics',
        payload: {
          table,
          page: translateLoot(page.title, 'page-title', lang),
          entries: entries.slice(0, 12).map((entry) => ({
            path: entry.path,
            tier: augmentTier(entry.tier, lang),
            conditional: entry.conditional,
            weight: entry.weight,
            title: translateLoot(entry.title, 'augment-odds-title', lang),
          })),
          matchedCount: entries.length,
          truncated: entries.length > 12,
          source: mechanicsSource(`tables/${page.slug}`, lang),
          summary: lang === 'vi' ? `Có ${entries.length} kết quả bảng tỉ lệ nâng cấp.` : `${entries.length} augment-odds rows matched.`,
        },
      };
    }
    const data = lootPagePayload(page, lang, query);
    return {
      tool: 'get_game_mechanics',
      payload: {
        table,
        ...data,
        source: mechanicsSource(`tables/${page.slug}`, lang),
        summary: data.summary,
      },
    };
  }

  if (table === 'income') {
    return {
      tool: 'get_game_mechanics',
      payload: {
        table,
        baseIncome: incomeBase,
        interest,
        streakBonus,
        interestTiming: lang === 'vi'
          ? 'Lãi tính trên lượng vàng giữ trước khi cộng thu nhập nền của vòng đó.'
          : 'Interest is calculated from gold held before that round’s base income is added.',
        source: mechanicsSource('tables/gold-income', lang),
        summary: lang === 'vi'
          ? 'Thu nhập mỗi vòng gồm vàng nền, lãi theo vàng đang giữ và thưởng chuỗi thắng/thua; tối đa 5 vàng lãi ở mốc 50 vàng.'
          : 'Round income combines base gold, interest on held gold, and streak bonuses; interest caps at 5 gold when holding 50.',
      },
    };
  }
  if (table === 'shop_odds') {
    return {
      tool: 'get_game_mechanics',
      payload: {
        table,
        costOrder: [1, 2, 3, 4, 5],
        rows: shopOdds,
        source: mechanicsSource('tables/shop-odds-pool-size-xp-table', lang),
        summary: lang === 'vi' ? 'Bảng tỉ lệ tướng trong shop theo cấp, thứ tự cost 1–5.' : 'Shop champion odds by level, ordered by cost 1–5.',
      },
    };
  }
  if (table === 'leveling') {
    return {
      tool: 'get_game_mechanics',
      payload: {
        table,
        freeXpPerRound: 2,
        xpPurchase: { gold: 4, xp: 4 },
        xpToLevel: xpTable,
        source: mechanicsSource('tables/shop-odds-pool-size-xp-table', lang),
        summary: lang === 'vi'
          ? 'Nhận 2 XP miễn phí mỗi vòng; mua 4 XP tốn 4 vàng. Bảng cho biết XP cần để đạt từng cấp.'
          : 'Gain 2 free XP per round; buying 4 XP costs 4 gold. The table lists XP needed to reach each level.',
      },
    };
  }
  return {
    tool: 'get_game_mechanics',
    payload: {
      table,
      copiesPerCost: poolSizes,
      starCopies: { twoStar: 3, threeStar: 9 },
      source: mechanicsSource('tables/shop-odds-pool-size-xp-table', lang),
      summary: lang === 'vi'
        ? 'Số bản sao của từng tướng trong pool dùng chung; 3 bản sao lên 2 sao, 9 bản sao lên 3 sao.'
        : 'Champion copies per cost in the shared pool; 3 copies make a 2-star and 9 make a 3-star.',
    },
  };
}

async function getEconomyPlanTool(args: Record<string, unknown>, lang: Lang): Promise<ToolExecution> {
  allowed(args, ['strategy', 'comp_slug', 'query']);
  const strategyName = text(args.strategy, 'strategy', 50);
  const compSlug = text(args.comp_slug, 'comp_slug', 80);
  const query = text(args.query, 'query', 80);
  if ([strategyName, compSlug, query].filter(Boolean).length !== 1) {
    throw new AssistantToolError('Provide exactly one of strategy, comp_slug or query.');
  }

  const strategyNeedle = normalized(strategyName ?? query ?? '');
  const strategy = economyData.strategies.find(
    (entry) => normalized(entry.name) === strategyNeedle || normalized(entry.name).replaceAll(' ', '-') === normalized(strategyName ?? '')
  );
  if (strategy) {
    const plan = translatedStrategy(strategy, lang);
    return {
      tool: 'get_economy_plan',
      payload: {
        type: 'strategy',
        plan,
        source: economySource(lang),
        summary: lang === 'vi'
          ? `Kế hoạch ${plan.name} có ${plan.rounds.length} mốc vòng, bao gồm hướng dẫn lên cấp, roll và giữ vàng.`
          : `${plan.name} has ${plan.rounds.length} round-by-round steps for leveling, rolling and saving gold.`,
      },
    };
  }

  if (compSlug) {
    const comp = await getComp(slug(compSlug, 'comp_slug'), lang);
    if (!comp) throw new AssistantToolError('Comp not found.');
    const plan = economyForComp(comp, economyData.comps, economyData.strategies);
    const matched = matchEconomyComp(comp, economyData.comps)?.comp;
    const strategyInfo = economyData.strategies.find((entry) => entry.name === plan.strategy);
    const data = {
      slug: comp.slug,
      name: comp.title,
      carry: comp.carry.name,
      strategy: translateText(lang, 'economy', 'strategy-name', plan.strategy),
      levelCurve: plan.levelCurve.map((entry) => ({
        stage: entry.stage,
        text: translateText(lang, 'economy', 'round-plan', entry.text),
      })),
      tips: matched?.tips.map((tip) => translateText(lang, 'economy', 'comp-tip', tip)) ?? [],
      ...(strategyInfo ? { strategyPlan: translatedStrategy(strategyInfo, lang) } : {}),
    };
    return {
      tool: 'get_economy_plan',
      payload: {
        type: 'comp',
        comp: data,
        source: economySource(lang),
        summary: lang === 'vi'
          ? `${comp.title} phù hợp với chiến thuật ${data.strategy}; đường cong cấp có ${data.levelCurve.length} mốc vòng.`
          : `${comp.title} maps to ${data.strategy}; its level curve has ${data.levelCurve.length} round steps.`,
      },
      comps: [comp],
    };
  }

  const queryNeedle = normalized(query ?? '');
  const matchingComps = economyData.comps.filter((entry) =>
    [entry.slug, entry.name, entry.carry ?? ''].some((value) => normalized(value).includes(queryNeedle))
  );
  if (!matchingComps.length) throw new AssistantToolError('No economy strategy or comp matched that query.');
  if (matchingComps.length > 1) {
    return {
      tool: 'get_economy_plan',
      payload: {
        type: 'matches',
        matches: matchingComps.slice(0, 5).map((entry) => ({
          slug: entry.slug,
          name: translateText(lang, 'economy', 'comp-name', entry.name),
          carry: entry.carry,
          strategy: entry.strategy
            ? translateText(lang, 'economy', 'strategy-name', entry.strategy)
            : null,
        })),
        matchedCount: matchingComps.length,
        source: economySource(lang),
        summary: lang === 'vi'
          ? `Có ${matchingComps.length} comp kinh tế khớp; hãy chọn đúng comp rồi truy vấn lại.`
          : `${matchingComps.length} economy comps matched; select one and query again for its plan.`,
      },
    };
  }
  const plan = economyPlanForDatasetComp(matchingComps[0], lang);
  return {
    tool: 'get_economy_plan',
    payload: {
      type: 'comp',
      comp: plan,
      source: economySource(lang),
      summary: lang === 'vi'
        ? `Kế hoạch kinh tế cho ${plan.name}: ${plan.strategy ?? 'chưa phân loại'}, ${plan.levelCurve.length} mốc vòng.`
        : `Economy plan for ${plan.name}: ${plan.strategy ?? 'unclassified'}, ${plan.levelCurve.length} round steps.`,
    },
  };
}

function translatedStrategy(strategy: EconomyPlanStrategy, lang: Lang) {
  return {
    id: normalized(strategy.name).replaceAll(' ', '-'),
    name: translateText(lang, 'economy', 'strategy-name', strategy.name),
    rounds: strategy.rounds.map((round) => ({
      round: round.round,
      text: translateText(lang, 'economy', 'round-plan', round.text),
    })),
  };
}

function economySource(lang: Lang) {
  return {
    provider: 'TFTIQ',
    url: `/${lang}/economy`,
    set: economyData.source.set,
    updatedAt: economyData.source.fetchedAt,
  };
}

function economyPlanForDatasetComp(comp: EconomyPlanComp, lang: Lang) {
  const strategy = economyData.strategies.find((entry) => entry.name === comp.strategy);
  return {
    slug: comp.slug,
    name: translateText(lang, 'economy', 'comp-name', comp.name),
    carry: comp.carry,
    strategy: comp.strategy ? translateText(lang, 'economy', 'strategy-name', comp.strategy) : null,
    levelCurve: comp.levelCurve.map((entry) => ({
      stage: entry.stage,
      text: translateText(lang, 'economy', 'round-plan', entry.text),
    })),
    tips: comp.tips.map((tip) => translateText(lang, 'economy', 'comp-tip', tip)),
    ...(strategy ? { strategyPlan: translatedStrategy(strategy, lang) } : {}),
  };
}

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

function summaryPayload(summary: CompSummary, catalog: Catalog, lang: Lang) {
  const name = (value: string) => localizedName(catalog, value, lang);
  return {
    ...summary,
    carry: name(summary.carry),
    units: summary.units.map(name),
    traits: summary.traits.map(name),
  };
}

function candidatePayload(candidate: RankedComp, index: number, catalog: Catalog, lang: Lang) {
  const comp = candidate.comp;
  const name = (value: string) => localizedName(catalog, value, lang);
  return {
    rank: index + 1,
    slug: comp.slug,
    title: comp.title,
    tier: comp.tier,
    style: comp.style,
    score: candidate.score,
    reasons: candidate.reasons,
    units: comp.units.map((unit) => name(unit.name)),
    carry: name(comp.carry.name),
    items: comp.items.map((item) => name(item.name)),
    augments: comp.augments.map((augment) => name(augment.name)),
    augmentTypes: comp.augmentTypes,
    traits: comp.traits.map((trait) => ({ name: name(trait.name), count: trait.count })),
  };
}

function compPayload(comp: CompData, catalog: Catalog, lang: Lang) {
  const name = (value: string) => localizedName(catalog, value, lang);
  return {
    slug: comp.slug,
    title: comp.title,
    tier: comp.tier,
    style: comp.style,
    difficulty: comp.difficulty,
    // row/col carry the board layout so position questions are answerable;
    // matchups list which comps this one counters or is countered by.
    units: comp.units.map((unit) => ({
      name: name(unit.name),
      cost: unit.cost,
      row: unit.row,
      col: unit.col,
      items: unit.items.map((item) => name(item.name)),
    })),
    carry: name(comp.carry.name),
    items: comp.items.map((item) => name(item.name)),
    augments: comp.augments.map((augment) => name(augment.name)),
    augmentTypes: comp.augmentTypes,
    traits: comp.traits.map((trait) => ({ name: name(trait.name), count: trait.count })),
    matchups: comp.matchups.map((matchup) => ({ slug: matchup.slug, kind: matchup.kind, title: matchup.title, tier: matchup.tier })),
    tips: localizeEntityNames(comp.tips, catalog, lang).slice(0, 400),
    stages: comp.stages
      .slice(0, 4)
      .map((stage) => ({ stage: stage.stage, text: localizeEntityNames(stage.text, catalog, lang) })),
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
    const [catalog, summaries] = await Promise.all([
      loadCatalog(),
      searchComps('', { tier: wantedTier, style: playstyle }, max),
    ]);
    const comps = (await Promise.all(summaries.map((entry) => getComp(entry.slug, lang)))).filter(
      (comp): comp is CompData => comp !== null
    );
    return { tool: 'find_comps', payload: { comps: summaries.map((summary) => summaryPayload(summary, catalog, lang)) }, comps };
  }

  const [catalog, comps] = await Promise.all([loadCatalog(), listComps(undefined, lang) as Promise<CompData[]>]);
  const champions = resolve(catalog, championNames, 'champion');
  const items = resolve(catalog, itemNames, 'item');
  const augments = resolve(catalog, augmentNames, 'augment');
  const ambiguous = [...champions.ambiguous, ...items.ambiguous, ...augments.ambiguous];
  const unresolved = [...champions.unresolved, ...items.unresolved, ...augments.unresolved];
  const unresolvedCandidates = [
    ...champions.unresolved.map((name) => ({ name, entityType: 'champion' as const })),
    ...items.unresolved.map((name) => ({ name, entityType: 'item' as const })),
    ...augments.unresolved.map((name) => ({ name, entityType: 'augment' as const })),
  ];
  if (ambiguous.length) {
    return { tool: 'find_comps', payload: { ambiguous, unresolved }, ambiguous, unresolved, unresolvedCandidates };
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
    payload: { candidates: candidates.map((candidate, index) => candidatePayload(candidate, index, catalog, lang)), unresolved },
    candidates,
    comps: candidates.map((candidate) => candidate.comp),
    unresolved,
    unresolvedCandidates,
  };
}

async function searchCompsTool(args: Record<string, unknown>, lang: Lang): Promise<ToolExecution> {
  allowed(args, ['query', 'tier', 'style', 'limit']);
  const query = text(args.query, 'query', 80) ?? '';
  const wantedTier = tier(args.tier);
  const playstyle = text(args.style, 'style', 30);
  const [catalog, summaries] = await Promise.all([
    loadCatalog(),
    searchComps(query, { tier: wantedTier, style: playstyle }, limit(args.limit)),
  ]);
  if (!summaries.length && query.length >= 3) {
    const fallback = await findComps({ champions: [query], tier: wantedTier, limit: limit(args.limit) }, lang);
    if (fallback.candidates?.length) return { ...fallback, tool: 'search_comps' };
    return {
      tool: 'search_comps',
      payload: { comps: [], unresolved: [query] },
      unresolved: [query],
      unresolvedCandidates: [{ name: query, entityType: 'comp' }],
    };
  }
  const comps = (await Promise.all(summaries.map((entry) => getComp(entry.slug, lang)))).filter(
    (comp): comp is CompData => comp !== null
  );
  return { tool: 'search_comps', payload: { comps: summaries.map((summary) => summaryPayload(summary, catalog, lang)) }, comps };
}

async function getCompTool(args: Record<string, unknown>, lang: Lang): Promise<ToolExecution> {
  allowed(args, ['slug']);
  const compSlug = slug(args.slug);
  const [catalog, comp] = await Promise.all([loadCatalog(), getComp(compSlug, lang)]);
  if (!comp) {
    return {
      tool: 'get_comp',
      payload: { comp: null, unresolved: [compSlug] },
      unresolved: [compSlug],
      unresolvedCandidates: [{ name: compSlug, entityType: 'comp' }],
    };
  }
  return { tool: 'get_comp', payload: { comp: compPayload(comp, catalog, lang) }, comps: [comp] };
}

async function compareCompsTool(args: Record<string, unknown>, lang: Lang): Promise<ToolExecution> {
  allowed(args, ['slugs']);
  const slugs = strings(args.slugs, 'slugs', 3);
  if (slugs.length < 2) throw new AssistantToolError('slugs must contain 2 or 3 comps.');
  const [catalog, comparison] = await Promise.all([
    loadCatalog(),
    compareComps(slugs.map((entry) => slug(entry, 'slugs')), lang),
  ]);
  if (!comparison) throw new AssistantToolError('Could not load both comps.');
  const name = (value: string) => localizedName(catalog, value, lang);
  return {
    tool: 'compare_comps',
    payload: {
      comps: comparison.comps.map((comp) => compPayload(comp, catalog, lang)),
      commonUnits: comparison.commonUnits.map(name),
      commonItems: comparison.commonItems.map(name),
      commonAugments: comparison.commonAugments.map(name),
      differences: comparison.differences.map((difference) => ({
        ...difference,
        uniqueUnits: difference.uniqueUnits.map(name),
        uniqueItems: difference.uniqueItems.map(name),
        uniqueAugments: difference.uniqueAugments.map(name),
      })),
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

  if (type === 'comp') {
    const direct = /^[a-z0-9-]+$/i.test(name) ? await getComp(name, lang) : null;
    const summary = direct ? null : (await searchComps(name, {}, 1))[0];
    const comp = direct ?? (summary ? await getComp(summary.slug, lang) : null);
    if (!comp) {
      return {
        tool: 'get_stats',
        payload: { stats: [], unresolved: [name] },
        unresolved: [name],
        unresolvedCandidates: [{ name, entityType: 'comp' }],
      };
    }
    const stats = compStats(meta, comp, lang);
    return { tool: 'get_stats', payload: { stats: stats ? [stats] : [] }, comps: [comp], stats: stats ? [stats] : [] };
  }

  if (type !== undefined && !['champion', 'item', 'trait', 'augment'].includes(type)) {
    throw new AssistantToolError('type must be champion, item, trait, augment or comp.');
  }
  const wanted: GameEntityType | null = type === undefined ? null : (type as GameEntityType);
  const types: GameEntityType[] = wanted ? [wanted] : ['champion', 'item', 'trait', 'augment'];
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
  if (type === undefined) {
    const direct = /^[a-z0-9-]+$/i.test(name) ? await getComp(name, lang) : null;
    const summary = direct ? null : (await searchComps(name, {}, 1))[0];
    const comp = direct ?? (summary ? await getComp(summary.slug, lang) : null);
    if (comp) {
      const stats = compStats(meta, comp, lang);
      return { tool: 'get_stats', payload: { stats: stats ? [stats] : [] }, comps: [comp], stats: stats ? [stats] : [] };
    }
  }
  const unresolvedType = wanted ?? null;
  return {
    tool: 'get_stats',
    payload: { stats: [], unresolved: [name] },
    unresolved: [name],
    unresolvedCandidates: [{ name, entityType: unresolvedType }],
  };
}

export type AssistantToolContext = { userId?: string | null };

export async function executeAssistantTool(
  name: string,
  value: unknown,
  lang: Lang,
  context: AssistantToolContext = {}
): Promise<ToolExecution> {
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
    case 'get_game_mechanics':
      return getGameMechanicsTool(args, lang);
    case 'get_economy_plan':
      return getEconomyPlanTool(args, lang);
    case 'get_my_usage':
      return getMyUsageTool(args, lang, context.userId);
    default:
      throw new AssistantToolError('Unknown tool.');
  }
}
