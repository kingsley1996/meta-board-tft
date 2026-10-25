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
