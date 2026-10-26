import { createHash } from 'node:crypto';
import { listComps } from '../comps.ts';
import {
  entityId,
  parseEntityId,
  type AssistantIntent,
  type AssistantRecommendation,
  type AssistantRequest,
  type AssistantResponse,
  type AssistantSource,
  type AssistantStatus,
  type CatalogEntity,
  type ChampionBuild,
  type CompComparison,
  type CompData,
  type ItemHolder,
  type ItemUsageEvidence,
  type Lang,
  type UnitBuildEvidence,
  type RankedComp,
  type RankingQuery,
  type ResolvedEntity,
} from './contracts.ts';
import {
  findEntityMentions,
  grantedTrait,
  localizeEntityNames,
  localizedName,
  normalize,
  normalizeSpaced,
  type Catalog,
} from './entities.ts';
import { buildSystemPrompt, buildToolAgentPrompt, buildToolPlannerPrompt, buildUserPrompt, type Evidence } from './prompt.ts';
import {
  activeAssistantModel,
  activeAssistantProvider,
  generateAssistantAnswer,
  ProviderError,
  type ProviderChatMessage,
  type ProviderRequest,
  type ProviderResult,
} from './provider.ts';
import { rankComps } from './ranking.ts';
import { compareComps, getActiveSetAndPatch, loadCatalog } from './tools.ts';
import { compStats, entityStats, itemUsageStats, loadMetaStats, unitBuildStats, type StatEvidence } from './meta-stats.ts';
import {
  isMechanicsQuestion,
  mechanicsAnswer,
  mechanicsFor,
  mechanicsSource,
  type MechanicsEvidence,
} from './mechanics-knowledge.ts';
import { analyzeStrategy, buildStrategyPlan, isStrategyQuestion } from './strategy.ts';
import { parseGeneratedAnswer } from './validate.ts';
import { withInferenceSlot } from './rate-limit.ts';
import { assistantLog } from './logger.ts';
import { ASSISTANT_TOOLS } from './tool-registry.ts';
import { runToolLoop, type ToolFailure, type ToolLoopResult } from './tool-loop.ts';
import type { AmbiguousEntity } from './tool-registry.ts';
import { COMP_ALIASES } from './entity-aliases.ts';
import { summarizeReasoningText, type ReasoningLogWriter } from './assistant-reasoning-store.ts';

export class AssistantContextError extends Error {
  status = 400;
}

// The LLM answers with a JSON object whose first key is "answer". While the
// provider streams raw JSON text, this wrapper decodes the "answer" string
// value incrementally and forwards only its decoded content, so the client
// sees the prose answer and never the JSON scaffolding. Incomplete escape
// sequences stay buffered; if the model never emits the key, nothing streams
// and the final response replaces whatever the client shows.
function createAnswerFieldStreamer(onDelta: (chunk: string) => void): (chunk: string) => void {
  const KEY = '"answer"';
  const ESCAPES: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
  let buffer = '';
  let inValue = false;
  let closed = false;

  return (chunk) => {
    if (closed) return;
    buffer += chunk;
    if (!inValue) {
      const keyAt = buffer.indexOf(KEY);
      if (keyAt === -1) {
        if (buffer.length > KEY.length) buffer = buffer.slice(buffer.length - KEY.length + 1);
        return;
      }
      buffer = buffer.slice(keyAt + KEY.length);
      const colon = /^\s*:\s*"/.exec(buffer);
      if (!colon) {
        if (buffer.length > 16) buffer = buffer.slice(-16);
        return;
      }
      buffer = buffer.slice(colon[0].length);
      inValue = true;
    }

    let decoded = '';
    let index = 0;
    while (index < buffer.length) {
      const char = buffer[index];
      if (char === '\\') {
        if (index + 1 >= buffer.length) break;
        const next = buffer[index + 1];
        if (next === 'u') {
          if (index + 6 > buffer.length) break;
          const code = Number.parseInt(buffer.slice(index + 2, index + 6), 16);
          if (Number.isNaN(code)) {
            closed = true;
            break;
          }
          decoded += String.fromCharCode(code);
          index += 6;
          continue;
        }
        decoded += ESCAPES[next] ?? next;
        index += 2;
        continue;
      }
      if (char === '"') {
        closed = true;
        break;
      }
      decoded += char;
      index += 1;
    }
    buffer = buffer.slice(index);
    if (decoded) onDelta(decoded);
  };
}

// Messages and responses are kept verbatim in the trace so an admin can replay
// what the provider saw; caps keep one request from bloating the table.
const traceMessageLimit = 8_000;
const traceResponseLimit = 20_000;
const traceSystemPreviewLimit = 400;

