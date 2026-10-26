import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { pool } from './db.ts';

function scryptDerive(password: string | Buffer, salt: string | Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derived) => (error ? reject(error) : resolve(derived)));
  });
}

export type UserRole = 'user' | 'admin';

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
  role: UserRole;
};

export type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  name: string | null;
  avatar_url: string | null;
  google_id: string | null;
  email_verified_at: Date | null;
  role: string;
  created_at: Date;
};

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 } as const;
const SESSION_TTL_DAYS = 30;
const EMAIL_TOKEN_TTL_HOURS = 24;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let tablesReady: Promise<void> | undefined;

// Schema lives in schema.sql too; the runtime ensure keeps fresh databases and
// older deployments working without a manual migration step.
export function ensureAccountTables(): Promise<void> {
  tablesReady ??= (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY,
        email text NOT NULL UNIQUE,
        password_hash text,
        name text,
        avatar_url text,
        google_id text UNIQUE,
        email_verified_at timestamptz,
        role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'))
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        token_hash text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_tokens (
        token_hash text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        purpose text NOT NULL CHECK (purpose IN ('verify_email', 'password_reset')),
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL
      )
    `);
    await pool.query(`
      ALTER TABLE assistant_conversations ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE SET NULL
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS assistant_conversations_user_id_idx ON assistant_conversations (user_id, updated_at DESC)');
  })();
  return tablesReady;
}

// --- Passwords (scrypt, no external dependency) ---

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptDerive(password, salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  });
  return ['scrypt', SCRYPT_PARAMS.N, SCRYPT_PARAMS.r, SCRYPT_PARAMS.p, salt.toString('base64'), derived.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const derived = await scryptDerive(password, Buffer.from(saltB64, 'base64'), Buffer.from(hashB64, 'base64').byteLength, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  const expected = Buffer.from(hashB64, 'base64');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// --- Opaque tokens (session cookies, email links) ---

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// --- Users ---

export function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    emailVerified: row.email_verified_at !== null,
    hasPassword: row.password_hash !== null,
    role: row.role === 'admin' ? 'admin' : 'user',
  };
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
  return rows[0] ?? null;
}

export async function findUserByGoogleId(googleId: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE google_id = $1', [googleId]);
  return rows[0] ?? null;
}

export async function createUser(input: {
  email: string;
  passwordHash?: string | null;
  name?: string | null;
  googleId?: string | null;
  avatarUrl?: string | null;
  emailVerified?: boolean;
  role?: UserRole;
}): Promise<UserRow> {
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (id, email, password_hash, name, avatar_url, google_id, email_verified_at, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      randomUUID(),
      input.email.trim().toLowerCase(),
      input.passwordHash ?? null,
      input.name?.trim() || null,
      input.avatarUrl ?? null,
      input.googleId ?? null,
      input.emailVerified ? new Date() : null,
      input.role ?? 'user',
    ],
  );
  return rows[0];
}

export async function linkGoogleAccount(userId: string, googleId: string, avatarUrl: string | null): Promise<UserRow> {
  const { rows } = await pool.query<UserRow>(
    `UPDATE users SET google_id = $2, avatar_url = COALESCE($3, avatar_url), email_verified_at = COALESCE(email_verified_at, now())
     WHERE id = $1 RETURNING *`,
    [userId, googleId, avatarUrl],
  );
  return rows[0];
}

export async function markEmailVerified(userId: string): Promise<UserRow> {
  const { rows } = await pool.query<UserRow>(
    'UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1 RETURNING *',
    [userId],
  );
  return rows[0];
}

// --- Admin bootstrap & role management ---

export async function countAdmins(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>("SELECT count(*) AS n FROM users WHERE role = 'admin'");
  return Number(rows[0]?.n ?? 0);
}

