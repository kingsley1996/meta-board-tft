import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  PaymentProviderError,
  isoTimestamp,
  objectValue,
  positiveInteger,
  stringValue,
  validateOrder,
  webhookBody,
} from './provider.ts';
import type {
  CheckoutRequest,
  LookupRequest,
  PaymentBinding,
  PaymentCapabilities,
  PaymentCheckout,
  PaymentErrorCode,
  PaymentLookup,
  PaymentOrder,
  PaymentProvider,
  PaymentReceipt,
  PaymentWebhook,
  WebhookRequest,
} from './provider.ts';

export type SePayConfig = {
  accountId: string;
  apiKey: string;
  webhookSecret: string;
  bankAccountId: string;
  bankAccountNumber: string;
  // BIDV, MSB, KienLongBank and OCB personal accounts have no main-account feed:
  // SePay only reports transfers that land in one of their virtual accounts.
  virtualAccount?: string;
  bankCode: string;
  bankName: string;
  fetch?: typeof globalThis.fetch;
  clock?: () => number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(value: unknown, code: PaymentErrorCode): string {
  const text = stringValue(value, code);
  if (!UUID.test(text)) throw new PaymentProviderError(code);
  return text;
}

function nullableString(value: unknown, code: PaymentErrorCode): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new PaymentProviderError(code);
  return value.trim() || null;
}

function nonnegativeInteger(value: unknown, code: PaymentErrorCode): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new PaymentProviderError(code);
  }
  return value;
}

function order(request: PaymentOrder): void {
  objectValue(request, 'invalid_input');
  stringValue(request.reference, 'invalid_input');
  validateOrder(request);
}

function vnd(row: Record<string, unknown>, code: PaymentErrorCode): void {
  if (row.currency !== undefined && row.currency !== 'VND') throw new PaymentProviderError(code);
}

function contentReferences(content: string): string[] {
  const tokens = content.match(/(?<![A-Za-z0-9])[A-Za-z0-9]{6,25}(?![A-Za-z0-9])/g) ?? [];
  return [...new Set(tokens.filter(token => /[A-Za-z]/.test(token) && /[0-9]/.test(token)).map(token => token.toUpperCase()))];
}

