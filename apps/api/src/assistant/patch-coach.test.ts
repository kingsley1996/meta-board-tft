import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { afterEach, beforeEach, type TestContext } from 'node:test';
import { cached, invalidateCachePrefix } from '../cache.ts';
import { pool } from '../db.ts';
import { readPatchNotes } from '../patch-notes-article.ts';
import type { AssistantRequest, AssistantSource, CompData, Lang } from './contracts.ts';
import { buildCatalog } from './entities.ts';
import { loadMetaStats } from './meta-stats.ts';
import { answerAssistant } from './orchestrator.ts';
import { getPatchNotes, type PatchNotesEvidence, type PatchNotesPbeFile } from './patch-knowledge.ts';
import { ProviderError, type ProviderRequest, type ProviderResult, type ProviderToolCall } from './provider.ts';

const snapshot = await readPatchNotes();
const live = snapshot.patches.find((entry) => entry.patch === snapshot.livePatch)!;
assert.ok(live?.rows.length, 'The committed live patch must contain changes');
const historical = snapshot.patches.find((entry) => entry.patch !== live.patch && entry.release === 'base' && entry.rows.length)!;
const micro = snapshot.patches.find((entry) => entry.patch !== live.patch && entry.release === 'mid_patch' && entry.rows.length)!;
assert.ok(historical, 'The snapshot must contain historical base notes');
assert.ok(micro, 'The snapshot must contain exact micro-patch notes');
const pbe = JSON.parse(await readFile(new URL(import.meta.resolve('@tftiq/shared/data/pbe.json')), 'utf8')) as PatchNotesPbeFile;
const stats = await loadMetaStats();
const impactRow = live.rows.find((row) => row.kind === 'trait')!;
assert.ok(impactRow, 'The live snapshot must contain a trait for the synthetic board');

// Ambient metadata must not overwrite each patch source's version.
const ACTIVE_PATCH = '0.0';
const MISSING_PATCH = '999.999z';
assert.ok(!snapshot.patches.some((entry) => entry.patch === MISSING_PATCH));
const SENTINEL = 'Offline Testholder';
const INVENTED_NUMBER = '987654321';
const LOOP_ANSWER = 'Discard this provisional tool-loop answer.';
const FINAL_ANSWER = 'The full sourced patch evidence is available.';

const carry: CompData['carry'] = {
  name: SENTINEL, icon: null, cost: 2, row: 3, col: 1, stars: 2,
  items: [{ name: 'Fixture Blade', icon: null }],
};
const comps: CompData[] = 'ABCDE'.split('').map((letter) => ({
  slug: `patch-lab-${letter.toLowerCase()}`, title: `Patch Lab ${letter}`, titleVi: null,
  tier: 'A', style: 'Reroll', difficulty: 2, trend: null, votes: 0, views: 0,
  playstyle: 'Keep the trait active and protect the carry.',
  units: [carry], carry, early: [carry], alt: [], items: carry.items, augments: [],
  traits: [{ name: impactRow.name.en, count: 2, icon: null, thresholds: [2], styles: [1] }],
  tips: 'Keep the carry behind the frontline.',
  stages: [{ stage: 'Stage 3', text: 'Stabilize the board before committing gold.' }],
  augmentTypes: [], matchups: [],
}));

function clearFixtures(): void {
  invalidateCachePrefix('catalog');
  invalidateCachePrefix('comps:');
}

