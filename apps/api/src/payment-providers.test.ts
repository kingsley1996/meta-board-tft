import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { PaymentProviderRegistry, PayOSProvider, readPaymentProviders, PaymentProviderError, type CheckoutRequest, type LookupRequest, type PaymentProvider } from './payments/index.ts';
import { isoTimestamp } from './payments/provider.ts';

const CHECKSUM = 'test-checksum-key';
const config = { accountId: 'payos-main', clientId: 'test-client', apiKey: 'test-api-key', checksumKey: CHECKSUM };
const request: CheckoutRequest = {
  orderCode: 123456,
  reference: 'MBTEST123456',
  amountVnd: 99000,
  createdAt: '2026-10-29T10:00:00+07:00',
  expiresAt: '2026-10-29T10:15:00+07:00',
  returnUrl: 'http://localhost:4173/vi/profile',
  cancelUrl: 'http://localhost:4173/vi/profile',
};
const lookupRequest: LookupRequest = { ...request, externalId: 'link-123456' };
const checkout = {
  bin: 'test-bank', accountNumber: 'test-account', accountName: 'Test', amount: 99000,
  description: request.reference, orderCode: request.orderCode, currency: 'VND', paymentLinkId: 'link-123456',
  status: 'PENDING', checkoutUrl: 'https://pay.payos.vn/test-checkout', qrCode: 'test-qr-payload',
};
const webhookData = {
  orderCode: request.orderCode, amount: request.amountVnd, description: request.reference,
  accountNumber: 'test-account', reference: 'TX-123456', transactionDateTime: '2026-10-29 10:02:00',
  currency: 'VND', paymentLinkId: 'link-123456', code: '00', desc: 'success',
};
const transaction = {
  reference: 'TX-123456', amount: 99000, accountNumber: 'test-account', description: request.reference,
  transactionDateTime: '2026-10-29 10:02:00', virtualAccountName: null, virtualAccountNumber: null,
  counterAccountBankId: null, counterAccountBankName: null, counterAccountName: null, counterAccountNumber: null,
};
const paid = {
  id: 'link-123456', orderCode: request.orderCode, amount: 99000, amountPaid: 99000, amountRemaining: 0,
  status: 'PAID', createdAt: request.createdAt, transactions: [transaction], cancellationReason: null, canceledAt: null,
};

function signature(data: Record<string, unknown>): string {
  const text = Object.keys(data).sort().filter(key => data[key] !== undefined).map(key => {
    let value = data[key];
    if (Array.isArray(value)) value = JSON.stringify(value.map(item => Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))));
    if (value === null || value === undefined || value === 'null' || value === 'undefined') value = '';
    return `${key}=${value}`;
  }).join('&');
  return createHmac('sha256', CHECKSUM).update(text).digest('hex');
}

function signedResponse(data: Record<string, unknown>): Response {
  return Response.json({ code: '00', desc: 'success', data, signature: signature(data) });
}

function signedWebhook(data: Record<string, unknown> = webhookData, outer: Record<string, unknown> = {}) {
  return { body: Buffer.from(JSON.stringify({ code: '00', desc: 'success', success: true, data, signature: signature(data), ...outer })), headers: new Headers() };
}

const noNetwork: typeof fetch = async () => { throw new Error('unexpected payment network call'); };
const errorCode = (code: string) => (error: unknown) => error instanceof PaymentProviderError && error.code === code && error.message === `payment_${code}`;

const env: NodeJS.ProcessEnv = {
  PAYMENT_PROVIDER: 'payos',
  PAYOS_ACCOUNT_ID: config.accountId, PAYOS_CLIENT_ID: config.clientId, PAYOS_API_KEY: config.apiKey, PAYOS_CHECKSUM_KEY: CHECKSUM,
  SEPAY_ACCOUNT_ID: 'sepay-main', SEPAY_API_KEY: 'test-sepay-key', SEPAY_WEBHOOK_SECRET: 'test-sepay-secret',
  SEPAY_BANK_ACCOUNT_ID: '11111111-1111-4111-8111-111111111111', SEPAY_BANK_ACCOUNT_NUMBER: '123456789', SEPAY_BANK_CODE: 'VCB', SEPAY_BANK_NAME: 'Vietcombank',
};

test('payments are disabled without a selector and configuration performs no requests', () => {
  assert.equal(readPaymentProviders({}, noNetwork), null);
  assert.equal(readPaymentProviders(env, noNetwork)?.forNewOrder().binding.provider, 'payos');
});

for (const selected of ['unknown', 'PAYOS']) {
  test(`unsupported selector ${selected} cannot silently fall back`, () => {
    assert.throws(() => readPaymentProviders({ ...env, PAYMENT_PROVIDER: selected }, noNetwork), errorCode('configuration'));
  });
}

