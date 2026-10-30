import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { PaymentProviderError } from './payments/provider.ts';
import type { CheckoutRequest, LookupRequest, PaymentErrorCode, WebhookRequest } from './payments/provider.ts';
import { SePayProvider } from './payments/sepay.ts';
import type { SePayConfig } from './payments/sepay.ts';

const NOW = Date.parse('2026-10-10T03:00:00.000Z');
const API_KEY = 'synthetic-api-key-never-log';
const WEBHOOK_SECRET = 'synthetic-webhook-secret-never-log';
const BANK_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '00123456789';
const REFERENCE = 'TFTABC123';
const REQUEST: LookupRequest = {
  orderCode: 123,
  reference: REFERENCE,
  amountVnd: 100_000,
  createdAt: '2026-10-10T02:00:00Z',
  expiresAt: '2026-10-10T04:00:00Z',
  externalId: null,
};
const CHECKOUT: CheckoutRequest = { ...REQUEST, returnUrl: 'https://example.invalid/return', cancelUrl: 'https://example.invalid/cancel' };

function config(overrides: Partial<SePayConfig> = {}): SePayConfig {
  return {
    accountId: 'synthetic-sepay-account',
    apiKey: API_KEY,
    webhookSecret: WEBHOOK_SECRET,
    bankAccountId: BANK_ID,
    bankAccountNumber: ACCOUNT,
    bankCode: 'MB',
    bankName: 'MBBank',
    fetch: async () => { throw new Error('Unexpected fetch: tests must never call hosted APIs'); },
    clock: () => NOW,
    ...overrides,
  };
}

function webhook(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 7654321,
    gateway: 'MBBank',
    transactionDate: '2026-10-10 10:00:00',
    accountNumber: ACCOUNT,
    code: null,
    content: `payment ${REFERENCE} thanks`,
    transferType: 'in',
    transferAmount: 100_000,
    referenceCode: 'BANK-REFERENCE-001',
    ...overrides,
  };
}

function signed(value: Record<string, unknown> | Buffer = webhook(), timestamp = String(NOW / 1000)): WebhookRequest {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
  const digest = createHmac('sha256', WEBHOOK_SECRET).update(`${timestamp}.`).update(body).digest('hex');
  return { body, headers: new Headers({ 'X-SePay-Timestamp': timestamp, 'X-SePay-Signature': `sha256=${digest}` }) };
}

function row(index = 1, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
    bank_account_id: BANK_ID,
    account_number: ACCOUNT,
    amount_in: 100_000,
    amount_out: 0,
    transaction_date: '2026-10-10T10:00:00+07:00',
    transaction_content: `payment ${REFERENCE} thanks`,
    reference_number: 'BANK-REFERENCE-001',
    code: null,
    ...overrides,
  };
}

function envelope(data: Record<string, unknown>[], page = 1, perPage = 100, total = data.length): Record<string, unknown> {
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  return { status: 'success', data, meta: { pagination: { total, per_page: perPage, current_page: page, last_page: lastPage, has_more: page < lastPage } } };
}

function queued(values: (Record<string, unknown> | Response | Error)[]) {
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    calls.push({ url: new URL(String(input)), init });
    const next = values[calls.length - 1];
    if (!next) throw new Error('Unexpected extra fetch');
    if (next instanceof Error) throw next;
    return next instanceof Response ? next : Response.json(next);
  };
  return { calls, fetcher, provider: new SePayProvider(config({ fetch: fetcher })) };
}

function errorCode(code: PaymentErrorCode): (error: unknown) => boolean {
  return error => {
    assert.ok(error instanceof PaymentProviderError);
    assert.equal(error.code, code);
    assert.equal(error.message, `payment_${code}`);
    assert.equal(error.name, 'PaymentProviderError');
    assert.equal(error.cause, undefined);
    const visible = `${error.stack}\n${JSON.stringify(error)}`;
    assert.ok(!visible.includes(API_KEY));
    assert.ok(!visible.includes(WEBHOOK_SECRET));
    return true;
  };
}