function traceText(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…[truncated ${value.length - max} chars]`;
}

// The system prompt is near-constant (it only varies with language and evidence
// sections), so a fingerprint is enough to group requests; the per-request
// evidence lives in `messages`. Full text can be rebuilt from the code.
export function traceSystem(system: string): { sha256: string; chars: number; preview: string } {
  return {
    sha256: createHash('sha256').update(system).digest('hex').slice(0, 16),
    chars: system.length,
    preview: traceText(system, traceSystemPreviewLimit),
  };
}

function traceMessages(messages: ProviderChatMessage[]): unknown[] {
  return messages.map((message) => ({
    role: message.role,
    ...(message.role === 'tool' ? { tool_name: message.tool_name } : {}),
    content: traceText(message.content, traceMessageLimit),
    ...(message.role === 'assistant' && message.tool_calls?.length
      ? { tool_calls: message.tool_calls.map((call) => ({ name: call.function.name, arguments: call.function.arguments })) }
      : {}),
  }));
}

const SIMPLE_INTENTS: AssistantIntent[] = ['entity_lookup', 'comp_search', 'gameplay_knowledge'];
const COMP_WORD = /\b(comp|comps|doi hinh|team|build|composition)\b/;
const RECOMMEND_WORD = /\b(tim|find|recommend|goi y|phu hop|nen choi|choi gi|item nao|trang bi nao|which items?|what items?|best|strongest|manh nhat|tot nhat|easiest|de choi|don gian|build|meta)\b/;
const HAVE_WORD = /\b(toi co|minh co|i have|with|voi|using|dung)\b/;
// Champion + item wording ("Akali nên lên trang bị gì", "what items on Akali");
// without it those questions fall back to bare entity lookup with no builds.
const CHAMPION_ITEM_QUESTION = /\b(trang bi|item|len do|build|core item|core)\b/;
// Champion + augment wording — augments are comp-level in the data, so these
// questions attach the comps fielding the champion instead of item builds.
const CHAMPION_AUGMENT_QUESTION = /\b(augment|nang cap|oc bieu)\b/;
// Negated entity usage inside a follow-up ("nếu không chơi với X", "not
// playing X") — the user asks about the option without it, not comps with it.
const NEGATED_ENTITY_USAGE = /\b(?:khong|chua)\s+(?:choi|dung|len|nang cap|lay)\b|\bnot\s+(?:playing|using|building)\b|\bwithout\b/i;
const REFERENCE_DATA_QUESTION =
  /\b(?:economy plan|economy strategy|economy curve|level curve|leveling plan|round plan|fast 8|fast 9|[1-3] cost reroll|reroll plan|shop odds|odds by level|champion pool|pool size|copies in pool|xp table|gold income|base income|round income|income by round|interest|streak bonus|loot table|stage loot|loot orb|augment odds|carousel odds|encounter odds|mechanics table|ti le shop|ti le cua hang|bang xp|bang kinh te|ke hoach kinh te|ke hoach reroll|duong cong cap|thu nhap vang|thu nhap theo vong|vang theo vong|lai vang|thuong chuoi|be tuong|bang loot|ti le nang cap|bang co che)\b|\b(?:xp|exp)\b.*\b(?:level|leveling|cap|len cap)\b|\b(?:level|leveling|cap|len cap)\b.*\b(?:xp|exp)\b|\b(?:cash ?out|milestones?|rewards?|phan thuong|thu hoach|quy doi|no hu)\b/;

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function isVi(lang: Lang): boolean {
  return lang === 'vi';
}

function t(lang: Lang, en: string, vi: string): string {
  return isVi(lang) ? vi : en;
}

export function isReferenceDataQuestion(text: string): boolean {
  return REFERENCE_DATA_QUESTION.test(normalizeSpaced(text));
}

export function isFollowUpQuestion(text: string): boolean {
  return /\b(?:what about|how about|it|this|that|these|those|they|them|its|their|above|previous|same|former|latter|comp nay|doi hinh nay|cai nay|cai do|cai kia|con gi|con nao|con no|con do|con nay|con kia|con|no|the nao|ra sao|thi sao|neu khong)\b/i.test(
    normalizeSpaced(text)
  );
}

export function resolveFollowUpText(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[]
): string {
  const priorUser = [...history].reverse().find((entry) => entry.role === 'user');
  if (priorUser && isFollowUpQuestion(message)) return `${priorUser.content} ${message}`;
  // A bare decision question ("có nên lên cấp?") carries no state of its own.
  // Join the most recent user message that does, so corrections ("thực ra còn
  // 14 vàng") win over older facts (MEM-02/ADV-02 in the quality dataset).
  // "Which level should I roll at?" questions stay out: they are odds/reference
  // questions, not decisions, and are answered from the mechanics tables.
  const normalized = normalizeSpaced(message);
  if (
    !/\d/.test(message) &&
    !REFERENCE_LEVEL_QUESTION.test(normalized) &&
    BARE_DECISION_QUESTION.test(normalized)
  ) {
    const factSource = [...history].reverse().find((entry) => entry.role === 'user' && /\d/.test(entry.content));
    if (factSource) return `${factSource.content} ${message}`;
  }
  return message;
}

const REFERENCE_LEVEL_QUESTION = /\b(cap nao|level nao|which level|odds|ty le|xac suat|bao nhieu|khi nao|when)\b/i;
const BARE_DECISION_QUESTION =
  /\b(roll|reroll|len cap|up cap|level up|giu vang|giu tien|tich vang|all ?in|pivot|chuyen bai|nen lam gi)\b/i;

// A follow-up such as "còn items?" names no comp: the comp it refers to is usually in the
// last answer ("Blossom Executioners is the top pick"), not in the last question.
export function carryOverComps(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  comps: CompData[]
): CompData[] {
  if (!isFollowUpQuestion(message)) return [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry.role !== 'assistant') continue;
    const found = findCompMentions(comps, entry.content);
    if (found.length) return inMentionOrder(found, entry.content).slice(0, 2);
  }
  return [];
}

function inMentionOrder(matched: CompData[], text: string): CompData[] {
  const haystack = normalizeSpaced(text);
  const at = (comp: CompData) => {
    const index = haystack.indexOf(normalizeSpaced(comp.title));
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...matched].sort((a, b) => at(a) - at(b));
}

function clip(value: string, length = 900): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

function displayName(entity: CatalogEntity, lang: Lang): string {
  if (isVi(lang) && entity.nameVi && entity.nameVi !== entity.name) return `${entity.nameVi} (${entity.name})`;
  return entity.name;
}

function compName(comp: CompData): string {
  return comp.title;
}

function abilityText(entity: CatalogEntity, lang: Lang): string {
  const ability = entity.ability;
  if (!ability) return '';
  const name = isVi(lang) && ability.nameVi ? ability.nameVi : ability.name;
  const desc = isVi(lang) && ability.descVi ? ability.descVi : ability.desc;
  return `${name}: ${clip(desc, 700)}`;
}

function traitText(entity: CatalogEntity, lang: Lang): string {
  const description = isVi(lang) && entity.descriptionVi ? entity.descriptionVi : entity.description;
  const breakpoints = isVi(lang) && entity.breakpointsVi.length ? entity.breakpointsVi : entity.breakpoints;
  const points = breakpoints.length
    ? breakpoints.map((entry) => `${entry.minUnits}: ${clip(entry.text, 180)}`).slice(0, 5).join('; ')
    : entity.thresholds.join('/');
  return [description, points ? t(lang, `Breakpoints: ${points}`, `Mốc kích hoạt: ${points}`) : '']
    .filter(Boolean)
    .join(' ');
}

function compsUsingItems(comps: CompData[], items: CatalogEntity[]): CompData[] {
  const names = new Set(items.filter((entity) => entity.type === 'item').map((entity) => entity.name));
  if (!names.size) return [];
  return comps
    .filter((comp) =>
      [
        ...comp.items,
        ...comp.units.flatMap((unit) => unit.items),
        ...comp.early.flatMap((unit) => unit.items),
        ...comp.alt.flatMap((unit) => unit.items),
      ].some((entry) => names.has(entry.name))
    )
    .slice(0, 3);
}

// Champion questions have no item to match, so comps are found by board
// membership instead; unit names are localized per request language and must be
// compared against both the canonical and Vietnamese entity names.
function compsUsingChampion(comps: CompData[], champions: CatalogEntity[]): CompData[] {
  const names = new Set(
    champions
      .filter((entity) => entity.type === 'champion')
      .flatMap((entity) => [normalize(entity.name), normalize(entity.nameVi ?? '')])
      .filter(Boolean)
  );
  if (!names.size) return [];
  return comps
    .filter((comp) => [...comp.units, ...comp.early, ...comp.alt, comp.carry].some((unit) => names.has(normalize(unit.name))))
    .slice(0, 3);
}

// Per-champion item builds pulled out of matching comps; compactComp(brief)
// lists unit names only, so without this the model never sees the build.
function championBuilds(comps: CompData[], champions: CatalogEntity[]): ChampionBuild[] {
  const builds: ChampionBuild[] = [];
  for (const champion of champions.filter((entity) => entity.type === 'champion')) {
    const names = new Set([normalize(champion.name), normalize(champion.nameVi ?? '')].filter(Boolean));
    for (const comp of compsUsingChampion(comps, [champion])) {
      const isCarry = names.has(normalize(comp.carry.name));
      const items = unique(
        [...comp.units, comp.carry, ...comp.alt]
          .filter((unit) => names.has(normalize(unit.name)))
          .flatMap((unit) => unit.items.map((item) => item.name))
      ).slice(0, 6);
      if (!items.length) continue;
      builds.push({ champion: champion.name, comp: comp.title, compSlug: comp.slug, isCarry, items });
    }
  }
  return builds.slice(0, 6);
}

// Mirror of championBuilds: which champions hold the queried item, so item
// questions can answer "who builds this" rather than only "which comps use it".
function itemHolders(comps: CompData[], items: CatalogEntity[]): ItemHolder[] {
  const names = new Set(items.filter((entity) => entity.type === 'item').map((entity) => entity.name));
  if (!names.size) return [];
  const holders: ItemHolder[] = [];
  for (const comp of compsUsingItems(comps, items)) {
    const board = [...comp.units, comp.carry, ...comp.alt];
    for (const item of names) {
      const found = unique(
        board.filter((unit) => unit.items.some((entry) => entry.name === item)).map((unit) => unit.name)
      );
      if (found.length) holders.push({ item, comp: comp.title, compSlug: comp.slug, holders: found.slice(0, 4) });
    }
  }
  return holders.slice(0, 6);
}

function deterministicEntity(entity: CatalogEntity, lang: Lang, relatedTrait: CatalogEntity | null, catalog: Catalog): string {
  const name = displayName(entity, lang);
  if (entity.type === 'champion') {
    const traits = isVi(lang) && entity.traitsVi.length ? entity.traitsVi.join(', ') : entity.traits.join(', ');
    const mana = entity.mana ? t(lang, `Mana ${entity.mana.start}/${entity.mana.max}.`, `Mana ${entity.mana.start}/${entity.mana.max}.`) : '';
    const cost = entity.cost ? t(lang, `${entity.cost}-cost.`, `${entity.cost} vàng.`) : '';
    return [name, cost, traits ? t(lang, `Traits: ${traits}.`, `Tộc hệ: ${traits}.`) : '', mana, abilityText(entity, lang)]
      .filter(Boolean)
      .join(' ');
  }
  if (entity.type === 'item') {
    const description = isVi(lang) && entity.descriptionVi ? entity.descriptionVi : entity.description;
    const composition = isVi(lang) && entity.compositionVi.length ? entity.compositionVi : entity.composition.map((name) => localizedName(catalog, name, lang));
    const grant = relatedTrait
      ? t(
          lang,
          `Grants +1 ${relatedTrait.name} and counts toward its breakpoints. ${traitText(relatedTrait, lang)}`,
          `Cộng +1 ${isVi(lang) && relatedTrait.nameVi ? relatedTrait.nameVi : relatedTrait.name} và tính vào mốc kích hoạt. ${traitText(relatedTrait, lang)}`
        )
      : '';
    return [name, composition.length ? t(lang, `Builds from ${composition.join(' + ')}.`, `Ghép từ ${composition.join(' + ')}.`) : '', grant, clip(description ?? '', 800)]
      .filter(Boolean)
      .join(' ');
  }
  if (entity.type === 'augment') {
    const description = isVi(lang) && entity.descriptionVi ? entity.descriptionVi : entity.description;
    const rarity = entity.rarity === 1 ? t(lang, 'Silver', 'Bạc') : entity.rarity === 2 ? t(lang, 'Gold', 'Vàng') : entity.rarity === 3 ? t(lang, 'Prismatic', 'Lăng kính') : '';
    return [name, rarity, clip(description ?? '', 800)].filter(Boolean).join(' — ');
  }
  return [name, traitText(entity, lang)].filter(Boolean).join(' — ');
}

function deterministicComp(comp: CompData, lang: Lang, catalog: Catalog): string {
  const name = (value: string) => localizedName(catalog, value, lang);
  const units = comp.units.map((unit) => name(unit.name)).join(', ');
  const items = comp.items.map((item) => name(item.name)).join(', ');
  const augments = comp.augments.slice(0, 5).map((augment) => name(augment.name)).join(', ');
  const stages = comp.stages.map((stage) => `${stage.stage}: ${clip(stage.text, 220)}`).join(' ');
  return [
    `${compName(comp)} — ${comp.tier} tier, ${comp.style}, ${t(lang, `difficulty ${comp.difficulty}/3`, `độ khó ${comp.difficulty}/3`)}.`,
    t(lang, `Board: ${units}. Carry: ${name(comp.carry.name)}. Items: ${items}.`, `Đội hình: ${units}. Chủ lực: ${name(comp.carry.name)}. Trang bị: ${items}.`),
    augments ? t(lang, `Augments: ${augments}.`, `Nâng cấp: ${augments}.`) : '',
    comp.tips ? clip(comp.tips, 500) : '',
    stages ? clip(stages, 500) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

const isSubsequence = (window: string[], target: string[]): boolean => {
  let targetIndex = 0;
  for (const word of window) {
    while (targetIndex < target.length && target[targetIndex] !== word) targetIndex += 1;
    if (targetIndex >= target.length) return false;
    targetIndex += 1;
  }
  return true;
};

export function findCompMentions(comps: CompData[], text: string, customAliases: Map<string, string[]> = new Map()): CompData[] {
  const normalized = ` ${normalizeSpaced(text)} `;
  if (!normalized.trim()) return [];
  const words = normalized.trim().split(/\s+/);
  const exact: CompData[] = [];
  const fuzzy: CompData[] = [];
  for (const comp of comps) {
    const aliases = [comp.title, comp.titleVi ?? '', comp.slug, ...(COMP_ALIASES[comp.slug] ?? []), ...(customAliases.get(comp.slug) ?? [])];
    const aliasWords = aliases
      .map((alias) => normalizeSpaced(alias).split(/\s+/).filter(Boolean))
      .filter((list) => list.length >= 3);
    if (
      aliases.some((alias) => {
        const normalizedAlias = normalizeSpaced(alias);
        return normalizedAlias && normalized.includes(` ${normalizedAlias} `);
      })
    ) {
      exact.push(comp);
      continue;
    }
    // Partial-title fallback: users shorten long titles ("Brambleback & Pebbles
    // Riftbeast" for "Brambleback & Pebbles / Cinderling / Gromp / Elder Dragon
    // Riftbeast"). A 3+ word run of the message that is a subsequence of one
    // alias still identifies the comp; shorter runs stay out to avoid noise.
    for (let start = 0; start + 3 <= words.length; start += 1) {
      let end = start + 3;
      while (end <= words.length && aliasWords.some((list) => isSubsequence(words.slice(start, end), list))) end += 1;
      if (end - start - 1 >= 3) {
        fuzzy.push(comp);
        break;
      }
    }
  }
  return [...exact, ...fuzzy].slice(0, 4);
}

function sameComp(a: CompData, b: CompData): boolean {
  return a.slug === b.slug;
}

function sourceForEntity(entity: CatalogEntity, lang: Lang, version: string): AssistantSource {
  const base = `/${lang}`;
  const url =
    entity.type === 'champion'
      ? `${base}/champions${entity.slug ? `/${entity.slug}` : ''}`
      : entity.type === 'item'
        ? `${base}/items`
        : entity.type === 'augment'
          ? `${base}/augments`
          : `${base}/champions`;
  return {
    id: entity.id,
    title: displayName(entity, lang),
    url,
    sourceType: 'structured_data',
    version,
  };
}

function sourceForComp(comp: CompData, lang: Lang, version: string): AssistantSource {
  return {
    id: `comp:${comp.slug}`,
    title: comp.title,
    url: `/${lang}/tierlist/comps/${comp.slug}`,
    sourceType: 'structured_data',
    version,
  };
}

function sourceForStats(source: { provider: string; patch: string; updated: string }): AssistantSource {
  return {
    id: 'meta:stats',
    title: 'MetaBoard stats',
    url: 'https://www.metatft.com/',
    sourceType: 'structured_data',
    version: `patch${source.patch}`,
    retrievedAt: source.updated,
  };
}

export function ungroundedNumbers(answer: string, evidence: Evidence): string[] {
  const allowed = new Set(JSON.stringify(evidence).match(/\d+/g) ?? []);
  return [...new Set(answer.match(/\d+/g) ?? [])].filter((number) => !allowed.has(number));
}

function sourceForMechanics(setId: string, lang: Lang): AssistantSource {
  const source = mechanicsSource(setId, lang);
  return {
    id: `mechanics:set${setId}`,
    title: source.title,
    url: source.url,
    sourceType: 'mechanics',
    version: `patch${source.patch}`,
    retrievedAt: source.updated,
  };
}

function resolvedEntities(entities: CatalogEntity[], comps: CompData[], lang: Lang): ResolvedEntity[] {
  return [
    ...entities.map((entity) => ({ type: entity.type, id: entity.id, name: isVi(lang) && entity.nameVi ? entity.nameVi : entity.name })),
    ...comps.map((comp) => ({ type: 'comp' as const, id: entityId('comp', comp.slug), name: comp.title })),
  ];
}

function candidateFromComp(comp: CompData): RankedComp {
  return {
    comp,
    compId: entityId('comp', comp.slug),
    score: 0,
    matchedEntities: [],
    reasons: [comp.playstyle],
    limitations: [],
    breakdown: [],
  };
}

function recommendationOf(candidate: RankedComp, catalog: Catalog): AssistantRecommendation {
  const comp = candidate.comp;
  const unit = (entry: { name: string; icon: string | null; cost: number }) => {
    const entity = catalog.byName.get(entry.name);
    return {
      name: entry.name,
      slug: entity?.type === 'champion' ? entity.slug : null,
      icon: entry.icon ?? entity?.icon ?? null,
      cost: entry.cost,
    };
  };
  return {
    compId: candidate.compId,
    slug: comp.slug,
    title: comp.title,
    tier: comp.tier,
    style: comp.style,
    score: candidate.score,
    reasons: candidate.reasons,
    units: comp.units.map(unit),
    items: comp.items.map(({ name, icon }) => ({ name, icon })),
    augments: comp.augments.map(({ name, icon }) => ({ name, icon })),
    matchedEntities: candidate.matchedEntities,
    limitations: candidate.limitations,
  };
}

function followUps(
  lang: Lang,
  intent: AssistantIntent,
  entities: CatalogEntity[],
  comps: CompData[],
  candidates: RankedComp[],
  mechanics: MechanicsEvidence | null
): string[] {
  if (mechanics && !entities.length && !comps.length) {
    return isVi(lang)
      ? ['Wisp hoạt động thế nào?', 'Kinh tế vàng nên chơi sao?', 'Các mốc của Blossom?']
      : ['How do Wisps work?', 'How should I manage gold?', 'What are the Blossom breakpoints?'];
  }
  if (intent === 'comp_recommendation' && candidates[0]) {
    return isVi(lang)
      ? [`Vì sao ${candidates[0].comp.title} hợp?`, 'So sánh 2 comp đầu?']
      : [`Why does ${candidates[0].comp.title} fit?`, 'Compare the top 2 comps?'];
  }
  if (intent === 'comp_comparison' && comps[0]) {
    return isVi(lang)
      ? ['Comp nào dễ chơi hơn?', `Item priority của ${comps[0].title}?`]
      : ['Which comp is easier?', `Item priority for ${comps[0].title}?`];
  }
  if ((intent === 'comp_search' || intent === 'gameplay_knowledge') && comps[0]) {
    return isVi(lang)
      ? [`Item priority của ${comps[0].title}?`, `So sánh ${comps[0].title} với comp khác?`]
      : [`Item priority for ${comps[0].title}?`, `Compare ${comps[0].title} with another comp?`];
  }
  if (entities[0]?.type === 'champion') {
    return isVi(lang)
      ? [`Comp nào dùng ${displayName(entities[0], lang)}?`, `Item nào hợp với ${displayName(entities[0], lang)}?`]
      : [`Which comp uses ${entities[0].name}?`, `Which items fit ${entities[0].name}?`];
  }
  if (entities[0]) {
    const entityName = displayName(entities[0], lang);
    return isVi(lang) ? [`Giải thích thêm về ${entityName}?`] : [`Explain ${entityName} further?`];
  }
  return isVi(lang) ? ['Hỏi về một tướng', 'Hỏi về một đội hình'] : ['Ask about a champion', 'Ask about a comp'];
}

function difficultyOf(text: string): number | null {
  if (/\b(easy|easiest|de choi|don gian|beginner|nguoi moi)\b/.test(text)) return 1;
  if (/\b(hard|kho choi|kho)\b/.test(text)) return 3;
  if (/\b(medium|trung binh)\b/.test(text)) return 2;
  return null;
}

function styleOf(text: string): string | null {
  if (/\breroll\b/.test(text)) return 'Reroll';
  if (/\bfast ?8\b/.test(text)) return 'Fast 8';
  if (/\bflex\b/.test(text)) return 'Flex';
  if (/\btempo\b/.test(text)) return 'Tempo';
  return null;
}

function deterministicAnswer(
  lang: Lang,
  intent: AssistantIntent,
  entities: CatalogEntity[],
  comps: CompData[],
  candidates: RankedComp[],
  comparison: CompComparison | null,
  relatedComps: CompData[],
  stats: StatEvidence[],
  mechanics: MechanicsEvidence | null,
  meta: { setId: string; patch: string },
  catalog: Catalog,
  text: string
): { answer: string; status: AssistantStatus } {
  if (intent === 'gameplay_knowledge' && mechanics && !entities.length && !comps.length) {
    return { status: 'answered', answer: mechanicsAnswer(mechanics, lang) };
  }
  if (intent === 'meta_query') {
    const detail = [
      ...entities.map((entity) => deterministicEntity(entity, lang, grantedTrait(catalog, entity), catalog)),
      ...comps.map((comp) => deterministicComp(comp, lang, catalog)),
      ...stats.map((entry) => entry.text),
    ]
      .filter(Boolean)
      .join(' ');
    if (detail) return { status: 'answered', answer: detail };
    return {
      status: 'insufficient_data',
      answer: isVi(lang)
        ? 'Mình chưa có số liệu MetaBoard cho lựa chọn này. Bạn hỏi cụ thể tướng, trang bị, nâng cấp hoặc comp nhé.'
        : 'I do not have MetaBoard stats for that pick. Ask about a specific champion, item, augment or comp.',
    };
  }
  if (intent === 'patch_change') {
    return {
      status: 'unsupported',
      answer: isVi(lang)
        ? 'Mình chưa có patch notes hoặc lịch sử thay đổi trong database, nên không thể nói patch này buff/nerf gì. Mình chỉ trả lời từ dữ liệu Set 18 hiện tại.'
        : 'I do not have patch notes or change history in the database, so I cannot tell what this patch buffed or nerfed. I can only answer from the current Set 18 data.',
    };
  }
  if (intent === 'set_patch') {
    // A question that names a mechanic the knowledge base does not cover must
    // not be answered with set/patch boilerplate — say the data is missing
    // (RAG-04 in the quality dataset).
    const asksUnknownMechanic =
      !mechanics &&
      !entities.length &&
      !comps.length &&
      /\b(co che|mechanic|hoat dong|works?|tuong tac|interact)\b/.test(text);
    if (asksUnknownMechanic) {
      return {
        status: 'unsupported',
        answer: isVi(lang)
          ? `Mình không tìm thấy cơ chế này trong dữ liệu Set ${meta.setId || '?'} (patch ${meta.patch || 'latest'}). Có thể tên đó thuộc set cũ hoặc cách gọi khác — thử hỏi bằng tên tướng, tộc/hệ hoặc lõi cụ thể trong set này nhé.`
          : `I could not find that mechanic in the Set ${meta.setId || '?'} data (patch ${meta.patch || 'latest'}). The name may be from an older set or a different label — try a specific champion, trait or augment from this set.`,
      };
    }
    return {
      status: 'answered',
      answer: isVi(lang)
        ? `MetaBoard đang dùng dữ liệu Set ${meta.setId || '?'}, patch ${meta.patch || 'latest'}. Bạn có thể hỏi về tướng, trang bị, nâng cấp hoặc đội hình trong set này.`
        : `MetaBoard is using Set ${meta.setId || '?'}, patch ${meta.patch || 'latest'}. Ask about a champion, item, augment or comp in this set.`,
    };
  }
  if (intent === 'comp_recommendation') {
    if (!candidates.length) {
      return {
        status: 'insufficient_data',
        answer: isVi(lang)
          ? 'Mình chưa tìm thấy comp nào khớp với các lựa chọn bạn đưa. Thử thêm tên tướng, trang bị hoặc nâng cấp cụ thể.'
          : 'I could not find a comp matching those picks. Add a champion, item or augment to narrow it down.',
      };
    }
    const top = candidates[0];
    const basis = entities.length
      ? entities.map((entity) => displayName(entity, lang)).join(', ')
      : t(lang, 'the current comp data', 'dữ liệu comp hiện tại');
    const preliminary = !entities.length
      ? t(lang, ' These are ordered from the current data, not a personalised ranking.', ' Danh sách này theo dữ liệu hiện tại, không phải xếp hạng cá nhân hóa.')
      : top.matchedEntities.length <= 1
        ? t(lang, ' This is a preliminary match, not necessarily the best comp.', ' Đây là match sơ bộ, chưa phải comp tốt nhất.')
        : '';
    return {
      status: 'answered',
      answer: [
        isVi(lang)
          ? `Dựa trên ${basis}, comp khớp nhất là ${top.comp.title} (${top.comp.tier} tier, điểm khớp ${top.score}) theo dữ liệu Set ${meta.setId || '?'} patch ${meta.patch || 'latest'}.`
          : `Based on ${basis}, the closest comp is ${top.comp.title} (${top.comp.tier} tier, match score ${top.score}) under Set ${meta.setId || '?'} patch ${meta.patch || 'latest'}.`,
        top.reasons.join(' '),
        preliminary,
        t(lang, 'This score measures overlap only; see MetaBoard stats for performance.', 'Điểm này chỉ đo độ trùng khớp; xem số liệu MetaBoard để biết hiệu quả.'),
      ]
        .filter(Boolean)
        .join(' '),
    };
  }
  if (intent === 'comp_comparison') {
    if (!comparison) {
      return {
        status: 'needs_clarification',
        answer: isVi(lang) ? 'Bạn muốn so sánh hai comp nào?' : 'Which two comps do you want to compare?',
      };
    }
    const [a, b] = comparison.comps;
    const common = [
      comparison.commonUnits.length ? t(lang, `shared units: ${comparison.commonUnits.map((name) => localizedName(catalog, name, lang)).join(', ')}`, `tướng chung: ${comparison.commonUnits.map((name) => localizedName(catalog, name, lang)).join(', ')}`) : '',
      comparison.commonItems.length ? t(lang, `shared items: ${comparison.commonItems.map((name) => localizedName(catalog, name, lang)).join(', ')}`, `trang bị chung: ${comparison.commonItems.map((name) => localizedName(catalog, name, lang)).join(', ')}`) : '',
      comparison.commonAugments.length ? t(lang, `shared augments: ${comparison.commonAugments.map((name) => localizedName(catalog, name, lang)).join(', ')}`, `nâng cấp chung: ${comparison.commonAugments.map((name) => localizedName(catalog, name, lang)).join(', ')}`) : '',
    ]
      .filter(Boolean)
      .join('; ');
    return {
      status: 'answered',
      answer: isVi(lang)
        ? `${a.title} (${a.tier}, ${a.style}) và ${b.title} (${b.tier}, ${b.style}): ${common || 'không có nhiều điểm chung'}. ${a.title} dùng ${localizedName(catalog, a.carry.name, lang)}; ${b.title} dùng ${localizedName(catalog, b.carry.name, lang)}.`
        : `${a.title} (${a.tier}, ${a.style}) and ${b.title} (${b.tier}, ${b.style}): ${common || 'little overlap'}. ${a.title} carries with ${localizedName(catalog, a.carry.name, lang)}; ${b.title} carries with ${localizedName(catalog, b.carry.name, lang)}.`,
    };
  }
  if (intent === 'comp_search') {
    if (!comps.length) {
      return {
        status: 'needs_clarification',
        answer: isVi(lang) ? 'Mình chưa nhận ra comp bạn muốn xem. Bạn nhập tên comp hoặc mở trang comp rồi hỏi lại nhé.' : 'I could not identify the comp. Enter a comp name or open a comp page and ask again.',
      };
    }
    if (comps.length === 1) {
      return { status: 'answered', answer: [deterministicComp(comps[0], lang, catalog), ...stats.map((entry) => entry.text)].join(' ') };
    }
    return {
      status: 'answered',
      answer: isVi(lang)
        ? `Mình tìm thấy ${comps.length} comp: ${comps.map((comp) => comp.title).join(', ')}. Mở từng comp để xem board, item priority và cách chơi.`
        : `I found ${comps.length} comps: ${comps.map((comp) => comp.title).join(', ')}. Open one to see the board, item priority and game plan.`,
    };
  }
  if (intent === 'entity_lookup' || intent === 'gameplay_knowledge') {
    if (!entities.length) {
      return {
        status: 'needs_clarification',
        answer: isVi(lang) ? 'Bạn muốn hỏi về tướng, trang bị, tộc hệ hay nâng cấp nào?' : 'Which champion, item, trait or augment do you mean?',
      };
    }
    const usage = relatedComps.length
      ? t(lang, `Used in ${relatedComps.map((comp) => comp.title).join(', ')}.`, `Được dùng trong ${relatedComps.map((comp) => comp.title).join(', ')}.`)
      : '';
    return {
      status: 'answered',
      answer: [
        entities.map((entity) => deterministicEntity(entity, lang, grantedTrait(catalog, entity), catalog)).join('\n\n'),
        usage,
        ...stats.map((entry) => entry.text),
        mechanics ? mechanicsAnswer(mechanics, lang) : '',
      ]
        .filter(Boolean)
        .join(' '),
    };
  }
  return {
    status: 'unsupported',
    answer: isVi(lang)
      ? 'Mình hỗ trợ tra cứu tướng, trang bị, tộc hệ, nâng cấp, tìm comp, so sánh comp và số liệu MetaBoard trong Set 18. Mình chưa có patch notes.'
      : 'I support champion, item, trait, augment lookup, comp search, comp comparison and MetaBoard stats for Set 18. I do not have patch notes yet.',
  };
}

const PROMPT_INJECTION = [
  /\b(?:ignore|disregard|forget|override|bypass)\b.*\b(?:instructions?|prompts?|rules?)\b/i,
  /\b(?:system|developer)\s+(?:prompt|message|instructions?)\b/i,
  /\b(?:reveal|show|print|dump|repeat|leak|expose)\b.*\b(?:prompt|instructions?|rules?)\b/i,
  /\b(?:bo qua|pho* quen|quen)\b.*\b(?:huong dan|chi dan|quy tac|prompt)\b/i,
  /\b(?:tiet lo|hien thi|in ra|in|dump|cho xem)\b.*\b(?:system prompt|prompt he thong|chi dan he thong)\b/i,
  /\b(?:jailbreak|developer mode)\b/i,
];

export function isPromptInjection(text: string): boolean {
  const normalized = normalizeSpaced(text);
  return PROMPT_INJECTION.some((pattern) => pattern.test(normalized) || pattern.test(text));
}

// Short in-character replies for greetings and questions about Tomo himself.
// The greeting branch only fires on short messages, so "chào bạn, đội hình nào
// mạnh nhất?" still flows into the normal intent pipeline and the LLM greets
// back from its system persona.
const GREETING_WORD = /^(chao|xin chao|hello|hi|hey|halo|alo|yo|helo|good morning|good evening)\b/;
const PERSONA_WORD =
  /\b(ban la ai|ban la gi|tomo la ai|tomo la gi|ban ten gi|ten ban la gi|gioi thieu ve ban|gioi thieu ban|who are you|what are you|introduce yourself|your name)\b/;
const CAPABILITY_WORD =
  /\b(ban lam duoc gi|lam duoc gi|ban giup duoc gi|giup gi|ho tro gi|ban ho tro gi|what can you do|what do you do|how can you help)\b/;

export function tomoPersonaReply(text: string, lang: Lang): string | null {
  const vi = lang === 'vi';
  const normalized = normalizeSpaced(text);
  if (GREETING_WORD.test(normalized) && normalized.split(' ').filter(Boolean).length <= 5) {
    return vi
      ? 'Chào bạn! Mình là Tomo 🤖 — trợ lý AI của MetaBoard. Mình đọc dữ liệu Mùa 18 để gợi ý đội hình, cách lên đồ và nâng cấp; hỏi mình câu đầu tiên đi!'
      : "Hi! I'm Tomo 🤖 — MetaBoard's AI assistant. I read live Set 18 data to suggest comps, builds and augments; fire away with your first question!";
  }
  if (PERSONA_WORD.test(normalized)) {
    return vi
      ? 'Mình là Tomo — chú drone nhỏ đậu góc phải trên màn hình, và là trợ lý AI của MetaBoard. Mình trả lời dựa trên dữ liệu TFT Mùa 18: tướng, trang bị, nâng cấp, đội hình và kinh tế; chỗ nào chưa chắc mình sẽ nói rõ. Bấm vào mình cũng ra biểu cảm đấy!'
      : "I'm Tomo — the little drone perched in the top-right corner, and MetaBoard's AI assistant. I answer from current Set 18 TFT data (champions, items, augments, comps, economy) and flag whatever I can't verify. Boop me for a reaction!";
  }
  if (CAPABILITY_WORD.test(normalized)) {
    return vi
      ? 'Mình giúp được: gợi ý đội hình theo tướng/trang bị/nâng cấp bạn đang có, tra cứu tướng & trang bị, so sánh hai comp, kế hoạch kinh tế và cơ chế Mùa 18. Hỏi thẳng luôn nhé!'
      : 'I can suggest comps from the champions, items or augments you have, look up units and items, compare two comps, plan your economy and explain Set 18 mechanics. Just ask!';
  }
  return null;
}

export function detectIntent(text: string, entities: CatalogEntity[], comps: CompData[], setId?: string): AssistantIntent {
  const hasCompare = /\b(so sanh|compare|versus|vs|khac nhau|difference)\b/.test(text);
  const hasMeta = /\b(win ?rate|winrate|top ?4|top4|avg|average|placement|thong ke|ti le thang|ty le thang)\b/.test(text);
  const hasPatchChange =
    (/\b(patch|phien ban|what changed|notes?|co gi moi|whats new|what is new|nerfed|nerfs?|buffed)\b/.test(text) ||
      // A buff/nerf claim ("vừa bị buff", "got a 50% buff") — not the game verb
      // ("How does Lunar buff champions?"), not "trang bị" (equipment) and not
      // the item "Blue Buff", so the Vietnamese forms must be contiguous.
      /\b(?:bi|duoc|vua)\s+buff\b|\b(?:got|was|just|heard)\b[^.?!]*\bbuff\b/.test(text)) &&
    /\b(change|changed|thay doi|buff|buffed|nerf|nerfed|notes?|moi|new)\b/.test(text);
  const hasCurrentPatch = /\b(patch|phien ban|set|mua)\b/.test(text) && /\b(hien tai|current|now|nay)\b/.test(text);
  const hasLookup = /\b(la gi|what is|whats|ability|ky nang|skill|mana|noi tai|toc he|trait|item|trang bi|augment|nang cap|gia|cost|mo ta|describe|tell me about|thong tin)\b/.test(text);
  const hasRecommendation = RECOMMEND_WORD.test(text) || HAVE_WORD.test(text) || COMP_WORD.test(text);

  if (isStrategyQuestion(text)) return 'strategy_analysis';
  // "Top-4 rate khác win rate thế nào?" asks for metric definitions, not live
  // stats — route to the mechanics knowledge base instead of meta_query (DAT-03).
  const asksMetricDefinition =
    hasMeta &&
    /\b(khac|difference|different|dinh nghia|nghia la|what is|what does|mean|la gi|dang tin|reliable|trust)\b/.test(text) &&
    !entities.length &&
    !comps.length;
  if (asksMetricDefinition) return 'gameplay_knowledge';
  if (hasMeta) return 'meta_query';
  if (hasPatchChange) return 'patch_change';
  if (hasCurrentPatch && !entities.length && !comps.length) return 'set_patch';
  if (hasCompare) return 'comp_comparison';
  if (comps.length && !entities.length) return 'comp_search';
  // "Nếu không chơi với Tà Thuật thì sao?" negates the entity: ranking comps
  // that USE it would answer the opposite question, so let the LLM reason
  // from the conversation context instead.
  if (entities.length && hasRecommendation && !(isFollowUpQuestion(text) && NEGATED_ENTITY_USAGE.test(text))) {
    return 'comp_recommendation';
  }
  if (comps.length) return 'comp_search';
  if (entities.length) return hasLookup ? 'entity_lookup' : 'gameplay_knowledge';
  if (
    COMP_WORD.test(text) &&
    RECOMMEND_WORD.test(text) &&
    (styleOf(text) ||
      /\b(?:tier|hang)\s*[sabcx]\b/.test(text) ||
      /\b(?:manh nhat|strongest|tot nhat|best)\b/.test(text) ||
      difficultyOf(text) !== null)
  ) {
    return 'comp_recommendation';
  }
  if (isMechanicsQuestion(text, setId)) return 'gameplay_knowledge';
  return 'unsupported_or_unknown';
}

export async function answerAssistant(
  request: AssistantRequest,
  signal: AbortSignal,
  deps: {
    generate?: typeof generateAssistantAnswer;
    logReasoningStep?: ReasoningLogWriter;
    // Streaming hook: receives decoded prose of the LLM answer field as it
    // generates. Deterministic paths never call it.
    onAnswerDelta?: (chunk: string) => void;
  } = {}
): Promise<Omit<AssistantResponse, 'requestId'>> {
  const generate = deps.generate ?? generateAssistantAnswer;
  const logReasoningStep = deps.logReasoningStep ?? (() => {});
  // History is client-supplied (or replayed from past messages), so strip
  // entries that try to steer the assistant before they reach follow-up
  // resolution, tool calls, or the final prompt — the current message alone
  // is checked further down.
  request.history = request.history.filter((entry) => !isPromptInjection(entry.content));
  const [meta, catalog, comps, metaStats] = await Promise.all([
    getActiveSetAndPatch(),
    loadCatalog(),
    listComps(undefined, request.lang) as Promise<CompData[]>,
    loadMetaStats(),
  ]);

  const contextEntities: CatalogEntity[] = [];
  const contextComps: CompData[] = [];
  for (const id of request.context.entityIds) {
    const parsed = parseEntityId(id);
    if (!parsed) throw new AssistantContextError('invalid context entity');
    if (parsed.type === 'comp') {
      const comp = comps.find((entry) => entry.slug === parsed.key);
      if (!comp) throw new AssistantContextError('unknown context comp');
      contextComps.push(comp);
    } else {
      const entity = catalog.byId.get(id);
      if (!entity) throw new AssistantContextError('unknown context entity');
      contextEntities.push(entity);
    }
  }
  if (request.context.compSlug) {
    const comp = comps.find((entry) => entry.slug === request.context.compSlug);
    if (!comp) throw new AssistantContextError('unknown context comp');
    contextComps.push(comp);
  }

  if (isPromptInjection(request.message)) {
    logReasoningStep({
      step: 'intent_detection',
      intent: 'unsupported_or_unknown',
      mode: 'deterministic',
      status: 'answered',
      inputSummary: summarizeReasoningText(request.message),
      details: { promptInjection: true },
    });
    return {
      conversationId: request.conversationId,
      answer: isVi(request.lang)
        ? 'Mình không thể tiết lộ system prompt hoặc bỏ qua hướng dẫn hệ thống. Mình chỉ hỗ trợ câu hỏi về TFT.'
        : "I can't reveal the system prompt or ignore my instructions. I can help with TFT questions.",
      intent: 'unsupported_or_unknown',
      mode: 'deterministic',
      resolvedContext: { setId: meta.setId, patchId: meta.patch, lang: request.lang, entities: [] },
      recommendations: [],
      sections: [],
      sources: [],
      limitations: [],
      followUpQuestions: [],
      status: 'answered',
    };
  }

  const personaReply = tomoPersonaReply(request.message, request.lang);
  if (personaReply) {
    logReasoningStep({
      step: 'intent_detection',
      intent: 'unsupported_or_unknown',
      mode: 'deterministic',
      status: 'answered',
      inputSummary: summarizeReasoningText(request.message),
      details: { persona: true },
    });
    return {
      conversationId: request.conversationId,
      answer: personaReply,
      intent: 'unsupported_or_unknown',
      mode: 'deterministic',
      resolvedContext: { setId: meta.setId, patchId: meta.patch, lang: request.lang, entities: [] },
      recommendations: [],
      sections: [],
      sources: [],
      limitations: [],
      followUpQuestions: [],
      status: 'answered',
    };
  }

  let resolutionText = request.message;
  let mentionText = request.message;
  let entityMentions = findEntityMentions(catalog, mentionText);
  let compMentions = findCompMentions(comps, mentionText, catalog.compAliases);
  if (!entityMentions.length && !compMentions.length) {
    resolutionText = resolveFollowUpText(request.message, request.history);
    mentionText = resolutionText;
    entityMentions = findEntityMentions(catalog, mentionText);
    compMentions = findCompMentions(comps, mentionText, catalog.compAliases);
  }
  const carriedComps =
    entityMentions.length || compMentions.length ? [] : carryOverComps(request.message, request.history, comps);

  const entities = unique([...contextEntities, ...entityMentions.map((match) => match.entity)]).filter(
    (entity, index, list) =>
      list.findIndex(
        (entry) =>
          entry.type === entity.type &&
          normalize(entry.name) === normalize(entity.name) &&
          entry.rarity === entity.rarity
      ) === index
  );
  const mentionedComps = [...contextComps, ...compMentions, ...carriedComps].filter(
    (comp, index, list) => list.findIndex((entry) => sameComp(entry, comp)) === index
  );

  const text = normalizeSpaced(resolutionText);
  const wantsReferenceData = isReferenceDataQuestion(text);
  let intent = detectIntent(text, entities, mentionedComps, meta.setId);
  if (wantsReferenceData && ['strategy_analysis', 'unsupported_or_unknown'].includes(intent)) {
    intent = 'gameplay_knowledge';
  }
  logReasoningStep({
    step: 'intent_detection',
    intent,
    inputSummary: summarizeReasoningText(request.message),
    details: { wantsReferenceData, entityCount: entities.length, mentionedCompCount: mentionedComps.length },
  });
  logReasoningStep({
    step: 'entity_resolution',
    intent,
    inputSummary: summarizeReasoningText(request.message),
    outputSummary: `${entities.length} entities, ${mentionedComps.length} comps`,
    details: {
      entityIds: entities.map((entity) => entity.id),
      compSlugs: mentionedComps.map((comp) => comp.slug),
      ...(carriedComps.length ? { carriedComps: carriedComps.map((comp) => comp.slug) } : {}),
    },
  });

  // Every model call is traced with the exact prompt, provider attempts/retries,
  // raw response and failure, so an admin can audit quality per request.
  const tracedGenerate = (purpose: 'answer' | 'tool_plan', providerRequest: ProviderRequest): Promise<ProviderResult> => {
    const startedAt = Date.now();
    const provider = activeAssistantProvider();
    const activeModel = activeAssistantModel();
    const traceStep = (fields: {
      status?: AssistantStatus;
      outputSummary?: string;
      durationMs?: number;
      details: Record<string, unknown>;
    }): void => {
      logReasoningStep({ step: 'llm_generation', intent, mode: 'llm', ...fields });
    };

    traceStep({
      outputSummary: `${purpose} · ${provider}/${activeModel} · ${providerRequest.messages.length} messages`,
      details: {
        phase: 'request',
        purpose,
        provider,
        model: activeModel,
        maxOutputTokens: providerRequest.maxOutputTokens,
        format: providerRequest.format ?? 'default',
        tools: providerRequest.tools?.map((tool) => tool.function.name) ?? [],
        system: traceSystem(providerRequest.system),
        messages: traceMessages(providerRequest.messages),
      },
    });

    return generate({
      ...providerRequest,
      trace: (event) => {
        traceStep({
          status: event.type === 'retry' ? 'error' : undefined,
          outputSummary: event.type === 'retry' ? `retry #${event.attempt}: ${event.reason}` : `attempt #${event.attempt}`,
          durationMs: event.type === 'retry' ? event.durationMs : undefined,
          details: { phase: event.type, purpose, ...event },
        });
      },
    }).then(
      (result) => {
        traceStep({
          status: 'answered',
          outputSummary: summarizeReasoningText(result.text),
          durationMs: Date.now() - startedAt,
          details: {
            phase: 'response',
            purpose,
            provider,
            model: result.model,
            text: traceText(result.text, traceResponseLimit),
            usage: result.usage,
            streamed: typeof providerRequest.onDelta === 'function',
            toolCalls: result.toolCalls.map((call) => ({
              name: call.name,
              arguments: call.arguments,
              ...(call.argumentError ? { argumentError: call.argumentError } : {}),
            })),
          },
        });
        return result;
      },
      (error: unknown) => {
        traceStep({
          status: 'error',
          outputSummary: `error: ${error instanceof ProviderError ? error.code : 'provider_error'}`,
          durationMs: Date.now() - startedAt,
          details: {
            phase: 'error',
            purpose,
            provider,
            model: activeModel,
            code: error instanceof ProviderError ? error.code : 'provider_error',
            message: summarizeReasoningText(error instanceof Error ? error.message : 'unknown error', 500),
          },
        });
        throw error;
      }
    );
  };

  const version = `set${meta.setId || '?'}-patch${meta.patch || 'latest'}`;
  const repeated = [...entities
    .reduce((groups, entity) => {
      const group = groups.get(normalize(entity.name)) ?? [];
      group.push(entity);
      groups.set(normalize(entity.name), group);
      return groups;
    }, new Map<string, CatalogEntity[]>())
    .values()].filter((group) => new Set(group.map((entity) => entity.id)).size > 1);
  if (repeated.length && ['entity_lookup', 'gameplay_knowledge', 'meta_query'].includes(intent)) {
    const choices = [...new Set(repeated.flatMap((group) =>
      group.map((entity) =>
        entity.type === 'augment' && entity.rarity !== null ? `${displayName(entity, request.lang)} (${entity.rarity})` : displayName(entity, request.lang)
      )
    ))];
    const names = repeated.map((group) => displayName(group[0], request.lang)).join(', ');
    return {
      conversationId: request.conversationId,
      answer: isVi(request.lang)
        ? `Tên "${names}" khớp nhiều lựa chọn: ${choices.join(', ')}. Bạn muốn hỏi về lựa chọn nào?`
        : `"${names}" matches multiple options: ${choices.join(', ')}. Which one do you mean?`,
      intent,
      mode: 'deterministic',
      resolvedContext: { setId: meta.setId, patchId: meta.patch, lang: request.lang, entities: resolvedEntities(entities, mentionedComps, request.lang) },
      recommendations: [],
      sections: [],
      sources: [...entities.map((entity) => sourceForEntity(entity, request.lang, version))].slice(0, 6),
      limitations: [t(request.lang, 'Pick one entity so I can answer precisely.', 'Hãy chọn một entity để mình trả lời chính xác.')],
      followUpQuestions: choices.slice(0, 4),
      status: 'needs_clarification',
    };
  }

  if (intent === 'strategy_analysis' && !wantsReferenceData) {
    const analysis = analyzeStrategy(text);
    if (analysis) {
      const plan = buildStrategyPlan(analysis, request.lang, meta.patch);
      return {
        conversationId: request.conversationId,
        answer: plan.answer,
        intent,
        mode: 'deterministic',
        resolvedContext: {
          setId: meta.setId,
          patchId: meta.patch,
          lang: request.lang,
          entities: resolvedEntities(entities, mentionedComps, request.lang),
        },
        recommendations: [],
        sections: plan.sections,
        sources: [sourceForMechanics(meta.setId, request.lang)],
        limitations: plan.limitations,
        followUpQuestions: plan.followUpQuestions,
        status: plan.status,
      };
    }
  }

  let selectedEntities = entities;
  let selectedComps = mentionedComps;
  let candidates: RankedComp[] = [];
  let comparison: CompComparison | null = null;
  const mechanics =
    ['gameplay_knowledge', 'entity_lookup'].includes(intent) &&
    selectedEntities.length <= 1 &&
    isMechanicsQuestion(text, meta.setId)
      ? mechanicsFor(text, request.lang, meta.setId)
      : null;

  if (intent === 'entity_lookup' || intent === 'gameplay_knowledge') {
    if (selectedEntities.length > 1) {
      const hinted = selectedEntities.filter((entity) =>
        /\b(item|trang bi|augment|nang cap|trait|toc he)\b/.test(text) ? entity.type !== 'champion' : entity.type === 'champion'
      );
      if (hinted.length === 1) selectedEntities = hinted;
    }
    // Follow-ups carry conversation history, so the LLM can disambiguate the
    // entities itself; the canned clarification would just bounce the user.
    if (selectedEntities.length !== 1 && !mechanics && !wantsReferenceData && !isFollowUpQuestion(text)) {
      const names = selectedEntities.map((entity) => displayName(entity, request.lang)).join(', ');
      const question = isVi(request.lang) ? `Bạn muốn hỏi về lựa chọn nào: ${names}?` : `Which one do you mean: ${names}?`;
      return {
        conversationId: request.conversationId,
        answer: question,
        intent,
        mode: 'deterministic',
        resolvedContext: { setId: meta.setId, patchId: meta.patch, lang: request.lang, entities: resolvedEntities(selectedEntities, selectedComps, request.lang) },
        recommendations: [],
        sections: [],
        sources: [...selectedEntities.map((entity) => sourceForEntity(entity, request.lang, version)), ...selectedComps.map((comp) => sourceForComp(comp, request.lang, version))].slice(0, 6),
        limitations: [t(request.lang, 'Pick one entity so I can answer precisely.', 'Hãy chọn một entity để mình trả lời chính xác.')],
        followUpQuestions: selectedEntities.map((entity) => displayName(entity, request.lang)).slice(0, 3),
        status: 'needs_clarification',
      };
    }
  }

  const relatedEntities = ['entity_lookup', 'gameplay_knowledge'].includes(intent)
    ? unique(selectedEntities.map((entity) => grantedTrait(catalog, entity)).filter((entity): entity is CatalogEntity => entity !== null))
    : [];
  // "Akali nên lên trang bị gì?" is an item-build question about a champion:
  // pull the comps that field her and the builds they attach, otherwise the
  // model has nothing to recommend from and refuses. Augment wording attaches
  // the comps too (augments are comp-level), just without item builds.
  const wantsChampionContext =
    ['entity_lookup', 'gameplay_knowledge'].includes(intent) &&
    selectedEntities.some((entity) => entity.type === 'champion') &&
    (CHAMPION_ITEM_QUESTION.test(text) || CHAMPION_AUGMENT_QUESTION.test(text));
  const championBuildEvidence =
    wantsChampionContext && CHAMPION_ITEM_QUESTION.test(text) ? championBuilds(comps, selectedEntities) : [];
  const itemHolderEvidence =
    ['entity_lookup', 'gameplay_knowledge'].includes(intent) && selectedEntities.some((entity) => entity.type === 'item')
      ? itemHolders(comps, selectedEntities)
      : [];
  // Winrate-backed unit builds (live match data) and per-champion item usage:
  // the strongest grounds for item questions, kept off the tool loop so they
  // cost no extra LLM round-trip.
  const unitBuildEvidence =
    wantsChampionContext && CHAMPION_ITEM_QUESTION.test(text)
      ? unique(
          selectedEntities
            .filter((entity) => entity.type === 'champion')
            .map((entity) => unitBuildStats(metaStats, entity))
            .filter((entry): entry is UnitBuildEvidence => entry !== null)
        )
      : [];
  const itemUsageEvidence =
    ['entity_lookup', 'gameplay_knowledge'].includes(intent) && selectedEntities.some((entity) => entity.type === 'item')
      ? unique(
          selectedEntities
            .filter((entity) => entity.type === 'item')
            .map((entity) => itemUsageStats(metaStats, entity))
            .filter((entry): entry is ItemUsageEvidence => entry !== null)
        )
      : [];
  const relatedComps = ['entity_lookup', 'gameplay_knowledge'].includes(intent)
    ? uniqueBy(
        [
          ...(wantsChampionContext ? compsUsingChampion(comps, selectedEntities) : []),
          ...compsUsingItems(comps, selectedEntities),
        ],
        (comp) => comp.slug
      )
    : [];
  const statEntities = intent === 'meta_query' && selectedComps.length ? [] : selectedEntities;
  let stats = unique(
    [
      ...statEntities.map((entity) => entityStats(metaStats, entity, request.lang)),
      ...selectedComps.map((comp) => compStats(metaStats, comp, request.lang)),
    ].filter((entry): entry is StatEvidence => entry !== null)
  );

  if (intent === 'comp_comparison') {
    if (selectedComps.length < 2) {
      const choices = comps.slice(0, 4).map((comp) => comp.title);
      return {
        conversationId: request.conversationId,
        answer: isVi(request.lang) ? 'Bạn muốn so sánh comp nào? Chọn một comp thứ hai để mình so sánh.' : 'Which comps do you want to compare? Pick a second comp.',
        intent,
        mode: 'deterministic',
        resolvedContext: { setId: meta.setId, patchId: meta.patch, lang: request.lang, entities: resolvedEntities(selectedEntities, selectedComps, request.lang) },
        recommendations: [],
        sections: [],
        sources: selectedComps.map((comp) => sourceForComp(comp, request.lang, version)),
        limitations: [],
        followUpQuestions: choices,
        status: 'needs_clarification',
      };
    }
    selectedComps = selectedComps.slice(0, 2);
    comparison = await compareComps(selectedComps.map((comp) => comp.slug), request.lang);
  }

  if (intent === 'comp_recommendation') {
    const rankingQuery: RankingQuery = {
      championIds: selectedEntities.filter((entity) => entity.type === 'champion').map((entity) => entity.id),
      itemIds: selectedEntities.filter((entity) => entity.type === 'item').map((entity) => entity.id),
      augmentIds: selectedEntities.filter((entity) => entity.type === 'augment').map((entity) => entity.id),
      style: styleOf(text),
      difficulty: difficultyOf(text),
      lang: request.lang,
    };
    candidates = rankComps(comps, rankingQuery, catalog).slice(0, 5);
    if (
      !candidates.length &&
      !rankingQuery.championIds.length &&
      !rankingQuery.itemIds.length &&
      !rankingQuery.augmentIds.length &&
      !rankingQuery.style &&
      rankingQuery.difficulty === null &&
      /\b(?:manh nhat|strongest|tot nhat|best)\b/.test(text)
    ) {
      candidates = comps.filter((comp) => comp.tier === 'S').slice(0, 5).map(candidateFromComp);
    }
  }

  if (intent === 'comp_search' && !selectedComps.length) {
    return {
      conversationId: request.conversationId,
      answer: isVi(request.lang) ? 'Mình chưa nhận ra comp bạn muốn xem. Bạn nhập tên comp hoặc mở trang comp rồi hỏi lại nhé.' : 'I could not identify the comp. Enter a comp name or open a comp page and ask again.',
      intent,
      mode: 'deterministic',
      resolvedContext: { setId: meta.setId, patchId: meta.patch, lang: request.lang, entities: resolvedEntities(selectedEntities, selectedComps, request.lang) },
      recommendations: [],
      sections: [],
      sources: [],
      limitations: [],
      followUpQuestions: comps.slice(0, 3).map((comp) => comp.title),
      status: 'needs_clarification',
    };
  }

  const agentEvidence: Evidence = {
    intent,
    setId: meta.setId,
    patch: meta.patch,
    setName: meta.setName,
    lang: request.lang,
    entities: selectedEntities,
    relatedEntities,
    comps: selectedComps,
    relatedComps,
    championBuilds: championBuildEvidence,
    itemHolders: itemHolderEvidence,
    unitBuilds: unitBuildEvidence,
    itemUsage: itemUsageEvidence,
    stats,
    candidates,
    comparison,
    mechanics,
    toolResults: [],
    limitations: [],
  };
  const toolResults: {
    tool: string;
    data: unknown;
    status: 'ok' | 'error';
    meta: { setId: string; patch: string };
  }[] = [];
  let toolMessages: ProviderChatMessage[] = [];
  let toolFinal: ProviderResult | null = null;
  let toolComps: CompData[] = [];
  let toolFailures: ToolFailure[] = [];
  let toolStopped: ToolLoopResult['stopped'] | null = null;
  let toolAmbiguous: AmbiguousEntity[] = [];
  const shouldTryTools =
    wantsReferenceData ||
    intent === 'unsupported_or_unknown' ||
    (intent === 'comp_recommendation' && /\b(?:tier|hang)\s*[sabcx]\b/i.test(text)) ||
    (intent === 'meta_query' && !stats.length);
  if (shouldTryTools) {
    const toolStart = Date.now();
    try {
      const loop = await runToolLoop({
        system: buildToolPlannerPrompt(request.lang, meta.setId, meta.patch, selectedComps.map((comp) => comp.slug)),
        answerSystem: buildToolAgentPrompt(request.lang, agentEvidence),
        messages: [...request.history, { role: 'user', content: request.message }],
        tools: ASSISTANT_TOOLS,
        lang: request.lang,
        signal,
        provenance: { setId: meta.setId, patch: meta.patch },
        finalizeModel: false,
        generate: (request) => withInferenceSlot(() => tracedGenerate('tool_plan', request)),
      });
      toolMessages = loop.messages;
      toolFinal = loop.final;
      toolFailures = loop.failures;
      toolStopped = loop.stopped;
      toolAmbiguous = loop.results.flatMap((result) => result.ambiguous ?? []);
      const provenance = { setId: meta.setId, patch: meta.patch };
      for (const result of loop.results) {
        toolResults.push({ tool: result.tool, data: result.payload, status: 'ok', meta: provenance });
      }
      for (const failure of loop.failures) {
        toolResults.push({
          tool: failure.tool,
          data: { status: 'error', code: failure.code, message: failure.message },
          status: 'error',
          meta: provenance,
        });
      }
      logReasoningStep({
        step: 'tool_call',
        intent,
        status: loop.steps.length ? (loop.failures.length ? 'error' : 'answered') : undefined,
        outputSummary: `${loop.steps.length} call${loop.steps.length === 1 ? '' : 's'} in ${loop.rounds} round${loop.rounds === 1 ? '' : 's'}${loop.failures.length ? `, ${loop.failures.length} failed` : ''}`,
        details: { stopped: loop.stopped, rounds: loop.rounds, calls: loop.calls, failures: loop.failures.map((f) => ({ tool: f.tool, code: f.code })) },
        durationMs: Date.now() - toolStart,
      });
      for (const step of loop.steps) {
        const args = JSON.stringify(step.args ?? {});
        logReasoningStep({
          step: 'tool_call',
          intent,
          status: step.ok ? 'answered' : 'error',
          outputSummary: summarizeReasoningText(`${step.tool}(${args}) → ${step.ok ? 'ok' : step.code ?? 'error'}`, 120),
          details: { tool: step.tool, args: step.args, ...(step.code ? { code: step.code } : {}) },
          durationMs: step.durationMs,
        });
      }

      const loopCandidates = uniqueBy(
        loop.results.flatMap((result) => result.candidates ?? []),
        (candidate) => candidate.compId
      ).slice(0, 5);
      const loopComparison = loop.results.find((result) => result.comparison)?.comparison ?? null;
      const loopStats = unique(loop.results.flatMap((result) => result.stats ?? []));
      const loopComps = uniqueBy(loop.results.flatMap((result) => result.comps ?? []), (comp) => comp.slug);
      toolComps = loopComps;

      if (loopComparison) {
        comparison = loopComparison;
        selectedComps = loopComparison.comps;
        intent = 'comp_comparison';
      } else if (loopCandidates.length) {
        candidates = loopCandidates;
        intent = 'comp_recommendation';
        if (!selectedEntities.length) {
          selectedEntities = unique(
            loopCandidates[0].matchedEntities
              .map((id) => catalog.byId.get(id))
              .filter((entity): entity is CatalogEntity => Boolean(entity))
          );
        }
      } else if (loopStats.length) {
        stats = unique([...stats, ...loopStats]);
        if (!selectedComps.length) selectedComps = loopComps;
        intent = 'meta_query';
      } else if (loopComps.length) {
        selectedComps = loopComps;
        candidates = loopComps.map(candidateFromComp);
        intent = 'comp_search';
      } else if (loop.results.some((result) => result.tool === 'find_comps')) {
        intent = 'comp_recommendation';
      } else if (loop.results.some((result) => result.tool === 'get_stats')) {
        intent = 'meta_query';
      }
    } catch (error) {
      if (error instanceof ProviderError && (error.code === 'aborted' || error.code === 'timeout')) throw error;
      logReasoningStep({
        step: 'tool_call',
        intent,
        status: 'error',
        outputSummary: 'Tool loop failed.',
        details: {
          reason: error instanceof ProviderError ? error.code : 'tool_loop_error',
        },
        durationMs: Date.now() - toolStart,
      });
      assistantLog('tool_loop_error', {
        lang: request.lang,
        code: error instanceof ProviderError ? error.code : 'error',
        message: error instanceof Error ? error.message.slice(0, 300) : null,
      });
    }
  }

  const limitations = [
    t(request.lang, 'Answers are based on MetaBoard structured data.', 'Câu trả lời dựa trên dữ liệu cấu trúc của MetaBoard.'),
  ];
  if (toolFailures.length) {
    limitations.push(t(request.lang, 'Some data lookups failed; the answer uses only verified results.', 'Một số bước tra cứu thất bại; câu trả lời chỉ dùng dữ liệu đã xác minh.'));
  }
  if (toolStopped === 'max_rounds' || toolStopped === 'max_calls' || toolStopped === 'max_per_round') {
    limitations.push(t(request.lang, 'The tool step limit was reached; the answer uses the results collected so far.', 'Đã chạm giới hạn bước gọi tool; câu trả lời dùng các kết quả đã thu thập.'));
  }
  if (intent === 'comp_search' || intent === 'comp_comparison' || intent === 'comp_recommendation') {
    limitations.push(t(request.lang, 'Board and tier from MetaBoard; tips and stages from TFT Academy.', 'Board/tier từ MetaBoard; tips/stages từ TFT Academy.'));
  }
  if (intent === 'entity_lookup' || (intent === 'gameplay_knowledge' && selectedEntities.length)) {
    limitations.push(t(request.lang, 'Static data from CommunityDragon and the shared TFT catalog.', 'Dữ liệu tĩnh từ CommunityDragon và danh mục TFT dùng chung.'));
  }
  if (mechanics) {
    limitations.push(
      t(
        request.lang,
        'Set-specific mechanics are a summary; exact values can change by patch.',
        'Cơ chế riêng của set là bản tóm tắt; giá trị chính xác có thể đổi theo patch.'
      )
    );
  }
  if (relatedEntities.length) {
    limitations.push(
      t(
        request.lang,
        'Emblem effect is inferred from the trait it grants; it is not a separate item description.',
        'Hiệu ứng Ấn được suy ra từ tộc hệ được cộng; không phải mô tả item riêng.'
      )
    );
  }

  const recommendations = candidates.map((candidate) => recommendationOf(candidate, catalog));
  const sourceComps = [
    ...(intent === 'comp_recommendation' ? candidates.map((candidate) => candidate.comp) : selectedComps),
    ...toolComps,
  ];
  const toolSources = toolResults.flatMap((result): AssistantSource[] => {
    if (result.status !== 'ok' || !result.data || typeof result.data !== 'object') return [];
    const source = (result.data as { source?: unknown }).source;
    if (!source || typeof source !== 'object') return [];
    const item = source as { provider?: unknown; url?: unknown; set?: unknown; patch?: unknown; updatedAt?: unknown };
    if (typeof item.url !== 'string' || typeof item.provider !== 'string') return [];
    return [{
      id: `${result.tool}:${item.url}`,
      title: item.provider,
      url: item.url,
      sourceType: result.tool === 'get_game_mechanics' ? 'mechanics' : 'structured_data',
      version: typeof item.patch === 'string'
        ? `patch${item.patch}`
        : typeof item.set === 'string'
          ? item.set
          : `patch${meta.patch || 'latest'}`,
      ...(typeof item.updatedAt === 'string' ? { retrievedAt: item.updatedAt } : {}),
    }];
  });
  const sources = [
    ...sourceComps.map((comp) => sourceForComp(comp, request.lang, version)),
    ...relatedComps.map((comp) => sourceForComp(comp, request.lang, version)),
    ...selectedEntities.map((entity) => sourceForEntity(entity, request.lang, version)),
    ...relatedEntities.map((entity) => sourceForEntity(entity, request.lang, version)),
    ...(stats.length ? [sourceForStats(metaStats.source)] : []),
    ...(mechanics ? [sourceForMechanics(meta.setId, request.lang)] : []),
    ...toolSources,
  ]
    .filter((source, index, list) => list.findIndex((entry) => entry.id === source.id) === index)
    .slice(0, 6);

  const deterministic = deterministicAnswer(
    request.lang,
    intent,
    selectedEntities,
    selectedComps,
    candidates,
    comparison,
    relatedComps,
    stats,
    mechanics,
    { setId: meta.setId, patch: meta.patch },
    catalog,
    text
  );
  const referenceAnswer = toolResults
    .filter((result) => result.status === 'ok' && ['get_game_mechanics', 'get_economy_plan'].includes(result.tool))
    .map((result) => (result.data as { summary?: unknown } | null)?.summary)
    .filter((summary): summary is string => typeof summary === 'string' && summary.trim().length > 0)
    .join(' ');
  const evidence: Evidence = {
    intent,
    setId: meta.setId,
    patch: meta.patch,
    setName: meta.setName,
    lang: request.lang,
    entities: selectedEntities,
    relatedEntities,
    comps: selectedComps,
    relatedComps,
    championBuilds: championBuildEvidence,
    itemHolders: itemHolderEvidence,
    unitBuilds: unitBuildEvidence,
    itemUsage: itemUsageEvidence,
    stats,
    candidates,
    comparison,
    mechanics,
    toolResults,
    limitations,
  };

  const base = {
    conversationId: request.conversationId,
    intent,
    resolvedContext: {
      setId: meta.setId,
      patchId: meta.patch,
      lang: request.lang,
      entities: resolvedEntities(selectedEntities, selectedComps, request.lang),
    },
    recommendations,
    sections: [],
    sources,
    followUpQuestions: followUps(request.lang, intent, selectedEntities, selectedComps, candidates, mechanics),
    status: referenceAnswer ? 'answered' : deterministic.status,
  };

  if (toolAmbiguous.length) {
    const choices = [...new Set(toolAmbiguous.flatMap((entry) => entry.candidates.map((candidate) => candidate.name)))].slice(0, 4);
    const queried = [...new Set(toolAmbiguous.map((entry) => entry.name))].join(', ');
    return {
      ...base,
      answer: isVi(request.lang)
        ? `Mình tìm thấy nhiều lựa chọn khớp với "${queried}": ${choices.join(', ')}. Bạn muốn hỏi về lựa chọn nào?`
        : `I found multiple matches for "${queried}": ${choices.join(', ')}. Which one do you mean?`,
      status: 'needs_clarification',
      followUpQuestions: choices,
      mode: 'deterministic',
      limitations: [
        ...limitations,
        t(request.lang, 'Entity match was ambiguous; ask the user to choose.', 'Tên khớp nhiều lựa chọn; cần người dùng chọn.'),
      ],
    };
  }

  const toolHasData = !referenceAnswer && toolResults.some((result) => result.status === 'ok') &&
    Boolean(candidates.length || selectedComps.length || stats.length || comparison);
  const canUseLlm =
    (!['patch_change', 'unsupported_or_unknown', 'set_patch'].includes(intent) || Boolean(referenceAnswer)) &&
    (deterministic.status === 'answered' || Boolean(referenceAnswer)) &&
    !toolHasData &&
    !(intent === 'comp_recommendation' && (candidates.length === 1 || !selectedEntities.length));
  if (!canUseLlm) {
    return { ...base, answer: referenceAnswer || deterministic.answer, mode: 'deterministic', limitations };
  }

  try {
    let result = toolFinal;
    if (!result || !parseGeneratedAnswer(result.text)) {
      const onDelta = deps.onAnswerDelta;
      result = await withInferenceSlot(() =>
        tracedGenerate('answer', {
          system: buildSystemPrompt(request.lang, evidence),
          messages: [
            ...request.history.map((entry) => ({ role: entry.role, content: entry.content })),
            { role: 'user', content: buildUserPrompt(
              request.message,
              evidence,
              (name) => localizedName(catalog, name, request.lang),
              (text) => localizeEntityNames(text, catalog, request.lang)
            ) },
            ...toolMessages,
          ],
          maxOutputTokens: 800,
          signal,
          ...(onDelta ? { onDelta: createAnswerFieldStreamer(onDelta) } : {}),
        })
      );
    }
    const parsed = parseGeneratedAnswer(result.text);
    if (!parsed) {
      logReasoningStep({
        step: 'validation',
        intent,
        mode: 'llm',
        status: 'error',
        inputSummary: summarizeReasoningText(request.message),
        outputSummary: 'Response did not match the expected format.',
        details: { reason: 'parse_failed' },
      });
      logReasoningStep({
        step: 'fallback',
        intent,
        mode: 'deterministic',
        inputSummary: summarizeReasoningText(request.message),
        outputSummary: summarizeReasoningText(referenceAnswer || deterministic.answer),
        details: { reason: 'invalid_llm_answer' },
      });
      assistantLog('invalid_answer', { length: result.text.length, sample: summarizeReasoningText(result.text, 300) });
      return {
        ...base,
        answer: referenceAnswer || deterministic.answer,
        mode: 'deterministic',
        limitations: unique([...limitations, t(request.lang, 'The generated answer was invalid; I used the data summary instead.', 'Câu trả lời tự động không hợp lệ; đã dùng bản tóm tắt từ dữ liệu.')]),
      };
    }
    logReasoningStep({
      step: 'validation',
      intent,
      mode: 'llm',
      status: 'answered',
      inputSummary: summarizeReasoningText(request.message),
      outputSummary: summarizeReasoningText(parsed.answer),
      details: { passed: true, sectionCount: parsed.sections.length },
    });
    const generatedText = [parsed.answer, ...parsed.sections.flatMap((section) => section.points)].join(' ');
    const unsupportedNumbers = intent === 'gameplay_knowledge' && mechanics ? ungroundedNumbers(generatedText, evidence) : [];
    if (unsupportedNumbers.length) {
      logReasoningStep({
        step: 'validation',
        intent,
        mode: 'llm',
        status: 'insufficient_data',
        inputSummary: summarizeReasoningText(request.message),
        outputSummary: 'Generated answer contained unsupported numbers.',
        details: { passed: false, reason: 'ungrounded_numbers', numbers: unsupportedNumbers },
      });
      logReasoningStep({
        step: 'fallback',
        intent,
        mode: 'deterministic',
        inputSummary: summarizeReasoningText(request.message),
        outputSummary: summarizeReasoningText(deterministic.answer),
        details: { reason: 'ungrounded_numbers' },
      });
      return {
        ...base,
        answer: deterministic.answer,
        mode: 'deterministic',
        limitations: unique([
          ...limitations,
          t(request.lang, 'The generated answer contained numbers not in the data; I used the data summary instead.', 'Câu trả lời tự động chứa số liệu không có trong dữ liệu; đã dùng bản tóm tắt từ dữ liệu.'),
        ]),
      };
    }
    return {
      ...base,
      answer: parsed.answer,
      sections: parsed.sections,
      mode: 'llm',
      limitations: unique([...limitations, ...parsed.limitations.filter((entry) => limitations.includes(entry))]),
      followUpQuestions: parsed.followUpQuestions.length ? parsed.followUpQuestions : base.followUpQuestions,
    };
  } catch (error) {
    if (error instanceof ProviderError && (error.code === 'unavailable' || !SIMPLE_INTENTS.includes(intent))) throw error;
    logReasoningStep({
      step: 'fallback',
      intent,
      mode: 'deterministic',
      status: 'error',
      inputSummary: summarizeReasoningText(request.message),
      outputSummary: summarizeReasoningText(referenceAnswer || deterministic.answer),
      details: {
        reason: error instanceof ProviderError ? error.code : 'generation_error',
        provider: activeAssistantProvider(),
        model: activeAssistantModel(),
        message: error instanceof Error ? summarizeReasoningText(error.message, 300) : 'unknown error',
        fallbackUsed: true,
      },
    });
    return {
      ...base,
      answer: referenceAnswer || deterministic.answer,
      mode: 'deterministic',
      limitations: unique([...limitations, t(request.lang, 'The model is temporarily unavailable; I used the data summary instead.', 'Model tạm thời không khả dụng; đã dùng bản tóm tắt từ dữ liệu.')]),
    };
  }
}