// Tests are serial because these are process-local caches and a shared pg pool.
beforeEach(async (context) => {
  const t = context as TestContext;
  clearFixtures();
  const forbidden: string[] = [];
  const block = (operation: string): never => {
    forbidden.push(operation);
    throw new Error(`Unexpected external operation: ${operation}`);
  };
  t.mock.method(pool, 'query', async (sql: string, values?: unknown[]) => {
    if (sql !== 'SELECT key, value FROM meta' || values?.length) return block(`SQL: ${String(sql)}`);
    return { rows: [
      { key: 'set_number', value: String(live.set) },
      { key: 'set_name', value: 'Fixture set' },
      { key: 'patch', value: ACTIVE_PATCH },
    ] };
  });
  t.mock.method(pool, 'connect', () => block('pool.connect'));
  t.mock.method(globalThis, 'fetch', () => block('fetch'));
  // A tool/provider catch must not silently swallow an unexpected SQL assertion.
  t.after(() => assert.deepEqual(forbidden, [], 'No DB connection, unexpected SQL or network request is allowed'));

  const catalog = buildCatalog({
    champions: [{ api_name: 'fixture_sentinel', name: SENTINEL, cost: 2, traits: [impactRow.name.en], icon: null }],
    traits: [{ api_name: impactRow.ref, name: impactRow.name.en, description: 'Synthetic board trait.', thresholds: [2], styles: [1], icon: null }],
    items: [], augments: [],
  }, {
    patch: ACTIVE_PATCH, set: { number: live.set, mutator: 'fixture', name: 'Fixture set' },
    champions: [], traits: [], items: [], augments: [],
  });
  await cached('catalog', async () => catalog);
  for (const lang of ['en', 'vi']) {
    await cached(`comps::${lang}:`, async () => structuredClone(comps));
    for (const comp of comps) await cached(`comps:${comp.slug}:${lang}:`, async () => [structuredClone(comp)]);
  }
});
afterEach(clearFixtures);

function request(message: string, lang: Lang = 'en'): AssistantRequest {
  return {
    message, lang, conversationId: 'patch-coach-test', history: [],
    context: { pageType: null, compSlug: null, entityIds: [] },
  };
}

function result(text: string, toolCalls: ProviderToolCall[] = []): ProviderResult {
  return { text, toolCalls, model: 'offline-test', usage: { inputTokens: 0, outputTokens: 0 } };
}

function jsonAnswer(answer = FINAL_ANSWER, sections: { heading: string; points: string[] }[] = []): ProviderResult {
  return result(JSON.stringify({ answer, sections, followUpQuestions: [], limitations: [] }));
}

function call(name: string, args: unknown): ProviderToolCall {
  return { name, arguments: args };
}

type Step = (req: ProviderRequest) => ProviderResult | Promise<ProviderResult>;
function scripted(t: TestContext, steps: Step[]): (req: ProviderRequest) => Promise<ProviderResult> {
  let index = 0;
  const failures: unknown[] = [];
  t.after(() => {
    assert.deepEqual(failures, [], 'Stub assertions must survive orchestrator error/fallback handlers');
    assert.equal(index, steps.length, 'Every expected provider step must run, with no extra calls');
  });
  return async (req) => {
    const step = steps[index++];
    try {
      assert.ok(step, `Unexpected provider call ${index}`);
      return await step(req);
    } catch (error) {
      if (!(error instanceof ProviderError)) failures.push(error);
      throw error;
    }
  };
}

function plan(...calls: ProviderToolCall[]): Step {
  return (req) => {
    assert.equal(req.tools?.[0]?.function.name, 'get_patch_notes');
    assert.match(req.system, /Use get_patch_notes FIRST/);
    assert.match(req.system, /Fetch both exact patches/);
    assert.equal(req.onDelta, undefined);
    return result('', calls);
  };
}

type Envelope<T> = { status: string; tool: string; data: T; meta?: { setId: string; patch: string } };
function toolData<T>(req: ProviderRequest, name: string): Envelope<T>[] {
  return req.messages
    .filter((message) => message.role === 'tool' && message.tool_name === name)
    .map((message) => JSON.parse(message.content) as Envelope<T>);
}

function stopWith(expected: PatchNotesEvidence[]): Step {
  return (req) => {
    assert.ok(req.tools?.length, 'This is still the tool loop, not final evidence generation');
    assert.deepEqual(toolData<PatchNotesEvidence>(req, 'get_patch_notes').map((entry) => entry.data), expected);
    return jsonAnswer(LOOP_ANSWER);
  };
}