async function lookupRows(rows: Record<string, unknown>[], overrides: Partial<SePayConfig> = {}, request = REQUEST) {
  const network = queued([envelope(rows)]);
  return new SePayProvider(config({ fetch: network.fetcher, ...overrides })).lookup(request);
}

test('binding and capabilities are frozen snapshots and checkout is local bank QR only', async () => {
  const network = queued([]);
  const initial = config({ fetch: network.fetcher, bankAccountNumber: '001 23&45+6', bankCode: 'M&B /VN' });
  const provider = new SePayProvider(initial);
  initial.accountId = 'changed';
  initial.bankAccountNumber = 'changed';
  assert.deepEqual(provider.binding, { provider: 'sepay', accountId: 'synthetic-sepay-account' });
  assert.deepEqual(provider.capabilities, { checkout: 'bank_qr', remoteCancellation: false, automatedRefund: false });
  assert.ok(Object.isFrozen(provider.binding));
  assert.ok(Object.isFrozen(provider.capabilities));
  assert.throws(() => { (provider.binding as { accountId: string }).accountId = 'changed'; }, TypeError);
  const result = await provider.createCheckout(CHECKOUT);
  assert.equal(result.binding, provider.binding);
  assert.equal(result.kind, 'bank_qr');
  assert.equal(result.externalId, null);
  assert.equal(result.checkoutUrl, null);
  assert.equal(result.qrCode, null);
  assert.equal(result.qrImageUrl, 'https://vietqr.app/img?acc=001+23%2645%2B6&bank=M%26B+%2FVN&amount=100000&des=TFTABC123');
  assert.equal(network.calls.length, 0);
});

for (const [name, override] of [
  ['zero order code', { orderCode: 0 }],
  ['fractional order code', { orderCode: 1.2 }],
  ['zero amount', { amountVnd: 0 }],
  ['fractional amount', { amountVnd: 1.5 }],
  ['unsafe amount', { amountVnd: Number.MAX_SAFE_INTEGER + 1 }],
  ['bad reference', { reference: 'prefix bad' }],
  ['numeric reference', { reference: 123456 }],
  ['bad created date', { createdAt: 'not-a-date' }],
  ['invalid expiry', { expiresAt: REQUEST.createdAt }],
] as const) {
  test(`checkout and lookup validate ${name} without fetching`, async () => {
    const network = queued([]);
    const request = { ...CHECKOUT, ...override } as CheckoutRequest;
    await assert.rejects(network.provider.createCheckout(request), errorCode('invalid_input'));
    await assert.rejects(network.provider.lookup({ ...request, externalId: null }), errorCode('invalid_input'));
    assert.equal(network.calls.length, 0);
  });
}

for (const key of ['accountId', 'apiKey', 'webhookSecret', 'bankAccountId', 'bankAccountNumber', 'bankCode', 'bankName'] as const) {
  test(`constructor rejects empty ${key} with fixed configuration error`, () => {
    assert.throws(() => new SePayProvider(config({ [key]: '' })), errorCode('configuration'));
  });
}

test('webhook verifies raw UTF-8 bytes, VN date, bank case, stable numeric ID and content reference', async () => {
  const provider = new SePayProvider(config());
  const body = Buffer.from(JSON.stringify(webhook({ gateway: 'mbBANK', content: `thanh toán ${REFERENCE}` }), null, 2));
  const request = signed(body);
  const result = await provider.verifyWebhook(request);
  assert.equal(result.binding, provider.binding);
  assert.equal(result.eventId, '7654321');
  assert.deepEqual(result.receipts, [{
    providerTransactionId: '7654321', transactionReference: 'BANK-REFERENCE-001', externalId: null,
    orderCode: null, orderReference: REFERENCE, amountVnd: 100_000, currency: 'VND', occurredAt: '2026-10-10T03:00:00.000Z',
  }]);
  assert.deepEqual(await provider.verifyWebhook(request), result);
  await assert.rejects(provider.verifyWebhook({ ...request, body: Buffer.from(body.toString().replace('100000', '100001')) }), errorCode('invalid_webhook'));
  await assert.rejects(provider.verifyWebhook({ ...request, body: Buffer.from(JSON.stringify(JSON.parse(body.toString()))) }), errorCode('invalid_webhook'));
});