test('missing or half-configured accounts fail without exposing credentials', () => {
  assert.throws(() => readPaymentProviders({ PAYMENT_PROVIDER: 'payos' }, noNetwork), errorCode('configuration'));
  assert.throws(() => readPaymentProviders({ ...env, PAYOS_API_KEY: '' }, noNetwork), errorCode('configuration'));
  assert.throws(() => readPaymentProviders({ ...env, SEPAY_WEBHOOK_SECRET: '' }, noNetwork), errorCode('configuration'));
});

test('changing the default changes new orders but preserves original order and webhook routing', async () => {
  const before = readPaymentProviders(env, noNetwork)!;
  const binding = before.forNewOrder().binding;
  const after = readPaymentProviders({ ...env, PAYMENT_PROVIDER: 'sepay' }, noNetwork)!;
  const newCheckout = await after.forNewOrder().createCheckout(request);
  assert.equal(newCheckout.kind, 'bank_qr');
  assert.equal(newCheckout.binding.provider, 'sepay');
  assert.deepEqual(after.forOrder(binding).binding, binding);
  const event = await after.forOrder(binding).verifyWebhook(signedWebhook());
  assert.equal(event.binding.provider, 'payos');
  assert.equal(event.receipts[0].orderCode, request.orderCode);
});

test('missing old account is an error, never a switch to the new default', () => {
  const registry = readPaymentProviders(env, noNetwork)!;
  assert.throws(() => registry.forOrder({ provider: 'payos', accountId: 'removed-account' }), errorCode('configuration'));
  assert.throws(() => registry.forOrder({ provider: 'other', accountId: 'payos-main' }), errorCode('configuration'));
});

test('registry supports account rotation and another adapter without changing business operations', () => {
  const old = new PayOSProvider({ ...config, accountId: 'old', fetch: noNetwork });
  const current = new PayOSProvider({ ...config, accountId: 'current', fetch: noNetwork });
  const other: PaymentProvider = {
    binding: Object.freeze({ provider: 'another', accountId: 'main' }),
    capabilities: { checkout: 'bank_qr', remoteCancellation: false, automatedRefund: false },
    createCheckout: async () => { throw new PaymentProviderError('unsupported_operation'); },
    lookup: async () => ({ status: 'pending', receipts: [] }),
    cancel: async () => { throw new PaymentProviderError('unsupported_operation'); },
    verifyWebhook: async () => { throw new PaymentProviderError('invalid_webhook'); },
  };
  const registry = new PaymentProviderRegistry(other.binding, [old, current, other]);
  assert.equal(registry.forNewOrder(), other);
  assert.equal(registry.forOrder(old.binding), old);
  assert.equal(registry.forOrder(current.binding), current);
  assert.throws(() => new PaymentProviderRegistry(old.binding, [old, old]), errorCode('configuration'));
  assert.throws(() => new PaymentProviderRegistry({ provider: 'payos', accountId: 'missing' }, [old]), errorCode('configuration'));
});

test('payOS create uses the SDK, exact amount/reference, expiry and pinned official endpoint', async () => {
  let calls = 0;
  const provider = new PayOSProvider({ ...config, fetch: async (input, init) => {
    calls++;
    assert.equal(String(input), 'https://api-merchant.payos.vn/v2/payment-requests');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('x-client-id'), config.clientId);
    assert.equal(headers.get('x-api-key'), config.apiKey);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.orderCode, request.orderCode);
    assert.equal(body.amount, request.amountVnd);
    assert.equal(body.description, request.reference);
    assert.equal(body.expiredAt, Date.parse(request.expiresAt) / 1000);
    assert.match(body.signature, /^[a-f0-9]{64}$/);
    return signedResponse(checkout);
  } });
  const result = await provider.createCheckout(request);
  assert.equal(calls, 1);
  assert.equal(result.kind, 'hosted');
  assert.deepEqual(result.binding, { provider: 'payos', accountId: config.accountId });
  assert.equal(result.externalId, checkout.paymentLinkId);
});

for (const override of [{ amountVnd: 0 }, { amountVnd: 1.2 }, { reference: 'contains spaces' }, { returnUrl: 'javascript:alert(1)' }, { expiresAt: request.createdAt }]) {
  test(`invalid checkout input rejects before provider work: ${JSON.stringify(override)}`, async () => {
    await assert.rejects(new PayOSProvider({ ...config, fetch: noNetwork }).createCheckout({ ...request, ...override }), errorCode('invalid_input'));
  });
}

test('SDK write failures are not retried and never fail over or expose upstream secrets', async () => {
  let calls = 0;
  const provider = new PayOSProvider({ ...config, fetch: async () => {
    calls++;
    return Response.json({ code: 'error', desc: `${config.apiKey} ${CHECKSUM}` }, { status: 503 });
  } });
  await assert.rejects(provider.createCheckout(request), errorCode('unavailable'));
  assert.equal(calls, 1);
});

