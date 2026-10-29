import assert from 'node:assert/strict';
import { once } from 'node:events';
import test, { type TestContext } from 'node:test';
import express from 'express';
import { readTurnstileConfig, verifyTurnstile } from './turnstile.ts';

const SITE_KEY = 'public-site-key';
const SECRET_KEY = 'private-secret-key';
const TOKEN = 'private-response-token';
const WARNING = 'Turnstile verification unavailable; allowing request';
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// Local HTTP requests use the original fetch; verifier fetches are always mocked.
const httpFetch = globalThis.fetch;

function configure(t: TestContext, siteKey: string | undefined = SITE_KEY, secretKey: string | undefined = SECRET_KEY): void {
  const previous = process.env;
  const env = { ...previous };
  delete env.TURNSTILE_SITE_KEY;
  delete env.TURNSTILE_SECRET_KEY;
  if (siteKey !== undefined) env.TURNSTILE_SITE_KEY = siteKey;
  if (secretKey !== undefined) env.TURNSTILE_SECRET_KEY = secretKey;
  // mock.property requires Node 24; the API also supports Node 22.18.
  process.env = env;
  t.after(() => { process.env = previous; });
}

function noConfig(t: TestContext): void {
  configure(t, '', '');
  delete process.env.TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
}

function assertWarning(calls: { arguments: unknown[] }[]): void {
  assert.deepEqual(calls.map((call) => call.arguments), [[WARNING]]);
}

test('Turnstile configuration is disabled with neither key and verifier skips the network', async (t) => {
  noConfig(t);
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ success: false }));
  assert.equal(readTurnstileConfig(), null);
  assert.equal(await verifyTurnstile(undefined, undefined), true);
  assert.equal(await verifyTurnstile('x'.repeat(2049), '192.0.2.1'), true);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('Turnstile configuration trims both keys and treats blank keys as unset', (t) => {
  configure(t, ` ${SITE_KEY} `, ` ${SECRET_KEY}\n`);
  assert.deepEqual(readTurnstileConfig(), { siteKey: SITE_KEY, secretKey: SECRET_KEY });
  process.env.TURNSTILE_SITE_KEY = '  ';
  process.env.TURNSTILE_SECRET_KEY = '\n';
  assert.equal(readTurnstileConfig(), null);
});

for (const [name, siteKey, secretKey] of [
  ['site key only', SITE_KEY, ''],
  ['secret key only', '', SECRET_KEY],
  ['blank secret key', SITE_KEY, '  '],
  ['blank site key', '\n', SECRET_KEY],
] as const) {
  test(`Turnstile configuration rejects ${name}, including in the verifier`, async (t) => {
    configure(t, siteKey, secretKey);
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ success: true }));
    const warn = t.mock.method(console, 'warn', () => {});
    const expected = /TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must both be set or both be unset/;
    assert.throws(readTurnstileConfig, expected);
    await assert.rejects(verifyTurnstile(TOKEN, '192.0.2.1'), expected);
    assert.equal(fetchMock.mock.callCount(), 0);
    assert.equal(warn.mock.callCount(), 0, 'configuration errors must not become fail-open outages');
  });
}

for (const [name, token] of [
  ['missing', undefined],
  ['empty', ''],
  ['oversized', 'x'.repeat(2049)],
] as const) {
  test(`Turnstile rejects a ${name} token without fetching`, async (t) => {
    configure(t);
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ success: true }));
    const warn = t.mock.method(console, 'warn', () => {});
    assert.equal(await verifyTurnstile(token, '192.0.2.1'), false);
    assert.equal(fetchMock.mock.callCount(), 0);
    assert.equal(warn.mock.callCount(), 0);
  });
}

test('Turnstile posts form-encoded credentials and remoteip with a five-second timeout', async (t) => {
  configure(t);
  const signal = new AbortController().signal;
  const timeout = t.mock.method(AbortSignal, 'timeout', () => signal);
  const warn = t.mock.method(console, 'warn', () => {});
  const fetchMock = t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    assert.equal(input, VERIFY_URL);
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/x-www-form-urlencoded');
    assert.ok(init?.body instanceof URLSearchParams);
    assert.deepEqual(Object.fromEntries(init.body), { secret: SECRET_KEY, response: TOKEN, remoteip: '192.0.2.1' });
    assert.equal(init?.signal, signal);
    return Response.json({ success: true });
  });
  assert.equal(await verifyTurnstile(TOKEN, '192.0.2.1'), true);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(warn.mock.callCount(), 0, 'POST assertions must not be swallowed by fail-open');
  assert.deepEqual(timeout.mock.calls[0].arguments, [5000]);
});

