// Tiny TTL memoization for read-heavy DB loaders (catalog, comps). Reads share
// one in-flight promise; failures are not cached. Write paths invalidate their
// keys so admin edits appear immediately instead of waiting out the TTL.
const TTL_MS = 15_000;

type Entry = { value: unknown; expiresAt: number };
const entries = new Map<string, Entry>();

export function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as Promise<T>;
  const value = load();
  value.catch(() => entries.delete(key));
  entries.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

export function invalidateCachePrefix(prefix: string): void {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}
