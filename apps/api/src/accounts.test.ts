import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Note: everything imports ./accounts.ts (and ./db.ts) dynamically inside the
// tests — a static import would create the pg Pool before the .env guard below
// loads DATABASE_URL.
test('hashPassword round-trips and rejects wrong passwords', async () => {
  const { hashPassword, verifyPassword } = await import('./accounts.ts');
  const stored = await hashPassword('correct horse battery');
  assert.match(stored, /^scrypt\$\d+\$\d+\$\d+\$/);
  assert.equal(await verifyPassword('correct horse battery', stored), true);
  assert.equal(await verifyPassword('wrong password', stored), false);
  assert.equal(await verifyPassword('correct horse battery', 'not-a-valid-hash'), false);
});

test('requireEmailVerification follows AUTH_REQUIRE_EMAIL_VERIFICATION', async () => {
  const { requireEmailVerification } = await import('./auth-routes.ts');
  const previous = process.env.AUTH_REQUIRE_EMAIL_VERIFICATION;
  try {
    process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = undefined;
    assert.equal(requireEmailVerification(), false);
    process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'false';
    assert.equal(requireEmailVerification(), false);
    process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'true';
    assert.equal(requireEmailVerification(), true);
  } finally {
    process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = previous;
  }
});

test('parseRiotId matches the game-name#tagline shape and refuses to guess', async () => {
  const { formatRiotId, parseRiotId } = await import('./accounts.ts');
  assert.deepEqual(parseRiotId('Leesin#123'), { gameName: 'Leesin', tagline: '123' });
  // Chữ có dấu vẫn là "chữ": người chơi Việt Nam gõ tên tiếng Việt là chuyện thường.
  assert.deepEqual(parseRiotId('TámSao#TFT'), { gameName: 'TámSao', tagline: 'TFT' });
  // Khoảng trắng *hai đầu* là chữ gõ thừa, không phải một phần của danh tính.
  assert.deepEqual(parseRiotId('  Leesin # 123  '), { gameName: 'Leesin', tagline: '123' });
  // Riot cho phép tên hai từ, nên đây là dạng hay gặp nhất của một Riot ID thật.
  assert.deepEqual(parseRiotId('TFTIQ Samuel#1234'), { gameName: 'TFTIQ Samuel', tagline: '1234' });
  // Tên không được chứa '#' nên hai dấu là chuỗi sai, không phải lời mời đoán xem phần
  // nào thuộc về ai.
  assert.equal(parseRiotId('Leesin#1#234'), null);
  assert.equal(parseRiotId('Leesin'), null);
  assert.equal(parseRiotId('Leesin#'), null);
  assert.equal(parseRiotId('#123'), null);
  // 3–16 cho tên (chữ, số, dấu cách đơn), 3–5 cho tag (chữ, số): mọi nhánh ngoài
  // khoảng đều bị từ chối.
  assert.equal(parseRiotId('Le#123'), null);
  assert.equal(parseRiotId('abcdefghijklmnopq#123'), null);
  assert.equal(parseRiotId('Leesin#12'), null);
  assert.equal(parseRiotId('Leesin#123456'), null);
  // Dấu cách chỉ hợp lệ khi nằm GIỮA hai chữ, đúng một lần, và 3–16 tính cả dấu cách.
  // Riot không nhận hai dấu liền nhau hay một tên ba từ vượt khung, nên để lọt thì người
  // khác gõ lại y nguyên cũng không tìm ra bộ đôi đó.
  assert.equal(parseRiotId('TFTIQ  Samuel#1234'), null);
  assert.equal(parseRiotId('TFTIQ Samuel Samuel Samuel#123'), null);
  assert.equal(parseRiotId('Le-esin#123'), null);
  assert.equal(parseRiotId('Leesin#12!'), null);
  for (const junk of [undefined, null, 42, {}, '']) assert.equal(parseRiotId(junk), null);

  assert.equal(formatRiotId({ riot_game_name: 'Leesin', riot_tagline: '123' }), 'Leesin#123');
  // Thiếu một trong hai cột là "chưa nhập", không phải một Riot ID cụt.
  assert.equal(formatRiotId({ riot_game_name: 'Leesin', riot_tagline: null }), null);
  assert.equal(formatRiotId({ riot_game_name: null, riot_tagline: '123' }), null);
  assert.equal(formatRiotId({}), null);
});