test('Turnstile accepts the 2048-character boundary and omits unavailable remoteip', async (t) => {
  configure(t);
  const token = 'x'.repeat(2048);
  const warn = t.mock.method(console, 'warn', () => {});
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    assert.ok(init?.body instanceof URLSearchParams);
    assert.deepEqual(Object.fromEntries(init.body), { secret: SECRET_KEY, response: token });
    return Response.json({ success: true });
  });
  assert.equal(await verifyTurnstile(token, undefined), true);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(warn.mock.callCount(), 0, 'POST assertions must not be swallowed by fail-open');
});

for (const code of ['invalid-input-response', 'invalid-input-secret', 'timeout-or-duplicate']) {
  test(`Turnstile explicitly rejects ${code} instead of failing open`, async (t) => {
    configure(t);
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ success: false, 'error-codes': [code] }));
    const warn = t.mock.method(console, 'warn', () => {});
    assert.equal(await verifyTurnstile(TOKEN, '192.0.2.1'), false);
    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal(warn.mock.callCount(), 0);
  });
}

test('Turnstile timeout fails open with only the fixed warning', async (t) => {
  configure(t);
  const signal = AbortSignal.abort(new DOMException(`${SECRET_KEY} ${TOKEN}`, 'TimeoutError'));
  const timeout = t.mock.method(AbortSignal, 'timeout', () => signal);
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    throw init?.signal?.reason;
  });
  const warn = t.mock.method(console, 'warn', () => {});
  assert.equal(await verifyTurnstile(TOKEN, '192.0.2.1'), true);
  assert.deepEqual(timeout.mock.calls[0].arguments, [5000]);
  const [input, init] = fetchMock.mock.calls[0].arguments;
  assert.equal(input, VERIFY_URL);
  assert.equal(init?.signal, signal);
  assert.ok(signal.aborted);
  assertWarning(warn.mock.calls);
});

test('Turnstile network errors fail open without leaking tokens or secrets', async (t) => {
  configure(t);
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error(`${SECRET_KEY} ${TOKEN}`);
  });
  const warn = t.mock.method(console, 'warn', () => {});
  assert.equal(await verifyTurnstile(TOKEN, '192.0.2.1'), true);
  assertWarning(warn.mock.calls);
});

for (const status of [400, 403, 500, 503]) {
  test(`Turnstile HTTP ${status} fails open even if its body says success false`, async (t) => {
    configure(t);
    t.mock.method(globalThis, 'fetch', async () => Response.json({ success: false }, { status }));
    const warn = t.mock.method(console, 'warn', () => {});
    assert.equal(await verifyTurnstile(TOKEN, '192.0.2.1'), true);
    assertWarning(warn.mock.calls);
  });
}

for (const body of ['not JSON', 'null', '{}', '[]', '{"success":"false"}', '{"success":null}']) {
  test(`Turnstile malformed response ${body} fails open with the fixed warning`, async (t) => {
    configure(t);
    t.mock.method(globalThis, 'fetch', async () => new Response(body));
    const warn = t.mock.method(console, 'warn', () => {});
    assert.equal(await verifyTurnstile(TOKEN, '192.0.2.1'), true);
    assertWarning(warn.mock.calls);
  });
}

