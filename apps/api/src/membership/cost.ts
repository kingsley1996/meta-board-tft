import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { pool } from '../db.ts';

// Cost ledger (task #82, docs/MEMBERSHIP-PLAN.md sections 5 and 9).
//
// The quota ledger (#81) answers "may this account spend a turn?". This one answers
// "what did that turn actually cost us, and how do we know?". They are separate
// because the two numbers disagree on purpose: a user stop after dispatch debits one
// chat turn but may leave two provider attempts behind, a system error gives the turn
// back and keeps the provider bill, and a background extraction call costs money while
// debiting nothing at all.
//
// One provider call is a row of its own, written before the network call, and the
// money lives on billing lines under it. That shape is what makes an interrupted
// process survivable: a call row still sitting in `dispatching` is a spend nobody
// explained, which is exactly the state that must never be re-dispatched and must
// never be reported as free.
//
// A number without a price sheet is not a number. `cost_micro_vnd` stays NULL, with
// `billed_quantity` filled in when the provider told us how much was consumed, until
// an approved tariff (#92) can be named. `unknown` and `0` are different answers, and
// only one of them is cheap.

export const BILLED_UNITS = ['request', 'second', 'character', 'input_token', 'output_token', 'audio_second', 'byte'] as const;
export type BilledUnit = (typeof BILLED_UNITS)[number];

export type Charge = { unit: BilledUnit; quantity: number };

export type AttemptOutcome = 'success' | 'empty' | 'error' | 'cancelled' | 'unknown';

export type AttemptDraft = { provider: string; model?: string | null; startedAt?: number };

export type AttemptHandle = { requestId: string; attempt: number };

export type AttemptClose = {
  outcome: AttemptOutcome;
  charges?: Charge[];
  /** True when the provider may have billed us although the call returned nothing we
   *  can prove: the request left, the answer did not come back. Defaults to true only
   *  for the `unknown` outcome, so a caller has to say so explicitly for the aborted
   *  mid-stream case instead of relying on a guess. */
  charged?: boolean;
  error?: string | null;
  finishedAt?: number;
};

/** A price sheet. `microVndPer` is the price of `per` units, so one entry can say
 *  "12.000đ per 1M input tokens" without any float arithmetic in the ledger. */
export type TariffEntry = { provider: string; model?: string | null; unit: BilledUnit; microVndPer: number; per?: number };
export type Tariff = { version: string; entries: TariffEntry[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STUCK_AFTER_MS = 5 * 60 * 1000;

type Client = PoolClient;

function positiveInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

async function withTransaction<T>(work: (client: Client) => Promise<T>): Promise<T | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('cost transaction failed', error instanceof Error ? error.message : error);
    return null;
  } finally {
    client.release();
  }
}

/** Drops entries that cannot produce a trustworthy number. A malformed price is
 *  treated as no price, which leaves the cost unknown rather than wrong. */
export function usableTariff(tariff: Tariff | null | undefined): Tariff | null {
  if (!tariff || typeof tariff.version !== 'string' || !tariff.version) return null;
  const entries = (tariff.entries ?? []).filter(
    (entry) =>
      typeof entry?.provider === 'string' &&
      entry.provider &&
      BILLED_UNITS.includes(entry.unit) &&
      positiveInteger(entry.microVndPer) !== null &&
      (entry.per === undefined || entry.per === null || positiveInteger(entry.per) !== null),
  );
  return entries.length ? { version: tariff.version, entries } : null;
}

function priceFor(tariff: Tariff | null, provider: string, model: string | null | undefined, unit: BilledUnit): TariffEntry | null {
  if (!tariff) return null;
  const candidates = tariff.entries.filter((entry) => entry.provider === provider && entry.unit === unit);
  if (!candidates.length) return null;
  const exact = candidates.find((entry) => entry.model && entry.model === model);
  // A wildcard entry prices the provider regardless of which model id came back.
  return exact ?? candidates.find((entry) => !entry.model) ?? null;
}

/** Rounds up: a fraction of a billed unit is still billed. A product too large for an
 *  exact integer is refused rather than approximated, because a wrong cost is worse
 *  than an unknown one. */
export function costOf(entry: TariffEntry, quantity: number): number | null {
  const scaled = positiveInteger(entry.microVndPer);
  if (scaled === null) return null;
  const units = nonNegativeInteger(quantity);
  if (units === null) return null;
  const per = positiveInteger(entry.per ?? 1);
  if (per === null) return null;
  const product = units * scaled;
  if (!Number.isSafeInteger(product)) return null;
  const micro = Math.ceil(product / per);
  return Number.isSafeInteger(micro) ? micro : null;
}

