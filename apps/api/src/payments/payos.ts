import { timingSafeEqual } from 'node:crypto';
import { PayOS, UserAbortError } from '@payos/node';
import {
  PaymentProviderError,
  httpUrl,
  isoTimestamp,
  objectValue,
  positiveInteger,
  stringValue,
  validateOrder,
  webhookBody,
  type CheckoutRequest,
  type LookupRequest,
  type PaymentBinding,
  type PaymentCapabilities,
  type PaymentCheckout,
  type PaymentLookup,
  type PaymentProvider,
  type PaymentReceipt,
  type PaymentStatus,
  type PaymentWebhook,
  type WebhookRequest,
} from './provider.ts';

export type PayOSConfig = {
  accountId: string;
  clientId: string;
  apiKey: string;
  checksumKey: string;
  fetch?: typeof globalThis.fetch;
};

function statusValue(value: unknown): PaymentStatus {
  switch (value) {
    case 'PENDING': return 'pending';
    case 'UNDERPAID': return 'underpaid';
    case 'PAID': return 'paid';
    case 'CANCELLED': return 'canceled';
    case 'EXPIRED': return 'expired';
    case 'PROCESSING': return 'processing';
    case 'FAILED': return 'failed';
    default: throw new PaymentProviderError('invalid_response');
  }
}

function externalId(value: unknown, code: 'invalid_input' | 'invalid_response' | 'invalid_webhook'): string {
  const id = stringValue(value, code);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new PaymentProviderError(code);
  return id;
}

export class PayOSProvider implements PaymentProvider {
  readonly binding: PaymentBinding;
  readonly capabilities: PaymentCapabilities = Object.freeze({ checkout: 'hosted', remoteCancellation: true, automatedRefund: false });
  private readonly client: PayOS;

  constructor(config: PayOSConfig) {
    this.binding = Object.freeze({ provider: 'payos', accountId: stringValue(config.accountId, 'configuration') });
    this.client = new PayOS({
      clientId: stringValue(config.clientId, 'configuration'),
      apiKey: stringValue(config.apiKey, 'configuration'),
      checksumKey: stringValue(config.checksumKey, 'configuration'),
      baseURL: 'https://api-merchant.payos.vn',
      partnerCode: null,
      logLevel: 'off',
      timeout: 10_000,
      fetchOptions: { redirect: 'error' },
      // A timed-out write may already exist; recovery must look it up, not resend it.
      maxRetries: 0,
      fetch: config.fetch,
    });
  }

