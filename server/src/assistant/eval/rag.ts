import { readFileSync, writeFileSync } from 'node:fs';
import { knowledgeChunks, searchKnowledge } from '../retrieval.ts';
import type { Lang } from '../contracts.ts';

type RagCase = {
  id: string;
  query: string;
  lang: Lang;
  answerable: boolean;
  relevant: string[];
};

const cases = readFileSync(new URL('./rag-cases.jsonl', import.meta.url), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as RagCase);

const chunks = new Map(knowledgeChunks().map((chunk) => [chunk.id, chunk]));
for (const entry of cases) {
  for (const id of entry.relevant) {
    const chunk = chunks.get(id);
    if (!chunk) throw new Error(`${entry.id}: missing relevant chunk ${id}; run npm run build:knowledge`);
    if (chunk.lang !== entry.lang) throw new Error(`${entry.id}: relevant chunk ${id} is ${chunk.lang}, expected ${entry.lang}`);
  }
}

const failures: string[] = [];
const results: { id: string; rank: number | null; top: string | null; ok: boolean }[] = [];
let positives = 0;
let negatives = 0;
let hit1 = 0;
let hit3 = 0;
let hit5 = 0;
let reciprocalRank = 0;

for (const entry of cases) {
  const hits = searchKnowledge(entry.query, { limit: 10, lang: entry.lang });
  const top = hits[0]?.chunk.id ?? null;
  if (!entry.answerable) {
    negatives += 1;
    const ok = hits.length === 0;
    results.push({ id: entry.id, rank: null, top, ok });
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${entry.id}${ok ? '' : `: matched ${top}`}`);
    if (!ok) failures.push(entry.id);
    continue;
  }

  positives += 1;
  const rank = hits.findIndex((hit) => entry.relevant.includes(hit.chunk.id));
  if (rank === 0) hit1 += 1;
  if (rank >= 0 && rank < 3) hit3 += 1;
  if (rank >= 0 && rank < 5) hit5 += 1;
  if (rank >= 0) reciprocalRank += 1 / (rank + 1);
  const ok = rank >= 0 && rank < 5;
  results.push({ id: entry.id, rank: rank >= 0 ? rank + 1 : null, top, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${entry.id}: rank ${rank >= 0 ? rank + 1 : '-'} (${top ?? 'no hit'})`);
  if (!ok) failures.push(entry.id);
}

const metrics = {
  generatedAt: new Date().toISOString(),
  positives,
  negatives,
  hitAt1: positives ? hit1 / positives : 0,
  hitAt3: positives ? hit3 / positives : 0,
  hitAt5: positives ? hit5 / positives : 0,
  mrrAt10: positives ? reciprocalRank / positives : 0,
  cases: results,
};

console.log(
  `\n${positives} positive, ${negatives} negative | hit@1 ${(metrics.hitAt1 * 100).toFixed(1)}% | hit@3 ${(metrics.hitAt3 * 100).toFixed(1)}% | hit@5 ${(metrics.hitAt5 * 100).toFixed(1)}% | MRR ${metrics.mrrAt10.toFixed(3)}`
);
if (process.argv.includes('--write')) {
  writeFileSync(new URL('./rag-baseline.json', import.meta.url), `${JSON.stringify(metrics, null, 2)}\n`);
  console.log('baseline written to eval/rag-baseline.json');
}
if (metrics.hitAt5 < 0.9 || metrics.mrrAt10 < 0.6 || failures.some((id) => !cases.find((entry) => entry.id === id)?.answerable)) {
  process.exitCode = 1;
}
