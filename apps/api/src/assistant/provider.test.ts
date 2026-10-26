import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeAssistantModel,
  activeAssistantProvider,
  geminiContents,
  generateAssistantAnswer,
  googleRequestBody,
  openaiRemoteConfig,
  openaiRequestBody,
  ProviderError,
  repairJsonText,
  sanitizeGeminiSchema,
  type ProviderChatMessage,
  type ProviderRequest,
  type ProviderTraceEvent,
} from './provider.ts';

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
  // The fake fetch below only settles when the deadline signal aborts. Inside a
  // real server a listening socket keeps the loop turning so that timer always
  // gets its chance; in a test process it does not, and Node can retire the
  // AbortSignal.timeout timer before it fires. Hold a ref'd timer so this runs
  // under the same condition the code ships into.
  const loopAlive = setInterval(() => {}, 5);
  globalThis.fetch = async (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError')), { once: true });
  });
  try {
    await assert.rejects(generateAssistantAnswer(request()), (error: unknown) => {
      return error instanceof ProviderError && error.code === 'timeout';
    });
  } finally {
    clearInterval(loopAlive);
    globalThis.fetch = originalFetch;
    delete process.env.ASSISTANT_REQUEST_TIMEOUT_MS;
    delete process.env.ASSISTANT_LOAD_TIMEOUT_MS;
  }
});

test('traces each provider attempt and retry', async () => {
  process.env.ASSISTANT_PROVIDER = 'ollama';
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return reply({ error: 'busy' }, 500);
    return reply({ message: { content: '{"answer":"ok"}' }, prompt_eval_count: 12, eval_count: 4 });
  };
  const events: ProviderTraceEvent[] = [];
  try {
    const result = await generateAssistantAnswer(mappedRequest({ trace: (event) => events.push(event) }));
    assert.equal(result.text, '{"answer":"ok"}');
    assert.deepEqual(
      events.map((event) => `${event.type}:${event.attempt}`),
      ['attempt:1', 'retry:1', 'attempt:2']
    );
    const retry = events[1];
    assert.equal(retry?.type === 'retry' ? retry.reason : '', 'http_500');
    assert.equal(retry?.model, activeAssistantModel());
  } finally {
    delete process.env.ASSISTANT_PROVIDER;
    globalThis.fetch = originalFetch;
  }
});

const TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    slug: { type: 'string', maxLength: 80 },
    limit: { type: 'integer', minimum: 1, maximum: 5 },
  },
  required: ['slug'],
};

function mappedRequest(overrides: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    system: 'system prompt',
    messages: [{ role: 'user', content: 'hello' }],
    maxOutputTokens: 800,
    signal: new AbortController().signal,
    ...overrides,
  };
}

test('provider selection reads ASSISTANT_PROVIDER with ollama fallback', () => {
  delete process.env.ASSISTANT_PROVIDER;
  assert.equal(activeAssistantProvider(), 'ollama');
  process.env.ASSISTANT_PROVIDER = 'google';
  assert.equal(activeAssistantProvider(), 'google');
  process.env.ASSISTANT_PROVIDER = 'OpenAI ';
  assert.equal(activeAssistantProvider(), 'openai');
  process.env.ASSISTANT_PROVIDER = 'claude';
  assert.equal(activeAssistantProvider(), 'ollama');
  delete process.env.ASSISTANT_PROVIDER;
});

test('google request maps chat messages onto Gemini contents', () => {
  const messages: ProviderChatMessage[] = [
    { role: 'user', content: 'win rate cua ahri' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ function: { name: 'get_stats', arguments: { name: 'Ahri', type: 'champion' } } }],
    },
    { role: 'tool', tool_name: 'get_stats', content: '{"status":"ok","data":{"winRate":0.52}}' },
  ];
  const body = googleRequestBody(
    mappedRequest({
      messages,
      tools: [{ type: 'function', function: { name: 'get_stats', description: 'stats', parameters: TOOL_SCHEMA } }],
    })
  );
  assert.deepEqual(body.systemInstruction, { parts: [{ text: 'system prompt' }] });
  const contents = body.contents as { role: string; parts: Record<string, unknown>[] }[];
  assert.deepEqual(contents[0], { role: 'user', parts: [{ text: 'win rate cua ahri' }] });
  assert.equal(contents[1].role, 'model');
  assert.deepEqual(contents[1].parts, [{ functionCall: { name: 'get_stats', args: { name: 'Ahri', type: 'champion' } } }]);
  assert.equal(contents[2].role, 'user');
  assert.deepEqual(contents[2].parts, [
    { functionResponse: { name: 'get_stats', response: { result: { status: 'ok', data: { winRate: 0.52 } } } } },
  ]);
  const declarations = (body.tools as { functionDeclarations: Record<string, unknown>[] }[])[0].functionDeclarations;
  assert.equal(declarations[0].name, 'get_stats');
  assert.ok(!JSON.stringify(declarations).includes('additionalProperties'));
  assert.ok(JSON.stringify(declarations).includes('maxLength'));
});