test('empty optional references and lowercase bank memos normalize without inventing transaction identity', async () => {
  const provider = new SePayProvider(config());
  const result = await provider.verifyWebhook(signed(webhook({ code: '', referenceCode: '', content: `PAYMENT ${REFERENCE.toLowerCase()} THANKS` })));
  assert.equal(result.receipts[0]!.orderReference, REFERENCE);
  assert.equal(result.receipts[0]!.transactionReference, null);
  const emptyMemo = await provider.verifyWebhook(signed(webhook({ code: '', content: '' })));
  assert.equal(emptyMemo.receipts[0]!.orderReference, null);
  const lookup = await lookupRows([row(1, { code: '', reference_number: '', transaction_content: `payment ${REFERENCE.toLowerCase()}` })]);
  assert.equal(lookup.status, 'review');
  assert.equal(lookup.receipts[0]!.transactionReference, null);
});

test('ambiguous bank memos cannot fulfill either referenced order automatically', async () => {
  const result = await lookupRows([row(1, { transaction_content: `${REFERENCE} OTHER123`, code: null })]);
  assert.equal(result.status, 'review');
  assert.equal(result.receipts[0]!.orderCode, null);
  assert.equal(result.receipts[0]!.orderReference, null);
});

test('webhook code is optional, bank reference null is not replaced with webhook ID, ambiguous content remains unbound', async () => {
  const provider = new SePayProvider(config());
  const missing = await provider.verifyWebhook(signed(webhook({ referenceCode: null })));
  assert.equal(missing.receipts[0]!.transactionReference, null);
  assert.equal(missing.receipts[0]!.orderReference, REFERENCE);
  const withCode = await provider.verifyWebhook(signed(webhook({ code: REFERENCE, content: 'ordinary transfer' })));
  assert.equal(withCode.receipts[0]!.orderReference, REFERENCE);
  const ambiguous = await provider.verifyWebhook(signed(webhook({ content: `${REFERENCE} OTHER123` })));
  assert.equal(ambiguous.receipts[0]!.orderReference, null);
});

test('valid outgoing webhook authenticates but produces no receipts', async () => {
  const result = await new SePayProvider(config()).verifyWebhook(signed(webhook({ transferType: 'out' })));
  assert.equal(result.eventId, '7654321');
  assert.deepEqual(result.receipts, []);
});

for (const [name, timestamp] of [
  ['stale', String(NOW / 1000 - 301)],
  ['future', String(NOW / 1000 + 301)],
  ['empty', ''],
  ['fractional', `${NOW / 1000}.5`],
  ['negative', '-1'],
  ['non-numeric', 'yesterday'],
  ['scientific', '1e9'],
  ['unsafe', '9007199254740993'],
  ['duplicate', `${NOW / 1000}, ${NOW / 1000}`],
] as const) {
  test(`webhook rejects ${name} timestamp`, async () => {
    await assert.rejects(new SePayProvider(config()).verifyWebhook(signed(webhook(), timestamp)), errorCode('invalid_webhook'));
  });
}

test('webhook accepts exact freshness boundaries and rejects a missing timestamp', async () => {
  const provider = new SePayProvider(config());
  for (const offset of [-300, 300]) await provider.verifyWebhook(signed(webhook(), String(NOW / 1000 + offset)));
  const request = signed();
  request.headers.delete('X-SePay-Timestamp');
  await assert.rejects(provider.verifyWebhook(request), errorCode('invalid_webhook'));
});

for (const signature of ['', 'sha256=', 'sha256=xyz', 'sha256=' + 'a'.repeat(63), 'sha256=' + 'a'.repeat(65), 'sha1=' + 'a'.repeat(64), 'SHA256=' + 'a'.repeat(64), 'sha256=' + '0'.repeat(64)]) {
  test(`webhook rejects malformed or incorrect signature ${signature.length}`, async () => {
    const request = signed();
    request.headers.set('X-SePay-Signature', signature);
    await assert.rejects(new SePayProvider(config()).verifyWebhook(request), errorCode('invalid_webhook'));
  });
}

