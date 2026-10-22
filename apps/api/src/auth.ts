import { createHash, timingSafeEqual } from 'node:crypto';

export const ADMIN_COOKIE = 'mb_admin';

// Mirrors lib/admin-auth.ts in the Next app; both sides read the same ADMIN_PASSWORD.
export function adminToken(password: string): string {
  return createHash('sha256').update(`metaboard:${password}`).digest('hex');
}

export function tokensMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function cookieValue(header: string | undefined, name: string): string {
  for (const part of (header ?? '').split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) return trimmed.slice(name.length + 1);
  }
  return '';
}
