const WINDOW_MS = 60_000;
const DEFAULT_PER_WINDOW = 12;
// Sweep threshold for the hits map so memory stays bounded by active clients.
const MAX_TRACKED_KEYS = 10_000;

type HitEntry = { count: number; resetAt: number };

const hits = new Map<string, HitEntry>();

function positiveNumber(value: string | undefined, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
}

/** Burst protection only. The daily budget used to live here, keyed by the browser
 *  cookie, which made a shared machine one account and a cleared cookie free quota —
 *  the account's `chat_per_day` bucket is the budget now (task #83), and this gate
 *  stays only to stop one client from flooding the inference queue. */
export function checkRateLimit(key: string): { allowed: true } | { allowed: false; retryAfter: number } {
  const now = Date.now();
  if (hits.size > MAX_TRACKED_KEYS) {
    for (const [tracked, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(tracked);
    }
  }

  const perWindow = positiveNumber(process.env.ASSISTANT_RATE_LIMIT, DEFAULT_PER_WINDOW);
  const previous = hits.get(key);
  if (!previous || previous.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else if (previous.count >= perWindow) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((previous.resetAt - now) / 1000)) };
  } else {
    previous.count += 1;
  }
  return { allowed: true };
}

// Upstream inference is a network wait, not CPU work, so one long answer must
// not occupy the only slot while everyone else queues behind it. The cap protects
// the provider's rate limit, so it is deliberately small — and one instance only
// sees its own queue.
function inferenceConcurrency(): number {
  return positiveNumber(process.env.ASSISTANT_MAX_CONCURRENCY, 2);
}

let active = 0;
const waiting: Array<() => void> = [];

export async function withInferenceSlot<T>(work: () => Promise<T>): Promise<T> {
  if (active < inferenceConcurrency()) {
    active += 1;
  } else {
    // The releasing task hands its count over instead of decrementing, so a woken
    // task is already holding a slot and the cap cannot be briefly overshoot.
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }
}
