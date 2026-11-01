// The public pages are cached for a day, so a tier sync or an admin save has to
// say so: one POST marks Next's entries stale and the next visitor gets a fresh
// render. Fire and forget on purpose — a failed notify costs a stale page for at
// most that window, and must never fail the save or the seed run behind it.
// Writes collapse through a short debounce so seeding 58 comps is one request,
// not fifty-eight.
export type RevalidateKind = 'comps' | 'guides';

const DEBOUNCE_MS = 500;
const TIMEOUT_MS = 5_000;

const pending = new Set<RevalidateKind>();
let timer: ReturnType<typeof setTimeout> | null = null;

// Same origin the auth redirects use; the web app is the only thing that can
// invalidate its own cache.
const endpoint = () =>
  `${(process.env.AUTH_WEB_ORIGIN?.trim() || 'http://localhost:4173').replace(/\/+$/, '')}/api/revalidate`;

const token = () => process.env.WEB_REVALIDATE_TOKEN?.trim() ?? '';

export function notifyRevalidate(kind: RevalidateKind): void {
  if (!token()) return;
  pending.add(kind);
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flushRevalidate();
  }, DEBOUNCE_MS);
}

// Returns the kinds Next accepted. Scripts call this before exiting; the server
// lets the timer do it.
export async function flushRevalidate(): Promise<RevalidateKind[]> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const kinds = [...pending];
  pending.clear();
  const secret = token();
  if (!secret || !kinds.length) return [];
  const accepted: RevalidateKind[] = [];
  for (const kind of kinds) {
    try {
      const res = await fetch(endpoint(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-revalidate-token': secret },
        body: JSON.stringify({ kind }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) accepted.push(kind);
      else console.warn(`web revalidate "${kind}": ${res.status}`);
    } catch (error) {
      console.warn(`web revalidate "${kind}" failed: ${(error as Error).message}`);
    }
  }
  return accepted;
}