  private async remote<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;
      throw new PaymentProviderError(signal?.aborted || error instanceof UserAbortError ? 'aborted' : 'unavailable');
    }
  }

  async createCheckout(request: CheckoutRequest, signal?: AbortSignal): Promise<PaymentCheckout> {
    validateOrder(request);
    const input = {
      orderCode: request.orderCode,
      amount: request.amountVnd,
      description: request.reference,
      returnUrl: httpUrl(request.returnUrl, 'invalid_input'),
      cancelUrl: httpUrl(request.cancelUrl, 'invalid_input'),
      expiredAt: Math.floor(Date.parse(isoTimestamp(request.expiresAt, 'invalid_input')) / 1000),
    };
    const data = await this.remote(() => this.client.paymentRequests.create(input, { signal }), signal);
    if (data.orderCode !== request.orderCode || data.amount !== request.amountVnd || data.currency !== 'VND' || data.description !== request.reference) {
      throw new PaymentProviderError('invalid_response');
    }
    return {
      binding: this.binding,
      externalId: externalId(data.paymentLinkId, 'invalid_response'),
      kind: 'hosted',
      checkoutUrl: httpUrl(data.checkoutUrl, 'invalid_response'),
      qrCode: stringValue(data.qrCode, 'invalid_response'),
      qrImageUrl: null,
    };
  }

  private normalizeLookup(value: unknown, request: LookupRequest): PaymentLookup {
    const data = objectValue(value, 'invalid_response');
    const id = externalId(data.id, 'invalid_response');
    if (data.orderCode !== request.orderCode || data.amount !== request.amountVnd || (request.externalId !== null && id !== request.externalId)) {
      throw new PaymentProviderError('invalid_response');
    }
    if (typeof data.amountPaid !== 'number' || !Number.isSafeInteger(data.amountPaid) || data.amountPaid < 0 || !Array.isArray(data.transactions)) {
      throw new PaymentProviderError('invalid_response');
    }
    const receipts = data.transactions.map((value): PaymentReceipt => {
      const transaction = objectValue(value, 'invalid_response');
      const reference = stringValue(transaction.reference, 'invalid_response');
      return {
        providerTransactionId: reference,
        transactionReference: reference,
        externalId: id,
        orderCode: request.orderCode,
        orderReference: request.reference,
        amountVnd: positiveInteger(transaction.amount, 'invalid_response'),
        currency: 'VND',
        occurredAt: isoTimestamp(transaction.transactionDateTime, 'invalid_response'),
      };
    });
    const status = statusValue(data.status);
    const total = receipts.reduce((sum, receipt) => sum + receipt.amountVnd, 0);
    return {
      status: status === 'paid' && (data.amountPaid !== request.amountVnd || total !== data.amountPaid) ? 'review' : status,
      receipts,
    };
  }

  async lookup(request: LookupRequest, signal?: AbortSignal): Promise<PaymentLookup> {
    validateOrder(request);
    const data = await this.remote(() => request.externalId === null
      ? this.client.paymentRequests.get(request.orderCode, { signal })
      : this.client.paymentRequests.get(externalId(request.externalId, 'invalid_input'), { signal }), signal);
    return this.normalizeLookup(data, request);
  }

  async cancel(request: LookupRequest, signal?: AbortSignal): Promise<PaymentLookup> {
    validateOrder(request);
    const data = await this.remote(() => request.externalId === null
      ? this.client.paymentRequests.cancel(request.orderCode, undefined, { signal })
      : this.client.paymentRequests.cancel(externalId(request.externalId, 'invalid_input'), undefined, { signal }), signal);
    return this.normalizeLookup(data, request);
  }

  async verifyWebhook(request: WebhookRequest): Promise<PaymentWebhook> {
    const payload = webhookBody(request.body);
    const data = objectValue(payload.data, 'invalid_webhook');
    if (typeof payload.signature !== 'string' || !/^[a-f0-9]{64}$/.test(payload.signature)) {
      throw new PaymentProviderError('invalid_webhook');
    }
    try {
      const expected = await this.client.crypto.createSignatureFromObj(data, this.client.checksumKey);
      if (!expected || !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(payload.signature, 'hex'))) {
        throw new PaymentProviderError('invalid_webhook');
      }
      await this.client.webhooks.verify(payload as unknown as Parameters<PayOS['webhooks']['verify']>[0]);
    } catch {
      throw new PaymentProviderError('invalid_webhook');
    }
    const reference = stringValue(data.reference, 'invalid_webhook');
    const paymentLinkId = externalId(data.paymentLinkId, 'invalid_webhook');
    const result: PaymentWebhook = { binding: this.binding, eventId: reference, receipts: [] };
    // Only data is signed; outer success/code fields cannot authorise fulfillment.
    if (data.code !== '00') return result;
    if (data.currency !== 'VND') throw new PaymentProviderError('invalid_webhook');
    result.receipts.push({
      providerTransactionId: reference,
      transactionReference: reference,
      externalId: paymentLinkId,
      orderCode: positiveInteger(data.orderCode, 'invalid_webhook'),
      orderReference: stringValue(data.description, 'invalid_webhook'),
      amountVnd: positiveInteger(data.amount, 'invalid_webhook'),
      currency: 'VND',
      occurredAt: isoTimestamp(data.transactionDateTime, 'invalid_webhook'),
    });
    return result;
  }
}