test('webhook rejects missing or duplicated authentication headers', async () => {
  for (const header of ['X-SePay-Signature', 'X-SePay-Timestamp']) {
    const request = signed();
    request.headers.append(header, request.headers.get(header)!);
    await assert.rejects(new SePayProvider(config()).verifyWebhook(request), errorCode('invalid_webhook'));
    request.headers.delete(header);
    await assert.rejects(new SePayProvider(config()).verifyWebhook(request), errorCode('invalid_webhook'));
  }
});

for (const [name, overrides] of [
  ['noninteger amount', { transferAmount: 100.5 }],
  ['string amount', { transferAmount: '100000' }],
  ['zero amount', { transferAmount: 0 }],
  ['unsafe amount', { transferAmount: Number.MAX_SAFE_INTEGER + 1 }],
  ['non-VND currency', { currency: 'USD' }],
  ['null currency', { currency: null }],
  ['account mismatch', { accountNumber: 'another-account' }],
  ['gateway mismatch', { gateway: 'AnotherBank' }],
  ['gateway substring', { gateway: 'MBBank branch' }],
  ['gateway whitespace', { gateway: ' MBBank' }],
  ['noninteger transaction ID', { id: 12.5 }],
  ['string transaction ID', { id: '7654321' }],
  ['zero transaction ID', { id: 0 }],
  ['unknown direction', { transferType: 'incoming' }],
  ['invalid transaction date', { transactionDate: 'yesterday' }],
  ['invalid content', { content: {} }],
  ['invalid code', { code: 123 }],
  ['invalid bank reference', { referenceCode: 123 }],
] as const) {
  test(`webhook rejects ${name}`, async () => {
    await assert.rejects(new SePayProvider(config()).verifyWebhook(signed(webhook(overrides))), errorCode('invalid_webhook'));
  });
}

for (const [name, body] of [
  ['malformed JSON', Buffer.from('{bad JSON')],
  ['JSON array', Buffer.from('[]')],
  ['JSON null', Buffer.from('null')],
  ['empty body', Buffer.alloc(0)],
  ['oversized body', Buffer.alloc(65_537, 32)],
] as const) {
  test(`webhook rejects signed ${name}`, async () => {
    await assert.rejects(new SePayProvider(config()).verifyWebhook(signed(body)), errorCode('invalid_webhook'));
  });
}

test('webhook raw body limit permits 64KB and ignores non-status webhook_success', async () => {
  const provider = new SePayProvider(config());
  const json = Buffer.from(JSON.stringify(webhook({ webhook_success: false })));
  const padded = Buffer.concat([json, Buffer.alloc(65_536 - json.length, 32)]);
  assert.equal((await provider.verifyWebhook(signed(padded))).receipts.length, 1);
});

test('lookup retrieves a matching later page, authenticates and scopes every request, never clips late payments', async () => {
  const network = queued([
    envelope([row(1, { transaction_content: `${REFERENCE}X`, code: `${REFERENCE}X` })], 1, 1, 2),
    envelope([row(2, { transaction_date: '2026-10-10T15:00:00+07:00', webhook_success: false })], 2, 1, 2),
  ]);
  const result = await network.provider.lookup(REQUEST);
  assert.equal(result.status, 'paid');
  assert.equal(result.receipts.length, 1);
  assert.equal(result.receipts[0]!.providerTransactionId, row(2).id);
  assert.equal(result.receipts[0]!.transactionReference, 'BANK-REFERENCE-001');
  assert.equal(result.receipts[0]!.orderCode, REQUEST.orderCode);
  assert.equal(result.receipts[0]!.occurredAt, '2026-10-10T08:00:00.000Z');
  assert.equal(network.calls.length, 2);
  for (const [index, call] of network.calls.entries()) {
    assert.equal(call.url.origin + call.url.pathname, 'https://userapi.sepay.vn/v2/transactions');
    assert.deepEqual(Object.fromEntries(call.url.searchParams), {
      transaction_content: REFERENCE, bank_account_id: BANK_ID, transfer_type: 'in', page: String(index + 1),
      per_page: '100', timestamp_format: 'iso8601', transaction_date_from: '2026-10-10 09:00:00',
    });
    assert.equal(call.url.searchParams.has('transaction_date_to'), false);
    assert.equal(call.init?.method, 'GET');
    assert.equal(new Headers(call.init?.headers).get('Authorization'), `Bearer ${API_KEY}`);
    assert.equal(call.init?.redirect, 'error');
    assert.ok(call.init?.signal instanceof AbortSignal);
  }
});

