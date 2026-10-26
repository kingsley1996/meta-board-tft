import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/api';
import { backendUrl } from '@/lib/backend';

// Admin is an account role, so the gate has to ask the API who the visitor is.
// These are server components: fetch does not send the browser's cookies on its
// own, so the session token is forwarded by hand.
export async function adminCookieHeader(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? `${SESSION_COOKIE}=${token}` : '';
}

export async function currentAdminUser(): Promise<{ id: string; email: string; role: string } | null> {
  const cookie = await adminCookieHeader();
  if (!cookie) return null;
  const res = await fetch(`${backendUrl}/api/auth/me`, { headers: { cookie }, cache: 'no-store' });
  // Only "not signed in" is a quiet null: a broken backend must surface as an
  // error page, not send a logged-in admin around the login loop.
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`backend responded ${res.status} for /api/auth/me`);
  const { user } = (await res.json()) as { user: { id: string; email: string; role: string } | null };
  return user?.role === 'admin' ? user : null;
}