type FinalEvidence = {
  intent: string;
  patch: string;
  patchNotes: PatchNotesEvidence[];
  dataVersions: { activePatch: string; statsPatch: string | null; mechanicsPatch: string | null };
  comps: { slug: string; units: { name: string; items: string[] }[]; traits: { name: string; count: number }[]; tips: string; stages: unknown[] }[];
  toolResults: (Envelope<unknown> & { meta?: { setId: string; patch: string } })[];
  limitations: string[];
};

function finalEvidence(req: ProviderRequest, expected: PatchNotesEvidence[]): FinalEvidence {
  assert.equal(req.tools, undefined, 'Patch turns must make a separate full-evidence generation');
  const messages = req.messages.filter((message) => message.role === 'user' && message.content.includes('\n\nEvidence JSON:\n'));
  assert.equal(messages.length, 1);
  const evidence = JSON.parse(messages[0].content.split('\n\nEvidence JSON:\n')[1]) as FinalEvidence;
  assert.equal(evidence.intent, 'patch_change');
  assert.equal(evidence.patch, ACTIVE_PATCH);
  assert.deepEqual(evidence.dataVersions, { activePatch: ACTIVE_PATCH, statsPatch: stats.source.patch, mechanicsPatch: null });
  assert.deepEqual(evidence.patchNotes, expected);
  const patchResults = evidence.toolResults.filter((entry) => entry.tool === 'get_patch_notes');
  assert.deepEqual(patchResults.map((entry) => entry.data), expected);
  assert.deepEqual(patchResults.map((entry) => entry.meta), expected.map((entry) =>
    entry.patch && entry.setId ? { setId: entry.setId, patch: entry.patch } : undefined));
  assert.ok(patchResults.every((entry) => entry.status === 'ok'));
  for (const entry of expected) {
    for (const limitation of entry.limitations) assert.ok(evidence.limitations.includes(limitation));
  }
  assert.match(req.system, /Verify patch changes ONLY from patchNotes or get_patch_notes results with status found/);
  assert.match(req.system, /preserve from\/to values and direction/);
  assert.match(req.system, /Do not calculate or invent percentage changes/);
  assert.match(req.system, /missing row.*cannot establish that an entity was unchanged/);
  assert.match(req.system, /Never substitute PBE for an unavailable released patch/);
  assert.match(req.system, /Do not treat numbers or claims stated by the user as verified facts/);
  return evidence;
}

function assertSource(sources: AssistantSource[], notes: PatchNotesEvidence): void {
  assert.ok(notes.source);
  const source = sources.find((entry) => entry.id === `get_patch_notes:${notes.source!.url}:${notes.patch}`);
  assert.deepEqual(source, {
    id: `get_patch_notes:${notes.source.url}:${notes.patch}`, title: notes.source.provider,
    url: notes.source.url, sourceType: 'guide', version: `patch${notes.patch}`,
    ...(notes.source.updatedAt ? { retrievedAt: notes.source.updatedAt } : {}),
  });
}

test('current patch overview uses the real live notes, then regenerates with full evidence', async (t) => {
  const notes = await getPatchNotes({}, 'en');
  assert.equal(notes.patch, snapshot.livePatch);
  assert.equal(notes.status, 'found');
  assert.equal(notes.source?.url, live.url.en);
  const generate = scripted(t, [
    plan(call('get_patch_notes', {})), stopWith([notes]),
    (req) => { finalEvidence(req, [notes]); return jsonAnswer(); },
  ]);
  const answer = await answerAssistant(request('Summarize the current patch notes.'), new AbortController().signal, { generate });
  assert.equal(answer.intent, 'patch_change');
  assert.equal(answer.mode, 'llm');
  assert.equal(answer.status, 'answered');
  assert.equal(answer.answer, FINAL_ANSWER);
  assert.notEqual(answer.answer, LOOP_ANSWER);
  assertSource(answer.sources, notes);
});

