// Server-side calls into the metaboard backend (server/). Returns null on 404
// so pages can call notFound().
export const backendUrl = process.env.BACKEND_URL ?? 'http://127.0.0.1:4000';

export async function backendJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(`${backendUrl}${path}`, { cache: 'no-store', ...init });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`backend responded ${res.status} for ${path}`);
  return (await res.json()) as T;
}
