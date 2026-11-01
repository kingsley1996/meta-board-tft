import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { flushRevalidate, notifyRevalidate } from './revalidate.ts';

const TOKEN = 'revalidate-token';
const configure = (t: TestContext, origin: string | undefined, secret: string | undefined): void => {
  const previous = process.env;
  const env = { ...previous };
  delete env.AUTH_WEB_ORIGIN;
  delete env.WEB_REVALIDATE_TOKEN;
  if (origin !== undefined) env.AUTH_WEB_ORIGIN = origin;
  if (secret !== undefined) env.WEB_REVALIDATE_TOKEN = secret;
  process.env = env;
  // Nothing may be left queued for the next test.
  t.after(async () => {
    process.env = previous;
    await flushRevalidate();
  });
};

test('a host without the token never reaches the network', async (t) => {
  configure(t, 'https://tftiq.com', undefined);
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true }));
  notifyRevalidate('comps');
  assert.deepEqual(await flushRevalidate(), []);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('one flush sends each changed kind once, to the web origin', async (t) => {
  configure(t, 'https://www.tftiq.com/', TOKEN);
  const calls: { url: string; init: RequestInit }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Response.json({ ok: true, kind: JSON.parse(String(init.body)).kind });
  });
  notifyRevalidate('comps');
  notifyRevalidate('comps');
  notifyRevalidate('guides');
  assert.deepEqual(await flushRevalidate(), ['comps', 'guides']);
  assert.deepEqual(
    calls.map((call) => [call.url, JSON.parse(String(call.init.body))]),
    [
      ['https://www.tftiq.com/api/revalidate', { kind: 'comps' }],
      ['https://www.tftiq.com/api/revalidate', { kind: 'guides' }],
    ]
  );
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers['x-revalidate-token'], TOKEN);
});

test('the queue is empty after a flush', async (t) => {
  configure(t, 'https://www.tftiq.com', TOKEN);
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true }));
  notifyRevalidate('comps');
  await flushRevalidate();
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.deepEqual(await flushRevalidate(), []);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('a refused or unreachable web app is a warning, never a failed write', async (t) => {
  configure(t, 'https://www.tftiq.com', TOKEN);
  const warn = t.mock.method(console, 'warn', () => undefined);
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 503 }));
  notifyRevalidate('comps');
  assert.deepEqual(await flushRevalidate(), []);

  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch failed');
  });
  notifyRevalidate('guides');
  assert.deepEqual(await flushRevalidate(), []);
  assert.equal(warn.mock.callCount(), 2);
});
