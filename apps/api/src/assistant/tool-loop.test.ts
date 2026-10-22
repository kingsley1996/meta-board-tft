import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProviderRequest, ProviderResult, ProviderTool } from './provider.ts';
import { runToolLoop } from './tool-loop.ts';
import type { ToolExecution } from './tool-registry.ts';

const tools: ProviderTool[] = [
  {
    type: 'function',
    function: { name: 'find_comps', description: 'Find comps', parameters: { type: 'object' } },
  },
];

function result(toolCalls: ProviderResult['toolCalls'], text = ''): ProviderResult {
  return { text, model: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, toolCalls };
}

function execute(name: string, args: unknown): Promise<ToolExecution> {
  return Promise.resolve({ tool: name, payload: { args } });
}

const config = { maxRounds: 3, maxCalls: 5, maxCallsPerRound: 2, toolTimeoutMs: 1_000 };

test('finishes immediately when the model returns no tool call', async () => {
  const loop = await runToolLoop({
    system: 'planner',
    answerSystem: 'answer',
    messages: [{ role: 'user', content: 'hello' }],
    tools,
    lang: 'en',
    signal: new AbortController().signal,
    generate: async () => result([]),
    execute,
    config,
  });
  assert.equal(loop.calls, 0);
  assert.equal(loop.stopped, 'no_call');
  assert.deepEqual(loop.messages, []);
});

test('returns tool results to the next model turn and stops after the answer', async () => {
  const seen: ProviderRequest[] = [];
  const responses = [result([{ name: 'find_comps', arguments: { tier: 'S' } }]), result([], 'done')];
  const loop = await runToolLoop({
    system: 'planner',
    answerSystem: 'answer',
    messages: [{ role: 'user', content: 'find it' }],
    tools,
    lang: 'vi',
    signal: new AbortController().signal,
    generate: async (request) => {
      seen.push(request);
      return responses.shift()!;
    },
    execute: async (name, args, lang) => {
      assert.equal(name, 'find_comps');
      assert.deepEqual(args, { tier: 'S' });
      assert.equal(lang, 'vi');
      return execute(name, args);
    },
    config,
  });
  assert.equal(loop.calls, 1);
  assert.equal(loop.rounds, 2);
  assert.equal(loop.stopped, 'no_call');
  assert.equal(seen.length, 2);
  assert.equal(seen[0].format, null);
  assert.equal(seen[0].system, 'planner');
  assert.equal(seen[1].format, 'json');
  assert.equal(seen[1].system, 'answer');
  assert.equal(seen[1].messages.at(-1)?.role, 'tool');
  assert.deepEqual(seen[1].messages.at(-1), {
    role: 'tool',
    tool_name: 'find_comps',
    content: JSON.stringify({ status: 'ok', tool: 'find_comps', data: { args: { tier: 'S' } } }),
  });
});

test('can stop after the first successful tool batch for deterministic finalization', async () => {
  const seen: ProviderRequest[] = [];
  const loop = await runToolLoop({
    system: 'planner',
    answerSystem: 'answer',
    messages: [{ role: 'user', content: 'find it' }],
    tools,
    lang: 'en',
    signal: new AbortController().signal,
    finalizeModel: false,
    generate: async (request) => {
      seen.push(request);
      return result([{ name: 'find_comps', arguments: { tier: 'S' } }]);
    },
    execute,
    config,
  });
  assert.equal(loop.calls, 1);
  assert.equal(loop.rounds, 1);
  assert.equal(loop.stopped, 'finalized');
  assert.equal(loop.final, null);
  assert.equal(seen.length, 1);
});

