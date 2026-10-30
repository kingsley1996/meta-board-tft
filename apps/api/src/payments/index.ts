import { PayOSProvider } from './payos.ts';
import { SePayProvider } from './sepay.ts';
import { PaymentProviderError, type PaymentBinding, type PaymentProvider } from './provider.ts';

export { PayOSProvider } from './payos.ts';
export { SePayProvider } from './sepay.ts';
export { PaymentProviderError } from './provider.ts';
export type {
  PaymentBinding,
  PaymentOrder,
  CheckoutRequest,
  LookupRequest,
  PaymentCheckout,
  PaymentReceipt,
  PaymentLookup,
  PaymentStatus,
  PaymentWebhook,
  WebhookRequest,
  PaymentCapabilities,
  PaymentProvider,
} from './provider.ts';

function bindingKey(binding: PaymentBinding): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(binding.provider) || !/^[a-zA-Z0-9_-]{1,64}$/.test(binding.accountId)) {
    throw new PaymentProviderError('configuration');
  }
  return JSON.stringify([binding.provider, binding.accountId]);
}

export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();
  private readonly defaultBinding: PaymentBinding;

  constructor(defaultBinding: PaymentBinding, providers: readonly PaymentProvider[]) {
    this.defaultBinding = Object.freeze({ ...defaultBinding });
    for (const provider of providers) {
      const key = bindingKey(provider.binding);
      if (this.providers.has(key)) throw new PaymentProviderError('configuration');
      this.providers.set(key, provider);
    }
    this.forOrder(this.defaultBinding);
  }

  forNewOrder(): PaymentProvider {
    return this.forOrder(this.defaultBinding);
  }

  /** Every configured account, for a webhook that has to find the one whose
   *  signature verifies. Order is registration order, so rotation can try old
   *  accounts too. */
  all(): readonly PaymentProvider[] {
    return [...this.providers.values()];
  }

  forOrder(binding: PaymentBinding): PaymentProvider {
    const provider = this.providers.get(bindingKey(binding));
    if (!provider) throw new PaymentProviderError('configuration');
    return provider;
  }
}

function value(env: NodeJS.ProcessEnv, key: string): string {
  return env[key]?.trim() ?? '';
}

function configured(env: NodeJS.ProcessEnv, keys: readonly string[]): boolean {
  const present = keys.map((key) => Boolean(value(env, key)));
  if (present.some(Boolean) && !present.every(Boolean)) throw new PaymentProviderError('configuration');
  return present.every(Boolean);
}

export function readPaymentProviders(env: NodeJS.ProcessEnv = process.env, fetch: typeof globalThis.fetch = globalThis.fetch): PaymentProviderRegistry | null {
  const selected = value(env, 'PAYMENT_PROVIDER');
  if (!selected) return null;
  if (selected !== 'payos' && selected !== 'sepay') throw new PaymentProviderError('configuration');
  const providers: PaymentProvider[] = [];
  if (configured(env, ['PAYOS_ACCOUNT_ID', 'PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY'])) {
    providers.push(new PayOSProvider({
      accountId: value(env, 'PAYOS_ACCOUNT_ID'),
      clientId: value(env, 'PAYOS_CLIENT_ID'),
      apiKey: value(env, 'PAYOS_API_KEY'),
      checksumKey: value(env, 'PAYOS_CHECKSUM_KEY'),
      fetch,
    }));
  }
  if (configured(env, ['SEPAY_ACCOUNT_ID', 'SEPAY_API_KEY', 'SEPAY_WEBHOOK_SECRET', 'SEPAY_BANK_ACCOUNT_ID', 'SEPAY_BANK_ACCOUNT_NUMBER', 'SEPAY_BANK_CODE', 'SEPAY_BANK_NAME'])) {
    providers.push(new SePayProvider({
      accountId: value(env, 'SEPAY_ACCOUNT_ID'),
      apiKey: value(env, 'SEPAY_API_KEY'),
      webhookSecret: value(env, 'SEPAY_WEBHOOK_SECRET'),
      bankAccountId: value(env, 'SEPAY_BANK_ACCOUNT_ID'),
      bankAccountNumber: value(env, 'SEPAY_BANK_ACCOUNT_NUMBER'),
      virtualAccount: value(env, 'SEPAY_VA_NUMBER') || undefined,
      bankCode: value(env, 'SEPAY_BANK_CODE'),
      bankName: value(env, 'SEPAY_BANK_NAME'),
      fetch,
    }));
  }
  const provider = providers.find((provider) => provider.binding.provider === selected);
  if (!provider) throw new PaymentProviderError('configuration');
  return new PaymentProviderRegistry(provider.binding, providers);
}
