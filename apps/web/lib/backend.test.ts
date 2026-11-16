import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { backendJson, storeConfigured, storeFault } from './backend.ts';

// The build must survive an environment with no store to read (CI, a preview
// build, a fresh clone) without turning a configured-but-down API into a silent
// empty page. Both halves are the contract.
const originalUrl = process.env.BACKEND_URL;
const originalFetch = globalThis.fetch;

function restoreUrl() {
  if (originalUrl === undefined) delete process.env.BACKEND_URL;
  else process.env.BACKEND_URL = originalUrl;
}

describe('storeConfigured', () => {
  afterEach(restoreUrl);

  it('is false only when BACKEND_URL is absent', () => {
    delete process.env.BACKEND_URL;
    assert.equal(storeConfigured(), false);
    process.env.BACKEND_URL = 'http://127.0.0.1:4000';
    assert.equal(storeConfigured(), true);
  });
});

describe('storeFault', () => {
  afterEach(restoreUrl);

  it('throws where a silent store is a fault', () => {
    process.env.BACKEND_URL = 'http://127.0.0.1:4000';
    assert.throws(() => storeFault('backend is unreachable'), /backend is unreachable/);
  });

  it('stays quiet where the store was never configured', () => {
    delete process.env.BACKEND_URL;
    assert.doesNotThrow(() => storeFault('backend is unreachable'));
  });
});

describe('backendJson', () => {
  let calls = 0;

  beforeEach(() => {
    calls = 0;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreUrl();
  });

  it('returns null without touching the network when no store is configured', async () => {
    delete process.env.BACKEND_URL;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error('must not be reached');
    }) as typeof fetch;
    assert.equal(await backendJson('/api/comps', { revalidate: 86_400 }), null);
    assert.equal(calls, 0);
  });

  it('still reads the store once it is configured', async () => {
    process.env.BACKEND_URL = 'http://127.0.0.1:4000';
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ comps: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const data = await backendJson<{ comps: unknown[] }>('/api/comps');
    assert.deepEqual(data?.comps, []);
    assert.equal(calls, 1);
  });
});
