import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { cookieValue, secureCookieSuffix } from './auth.ts';
import {
  consumeEmailToken,
  createEmailToken,
  createSession,
  createUser,
  deleteSession,
  ensureAccountTables,
  findUserByEmail,
  findUserByGoogleId,
  hashPassword,
  linkGoogleAccount,
  markEmailVerified,
  sessionUser,
  toAuthUser,
  verifyPassword,
  type AuthUser,
} from './accounts.ts';
import { getMailer } from './mailer.ts';

export const SESSION_COOKIE = 'mb_session';
const OAUTH_STATE_COOKIE = 'mb_oauth_state';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const OAUTH_STATE_MAX_AGE = 600;

// Public web origin the auth emails and OAuth redirects point back to.
const webOrigin = (process.env.AUTH_WEB_ORIGIN?.trim() || 'http://localhost:4173').replace(/\/+$/, '');
const secureFlag = secureCookieSuffix();

export type AuthedRequest = Request & { authUser?: AuthUser | null };

function setSessionCookie(res: Response, token: string, maxAge = SESSION_MAX_AGE): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secureFlag}`);
}

function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureFlag}`);
}

function setOAuthStateCookie(res: Response, state: string): void {
  res.setHeader('Set-Cookie', `${OAUTH_STATE_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=${OAUTH_STATE_MAX_AGE}${secureFlag}`);
}

function readLang(value: unknown): 'vi' | 'en' {
  return value === 'en' ? 'en' : 'vi';
}

// Verification is enforced only at production launch; until then registrations
// are auto-verified and signed in immediately.
export function requireEmailVerification(): boolean {
  return process.env.AUTH_REQUIRE_EMAIL_VERIFICATION?.trim().toLowerCase() === 'true';
}

// --- Simple per-IP limiter for credential endpoints (in-memory, per process) ---

const attempts = new Map<string, { count: number; resetAt: number }>();
const ATTEMPT_LIMIT = 10;
const ATTEMPT_WINDOW_MS = 60_000;

function attemptAllowed(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    if (attempts.size > 10_000) attempts.clear();
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= ATTEMPT_LIMIT;
}

function attemptKey(kind: string, req: Request): string {
  return `${kind}:${req.ip ?? 'unknown'}`;
}

// --- Verification email ---

function verificationUrl(token: string, lang: 'vi' | 'en'): string {
  return `${webOrigin}/${lang}/auth/verify?token=${encodeURIComponent(token)}`;
}

async function sendVerificationEmail(email: string, token: string, lang: 'vi' | 'en'): Promise<void> {
  const url = verificationUrl(token, lang);
  await getMailer().send({
    to: email,
    subject: lang === 'vi' ? 'Xác minh tài khoản MetaBoard' : 'Verify your MetaBoard account',
    text:
      lang === 'vi'
        ? `Chào bạn,\n\nXác minh tài khoản MetaBoard bằng đường link này (hết hạn sau 24 giờ):\n${url}\n\nNếu bạn không đăng ký, hãy bỏ qua email này.`
        : `Hi,\n\nVerify your MetaBoard account with this link (valid for 24 hours):\n${url}\n\nIf you did not sign up, ignore this email.`,
  });
}

export async function currentSessionUser(req: Request): Promise<AuthUser | null> {
  try {
    return await sessionUser(cookieValue(req.headers.cookie, SESSION_COOKIE));
  } catch {
    return null;
  }
}

export const authRouter = Router();

authRouter.use(async (_req, _res, next) => {
  try {
    await ensureAccountTables();
    next();
  } catch (error) {
    next(error);
  }
});

authRouter.post('/register', async (req, res) => {
  if (!attemptAllowed(attemptKey('register', req))) return res.status(429).json({ error: 'too many attempts', code: 'rate_limited' });
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
  const lang = readLang(req.body?.lang);
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return res.status(400).json({ error: 'invalid email', code: 'invalid_email' });
  if (password.length < 8 || password.length > 200) {
    return res.status(400).json({ error: 'password must be 8-200 characters', code: 'invalid_password' });
  }
  const existing = await findUserByEmail(email);
  if (existing) return res.status(409).json({ error: 'email already registered', code: 'email_taken' });

  const user = await createUser({
    email,
    passwordHash: await hashPassword(password),
    name: name || null,
    emailVerified: !requireEmailVerification(),
  });
  if (requireEmailVerification()) {
    const token = await createEmailToken(user.id, 'verify_email');
    await sendVerificationEmail(email, token, lang);
    return res.status(201).json({ ok: true });
  }
  // Verification disabled: sign the fresh account in right away.
  const session = await createSession(user.id);
  setSessionCookie(res, session);
  return res.status(201).json({ ok: true, user: toAuthUser(user) });
});