function dispatchStateFor(close: AttemptClose): 'completed' | 'unknown' | 'failed' {
  if (close.outcome === 'success' || close.outcome === 'empty') return 'completed';
  if (close.charged ?? close.outcome === 'unknown') return 'unknown';
  return 'failed';
}

function normaliseCharges(charges: Charge[] | undefined): Charge[] {
  const seen = new Set<string>();
  const out: Charge[] = [];
  for (const charge of charges ?? []) {
    const quantity = nonNegativeInteger(charge?.quantity);
    // Nothing consumed is not a billing line; the absence of a line is what the
    // report reads as "the provider never told us".
    if (quantity === null || quantity === 0 || !BILLED_UNITS.includes(charge.unit) || seen.has(charge.unit)) continue;
    seen.add(charge.unit);
    out.push({ unit: charge.unit, quantity });
  }
  return out;
}

/** Writes the call row before the caller touches a provider.
 *
 *  `null` means the ledger could not be written, and a caller that spends anyway is
 *  the bug this function exists to prevent: return the request as unavailable instead
 *  of calling the provider. */
export async function openAttempt(requestId: string, draft: AttemptDraft): Promise<AttemptHandle | null> {
  if (!UUID.test(requestId) || typeof draft?.provider !== 'string' || !draft.provider.trim()) return null;
  const startedAt = new Date(draft.startedAt ?? Date.now()).toISOString();
  const model = typeof draft.model === 'string' && draft.model.trim() ? draft.model.trim().slice(0, 200) : null;
  const row = await withTransaction(async (client) => {
    // Locking the request serialises the counter, so two calls of one turn cannot
    // both claim the same attempt number.
    const { rows: request } = await client.query('SELECT 1 FROM usage_requests WHERE id = $1 FOR UPDATE', [requestId]);
    if (!request.length) return null;
    const { rows } = await client.query(
      `INSERT INTO usage_attempts (id, request_id, attempt, provider, model, dispatch_state, started_at)
       SELECT $1, $2, COALESCE(MAX(attempt), 0) + 1, $3, $4, 'dispatching', $5
         FROM usage_attempts WHERE request_id = $2
       RETURNING attempt`,
      [randomUUID(), requestId, draft.provider.trim().slice(0, 80), model, startedAt],
    );
    return rows.length ? { attempt: rows[0].attempt as number } : null;
  });
  return row ? { requestId, attempt: row.attempt } : null;
}

/** Closes a call row and writes its billing lines underneath it.
 *
 *  Returns false when the write failed, and true with `firstTime: false` when the
 *  attempt was already closed - a retried response then adds no second line, which is
 *  what keeps a duplicate settle from double-counting a cost. */
