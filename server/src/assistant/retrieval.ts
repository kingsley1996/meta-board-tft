import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Lang } from './contracts.ts';
import { normalizeSpaced } from './entities.ts';

export type KnowledgeChunk = {
  id: string;
  sourceId: string;
  sourceType: 'mechanics' | 'guide' | 'tip';
  documentTitle: string;
  sectionTitle: string;
  url: string;
  version: string;
  updated: string;
  lang: Lang;
  text: string;
  tags: string[];
  priority: number;
  checksum: string;
};

export type KnowledgeHit = {
  chunk: KnowledgeChunk;
  score: number;
};

const chunksPath = join(import.meta.dirname, '../../../knowledge/chunks.jsonl');
const chunks = readFileSync(chunksPath, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as KnowledgeChunk);

const STOPWORDS = new Set(
  (
    'a an and are as at be been but by can could did do does for from had has have how i if in into is it its ' +
    'me more most my no not of on or our out over should so than that the their them then there these they ' +
    'this to up was we were what when where which who why will with would you your ' +
    'la gi cua va co the nao thi cho khi mot nhung cac trong ra sao nhu de voi tu den bi duoc khong minh ban ' +
    'toi hoi ve tren duoi nay do day a work works working mean means meaning explain tell please help want need know about bao nhieu won'
  ).split(' ')
);

function tokenize(value: string): string[] {
  const tokens: string[] = [];
  for (const token of normalizeSpaced(value).split(' ').filter(Boolean)) {
    if (token.length < 2 || STOPWORDS.has(token)) continue;
    tokens.push(token);
    if (token.length > 3 && token.endsWith('s')) tokens.push(token.slice(0, -1));
    if (token.length > 5 && token.endsWith('ing')) tokens.push(token.slice(0, -3));
    if (token.length > 4 && token.endsWith('ies')) tokens.push(`${token.slice(0, -3)}y`);
    if (token.length > 4 && token.endsWith('ed')) tokens.push(token.slice(0, -2));
  }
  return tokens;
}

type IndexedChunk = KnowledgeChunk & {
  terms: Map<string, number>;
  titleTerms: Set<string>;
  length: number;
};

const indexed: IndexedChunk[] = chunks.map((chunk) => {
  const tokens = tokenize(`${chunk.sectionTitle} ${chunk.text}`);
  const terms = new Map<string, number>();
  for (const token of tokens) terms.set(token, (terms.get(token) ?? 0) + 1);
  return { ...chunk, terms, titleTerms: new Set(tokenize(chunk.sectionTitle)), length: tokens.length };
});

const documentFrequency = new Map<string, number>();
for (const chunk of indexed) {
  for (const term of chunk.terms.keys()) {
    documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }
}
const averageLength = indexed.reduce((sum, chunk) => sum + chunk.length, 0) / indexed.length || 1;

export function knowledgeChunks(): readonly KnowledgeChunk[] {
  return chunks;
}

export function searchKnowledge(
  query: string,
  options: { limit?: number; lang?: Lang; sourceType?: KnowledgeChunk['sourceType'] } = {}
): KnowledgeHit[] {
  const limit = options.limit ?? 5;
  const queryTerms = [...new Set(tokenize(query))];
  if (!queryTerms.length) return [];

  const k1 = 1.2;
  const b = 0.75;
  const hits: KnowledgeHit[] = [];
  for (const chunk of indexed) {
    if (options.lang && chunk.lang !== options.lang) continue;
    if (options.sourceType && chunk.sourceType !== options.sourceType) continue;
    let score = 0;
    for (const term of queryTerms) {
      const frequency = chunk.terms.get(term);
      if (!frequency) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (indexed.length - df + 0.5) / (df + 0.5));
      score += idf * ((frequency * (k1 + 1)) / (frequency + k1 * (1 - b + (b * chunk.length) / averageLength)));
      if (chunk.titleTerms.has(term)) score += idf;
    }
    if (score > 0) hits.push({ chunk, score });
  }

  hits.sort((a, b) => b.score - a.score || a.chunk.priority - b.chunk.priority || a.chunk.id.localeCompare(b.chunk.id));
  return hits.slice(0, limit);
}
