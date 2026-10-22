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
  type CompComparison,
  type CompData,
  type Lang,
  type RankedComp,
  type RankingQuery,
  type ResolvedEntity,
} from './contracts.ts';
import { findEntityMentions, grantedTrait, normalize, normalizeSpaced, type Catalog } from './entities.ts';
import { buildSystemPrompt, buildToolAgentPrompt, buildToolPlannerPrompt, buildUserPrompt, type Evidence } from './prompt.ts';
import { generateAssistantAnswer, ProviderError, type ProviderChatMessage, type ProviderResult } from './provider.ts';
import { rankComps } from './ranking.ts';
import { compareComps, getActiveSetAndPatch, loadCatalog } from './tools.ts';
import { compStats, entityStats, loadMetaStats, type StatEvidence } from './meta-stats.ts';
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

export class AssistantContextError extends Error {
  status = 400;
}

const SIMPLE_INTENTS: AssistantIntent[] = ['entity_lookup', 'comp_search', 'gameplay_knowledge'];
const COMP_WORD = /\b(comp|comps|doi hinh|team|build|composition)\b/;
const RECOMMEND_WORD = /\b(tim|find|recommend|goi y|phu hop|nen choi|choi gi|item nao|trang bi nao|which items?|what items?|best|strongest|manh nhat|tot nhat|easiest|de choi|don gian|build|meta)\b/;
const HAVE_WORD = /\b(toi co|minh co|i have|with|voi|using|dung)\b/;
const REFERENCE_DATA_QUESTION =
  /\b(?:economy plan|economy strategy|economy curve|level curve|leveling plan|round plan|fast 8|fast 9|[1-3] cost reroll|reroll plan|shop odds|odds by level|champion pool|pool size|copies in pool|xp table|gold income|base income|round income|income by round|interest|streak bonus|loot table|stage loot|loot orb|augment odds|carousel odds|encounter odds|mechanics table|ti le shop|ti le cua hang|bang xp|bang kinh te|ke hoach kinh te|ke hoach reroll|duong cong cap|thu nhap vang|thu nhap theo vong|vang theo vong|lai vang|thuong chuoi|be tuong|bang loot|ti le nang cap|bang co che)\b|\b(?:xp|exp)\b.*\b(?:level|leveling|cap|len cap)\b|\b(?:level|leveling|cap|len cap)\b.*\b(?:xp|exp)\b/;

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

