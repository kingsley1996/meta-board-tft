import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Import động toàn bộ: static import sẽ khởi tạo pg Pool trước khi đoạn loadEnvFile
// bên dưới kịp đặt DATABASE_URL — cùng lý do với accounts.test.ts.
test('levelFromExp follows the ladder of the original client', async () => {
  const { levelFromExp } = await import('./identity.ts');
  assert.deepEqual(levelFromExp(0), { level: 1, title: 'Phật tử Sơ Tâm', expNext: 50 });
  assert.deepEqual(levelFromExp(49), { level: 1, title: 'Phật tử Sơ Tâm', expNext: 50 });
  assert.deepEqual(levelFromExp(50), { level: 2, title: 'Phật tử Tinh Tấn', expNext: 150 });
  assert.deepEqual(levelFromExp(1600), { level: 7, title: 'Bồ Tát Giữa Đời', expNext: 2600 });
  // Trên bậc chót thì exp vẫn tăng nhưng bậc không đổi; mốc kế tiếp chỉ là chỗ
  // trống để thanh tiến độ còn vẽ được.
  assert.deepEqual(levelFromExp(99_999), { level: 7, title: 'Bồ Tát Giữa Đời', expNext: 2600 });
});

test('toPlayerProfile carries only what the room frame can draw', async () => {
  const { toPlayerProfile } = await import('./identity.ts');
  const profile = {
    userId: randomUUID(),
    playerId: 42,
    name: 'Phật Tử An Lạc',
    sect: 'tinhdo',
    title: 'Cư sĩ Thanh Tịnh',
    honor: 'Tâm Sáng Như Sen',
    exp: 150,
    sen: 500,
    ngoc: 200,
    duc: 100,
    fruit: 5,
    streak: 1,
    bestStreak: 1,
    appearance: { hero: 'luffy_g5' },
    equipped: { robe: 'ao_lam', hat: null },
    inventory: { pet_nai: 1 },
    noChan: false,
    level: 3,
    expNext: 320,
    buffUntil: null,
    meditateStart: null,
  };
  const wire = toPlayerProfile(profile);
  assert.equal(wire.id, 42);
  assert.equal(wire.name, 'Phật Tử An Lạc');
  assert.equal(wire.level, 3);
  // sen/ngoc/duc là số liệu riêng tư: chúng không được đi theo avatar.
  assert.equal(Object.keys(wire).sort().join(','), 'appearance,equipped,honor,id,level,name,sect,title');
});

// --- DB-backed ---
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../../.env'));
  } catch {
    // No .env — the tests below skip.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);

test(
  'guest identity: session, profile seeding, and promote-in-place keeps the same user id',
  { skip: !hasDb },
  async () => {
    const { pool } = await import('../db.ts');
    const { createUser, hashPassword, promoteGuest, sessionUser, toAuthUser, verifyPassword } = await import('../accounts.ts');
    const { createGuest, ensureTempleProfile, levelFromExp, templeProfile } = await import('./identity.ts');

    const guest = await createGuest();
    const others: string[] = [];
    try {
      assert.equal(guest.user.is_guest, true, 'the row is flagged as a guest');
      assert.equal(guest.user.password_hash, null, 'a guest has no password');
      assert.match(guest.user.email, /^g-[0-9a-f]{18}@guest\.invalid$/);

      const me = await sessionUser(guest.token);
      assert.equal(me?.id, guest.user.id);
      assert.equal(me?.isGuest, true, 'the session reports guest status so /register can adopt it');
      assert.equal(toAuthUser(guest.user).isGuest, true);

      const profile = guest.profile;
      assert.equal(profile.userId, guest.user.id);
      assert.ok(profile.playerId >= 1 && profile.playerId <= 4_294_967_295, 'player id fits the u32 frame');
      assert.match(profile.name, /^Phật Tử /);
      assert.ok(profile.name.length <= 28);
      assert.equal(profile.sen, 500);
      assert.equal(profile.ngoc, 200);
      assert.equal(profile.duc, 100);
      assert.equal(profile.equipped.robe, 'ao_lam', 'defaults copied from the original client');
      // Ba id này phải có thật trong meta.json: world.js:474 tra this.items[id].data,
      // nên một id lạ là một người mới không bồ đoàn, không bạn đồng hành.
      assert.equal(profile.equipped.cushion, 'bd_nau');
      assert.equal(profile.equipped.pet, 'lt_huou');
      assert.equal(profile.inventory.lt_huou, 1);
      assert.equal(profile.inventory.cay_bode, 3);
      assert.equal(profile.level, levelFromExp(profile.exp).level);

      // Idempotent: gọi lại không được mọc thêm hồ sơ hay đổi tên đang dùng.
      const again = await ensureTempleProfile(guest.user.id);
      assert.deepEqual(again, profile);

      // Hai khách khác nhau không được trùng player id — frame nhị phân coi trùng id
      // là một người, avatar sẽ đè nhau trong chánh điện.
      const other = await createGuest();
      others.push(other.user.id);
      assert.notEqual(other.profile.playerId, profile.playerId);

      // Đăng ký: nâng cấp tại chỗ, vẫn users.id cũ nên hồ sơ còn nguyên.
      const password = 'a-password-123';
      const promoted = await promoteGuest(guest.user.id, {
        email: `test-${randomUUID()}@example.com`,
        passwordHash: await hashPassword(password),
        name: 'Người Đăng Ký',
      });
      assert.ok(promoted);
      assert.equal(promoted.id, guest.user.id);
      assert.equal(promoted.is_guest, false);
      assert.equal(promoted.name, 'Người Đăng Ký');
      assert.equal(await verifyPassword(password, promoted.password_hash ?? ''), true);
      assert.deepEqual(await templeProfile(guest.user.id), profile, 'merit survives the upgrade');

      // Không có đường nâng cấp một tài khoản thật: WHERE chặn is_guest = false.
      const real = await createUser({ email: `test-${randomUUID()}@example.com`, emailVerified: true });
      others.push(real.id);
      assert.equal(await promoteGuest(real.id, { email: `test-${randomUUID()}@example.com`, passwordHash: 'x' }), null);
      assert.equal((await pool.query('SELECT 1 FROM users WHERE id = $1', [real.id])).rowCount, 1);
    } finally {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[guest.user.id, ...others]]);
    }
  }
);

test(
  'the temple schema in src/temple/schema.sql is the one the runtime applies',
  { skip: !hasDb },
  async () => {
    const { pool } = await import('../db.ts');
    const { ensureTempleTables } = await import('./schema.ts');
    await ensureTempleTables();
    // Nếu DDL nằm ở một nơi khác nữa thì hai bản sẽ lệch dần; các bảng dưới chỉ tồn
    // tại vì schema.sql được chạy thật.
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [[
        'temple_profiles', 'temple_practice', 'temple_lanterns', 'temple_lantern_rejoices',
        'temple_plants', 'temple_donations', 'temple_greetings', 'temple_friends', 'temple_dms',
        'temple_groups', 'temple_group_members', 'temple_group_messages', 'temple_draws', 'temple_announcements',
      ]],
    );
    assert.equal(rows.length, 14, `missing shrine tables: ${rows.map((r) => r.table_name).join(', ')}`);

    const columns = await pool.query<{ is_nullable: string }>(
      "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_guest'"
    );
    assert.equal(columns.rows[0]?.is_nullable, 'NO', 'users.is_guest exists and cannot be null');
  }
);
