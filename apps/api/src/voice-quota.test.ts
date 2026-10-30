import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { chunkForSpeech, spokenText } from '@metaboard/shared/speech-text';
import express from 'express';
import type { Server } from 'node:http';
import type { Pool } from 'pg';

// The voice route under membership quota (task #84, docs/MEMBERSHIP-PLAN.md §4).
//
// A voice turn is a chat turn with a transcription in front of it: the clip's
// seconds and one chat unit are held before the audio leaves, and the transcript
// spends that same chat unit at /api/assistant/query. What is asserted here is
// money and ownership - who may record, which account pays, what a replay, a
// failure or a recording nobody finished costs. No vendor is called: fetch answers
// Deepgram and refuses the model.
//
// Like quota.test.ts and lifecycle.test.ts, the modules that build a pg Pool are
// imported inside the test so the .env guard below runs first.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../.env'));
  } catch {
    // No .env - the whole file skips.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);

const SAMPLE_RATE = 16_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Answered by the orchestrator's own script: a query with no provider call.
const SCRIPTED_QUESTION = 'who are you';
// Only a model can answer this one, which is where fetch is made to hang.
const MODEL_QUESTION = 'can you give me a full guide for Ahri in this set with items, augments and positioning tips please';

let pool: Pool;
let accounts: typeof import('./accounts.ts');
let lifecycle: typeof import('./membership/lifecycle.ts');
let voice: typeof import('./voice.ts');

const originalFetch = globalThis.fetch;
const envBackup: Record<string, string | undefined> = {};
const planIds: string[] = [];
let schemaApplied = false;

function rememberEnv(...names: string[]): void {
  for (const name of names) if (!(name in envBackup)) envBackup[name] = process.env[name];
}

async function applySchema(): Promise<void> {
  if (schemaApplied) return;
  // This file and the other DB tests reach the same idempotent DDL from separate
  // processes; Postgres picks one as the deadlock victim, so retry.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await pool.query(await readFile(join(import.meta.dirname, 'schema.sql'), 'utf8'));
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= 3 || !/deadlock|serialized|concurrent access/i.test(message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)));
    }
  }
  schemaApplied = true;
}

type PlanSeed = {
  code?: string;
  status?: string;
  termDays?: number | null;
  chatPerPeriod?: number;
  chatPerDay?: number;
  sttSecondsPerPeriod?: number;
  maxSttSecondsPerRequest?: number | null;
  ttsCharactersPerPeriod?: number;
  chatRequestsPerMinute?: number;
  maxConcurrentRequests?: number;
  priceVnd?: number;
};