test('abort is propagated rather than treated as success', async () => {
  const controller = new AbortController();
  controller.abort();
  const provider = new PayOSProvider({ ...config, fetch: noNetwork });
  await assert.rejects(provider.createCheckout(request, controller.signal), errorCode('aborted'));
});

test('payOS webhook verifies independently signed fixtures and normalizes payment receipts', async () => {
  const provider = new PayOSProvider({ ...config, fetch: noNetwork });
  const result = await provider.verifyWebhook(signedWebhook());
  assert.equal(result.eventId, webhookData.reference);
  assert.deepEqual(result.receipts[0], {
    providerTransactionId: webhookData.reference, transactionReference: webhookData.reference,
    externalId: webhookData.paymentLinkId, orderCode: request.orderCode, orderReference: request.reference,
    amountVnd: request.amountVnd, currency: 'VND', occurredAt: '2026-10-29T03:02:00.000Z',
  });
});

test('unsigned outer success fields cannot convert a signed failure into a payment', async () => {
  const provider = new PayOSProvider({ ...config, fetch: noNetwork });
  const event = await provider.verifyWebhook(signedWebhook({ ...webhookData, code: '01' }, { success: true, code: '00' }));
  assert.deepEqual(event.receipts, []);
  assert.equal((await provider.verifyWebhook(signedWebhook(webhookData, { success: false, code: 'error' }))).receipts.length, 1);
});

test('body tampering and malformed signatures reject', async () => {
  const provider = new PayOSProvider({ ...config, fetch: noNetwork });
  const tampered = JSON.parse(signedWebhook().body.toString());
  tampered.data.amount = 1;
  await assert.rejects(provider.verifyWebhook({ body: Buffer.from(JSON.stringify(tampered)), headers: new Headers() }), errorCode('invalid_webhook'));
  await assert.rejects(provider.verifyWebhook(signedWebhook(webhookData, { signature: '00' })), errorCode('invalid_webhook'));
  await assert.rejects(provider.verifyWebhook({ body: Buffer.from('{'), headers: new Headers() }), errorCode('invalid_webhook'));
});

for (const override of [{ amount: 0 }, { amount: 1.1 }, { amount: '99000' }, { currency: 'USD' }, { paymentLinkId: '../../outside' }, { transactionDateTime: '2026-02-31 10:00:00' }]) {
  test(`signed but invalid payment metadata rejects: ${JSON.stringify(override)}`, async () => {
    await assert.rejects(new PayOSProvider({ ...config, fetch: noNetwork }).verifyWebhook(signedWebhook({ ...webhookData, ...override })), errorCode('invalid_webhook'));
  });
}

test('native reconciliation uses the pinned link and preserves transaction reference', async () => {
  const provider = new PayOSProvider({ ...config, fetch: async input => {
    assert.equal(String(input), 'https://api-merchant.payos.vn/v2/payment-requests/link-123456');
    return signedResponse(paid);
  } });
  const result = await provider.lookup(lookupRequest);
  assert.equal(result.status, 'paid');
  assert.equal(result.receipts[0].transactionReference, webhookData.reference);
});

for (const override of [{ orderCode: 1 }, { amount: 1 }, { id: 'other-link' }, { status: 'UNKNOWN' }]) {
  test(`inconsistent native lookup rejects: ${JSON.stringify(override)}`, async () => {
    const provider = new PayOSProvider({ ...config, fetch: async () => signedResponse({ ...paid, ...override }) });
    await assert.rejects(provider.lookup(lookupRequest), errorCode('invalid_response'));
  });
}

test('paid amount without matching receipt evidence requires review', async () => {
  const provider = new PayOSProvider({ ...config, fetch: async () => signedResponse({ ...paid, transactions: [] }) });
  assert.equal((await provider.lookup(lookupRequest)).status, 'review');
});

test('cancel returns actual provider status, not an unconditional cancellation', async () => {
  const provider = new PayOSProvider({ ...config, fetch: async (input, init) => {
    assert.equal(String(input), 'https://api-merchant.payos.vn/v2/payment-requests/link-123456/cancel');
    assert.equal(init?.method, 'POST');
    return signedResponse({ ...paid, status: 'CANCELLED', amountPaid: 0, transactions: [] });
  } });
  assert.equal((await provider.cancel(lookupRequest)).status, 'canceled');
  assert.equal(provider.capabilities.automatedRefund, false);
});

test('provider dates are normalized explicitly and invalid calendar dates do not roll forward', () => {
  assert.equal(isoTimestamp('2026-10-29 10:02:00', 'invalid_response'), '2026-10-29T03:02:00.000Z');
  assert.equal(isoTimestamp('2026-10-29T10:02:00.123456+07:00', 'invalid_response'), '2026-10-29T03:02:00.123Z');
  assert.throws(() => isoTimestamp('2026-02-31T10:00:00Z', 'invalid_response'), errorCode('invalid_response'));
  assert.throws(() => isoTimestamp('2026-10-29T24:00:00Z', 'invalid_response'), errorCode('invalid_response'));
});