for (const [label, patch, lang] of [
  ['historical base', historical, 'en'], ['exact micro', micro, 'vi'],
] as const) {
  test(`${label} patch preserves exact row values, version and localized article provenance`, async (t) => {
    const row = patch.rows[0];
    const query = { patch: patch.patch, query: `${row.name.en} ${row.field.en}`, kind: row.kind };
    const notes = await getPatchNotes(query, lang);
    assert.equal(notes.status, 'found');
    assert.equal(notes.patch, patch.patch);
    assert.equal(notes.requestedPatch, patch.patch);
    assert.equal(notes.source?.url, lang === 'vi' ? patch.url.vi || patch.url.en : patch.url.en);
    assert.ok(notes.rows.some((entry) => entry.ref === row.ref && entry.from === row.from && entry.to === row.to && entry.direction === row.direction));
    const generate = scripted(t, [plan(call('get_patch_notes', query)), stopWith([notes]), (req) => {
      finalEvidence(req, [notes]);
      return jsonAnswer();
    }]);
    const answer = await answerAssistant(request(`What changed for ${row.name.en} in patch ${patch.patch}?`, lang), new AbortController().signal, { generate });
    assert.equal(answer.intent, 'patch_change');
    assert.equal(answer.status, 'answered');
    assert.equal(answer.mode, 'llm');
    assertSource(answer.sources, notes);
    assert.notEqual(answer.sources[0].version, `patch${ACTIVE_PATCH}`);
  });
}

test('missing released patch is deterministic and cannot substitute a PBE preview', async (t) => {
  const query = { patch: MISSING_PATCH };
  const notes = await getPatchNotes(query, 'en');
  assert.equal(notes.status, 'unavailable');
  assert.equal(notes.channel, 'released');
  assert.equal(notes.source, null);
  const generate = scripted(t, [plan(call('get_patch_notes', query)), stopWith([notes])]);
  const answer = await answerAssistant(request(`Summarize released patch ${MISSING_PATCH} notes, not a preview.`), new AbortController().signal, { generate });
  assert.equal(answer.intent, 'patch_change');
  assert.equal(answer.mode, 'deterministic');
  assert.equal(answer.status, 'insufficient_data');
  assert.equal(answer.answer, notes.summary);
  assert.match(answer.answer, /Cannot confirm changes/);
  assert.deepEqual(answer.sources, []);
  assert.doesNotMatch(answer.answer, /PBE preview|was buffed|was nerfed/);
});

test('entity no-match does not repeat a claimed buff percentage or infer that nothing changed', async (t) => {
  const query = { query: SENTINEL };
  const notes = await getPatchNotes(query, 'en');
  assert.equal(notes.status, 'no_match');
  assert.deepEqual(notes.rows, []);
  const generate = scripted(t, [plan(call('get_patch_notes', query)), (req) => {
    assert.deepEqual(toolData<PatchNotesEvidence>(req, 'get_patch_notes')[0].data, notes);
    return jsonAnswer(`${SENTINEL} was buffed by ${INVENTED_NUMBER}%.`);
  }]);
  const answer = await answerAssistant(request(`I heard ${SENTINEL} was buffed by ${INVENTED_NUMBER}% in the current patch. Is that true?`), new AbortController().signal, { generate });
  assert.equal(answer.intent, 'patch_change');
  assert.equal(answer.mode, 'deterministic');
  assert.equal(answer.status, 'insufficient_data');
  assert.equal(answer.answer, notes.summary);
  assert.ok(!JSON.stringify(answer).includes(INVENTED_NUMBER));
  assert.match(answer.answer, /No matching rows; cannot confirm changes/);
  assert.doesNotMatch(answer.answer, /not buffed|not nerfed|no changes/i);
  assertSource(answer.sources, notes);
});