test('auth HTTP routes publish config without DB and gate only after the existing IP limiter', async (t) => {
  // No env file is loaded and every pool query is mocked before any HTTP traffic.
  const { pool } = await import('./db.ts');
  const { authRouter } = await import('./auth-routes.ts');
  const queries: string[] = [];
  t.mock.method(pool, 'query', async (sql: string) => {
    queries.push(sql.trim());
    return { rows: [], rowCount: 0 };
  });
  const accountQueries = () => queries.filter((sql) => !/^(CREATE|ALTER)\b/.test(sql));
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use('/api/auth', authRouter);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  let nextIp = 1;

  function post(path: string, token: string | undefined, ip = `192.0.2.${nextIp++}`): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Forwarded-For': ip };
    if (token !== undefined) headers['cf-turnstile-response'] = token;
    return httpFetch(`${origin}/api/auth/${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: 'person@example.com', password: 'valid-password' }),
    });
  }

  await t.test('GET off returns 204/no-store without any database or Cloudflare access', async (t) => {
    noConfig(t);
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ success: false }));
    const response = await httpFetch(`${origin}/api/auth/turnstile`);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(await response.text(), '');
    assert.deepEqual(queries, []);
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  await t.test('GET on publishes only the site key with no-store and no DB access', async (t) => {
    configure(t);
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ success: false }));
    const response = await httpFetch(`${origin}/api/auth/turnstile`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { site_key: SITE_KEY });
    assert.deepEqual(queries, []);
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  for (const route of ['register', 'login']) {
    for (const [name, token] of [['missing', undefined], ['oversized', 'x'.repeat(2049)], ['rejected', TOKEN]] as const) {
      await t.test(`${route}: ${name} challenge returns 403 before account lookup/write/session`, async (t) => {
        configure(t);
        const fetchMock = t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
          assert.equal(input, VERIFY_URL);
          assert.ok(init?.body instanceof URLSearchParams);
          assert.equal(init.body.get('response'), TOKEN);
          assert.match(init.body.get('remoteip') ?? '', /^192\.0\.2\./);
          return Response.json({ success: false, 'error-codes': ['invalid-input-secret'] });
        });
        const response = await post(route, token);
        assert.equal(response.status, 403);
        assert.equal((await response.json() as { code: string }).code, 'turnstile_rejected');
        assert.equal(response.headers.get('Set-Cookie'), null);
        // The unchanged router middleware may initialize schema; no account data
        // is read or changed and no password hashing/session creation is reached.
        assert.deepEqual(accountQueries(), []);
        assert.equal(fetchMock.mock.callCount(), name === 'rejected' ? 1 : 0);
      });
    }

    await t.test(`${route}: attempt eleven is rate-limited before external verification`, async (t) => {
      configure(t);
      const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ success: false }));
      const ip = `192.0.2.${nextIp++}`;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await post(route, TOKEN, ip);
        assert.equal(response.status, 403);
        await response.text();
      }
      const limited = await post(route, TOKEN, ip);
      assert.equal(limited.status, 429);
      assert.equal((await limited.json() as { code: string }).code, 'rate_limited');
      assert.equal(fetchMock.mock.callCount(), 10);
      assert.deepEqual(accountQueries(), []);
    });
  }

  await t.test('a successful challenge continues into the existing login behavior', async (t) => {
    configure(t);
    t.mock.method(globalThis, 'fetch', async () => Response.json({ success: true }));
    const response = await post('login', TOKEN);
    assert.equal(response.status, 401);
    assert.equal((await response.json() as { code: string }).code, 'invalid_credentials');
    assert.equal(accountQueries().length, 1);
    assert.match(accountQueries()[0], /^SELECT \* FROM users/);
  });

  await t.test('an outage still permits normal login processing, with only the fixed warning', async (t) => {
    configure(t);
    t.mock.method(globalThis, 'fetch', async () => { throw new Error(`${SECRET_KEY} ${TOKEN}`); });
    const warn = t.mock.method(console, 'warn', () => {});
    const response = await post('login', TOKEN);
    assert.equal(response.status, 401);
    assert.equal((await response.json() as { code: string }).code, 'invalid_credentials');
    assert.equal(accountQueries().length, 2);
    assertWarning(warn.mock.calls);
  });

  await t.test('disabled Turnstile permits login without a challenge or external fetch', async (t) => {
    noConfig(t);
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ success: false }));
    const response = await post('login', undefined);
    assert.equal(response.status, 401);
    await response.text();
    assert.equal(accountQueries().length, 3);
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  await t.test('resend-verification remains ungated when Turnstile is enabled', async (t) => {
    configure(t);
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ success: false }));
    const response = await post('resend-verification', undefined);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(accountQueries().length, 4);
    assert.equal(fetchMock.mock.callCount(), 0);
  });
});