test('executes multiple calls sequentially and enforces per-round/call limits', async () => {
  const calls: string[] = [];
  const loop = await runToolLoop({
    system: 'planner',
    answerSystem: 'answer',
    messages: [{ role: 'user', content: 'compare' }],
    tools,
    lang: 'en',
    signal: new AbortController().signal,
    generate: async () =>
      result([
        { name: 'find_comps', arguments: { tier: 'S' } },
        { name: 'find_comps', arguments: { tier: 'A' } },
        { name: 'find_comps', arguments: { tier: 'B' } },
      ]),
    execute: async (name, args) => {
      calls.push(JSON.stringify(args));
      return execute(name, args);
    },
    config: { ...config, maxCallsPerRound: 2, maxCalls: 2 },
  });
  assert.deepEqual(calls, ['{"tier":"S"}', '{"tier":"A"}']);
  assert.equal(loop.calls, 2);
  assert.equal(loop.results.length, 2);
  assert.equal(loop.stopped, 'max_calls');
});

test('rejects unknown, malformed and repeated calls without throwing', async () => {
  const loop = await runToolLoop({
    system: 'planner',
    answerSystem: 'answer',
    messages: [{ role: 'user', content: 'x' }],
    tools,
    lang: 'en',
    signal: new AbortController().signal,
    generate: async () =>
      result([
        { name: 'shell', arguments: {} },
        { name: 'find_comps', arguments: null, argumentError: 'Tool arguments must be an object.' },
      ]),
    execute,
    config: { ...config, maxRounds: 1 },
  });
  assert.equal(loop.results.length, 0);
  assert.deepEqual(loop.failures.map((failure) => failure.code), ['unknown_tool', 'invalid_arguments']);
  assert.equal(loop.stopped, 'max_rounds');
});

test('stops on repeated tool arguments', async () => {
  const loop = await runToolLoop({
    system: 'planner',
    answerSystem: 'answer',
    messages: [{ role: 'user', content: 'x' }],
    tools,
    lang: 'en',
    signal: new AbortController().signal,
    generate: async () => result([{ name: 'find_comps', arguments: { tier: 'S' } }]),
    execute,
    config: { ...config, maxRounds: 2, maxCalls: 2 },
  });
  assert.equal(loop.results.length, 1);
  assert.equal(loop.failures[0]?.code, 'repeated_call');
  assert.equal(loop.calls, 2);
});

test('returns aborted without starting a model turn', async () => {
  const abort = new AbortController();
  abort.abort();
  const loop = await runToolLoop({
    system: 'planner',
    answerSystem: 'answer',
    messages: [{ role: 'user', content: 'x' }],
    tools,
    lang: 'en',
    signal: abort.signal,
    generate: async () => result([]),
    execute,
    config,
  });
  assert.equal(loop.stopped, 'aborted');
  assert.equal(loop.rounds, 0);
});


test('classifies tool timeouts separately from invalid arguments', async () => {
  const loop = await runToolLoop({
    system: 'planner',
    answerSystem: 'answer',
    messages: [{ role: 'user', content: 'x' }],
    tools,
    lang: 'en',
    signal: new AbortController().signal,
    generate: async () => result([{ name: 'find_comps', arguments: {} }]),
    execute: async () => new Promise<ToolExecution>(() => {}),
    config: { ...config, maxRounds: 1, toolTimeoutMs: 5 },
  });
  assert.equal(loop.failures[0]?.code, 'timeout');
});

test('adds set provenance to tool messages', async () => {
  const seen: ProviderRequest[] = [];
  await runToolLoop({
    system: 'planner',
    answerSystem: 'answer',
    messages: [{ role: 'user', content: 'x' }],
    tools,
    lang: 'en',
    signal: new AbortController().signal,
    provenance: { setId: '18', patch: '18.4b' },
    generate: async (request) => {
      seen.push(request);
      return seen.length === 1 ? result([{ name: 'find_comps', arguments: {} }]) : result([], 'done');
    },
    execute,
    config,
  });
  assert.equal(
    seen[1].messages.at(-1)?.content,
    JSON.stringify({ status: 'ok', tool: 'find_comps', data: { args: {} }, meta: { setId: '18', patch: '18.4b' } })
  );
});