test('nerf plus strategy/stats wording keeps patch intent across three tool rounds and the six-source cap', async (t) => {
  const overview = await getPatchNotes({}, 'en');
  const focused = await getPatchNotes({ query: impactRow.name.en, kind: 'trait' }, 'en');
  const generate = scripted(t, [
    plan(call('get_patch_notes', {}), call('search_comps', { query: 'Patch Lab', limit: 5 })),
    (req) => {
      assert.ok(req.tools?.length);
      assert.deepEqual(toolData<PatchNotesEvidence>(req, 'get_patch_notes')[0].data, overview);
      const found = toolData<{ comps: { slug: string }[] }>(req, 'search_comps')[0];
      assert.equal(found.status, 'ok');
      assert.equal(found.data.comps.length, 5);
      return result('', [call('get_comp', { slug: found.data.comps[0].slug })]);
    },
    (req) => {
      assert.ok(req.tools?.length, 'A successful comp lookup must not end the patch tool loop');
      const board = toolData<{ comp: { units: { name: string }[]; traits: { name: string }[] } }>(req, 'get_comp')[0].data.comp;
      assert.equal(board.units[0].name, SENTINEL);
      assert.equal(board.traits[0].name, impactRow.name.en);
      return result('', [call('get_patch_notes', { query: board.traits[0].name, kind: 'trait' })]);
    },
    (req) => {
      const evidence = finalEvidence(req, [overview, focused]);
      assert.deepEqual(evidence.toolResults.map((entry) => entry.tool), ['get_patch_notes', 'search_comps', 'get_comp', 'get_patch_notes']);
      assert.equal(evidence.comps[0].slug, comps[0].slug);
      assert.deepEqual(evidence.comps[0].units, [{ name: SENTINEL, items: ['Fixture Blade'] }]);
      assert.equal(evidence.comps[0].traits[0].name, focused.rows[0].name);
      assert.equal(evidence.comps[0].tips, comps[0].tips);
      assert.deepEqual(evidence.comps[0].stages, comps[0].stages);
      assert.match(req.system, /For comp impact, connect sourced changes to the actual units, traits or items in comp evidence/);
      assert.match(req.system, /Label the impact as inference and any recommendation as conditional/);
      assert.match(req.system, /patch notes alone do not prove a new tier, win rate or meta ranking/);
      return jsonAnswer();
    },
  ]);
  const answer = await answerAssistant(request(`After the nerf, should I roll or level up with ${SENTINEL} at level 7 with 40 gold and 30 HP, and what does the win rate say about a comp to play?`), new AbortController().signal, { generate });
  assert.equal(answer.intent, 'patch_change');
  assert.equal(answer.mode, 'llm');
  assert.equal(answer.status, 'answered');
  assert.equal(answer.answer, FINAL_ANSWER);
  assert.match(answer.limitations.join(' '), /tool step limit was reached/);
  // Five comps plus the champion would crowd out the patch source without prioritization.
  assert.ok(answer.resolvedContext.entities.some((entity) => entity.id === 'champion:fixture_sentinel'));
  assert.equal(answer.sources.length, 6);
  assertSource(answer.sources, focused);
  assert.equal(answer.sources.filter((source) => source.id.startsWith('get_patch_notes:')).length, 1, 'Same patch/article is deduplicated');
  assert.equal(answer.sources.filter((source) => source.id.startsWith('comp:')).length, 5);
});