export async function closeAttempt(
  handle: AttemptHandle,
  close: AttemptClose,
  options: { tariff?: Tariff | null } = {},
): Promise<{ ok: boolean; firstTime: boolean; costMicroVnd: number | null }> {
  const none = { ok: false, firstTime: false, costMicroVnd: null };
  if (!UUID.test(handle.requestId) || !Number.isSafeInteger(handle.attempt) || handle.attempt < 1) return none;
  if (!['success', 'empty', 'error', 'cancelled', 'unknown'].includes(close.outcome)) return none;
  const dispatchState = dispatchStateFor(close);
  const finishedAt = new Date(close.finishedAt ?? Date.now()).toISOString();
  const error = typeof close.error === 'string' && close.error.trim() ? close.error.trim().slice(0, 500) : null;
  const tariff = usableTariff(options.tariff);
  const charges = normaliseCharges(close.charges);

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE usage_attempts
          SET dispatch_state = $3, outcome = $4, error_code = $5, finished_at = $6
        WHERE request_id = $1 AND attempt = $2 AND billed_unit IS NULL AND dispatch_state IN ('not_dispatched', 'dispatching', 'unknown')
        RETURNING id, provider, model, started_at`,
      [handle.requestId, handle.attempt, dispatchState, close.outcome, error, finishedAt],
    );
    if (!rows.length) return { firstTime: false, costMicroVnd: null };
    const call = rows[0];
    // The call has to exist as a row before its lines can point at it, and a line
    // inherits the call's state: a billing line never claims more certainty than
    // the request that produced it.
    let total: number | null = null;
    for (const charge of charges) {
      const entry = priceFor(tariff, call.provider, call.model, charge.unit);
      const micro = entry ? costOf(entry, charge.quantity) : null;
      const { rowCount } = await client.query(
        `INSERT INTO usage_attempts (id, request_id, attempt, provider, model, dispatch_state,
                                     billed_quantity, billed_unit, cost_micro_vnd, tariff_version, outcome,
                                     started_at, finished_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (request_id, attempt, COALESCE(billed_unit, '')) DO NOTHING`,
        [
          randomUUID(),
          handle.requestId,
          handle.attempt,
          call.provider,
          call.model,
          dispatchState,
          charge.quantity,
          charge.unit,
          micro,
          micro === null ? null : tariff?.version ?? null,
          close.outcome,
          call.started_at,
          finishedAt,
        ],
      );
      if (rowCount && micro !== null) total = (total ?? 0) + micro;
    }
    return { firstTime: true, costMicroVnd: total };
  });
  if (!result) return none;
  return { ok: true, firstTime: result.firstTime, costMicroVnd: result.costMicroVnd };
}

/** A meter is what a spend path holds: it knows the ledger request the work belongs
 *  to and nothing else about Postgres. Route integration (#83-#85) creates one per
 *  request and hands it to the provider adapters. */
export type SpendMeter = {
  open(draft: AttemptDraft): Promise<AttemptHandle | null>;
  close(handle: AttemptHandle, close: AttemptClose): Promise<boolean>;
};

export function createSpendMeter(requestId: string, options: { tariff?: Tariff | null } = {}): SpendMeter {
  const tariff = usableTariff(options.tariff);
  return {
    open: (draft) => openAttempt(requestId, draft),
    close: async (handle, close) => (await closeAttempt(handle, close, { tariff })).ok,
  };
}

/** The provider returned usage counts, so the money is at least expressible.
 *  Adapters report 0 for both directions when the vendor sent no usage block, which
 *  is unknown rather than free, and `normaliseCharges` keeps it that way. */
export function tokenCharges(usage: { inputTokens: number; outputTokens: number } | null | undefined): Charge[] {
  if (!usage) return [];
  const input = nonNegativeInteger(usage.inputTokens);
  const output = nonNegativeInteger(usage.outputTokens);
  if (input === null || output === null || (input === 0 && output === 0)) return [];
  return [
    { unit: 'input_token', quantity: input },
    { unit: 'output_token', quantity: output },
  ];
}

/** One metered step of a failover chain: the whole audio is the billable quantity of
 *  whichever provider ends up serving it, so seconds are never counted twice. */
export function durationCharges(seconds: number): Charge[] {
  const value = nonNegativeInteger(Math.ceil(Number(seconds) || 0));
  return value ? [{ unit: 'audio_second', quantity: value }] : [];
}

/** One metered TTS chunk: the server counts the characters it actually sent. */
export function characterCharges(characters: number): Charge[] {
  const value = nonNegativeInteger(characters);
  return value ? [{ unit: 'character', quantity: value }] : [];
}

/** Opens the ledger line for one provider call, before the caller touches a provider.
 *
 *  A null result with a meter present means the spend could not be recorded, and a
 *  caller that spends anyway is the bug this exists to prevent. Each spend path turns
 *  that into its own refusal error, so this stays free of provider types. */
export async function meterOpen(meter: SpendMeter | undefined, provider: string, model?: string | null): Promise<AttemptHandle | null> {
  if (!meter) return null;
  return meter.open({ provider, model, startedAt: Date.now() });
}

/** Closes the ledger line for one provider call.
 *
 *  A write failure is logged, not thrown: by this point the money is already spent and
 *  the user's answer must not be lost on top of it. The row stays `dispatching`, which
 *  recovery and the cost report both read as unexplained. */
export async function meterClose(meter: SpendMeter | undefined, handle: AttemptHandle | null, close: AttemptClose): Promise<boolean> {
  if (!meter || !handle) return true;
  const closed = await meter.close(handle, { ...close, finishedAt: Date.now() });
  if (!closed) console.error('cost attempt could not be closed', { requestId: handle.requestId, attempt: handle.attempt });
  return closed;
}

/** Classifies a failed provider call for the cost ledger.
 *
 *  Money is assumed spent unless there is positive evidence it was not: the only
 *  failure that proves nothing was billed is an HTTP status the vendor actually
 *  answered with, because refusing a request before generating anything costs
 *  nothing. A connection that died, a timeout, a body nobody read or a user who
 *  walked away mid-stream is unknowable from here, so it is recorded as `unknown` -
 *  the state that later forbids re-dispatching the same work for free. */
export function chargeForFailure(error: unknown, refused: boolean): AttemptClose {
  const message = error instanceof Error ? error.message.slice(0, 200) : 'unknown provider failure';
  if (refused) return { outcome: 'error', charged: false, error: message };
  return { outcome: 'unknown', charged: true, error: message };
}

export type StuckAttempt = { requestId: string; attempt: number; provider: string };

/** Claims calls whose process never came back. They stay `unknown` - the money may be
 *  spent and no re-dispatch is allowed - and become the report's unexplained bucket
 *  instead of silently reading as `dispatching` forever. */
export async function markStuckAttempts(options: { limit?: number; now?: number; olderThanMs?: number } = {}): Promise<{ stuck: StuckAttempt[]; unavailable: boolean }> {
  const limit = Math.max(1, Math.min(500, positiveInteger(options.limit ?? 100) ?? 100));
  const threshold = new Date((options.now ?? Date.now()) - (options.olderThanMs ?? STUCK_AFTER_MS)).toISOString();
  const rows = await withTransaction(async (client) => {
    const { rows: claimed } = await client.query(
      `UPDATE usage_attempts
          SET dispatch_state = 'unknown', outcome = 'unknown', error_code = 'stuck_dispatch', finished_at = now()
        WHERE id IN (SELECT id FROM usage_attempts
                      WHERE billed_unit IS NULL AND dispatch_state = 'dispatching' AND started_at < $1
                      ORDER BY started_at LIMIT $2 FOR UPDATE SKIP LOCKED)
       RETURNING request_id, attempt, provider`,
      [threshold, limit],
    );
    return claimed.map((row) => ({ requestId: String(row.request_id), attempt: row.attempt as number, provider: row.provider as string }));
  });
  return rows ? { stuck: rows, unavailable: false } : { stuck: [], unavailable: true };
}

export type CallSummaryRow = {
  provider: string;
  model: string | null;
  calls: number;
  answered: number;
  unexplained: number;
  withoutUsage: number;
};

export type ChargeSummaryRow = {
  provider: string;
  model: string | null;
  unit: BilledUnit;
  lines: number;
  quantity: number;
  costMicroVnd: number;
  costUnknownLines: number;
};

export type CostLedger = { calls: CallSummaryRow[]; charges: ChargeSummaryRow[]; unavailable: boolean };

/** Everything #92 needs to price an offer, and nothing else: counts and sums grouped
 *  by provider and model, with the unknowns kept as separate columns so an absence of
 *  evidence is never read as an absence of cost. */
export async function costLedger(options: { from?: number; to?: number } = {}): Promise<CostLedger> {
  const from = options.from ? new Date(options.from).toISOString() : null;
  const to = options.to ? new Date(options.to).toISOString() : null;
  const window = `($1::timestamptz IS NULL OR started_at >= $1) AND ($2::timestamptz IS NULL OR started_at <= $2)`;
  try {
    const [calls, charges] = await Promise.all([
      pool.query(
        `SELECT provider, model,
                count(*)::int AS calls,
                count(*) FILTER (WHERE dispatch_state = 'completed')::int AS answered,
                count(*) FILTER (WHERE dispatch_state IN ('dispatching', 'unknown'))::int AS unexplained,
                count(*) FILTER (WHERE dispatch_state = 'completed' AND NOT EXISTS (
                         SELECT 1 FROM usage_attempts line
                          WHERE line.request_id = usage_attempts.request_id
                            AND line.attempt = usage_attempts.attempt
                            AND line.billed_unit IS NOT NULL))::int AS without_usage
           FROM usage_attempts
          WHERE billed_unit IS NULL AND ${window}
          GROUP BY provider, model
          ORDER BY provider, model`,
        [from, to],
      ),
      pool.query(
        `SELECT provider, model, billed_unit AS unit,
                count(*)::int AS lines,
                COALESCE(sum(billed_quantity) FILTER (WHERE billed_quantity IS NOT NULL), 0)::bigint AS quantity,
                COALESCE(sum(cost_micro_vnd) FILTER (WHERE cost_micro_vnd IS NOT NULL), 0)::bigint AS cost_micro_vnd,
                count(*) FILTER (WHERE cost_micro_vnd IS NULL)::int AS cost_unknown_lines
           FROM usage_attempts
          WHERE billed_unit IS NOT NULL AND ${window}
          GROUP BY provider, model, billed_unit
          ORDER BY provider, model, billed_unit`,
        [from, to],
      ),
    ]);
    return {
      calls: calls.rows.map((row) => ({
        provider: row.provider,
        model: row.model,
        calls: row.calls,
        answered: row.answered,
        unexplained: row.unexplained,
        withoutUsage: row.without_usage,
      })),
      charges: charges.rows.map((row) => ({
        provider: row.provider,
        model: row.model,
        unit: row.unit,
        lines: row.lines,
        quantity: Number(row.quantity),
        costMicroVnd: Number(row.cost_micro_vnd),
        costUnknownLines: row.cost_unknown_lines,
      })),
      unavailable: false,
    };
  } catch (error) {
    console.error('cost ledger unreadable', error instanceof Error ? error.message : error);
    return { calls: [], charges: [], unavailable: true };
  }
}
