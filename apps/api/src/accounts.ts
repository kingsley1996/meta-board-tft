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
  isGuest: boolean;
  // Riot ID của chính tài khoản này, dạng 'GameName#TAG'. null = chưa nhập.
  riotId: string | null;
  // Cờ "Hiện Riot ID": chỉ quyết định người *khác* có thấy riotId không, còn bản thân
  // tài khoản thì luôn đọc được giá trị của mình.
  riotPublic: boolean;
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
  is_guest: boolean;
  riot_game_name: string | null;
  riot_tagline: string | null;
  riot_public: boolean;
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
        is_guest boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'))
    `);
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS riot_game_name text');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS riot_tagline text');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS riot_public boolean NOT NULL DEFAULT false');
    // Chỉ bộ đôi tên+tag là duy nhất (và duy nhất trên toàn Riot, không phải trên site),
    // nên chỉ mục khoá cặp đó; hàng chưa nhập Riot ID phải nằm ngoài.
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_riot_id_key
      ON users (lower(riot_game_name), lower(riot_tagline))
      WHERE riot_game_name IS NOT NULL AND riot_tagline IS NOT NULL
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
  })().catch((error: unknown) => {
    // ensureTempleTables chờ lời hứa này, nên cache một lần reject là khóa luôn chùa
    // cho tới khi restart: lỗi DDL phải được thử lại ở request sau.
    tablesReady = undefined;
    throw error;
  });
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
    isGuest: row.is_guest === true,
    riotId: formatRiotId(row),
    riotPublic: row.riot_public === true,
  };
}

// --- Riot ID -----------------------------------------------------------------------
// Khuôn Riot công bố: [Tên Trò Chơi]#[Khẩu hiệu] — tên 3–16 ký tự chữ+số, khẩu hiệu
// 3–5 ký tự chữ+số. Bộ ĐÔI mới là thứ duy nhất (trên toàn Riot, không phải trên site),
// còn tên thì trùng được; nên site chỉ khoá được bộ đôi (users_riot_id_key), không
// khoá riêng tên. Cờ `riot_public` quyết định một người *khác* có thấy nó không.
// Tên trò chơi của Riot CHO PHÉP dấu cách ("TFTIQ Samuel" là một Riot ID thật), nên luật
// cũ "chỉ chữ và số" chặn oan người có hai từ. 3–16 vẫn là độ dài tính CẢ dấu cách, và
// dấu cách chỉ đứng giữa hai chữ, một lần: đầu/cuôi thừa dấu hay hai dấu liền nhau thì
// Riot từ chối, lưu vào thì người khác gõ lại cũng không tìm ra đúng bộ đôi đó.
const RIOT_NAME = /^(?=[\p{L}\p{N} ]{3,16}$)[\p{L}\p{N}](?: ?[\p{L}\p{N}])+$/u;
const RIOT_TAG = /^[\p{L}\p{N}]{3,5}$/u;

export type RiotId = { gameName: string; tagline: string };

// Dấu '#' cuối chia hai phần: tên không được chứa '#' nên một chuỗi có nhiều dấu là
// chuỗi sai, không phải lời mời đoán. Trả null cho cả hai nhánh "bịa" và "thiếu".
export function parseRiotId(value: unknown): RiotId | null {
  if (typeof value !== 'string') return null;
  const at = value.lastIndexOf('#');
  if (at < 0) return null;
  const gameName = value.slice(0, at).trim();
  const tagline = value.slice(at + 1).trim();
  return RIOT_NAME.test(gameName) && RIOT_TAG.test(tagline) ? { gameName, tagline } : null;
}

// Dạng hiển thị duy nhất được phép đi trên dây. Hai cột để rời thì mới có thể làm
// trống cả bộ; thiếu một trong hai là chưa nhập, không phải "nửa cái Riot ID".
export function formatRiotId(row: { riot_game_name?: string | null; riot_tagline?: string | null }): string | null {
  return row.riot_game_name && row.riot_tagline ? `${row.riot_game_name}#${row.riot_tagline}` : null;
}