authRouter.post('/resend-verification', async (req, res) => {
  if (!attemptAllowed(attemptKey('resend', req))) return res.status(429).json({ error: 'too many attempts', code: 'rate_limited' });
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const lang = readLang(req.body?.lang);
  // Always answer ok so the endpoint cannot be used to probe which emails exist.
  res.json({ ok: true });
  if (!EMAIL_PATTERN.test(email)) return;
  const user = await findUserByEmail(email);
  if (!user || user.email_verified_at) return;
  const token = await createEmailToken(user.id, 'verify_email');
  await sendVerificationEmail(email, token, lang);
});

authRouter.post('/verify', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const userId = await consumeEmailToken(token, 'verify_email');
  if (!userId) return res.status(400).json({ error: 'invalid or expired token', code: 'invalid_token' });
  const user = await markEmailVerified(userId);
  const session = await createSession(user.id);
  setSessionCookie(res, session);
  res.json({ user: toAuthUser(user) });
});

authRouter.post('/login', async (req, res) => {
  if (!attemptAllowed(attemptKey('login', req))) return res.status(429).json({ error: 'too many attempts', code: 'rate_limited' });
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = await findUserByEmail(email);
  if (!user?.password_hash || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'invalid email or password', code: 'invalid_credentials' });
  }
  if (requireEmailVerification() && !user.email_verified_at) {
    return res.status(403).json({ error: 'email not verified', code: 'email_unverified' });
  }
  const session = await createSession(user.id);
  setSessionCookie(res, session);
  res.json({ user: toAuthUser(user) });
});

authRouter.post('/logout', async (req, res) => {
  await deleteSession(cookieValue(req.headers.cookie, SESSION_COOKIE));
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', async (req, res) => {
  const user = await currentSessionUser(req);
  if (!user) return res.status(401).json({ error: 'not signed in', code: 'unauthenticated' });
  res.json({ user });
});

// --- Google OAuth 2.0 (authorization code) ---

function googleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim());
}

function googleRedirectUri(): string {
  // Default to the public web origin (AUTH_WEB_ORIGIN): the callback arrives
  // through the Next proxy, where req.host is the backend host, not the site.
  const explicit = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  return explicit || `${webOrigin}/api/auth/google/callback`;
}

authRouter.get('/google/start', (req, res) => {
  if (!googleOAuthConfigured()) return res.status(503).json({ error: 'Google sign-in is not configured', code: 'google_not_configured' });
  const state = randomBytes(24).toString('base64url');
  setOAuthStateCookie(res, state);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!.trim(),
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

authRouter.get('/google/callback', async (req, res) => {
  const lang = readLang(req.query.lang);
  const fail = (reason: string) => res.redirect(302, `${webOrigin}/${lang}/login?google=error&reason=${encodeURIComponent(reason)}`);
  const expectedState = cookieValue(req.headers.cookie, OAUTH_STATE_COOKIE);
  const providedState = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!expectedState || providedState !== expectedState || !code) return fail('state_mismatch');
  res.setHeader('Set-Cookie', `${OAUTH_STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=0`);
  if (!googleOAuthConfigured()) return fail('not_configured');

  let userInfo: { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!.trim(),
        redirect_uri: googleRedirectUri(),
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenResponse.ok) return fail('token_exchange_failed');
    const tokens = (await tokenResponse.json()) as { access_token?: string };
    if (!tokens.access_token) return fail('token_exchange_failed');
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!profileResponse.ok) return fail('profile_failed');
    userInfo = (await profileResponse.json()) as typeof userInfo;
  } catch {
    return fail('network');
  }

  const googleId = userInfo.sub;
  const email = userInfo.email?.trim().toLowerCase();
  if (!googleId || !email) return fail('profile_missing_fields');

  let user = await findUserByGoogleId(googleId);
  if (!user) {
    const existing = await findUserByEmail(email);
    if (existing) {
      // Same verified Google email as a password account: link the identities.
      user = await linkGoogleAccount(existing.id, googleId, userInfo.picture ?? null);
    } else {
      user = await createUser({
        email,
        name: userInfo.name ?? null,
        avatarUrl: userInfo.picture ?? null,
        googleId,
        // Google already verified this email address.
        emailVerified: true,
      });
    }
  }
  if (!user.email_verified_at) user = await markEmailVerified(user.id);
  const session = await createSession(user.id);
  setSessionCookie(res, session);
  res.redirect(302, `${webOrigin}/${lang}/login?google=success`);
});
