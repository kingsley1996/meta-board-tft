// Server-side calls into the API workspace. Returns null on 404
// so pages can call notFound().
export const backendUrl = process.env.BACKEND_URL ?? 'http://127.0.0.1:4000';

// The API instance can be seconds away from ready (a deploy, a wake-up, a
// restart) while a public page is being rendered for a crawler. Without a
// deadline those renders hang until the platform times them out, and without one
// retry the page 500s on a blip that resolves before the user sees anything.
const FETCH_TIMEOUT_MS = Number(process.env.BACKEND_FETCH_TIMEOUT_MS) || 8_000;

export async function backendJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(`${backendUrl}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), ...init });
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
