import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAssistantAnswer, ProviderError } from './provider.ts';

const originalFetch = globalThis.fetch;

function request(signal = new AbortController().signal) {
  return { system: 'system', messages: [{ role: 'user' as const, content: 'hello' }], maxOutputTokens: 20, signal };
}

function reply(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

test('parses native tool calls and malformed arguments', async () => {
  globalThis.fetch = async () =>
    reply({
      message: {
        content: '',
        tool_calls: [
          { id: 'call-1', function: { name: 'find_comps', arguments: '{"tier":"S"}' } },
          { function: { name: 'get_comp', arguments: '{bad' } },
        ],
      },
    });
  try {
    const result = await generateAssistantAnswer(request());
    assert.equal(result.toolCalls[0]?.id, 'call-1');
    assert.deepEqual(result.toolCalls[0]?.arguments, { tier: 'S' });
    assert.equal(result.toolCalls[1]?.argumentError, 'Tool arguments are not valid JSON.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reports client cancellation as aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.signal?.aborted, true);
    throw new DOMException('aborted', 'AbortError');
  };
  try {
    await assert.rejects(generateAssistantAnswer(request(controller.signal)), (error: unknown) => {
      return error instanceof ProviderError && error.code === 'aborted';
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reports request deadline as timeout', async () => {
  process.env.ASSISTANT_REQUEST_TIMEOUT_MS = '20';
  process.env.ASSISTANT_LOAD_TIMEOUT_MS = '20';
  globalThis.fetch = async (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError')), { once: true });
  });
  try {
    await assert.rejects(generateAssistantAnswer(request()), (error: unknown) => {
      return error instanceof ProviderError && error.code === 'timeout';
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.ASSISTANT_REQUEST_TIMEOUT_MS;
    delete process.env.ASSISTANT_LOAD_TIMEOUT_MS;
  }
});