async function insertPlan(seed: PlanSeed = {}): Promise<string> {
  await applySchema();
  const id = randomUUID();
  planIds.push(id);
  await pool.query(
    `INSERT INTO plan_versions (
       id, code, version, label, price_vnd, term_days, status,
       chat_per_period, chat_per_day, stt_seconds_per_period, tts_characters_per_period,
       chat_requests_per_minute, max_concurrent_requests, max_stt_seconds_per_request, max_concurrent_tts_chunks
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      id,
      seed.code ?? `voice-${id.slice(0, 8)}`,
      1,
      seed.code ?? 'Voice quota test',
      seed.priceVnd ?? 99_000,
      'termDays' in seed ? seed.termDays : 30,
      seed.status ?? 'active',
      seed.chatPerPeriod ?? 150,
      seed.chatPerDay ?? 30,
      seed.sttSecondsPerPeriod ?? 600,
      seed.ttsCharactersPerPeriod ?? 5_000,
      // The per-minute admission window is a separate limit from the budget; raised
      // by default so a scenario about money is not really testing rate limits.
      seed.chatRequestsPerMinute ?? 100,
      seed.maxConcurrentRequests ?? 4,
      'maxSttSecondsPerRequest' in seed ? seed.maxSttSecondsPerRequest : 60,
      2,
    ],
  );
  return id;
}

type Fixture = { userId: string; token: string; cleanup: () => Promise<void> };

async function makeUser(): Promise<Fixture> {
  await applySchema();
  const userId = randomUUID();
  await pool.query('INSERT INTO users (id, email, role) VALUES ($1, $2, $3)', [userId, `test-${userId}@example.com`, 'user']);
  const token = await accounts.createSession(userId);
  const client = randomUUID();
  return {
    userId,
    token,
    cleanup: async () => {
      await pool.query('DELETE FROM user_sessions WHERE token_hash = $1', [accounts.hashToken(token)]);
      await pool.query('DELETE FROM assistant_reasoning_logs WHERE conversation_id IN (SELECT id FROM assistant_conversations WHERE client_id = $1)', [client]);
      await pool.query('DELETE FROM assistant_conversations WHERE client_id = $1', [client]);
      await pool.query('DELETE FROM membership_events WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM memberships WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM usage_reservations WHERE request_id IN (SELECT id FROM usage_requests WHERE user_id = $1)', [userId]);
      await pool.query('DELETE FROM usage_attempts WHERE request_id IN (SELECT id FROM usage_requests WHERE user_id = $1)', [userId]);
      await pool.query('DELETE FROM usage_requests WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM usage_buckets WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM assistant_conversations WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    },
  };
}

/** A plan that was ever spent against cannot be deleted while those rows exist, so
 *  cleanup removes the dependents in foreign-key order, after every account is gone. */
async function dropPlans(): Promise<void> {
  if (planIds.length === 0) return;
  const steps = [
    'DELETE FROM membership_events WHERE plan_version_id = ANY($1)',
    'DELETE FROM memberships WHERE plan_version_id = ANY($1)',
    'DELETE FROM usage_reservations WHERE bucket_id IN (SELECT id FROM usage_buckets WHERE plan_version_id = ANY($1))',
    'DELETE FROM usage_buckets WHERE plan_version_id = ANY($1)',
    'DELETE FROM plan_versions WHERE id = ANY($1)',
  ];
  for (const sql of steps) await pool.query(sql, [planIds]).catch(() => {});
  planIds.length = 0;
}

async function givePlan(user: Fixture, planVersionId: string): Promise<void> {
  const grant = await lifecycle.grantPeriod({
    userId: user.userId,
    planVersionId,
    source: 'grant',
    actorId: user.userId,
    reason: 'voice quota fixture',
    verifiedAt: Date.now(),
  });
  assert.ok(grant.ok, JSON.stringify(grant));
}

type RequestRow = { id: string; purpose: string; status: string; error_code: string | null };

async function requestRows(userId: string): Promise<RequestRow[]> {
  const { rows } = await pool.query(
    `SELECT id, purpose, status, error_code FROM usage_requests WHERE user_id = $1 ORDER BY created_at, id`,
    [userId],
  );
  return rows;
}

type BucketRow = { period_kind: string; allowance: number; consumed: number; reserved: number; plan_version_id: string };

async function bucketsFor(userId: string, metric: string): Promise<BucketRow[]> {
  const { rows } = await pool.query(
    `SELECT b.period_kind, b.allowance_units AS allowance, b.consumed_units AS consumed,
            b.reserved_units AS reserved, b.plan_version_id
       FROM usage_buckets b WHERE b.user_id = $1 AND b.metric = $2 ORDER BY b.period_kind`,
    [userId, metric],
  );
  return rows;
}

async function attemptCount(requestId: string): Promise<number> {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM usage_attempts WHERE request_id = $1', [requestId]);
  return Number(rows[0]?.n ?? 0);
}

async function waitForDispatched(userId: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if ((await requestRows(userId)).some((row) => row.status === 'dispatched')) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`turn for ${userId} never dispatched`);
}

/** A turn is closed when the ledger says so; SSE teardown is asynchronous, so an
 *  assertion that follows a client abort has to wait for the settle to land. */
async function waitUntilSettled(userId: string): Promise<RequestRow> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rows = await requestRows(userId);
    if (rows.length && !rows.some((row) => row.status === 'reserved' || row.status === 'dispatched')) return rows[rows.length - 1];
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`ledger for ${userId} never settled`);
}

test('the voice route pays with account quota', { skip: !hasDb }, async (t) => {
  pool = (await import('./db.ts')).pool;
  accounts = await import('./accounts.ts');
  lifecycle = await import('./membership/lifecycle.ts');
  voice = await import('./voice.ts');
  rememberEnv(
    'ASSISTANT_ENABLED',
    'ASSISTANT_PROVIDER',
    'ASSISTANT_MODEL',
    'ASSISTANT_RATE_LIMIT',
    'ASSISTANT_MAX_CONCURRENCY',
    'ASSISTANT_LOAD_TIMEOUT_MS',
    'ASSISTANT_REQUEST_TIMEOUT_MS',
    'MEMBERSHIP_FREE_PLAN_CODE',
    'MEMBERSHIP_ENFORCEMENT',
    'STT_PROVIDER',
    'DEEPGRAM_API_KEY',
    'TTS_PROVIDER',
    'TTS_CHUNK_CHARACTERS',
    'VIENEU_TTS_URL',
  );
  process.env.ASSISTANT_ENABLED = 'true';
  process.env.MEMBERSHIP_ENFORCEMENT = 'enforce';
  process.env.ASSISTANT_PROVIDER = 'ollama';
  process.env.ASSISTANT_MODEL = 'test-model';
  process.env.ASSISTANT_RATE_LIMIT = '100';
  process.env.ASSISTANT_MAX_CONCURRENCY = '8';
  process.env.ASSISTANT_LOAD_TIMEOUT_MS = '8000';
  process.env.ASSISTANT_REQUEST_TIMEOUT_MS = '8000';
  // One vendor, pinned: the developer's .env may hold several keys, and a silent
  // fallback to another provider would turn "the vendor refused" into a success.
  process.env.STT_PROVIDER = 'deepgram';
  process.env.DEEPGRAM_API_KEY = 'test-deepgram-key';
  // TTS is pinned the same way: Deepgram answers both languages, and an empty
  // VieNeu URL keeps the developer's cloud engine out of the fallback chain.
  process.env.TTS_PROVIDER = 'deepgram';
  process.env.VIENEU_TTS_URL = '';
  process.env.TTS_CHUNK_CHARACTERS = '150';

  // The fallback tier this file owns; the code is unique to the run so no developer
  // row leaks in. Free has no voice allowance at all - voice is a Plus feature.
  const freeCode = `free-voice-${randomUUID().slice(0, 8)}`;
  process.env.MEMBERSHIP_FREE_PLAN_CODE = freeCode;
  const freePlan = await insertPlan({
    code: freeCode,
    termDays: null,
    chatPerPeriod: 30,
    chatPerDay: 20,
    sttSecondsPerPeriod: 0,
    ttsCharactersPerPeriod: 0,
    maxSttSecondsPerRequest: null,
    priceVnd: 0,
  });
  const plusPlan = await insertPlan({ chatPerPeriod: 200, chatPerDay: 50 });
  // One chat turn in flight, so a hold nobody spends is visible as a refusal.
  const singleSlotPlan = await insertPlan({ chatPerPeriod: 50, chatPerDay: 10, maxConcurrentRequests: 1 });

  // One server for the whole file, with the session resolvers the real app puts in
  // front of both routers (apps/api/src/index.ts).
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  const { voiceRouter } = await import('./voice.ts');
  const { assistantRouter } = await import('./assistant/index.ts');
  const { currentSessionUser } = await import('./auth-routes.ts');
  const resolveSessionUser = async (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as { authUser?: unknown }).authUser = await currentSessionUser(req);
    next();
  };
  app.use('/api/voice', resolveSessionUser, voiceRouter);
  app.use('/api/assistant', resolveSessionUser, assistantRouter);

  let server: Server | null = null;
  let base = '';
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server?.address();
      base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
      resolve();
    });
  });

  const cleanups: Array<() => Promise<void>> = [];
  const controllers = new Set<AbortController>();
  t.after(async () => {
    for (const controller of controllers) controller.abort();
    globalThis.fetch = originalFetch;
    for (const name of Object.keys(envBackup)) {
      const value = envBackup[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    for (const cleanup of cleanups) await cleanup();
    await dropPlans();
    if (server) await new Promise<void>((resolve, reject) => server?.close((error) => (error ? reject(error) : resolve())));
  });

  function newBrowser(): string {
    return randomUUID();
  }

  /** Mono Float32 at the one rate the route accepts, loud enough to be speech. */
  function speech(seconds: number): Buffer {
    const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE));
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.sin((2 * Math.PI * 220 * index) / SAMPLE_RATE) * 0.25;
    }
    return Buffer.from(samples.buffer);
  }

  async function transcribe(
    audio: Buffer,
    options: { token?: string; key?: string; signal?: AbortSignal; rate?: number } = {},
  ): Promise<Response> {
    const controller = new AbortController();
    controllers.add(controller);
    return fetch(`${base}/api/voice/transcribe`, {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-sample-rate': String(options.rate ?? SAMPLE_RATE),
        'x-language': 'en',
        'x-request-key': options.key ?? randomUUID(),
        cookie: `mb_assistant=${newBrowser()}; mb_session=${options.token ?? ''}`,
      },
      body: new Uint8Array(audio),
      signal: options.signal ?? controller.signal,
    });
  }

  async function query(
    body: Record<string, unknown>,
    options: { token?: string; signal?: AbortSignal } = {},
  ): Promise<Response> {
    const controller = new AbortController();
    controllers.add(controller);
    return fetch(`${base}/api/assistant/query`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `mb_assistant=${newBrowser()}; mb_session=${options.token ?? ''}`,
      },
      body: JSON.stringify(body),
      signal: options.signal ?? controller.signal,
    });
  }

  async function jsonOf(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { raw: text };
    }
  }

  function ttsPlan(requestId: string, token = ''): Promise<Response> {
    return fetch(`${base}/api/voice/tts/plan?requestId=${encodeURIComponent(requestId)}`, {
      headers: { cookie: `mb_session=${token}` },
    });
  }

  function synthesize(body: Record<string, unknown>, options: { token?: string; key?: string } = {}): Promise<Response> {
    return fetch(`${base}/api/voice/tts/speech`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.key ? { 'x-request-key': options.key } : {}),
        cookie: `mb_session=${options.token ?? ''}`,
      },
      body: JSON.stringify(body),
    });
  }

  /** One completed turn: the ledger id that owns it and the answer it stored. */
  async function completedTurn(user: Fixture, message = SCRIPTED_QUESTION): Promise<{ requestId: string; answer: string }> {
    const response = await query({ message, lang: 'en' }, { token: user.token });
    assert.equal(response.status, 200, await response.clone().text());
    const body = await jsonOf(response);
    return { requestId: String(body.requestId), answer: String(body.answer) };
  }

  /** What the server must answer for a plan: the shared normalisation, its hash and
   *  the shared chunking at this file's TTS_CHUNK_CHARACTERS. */
  function expectedPlan(answer: string): { version: string; chunks: string[] } {
    const spoken = spokenText(answer);
    return { version: createHash('sha256').update(spoken).digest('hex'), chunks: chunkForSpeech(spoken, 150) };
  }

  /** `ok` is a vendor that transcribed the clip; `empty` is one that answered with
   *  no words (a noisy room read as silence); `fail` is one that declined the work.
   *  The model behind the Coach is either refusing (a system error with no answer)
   *  or hanging (engaged and never finishing, which is how two claims on one turn
   *  are reproduced without a fake provider). */
  let sttMode: 'ok' | 'empty' | 'fail' = 'ok';
  let sttCalls = 0;
  const sttText = 'what beats this comp';
  let providerMode: 'refuse' | 'hang' = 'refuse';
  // Every chunk request the route actually forwards to the engine, and the text it
  // sent, so the test can prove prose from the browser never reaches synthesis.
  let ttsCalls = 0;
  let lastTtsText = '';
  let ttsMode: 'ok' | 'fail' = 'ok';

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://api.deepgram.com/') && url.includes('/speak')) {
      ttsCalls += 1;
      try {
        const body = JSON.parse(String(init?.body ?? '{}')) as { text?: unknown };
        lastTtsText = typeof body.text === 'string' ? body.text : '';
      } catch {
        lastTtsText = '';
      }
      if (ttsMode === 'fail') return new Response('{"err_msg":"speech engine exploded"}', { status: 500 });
      // Bigger than the route's 4 KB floor for "this is audio, not an error page".
      return new Response(new Uint8Array(6_000), { status: 200, headers: { 'content-type': 'audio/wav' } });
    }
    if (url.startsWith('https://api.deepgram.com/')) {
      sttCalls += 1;
      if (sttMode === 'fail') return new Response('{"err_msg":"upstream exploded"}', { status: 500 });
      const transcript = sttMode === 'empty' ? '   ' : sttText;
      return new Response(JSON.stringify({ results: { channels: [{ alternatives: [{ transcript }] }] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.startsWith('http://127.0.0.1:11434')) {
      if (providerMode === 'refuse') return new Response('{"error":"model is overloaded"}', { status: 400 });
      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(new DOMException('The operation was aborted', 'AbortError'));
        if (init?.signal?.aborted) {
          abort();
          return;
        }
        init?.signal?.addEventListener('abort', abort, { once: true });
      });
      return new Response(JSON.stringify({ message: { content: '{"answer":"too late"}' }, done: true }), { status: 200 });
    }
    return originalFetch(input as string | URL, init);
  }) as typeof fetch;

  await t.test('a recording without a session is refused before any audio leaves', async () => {
    const before = sttCalls;
    const response = await transcribe(speech(4));
    assert.equal(response.status, 401);
    assert.equal((await jsonOf(response)).code, 'unauthenticated');
    assert.equal(sttCalls, before, 'calling the route directly cannot borrow a quota');
    assert.equal(response.headers.get('x-stt-provider'), null);
  });

  await t.test('a Free account has no voice allowance and spends nothing', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    const before = sttCalls;
    const response = await transcribe(speech(4), { token: user.token });
    assert.equal(response.status, 403);
    assert.equal((await jsonOf(response)).code, 'feature_locked');
    assert.equal(sttCalls, before, 'the clip is refused before the vendor sees it');
    assert.equal((await requestRows(user.userId)).length, 0);

    // The text route still works on the same account: voice is the locked feature,
    // not the whole Coach.
    const answered = await query({ message: SCRIPTED_QUESTION, lang: 'en' }, { token: user.token });
    assert.equal(answered.status, 200, await answered.clone().text());
    assert.equal((await bucketsFor(user.userId, 'chat')).every((bucket) => bucket.plan_version_id === freePlan), true);
  });

  await t.test('a voice turn holds chat and seconds before the clip, and the transcript spends that turn', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    await givePlan(user, plusPlan);
    const before = sttCalls;

    const response = await transcribe(speech(4), { token: user.token });
    assert.equal(response.status, 200, await response.clone().text());
    const body = await jsonOf(response);
    assert.equal(body.text, sttText);
    assert.equal(response.headers.get('x-stt-provider'), 'deepgram');
    const turnId = String(body.turnId);
    assert.match(turnId, UUID, 'the clip hands back the turn it reserved');
    assert.equal(sttCalls, before + 1);

    const rows = await requestRows(user.userId);
    assert.equal(rows.length, 2, 'one clip and one chat unit, both booked before the vendor');
    const clip = rows.find((row) => row.purpose === 'stt_transcribe');
    const turn = rows.find((row) => row.purpose === 'coach_turn');
    assert.equal(clip?.status, 'completed', 'the clip was transcribed, so its seconds stand');
    assert.equal(turn?.id, turnId);
    assert.equal(turn?.status, 'reserved', 'the chat unit waits for the question');

    const sttBefore = await bucketsFor(user.userId, 'stt_seconds');
    assert.equal(sttBefore.length, 1);
    assert.equal(sttBefore[0]?.consumed, 4, 'seconds come from the validated samples, not from the client');
    const chatBefore = await bucketsFor(user.userId, 'chat');
    assert.deepEqual(chatBefore.map((bucket) => bucket.reserved).sort(), [1, 1]);
    assert.deepEqual(chatBefore.map((bucket) => bucket.consumed), [0, 0]);

    const answered = await query(
      { message: SCRIPTED_QUESTION, lang: 'en', conversationId: randomUUID(), voiceTurnId: turnId },
      { token: user.token },
    );
    assert.equal(answered.status, 200, await answered.clone().text());
    const answer = await jsonOf(answered);
    assert.equal(answer.requestId, turnId, 'the question runs on the turn the recording reserved');

    assert.equal((await requestRows(user.userId)).length, 2, 'the transcript never books a second chat unit');
    const chatAfter = await bucketsFor(user.userId, 'chat');
    assert.deepEqual(chatAfter.map((bucket) => bucket.consumed).sort(), [1, 1], 'exactly one turn was spent');
    assert.deepEqual(chatAfter.map((bucket) => bucket.reserved), [0, 0]);
    assert.equal((await bucketsFor(user.userId, 'stt_seconds'))[0]?.consumed, 4, 'and the clip was charged once');
  });

  await t.test('seconds are rounded up from the sample count', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    await givePlan(user, plusPlan);
    const response = await transcribe(speech(1.5), { token: user.token });
    assert.equal(response.status, 200, await response.clone().text());
    const stt = await bucketsFor(user.userId, 'stt_seconds');
    assert.equal(stt[0]?.consumed, 2, 'a partial second is a whole second');
  });

  await t.test('silence is refused before any booking', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    await givePlan(user, plusPlan);
    const before = sttCalls;
    const response = await transcribe(Buffer.alloc(SAMPLE_RATE * 4 * 4), { token: user.token });
    assert.equal(response.status, 422);
    assert.equal((await jsonOf(response)).code, 'no_speech');
    assert.equal(sttCalls, before, 'a pocket-dial never reaches a vendor');
    assert.equal((await requestRows(user.userId)).length, 0);
  });

  await t.test('a vendor failure returns both holds but keeps the priced attempt', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    await givePlan(user, plusPlan);
    sttMode = 'fail';
    voice.clearSttCooldowns();
    try {
      const before = sttCalls;
      const response = await transcribe(speech(4), { token: user.token });
      assert.equal(response.status, 502);
      assert.equal((await jsonOf(response)).code, 'transcription_failed');
      assert.equal(sttCalls, before + 1);

      const rows = await requestRows(user.userId);
      assert.equal(rows.length, 2);
      assert.equal(rows.every((row) => row.status === 'released'), true, 'nothing was delivered to the user');
      assert.equal(rows.every((row) => row.error_code === 'transcription_failed'), true);
      assert.deepEqual((await bucketsFor(user.userId, 'chat')).map((bucket) => [bucket.consumed, bucket.reserved]), [
        [0, 0],
        [0, 0],
      ]);
      assert.deepEqual((await bucketsFor(user.userId, 'stt_seconds')).map((bucket) => [bucket.consumed, bucket.reserved]), [[0, 0]]);
      const clip = rows.find((row) => row.purpose === 'stt_transcribe');
      assert.ok(clip && (await attemptCount(clip.id)) >= 1, 'the vendor call is still in the cost ledger');
    } finally {
      sttMode = 'ok';
      voice.clearSttCooldowns();
    }
  });

  await t.test('an empty transcript refunds the clip and the turn', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    await givePlan(user, plusPlan);
    sttMode = 'empty';
    try {
      const response = await transcribe(speech(4), { token: user.token });
      assert.equal(response.status, 422);
      assert.equal((await jsonOf(response)).code, 'no_speech');
      const rows = await requestRows(user.userId);
      assert.equal(rows.length, 2);
      assert.equal(rows.every((row) => row.status === 'released'), true);
      assert.equal(rows.every((row) => row.error_code === 'no_speech'), true);
      assert.equal((await bucketsFor(user.userId, 'stt_seconds'))[0]?.consumed, 0, 'no words, no seconds');
      const clip = rows.find((row) => row.purpose === 'stt_transcribe');
      assert.ok(clip && (await attemptCount(clip.id)) >= 1);
    } finally {
      sttMode = 'ok';
    }
  });

  await t.test('a clip longer than the plan allows is denied before the ledger is touched', async () => {
    const shortPlan = await insertPlan({ maxSttSecondsPerRequest: 2 });
    const user = await makeUser();
    cleanups.push(user.cleanup);
    await givePlan(user, shortPlan);
    const before = sttCalls;
    const response = await transcribe(speech(4), { token: user.token });
    assert.equal(response.status, 413);
    assert.equal((await jsonOf(response)).code, 'audio_too_long');
    assert.equal(sttCalls, before);
    assert.equal((await requestRows(user.userId)).length, 0);
  });

  await t.test('a malformed clip is refused before the ledger is touched', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    await givePlan(user, plusPlan);
    const before = sttCalls;

    // A rate the route does not transcribe, a body that is not whole float samples,
    // and a sample that is not a number are all "this is not audio". None of them may
    // reserve seconds, because nothing could ever be transcribed from them.
    const wrongRate = await transcribe(speech(4), { token: user.token, rate: 8_000 });
    assert.equal(wrongRate.status, 400);
    assert.equal((await jsonOf(wrongRate)).code, 'invalid_audio');

    const truncated = await transcribe(Buffer.from([1, 2, 3]), { token: user.token });
    assert.equal(truncated.status, 400);
    assert.equal((await jsonOf(truncated)).code, 'invalid_audio');

    const notANumber = new Float32Array(4);
    notANumber[2] = Number.NaN;
    const nan = await transcribe(Buffer.from(notANumber.buffer), { token: user.token });
    assert.equal(nan.status, 400);
    assert.equal((await jsonOf(nan)).code, 'invalid_audio');

    assert.equal(sttCalls, before, 'no vendor saw a clip that is not audio');
    assert.equal((await requestRows(user.userId)).length, 0);
  });

  await t.test('a spent chat allowance stops the clip before its seconds are billed', async () => {
    const oneTurnPlan = await insertPlan({ chatPerPeriod: 1, chatPerDay: 10 });
    const user = await makeUser();
    cleanups.push(user.cleanup);
    await givePlan(user, oneTurnPlan);
    const spent = await query({ message: SCRIPTED_QUESTION, lang: 'en' }, { token: user.token });
    assert.equal(spent.status, 200, await spent.clone().text());

    const before = sttCalls;
    const response = await transcribe(speech(4), { token: user.token });
    assert.equal(response.status, 402);
    assert.equal((await jsonOf(response)).code, 'quota_exhausted');
    assert.equal(sttCalls, before, 'the clip never leaves when the question behind it cannot be paid for');

    const rows = await requestRows(user.userId);
    const clip = rows.find((row) => row.purpose === 'stt_transcribe');
    assert.equal(clip?.status, 'released', 'the hold taken before the chat hold is given back');
    assert.equal(clip?.error_code, 'exhausted');
    assert.equal((await bucketsFor(user.userId, 'stt_seconds'))[0]?.consumed, 0, 'no seconds for a clip nobody heard');
    assert.deepEqual((await bucketsFor(user.userId, 'chat')).map((bucket) => bucket.consumed), [1, 1], 'the one turn was spent by the question on both windows');
    assert.deepEqual((await bucketsFor(user.userId, 'chat')).map((bucket) => bucket.reserved), [0, 0]);
  });

  await t.test('the same recording key replays instead of charging twice', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    await givePlan(user, plusPlan);
    const before = sttCalls;
    const key = randomUUID();
    const clip = speech(4);
    const first = await transcribe(clip, { token: user.token, key });
    assert.equal(first.status, 200, await first.clone().text());
    const second = await transcribe(clip, { token: user.token, key });
    assert.equal(second.status, 409);
    assert.equal((await jsonOf(second)).code, 'already_answered');
    assert.equal(sttCalls, before + 1, 'a retried upload does not pay the vendor twice');
    assert.equal((await requestRows(user.userId)).length, 2);
    assert.equal((await bucketsFor(user.userId, 'stt_seconds'))[0]?.consumed, 4);
  });

  await t.test('a turn id from another account buys nothing', async () => {
    const owner = await makeUser();
    const other = await makeUser();
    cleanups.push(owner.cleanup, other.cleanup);
    await givePlan(owner, plusPlan);
    await givePlan(other, plusPlan);

    const clip = await jsonOf(await transcribe(speech(4), { token: owner.token }));
    const turnId = String(clip.turnId);
    const response = await query({ message: SCRIPTED_QUESTION, lang: 'en', voiceTurnId: turnId }, { token: other.token });
    assert.equal(response.status, 200, await response.clone().text());
    const answer = await jsonOf(response);
    assert.notEqual(answer.requestId, turnId, 'a foreign turn cannot be claimed');

    const otherRows = await requestRows(other.userId);
    assert.equal(otherRows.length, 1, 'the intruder pays with a turn of its own');
    assert.equal(otherRows[0]?.purpose, 'coach_turn');
    assert.equal(otherRows[0]?.id, answer.requestId);
    assert.equal(otherRows[0]?.status, 'completed');

    const ownerTurn = (await requestRows(owner.userId)).find((row) => row.id === turnId);
    assert.equal(ownerTurn?.status, 'reserved', 'the owner still holds its turn');
    assert.equal(
      (await bucketsFor(owner.userId, 'chat')).every((bucket) => bucket.consumed === 0 && bucket.reserved === 1),
      true,
      'and nothing was spent from the owner ledger',
    );
  });

  await t.test('a recording nobody finished stops blocking the account after it expires', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    await givePlan(user, singleSlotPlan);
    const clip = await jsonOf(await transcribe(speech(4), { token: user.token }));
    const turnId = String(clip.turnId);
    // Nobody sends the question, so the hold sits there until it ages out.
    await pool.query('UPDATE usage_requests SET reserve_expires_at = $2 WHERE id = $1', [
      turnId,
      new Date(Date.now() - 1_000).toISOString(),
    ]);

    const response = await query({ message: SCRIPTED_QUESTION, lang: 'en' }, { token: user.token });
    assert.equal(response.status, 200, 'the stale hold is released instead of filling the single slot');
    const turn = (await requestRows(user.userId)).find((row) => row.id === turnId);
    assert.equal(turn?.status, 'released');
    const chat = await bucketsFor(user.userId, 'chat');
    assert.deepEqual(chat.map((bucket) => bucket.consumed).sort(), [1, 1], 'only the question that ran was charged');
    assert.deepEqual(chat.map((bucket) => bucket.reserved), [0, 0]);
    assert.equal((await bucketsFor(user.userId, 'stt_seconds'))[0]?.consumed, 4, 'the clip itself was still transcribed and billed');
  });

  await t.test('two clients cannot both claim the same voice turn', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    await givePlan(user, plusPlan);
    const clip = await jsonOf(await transcribe(speech(4), { token: user.token }));
    const turnId = String(clip.turnId);
    providerMode = 'hang';
    try {
      const controller = new AbortController();
      controllers.add(controller);
      const first = await query(
        { message: MODEL_QUESTION, lang: 'en', stream: true, voiceTurnId: turnId },
        { token: user.token, signal: controller.signal },
      );
      assert.equal(first.status, 200);
      await waitForDispatched(user.userId);

      const second = await query(
        { message: MODEL_QUESTION, lang: 'en', voiceTurnId: turnId },
        { token: user.token, signal: AbortSignal.timeout(10_000) },
      );
      assert.equal(second.status, 409);
      assert.equal((await jsonOf(second)).code, 'request_in_progress');
      assert.equal((await requestRows(user.userId)).length, 2, 'the second ask never booked anything of its own');

      controller.abort();
      const settled = await waitUntilSettled(user.userId);
      assert.ok(['released', 'completed'].includes(settled.status), settled.status);
    } finally {
      providerMode = 'refuse';
    }
  });

  await t.test('an engine failure gives the characters back', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    await givePlan(user, plusPlan);
    const { requestId, answer } = await completedTurn(user);
    const expected = expectedPlan(answer);
    const before = ttsCalls;
    ttsMode = 'fail';
    try {
      const speech = await synthesize(
        { requestId, version: expected.version, chunk: 0, lang: 'en' },
        { token: user.token, key: randomUUID() },
      );
      assert.equal(speech.status, 502);
      assert.equal((await jsonOf(speech)).error, 'speech_generation_failed');
      assert.equal(ttsCalls, before + 1, 'the engine was asked once and English has no second engine');
      const rows = (await requestRows(user.userId)).filter((row) => row.purpose === 'tts_synthesize');
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.status, 'released');
      assert.equal(rows[0]?.error_code, 'speech_generation_failed');
      const tts = await bucketsFor(user.userId, 'tts_characters');
      assert.equal(tts[0]?.consumed, 0, 'no audio, no charge');
      assert.equal(tts[0]?.reserved, 0, 'and the hold is gone');
      assert.ok((await attemptCount(rows[0]!.id)) >= 1, 'the failed engine call stays priced in the cost ledger');
    } finally {
      ttsMode = 'ok';
    }
  });

  await t.test('the plan and the synthesis read the server-owned answer text', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    await givePlan(user, plusPlan);
    const { requestId, answer } = await completedTurn(user);
    const expected = expectedPlan(answer);
    assert.ok(expected.chunks.length >= 1);

    const plan = await ttsPlan(requestId, user.token);
    assert.equal(plan.status, 200, await plan.clone().text());
    const body = await jsonOf(plan);
    assert.equal(body.version, expected.version, 'the version is the hash of the normalised answer');
    assert.equal(body.chunks, expected.chunks.length);

    const before = ttsCalls;
    const speech = await synthesize(
      // The browser's `input` must be ignored: the server owns what is spoken.
      { requestId, version: expected.version, chunk: 0, lang: 'en', input: 'browser prose that must never be spoken' },
      { token: user.token, key: randomUUID() },
    );
    assert.equal(speech.status, 200, await speech.clone().text());
    assert.match(speech.headers.get('content-type') ?? '', /^audio\//);
    assert.equal(speech.headers.get('x-tts-provider'), 'deepgram');
    assert.equal(ttsCalls, before + 1);
    assert.equal(lastTtsText, expected.chunks[0], 'the engine reads the chunk the server built');

    const rows = (await requestRows(user.userId)).filter((row) => row.purpose === 'tts_synthesize');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.status, 'completed');
    const tts = await bucketsFor(user.userId, 'tts_characters');
    assert.equal(tts[0]?.consumed, expected.chunks[0]?.length, 'the server counts the characters it synthesized');
    assert.equal(tts[0]?.reserved, 0);
  });

  await t.test('playback requires the account that owns the answer', async () => {
    const owner = await makeUser();
    const other = await makeUser();
    cleanups.push(owner.cleanup, other.cleanup);
    await givePlan(owner, plusPlan);
    await givePlan(other, plusPlan);
    const { requestId, answer } = await completedTurn(owner);
    const expected = expectedPlan(answer);
    assert.ok(expected.chunks[0]);

    const guestPlan = await ttsPlan(requestId);
    assert.equal(guestPlan.status, 401);
    assert.equal((await jsonOf(guestPlan)).code, 'unauthenticated');
    const guestSpeech = await synthesize({ requestId, version: expected.version, chunk: 0, lang: 'en' });
    assert.equal(guestSpeech.status, 401);
    assert.equal((await jsonOf(guestSpeech)).code, 'unauthenticated');

    const foreignPlan = await ttsPlan(requestId, other.token);
    assert.equal(foreignPlan.status, 404, 'another account cannot look up this answer');
    const before = ttsCalls;
    const foreignSpeech = await synthesize(
      { requestId, version: expected.version, chunk: 0, lang: 'en' },
      { token: other.token, key: randomUUID() },
    );
    assert.equal(foreignSpeech.status, 404);
    assert.equal(ttsCalls, before, 'a foreign answer never reaches the engine');
    assert.equal(
      (await requestRows(other.userId)).some((row) => row.purpose === 'tts_synthesize'),
      false,
      'and the intruder is not billed for it',
    );
  });

  await t.test('a stale version or an index past the plan is refused before synthesis', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    await givePlan(user, plusPlan);
    const { requestId, answer } = await completedTurn(user);
    const expected = expectedPlan(answer);
    const before = ttsCalls;

    const stale = await synthesize(
      { requestId, version: '0'.repeat(64), chunk: 0, lang: 'en' },
      { token: user.token, key: randomUUID() },
    );
    assert.equal(stale.status, 409);
    assert.equal((await jsonOf(stale)).code, 'speech_version_mismatch');

    const past = await synthesize(
      { requestId, version: expected.version, chunk: expected.chunks.length, lang: 'en' },
      { token: user.token, key: randomUUID() },
    );
    assert.equal(past.status, 400);
    assert.equal((await jsonOf(past)).code, 'invalid_request');

    assert.equal(ttsCalls, before, 'neither request reached the engine');
    assert.equal((await requestRows(user.userId)).some((row) => row.purpose === 'tts_synthesize'), false);
  });

  await t.test('a transport retry replays the chunk instead of paying twice', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    await givePlan(user, plusPlan);
    const { requestId, answer } = await completedTurn(user);
    const expected = expectedPlan(answer);
    const body = { requestId, version: expected.version, chunk: 0, lang: 'en' };
    const before = ttsCalls;
    const attemptKey = randomUUID();

    const first = await synthesize(body, { token: user.token, key: attemptKey });
    assert.equal(first.status, 200, await first.clone().text());

    // A transport retry keeps the attempt key, so it is the same ledger row.
    const replay = await synthesize(body, { token: user.token, key: attemptKey });
    assert.equal(replay.status, 409);
    assert.equal((await jsonOf(replay)).code, 'already_answered');
    assert.equal(ttsCalls, before + 1, 'the retry does not buy a second synthesis');
    assert.equal((await bucketsFor(user.userId, 'tts_characters'))[0]?.consumed, expected.chunks[0]?.length);

    // A listener pressing play again is a new attempt, and the public policy says a
    // synthesized chunk may cost again.
    const again = await synthesize(body, { token: user.token, key: randomUUID() });
    assert.equal(again.status, 200, await again.clone().text());
    assert.equal(ttsCalls, before + 2);
    assert.equal((await bucketsFor(user.userId, 'tts_characters'))[0]?.consumed, (expected.chunks[0]?.length ?? 0) * 2);
  });

  await t.test('an exhausted allowance stops synthesis with the answer still readable', async () => {
    const tinyPlan = await insertPlan({ chatPerPeriod: 200, chatPerDay: 50, ttsCharactersPerPeriod: 5 });
    const user = await makeUser();
    cleanups.push(user.cleanup);
    await givePlan(user, tinyPlan);
    const { requestId, answer } = await completedTurn(user);
    const expected = expectedPlan(answer);
    assert.ok((expected.chunks[0]?.length ?? 0) > 5, 'the first chunk does not fit the allowance');

    const plan = await ttsPlan(requestId, user.token);
    assert.equal(plan.status, 200, 'a plan with characters left is still readable');
    const before = ttsCalls;
    const speech = await synthesize(
      { requestId, version: expected.version, chunk: 0, lang: 'en' },
      { token: user.token, key: randomUUID() },
    );
    assert.equal(speech.status, 402);
    assert.equal((await jsonOf(speech)).code, 'quota_exhausted');
    assert.equal(ttsCalls, before, 'the engine is not called once the characters are gone');
    assert.equal((await requestRows(user.userId)).some((row) => row.purpose === 'tts_synthesize'), false);
    const tts = await bucketsFor(user.userId, 'tts_characters');
    assert.equal(tts[0]?.consumed, 0);
    assert.equal(tts[0]?.reserved, 0);
  });

  await t.test('a Free account can neither plan nor hear an answer', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    const { requestId, answer } = await completedTurn(user);
    const expected = expectedPlan(answer);

    const plan = await ttsPlan(requestId, user.token);
    assert.equal(plan.status, 403);
    assert.equal((await jsonOf(plan)).code, 'feature_locked');

    const before = ttsCalls;
    const speech = await synthesize(
      { requestId, version: expected.version, chunk: 0, lang: 'en' },
      { token: user.token, key: randomUUID() },
    );
    assert.equal(speech.status, 403);
    assert.equal((await jsonOf(speech)).code, 'feature_locked');
    assert.equal(ttsCalls, before);
    assert.equal((await bucketsFor(user.userId, 'tts_characters')).length, 0, 'a locked feature never opens a bucket');
  });

  await t.test('without enforcement the legacy path speaks client text and writes no ledger', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    await givePlan(user, plusPlan);
    const { requestId } = await completedTurn(user);
    const saved = process.env.MEMBERSHIP_ENFORCEMENT;
    process.env.MEMBERSHIP_ENFORCEMENT = 'off';
    try {
      const plan = await ttsPlan(requestId, user.token);
      assert.equal(plan.status, 404, 'a deploy that is not enforcing has no plan route');

      const before = ttsCalls;
      const speech = await synthesize({ input: 'Legacy browser prose.', lang: 'en' });
      assert.equal(speech.status, 200, await speech.clone().text());
      assert.equal(ttsCalls, before + 1);
      assert.equal(lastTtsText, 'Legacy browser prose.');
      assert.equal(
        (await requestRows(user.userId)).some((row) => row.purpose === 'tts_synthesize'),
        false,
        'no ledger exists to bill on the open path',
      );
    } finally {
      process.env.MEMBERSHIP_ENFORCEMENT = saved;
    }
  });
});