// DB-backed tests: skip when no Postgres is configured (same guard as
// conversation-store.test.ts — load the workspace .env before deciding).
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../.env'));
  } catch {
    // No .env — the DB tests below skip.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);

test(
  'account lifecycle: register token → verify → session → logout',
  { skip: !hasDb },
  async () => {
    const { pool } = await import('./db.ts');
    const {
      consumeEmailToken,
      createEmailToken,
      createSession,
      createUser,
      deleteSession,
      ensureAccountTables,
      findUserByEmail,
      hashPassword,
      markEmailVerified,
      sessionUser,
    } = await import('./accounts.ts');

    await ensureAccountTables();
    const email = `test-${randomUUID()}@example.com`;
    const user = await createUser({ email, passwordHash: await hashPassword('password-123') });
    try {
      assert.equal(user.email, email);
      assert.equal(user.email_verified_at, null);

      const token = await createEmailToken(user.id, 'verify_email');
      // Single-use: consuming a copy of the token must not return the user.
      const userId = await consumeEmailToken(token, 'verify_email');
      assert.equal(userId, user.id);
      assert.equal(await consumeEmailToken(token, 'verify_email'), null);

      await markEmailVerified(user.id);
      const verified = await findUserByEmail(email);
      assert.ok(verified?.email_verified_at);

      const session = await createSession(user.id);
      const me = await sessionUser(session);
      assert.equal(me?.id, user.id);
      assert.equal(me?.emailVerified, true);

      await deleteSession(session);
      assert.equal(await sessionUser(session), null);
    } finally {
      await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    }
  }
);

test(
  'a temple guest session is a visitor to the site, never an account',
  { skip: !hasDb },
  async () => {
    const { pool } = await import('./db.ts');
    const { createSession, createUser, deleteSession, hashPassword } = await import('./accounts.ts');
    const { currentAccountUser, currentSessionUser } = await import('./auth-routes.ts');
    const identity = await import('./temple/identity.ts');

    // Both helpers only read req.headers.cookie, so a stub request is enough.
    const withCookie = (token: string) => ({ headers: { cookie: `mb_session=${token}` } }) as never;

    const guest = await identity.createGuest();
    const real = await createUser({ email: `acct-${randomUUID()}@example.com`, passwordHash: await hashPassword('password-123') });
    const realToken = await createSession(real.id);
    try {
      // The hall must still recognize its guest, or the luck points have no owner.
      assert.equal((await currentSessionUser(withCookie(guest.token)))?.isGuest, true);
      // ...but the nav, /profile, the Coach, membership and checkout must treat it as
      // signed out: this row carries a g-…@guest.invalid email, so showing it as an
      // account reads as a stranger the visitor never signed up as.
      assert.equal(await currentAccountUser(withCookie(guest.token)), null);
      assert.equal((await currentAccountUser(withCookie(realToken)))?.id, real.id, 'a real session is still an account');
      assert.equal(await currentAccountUser(withCookie('nonsense')), null);
    } finally {
      await Promise.all([deleteSession(guest.token), deleteSession(realToken)]);
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[guest.user.id, real.id]]);
    }
  }
);

test(
  'role changes are validated and cannot demote the acting admin',
  { skip: !hasDb },
  async () => {
    const { pool } = await import('./db.ts');
    const { createUser, ensureAccountTables, setUserRole } = await import('./accounts.ts');
    await ensureAccountTables();
    const owner = await createUser({ email: `test-${randomUUID()}@example.com`, emailVerified: true, role: 'admin' });
    const editor = await createUser({ email: `test-${randomUUID()}@example.com`, emailVerified: true, role: 'admin' });
    const plain = await createUser({ email: `test-${randomUUID()}@example.com`, emailVerified: true });
    try {
      assert.equal(plain.role, 'user', 'role defaults to user');
      assert.equal((await setUserRole(plain.id, 'admin', owner.id)).ok, true);

      const selfDemotion = await setUserRole(owner.id, 'user', owner.id);
      assert.equal(selfDemotion.ok, false);
      assert.match(selfDemotion.ok ? '' : selfDemotion.error, /own account/);

      const badRole = await setUserRole(owner.id, 'root' as never, editor.id);
      assert.equal(badRole.ok, false);
      assert.match(badRole.ok ? '' : badRole.error, /must be user or admin/);

      assert.deepEqual(await setUserRole('not-a-uuid', 'user', editor.id), { ok: false, error: 'invalid user id' });

      // Two admins are in the table by now, so demoting the other one is allowed.
      assert.equal((await setUserRole(editor.id, 'user', owner.id)).ok, true);
    } finally {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[owner.id, editor.id, plain.id]]);
    }
  }
);

