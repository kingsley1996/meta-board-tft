import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import type { Server } from 'node:http';
import type { Pool } from 'pg';

// The Coach text route under membership quota (task #83, docs/MEMBERSHIP-PLAN.md §4/§5).
//
// Everything asserted here is about money and ownership, not about answer quality:
// who may ask, which account pays, what happens when the answer never arrives, and
// whose history is whose. The orchestrator is left intact on purpose - two of its
// paths are used as fixtures: a scripted persona reply that needs no provider at all,
// and a question that only a model can answer, which is where fetch gets stubbed.
//
// Like quota.test.ts and lifecycle.test.ts, the modules that build a pg Pool are
// imported inside the test so the .env guard below runs first.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../../.env'));
  } catch {
    // No .env — the whole file skips.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);

const DAY = 86_400_000;
// Answered by the orchestrator's own script: one turn debited, zero provider calls.
const SCRIPTED_QUESTION = 'who are you';
// A named champion with a multi-part ask: no deterministic fallback can answer it, so
// the route only finishes when the provider does.
const MODEL_QUESTION = 'can you give me a full guide for Ahri in this set with items, augments and positioning tips please';

let pool: Pool;
let accounts: typeof import('../accounts.ts');
let lifecycle: typeof import('../membership/lifecycle.ts');
let conversations: typeof import('./conversation-store.ts');

const originalFetch = globalThis.fetch;
const envBackup: Record<string, string | undefined> = {};
const planIds: string[] = [];
let schemaApplied = false;

function rememberEnv(...names: string[]): void {
  for (const name of names) if (!(name in envBackup)) envBackup[name] = process.env[name];
}

async function applySchema(): Promise<void> {
  if (schemaApplied) return;
  // This file, quota.test.ts and lifecycle.test.ts all reach the same idempotent DDL
  // from separate processes; Postgres picks one as the deadlock victim, so retry.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await pool.query(await readFile(join(import.meta.dirname, '../schema.sql'), 'utf8'));
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
  priceVnd?: number;
  chatRequestsPerMinute?: number;
  maxConcurrentRequests?: number;
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
      seed.code ?? `plus-${id.slice(0, 8)}`,
      1,
      seed.code ?? 'Coach quota test',
      seed.priceVnd ?? 99_000,
      'termDays' in seed ? seed.termDays : 30,
      seed.status ?? 'active',
      seed.chatPerPeriod ?? 150,
      seed.chatPerDay ?? 30,
      600,
      5_000,
      // The per-minute admission window is a separate limit from the budget; raised
      // by default so a test that makes five turns is not really testing rate limits.
      seed.chatRequestsPerMinute ?? 100,
      seed.maxConcurrentRequests ?? 4,
      60,
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

async function requestRows(userId: string): Promise<{ id: string; status: string; error_code: string | null }[]> {
  const { rows } = await pool.query(
    `SELECT id, status, error_code FROM usage_requests WHERE user_id = $1 ORDER BY created_at, id`,
    [userId],
  );
  return rows;
}

/** The windows one chat metric is held in, with the plan that priced them. */
async function chatBuckets(userId: string): Promise<{ period_kind: string; allowance: number; consumed: number; reserved: number; plan_version_id: string }[]> {
  const { rows } = await pool.query(
    `SELECT b.period_kind, b.allowance_units AS allowance, b.consumed_units AS consumed,
            b.reserved_units AS reserved, b.plan_version_id
       FROM usage_buckets b WHERE b.user_id = $1 AND b.metric = 'chat' ORDER BY b.period_kind`,
    [userId],
  );
  return rows;
}

async function assistantMessageCount(userId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM assistant_messages m
       JOIN assistant_conversations c ON c.id = m.conversation_id WHERE c.user_id = $1`,
    [userId],
  );
  return Number(rows[0]?.n ?? 0);
}

/** A turn is closed when the ledger says so; SSE teardown is asynchronous, so the
 *  assertions that follow a client abort have to wait for the settle to land. */
async function waitUntilSettled(userId: string): Promise<{ id: string; status: string; error_code: string | null }> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rows = await requestRows(userId);
    const open = rows.find((row) => row.status === 'reserved' || row.status === 'dispatched');
    if (!open && rows.length) return rows[rows.length - 1];
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`turn for ${userId} never settled`);
}

async function waitForDispatched(userId: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rows = await requestRows(userId);
    if (rows.some((row) => row.status === 'dispatched')) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`turn for ${userId} never dispatched`);
}

test('the Coach text route pays with account quota', { skip: !hasDb }, async (t) => {
  pool = (await import('../db.ts')).pool;
  accounts = await import('../accounts.ts');
  lifecycle = await import('../membership/lifecycle.ts');
  conversations = await import('./conversation-store.ts');
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
  );
  process.env.ASSISTANT_ENABLED = 'true';
  process.env.MEMBERSHIP_ENFORCEMENT = 'enforce';
  process.env.ASSISTANT_PROVIDER = 'ollama';
  process.env.ASSISTANT_MODEL = 'test-model';
  process.env.ASSISTANT_RATE_LIMIT = '100';
  // The inference semaphore is the provider's problem, not the quota's: with a stubbed
  // fetch it would otherwise queue a background extraction call behind a hung turn.
  process.env.ASSISTANT_MAX_CONCURRENCY = '8';
  // Long enough that a stubbed turn is still in flight when the second request
  // arrives, short enough that a stuck scenario ends the file instead of hanging it.
  process.env.ASSISTANT_LOAD_TIMEOUT_MS = '8000';
  process.env.ASSISTANT_REQUEST_TIMEOUT_MS = '8000';

  // The fallback tier this file owns: every scenario below is a Free or a paid
  // account, and the code is unique to the run so no developer row leaks in.
  const freeCode = `free-coach-${randomUUID().slice(0, 8)}`;
  process.env.MEMBERSHIP_FREE_PLAN_CODE = freeCode;
  const freePlan = await insertPlan({ code: freeCode, termDays: null, chatPerPeriod: 30, chatPerDay: 20, priceVnd: 0 });
  const plusPlan = await insertPlan({ chatPerPeriod: 200, chatPerDay: 50, maxConcurrentRequests: 1 });

  // One server for the whole file, with the session resolver the real app puts in
  // front of the router (apps/api/src/index.ts).
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  const { assistantRouter } = await import('./index.ts');
  const { currentSessionUser } = await import('../auth-routes.ts');
  app.use('/api/assistant', async (req, _res, next) => {
    (req as { authUser?: unknown }).authUser = await currentSessionUser(req);
    next();
  }, assistantRouter);

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

  /** A browser identity of its own, so no two scenarios share the burst counter. */
  function newBrowser(): string {
    return randomUUID();
  }

  async function send(
    body: Record<string, unknown>,
    options: { token?: string; browser?: string; signal?: AbortSignal; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const controller = new AbortController();
    controllers.add(controller);
    const signal = options.signal ?? controller.signal;
    return fetch(`${base}/api/assistant/query`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `mb_assistant=${options.browser ?? randomUUID()}; mb_session=${options.token ?? ''}`,
        ...(options.headers ?? {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  }

  async function getJson(path: string, options: { token?: string; browser?: string } = {}): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await fetch(`${base}${path}`, {
      headers: { cookie: `mb_assistant=${options.browser ?? randomUUID()}; mb_session=${options.token ?? ''}` },
    });
    const text = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { raw: text };
    }
    return { status: response.status, body };
  }

  async function jsonOf(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { raw: text };
    }
  }

  /** Providers are not under test here, so fetch answers for one. `refuse` is a vendor
   *  that declined the work (a system error with no answer); `hang` is a vendor that
   *  started and never finished, which is how a disconnect and an in-flight turn are
   *  both reproduced without a fake server. */
  let fetchMode: 'refuse' | 'hang' = 'refuse';
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).startsWith('http://127.0.0.1:11434')) {
      if (fetchMode === 'refuse') return new Response('{"error":"model is overloaded"}', { status: 400 });
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
    return originalFetch(url as string | URL, init);
  }) as typeof fetch;

  await t.test('a signed-out browser is refused and its account ledger stays empty', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    const response = await send({ message: SCRIPTED_QUESTION, lang: 'en' }, { browser: newBrowser() });
    assert.equal(response.status, 401);
    assert.equal((await jsonOf(response)).code, 'unauthenticated');
    assert.equal((await requestRows(user.userId)).length, 0, 'no session means no turn was ever booked');
  });

  await t.test('the daily budget follows the account, not the browser cookie', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    const tightCode = `free-tight-${randomUUID().slice(0, 8)}`;
    const tightFree = await insertPlan({ code: tightCode, termDays: null, chatPerPeriod: 30, chatPerDay: 1, priceVnd: 0 });
    process.env.MEMBERSHIP_FREE_PLAN_CODE = tightCode;
    try {
      const first = await send({ message: SCRIPTED_QUESTION, lang: 'en' }, { token: user.token, browser: newBrowser() });
      assert.equal(first.status, 200, await first.clone().text());
      // A different browser on the same account - the old cookie-keyed budget called
      // this a fresh user and granted a second free turn.
      const second = await send({ message: SCRIPTED_QUESTION, lang: 'en' }, { token: user.token, browser: newBrowser() });
      assert.equal(second.status, 429);
      const denial = await jsonOf(second);
      assert.equal(denial.code, 'daily_cap');
      const buckets = await chatBuckets(user.userId);
      assert.equal(buckets.length, 2, 'one turn is held in the month window and the day window');
      assert.deepEqual(buckets.map((bucket) => bucket.consumed).sort(), [1, 1]);
      assert.equal(buckets.every((bucket) => bucket.plan_version_id === tightFree), true);
      assert.equal(buckets.every((bucket) => bucket.reserved === 0), true, 'a settled turn reserves nothing');
    } finally {
      process.env.MEMBERSHIP_FREE_PLAN_CODE = freeCode;
    }
  });

  await t.test('a body that claims a better plan changes nothing', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    const response = await send(
      {
        message: SCRIPTED_QUESTION,
        lang: 'en',
        // Whatever the client asserts about itself, entitlement is read from the
        // database, so these fields have to be ignored rather than trusted.
        plan: { code: 'plus', chat_per_period: 99999 },
        entitlement: { paid: true },
        role: 'admin',
      },
      { token: user.token, browser: newBrowser() },
    );
    assert.equal(response.status, 200);
    const buckets = await chatBuckets(user.userId);
    assert.equal(buckets.every((bucket) => bucket.plan_version_id === freePlan), true, 'the debit lands on the Free tier');
    assert.equal((await pool.query('SELECT 1 FROM memberships WHERE user_id = $1', [user.userId])).rowCount, 0);
  });

  await t.test('an expired paid period pays as Free', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    // A one-day offer bought three days ago: the row is still stored `active`, only
    // the clock has ended it, which is the whole mechanism the read path depends on.
    const lapsedPlan = await insertPlan({ termDays: 1, chatPerPeriod: 200, chatPerDay: 50 });
    const grant = await lifecycle.grantPeriod({
      userId: user.userId,
      planVersionId: lapsedPlan,
      source: 'grant',
      actorId: user.userId,
      reason: 'expired fixture for the coach quota test',
      verifiedAt: Date.now() - 3 * DAY,
    });
    assert.ok(grant.ok, JSON.stringify(grant));
    const response = await send({ message: SCRIPTED_QUESTION, lang: 'en' }, { token: user.token, browser: newBrowser() });
    assert.equal(response.status, 200, 'a lapsed plan loses its allowance, not its access');
    const buckets = await chatBuckets(user.userId);
    assert.equal(buckets.length, 2);
    assert.equal(
      buckets.every((bucket) => bucket.plan_version_id === freePlan),
      true,
      `the lapsed tier is never the one billed: ${JSON.stringify(buckets)}`,
    );
    assert.equal(
      buckets.some((bucket) => bucket.allowance === 30 || bucket.allowance === 20),
      true,
      'and the allowance read is the Free tier, not the 200 turns that were bought',
    );
  });

  await t.test('the same request key replays the stored answer and debits once', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    const conversationId = randomUUID();
    const requestKey = randomUUID();
    const body = { message: SCRIPTED_QUESTION, lang: 'en', conversationId, requestKey };
    const first = await send(body, { token: user.token, browser: newBrowser() });
    assert.equal(first.status, 200);
    const answered = await jsonOf(first);
    const requestId = String(answered.requestId);

    const again = await send(body, { token: user.token, browser: newBrowser() });
    assert.equal(again.status, 200);
    const replayed = await jsonOf(again);
    assert.equal(String(replayed.requestId), requestId, 'a replay is the same request, not a new one');
    assert.equal(replayed.answer, answered.answer);
    const rows = await requestRows(user.userId);
    assert.equal(rows.length, 1, 'the retry never reached the ledger twice');
    assert.equal(rows[0]?.status, 'completed');
    assert.deepEqual((await chatBuckets(user.userId)).map((bucket) => bucket.consumed).sort(), [1, 1]);
    assert.equal(await assistantMessageCount(user.userId), 2, 'no second copy of the answer was persisted');
  });

  await t.test('one key cannot carry two different questions', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    const requestKey = randomUUID();
    const first = await send({ message: SCRIPTED_QUESTION, lang: 'en', conversationId: randomUUID(), requestKey }, { token: user.token, browser: newBrowser() });
    assert.equal(first.status, 200);
    const second = await send({ message: SCRIPTED_QUESTION, lang: 'en', conversationId: randomUUID(), requestKey }, { token: user.token, browser: newBrowser() });
    assert.equal(second.status, 409);
    assert.equal((await jsonOf(second)).code, 'request_conflict');
    assert.equal((await requestRows(user.userId)).length, 1, 'a conflict never books a second turn');
  });

  await t.test('a provider failure with no answer gives the turn back', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    fetchMode = 'refuse';
    const response = await send({ message: MODEL_QUESTION, lang: 'en' }, { token: user.token, browser: newBrowser() });
    assert.ok(response.status >= 500, `expected a provider failure, got ${response.status}`);
    const body = await jsonOf(response);
    assert.equal(typeof body.requestId, 'string');
    const rows = await requestRows(user.userId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.status, 'released', 'the turn is refunded when the user got nothing');
    assert.ok(rows[0]?.error_code, 'and the ledger says why');
    assert.deepEqual((await chatBuckets(user.userId)).map((bucket) => bucket.consumed).sort(), [0, 0]);
    const { rows: attempts } = await pool.query('SELECT COUNT(*)::int AS n FROM usage_attempts WHERE request_id = $1', [rows[0]?.id]);
    assert.ok(Number(attempts[0]?.n ?? 0) >= 1, 'the provider attempt is still priced even though the turn was refunded');
  });

  await t.test('a client that disconnects mid-answer keeps the turn', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    fetchMode = 'hang';
    try {
      const controller = new AbortController();
      controllers.add(controller);
      const opened = await send({ message: MODEL_QUESTION, lang: 'en', stream: true }, { token: user.token, browser: newBrowser(), signal: controller.signal });
      // The SSE headers only arrive after the turn was dispatched, so the provider is
      // already engaged and already paid for by the time the user stops listening.
      assert.equal(opened.status, 200);
      assert.ok(String(opened.headers.get('content-type') ?? '').includes('text/event-stream'));
      controller.abort();
      const settled = await waitUntilSettled(user.userId);
      assert.equal(settled.status, 'completed', 'a turn that reached a provider is spent even if nobody watched it land');
      assert.deepEqual((await chatBuckets(user.userId)).map((bucket) => bucket.consumed).sort(), [1, 1]);
    } finally {
      fetchMode = 'refuse';
    }
  });

  await t.test('one in-flight turn per account, and the second is told to wait', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    const grant = await lifecycle.grantPeriod({
      userId: user.userId,
      planVersionId: plusPlan,
      source: 'grant',
      actorId: user.userId,
      reason: 'single in-flight fixture for the coach quota test',
      verifiedAt: Date.now(),
    });
    assert.ok(grant.ok, JSON.stringify(grant));
    fetchMode = 'hang';
    try {
      const controller = new AbortController();
      controllers.add(controller);
      const running = await send({ message: MODEL_QUESTION, lang: 'en', stream: true }, { token: user.token, browser: newBrowser(), signal: controller.signal });
      assert.equal(running.status, 200);
      await waitForDispatched(user.userId);

      const second = await send({ message: MODEL_QUESTION, lang: 'en' }, { token: user.token, browser: newBrowser() });
      assert.equal(second.status, 429);
      const denial = await jsonOf(second);
      assert.equal(denial.code, 'too_many_in_flight');
      assert.ok(second.headers.get('retry-after'), 'a wait has to say how long');
      assert.equal((await requestRows(user.userId)).length, 1, 'the refused request never reached the ledger');

      controller.abort();
      await waitUntilSettled(user.userId);
      const buckets = await chatBuckets(user.userId);
      assert.equal(buckets.length > 0 && buckets.every((bucket) => bucket.plan_version_id === plusPlan), true, 'a paid account pays on its own tier');
    } finally {
      fetchMode = 'refuse';
    }
  });

  await t.test('an unreadable membership is an outage that writes nothing', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    const neverSold = `never-activated-${randomUUID().slice(0, 8)}`;
    await insertPlan({ code: neverSold, status: 'draft', termDays: null, priceVnd: 0 });
    process.env.MEMBERSHIP_FREE_PLAN_CODE = neverSold;
    try {
      const response = await send({ message: SCRIPTED_QUESTION, lang: 'en' }, { token: user.token, browser: newBrowser() });
      assert.equal(response.status, 503);
      assert.equal((await jsonOf(response)).code, 'membership_unavailable');
      assert.equal((await requestRows(user.userId)).length, 0, 'an outage is not a free turn and not a booked one');
    } finally {
      process.env.MEMBERSHIP_FREE_PLAN_CODE = freeCode;
    }
  });

  await t.test('burst protection refuses before the ledger is touched', async () => {
    const user = await makeUser();
    cleanups.push(user.cleanup);
    process.env.ASSISTANT_RATE_LIMIT = '2';
    const browser = newBrowser();
    try {
      const answers: number[] = [];
      for (let turn = 0; turn < 3; turn += 1) {
        const response = await send({ message: `${SCRIPTED_QUESTION} #${turn}`, lang: 'en', conversationId: randomUUID() }, { token: user.token, browser });
        answers.push(response.status);
        if (answers.length === 3) assert.equal((await jsonOf(response)).code, 'rate_limited');
      }
      assert.deepEqual(answers, [200, 200, 429]);
      assert.equal((await requestRows(user.userId)).length, 2, 'the flood never became quota');
    } finally {
      process.env.ASSISTANT_RATE_LIMIT = '100';
    }
  });

  await t.test('history belongs to the account that wrote it', async () => {
    const author = await makeUser();
    const intruder = await makeUser();
    cleanups.push(author.cleanup, intruder.cleanup);
    const browser = newBrowser();
    const answered = await jsonOf(await send({ message: SCRIPTED_QUESTION, lang: 'en', conversationId: randomUUID() }, { token: author.token, browser }));
    const conversationId = String(answered.conversationId);

    assert.equal((await getJson('/api/assistant/conversations', { browser })).status, 401, 'listing history without a session is refused too');

    const stolen = await getJson(`/api/assistant/conversations/${conversationId}`, { token: intruder.token, browser });
    assert.equal(stolen.status, 200);
    assert.deepEqual(stolen.body.messages, [], 'the same browser cookie does not make the same owner');
    const list = await getJson('/api/assistant/conversations', { token: intruder.token, browser });
    const owned = (list.body.conversations ?? []) as { id: string }[];
    assert.equal(owned.some((row) => row.id === conversationId), false, 'and it does not appear in the intruder list');
    const deleted = await fetch(`${base}/api/assistant/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: { cookie: `mb_assistant=${browser}; mb_session=${intruder.token}` },
    });
    assert.equal(deleted.status, 404, 'nor can it be deleted by whoever holds the cookie');

    const mine = await getJson(`/api/assistant/conversations/${conversationId}`, { token: author.token, browser });
    assert.ok(Array.isArray(mine.body.messages) && mine.body.messages.length === 2, 'the owner still reads both messages');

    // Conversations written before sign-in are unclaimed, so the first account to
    // read them from this exact browser inherits them - and only that account.
    const guestBrowser = newBrowser();
    const guest = await conversations.getOrCreateConversation(undefined, guestBrowser, 'en', null);
    const claimer = await makeUser();
    cleanups.push(claimer.cleanup);
    const claimed = await getJson('/api/assistant/conversations', { token: claimer.token, browser: guestBrowser });
    const seen = (claimed.body.conversations ?? []) as { id: string }[];
    assert.equal(seen.some((row) => row.id === guest.id), true, 'a guest chat on the same browser is not lost at sign-in');
    const { rows } = await pool.query('SELECT user_id FROM assistant_conversations WHERE id = $1', [guest.id]);
    assert.equal(rows[0]?.user_id, claimer.userId, 'and it becomes that account history, not shared browser history');
  });
});
