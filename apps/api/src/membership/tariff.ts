import type { Tariff } from './cost.ts';

// The price sheet approved with the pilot offer on 2026-10-30
// (docs/MEMBERSHIP-UNIT-ECONOMICS.md §2 and §10). Prices are published list rates
// converted at 25.834,04 VND/USD; `microVndPer` is the price of one billed unit in
// millionths of a dong, so the ledger never does float arithmetic.
//
// Only these (provider, model) pairs are priced on purpose: a model id we have not
// checked stays NULL ("unknown") instead of borrowing a neighbour's rate, because a
// wrong cost is worse than an unpriced one.
//
// Every entry here can also be read as the number the report quotes:
//   - `openai gpt-6-luna` 2.138 in + 192 out = 17,72đ
//   - `openai deepseek-v4-flash` 2.138 in + 192 out = 252,41đ
//   - `google gemini-3.5-flash-lite` 2.138 in + 192 out = 28,97đ
//   - `deepgram nova-3` 60 s = 198,92đ, `groq whisper-large-v3-turbo` 60 s = 17,22đ
//   - `vieneu vieneu-v4` 1.000 chars = 965đ, `deepgram aura-2-thalia-en` = 775đ,
//     `deepgram flux-minh-vi` = 1.162,5đ
export const approvedTariff: Tariff = {
  version: '2026-10-30',
  entries: [
    { provider: 'openai', model: 'gpt-6-luna', unit: 'input_token', microVndPer: 6_200 },
    { provider: 'openai', model: 'gpt-6-luna', unit: 'output_token', microVndPer: 23_251 },
    // The shopaikey gateway is configured with `OPENAI_MODEL=deepseek-v4-flash`, and it
    // keeps the 'openai' ledger id (provider.ts:966), so without this pair a turn that
    // ran on the gateway would record an unknown cost. $3,60 / $10,80 per 1M tokens
    // (shopaikey.com/models, đọc 2026-10-30); 14x luna on the same token counts.
    { provider: 'openai', model: 'deepseek-v4-flash', unit: 'input_token', microVndPer: 93_003 },
    { provider: 'openai', model: 'deepseek-v4-flash', unit: 'output_token', microVndPer: 279_008 },
    // Production answers with Gemini, so its list price has to be on the sheet or
    // every real turn records an unknown cost. $0,30 / $2,50 per 1M tokens
    // (ai.google.dev/gemini-api/docs/pricing, đọc 2026-10-30).
    { provider: 'google', model: 'gemini-3.5-flash-lite', unit: 'input_token', microVndPer: 7_750 },
    { provider: 'google', model: 'gemini-3.5-flash-lite', unit: 'output_token', microVndPer: 64_585 },
    { provider: 'deepgram', model: 'nova-3', unit: 'audio_second', microVndPer: 3_315_368 },
    { provider: 'groq', model: 'whisper-large-v3-turbo', unit: 'audio_second', microVndPer: 287_045 },
    { provider: 'vieneu', model: 'vieneu-v4', unit: 'character', microVndPer: 965_000 },
    { provider: 'deepgram', model: 'aura-2-thalia-en', unit: 'character', microVndPer: 775_021 },
    { provider: 'deepgram', model: 'flux-minh-vi', unit: 'character', microVndPer: 1_162_532 },
  ],
};