test('lookup aggregates all pages rather than stopping at a paid first page', async () => {
  const network = queued([envelope([row(1)], 1, 1, 2), envelope([row(2, { amount_in: 1 })], 2, 1, 2)]);
  const result = await network.provider.lookup(REQUEST);
  assert.equal(result.status, 'review');
  assert.equal(result.receipts.length, 2);
  assert.equal(network.calls.length, 2);
});

test('lookup matches exact code or standalone reference, not reference prefix/suffix collisions', async () => {
  const result = await lookupRows([
    row(1, { transaction_content: `${REFERENCE}X`, code: `${REFERENCE}X` }),
    row(2, { transaction_content: `X${REFERENCE}`, code: null }),
    row(3, { transaction_content: `abc${REFERENCE}def`, code: null }),
    row(4, { transaction_content: 'unrelated', code: REFERENCE, amount_in: 40_000 }),
    row(5, { transaction_content: `memo (${REFERENCE}) thanks`, code: 'OTHER123', amount_in: 60_000 }),
    row(6, { amount_in: 0, amount_out: 100_000, transfer_type: 'out' }),
  ]);
  assert.equal(result.status, 'review');
  assert.deepEqual(result.receipts.map(receipt => receipt.providerTransactionId), [row(4).id, row(5).id]);
  assert.equal(result.receipts[1]!.orderReference, null);
});

for (const [name, amounts, expected] of [
  ['no receipts', [], 'pending'],
  ['partial payment', [30_000, 20_000], 'underpaid'],
  ['exact payment', [40_000, 60_000], 'paid'],
  ['overpayment', [100_001], 'review'],
] as const) {
  test(`lookup reports ${name}`, async () => {
    const result = await lookupRows(amounts.map((amount, index) => row(index + 1, { amount_in: amount })));
    assert.equal(result.status, expected);
    assert.equal(result.receipts.length, amounts.length);
  });
}

test('lookup expiry uses clock at boundary but late partial and full payments remain visible', async () => {
  const clock = () => Date.parse(REQUEST.expiresAt);
  assert.equal((await lookupRows([], { clock })).status, 'expired');
  assert.equal((await lookupRows([], { clock: () => Date.parse(REQUEST.expiresAt) - 1 })).status, 'pending');
  assert.equal((await lookupRows([row(1, { amount_in: 1 })], { clock })).status, 'underpaid');
  assert.equal((await lookupRows([row(1)], { clock })).status, 'paid');
});

test('lookup preserves missing bank reference and returns review, never substitutes the REST UUID', async () => {
  for (const amount of [1, 100_000]) {
    const result = await lookupRows([row(1, { reference_number: null, amount_in: amount })]);
    assert.equal(result.status, 'review');
    assert.equal(result.receipts[0]!.transactionReference, null);
    assert.equal(result.receipts[0]!.providerTransactionId, row().id);
    assert.notEqual(result.receipts[0]!.providerTransactionId, '7654321');
  }
});

