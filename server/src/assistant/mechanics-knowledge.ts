import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  incomeBase,
  interest,
  poolSizes,
  shopOdds,
  streakBonus,
} from '../../../lib/mechanics.ts';
import type { Lang } from './contracts.ts';
import { normalizeSpaced } from './entities.ts';

export type MechanicsEvidence = {
  setId: string;
  setName: string;
  topic: string;
  patch: string;
  rules: string[];
};

type LocalizedRules = { en: string[]; vi: string[] };
type RawKeyword = string | { term: string; weight: number };
type RawTopic = {
  id: string;
  title: string;
  keywords: RawKeyword[];
  rules?: LocalizedRules;
  generator?: 'economy' | 'leveling';
  minScore?: number;
};
type RawSource = { title: string; url: string; provider: string };
type RawSet = {
  id: string;
  name: string;
  patch: string;
  updated: string;
  source: RawSource;
  topics: RawTopic[];
};
type RawKnowledge = {
  schemaVersion: number;
  defaultSet: string;
  general: { id: string; version: string; updated: string; source: RawSource; topics: RawTopic[] };
  sets: Record<string, RawSet>;
};

type Keyword = { term: string; weight: number };
type Topic = {
  id: string;
  title: string;
  keywords: Keyword[];
  minScore: number;
  rules: (lang: Lang) => string[];
};
type SetKnowledge = Omit<RawSet, 'topics'> & { topics: Topic[] };
type Knowledge = {
  general: Omit<RawKnowledge['general'], 'topics'> & { topics: Topic[] };
  sets: Record<string, SetKnowledge>;
  defaultSet: string;
};

const KNOWLEDGE_PATH = join(import.meta.dirname, '../../../lib/mechanics-knowledge.json');

function fail(message: string): never {
  throw new Error(`mechanics-knowledge.json: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${path} must be a non-empty string`);
  return value.trim();
}

function strings(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.length || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    fail(`${path} must be a non-empty string array`);
  }
  return value.map((entry) => (entry as string).trim());
}

function compileRules(value: unknown, path: string): LocalizedRules {
  const rules = record(value, path);
  const en = strings(rules.en, `${path}.en`);
  const vi = strings(rules.vi, `${path}.vi`);
  if (en.length !== vi.length) fail(`${path}.en and ${path}.vi must have the same length`);
  return { en, vi };
}

function compileKeywords(value: unknown, path: string): Keyword[] {
  if (!Array.isArray(value) || !value.length) fail(`${path} must be a non-empty array`);
  const keywords: Keyword[] = [];
  value.forEach((entry, index) => {
    const term = typeof entry === 'string' ? entry : text(record(entry, `${path}[${index}]`).term, `${path}[${index}].term`);
    const weight =
      typeof entry === 'string'
        ? term.includes(' ')
          ? 3
          : 2
        : Number(record(entry, `${path}[${index}]`).weight ?? 2);
    const normalized = normalizeSpaced(term);
    if (!normalized) return;
    if (!Number.isFinite(weight) || weight <= 0) fail(`${path}[${index}].weight must be positive`);
    keywords.push({ term: normalized, weight });
  });
  if (!keywords.length) fail(`${path} has no usable keywords`);
  return keywords;
}

function compileTopics(value: unknown, path: string): Topic[] {
  if (!Array.isArray(value) || !value.length) fail(`${path} must be a non-empty array`);
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const topic = record(entry, `${path}[${index}]`);
    const id = text(topic.id, `${path}[${index}].id`);
    if (seen.has(id)) fail(`${path} has duplicate topic id ${id}`);
    seen.add(id);
    const title = text(topic.title, `${path}[${index}].title`);
    const keywords = compileKeywords(topic.keywords, `${path}[${index}].keywords`);
    const generator = topic.generator == null ? null : text(topic.generator, `${path}[${index}].generator`);
    if (generator && generator !== 'economy' && generator !== 'leveling') {
      fail(`${path}[${index}].generator must be economy or leveling`);
    }
    const staticRules = topic.rules == null ? null : compileRules(topic.rules, `${path}[${index}].rules`);
    if (!generator && !staticRules) fail(`${path}[${index}] needs rules or generator`);
    const minScore = Number(topic.minScore ?? 2);
    if (!Number.isFinite(minScore) || minScore <= 0) fail(`${path}[${index}].minScore must be positive`);
    return {
      id,
      title,
      keywords,
      minScore,
      rules:
        generator === 'economy'
          ? economyRules
          : generator === 'leveling'
            ? levelingRules
            : (lang: Lang) => staticRules![lang],
    };
  });
}