test('explicit PBE retains its own provider, baseline, timestamp and experimental rules', async (t) => {
  const query = { channel: 'pbe' as const, ...(pbe.patch ? { patch: pbe.patch } : {}), ...(pbe.rows[0] ? { query: pbe.rows[0].name.en } : {}) };
  const notes = await getPatchNotes(query, 'en');
  if (!pbe.patch || pbe.patch === snapshot.livePatch || snapshot.patches.some((entry) => entry.patch === pbe.patch)) {
    assert.equal(notes.status, 'unavailable');
    const generate = scripted(t, [plan(call('get_patch_notes', query)), stopWith([notes])]);
    const answer = await answerAssistant(request('What are the PBE changes?'), new AbortController().signal, { generate });
    assert.equal(answer.status, 'insufficient_data');
    assert.equal(answer.answer, notes.summary);
    assert.deepEqual(answer.sources, []);
    return;
  }
  assert.equal(notes.status, 'found');
  assert.equal(notes.channel, 'pbe');
  assert.equal(notes.baseline, pbe.baseline.patch);
  assert.equal(notes.source?.provider, pbe.source?.provider);
  assert.notEqual(notes.source?.provider, 'Riot Games');
  assert.equal(notes.source?.updatedAt, pbe.source?.fetchedAt || pbe.generatedAt);
  assert.equal(notes.source?.url, '/en/patches');
  const generate = scripted(t, [plan(call('get_patch_notes', query)), stopWith([notes]), (req) => {
    finalEvidence(req, [notes]);
    assert.match(req.system, /PBE is an experimental preview, NOT a released Riot patch/);
    assert.match(req.system, /explicitly label PBE, provider and baseline/);
    return jsonAnswer();
  }]);
  const answer = await answerAssistant(request(`What are the PBE changes for ${pbe.rows[0].name.en}?`), new AbortController().signal, { generate });
  assert.equal(answer.intent, 'patch_change');
  assert.equal(answer.status, 'answered');
  assert.equal(answer.mode, 'llm');
  assert.match(answer.limitations.join(' '), /Experimental PBE preview, not a Riot-released patch/);
  assertSource(answer.sources, notes);
});

test('invalid final JSON is retried once, then falls back to the sourced patch summary', async (t) => {
  const notes = await getPatchNotes({}, 'en');
  const invalid: Step = (req) => { finalEvidence(req, [notes]); return result('not valid JSON'); };
  const generate = scripted(t, [plan(call('get_patch_notes', {})), stopWith([notes]), invalid, invalid]);
  const answer = await answerAssistant(request('Summarize current patch notes.'), new AbortController().signal, { generate });
  assert.equal(answer.mode, 'deterministic');
  assert.equal(answer.status, 'answered');
  assert.equal(answer.answer, notes.summary);
  assert.match(answer.limitations.join(' '), /generated answer was invalid/);
  assertSource(answer.sources, notes);
});

test('ProviderError unavailable during final generation falls back without losing verified sources', async (t) => {
  const notes = await getPatchNotes({}, 'en');
  const generate = scripted(t, [plan(call('get_patch_notes', {})), stopWith([notes]), (req) => {
    finalEvidence(req, [notes]);
    throw new ProviderError('unavailable', 'Offline provider failure');
  }]);
  const answer = await answerAssistant(request('Summarize current patch notes.'), new AbortController().signal, { generate });
  assert.equal(answer.mode, 'deterministic');
  assert.equal(answer.status, 'answered');
  assert.equal(answer.answer, notes.summary);
  assert.match(answer.limitations.join(' '), /model is temporarily unavailable/i);
  assertSource(answer.sources, notes);
});

for (const location of ['answer', 'section'] as const) {
  test(`unsupported numbers in the final ${location} fall back to real patch data`, async (t) => {
    const notes = await getPatchNotes({}, 'en');
    const generate = scripted(t, [plan(call('get_patch_notes', {})), stopWith([notes]), (req) => {
      const evidence = finalEvidence(req, [notes]);
      assert.ok(!JSON.stringify(evidence).includes(INVENTED_NUMBER));
      const claim = `The buff is ${INVENTED_NUMBER}%.`;
      return location === 'answer' ? jsonAnswer(claim) : jsonAnswer(FINAL_ANSWER, [{ heading: 'Impact', points: [claim] }]);
    }]);
    const answer = await answerAssistant(request('Summarize current patch notes.'), new AbortController().signal, { generate });
    assert.equal(answer.mode, 'deterministic');
    assert.equal(answer.answer, notes.summary);
    assert.deepEqual(answer.sections, []);
    assert.ok(!JSON.stringify(answer).includes(INVENTED_NUMBER));
    assert.match(answer.limitations.join(' '), /numbers not in the data/);
    assertSource(answer.sources, notes);
  });
}

