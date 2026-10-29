// Seeds the pilot offer rows for plan_versions (docs/MEMBERSHIP-PLAN.md #79).
// Safe to re-run: it refreshes a draft offer that has never been sold or used to
// reserve quota, and leaves anything with history alone. Run: npm run seed:membership
//
// Both rows stay 'draft'. Activating an offer is gate #92/#95, so entitlement and
// quota code must fail closed until a row is explicitly set to 'active'.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../src/db.ts';

const plans = [
  {
    code: 'free',
    version: 1,
    label: 'Free',
    priceVnd: 0,
    // null term = calendar month, reset with the month.
    termDays: null,
    chatPerPeriod: 30,
    chatPerDay: 5,
    sttSecondsPerPeriod: 0,
    ttsCharactersPerPeriod: 0,
    chatRequestsPerMinute: 3,
    maxConcurrentRequests: 1,
    maxSttSecondsPerRequest: null,
    maxConcurrentTtsChunks: 0,
  },
  {
    code: 'plus',
    version: 1,
    label: 'Plus',
    priceVnd: 99_000,
    // Plus is exactly 30 days, not a calendar month.
    termDays: 30,
    chatPerPeriod: 150,
    chatPerDay: 30,
    sttSecondsPerPeriod: 600,
    ttsCharactersPerPeriod: 5_000,
    chatRequestsPerMinute: 6,
    maxConcurrentRequests: 1,
    maxSttSecondsPerRequest: 60,
    maxConcurrentTtsChunks: 2,
  },
];

await pool.query(await readFile(join(import.meta.dirname, '../src/schema.sql'), 'utf8'));

for (const plan of plans) {
  const { rowCount } = await pool.query(
    `INSERT INTO plan_versions (
       code, version, label, price_vnd, term_days,
       chat_per_period, chat_per_day, stt_seconds_per_period, tts_characters_per_period,
       chat_requests_per_minute, max_concurrent_requests, max_stt_seconds_per_request,
       max_concurrent_tts_chunks, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft')
     ON CONFLICT (code, version) DO UPDATE SET
       label = EXCLUDED.label,
       price_vnd = EXCLUDED.price_vnd,
       term_days = EXCLUDED.term_days,
       chat_per_period = EXCLUDED.chat_per_period,
       chat_per_day = EXCLUDED.chat_per_day,
       stt_seconds_per_period = EXCLUDED.stt_seconds_per_period,
       tts_characters_per_period = EXCLUDED.tts_characters_per_period,
       chat_requests_per_minute = EXCLUDED.chat_requests_per_minute,
       max_concurrent_requests = EXCLUDED.max_concurrent_requests,
       max_stt_seconds_per_request = EXCLUDED.max_stt_seconds_per_request,
       max_concurrent_tts_chunks = EXCLUDED.max_concurrent_tts_chunks
     WHERE plan_versions.status = 'draft'
       AND NOT EXISTS (SELECT 1 FROM payment_orders o WHERE o.plan_version_id = plan_versions.id)
       AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.plan_version_id = plan_versions.id)
       AND NOT EXISTS (SELECT 1 FROM usage_buckets b WHERE b.plan_version_id = plan_versions.id)`,
    [
      plan.code,
      plan.version,
      plan.label,
      plan.priceVnd,
      plan.termDays,
      plan.chatPerPeriod,
      plan.chatPerDay,
      plan.sttSecondsPerPeriod,
      plan.ttsCharactersPerPeriod,
      plan.chatRequestsPerMinute,
      plan.maxConcurrentRequests,
      plan.maxSttSecondsPerRequest,
      plan.maxConcurrentTtsChunks,
    ],
  );
  console.log(`${plan.code} v${plan.version}: ${rowCount} row(s) inserted or refreshed`);
}

const { rows } = await pool.query(
  `SELECT code, version, status, price_vnd, term_days, chat_per_period, chat_per_day,
          stt_seconds_per_period, tts_characters_per_period
     FROM plan_versions ORDER BY code, version`,
);
console.table(rows);
await pool.end();