for (const [name, overrides] of [
  ['wrong bank account UUID', { bank_account_id: '33333333-3333-4333-8333-333333333333' }],
  ['wrong account number', { account_number: 'other-account' }],
  ['numeric REST ID', { id: 7654321 }],
  ['non-UUID REST ID', { id: 'not-a-uuid' }],
  ['fractional amount', { amount_in: 1.5 }],
  ['string amount', { amount_in: '100000' }],
  ['negative outgoing amount', { amount_out: -1 }],
  ['ambiguous direction', { amount_out: 1 }],
  ['empty amount', { amount_in: 0 }],
  ['inconsistent direction', { transfer_type: 'out' }],
  ['non-VND currency', { currency: 'USD' }],
  ['invalid date', { transaction_date: 'invalid' }],
  ['invalid bank reference', { reference_number: {} }],
] as const) {
  test(`lookup rejects ${name} rather than returning a payment status`, async () => {
    await assert.rejects(lookupRows([row(1, overrides)]), errorCode('invalid_response'));
  });
}

for (const [name, overrides] of [
  ['missing total', { total: undefined }],
  ['wrong current page', { current_page: 2 }],
  ['fractional page', { current_page: 1.5 }],
  ['per page exceeds cap', { per_page: 101 }],
  ['zero per page', { per_page: 0 }],
  ['bad last page', { last_page: 2 }],
  ['string has_more', { has_more: 'false' }],
  ['inconsistent has_more', { has_more: true }],
  ['incomplete data', { total: 2 }],
  ['pagination overflows ten pages', { total: 11, per_page: 1, last_page: 11, has_more: true }],
] as const) {
  test(`lookup rejects pagination ${name}`, async () => {
    const value = envelope([row()]);
    const meta = value.meta as { pagination: Record<string, unknown> };
    Object.assign(meta.pagination, overrides);
    const network = queued([value]);
    await assert.rejects(network.provider.lookup(REQUEST), errorCode('invalid_response'));
    assert.equal(network.calls.length, 1);
  });
}

test('lookup allows ten complete pages, rejects metadata drift and duplicated transactions', async () => {
  const complete = queued(Array.from({ length: 10 }, (_, index) => envelope([row(index + 1, { amount_in: 10_000 })], index + 1, 1, 10)));
  assert.equal((await complete.provider.lookup(REQUEST)).status, 'paid');
  assert.equal(complete.calls.length, 10);
  const drift = queued([envelope([row(1)], 1, 1, 2), envelope([row(2)], 2, 1, 3)]);
  await assert.rejects(drift.provider.lookup(REQUEST), errorCode('invalid_response'));
  const duplicates = queued([envelope([row(1)], 1, 1, 2), envelope([row(1)], 2, 1, 2)]);
  await assert.rejects(duplicates.provider.lookup(REQUEST), errorCode('invalid_response'));
});

for (const value of [
  { status: 'error', message: API_KEY },
  { status: 'paid', data: [], meta: {} },
  { status: 'success', data: {}, meta: {} },
  { status: 'success', data: [] },
  { status: 'success', data: [], meta: { pagination: null } },
]) {
  test('lookup rejects malformed envelopes and never treats other fields as status', async () => {
    await assert.rejects(queued([value]).provider.lookup(REQUEST), errorCode('invalid_response'));
  });
}

test('HTTP 429, 500, 401 and network errors are fixed unavailable errors with no retries or secret logs', async t => {
  const logs = [t.mock.method(console, 'error', () => {}), t.mock.method(console, 'warn', () => {}), t.mock.method(console, 'log', () => {})];
  for (const value of [
    new Response(`${API_KEY} ${WEBHOOK_SECRET}`, { status: 429 }),
    new Response(`${API_KEY} ${WEBHOOK_SECRET}`, { status: 500 }),
    new Response(`${API_KEY} ${WEBHOOK_SECRET}`, { status: 401 }),
    new Error(`network ${API_KEY} ${WEBHOOK_SECRET}`),
  ]) {
    const network = queued([value]);
    await assert.rejects(network.provider.lookup(REQUEST), errorCode('unavailable'));
    assert.equal(network.calls.length, 1);
  }
  for (const log of logs) assert.equal(log.mock.callCount(), 0);
});

test('malformed JSON and failure on later page fail closed rather than returning partial status', async () => {
  await assert.rejects(queued([new Response(`bad ${API_KEY}`)]).provider.lookup(REQUEST), errorCode('invalid_response'));
  const network = queued([envelope([row(1)], 1, 1, 2), new Response(WEBHOOK_SECRET, { status: 429 })]);
  await assert.rejects(network.provider.lookup(REQUEST), errorCode('unavailable'));
  assert.equal(network.calls.length, 2);
});