function compileSet(value: unknown, path: string): SetKnowledge {
  const set = record(value, path);
  return {
    id: text(set.id, `${path}.id`),
    name: text(set.name, `${path}.name`),
    patch: text(set.patch, `${path}.patch`),
    updated: text(set.updated, `${path}.updated`),
    source: compileSource(set.source, `${path}.source`),
    topics: compileTopics(set.topics, `${path}.topics`),
  };
}

function compileSource(value: unknown, path: string): RawSource {
  const source = record(value, path);
  return {
    title: text(source.title, `${path}.title`),
    url: text(source.url, `${path}.url`),
    provider: text(source.provider, `${path}.provider`),
  };
}

function compileKnowledge(value: unknown): Knowledge {
  const root = record(value, 'root');
  if (root.schemaVersion !== 1) fail('schemaVersion must be 1');
  const general = record(root.general, 'general');
  const generalMeta = {
    id: text(general.id, 'general.id'),
    version: text(general.version, 'general.version'),
    updated: text(general.updated, 'general.updated'),
    source: compileSource(general.source, 'general.source'),
    topics: compileTopics(general.topics, 'general.topics'),
  };
  const rawSets = record(root.sets, 'sets');
  const sets: Record<string, SetKnowledge> = {};
  for (const [key, value] of Object.entries(rawSets)) {
    const set = compileSet(value, `sets.${key}`);
    if (set.id !== key) fail(`sets.${key}.id must match its key`);
    sets[key] = set;
  }
  if (!Object.keys(sets).length) fail('sets must not be empty');
  const defaultSet = text(root.defaultSet, 'defaultSet');
  if (!sets[defaultSet]) fail(`defaultSet ${defaultSet} is not in sets`);
  return { general: generalMeta, sets, defaultSet };
}

const KNOWLEDGE = compileKnowledge(JSON.parse(readFileSync(KNOWLEDGE_PATH, 'utf8')) as unknown);

function isVi(lang: Lang): boolean {
  return lang === 'vi';
}

function economyRules(lang: Lang): string[] {
  const income = incomeBase.map((row) => `${row.rounds}:${row.gold}`).join(', ');
  const savings = interest.map((row) => `${row.hold}:${row.gold}`).join(', ');
  const streak = streakBonus.map((row) => `${row.streak}:${row.gold}`).join(', ');
  return isVi(lang)
    ? [
        `Thu nhập nền theo vòng (vòng:vàng): ${income}.`,
        `Lãi theo vàng giữ lại (vàng:lãi): ${savings}; lãi tính trên vàng đang giữ trước khi cộng thu nhập nền mỗi vòng.`,
        `Thưởng chuỗi (chuỗi:vàng): ${streak}.`,
        'Giữ 50 vàng để tối đa lãi là thói quen phổ biến, nhưng lên cấp hoặc roll để giữ máu đôi khi đúng hơn.',
      ]
    : [
        `Base income by round (round:gold): ${income}.`,
        `Interest by gold held (held:gold): ${savings}; interest is calculated on gold held before that round's base income is added.`,
        `Streak bonus (streak:gold): ${streak}.`,
        'Holding 50 gold for maximum interest is common, but leveling or rolling to stabilize can be correct.',
      ];
}

function levelingRules(lang: Lang): string[] {
  const odds = shopOdds.map((row) => `${row.level}:${row.odds.join('/')}`).join(', ');
  const pools = poolSizes.map((row) => `${row.cost}-cost:${row.copies}/${row.distinct}`).join(', ');
  return isVi(lang)
    ? [
        'Mỗi vòng nhận 2 XP miễn phí; 4 vàng mua 4 XP.',
        `Tỉ lệ shop theo cấp, thứ tự 1-5 cost: ${odds}.`,
        `Pool mỗi cost (bản sao/số tướng khác nhau): ${pools}.`,
        'Ba bản sao thành 2 sao; 3 sao cần chín bản sao. Pool là dùng chung nên tranh tướng làm giảm khả năng ra bản sao.',
      ]
    : [
        'Gain 2 free XP each round; 4 gold buys 4 XP.',
        `Shop odds by level, 1-5 cost: ${odds}.`,
        `Pool by cost (copies/distinct champions): ${pools}.`,
        'Three copies make a 2-star; a 3-star needs nine. The pool is shared, so contesting champions reduces your odds.',
      ];
}

