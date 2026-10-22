const WINDOW_MS = 60_000;
const DEFAULT_PER_WINDOW = 12;
const DEFAULT_DAILY_CAP = 200;

const hits = new Map<string, { count: number; resetAt: number }>();
let day = new Date().toISOString().slice(0, 10);
let dailyCount = 0;

function positiveNumber(value: string | undefined, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
}

export function checkRateLimit(key: string): { allowed: true } | { allowed: false; retryAfter: number } {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dailyCount = 0;
  }

  const now = Date.now();
  const current = hits.get(key);
  if (!current || current.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else if (current.count >= positiveNumber(process.env.ASSISTANT_RATE_LIMIT, DEFAULT_PER_WINDOW)) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  } else {
    current.count += 1;
  }

  if (dailyCount >= positiveNumber(process.env.ASSISTANT_DAILY_REQUESTS, DEFAULT_DAILY_CAP)) {
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((tomorrow.getTime() - now) / 1000)) };
  }
  dailyCount += 1;
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