test(
  'listAccountUsers returns exactly the rows the /admin/users table renders',
  { skip: !hasDb },
  async () => {
    const { pool } = await import('./db.ts');
    const { createUser, ensureAccountTables, listAccountUsers } = await import('./accounts.ts');
    await ensureAccountTables();
    // A Google-only account has no password_hash and no name: the page must
    // still render it as a plain "user" row rather than drop or break on it.
    const admin = await createUser({ email: `test-${randomUUID()}@example.com`, name: 'Case Admin', emailVerified: true, role: 'admin' });
    const guest = await createUser({ email: `test-${randomUUID()}@example.com`, googleId: 'case-google-id' });
    try {
      const listed = await listAccountUsers(1000);
      const adminRow = listed.find((row) => row.id === admin.id);
      const guestRow = listed.find((row) => row.id === guest.id);
      assert.equal(adminRow?.email, admin.email);
      assert.equal(adminRow?.name, 'Case Admin');
      assert.equal(adminRow?.role, 'admin');
      assert.equal(guestRow?.name, null);
      assert.equal(guestRow?.role, 'user');
      assert.equal(Object.keys(guestRow ?? {}).sort().join(','), 'createdAt,email,id,name,role');

      assert.match(adminRow?.createdAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
      assert.ok(Date.parse(guestRow?.createdAt ?? '') > 0, 'createdAt parses as an instant');
      // newest first, which is what the operator reads at the top of the page.
      for (let i = 1; i < listed.length; i += 1) {
        assert.ok(Date.parse(listed[i - 1].createdAt) >= Date.parse(listed[i].createdAt), 'joined column is descending');
      }
      assert.equal((await listAccountUsers(1)).length, 1, 'limit caps the read');
    } finally {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[admin.id, guest.id]]);
    }
  }
);

test(
  'setUserRole reports no such user for an id that is valid but absent',
  { skip: !hasDb },
  async () => {
    const { ensureAccountTables, setUserRole } = await import('./accounts.ts');
    await ensureAccountTables();
    // The route maps this exact message to 404; a typo'd or already deleted id
    // must not look like a blocked demotion (409) to the operator.
    const result = await setUserRole(randomUUID(), 'admin', randomUUID());
    assert.deepEqual(result, { ok: false, error: 'no such user' });
  }
);

test(
  'ensureAdminFromEnv never resets an admin that already exists',
  { skip: !hasDb },
  async () => {
    const { pool } = await import('./db.ts');
    const { countAdmins, ensureAccountTables, ensureAdminFromEnv, findUserByEmail } = await import('./accounts.ts');
    await ensureAccountTables();
    const email = `test-${randomUUID()}@example.com`;
    const adminsBefore = await countAdmins();
    try {
      const outcome = await ensureAdminFromEnv(email, 'bootstrap-password');
      if (adminsBefore > 0) {
        // The guard that matters in production: a deployed host still holding
        // the seed env cannot re-create or re-password the owner on every boot.
        assert.equal(outcome, null);
        assert.equal(await findUserByEmail(email), null);
        return;
      }
      assert.deepEqual(outcome, { created: true, updated: false, role: 'admin' });
      const created = await findUserByEmail(email);
      assert.equal(created?.role, 'admin');
      assert.ok(created?.email_verified_at, 'the bootstrap admin signs in without an email link');
      assert.equal(await ensureAdminFromEnv(email, 'other-password'), null);
    } finally {
      await pool.query('DELETE FROM users WHERE email = $1', [email]);
    }
  }
);

