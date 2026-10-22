import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Lang } from '../contracts.ts';
import { answerAssistant } from '../orchestrator.ts';

process.env.ASSISTANT_LOAD_TIMEOUT_MS = '120000';
process.env.ASSISTANT_REQUEST_TIMEOUT_MS = '120000';

type AccuracyCase = {
  id: string;
  question: string;
  lang: Lang;
  expect: {
    status: 'answered' | 'needs_clarification' | 'insufficient_data' | 'unsupported';
    intent?: string;
    mode?: 'llm' | 'deterministic';
    contains?: string[];
    matches?: string[];
    forbidden?: string[];
    sources?: string[];
  };
};

type CaseResult = {
  id: string;
  lang: Lang;
  status: string;
  intent: string;
  mode: string;
  latencyMs: number;
  fallback: boolean;
  ok: boolean;
  problems: string[];
  answer: string;
  error?: string;
};

const fileArg = process.argv.find((arg) => arg.startsWith('--file='))?.slice('--file='.length) ?? './accuracy-cases.jsonl';
const allCases = readFileSync(new URL(fileArg, import.meta.url), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as AccuracyCase);

const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean);
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))?.slice('--limit='.length);
const limit = limitArg ? Number(limitArg) : null;
const cases = allCases.filter((entry) => !only?.length || only.includes(entry.id)).slice(0, limit ?? undefined);

const results: CaseResult[] = [];
for (const entry of cases) {
  const started = Date.now();
  try {
    const answer = await answerAssistant(
      {
        message: entry.question,
        lang: entry.lang,
        conversationId: randomUUID(),
        history: [],
        context: { pageType: 'assistant', compSlug: null, entityIds: [] },
      },
      new AbortController().signal
    );
    const problems: string[] = [];
    const text = answer.answer.toLowerCase();
    if (answer.status !== entry.expect.status) problems.push(`status ${answer.status} != ${entry.expect.status}`);
    if (entry.expect.intent && answer.intent !== entry.expect.intent) problems.push(`intent ${answer.intent} != ${entry.expect.intent}`);
    if (entry.expect.mode && answer.mode !== entry.expect.mode) problems.push(`mode ${answer.mode} != ${entry.expect.mode}`);
    for (const value of entry.expect.contains ?? []) {
      if (!text.includes(value.toLowerCase())) problems.push(`missing "${value}"`);
    }
    for (const pattern of entry.expect.matches ?? []) {
      if (!new RegExp(pattern, 'i').test(answer.answer)) problems.push(`missing /${pattern}/`);
    }
    for (const pattern of entry.expect.forbidden ?? []) {
      if (new RegExp(pattern, 'i').test(answer.answer)) problems.push(`forbidden /${pattern}/`);
    }
    for (const source of entry.expect.sources ?? []) {
      if (!answer.sources.some((item) => item.id === source)) problems.push(`missing source ${source}`);
    }
    const fallback = answer.limitations.some((item) =>
      /temporarily unavailable|tạm thời không khả dụng|generated answer was invalid|contained numbers not in the data/i.test(item)
    );
    results.push({
      id: entry.id,
      lang: entry.lang,
      status: answer.status,
      intent: answer.intent,
      mode: answer.mode,
      latencyMs: Date.now() - started,
      fallback,
      ok: problems.length === 0,
      problems,
      answer: answer.answer,
    });
    const usedFallback = answer.limitations.some((item) =>
      /temporarily unavailable|tạm thời không khả dụng|generated answer was invalid|contained numbers not in the data/i.test(item)
    );
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${entry.id} [${answer.intent}/${answer.mode}]${usedFallback ? ' [fallback]' : ''} ${Date.now() - started}ms`);
    if (problems.length) {
      console.log(`     ${problems.join('; ')}`);
      console.log(`     ANSWER: ${answer.answer.slice(0, 700)}`);
    }
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    results.push({
      id: entry.id,
      lang: entry.lang,
      status: 'error',
      intent: 'error',
      mode: 'error',
      latencyMs: Date.now() - started,
      fallback: false,
      ok: false,
      problems: [detail],
      answer: '',
      error: detail,
    });
    console.log(`FAIL ${entry.id} [error] ${Date.now() - started}ms: ${detail}`);
  }
}

const llm = results.filter((entry) => entry.mode === 'llm');
const deterministic = results.filter((entry) => entry.mode === 'deterministic');
const errors = results.filter((entry) => entry.mode === 'error');
const summary = {
  generatedAt: new Date().toISOString(),
  model: process.env.ASSISTANT_MODEL ?? 'qwen3.5:9b',
  total: results.length,
  passed: results.filter((entry) => entry.ok).length,
  accuracy: results.length ? results.filter((entry) => entry.ok).length / results.length : 0,
  llmCases: llm.length,
  llmPassed: llm.filter((entry) => entry.ok).length,
  llmAccuracy: llm.length ? llm.filter((entry) => entry.ok).length / llm.length : 0,
  deterministicCases: deterministic.length,
  deterministicPassed: deterministic.filter((entry) => entry.ok).length,
  errors: errors.length,
  averageLatencyMs: results.length ? Math.round(results.reduce((sum, entry) => sum + entry.latencyMs, 0) / results.length) : 0,
  fallbacks: results.filter((entry) => entry.fallback).length,
};

console.log(
  `\n${summary.passed}/${summary.total} correct (${(summary.accuracy * 100).toFixed(1)}%) | ` +
    `LLM ${summary.llmPassed}/${summary.llmCases} (${(summary.llmAccuracy * 100).toFixed(1)}%) | ` +
    `deterministic ${summary.deterministicPassed}/${summary.deterministicCases} | ` +
    `errors ${summary.errors} | avg ${summary.averageLatencyMs}ms`
);
if (process.argv.includes('--write') && cases.length === allCases.length) {
  writeFileSync(
    new URL('./accuracy-baseline.json', import.meta.url),
    `${JSON.stringify({ summary, cases: results }, null, 2)}\n`
  );
  console.log('baseline written to eval/accuracy-baseline.json');
}
if (summary.passed < summary.total) process.exitCode = 1;