// Weighted phrase/token scoring over a small offline corpus; upgrade to embeddings only if the corpus grows.
function scoreTopic(text: string, tokens: Set<string>, topic: Topic): number {
  let score = 0;
  for (const { term, weight } of topic.keywords) {
    if (term.includes(' ')) {
      if (` ${text} `.includes(` ${term} `)) score += weight;
      continue;
    }
    if (tokens.has(term) || (term.length > 3 && tokens.has(`${term}s`)) || (term.endsWith('s') && tokens.has(term.slice(0, -1)))) {
      score += weight;
    }
  }
  return score;
}

type ScopedTopic = { topic: Topic; score: number };

function matchTopics(text: string, setId: string): ScopedTopic[] {
  const normalized = normalizeSpaced(text);
  const tokens = new Set(normalized.split(' ').filter(Boolean));
  const matched = (topics: Topic[]) =>
    topics
      .map((topic) => ({ topic, score: scoreTopic(normalized, tokens, topic) }))
      .filter((entry) => entry.score >= entry.topic.minScore);
  const setMatches = matched(KNOWLEDGE.sets[setId]?.topics ?? []);
  const setIds = new Set(setMatches.map((entry) => entry.topic.id));
  let all = [...matched(KNOWLEDGE.general.topics).filter((entry) => !setIds.has(entry.topic.id)), ...setMatches];
  if (all.some((entry) => entry.topic.id !== 'core')) {
    all = all.filter((entry) => entry.topic.id !== 'core');
  }
  return all.sort((a, b) => b.score - a.score);
}

export type MechanicsKnowledgeSnapshot = {
  general: {
    id: string;
    version: string;
    updated: string;
    source: RawSource;
    topics: { id: string; title: string; rules: { en: string[]; vi: string[] } }[];
  };
  sets: Record<
    string,
    {
      id: string;
      name: string;
      patch: string;
      updated: string;
      source: RawSource;
      topics: { id: string; title: string; rules: { en: string[]; vi: string[] } }[];
    }
  >;
};

export function mechanicsKnowledgeSnapshot(): MechanicsKnowledgeSnapshot {
  const topics = (entries: Topic[]) =>
    entries.map((topic) => ({
      id: topic.id,
      title: topic.title,
      rules: { en: topic.rules('en'), vi: topic.rules('vi') },
    }));
  const sets = Object.fromEntries(
    Object.entries(KNOWLEDGE.sets).map(([id, set]) => [
      id,
      {
        id: set.id,
        name: set.name,
        patch: set.patch,
        updated: set.updated,
        source: set.source,
        topics: topics(set.topics),
      },
    ])
  );
  return {
    general: {
      id: KNOWLEDGE.general.id,
      version: KNOWLEDGE.general.version,
      updated: KNOWLEDGE.general.updated,
      source: KNOWLEDGE.general.source,
      topics: topics(KNOWLEDGE.general.topics),
    },
    sets,
  };
}

export const mechanicsSource = (setId: string = KNOWLEDGE.defaultSet) => {
  const set = KNOWLEDGE.sets[setId];
  const source = set?.source ?? KNOWLEDGE.general.source;
  return {
    title: set ? `${set.name} mechanics` : 'TFT mechanics',
    url: source.url,
    provider: source.provider,
    patch: set?.patch ?? 'latest',
    updated: set?.updated ?? KNOWLEDGE.general.updated,
  };
};

export function mechanicsPrimer(lang: Lang): string {
  const core = KNOWLEDGE.general.topics.find((topic) => topic.id === 'core');
  const rules = core?.rules(lang) ?? [];
  return ['GENERAL TFT RULES:', ...rules.map((rule) => `- ${rule}`)].join('\n');
}

export function isMechanicsQuestion(text: string, setId: string = KNOWLEDGE.defaultSet): boolean {
  return matchTopics(text, setId).length > 0;
}

export function mechanicsFor(text: string, lang: Lang, setId: string = KNOWLEDGE.defaultSet): MechanicsEvidence | null {
  const matched = matchTopics(text, setId);
  if (!matched.length) return null;
  const set = KNOWLEDGE.sets[setId];
  const rules = [...new Set(matched.flatMap((entry) => entry.topic.rules(lang)))].slice(0, 14);
  return {
    setId: set?.id ?? setId,
    setName: set?.name ?? 'TFT',
    topic: matched.map((entry) => entry.topic.id).join(','),
    patch: set?.patch ?? 'latest',
    rules,
  };
}

export function mechanicsAnswer(evidence: MechanicsEvidence, lang: Lang): string {
  const intro = isVi(lang)
    ? `Theo luật ${evidence.setName} (patch ${evidence.patch}):`
    : `Under ${evidence.setName} rules (patch ${evidence.patch}):`;
  return `${intro} ${evidence.rules.join(' ')}`;
}
