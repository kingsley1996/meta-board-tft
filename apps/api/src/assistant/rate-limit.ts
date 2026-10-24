const WINDOW_MS = 60_000;
const DEFAULT_PER_WINDOW = 12;
const DEFAULT_DAILY_CAP = 200;
// Sweep threshold for the hits map so memory stays bounded by active clients.
const MAX_TRACKED_KEYS = 10_000;

type HitEntry = { count: number; resetAt: number; day: string; dailyCount: number };

const hits = new Map<string, HitEntry>();

function positiveNumber(value: string | undefined, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
}

export function checkRateLimit(key: string): { allowed: true } | { allowed: false; retryAfter: number } {
  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();
  if (hits.size > MAX_TRACKED_KEYS) {
    for (const [tracked, entry] of hits) {
      if (entry.resetAt <= now && entry.day !== today) hits.delete(tracked);
    }
  }

  const perWindow = positiveNumber(process.env.ASSISTANT_RATE_LIMIT, DEFAULT_PER_WINDOW);
  const dailyCap = positiveNumber(process.env.ASSISTANT_DAILY_REQUESTS, DEFAULT_DAILY_CAP);
  const previous = hits.get(key);
  if (!previous || previous.resetAt <= now) {
    hits.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS,
      day: today,
      // Carry today's budget across minute windows; counted below.
      dailyCount: previous && previous.day === today ? previous.dailyCount : 0,
    });
  } else if (previous.count >= perWindow) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((previous.resetAt - now) / 1000)) };
  } else {
    previous.count += 1;
  }

  const entry = hits.get(key)!;
  if (entry.day !== today) {
    entry.day = today;
    entry.dailyCount = 0;
  }
  if (entry.dailyCount >= dailyCap) {
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((tomorrow.getTime() - now) / 1000)) };
  }
  entry.dailyCount += 1;
  return { allowed: true };
}

let tail: Promise<void> = Promise.resolve();

export async function withInferenceSlot<T>(work: () => Promise<T>): Promise<T> {
  let release = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = tail;
  tail = previous.then(() => current);
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}
