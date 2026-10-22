import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { listComps } from '../../comps.ts';
import {
  type AssistantIntent,
  type AssistantStatus,
  type EntityId,
  type Lang,
  type CompData,
} from '../contracts.ts';
import { answerAssistant } from '../orchestrator.ts';

type EvalCase = {
  id: string;
  message: string;
  lang: Lang;
  context?: { compSlug?: string; entityIds?: EntityId[] };
  expect: {
    intent: AssistantIntent;
    status: AssistantStatus;
    entities?: EntityId[];
    recommendations?: boolean;
  };
};

const cases = readFileSync(new URL('./cases.jsonl', import.meta.url), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as EvalCase);

const comps = new Set(((await listComps(undefined, 'en')) as CompData[]).map((comp) => `comp:${comp.slug}`));
const failures: { id: string; detail: string }[] = [];
const results: { id: string; intent: string; status: string; mode: string; ok: boolean }[] = [];

for (const entry of cases) {
  try {
    const answer = await answerAssistant(
      {
        message: entry.message,
        lang: entry.lang,
        conversationId: randomUUID(),
        history: [],
        context: {
          pageType: entry.context?.compSlug ? 'comp' : 'assistant',
          compSlug: entry.context?.compSlug ?? null,
          entityIds: entry.context?.entityIds ?? [],
        },
      },
      new AbortController().signal,
      {
        generate: async () => ({
          text: JSON.stringify({ answer: 'Mock answer.', followUpQuestions: [], limitations: [] }),
          model: 'mock',
          usage: { inputTokens: 0, outputTokens: 0 },
          toolCalls: [],
        }),
      }
    );

    const problems: string[] = [];
    if (answer.intent !== entry.expect.intent) problems.push(`intent ${answer.intent} != ${entry.expect.intent}`);
    if (answer.status !== entry.expect.status) problems.push(`status ${answer.status} != ${entry.expect.status}`);
    for (const id of entry.expect.entities ?? []) {
      if (!answer.resolvedContext.entities.some((entity) => entity.id === id)) problems.push(`missing entity ${id}`);
    }
    if (entry.expect.recommendations) {
      if (!answer.recommendations.length) problems.push('no recommendations');
      for (const recommendation of answer.recommendations) {
        if (!comps.has(recommendation.compId)) problems.push(`unknown comp ${recommendation.compId}`);
      }
    }

    const ok = problems.length === 0;
    results.push({ id: entry.id, intent: answer.intent, status: answer.status, mode: answer.mode, ok });
    if (ok) {
      console.log(`ok   ${entry.id}`);
    } else {
      failures.push({ id: entry.id, detail: problems.join('; ') });
      console.log(`FAIL ${entry.id}: ${problems.join('; ')}`);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    failures.push({ id: entry.id, detail });
    results.push({ id: entry.id, intent: 'error', status: 'error', mode: 'error', ok: false });
    console.log(`FAIL ${entry.id}: ${detail}`);
  }
}

console.log(`\n${results.length - failures.length}/${results.length} cases passed`);
if (process.argv.includes('--write')) {
  writeFileSync(
    new URL('./baseline.json', import.meta.url),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), cases: results }, null, 2)}\n`
  );
  console.log('baseline written to eval/baseline.json');
}
if (failures.length) process.exitCode = 1;
