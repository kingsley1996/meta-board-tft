// Gate SEC-02 (docs/SECURITY-PERFORMANCE-REVIEW.md §2): chính sách liên kết Google.
// Callback chạy qua router HTTP thật; Google giả lập bằng fetch stub. Cả ba ca cần
// Postgres dev (DATABASE_URL, cùng quy ước skip của accounts.test.ts): hai ca ghép
// dựa trên ngữ nghĩa SQL thật của UPDATE...CASE, còn ca từ chối email chưa xác
// minh vẫn phải đi qua middleware ensureAccountTables.
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import type { Server } from 'node:http';
import express from 'express';

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../.env'));
  } catch {
    // Không có .env thì skip cả file.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);

const PASSWORD = 'password-123';

async function startRouter(): Promise<{ server: Server; base: string }> {
  const { authRouter } = await import('./auth-routes.ts');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  const server: Server = app.listen(0);
  await new Promise((res) => server.once('listening', res));
  return { server, base: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
}

function stubGoogle(t: TestContext, email: string, emailVerified: boolean) {
  t.mock.method(globalThis, 'fetch', async (url: string | URL) => {
    const href = String(url);
    if (href === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'fake-access-token', expires_in: 3600 });
    }
    if (href === 'https://openidconnect.googleapis.com/v1/userinfo') {
      return Response.json({
        sub: `sub-${email.split('@')[0]}`,
        email,
        email_verified: emailVerified,
        name: 'Link Case',
      });
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
}

async function getOnce(base: string, path: string, cookie?: string): Promise<{ status: number; location?: string; headers: IncomingHttpHeaders }> {
  const { port } = new URL(base);
  const res = await new Promise<{ status: number; headers: IncomingHttpHeaders; location?: string }>((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: Number(port), path, headers: cookie ? { cookie } : {} }, (response) => {
      response.resume();
      response.on('end', () =>
        resolve({ status: response.statusCode ?? 0, headers: response.headers, location: response.headers.location })
      );
    });
    req.on('error', reject);
    req.end();
  });
  return res;
}

async function oauthStart(base: string): Promise<{ state: string; cookie: string }> {
  // node:http thay vì fetch: fetch đã bị stub Google chiếm chỗ trong mock registry.
  const start = await getOnce(base, '/api/auth/google/start');
  const state = new URL(start.location ?? '/').searchParams.get('state');
  const cookie = (start.headers['set-cookie']?.[0] ?? '').split(';')[0];
  assert.ok(state && cookie.startsWith('mb_oauth_state='), 'start must hand out a state cookie');
  return { state, cookie };
}

async function callback(base: string, state: string, cookie: string) {
  return getOnce(base, `/api/auth/google/callback?code=fake-code&state=${state}&lang=vi`, cookie);
}

function sessionToken(res: { headers: IncomingHttpHeaders }): string {
  for (const value of res.headers['set-cookie'] ?? []) {
    const match = /^mb_session=([^;]+)/.exec(value);
    if (match) return match[1];
  }
  return '';
}

function locationOf(res: { location?: string }): URL {
  return new URL(res.location ?? 'http://invalid.invalid');
}

test(
  'Google linking only trusts verified emails and never keeps an unclaimed password',
  { skip: !hasDb, concurrency: false, timeout: 240_000 },
  async (t) => {
    const { pool } = await import('./db.ts');
    const accounts = await import('./accounts.ts');
    await accounts.ensureAccountTables();
    const previous = {
      GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    };
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
    const { server, base } = await startRouter();
    const userIds: string[] = [];

    try {
      // --- email chưa xác minh: callback phải chết trước mọi thao tác account ----
      await t.test('email_verified=false redirects with a reason and changes nothing', async () => {
        const usersBefore = (await pool.query<{ n: string }>('SELECT count(*)::int AS n FROM users')).rows[0].n;
        stubGoogle(t, 'not-verified@example.com', false);
        const { state, cookie } = await oauthStart(base);
        const res = await callback(base, state, cookie);
        assert.equal(res.status, 302);
        assert.equal(locationOf(res).searchParams.get('reason'), 'email_not_verified');
        assert.equal(sessionToken(res), '', 'no session may be handed out');
        const usersAfter = (await pool.query<{ n: string }>('SELECT count(*)::int AS n FROM users')).rows[0].n;
        assert.equal(usersAfter, usersBefore, 'the rejected callback must not create or link anyone');
      });

      // --- hàng local CHƯA xác minh + có mật khẩu: ghép là cắt credential ---------
      await t.test('linking an unverified password account drops the password and its sessions', async () => {
        const email = `sec02-unverified-${randomUUID()}@example.com`;
        const local = await accounts.createUser({ email, passwordHash: await accounts.hashPassword(PASSWORD) });
        userIds.push(local.id);
        const oldToken = await accounts.createSession(local.id);

        stubGoogle(t, email, true);
        const { state, cookie } = await oauthStart(base);
        const res = await callback(base, state, cookie);
        assert.equal(res.status, 302);
        assert.equal(locationOf(res).searchParams.get('google'), 'success');

        const linked = await accounts.findUserByEmail(email);
        assert.ok(linked?.google_id, 'the identities are linked');
        assert.ok(linked?.email_verified_at, 'Google proof marks the email verified');
        assert.equal(linked?.password_hash, null, 'the never-proven password must not survive linking');
        assert.equal(await accounts.sessionUser(oldToken), null, 'sessions minted before the takeover are revoked');
        const freshToken = sessionToken(res);
        assert.ok(freshToken.length > 0, 'the linking itself signs the Google owner in');
        assert.equal((await accounts.sessionUser(freshToken))?.id, local.id);
      });

      // --- hàng local ĐÃ xác minh: chủ nhân chứng minh hai lần, giữ nguyên --------
      await t.test('linking a verified password account keeps the password and its sessions', async () => {
        const email = `sec02-verified-${randomUUID()}@example.com`;
        const local = await accounts.createUser({ email, passwordHash: await accounts.hashPassword(PASSWORD), emailVerified: true });
        userIds.push(local.id);
        const keepToken = await accounts.createSession(local.id);

        stubGoogle(t, email, true);
        const { state, cookie } = await oauthStart(base);
        const res = await callback(base, state, cookie);
        assert.equal(locationOf(res).searchParams.get('google'), 'success');

        const linked = await accounts.findUserByEmail(email);
        assert.ok(linked?.google_id, 'the identities are linked');
        assert.notEqual(linked?.password_hash, null, 'an email the owner already proved keeps its password');
        assert.equal((await accounts.sessionUser(keepToken))?.id, local.id, 'existing sessions stay alive');
      });
    } finally {
      process.env.GOOGLE_OAUTH_CLIENT_ID = previous.GOOGLE_OAUTH_CLIENT_ID;
      process.env.GOOGLE_OAUTH_CLIENT_SECRET = previous.GOOGLE_OAUTH_CLIENT_SECRET;
      server.close();
      if (userIds.length > 0) {
        // user_sessions và email_tokens có ON DELETE CASCADE — xoá users là dọn hết.
        await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
      }
    }
  }
);