test('lookup total overflow is invalid_response', async () => {
  await assert.rejects(lookupRows([row(1, { amount_in: Number.MAX_SAFE_INTEGER }), row(2, { amount_in: 1 })]), errorCode('invalid_response'));
});

test('lookup honors caller abort before fetching and during a hung fetch without leaking reason', async () => {
  const before = new AbortController();
  before.abort(new Error(API_KEY));
  const unused = queued([]);
  await assert.rejects(unused.provider.lookup(REQUEST, before.signal), errorCode('aborted'));
  await assert.rejects(unused.provider.createCheckout(CHECKOUT, before.signal), errorCode('aborted'));
  assert.equal(unused.calls.length, 0);
  let fetchSignal: AbortSignal | null | undefined;
  const provider = new SePayProvider(config({ fetch: async (_input, init) => {
    fetchSignal = init?.signal;
    return new Promise<Response>(() => {});
  } }));
  const controller = new AbortController();
  const pending = provider.lookup(REQUEST, controller.signal);
  controller.abort(new Error(WEBHOOK_SECRET));
  await assert.rejects(pending, errorCode('aborted'));
  assert.equal(fetchSignal?.aborted, true);
});

test('lookup has a ten-second total timeout even if fetch ignores AbortSignal', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let fetchSignal: AbortSignal | null | undefined;
  const provider = new SePayProvider(config({ fetch: async (_input, init) => {
    fetchSignal = init?.signal;
    return new Promise<Response>(() => {});
  } }));
  const pending = provider.lookup(REQUEST);
  const rejection = assert.rejects(pending, errorCode('unavailable'));
  t.mock.timers.tick(9_999);
  assert.equal(fetchSignal?.aborted, false);
  t.mock.timers.tick(1);
  await rejection;
  assert.equal(fetchSignal?.aborted, true);
});

test('lookup timeout covers response body parsing as well as fetching', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const response = new Response('');
  let reading = false;
  t.mock.method(response, 'json', () => {
    reading = true;
    return new Promise<unknown>(() => {});
  });
  const provider = queued([response]).provider;
  const rejection = assert.rejects(provider.lookup(REQUEST), errorCode('unavailable'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(reading, true);
  t.mock.timers.tick(10_000);
  await rejection;
});

test('cancellation is unsupported without network or fake canceled success', async () => {
  const network = queued([]);
  await assert.rejects(network.provider.cancel(REQUEST), errorCode('unsupported_operation'));
  assert.equal(network.calls.length, 0);
});

test('a virtual account is what we publish, and both its number and the main one pass the checks', async () => {
  const va = '96247LD0908';
  const provider = new SePayProvider(config({ virtualAccount: va }));
  assert.equal(provider.transfer.accountNumber, va);
  const checkout = await provider.createCheckout(CHECKOUT);
  assert.equal(checkout.qrImageUrl, `https://vietqr.app/img?acc=${va}&bank=MB&amount=100000&des=TFTABC123`);

  // BIDV-style payload: the bank names the main account, the VA rides in subAccount.
  const viaMain = await provider.verifyWebhook(signed(webhook({ accountNumber: ACCOUNT, subAccount: va })));
  assert.equal(viaMain.receipts.length, 1);
  const viaVirtual = await provider.verifyWebhook(signed(webhook({ accountNumber: va })));
  assert.equal(viaVirtual.receipts.length, 1);
  await assert.rejects(provider.verifyWebhook(signed(webhook({ accountNumber: '0000000000' }))), errorCode('invalid_webhook'));

  const onMain = await lookupRows([row()], { virtualAccount: va });
  assert.equal(onMain.status, 'paid');
  const onVirtual = await lookupRows([row(2, { account_number: va })], { virtualAccount: va });
  assert.equal(onVirtual.status, 'paid');
  await assert.rejects(lookupRows([row(3, { account_number: '0000000000' })], { virtualAccount: va }), errorCode('invalid_response'));
});