// Chỉ những tuyến *cho người khác xem* mới được hỏi hàm này, và bộ lọc nằm trong SQL:
// hàng riot_public = false không bao giờ rời database, nên không có nhánh đọc nào vô
// tình phát tán một Riot ID riêng tư rồi mới nhớ ra phải xoá.
export async function publicRiotIds(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (!unique.length) return new Map();
  const { rows } = await pool.query<{ id: string; riot_game_name: string | null; riot_tagline: string | null }>(
    'SELECT id, riot_game_name, riot_tagline FROM users WHERE riot_public AND id = ANY($1::uuid[])',
    [unique],
  );
  return new Map(
    rows
      .map((r): [string, string | null] => [r.id, formatRiotId(r)])
      .filter((e): e is [string, string] => e[1] !== null),
  );
}

export async function publicRiotId(userId: string): Promise<string | null> {
  return (await publicRiotIds([userId])).get(userId) ?? null;
}

export class RiotIdTakenError extends Error {}

// null là XOÁ chứ không phải "giấu": một Riot ID rỗng mà còn treo cờ public thì để làm gì.
export async function setRiotId(userId: string, id: RiotId | null, isPublic = false): Promise<void> {
  if (!id) {
    await pool.query('UPDATE users SET riot_game_name = NULL, riot_tagline = NULL, riot_public = false WHERE id = $1', [userId]);
    return;
  }
  try {
    await pool.query('UPDATE users SET riot_game_name = $2, riot_tagline = $3, riot_public = $4 WHERE id = $1', [
      userId,
      id.gameName,
      id.tagline,
      isPublic,
    ]);
  } catch (error) {
    // 23505 = unique_violation trên users_riot_id_key: bộ đôi đó đã có người nhận trước.
    throw (error as { code?: string }).code === '23505' ? new RiotIdTakenError('riot id already claimed') : error;
  }
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
  isGuest?: boolean;
}): Promise<UserRow> {
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (id, email, password_hash, name, avatar_url, google_id, email_verified_at, role, is_guest)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
      input.isGuest ?? false,
    ],
  );
  return rows[0];
}

// Một người vào chùa lần đầu được cấp hàng users với is_guest (email giả, không mật
// khẩu). Khi họ đăng ký, nâng cấp chính hàng đó thay vì tạo hàng mới: công đức, cây,
// bạn bè đều tham chiếu users.id nên chúng ở lại nguyên vẹn.
// Điều kiện is_guest trong WHERE chặn hai ca: nâng cấp lại một tài khoản thật (là
// đường đè mật khẩu của người khác) và hai tab khách cùng giành một email.
// email_verified_at không đổi ở đây — route /register quyết định, giống hệt nhánh
// tạo tài khoản mới.
export async function promoteGuest(
  userId: string,
  input: { email: string; passwordHash: string; name?: string | null }
): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    `UPDATE users
        SET email = $2, password_hash = $3, name = COALESCE($4, name), is_guest = false
      WHERE id = $1 AND is_guest = true
      RETURNING *`,
    [userId, input.email.trim().toLowerCase(), input.passwordHash, input.name?.trim() || null],
  );
  return rows[0] ?? null;
}

export async function linkGoogleAccount(userId: string, googleId: string, avatarUrl: string | null): Promise<UserRow> {
  // Một hàng users chưa từng xác minh email qua hộp thư của chính người đăng ký
  // (email_verified_at rỗng) nghĩa là mật khẩu trên đó chưa ai chứng minh là chủ
  // inbox — thường nhất là kẻ đăng ký trước email. Google vừa trả email_verified,
  // quyền sở hữu thuộc về người dùng Google: cắt credential cũ (mật khẩu + mọi
  // phiên đã cấp). Hàng đã xác minh email từ trước thì chủ nhân đã chứng minh sở
  // hữu hai lần, nên mật khẩu và session ở lại.
  const { rows: before } = await pool.query<Pick<UserRow, 'email_verified_at' | 'password_hash'>>(
    'SELECT email_verified_at, password_hash FROM users WHERE id = $1',
    [userId],
  );
  const wasUnclaimed = before[0] && before[0].email_verified_at === null;
  const { rows } = await pool.query<UserRow>(
    `UPDATE users
        SET google_id = $2,
            avatar_url = COALESCE($3, avatar_url),
            email_verified_at = COALESCE(email_verified_at, now()),
            password_hash = CASE WHEN $4::boolean THEN NULL ELSE password_hash END
      WHERE id = $1
      RETURNING *`,
    [userId, googleId, avatarUrl, wasUnclaimed === true],
  );
  if (wasUnclaimed) {
    await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
  }
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
