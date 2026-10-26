import { cookies } from 'next/headers';
import { SESSION_COOKIE, type AuthUser } from '@/lib/api';
import { backendUrl } from '@/lib/backend';

// Server components fetch on the server, so the browser's cookies are not sent
// automatically; the session token is forwarded by hand.
export async function sessionCookieHeader(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? `${SESSION_COOKIE}=${token}` : '';
}

// Only "not signed in" is a quiet null: a broken backend must surface as an
// error page, not send a signed-in user around the login loop.
export async function currentUser(): Promise<AuthUser | null> {
  const cookie = await sessionCookieHeader();
  if (!cookie) return null;
  const res = await fetch(`${backendUrl}/api/auth/me`, { headers: { cookie }, cache: 'no-store' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`backend responded ${res.status} for /api/auth/me`);
  const { user } = (await res.json()) as { user: AuthUser | null };
  return user;
}

export async function currentAdminUser(): Promise<AuthUser | null> {
  const user = await currentUser();
  return user?.role === 'admin' ? user : null;
}