function vietnamDate(value: string): string {
  const milliseconds = Date.parse(isoTimestamp(value, 'invalid_input'));
  return new Date(milliseconds + 7 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

export class SePayProvider implements PaymentProvider {
  readonly binding: PaymentBinding;
  readonly capabilities: PaymentCapabilities;
  readonly transfer: Readonly<{ bankName: string; accountNumber: string }>;
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly bankAccountId: string;
  private readonly bankAccountNumber: string;
  private readonly virtualAccount: string | null;
  // The bank reports the main account number for a VA transfer and the VA number
  // for nothing else, so both are ours; the one we publish is the VA when set.
  private readonly accountNumbers: ReadonlySet<string>;
  private readonly bankCode: string;
  private readonly bankName: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly clock: () => number;

  constructor(config: SePayConfig) {
    objectValue(config, 'configuration');
    this.binding = Object.freeze({ provider: 'sepay', accountId: stringValue(config.accountId, 'configuration') });
    this.capabilities = Object.freeze({ checkout: 'bank_qr', remoteCancellation: false, automatedRefund: false });
    this.apiKey = stringValue(config.apiKey, 'configuration');
    this.webhookSecret = stringValue(config.webhookSecret, 'configuration');
    this.bankAccountId = uuid(config.bankAccountId, 'configuration');
    this.bankAccountNumber = stringValue(config.bankAccountNumber, 'configuration');
    this.virtualAccount = config.virtualAccount ? stringValue(config.virtualAccount, 'configuration') : null;
    this.accountNumbers = Object.freeze(new Set([this.bankAccountNumber, ...(this.virtualAccount ? [this.virtualAccount] : [])]));
    this.bankCode = stringValue(config.bankCode, 'configuration');
    this.bankName = stringValue(config.bankName, 'configuration');
    this.transfer = Object.freeze({ bankName: this.bankName, accountNumber: this.virtualAccount ?? this.bankAccountNumber });
    this.fetcher = config.fetch ?? globalThis.fetch;
    this.clock = config.clock ?? Date.now;
    if (typeof this.fetcher !== 'function' || typeof this.clock !== 'function') {
      throw new PaymentProviderError('configuration');
    }
  }

  private now(): number {
    try {
      const value = this.clock();
      if (!Number.isFinite(value)) throw new PaymentProviderError('configuration');
      return value;
    } catch {
      throw new PaymentProviderError('configuration');
    }
  }

  async createCheckout(request: CheckoutRequest, signal?: AbortSignal): Promise<PaymentCheckout> {
    if (signal?.aborted) throw new PaymentProviderError('aborted');
    order(request);
    const url = new URL('https://vietqr.app/img');
    url.searchParams.set('acc', this.transfer.accountNumber);
    url.searchParams.set('bank', this.bankCode);
    url.searchParams.set('amount', String(request.amountVnd));
    url.searchParams.set('des', request.reference);
    return {
      binding: this.binding,
      externalId: null,
      kind: 'bank_qr',
      checkoutUrl: null,
      qrCode: null,
      qrImageUrl: url.toString(),
    };
  }

  async cancel(_request: LookupRequest, _signal?: AbortSignal): Promise<PaymentLookup> {
    throw new PaymentProviderError('unsupported_operation');
  }

  async verifyWebhook(request: WebhookRequest): Promise<PaymentWebhook> {
    objectValue(request, 'invalid_webhook');
    if (!Buffer.isBuffer(request.body) || !request.body.length || request.body.length > 65_536 || !(request.headers instanceof Headers)) {
      throw new PaymentProviderError('invalid_webhook');
    }
    const timestamp = request.headers.get('X-SePay-Timestamp');
    const signature = request.headers.get('X-SePay-Signature');
    if (!timestamp || !/^[0-9]+$/.test(timestamp) || !signature || !/^sha256=[0-9a-fA-F]{64}$/.test(signature)) {
      throw new PaymentProviderError('invalid_webhook');
    }
    const seconds = Number(timestamp);
    if (!Number.isSafeInteger(seconds) || seconds < 0 || Math.abs(this.now() - seconds * 1000) > 300_000) {
      throw new PaymentProviderError('invalid_webhook');
    }
    const expected = createHmac('sha256', this.webhookSecret).update(`${timestamp}.`).update(request.body).digest();
    const actual = Buffer.from(signature.slice(7), 'hex');
    if (!timingSafeEqual(expected, actual)) throw new PaymentProviderError('invalid_webhook');

    const row = webhookBody(request.body);
    vnd(row, 'invalid_webhook');
    const id = String(positiveInteger(row.id, 'invalid_webhook'));
    if (!this.accountNumbers.has(String(row.accountNumber ?? '')) || stringValue(row.gateway, 'invalid_webhook').toLowerCase() !== this.bankName.toLowerCase()) {
      throw new PaymentProviderError('invalid_webhook');
    }
    if (row.transferType !== 'in' && row.transferType !== 'out') throw new PaymentProviderError('invalid_webhook');
    const amount = positiveInteger(row.transferAmount, 'invalid_webhook');
    const occurredAt = isoTimestamp(row.transactionDate, 'invalid_webhook');
    const content = nullableString(row.content, 'invalid_webhook') ?? '';
    const code = nullableString(row.code, 'invalid_webhook')?.toUpperCase() ?? null;
    const transactionReference = nullableString(row.referenceCode, 'invalid_webhook');
    const candidates = contentReferences(content);
    const receipt: PaymentReceipt = {
      providerTransactionId: id,
      transactionReference,
      externalId: null,
      orderCode: null,
      orderReference: code ?? (candidates.length === 1 ? candidates[0]! : null),
      amountVnd: amount,
      currency: 'VND',
      occurredAt,
    };
    return { binding: this.binding, eventId: id, receipts: row.transferType === 'in' ? [receipt] : [] };
  }

  async lookup(request: LookupRequest, signal?: AbortSignal): Promise<PaymentLookup> {
    if (signal?.aborted) throw new PaymentProviderError('aborted');
    order(request);
    const controller = new AbortController();
    let rejectAbort: (error: PaymentProviderError) => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const abort = (code: 'aborted' | 'unavailable') => {
      rejectAbort(new PaymentProviderError(code));
      controller.abort();
    };
    const callerAbort = () => abort('aborted');
    const timer = setTimeout(() => abort('unavailable'), 10_000);
    signal?.addEventListener('abort', callerAbort, { once: true });
    if (signal?.aborted) callerAbort();
    try {
      return await Promise.race([this.lookupPages(request, controller.signal), aborted]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', callerAbort);
    }
  }

  private async lookupPages(request: LookupRequest, signal: AbortSignal): Promise<PaymentLookup> {
    const receipts: PaymentReceipt[] = [];
    const seen = new Set<string>();
    let pagination: { total: number; perPage: number; lastPage: number } | undefined;
    let sum = 0;
    let ambiguous = false;
    // SePay's 3 requests/second/IP limit needs integration-wide scheduling, not a per-instance retry loop.
    for (let page = 1; page <= 10; page++) {
      if (signal.aborted) throw new PaymentProviderError('unavailable');
      const url = new URL('https://userapi.sepay.vn/v2/transactions');
      url.searchParams.set('transaction_content', request.reference);
      url.searchParams.set('bank_account_id', this.bankAccountId);
      url.searchParams.set('transfer_type', 'in');
      url.searchParams.set('page', String(page));
      url.searchParams.set('per_page', '100');
      url.searchParams.set('timestamp_format', 'iso8601');
      url.searchParams.set('transaction_date_from', vietnamDate(request.createdAt));
      let response: Response;
      try {
        response = await this.fetcher(url.toString(), {
          method: 'GET',
          headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' },
          signal,
          redirect: 'error',
        });
      } catch {
        throw new PaymentProviderError('unavailable');
      }
      if (!response || typeof response.ok !== 'boolean') throw new PaymentProviderError('invalid_response');
      if (!response.ok) throw new PaymentProviderError('unavailable');
      let json: unknown;
      try {
        json = await response.json();
      } catch {
        throw new PaymentProviderError('invalid_response');
      }
      if (signal.aborted) throw new PaymentProviderError('unavailable');
      const envelope = objectValue(json, 'invalid_response');
      if (envelope.status !== 'success' || !Array.isArray(envelope.data)) throw new PaymentProviderError('invalid_response');
      const metadata = objectValue(objectValue(envelope.meta, 'invalid_response').pagination, 'invalid_response');
      const total = nonnegativeInteger(metadata.total, 'invalid_response');
      const perPage = positiveInteger(metadata.per_page, 'invalid_response');
      const currentPage = positiveInteger(metadata.current_page, 'invalid_response');
      const lastPage = positiveInteger(metadata.last_page, 'invalid_response');
      if (perPage > 100 || currentPage !== page || lastPage > 10 || lastPage !== Math.max(1, Math.ceil(total / perPage)) ||
          typeof metadata.has_more !== 'boolean' || metadata.has_more !== (page < lastPage) ||
          envelope.data.length !== Math.min(perPage, Math.max(0, total - (page - 1) * perPage)) ||
          (pagination && (pagination.total !== total || pagination.perPage !== perPage || pagination.lastPage !== lastPage))) {
        throw new PaymentProviderError('invalid_response');
      }
      pagination = { total, perPage, lastPage };
      for (const value of envelope.data) {
        const row = objectValue(value, 'invalid_response');
        const id = uuid(row.id, 'invalid_response');
        const identity = id.toLowerCase();
        if (seen.has(identity) || uuid(row.bank_account_id, 'invalid_response').toLowerCase() !== this.bankAccountId.toLowerCase() ||
            !this.accountNumbers.has(String(row.account_number ?? ''))) throw new PaymentProviderError('invalid_response');
        seen.add(identity);
        vnd(row, 'invalid_response');
        const amountIn = nonnegativeInteger(row.amount_in, 'invalid_response');
        const amountOut = nonnegativeInteger(row.amount_out, 'invalid_response');
        if ((amountIn === 0 && amountOut === 0) || (amountIn > 0 && amountOut > 0) ||
            (row.transfer_type !== undefined && row.transfer_type !== (amountIn > 0 ? 'in' : 'out'))) {
          throw new PaymentProviderError('invalid_response');
        }
        const content = nullableString(row.transaction_content, 'invalid_response') ?? '';
        const code = nullableString(row.code, 'invalid_response')?.toUpperCase() ?? null;
        const transactionReference = nullableString(row.reference_number, 'invalid_response');
        const occurredAt = isoTimestamp(row.transaction_date, 'invalid_response');
        const candidates = contentReferences(content);
        if (!amountIn || (code !== request.reference && !candidates.includes(request.reference))) continue;
        const matched = code === request.reference || (code === null && candidates.length === 1);
        ambiguous ||= !matched;
        sum += amountIn;
        if (!Number.isSafeInteger(sum)) throw new PaymentProviderError('invalid_response');
        receipts.push({
          providerTransactionId: id,
          transactionReference,
          externalId: null,
          orderCode: matched ? request.orderCode : null,
          orderReference: matched ? request.reference : null,
          amountVnd: amountIn,
          currency: 'VND',
          occurredAt,
        });
      }
      if (!metadata.has_more) {
        const status = ambiguous || receipts.some(receipt => receipt.transactionReference === null) || sum > request.amountVnd ? 'review'
          : sum === request.amountVnd ? 'paid'
          : sum > 0 ? 'underpaid'
          : this.now() >= Date.parse(isoTimestamp(request.expiresAt, 'invalid_input')) ? 'expired' : 'pending';
        return { status, receipts };
      }
    }
    throw new PaymentProviderError('invalid_response');
  }
}