test('google JSON mime mode applies only without tools and 2.5 flash disables thinking', () => {
  delete process.env.GOOGLE_MODEL;
  const json = googleRequestBody(mappedRequest({ format: 'json' }));
  assert.equal((json.generationConfig as Record<string, unknown>).responseMimeType, 'application/json');
  assert.equal((json.generationConfig as Record<string, unknown>).thinkingConfig, undefined);

  process.env.GOOGLE_MODEL = 'gemini-2.5-flash';
  const flash25 = googleRequestBody(mappedRequest({ format: 'json' }));
  assert.deepEqual((flash25.generationConfig as Record<string, unknown>).thinkingConfig, { thinkingBudget: 0 });

  process.env.GOOGLE_MODEL = 'gemini-2.5-pro';
  const pro = googleRequestBody(mappedRequest({ format: 'json' }));
  assert.equal((pro.generationConfig as Record<string, unknown>).thinkingConfig, undefined);

  const withTools = googleRequestBody(
    mappedRequest({ format: 'json', tools: [{ type: 'function', function: { name: 't', description: 'd', parameters: TOOL_SCHEMA } }] })
  );
  assert.equal((withTools.generationConfig as Record<string, unknown>).responseMimeType, undefined);
  delete process.env.GOOGLE_MODEL;
});

test('geminiContents falls back to raw text for unparsable tool results', () => {
  const contents = geminiContents([{ role: 'tool', tool_name: 'find_comps', content: '{"status":"ok","data":trunc' }]);
  assert.deepEqual(contents, [
    { role: 'user', parts: [{ functionResponse: { name: 'find_comps', response: { result: '{"status":"ok","data":trunc' } } }] },
  ]);
});

test('sanitizeGeminiSchema keeps supported keys and strips the rest', () => {
  const clean = sanitizeGeminiSchema({
    type: 'object',
    additionalProperties: false,
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    properties: { tier: { type: 'string', enum: ['S', 'A'] }, tags: { type: 'array', items: { type: 'string', maxLength: 10 } } },
  });
  assert.deepEqual(clean, {
    type: 'object',
    properties: {
      tier: { type: 'string', enum: ['S', 'A'] },
      tags: { type: 'array', items: { type: 'string', maxLength: 10 } },
    },
  });
});

test('gemma request folds the system prompt into the first user turn without tools', () => {
  process.env.GOOGLE_MODEL = 'gemma-4-31b-it';
  const body = googleRequestBody(
    mappedRequest({
      format: 'json',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
        { role: 'user', content: 'win rate cua ahri?' },
      ],
      tools: [{ type: 'function', function: { name: 'get_stats', description: 'stats', parameters: TOOL_SCHEMA } }],
    })
  );
  assert.equal(body.systemInstruction, undefined);
  assert.equal(body.tools, undefined);
  const contents = body.contents as { role: string; parts: { text?: string }[] }[];
  assert.deepEqual(contents[0], { role: 'user', parts: [{ text: 'system prompt\n\n---\n\nhello' }] });
  assert.deepEqual(contents[1], { role: 'model', parts: [{ text: 'hi' }] });
  const generationConfig = body.generationConfig as Record<string, unknown>;
  assert.equal(generationConfig.responseMimeType, undefined);
  assert.equal(generationConfig.thinkingConfig, undefined);
  delete process.env.GOOGLE_MODEL;
});

test('openai config prefers explicit key, falls back to OpenRouter', () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
  assert.equal(openaiRemoteConfig(), null);
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  const or = openaiRemoteConfig();
  assert.equal(or?.openrouter, true);
  assert.equal(or?.base, 'https://openrouter.ai/api/v1');
  assert.equal(or?.model, 'google/gemma-4-31b-it:free');
  process.env.OPENROUTER_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';
  assert.equal(openaiRemoteConfig()?.model, 'nvidia/nemotron-3-super-120b-a12b:free');
  process.env.OPENAI_API_KEY = 'sk-test';
  const explicit = openaiRemoteConfig();
  assert.equal(explicit?.openrouter, false);
  assert.equal(explicit?.base, 'https://api.openai.com/v1');
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
});

test('repairJsonText fixes fences, trailing commas and unescaped inner quotes', () => {
  assert.equal(repairJsonText('{"answer":"ok"}'), '{"answer":"ok"}');
  assert.equal(
    repairJsonText('```json\n{"answer":"ok","sections":[],}\n```'),
    '{"answer":"ok","sections":[]}'
  );
  const repaired = JSON.parse(repairJsonText('{"answer":"co "8" diem","n":1}'));
  assert.equal(repaired.answer, 'co "8" diem');
  assert.equal(repaired.n, 1);
  // Unrecoverable syntax stays unchanged so the validator falls back.
  assert.equal(repairJsonText('{answer: missing quotes}'), '{answer: missing quotes}');
});

test('openai request stringifies tool arguments and assigns tool_call ids', () => {
  const body = openaiRequestBody(
    mappedRequest({
      format: 'json',
      messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: '', tool_calls: [{ function: { name: 'get_comp', arguments: { slug: 'ahri' } } }] },
        { role: 'tool', tool_name: 'get_comp', content: '{"status":"ok"}' },
      ],
      tools: [{ type: 'function', function: { name: 'get_comp', description: 'd', parameters: TOOL_SCHEMA } }],
    })
  );
  const messages = body.messages as {
    role: string;
    content?: unknown;
    tool_call_id?: string;
    tool_calls?: { id: string; function: { arguments: string } }[];
  }[];
  assert.deepEqual(messages[0], { role: 'system', content: 'system prompt' });
  assert.equal(messages[3].tool_call_id, messages[2].tool_calls?.[0].id);
  assert.equal(messages[2].tool_calls?.[0].function.arguments, '{"slug":"ahri"}');
  assert.deepEqual(body.tools, [{ type: 'function', function: { name: 'get_comp', description: 'd', parameters: TOOL_SCHEMA } }]);
  assert.equal(body.response_format, undefined);
});
