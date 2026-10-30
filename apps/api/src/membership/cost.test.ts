import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AttemptClose, AttemptDraft, SpendMeter, Tariff } from './cost.ts';
import { approvedTariff } from './tariff.ts';

// Cost ledger integration (task #82, docs/MEMBERSHIP-PLAN.md sections 5 and 9).
//
// Two halves, because the two risks are different. The ledger's promises - the row
// exists before the network call, a spend closes once, an unknown outcome is never
// read as free - are promises about PostgreSQL rows and constraints, so they are
// tested against a real database. Coverage - that no spend path can run without a
// ledger line - is a property of the call graph, so a fake meter that records what
// each path asked for proves it with no database, which is what lets it run in CI.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../../.env'));
  } catch {
    // No .env — the database half skips.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);

let pool: Pool;
let cost: typeof import('./cost.ts');
let schemaApplied = false;
const userIds: string[] = [];
const DAY = 86_400_000;

async function applySchema(): Promise<void> {
  if (schemaApplied) return;
  const script = await readFile(join(import.meta.dirname, '../schema.sql'), 'utf8');
  // Every database test file applies the same script and the runner starts those
  // files in parallel processes, so two of them can lock the same tables and one
  // gets chosen as the deadlock victim. The script is idempotent, so losing that
  // round only means running it again.
  for (let tryCount = 0; ; tryCount++) {
    try {
      await pool.query(script);
      break;
    } catch (error) {
      if (tryCount >= 2 || !/deadlock|serialization/i.test(String(error))) throw error;
    }
  }
  schemaApplied = true;
}

/** A ledger request of its own: every test's rows hang off it and go with it. */
async function newRequest(): Promise<string> {
  await applySchema();
  const userId = randomUUID();
  userIds.push(userId);
  await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `cost-${userId}@example.com`]);
  const requestId = randomUUID();
  await pool.query(
    `INSERT INTO usage_requests (id, user_id, idempotency_key, payload_sha256, purpose, status, reserve_expires_at)
     VALUES ($1,$2,$3,$4,'coach_turn','reserved', now() + interval '5 minutes')`,
    [requestId, userId, `cost-${requestId.slice(0, 12)}`, createHash('sha256').update(requestId).digest('hex')],
  );
  return requestId;
}

async function attemptRows(requestId: string): Promise<Record<string, unknown>[]> {
  const { rows } = await pool.query(
    `SELECT * FROM usage_attempts WHERE request_id = $1 ORDER BY attempt, billed_unit NULLS FIRST`,
    [requestId],
  );
  return rows;
}

/** The billing lines under one call, in the shape the cost report reads them. */
async function billingLines(requestId: string): Promise<unknown[][]> {
  return (await attemptRows(requestId))
    .filter((row) => row.billed_unit !== null)
    .map((row) => [row.billed_unit, row.billed_quantity, row.cost_micro_vnd, row.tariff_version]);
}

/** The call row of one attempt. A spend with no call row is the bug this ledger
 *  exists to prevent, so its absence fails the test instead of reading as nothing. */
async function callRow(requestId: string, attempt = 1): Promise<Record<string, unknown>> {
  const row = (await attemptRows(requestId)).find((item) => item.attempt === attempt && item.billed_unit === null);
  assert.ok(row, `attempt ${attempt} must own a call row`);
  return row;
}

async function lineRow(requestId: string, unit: string): Promise<Record<string, unknown>> {
  const row = (await attemptRows(requestId)).find((item) => item.billed_unit === unit);
  assert.ok(row, `the call must own a ${unit} billing line`);
  return row;
}

function lineFor(lines: unknown[][], unit: string): unknown[] {
  const line = lines.find((item) => item[0] === unit);
  assert.ok(line, `the ledger must keep a ${unit} line`);
  return line;
}