// Creates or adopts the account named by ADMIN_EMAIL and gives it the seed
// password, but only while no admin exists. That condition is what keeps a
// deployment from silently resetting the owner's password on every boot — after
// the first admin appears, the env vars can be deleted.
export async function ensureAdminFromEnv(
  email: string,
  password: string,
  name = 'Admin'
): Promise<{ created: boolean; updated: boolean; role: UserRole } | null> {
  if (await countAdmins()) return null;
  const normalized = email.trim().toLowerCase();
  const existing = await findUserByEmail(normalized);
  if (existing) {
    await pool.query("UPDATE users SET role = 'admin', password_hash = $2, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1", [
      existing.id,
      await hashPassword(password),
    ]);
    return { created: false, updated: true, role: 'admin' };
  }
  await createUser({ email: normalized, passwordHash: await hashPassword(password), name, emailVerified: true, role: 'admin' });
  return { created: true, updated: false, role: 'admin' };
}

export type AdminUserEntry = { id: string; email: string; name: string | null; role: UserRole; createdAt: string };

export async function listAccountUsers(limit = 200): Promise<AdminUserEntry[]> {
  const { rows } = await pool.query<{ id: string; email: string; name: string | null; role: string; created_at: Date }>(
    'SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role === 'admin' ? 'admin' : 'user',
    createdAt: row.created_at.toISOString(),
  }));
}

// The actor is required so an admin cannot demote themself and, with only one
// admin in the database, lock everyone out of /admin.
export async function setUserRole(
  userId: string,
  role: UserRole,
  actorId: string
): Promise<{ ok: true; user: AdminUserEntry } | { ok: false; error: string }> {
  if (!UUID_PATTERN.test(userId)) return { ok: false, error: 'invalid user id' };
  if (role !== 'user' && role !== 'admin') return { ok: false, error: 'role must be user or admin' };
  if (role === 'user' && userId === actorId) {
    return { ok: false, error: 'you cannot demote your own account' };
  }
  if (role === 'user' && (await countAdmins()) <= 1) {
    const { rows } = await pool.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
    if (rows[0]?.role === 'admin') return { ok: false, error: 'the last admin cannot be demoted' };
  }
  const { rows } = await pool.query<{ id: string; email: string; name: string | null; role: string; created_at: Date }>(
    'UPDATE users SET role = $2 WHERE id = $1 RETURNING id, email, name, role, created_at',
    [userId, role]
  );
  const row = rows[0];
  if (!row) return { ok: false, error: 'no such user' };
  return {
    ok: true,
    user: { id: row.id, email: row.email, name: row.name, role: row.role === 'admin' ? 'admin' : 'user', createdAt: row.created_at.toISOString() },
  };
}

// --- Sessions ---

export async function createSession(userId: string): Promise<string> {
  const token = newToken();
  await pool.query(
    `INSERT INTO user_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3))`,
    [hashToken(token), userId, SESSION_TTL_DAYS],
  );
  return token;
}

export async function sessionUser(token: string | undefined): Promise<AuthUser | null> {
  if (!token || !/^[A-Za-z0-9_-]{40,128}$/.test(token)) return null;
  const { rows } = await pool.query<UserRow>(
    `SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ? toAuthUser(rows[0]) : null;
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await pool.query('DELETE FROM user_sessions WHERE token_hash = $1', [hashToken(token)]);
}

// --- Email tokens (verification, later password reset) ---

export async function createEmailToken(userId: string, purpose: 'verify_email' | 'password_reset'): Promise<string> {
  await pool.query('DELETE FROM email_tokens WHERE user_id = $1 AND purpose = $2', [userId, purpose]);
  const token = newToken();
  await pool.query(
    `INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(hours => $4))`,
    [hashToken(token), userId, purpose, EMAIL_TOKEN_TTL_HOURS],
  );
  return token;
}

export async function consumeEmailToken(
  token: string,
  purpose: 'verify_email' | 'password_reset',
): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) return null;
  const { rows } = await pool.query<{ user_id: string }>(
    `DELETE FROM email_tokens WHERE token_hash = $1 AND purpose = $2 AND expires_at > now() RETURNING user_id`,
    [hashToken(token), purpose],
  );
  const userId = rows[0]?.user_id;
  return userId && UUID_PATTERN.test(userId) ? userId : null;
}