test('patch answers never stream unvalidated prose before unsupported-number fallback', async (t) => {
  const notes = await getPatchNotes({}, 'en');
  const deltas: string[] = [];
  let finalOnDelta: ProviderRequest['onDelta'];
  const generate = scripted(t, [plan(call('get_patch_notes', {})), stopWith([notes]), (req) => {
    const evidence = finalEvidence(req, [notes]);
    assert.ok(!JSON.stringify(evidence).includes(INVENTED_NUMBER));
    finalOnDelta = req.onDelta;
    const generated = jsonAnswer(`The buff is ${INVENTED_NUMBER}%.`);
    req.onDelta?.(generated.text);
    return generated;
  }]);
  const answer = await answerAssistant(request('Summarize current patch notes.'), new AbortController().signal, { generate, onAnswerDelta: (chunk) => deltas.push(chunk) });
  assert.equal(answer.mode, 'deterministic');
  assert.equal(answer.answer, notes.summary);
  assert.deepEqual(deltas, [], 'Rejected patch prose must never reach the streaming client');
  assert.equal(finalOnDelta, undefined, 'Patch final generation must be buffered');
});

test('partial two-patch comparison includes both tool results and stays insufficient_data', async (t) => {
  const foundQuery = { patch: historical.patch, query: historical.rows[0].name.en };
  const missingQuery = { patch: MISSING_PATCH };
  const found = await getPatchNotes(foundQuery, 'en');
  const missing = await getPatchNotes(missingQuery, 'en');
  assert.equal(found.status, 'found');
  assert.equal(missing.status, 'unavailable');
  const generate = scripted(t, [
    plan(call('get_patch_notes', foundQuery), call('get_patch_notes', missingQuery)), stopWith([found, missing]),
    (req) => {
      finalEvidence(req, [found, missing]);
      const messages = toolData<PatchNotesEvidence>(req, 'get_patch_notes');
      assert.equal(messages[0].meta?.patch, historical.patch);
      assert.equal(messages[1].meta, undefined, 'Missing patch cannot borrow active provenance');
      return jsonAnswer('Only one requested patch has verified notes; the other cannot be compared.');
    },
  ]);
  const answer = await answerAssistant(request(`Compare patch notes ${historical.patch} versus ${MISSING_PATCH}.`), new AbortController().signal, { generate });
  assert.equal(answer.intent, 'patch_change');
  assert.equal(answer.mode, 'llm');
  assert.equal(answer.status, 'insufficient_data');
  assert.equal(answer.sources.length, 1);
  assertSource(answer.sources, found);
  assert.ok(answer.limitations.includes(missing.limitations[0]));
});

for (const code of ['aborted', 'timeout'] as const) {
  test(`patch evidence does not turn a final ${code} into a successful summary`, async (t) => {
    const notes = await getPatchNotes({}, 'en');
    const controller = new AbortController();
    const error = new ProviderError(code, `Offline ${code}`);
    const generate = scripted(t, [plan(call('get_patch_notes', {})), stopWith([notes]), (req) => {
      finalEvidence(req, [notes]);
      assert.equal(req.signal, controller.signal);
      if (code === 'aborted') controller.abort();
      throw error;
    }]);
    await assert.rejects(answerAssistant(request('Summarize current patch notes.'), controller.signal, { generate }), (caught) => caught === error);
  });
}

test('a planner answer without a patch lookup is not accepted as patch evidence', async (t) => {
  const generate = scripted(t, [(req) => {
    assert.equal(req.tools?.[0]?.function.name, 'get_patch_notes');
    return jsonAnswer(`Everything was buffed by ${INVENTED_NUMBER}%.`);
  }]);
  const answer = await answerAssistant(request('Summarize current patch notes.'), new AbortController().signal, { generate });
  assert.equal(answer.intent, 'patch_change');
  assert.equal(answer.mode, 'deterministic');
  assert.equal(answer.status, 'insufficient_data');
  assert.deepEqual(answer.sources, []);
  assert.ok(!answer.answer.includes(INVENTED_NUMBER));
  assert.match(answer.answer, /could not verify patch notes/);
});