test('cost ledger rows', { skip: !hasDb }, async (t) => {
  pool = (await import('../db.ts')).pool;
  cost = await import('./cost.ts');

  t.after(async () => {
    for (const userId of userIds) {
      await pool.query('DELETE FROM usage_attempts WHERE request_id IN (SELECT id FROM usage_requests WHERE user_id = $1)', [userId]);
      await pool.query('DELETE FROM usage_requests WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    await pool.end();
  });

  await t.test('the call row exists before the answer does', async () => {
    const requestId = await newRequest();
    const opened = await cost.openAttempt(requestId, { provider: 'openai', model: 'gpt-test' });
    assert.ok(opened);
    assert.equal(opened.attempt, 1);
    // Written before the caller touches the network, with nothing about money yet:
    // this is the state that has to survive the process dying mid-call.
    const call = await callRow(requestId);
    assert.equal(call.dispatch_state, 'dispatching');
    assert.equal(call.model, 'gpt-test');
    assert.equal(call.cost_micro_vnd, null);
    assert.deepEqual(await billingLines(requestId), []);

    // A second call of the same turn numbers from one, because the counter is the
    // ledger's and not the caller's retry index.
    const second = await cost.openAttempt(requestId, { provider: 'openai', model: 'gpt-test' });
    assert.equal(second?.attempt, 2);
    assert.equal(await cost.openAttempt(requestId, { provider: '  ' }), null, 'an unattributable provider is not a spend');
    assert.equal(await cost.openAttempt(randomUUID(), { provider: 'openai' }), null, 'no ledger request, no spend');
    assert.equal((await attemptRows(requestId)).length, 2, 'a rejected open writes nothing');
  });

  await t.test('one call bills several lines and closes exactly once', async () => {
    const requestId = await newRequest();
    const handle = await cost.openAttempt(requestId, { provider: 'openai', model: 'gpt-test' });
    assert.ok(handle);
    const closed = await cost.closeAttempt(handle, {
      outcome: 'success',
      charges: [
        { unit: 'input_token', quantity: 1200 },
        { unit: 'output_token', quantity: 300 },
      ],
    });
    assert.equal(closed.ok, true);
    assert.equal(closed.firstTime, true);
    const call = await callRow(requestId);
    assert.equal(call.dispatch_state, 'completed');
    assert.equal(call.outcome, 'success');
    const lines = await billingLines(requestId);
    assert.deepEqual(lines, [
      ['input_token', 1200, null, null],
      ['output_token', 300, null, null],
    ]);

    // A retried response - the same turn delivered twice - must not add a second
    // spend, or the pilot's cost per turn becomes a count of deliveries.
    const again = await cost.closeAttempt(handle, { outcome: 'success', charges: [{ unit: 'input_token', quantity: 9999 }] });
    assert.equal(again.ok, true);
    assert.equal(again.firstTime, false);
    assert.deepEqual(await billingLines(requestId), lines);
  });

  await t.test('the database refuses money that cannot be traced', async () => {
    const requestId = await newRequest();
    await cost.openAttempt(requestId, { provider: 'ollama', model: 'qwen' });
    const line = `INSERT INTO usage_attempts (request_id, attempt, provider, dispatch_state, billed_unit, billed_quantity, cost_micro_vnd, tariff_version)
                  VALUES ($1,2,'ollama','completed',$2,$3,$4,$5)`;
    await assert.rejects(
      () => pool.query(line, [requestId, null, null, 10_000, 'sheet-1']),
      /usage_attempts_cost_needs_line/,
      'money that does not say what it bought cannot be summed or re-priced',
    );
    await assert.rejects(() => pool.query(line, [requestId, null, 10, null, null]), /usage_attempts_quantity_has_unit/);
    await assert.rejects(() => pool.query(line, [requestId, 'request', 1, 10_000, null]), /usage_attempts_cost_has_tariff/);
    // The pairing goes both ways: a unit that says nothing about how much of it was
    // used is the same unreadable number as a quantity that does not say its unit.
    await assert.rejects(() => pool.query(line, [requestId, 'second', null, null, null]), /usage_attempts_quantity_has_unit/);
    // The same money, once it names its unit and its sheet, is writable.
    const ok = await pool.query(line, [requestId, 'request', 1, 10_000, 'sheet-1']);
    assert.equal(ok.rowCount, 1);
    assert.equal((await attemptRows(requestId)).length, 2);
  });

  await t.test('an unexplained spend stays unexplained', async () => {
    const requestId = await newRequest();
    const provider = `dying-${requestId.slice(0, 8)}`;
    const handle = await cost.openAttempt(requestId, { provider, model: 'nova-3' });
    assert.ok(handle);
    // A connection that died: the clip may well have been transcribed and billed.
    const dead = cost.chargeForFailure(new Error('socket hang up'), false);
    assert.equal(dead.charged, true);
    await cost.closeAttempt(handle, { ...dead, charges: cost.durationCharges(12) });
    const call = await callRow(requestId);
    assert.equal(call.dispatch_state, 'unknown');
    assert.equal(call.outcome, 'unknown');
    // The line inherits it: money is never more certain than the call that spent it.
    assert.equal((await lineRow(requestId, 'audio_second')).dispatch_state, 'unknown');

    // A refusal is the opposite answer, and the ledger has to tell them apart.
    const refusedHandle = await cost.openAttempt(requestId, { provider, model: 'nova-3' });
    assert.ok(refusedHandle);
    await cost.closeAttempt(refusedHandle, cost.chargeForFailure(new Error('429 rate limited'), true));
    assert.equal((await callRow(requestId, 2)).dispatch_state, 'failed');
    assert.equal((await attemptRows(requestId)).filter((row) => row.attempt === 2).length, 1, 'a refusal leaves no billing line');

    // Recovery: a call nobody closed because the process never came back. The row is
    // made genuinely old instead of fast-forwarding the clock, so the sweep touches
    // only this test's stale call - other test files write fresh rows in parallel.
    const abandoned = await cost.openAttempt(requestId, {
      provider,
      model: 'nova-3',
      startedAt: Date.now() - 6 * 60_000,
    });
    assert.equal(abandoned?.attempt, 3);
    const stuck = await cost.markStuckAttempts();
    assert.ok(stuck.stuck.some((item) => item.requestId === requestId && item.attempt === 3));
    const third = await callRow(requestId, 3);
    assert.equal(third.dispatch_state, 'unknown');
    assert.equal(third.error_code, 'stuck_dispatch');
  });

  await t.test('no usage is not the same number as zero usage', async () => {
    const requestId = await newRequest();
    // Adapters report 0/0 when the vendor sent no usage block at all.
    assert.deepEqual(cost.tokenCharges({ inputTokens: 0, outputTokens: 0 }), []);
    assert.deepEqual(cost.tokenCharges(null), []);
    const handle = await cost.openAttempt(requestId, { provider: 'elevenlabs', model: 'scribe_v2' });
    assert.ok(handle);
    await cost.closeAttempt(handle, { outcome: 'success', charges: cost.tokenCharges({ inputTokens: 0, outputTokens: 0 }) });
    assert.equal((await callRow(requestId)).dispatch_state, 'completed');
    assert.deepEqual(await billingLines(requestId), [], 'absent evidence is an absent line, not a zero');

    const ledger = await cost.costLedger({ from: Date.now() - DAY, to: Date.now() + DAY });
    assert.equal(ledger.unavailable, false);
    const grouped = ledger.calls.find((row) => row.provider === 'elevenlabs' && row.model === 'scribe_v2');
    assert.ok(grouped, 'the rollup still reports the call');
    assert.ok(grouped.withoutUsage >= 1, 'and counts it as usage we never saw');

    // A meter whose ledger request does not exist cannot be opened.
    assert.equal(await cost.createSpendMeter(randomUUID()).open({ provider: 'ollama' }), null);
  });

  await t.test('an approved sheet turns quantities into money', async () => {
    const requestId = await newRequest();
    const tariff: Tariff = {
      version: 'test-2026-10',
      entries: [
        { provider: 'openai', model: 'gpt-test', unit: 'input_token', microVndPer: 15_000, per: 1_000_000 },
        { provider: 'openai', model: 'gpt-test', unit: 'output_token', microVndPer: 60_000, per: 1_000_000 },
        { provider: 'openai', unit: 'second', microVndPer: 2_000 },
      ],
    };
    const handle = await cost.createSpendMeter(requestId, { tariff }).open({ provider: 'openai', model: 'gpt-test' });
    assert.ok(handle);
    const closed = await cost.closeAttempt(
      handle,
      {
        outcome: 'success',
        charges: [
          { unit: 'input_token', quantity: 2_000_000 },
          { unit: 'output_token', quantity: 1_000_000 },
          // No price for this unit: the quantity is still worth recording, the cost is not.
          { unit: 'byte', quantity: 4_096 },
        ],
      },
      { tariff },
    );
    assert.equal(closed.costMicroVnd, 90_000);
    const lines = await billingLines(requestId);
    assert.equal(lines.length, 3);
    assert.deepEqual(lineFor(lines, 'input_token'), ['input_token', 2_000_000, '30000', 'test-2026-10']);
    assert.deepEqual(lineFor(lines, 'output_token'), ['output_token', 1_000_000, '60000', 'test-2026-10']);
    assert.deepEqual(lineFor(lines, 'byte'), ['byte', 4_096, null, null]);

    // A malformed sheet prices nothing rather than guessing a number.
    assert.equal(cost.usableTariff({ version: 'x', entries: [{ provider: 'openai', unit: 'input_token', microVndPer: 0 }] }), null);
    assert.equal(cost.usableTariff({ version: '', entries: [{ provider: 'openai', unit: 'request', microVndPer: 1 }] }), null);
    // Rounding up: a fraction of a billed unit is still billed.
    assert.equal(cost.costOf({ provider: 'openai', unit: 'second', microVndPer: 1_000, per: 3 }, 2), 667);
  });

  await t.test('the approved tariff prices the paths we actually call, and only those', async () => {
    const priced = (provider: string, model: string, unit: Tariff['entries'][number]['unit'], quantity: number) => {
      const entry = approvedTariff.entries.find((candidate) => candidate.provider === provider && candidate.model === model && candidate.unit === unit);
      return entry ? cost.costOf(entry, quantity) : null;
    };

    // Each figure is the one the report quotes for that path (§3.1-§3.3), so a typo in
    // the sheet cannot silently re-price a turn.
    assert.equal(priced('openai', 'gpt-6-luna', 'input_token', 2_138), 13_255_600);
    assert.equal(priced('openai', 'gpt-6-luna', 'output_token', 192), 4_464_192);
    assert.equal(priced('openai', 'deepseek-v4-flash', 'input_token', 2_138), 198_840_414);
    assert.equal(priced('openai', 'deepseek-v4-flash', 'output_token', 192), 53_569_536);
    assert.equal(priced('google', 'gemini-3.5-flash-lite', 'input_token', 2_138), 16_569_500);
    assert.equal(priced('google', 'gemini-3.5-flash-lite', 'output_token', 192), 12_400_320);
    assert.equal(priced('deepgram', 'nova-3', 'audio_second', 60), 198_922_080, '198,92đ per minute');
    assert.equal(priced('groq', 'whisper-large-v3-turbo', 'audio_second', 60), 17_222_700, '17,22đ per minute');
    assert.equal(priced('vieneu', 'vieneu-v4', 'character', 1_000), 965_000_000, '965đ per 1.000 characters');
    assert.equal(priced('deepgram', 'aura-2-thalia-en', 'character', 1_000), 775_021_000);
    assert.equal(priced('deepgram', 'flux-minh-vi', 'character', 1_000), 1_162_532_000);

    // An id nobody priced stays unknown: the ledger records the quantity and no money.
    assert.equal(priced('openai', 'gpt-4o-mini', 'input_token', 2_138), null);
    assert.equal(priced('deepgram', 'nova-2', 'audio_second', 60), null);

    const requestId = await newRequest();
    const handle = await cost.createSpendMeter(requestId, { tariff: approvedTariff }).open({ provider: 'openai', model: 'gpt-6-luna' });
    assert.ok(handle);
    const closed = await cost.closeAttempt(
      handle,
      { outcome: 'success', charges: cost.tokenCharges({ inputTokens: 2_138, outputTokens: 192 }) },
      { tariff: approvedTariff },
    );
    assert.equal(closed.costMicroVnd, 17_719_792, 'one answer at p50 costs 17,72đ');
    const lines = await billingLines(requestId);
    assert.deepEqual(lineFor(lines, 'input_token'), ['input_token', 2_138, '13255600', '2026-10-30']);
    assert.deepEqual(lineFor(lines, 'output_token'), ['output_token', 192, '4464192', '2026-10-30']);
  });

  await t.test('a call on a model the sheet does not list is unpriced, not free', async () => {
    const requestId = await newRequest();
    const handle = await cost.createSpendMeter(requestId, { tariff: approvedTariff }).open({ provider: 'openai', model: 'gpt-4o-mini' });
    assert.ok(handle);
    const closed = await cost.closeAttempt(
      handle,
      { outcome: 'success', charges: cost.tokenCharges({ inputTokens: 2_138, outputTokens: 192 }) },
      { tariff: approvedTariff },
    );
    assert.equal(closed.costMicroVnd, null);
    const lines = await billingLines(requestId);
    assert.deepEqual(lineFor(lines, 'input_token'), ['input_token', 2_138, null, null]);
  });

  await t.test('the report keeps the unknowns in their own columns', async () => {
    const requestId = await newRequest();
    const provider = `report-${requestId.slice(0, 8)}`;
    const answered = await cost.openAttempt(requestId, { provider, model: 'aura-2-thalia-en' });
    assert.ok(answered);
    await cost.closeAttempt(answered, { outcome: 'empty', charges: cost.durationCharges(3) });
    // A second call nobody has answered for yet, in the same window.
    assert.ok(await cost.openAttempt(requestId, { provider, model: 'aura-2-thalia-en' }));
    const ledger = await cost.costLedger({ from: Date.now() - DAY, to: Date.now() + DAY });
    const calls = ledger.calls.find((row) => row.provider === provider);
    assert.equal(calls?.calls, 2);
    assert.equal(calls?.answered, 1);
    assert.equal(calls?.unexplained, 1, 'a call still dispatching is owed an explanation');
    assert.equal(calls?.withoutUsage, 0, 'the answered one did report a quantity');
    const charges = ledger.charges.find((row) => row.provider === provider && row.unit === 'audio_second');
    assert.equal(charges?.quantity, 3);
    assert.equal(charges?.costMicroVnd, 0);
    assert.equal(charges?.costUnknownLines, 1, 'unpriced quantity reports as unpriced, not as free');
  });
});

// --- Coverage: no spend path may run without a ledger line ----------------------

type Recorded = { draft: AttemptDraft; close: AttemptClose | null };

function fakeMeter(options: { writable?: boolean } = {}) {
  const attempts: Recorded[] = [];
  const meter: SpendMeter = {
    open: async (draft) => {
      if (options.writable === false) return null;
      attempts.push({ draft, close: null });
      return { requestId: randomUUID(), attempt: attempts.length };
    },
    close: async (_handle, close) => {
      const open = attempts.find((entry) => entry.close === null);
      if (!open) return false;
      open.close = close;
      return true;
    },
  };
  return { meter, attempts };
}

/** One reply that satisfies every vendor's success shape, so a coverage case is a
 *  provider id plus a key and nothing else. */
function transcriptReply(): Response {
  return new Response(
    JSON.stringify({
      text: 'nên chơi comp nào',
      message: { content: 'ok' },
      prompt_eval_count: 11,
      eval_count: 5,
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 11, completion_tokens: 5 },
      results: { channels: [{ alternatives: [{ transcript: 'nên chơi comp nào' }] }] },
      candidates: [{ content: { parts: [{ text: 'ok' }] } }],
      usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 5 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function audioReply(): Response {
  return new Response(new Uint8Array(8_192), { status: 200, headers: { 'content-type': 'audio/wav' } });
}

test('every spend path is metered', async (t) => {
  const { activeAssistantModel, generateAssistantAnswer, ProviderError } = await import('../assistant/provider.ts');
  const voice = await import('../voice.ts');
  const billable = await import('./cost.ts');

  const spent = { vendors: 0 };
  const counting = (reply: () => Response) =>
    ((..._args: unknown[]) => {
      spent.vendors += 1;
      return Promise.resolve(reply());
    }) as unknown as typeof fetch;

  // Keys are test-shaped on purpose: nothing here reaches a vendor.
  const env = (keys: Record<string, string>) => ({ STT_LANGUAGE: 'vi', ...keys }) as NodeJS.ProcessEnv;
  const envKeys = [
    'ASSISTANT_PROVIDER', 'ASSISTANT_MODEL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL',
    'GOOGLE_API_KEY', 'GOOGLE_MODEL', 'DEEPGRAM_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY',
    'ELEVENLABS_API_KEY', 'VIENEU_TTS_URL', 'STT_PROVIDER', 'TTS_PROVIDER', 'STT_LANGUAGE',
  ];
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    voice.clearSttCooldowns();
    voice.clearTtsFaults();
  });

  function expectOneMeteredCall(recorder: { attempts: Recorded[] }, provider: string, model: string, charges: unknown[][]) {
    assert.equal(recorder.attempts.length, 1, `${provider}: one provider call, one ledger line`);
    const attempt = recorder.attempts[0];
    assert.equal(attempt?.draft.provider, provider);
    assert.equal(attempt?.draft.model, model, 'the ledger prices on the model id the wire carried');
    assert.equal(attempt?.close?.outcome, 'success');
    assert.deepEqual((attempt?.close?.charges ?? []).map((charge) => [charge.unit, charge.quantity]), charges);
  }

  await t.test('the three assistant adapters open a line before the fetch', async () => {
    globalThis.fetch = counting(transcriptReply);
    const cases: Record<string, string>[] = [
      { provider: 'ollama', ASSISTANT_PROVIDER: 'ollama', ASSISTANT_MODEL: 'cover-qwen' },
      { provider: 'google', ASSISTANT_PROVIDER: 'google', GOOGLE_API_KEY: 'k', GOOGLE_MODEL: 'cover-gemini' },
      { provider: 'openai', ASSISTANT_PROVIDER: 'openai', OPENAI_API_KEY: 'k', OPENAI_MODEL: 'cover-gpt' },
    ];
    for (const testCase of cases) {
      const { provider, ...settings } = testCase;
      for (const key of envKeys) delete process.env[key];
      Object.assign(process.env, settings);
      const recorder = fakeMeter();
      const before = spent.vendors;
      await generateAssistantAnswer({
        system: 'system',
        messages: [{ role: 'user', content: 'hello' }],
        maxOutputTokens: 20,
        signal: new AbortController().signal,
        meter: recorder.meter,
      });
      assert.ok(spent.vendors > before, `${provider}: the model was actually asked`);
      expectOneMeteredCall(recorder, provider, activeAssistantModel(), [
        ['input_token', 11],
        ['output_token', 5],
      ]);
    }
  });

  await t.test('all six STT providers and both TTS engines write a line', async () => {
    // 16-bit mono at 16 kHz: two seconds of speech is 64.000 bytes of PCM.
    const wav = voice.wavFromPcm16(Buffer.alloc(16_000 * 2 * 2, 1), 16_000);
    assert.equal(voice.wavDurationSeconds(wav), 2, 'the 44-byte header is not audio');
    const clip = billable.durationCharges(voice.wavDurationSeconds(wav)).map((charge) => [charge.unit, charge.quantity]);
    const sttCases: Record<string, string>[] = [
      { provider: 'deepgram', model: 'nova-3', DEEPGRAM_API_KEY: 'k' },
      { provider: 'groq', model: 'whisper-large-v3-turbo', GROQ_API_KEY: 'k' },
      { provider: 'elevenlabs', model: 'scribe_v2', ELEVENLABS_API_KEY: 'k' },
      { provider: 'openai', model: 'gpt-4o-transcribe', OPENAI_API_KEY: 'k' },
      { provider: 'gemini', model: 'gemini-3.1-flash-lite', GOOGLE_API_KEY: 'k' },
      // OpenRouter is opt-in only, so it needs the pin as well as a key.
      { provider: 'openrouter', model: 'openai/whisper-large-v3-turbo', OPENROUTER_API_KEY: 'k', STT_PROVIDER: 'openrouter' },
    ];
    for (const testCase of sttCases) {
      const { provider, model, ...keys } = testCase;
      voice.clearSttCooldowns();
      const recorder = fakeMeter();
      const before = spent.vendors;
      const outcome = await voice.transcribeWithFailover(wav, env(keys), counting(transcriptReply), 'vi', recorder.meter);
      assert.equal(outcome.provider, provider);
      assert.ok(spent.vendors > before, `${provider}: the clip was actually sent`);
      expectOneMeteredCall(recorder, provider, model, clip);
    }

    const chunk = 'Xin chào';
    const ttsCases: Record<string, string>[] = [
      { provider: 'deepgram', model: 'flux-minh-vi', lang: 'vi', DEEPGRAM_API_KEY: 'k' },
      { provider: 'deepgram', model: 'aura-2-thalia-en', lang: 'en', DEEPGRAM_API_KEY: 'k' },
      { provider: 'vieneu', model: 'vieneu-v4', lang: 'vi', VIENEU_TTS_URL: 'https://api.vieneu.io' },
    ];
    for (const testCase of ttsCases) {
      const { provider, model, lang, ...keys } = testCase;
      voice.clearTtsFaults();
      const recorder = fakeMeter();
      const before = spent.vendors;
      const spoken = await voice.synthSpeechChunk(chunk, new AbortController().signal, env(keys), counting(audioReply), lang as 'en' | 'vi', recorder.meter);
      assert.equal(spoken.provider, provider);
      assert.ok(spent.vendors > before, `${provider}: the chunk was actually sent`);
      expectOneMeteredCall(recorder, provider, model, [['character', chunk.length]]);
    }
  });

  await t.test('a chain bills the clip once and a refusal never', async () => {
    voice.clearSttCooldowns();
    let refuse = true;
    const fetchImpl = ((url: unknown) => {
      spent.vendors += 1;
      if (refuse && String(url).includes('deepgram')) {
        refuse = false;
        return Promise.resolve(new Response('rate limited', { status: 429, headers: { 'retry-after': '1' } }));
      }
      return Promise.resolve(transcriptReply());
    }) as unknown as typeof fetch;
    const recorder = fakeMeter();
    const wav = voice.wavFromPcm16(Buffer.alloc(16_000 * 2), 16_000);
    const outcome = await voice.transcribeWithFailover(
      wav,
      env({ DEEPGRAM_API_KEY: 'k', GROQ_API_KEY: 'k' }),
      fetchImpl,
      'vi',
      recorder.meter,
    );
    assert.equal(outcome.provider, 'groq');
    assert.equal(recorder.attempts.length, 2, 'both steps are visible in the ledger');
    const refused = recorder.attempts[0];
    const served = recorder.attempts[1];
    assert.equal(refused?.draft.provider, 'deepgram');
    assert.equal(refused?.close?.outcome, 'error');
    assert.equal(refused?.close?.charged, false);
    assert.equal(refused?.close?.charges, undefined, 'a vendor that refused the clip billed no clip');
    assert.deepEqual(served?.close?.charges, [{ unit: 'audio_second', quantity: 1 }]);
  });

  await t.test('a ledger that cannot write stops the spend', async () => {
    const unwritable = fakeMeter({ writable: false });
    const before = spent.vendors;
    const wav = voice.wavFromPcm16(Buffer.alloc(16_000 * 2), 16_000);
    await assert.rejects(
      () => voice.transcribeWithFailover(wav, env({ GROQ_API_KEY: 'k' }), counting(transcriptReply), 'vi', unwritable.meter),
      (error: unknown) => (error as { code?: string }).code === 'cost_ledger_unavailable',
    );
    await assert.rejects(
      () => voice.synthSpeechChunk('Xin chào', new AbortController().signal, env({ DEEPGRAM_API_KEY: 'k' }), counting(audioReply), 'vi', unwritable.meter),
      (error: unknown) => (error as { code?: string }).code === 'cost_ledger_unavailable',
    );
    for (const key of envKeys) delete process.env[key];
    process.env.ASSISTANT_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'k';
    globalThis.fetch = counting(transcriptReply);
    await assert.rejects(
      () =>
        generateAssistantAnswer({
          system: 'system',
          messages: [{ role: 'user', content: 'hello' }],
          maxOutputTokens: 20,
          signal: new AbortController().signal,
          meter: unwritable.meter,
        }),
      (error: unknown) => error instanceof ProviderError && error.code === 'unavailable',
    );
    assert.equal(spent.vendors, before, 'an untracked request never reached a vendor');
  });
});