test(
  'signed-in users adopt client conversations and see them from any client',
  { skip: !hasDb },
  async () => {
    const { pool } = await import('./db.ts');
    const { createUser, ensureAccountTables } = await import('./accounts.ts');
    const { getOrCreateConversation, listConversations, getConversationHistory, deleteConversation } = await import(
      './assistant/conversation-store.ts'
    );

    await ensureAccountTables();
    const user = await createUser({ email: `test-${randomUUID()}@example.com`, emailVerified: true });
    const deviceA = randomUUID();
    const deviceB = randomUUID();
    try {
      // Conversation created on device A while signed in.
      const conversation = await getOrCreateConversation(undefined, deviceA, 'vi', user.id);
      // A different device signed into the same account still owns it.
      const sameUserOtherDevice = await getOrCreateConversation(conversation.id, deviceB, 'vi', user.id);
      assert.equal(sameUserOtherDevice.id, conversation.id);
      // An anonymous client cannot hijack it.
      const hijack = await getOrCreateConversation(conversation.id, deviceB, 'vi');
      assert.notEqual(hijack.id, conversation.id);

      const listed = await listConversations(deviceB, 20, user.id);
      assert.ok(listed.some((row) => row.id === conversation.id));

      // Ownership: the same user from device B can read; anonymous device B cannot.
      const ownHistory = await getConversationHistory(conversation.id, deviceB, 6, user.id);
      assert.ok(Array.isArray(ownHistory));
      assert.deepEqual(await getConversationHistory(conversation.id, deviceB, 6), []);

      assert.equal(await deleteConversation(conversation.id, deviceB, user.id), true);
      assert.equal(await deleteConversation(conversation.id, deviceB, user.id), false);
    } finally {
      await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    }
  }
);

test(
  'riot id: the pair is what is unique, and a private one never leaves the users table',
  { skip: !hasDb },
  async () => {
    const { pool } = await import('./db.ts');
    const {
      createUser,
      ensureAccountTables,
      findUserByEmail,
      publicRiotId,
      publicRiotIds,
      RiotIdTakenError,
      setRiotId,
      toAuthUser,
    } = await import('./accounts.ts');

    await ensureAccountTables();
    const hidden = await createUser({ email: `riot-a-${randomUUID()}@example.com`, emailVerified: true });
    const shown = await createUser({ email: `riot-b-${randomUUID()}@example.com`, emailVerified: true });
    try {
      await setRiotId(hidden.id, { gameName: 'Leesin', tagline: '123' }, false);
      await setRiotId(shown.id, { gameName: 'Leesin', tagline: '999' }, true);

      // Trùng *tên* là chuyện bình thường — Riot không khoá riêng tên. Chỉ bộ đôi mới bị
      // chỉ mục users_riot_id_key chặn, và chặn cả khi viết hoa khác nhau.
      await assert.rejects(() => setRiotId(shown.id, { gameName: 'leESIN', tagline: '123' }, false), RiotIdTakenError);
      // Cú đụng độ làm hỏng nguyên statement, nên hàng đang public không bị ghi dở: vẫn
      // bộ đôi cũ, vẫn hiện — chứ không phải xoá xong mới chết ở bước đặt cờ.
      assert.equal(await publicRiotId(shown.id), 'Leesin#999');
      // và hàng đang bị giành cũng không vì thế mà lộ ra.
      assert.equal(await publicRiotId(hidden.id), null);

      // Chính tài khoản thì luôn đọc được Riot ID của mình, kể cả khi đang ẩn.
      const ownRow = await findUserByEmail(hidden.email);
      assert.equal(ownRow?.riot_game_name, 'Leesin');
      assert.equal(ownRow?.riot_tagline, '123');
      const own = toAuthUser(ownRow!);
      assert.equal(own.riotId, 'Leesin#123');
      assert.equal(own.riotPublic, false);

      // Đường đọc công khai lọc ngay trong SQL: hàng tắt cờ không rời bảng users.
      assert.equal(await publicRiotId(shown.id), 'Leesin#999');
      assert.deepEqual([...(await publicRiotIds([hidden.id, shown.id]))], [[shown.id, 'Leesin#999']]);

      await setRiotId(hidden.id, { gameName: 'Leesin', tagline: '123' }, true);
      assert.equal((await publicRiotIds([hidden.id, shown.id])).size, 2);

      // Tắt cờ là ẩn ngay lập tức; xoá thì sạch cả hai cột lẫn cờ.
      await setRiotId(shown.id, { gameName: 'Leesin', tagline: '999' }, false);
      assert.equal(await publicRiotId(shown.id), null);
      await setRiotId(shown.id, null);
      const wiped = toAuthUser((await findUserByEmail(shown.email))!);
      assert.equal(wiped.riotId, null);
      assert.equal(wiped.riotPublic, false);
    } finally {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[hidden.id, shown.id]]);
    }
  }
);

