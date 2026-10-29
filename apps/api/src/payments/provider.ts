export type PaymentBinding = Readonly<{ provider: string; accountId: string }>;

export type PaymentOrder = {
  orderCode: number;
  reference: string;
  amountVnd: number;
  createdAt: string;
  expiresAt: string;
};

export type CheckoutRequest = PaymentOrder & { returnUrl: string; cancelUrl: string };
export type LookupRequest = PaymentOrder & { externalId: string | null };

export type PaymentCheckout = {
  binding: PaymentBinding;
  externalId: string | null;
  kind: 'hosted' | 'bank_qr';
  checkoutUrl: string | null;
  qrCode: string | null;
  qrImageUrl: string | null;
};

export type PaymentReceipt = {
  providerTransactionId: string;
  transactionReference: string | null;
  externalId: string | null;
  orderCode: number | null;
  orderReference: string | null;
  amountVnd: number;
  currency: 'VND';
  occurredAt: string;
};

export type PaymentStatus = 'pending' | 'underpaid' | 'paid' | 'canceled' | 'expired' | 'processing' | 'failed' | 'review';
export type PaymentLookup = { status: PaymentStatus; receipts: PaymentReceipt[] };
export type PaymentWebhook = { binding: PaymentBinding; eventId: string; receipts: PaymentReceipt[] };
export type WebhookRequest = { body: Buffer; headers: Headers };

export type PaymentCapabilities = Readonly<{
  checkout: 'hosted' | 'bank_qr';
  remoteCancellation: boolean;
  automatedRefund: boolean;
}>;

export interface PaymentProvider {
  readonly binding: PaymentBinding;
  readonly capabilities: PaymentCapabilities;
  createCheckout(request: CheckoutRequest, signal?: AbortSignal): Promise<PaymentCheckout>;
  lookup(request: LookupRequest, signal?: AbortSignal): Promise<PaymentLookup>;
  cancel(request: LookupRequest, signal?: AbortSignal): Promise<PaymentLookup>;
  verifyWebhook(request: WebhookRequest): Promise<PaymentWebhook>;
}

export type PaymentErrorCode =
  | 'configuration'
  | 'unsupported_operation'
  | 'invalid_input'
  | 'invalid_webhook'
  | 'invalid_response'
  | 'unavailable'
  | 'aborted';

export class PaymentProviderError extends Error {
  readonly code: PaymentErrorCode;

  constructor(code: PaymentErrorCode) {
    super(`payment_${code}`);
    this.name = 'PaymentProviderError';
    this.code = code;
  }
}

export function objectValue(value: unknown, code: PaymentErrorCode): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PaymentProviderError(code);
  return value as Record<string, unknown>;
}

export function stringValue(value: unknown, code: PaymentErrorCode): string {
  if (typeof value !== 'string' || !value.trim()) throw new PaymentProviderError(code);
  return value;
}

export function positiveInteger(value: unknown, code: PaymentErrorCode): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new PaymentProviderError(code);
  return value;
}

export function isoTimestamp(value: unknown, code: PaymentErrorCode): string {
  const text = stringValue(value, code);
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?$/.test(text)) {
    throw new PaymentProviderError(code);
  }
  const calendar = new Date(`${text.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== text.slice(0, 10)
    || Number(text.slice(11, 13)) > 23 || Number(text.slice(14, 16)) > 59 || Number(text.slice(17, 19)) > 59) {
    throw new PaymentProviderError(code);
  }
  const normalized = text.replace(' ', 'T');
  const withZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized) ? normalized : `${normalized}+07:00`;
  const date = new Date(withZone);
  if (!Number.isFinite(date.getTime())) throw new PaymentProviderError(code);
  return date.toISOString();
}

export function validateOrder(request: PaymentOrder): void {
  positiveInteger(request.orderCode, 'invalid_input');
  positiveInteger(request.amountVnd, 'invalid_input');
  const reference = stringValue(request.reference, 'invalid_input');
  if (!/^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{6,25}$/.test(reference)) throw new PaymentProviderError('invalid_input');
  if (Date.parse(isoTimestamp(request.expiresAt, 'invalid_input')) <= Date.parse(isoTimestamp(request.createdAt, 'invalid_input'))) {
    throw new PaymentProviderError('invalid_input');
  }
}

export function httpUrl(value: unknown, code: PaymentErrorCode): string {
  try {
    const url = new URL(stringValue(value, code));
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new PaymentProviderError(code);
    return url.toString();
  } catch {
    throw new PaymentProviderError(code);
  }
}

export function webhookBody(body: Buffer): Record<string, unknown> {
  if (!Buffer.isBuffer(body) || !body.length || body.length > 65_536) throw new PaymentProviderError('invalid_webhook');
  try {
    return objectValue(JSON.parse(body.toString('utf8')), 'invalid_webhook');
  } catch {
    throw new PaymentProviderError('invalid_webhook');
  }
}