function deterministicEntity(entity: CatalogEntity, lang: Lang, relatedTrait: CatalogEntity | null = null): string {
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
    const composition = isVi(lang) && entity.compositionVi.length ? entity.compositionVi : entity.composition;
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

function deterministicComp(comp: CompData, lang: Lang): string {
  const units = comp.units.map((unit) => unit.name).join(', ');
  const items = comp.items.map((item) => item.name).join(', ');
  const augments = comp.augments.slice(0, 5).map((augment) => augment.name).join(', ');
  const stages = comp.stages.map((stage) => `${stage.stage}: ${clip(stage.text, 220)}`).join(' ');
  return [
    `${compName(comp)} — ${comp.tier} tier, ${comp.style}, ${t(lang, `difficulty ${comp.difficulty}/3`, `độ khó ${comp.difficulty}/3`)}.`,
    t(lang, `Board: ${units}. Carry: ${comp.carry.name}. Items: ${items}.`, `Đội hình: ${units}. Chủ lực: ${comp.carry.name}. Trang bị: ${items}.`),
    augments ? t(lang, `Augments: ${augments}.`, `Nâng cấp: ${augments}.`) : '',
    comp.tips ? clip(comp.tips, 500) : '',
    stages ? clip(stages, 500) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function findCompMentions(comps: CompData[], text: string): CompData[] {
  const compact = normalize(text);
  if (!compact) return [];
  return comps
    .filter((comp) => compact.includes(normalize(comp.title)) || compact.includes(normalize(comp.slug)))
    .slice(0, 4);
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
    title: entity.name,
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
    title: `${source.provider} stats`,
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
      ? [`Comp nào dùng ${entities[0].name}?`, `Item nào hợp với ${entities[0].name}?`]
      : [`Which comp uses ${entities[0].name}?`, `Which items fit ${entities[0].name}?`];
  }
  if (entities[0]) {
    return isVi(lang) ? [`Giải thích thêm về ${entities[0].name}?`] : [`Explain ${entities[0].name} further?`];
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
  catalog: Catalog
): { answer: string; status: AssistantStatus } {
  if (intent === 'gameplay_knowledge' && mechanics && !entities.length && !comps.length) {
    return { status: 'answered', answer: mechanicsAnswer(mechanics, lang) };
  }
  if (intent === 'meta_query') {
    const detail = [
      ...entities.map((entity) => deterministicEntity(entity, lang, grantedTrait(catalog, entity))),
      ...comps.map((comp) => deterministicComp(comp, lang)),
      ...stats.map((entry) => entry.text),
    ]
      .filter(Boolean)
      .join(' ');
    if (detail) return { status: 'answered', answer: detail };
    return {
      status: 'insufficient_data',
      answer: isVi(lang)
        ? 'Mình chưa có số liệu MetaTFT cho lựa chọn này. Bạn hỏi cụ thể tướng, trang bị, nâng cấp hoặc comp nhé.'
        : 'I do not have MetaTFT stats for that pick. Ask about a specific champion, item, augment or comp.',
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
          ? `Dựa trên ${basis}, comp khớp nhất là ${top.comp.title} (${top.comp.tier} tier, điểm khớp ${top.score}).`
          : `Based on ${basis}, the closest comp is ${top.comp.title} (${top.comp.tier} tier, match score ${top.score}).`,
        top.reasons.join(' '),
        preliminary,
        t(lang, 'This score measures overlap only; see MetaTFT stats for performance.', 'Điểm này chỉ đo độ trùng khớp; xem số liệu MetaTFT để biết hiệu quả.'),
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
      comparison.commonUnits.length ? t(lang, `shared units: ${comparison.commonUnits.join(', ')}`, `tướng chung: ${comparison.commonUnits.join(', ')}`) : '',
      comparison.commonItems.length ? t(lang, `shared items: ${comparison.commonItems.join(', ')}`, `trang bị chung: ${comparison.commonItems.join(', ')}`) : '',
      comparison.commonAugments.length ? t(lang, `shared augments: ${comparison.commonAugments.join(', ')}`, `nâng cấp chung: ${comparison.commonAugments.join(', ')}`) : '',
    ]
      .filter(Boolean)
      .join('; ');
    return {
      status: 'answered',
      answer: isVi(lang)
        ? `${a.title} (${a.tier}, ${a.style}) và ${b.title} (${b.tier}, ${b.style}): ${common || 'không có nhiều điểm chung'}. ${a.title} dùng ${a.carry.name}; ${b.title} dùng ${b.carry.name}.`
        : `${a.title} (${a.tier}, ${a.style}) and ${b.title} (${b.tier}, ${b.style}): ${common || 'little overlap'}. ${a.title} carries with ${a.carry.name}; ${b.title} carries with ${b.carry.name}.`,
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
      return { status: 'answered', answer: [deterministicComp(comps[0], lang), ...stats.map((entry) => entry.text)].join(' ') };
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
        entities.map((entity) => deterministicEntity(entity, lang, grantedTrait(catalog, entity))).join('\n\n'),
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
      ? 'Mình hỗ trợ tra cứu tướng, trang bị, tộc hệ, nâng cấp, tìm comp, so sánh comp và số liệu MetaTFT trong Set 18. Mình chưa có patch notes.'
      : 'I support champion, item, trait, augment lookup, comp search, comp comparison and MetaTFT stats for Set 18. I do not have patch notes yet.',
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

export function detectIntent(text: string, entities: CatalogEntity[], comps: CompData[], setId?: string): AssistantIntent {
  const hasCompare = /\b(so sanh|compare|versus|vs|khac nhau|difference)\b/.test(text);
  const hasMeta = /\b(win ?rate|winrate|top ?4|top4|avg|average|placement|thong ke|ti le thang|ty le thang)\b/.test(text);
  const hasPatchChange =
    /\b(patch|phien ban|what changed|notes?|co gi moi|whats new|what is new)\b/.test(text) &&
    /\b(change|changed|thay doi|buff|nerf|notes?|moi|new)\b/.test(text);
  const hasCurrentPatch = /\b(patch|phien ban|set|mua)\b/.test(text) && /\b(hien tai|current|now|nay)\b/.test(text);
  const hasLookup = /\b(la gi|what is|whats|ability|ky nang|skill|mana|noi tai|toc he|trait|item|trang bi|augment|nang cap|gia|cost|mo ta|describe|tell me about|thong tin)\b/.test(text);
  const hasRecommendation = RECOMMEND_WORD.test(text) || HAVE_WORD.test(text) || COMP_WORD.test(text);

  if (isStrategyQuestion(text)) return 'strategy_analysis';
  if (hasMeta) return 'meta_query';
  if (hasPatchChange) return 'patch_change';
  if (hasCurrentPatch && !entities.length && !comps.length) return 'set_patch';
  if (hasCompare) return 'comp_comparison';
  if (comps.length && !entities.length) return 'comp_search';
  if (entities.length && hasRecommendation) return 'comp_recommendation';
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
  deps: { generate?: typeof generateAssistantAnswer } = {}
): Promise<Omit<AssistantResponse, 'requestId'>> {
  const generate = deps.generate ?? generateAssistantAnswer;
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

  let resolutionText = request.message;
  let mentionText = request.message;
  let entityMentions = findEntityMentions(catalog, mentionText);
  let compMentions = findCompMentions(comps, mentionText);
  const priorUser = [...request.history].reverse().find((entry) => entry.role === 'user');
  const followUp = /\b(nay|do|no|it|this|that|above|tren|comp nay|con gi|what about)\b/i.test(normalizeSpaced(request.message)) || request.message.length < 40;
  if (!entityMentions.length && !compMentions.length && priorUser && followUp) {
    resolutionText = `${priorUser.content} ${request.message}`;
    mentionText = resolutionText;
    entityMentions = findEntityMentions(catalog, mentionText);
    compMentions = findCompMentions(comps, mentionText);
  }

  const entities = unique([...contextEntities, ...entityMentions.map((match) => match.entity)]).filter(
    (entity, index, list) =>
      list.findIndex(
        (entry) =>
          entry.type === entity.type &&
          normalize(entry.name) === normalize(entity.name) &&
          entry.rarity === entity.rarity
      ) === index
  );
  const mentionedComps = [...contextComps, ...compMentions].filter(
    (comp, index, list) => list.findIndex((entry) => sameComp(entry, comp)) === index
  );

  const text = normalizeSpaced(resolutionText);
  const wantsReferenceData = isReferenceDataQuestion(text);
  let intent = detectIntent(text, entities, mentionedComps, meta.setId);
  if (wantsReferenceData && ['strategy_analysis', 'unsupported_or_unknown'].includes(intent)) {
    intent = 'gameplay_knowledge';
  }

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
    if (selectedEntities.length !== 1 && !mechanics && !wantsReferenceData) {
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
  const relatedComps = ['entity_lookup', 'gameplay_knowledge'].includes(intent) ? compsUsingItems(comps, selectedEntities) : [];
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
        generate: (request) => withInferenceSlot(() => generate(request)),
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
    limitations.push(t(request.lang, 'Board and tier from MetaTFT; tips and stages from TFT Academy.', 'Board/tier từ MetaTFT; tips/stages từ TFT Academy.'));
  }
  if (intent === 'entity_lookup' || (intent === 'gameplay_knowledge' && selectedEntities.length)) {
    limitations.push(t(request.lang, 'Static data from CommunityDragon and lib/tft.json.', 'Dữ liệu tĩnh từ CommunityDragon và lib/tft.json.'));
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
    catalog
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
      result = await withInferenceSlot(() =>
        generate({
          system: buildSystemPrompt(request.lang, evidence),
          messages: [
            ...request.history.map((entry) => ({ role: entry.role, content: entry.content })),
            { role: 'user', content: buildUserPrompt(request.message, evidence) },
            ...toolMessages,
          ],
          maxOutputTokens: 800,
          signal,
        })
      );
    }
    const parsed = parseGeneratedAnswer(result.text);
    if (!parsed) {
      assistantLog('invalid_answer', { length: result.text.length, sample: result.text.slice(0, 200) });
      return {
        ...base,
        answer: referenceAnswer || deterministic.answer,
        mode: 'deterministic',
        limitations: unique([...limitations, t(request.lang, 'The generated answer was invalid; I used the data summary instead.', 'Câu trả lời tự động không hợp lệ; đã dùng bản tóm tắt từ dữ liệu.')]),
      };
    }
    const generatedText = [parsed.answer, ...parsed.sections.flatMap((section) => section.points)].join(' ');
    const unsupportedNumbers = intent === 'gameplay_knowledge' && mechanics ? ungroundedNumbers(generatedText, evidence) : [];
    if (unsupportedNumbers.length) {
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
    return {
      ...base,
      answer: referenceAnswer || deterministic.answer,
      mode: 'deterministic',
      limitations: unique([...limitations, t(request.lang, 'The model is temporarily unavailable; I used the data summary instead.', 'Model tạm thời không khả dụng; đã dùng bản tóm tắt từ dữ liệu.')]),
    };
  }
}
