// Server-side calls into the API workspace. Returns null on 404
// so pages can call notFound().
export const backendUrl = process.env.BACKEND_URL ?? 'http://127.0.0.1:4000';

// A build environment with no BACKEND_URL has no store to read: a preview build,
// CI, a fresh clone. Every page that renders from the data files shipped in the
// repo (`tft.json`, `meta.json`, the seed) still renders there, and the rows the
// store owns come on demand — the same trade the `[slug]` routes already make
// when the API is mid-restart. A store that IS configured and stays silent is a
// different thing: that is a fault, and `storeFault` keeps it one.
export const storeConfigured = () => Boolean(process.env.BACKEND_URL);

/** Throw only where a missing answer means the store failed, not where it was never asked. */
export function storeFault(message: string): void {
  if (storeConfigured()) throw new Error(message);
}

// The API instance can be seconds away from ready (a deploy, a wake-up, a
// restart) while a public page is being rendered for a crawler. Without a
// deadline those renders hang until the platform times them out, and without one
// retry the page 500s on a blip that resolves before the user sees anything.
const FETCH_TIMEOUT_MS = Number(process.env.BACKEND_FETCH_TIMEOUT_MS) || 8_000;

type BackendInit = RequestInit & { revalidate?: number };

let warned = false;

export async function backendJson<T>(path: string, init?: BackendInit): Promise<T | null> {
  const { revalidate, ...request } = init ?? {};
  if (!storeConfigured()) {
    // Once per process: one build renders several hundred pages.
    if (!warned) {
      warned = true;
      console.warn('BACKEND_URL is not set — no API calls will be made; pages render from the data files in the repo.');
    }
    return null;
  }
  // A public page opts into `revalidate` and becomes cacheable; that is also what
  // lets Next answer the second call for the same URL from its data store instead
  // of paying the hop to the API twice per render. Everything else — admin,
  // profile — stays on no-store and must never see a stale row.
  const cacheability = revalidate
    ? { cache: 'default' as const, next: { revalidate } }
    : { cache: 'no-store' as const };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(`${backendUrl}${path}`, { ...cacheability, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), ...request });
      if (res.status === 404) return null;
      if (res.ok) return (await res.json()) as T;
      lastError = new Error(`backend responded ${res.status} for ${path}`);
      // A 4xx is the real answer, not a transient fault; retrying only delays it.
      if (res.status < 500) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
