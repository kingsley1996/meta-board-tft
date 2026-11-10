import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Import động toàn bộ: static import sẽ khởi tạo pg Pool trước khi đoạn loadEnvFile
// bên dưới kịp đặt DATABASE_URL — cùng lý do với accounts.test.ts.
test('levelFromExp follows the 19-rung ladder of docs/SHRINE-LADDER.md', async () => {
  const { levelFromExp } = await import('./identity.ts');
  assert.deepEqual(levelFromExp(0), { level: 1, title: 'Khai Vận', expNext: 150, realm: 1, realmName: 'Khai Vận', stage: 1 });
  assert.deepEqual(levelFromExp(149), { level: 1, title: 'Khai Vận', expNext: 150, realm: 1, realmName: 'Khai Vận', stage: 1 });
  assert.deepEqual(levelFromExp(150), { level: 2, title: 'Khai Vận', expNext: 350, realm: 1, realmName: 'Khai Vận', stage: 2 });
  // Bậc đầu của vận mới phải là bậc 1: đổi vận phải thấy đổi số, không chỉ đổi tên.
  assert.deepEqual(levelFromExp(650), { level: 4, title: 'Hanh Thông', expNext: 1100, realm: 2, realmName: 'Hanh Thông', stage: 1 });
  assert.deepEqual(levelFromExp(3300), { level: 7, title: 'Cát Khánh', expNext: 3500, realm: 3, realmName: 'Cát Khánh', stage: 1 });
  // 33.000 là đỉnh của thang cũ, cố ý để nó vẫn nằm trên thang mới ở bậc 16: người đã
  // chạm đỉnh cũ còn ba bậc phía trên chứ không rớt về giữa sảnh.
  assert.deepEqual(levelFromExp(33_000), { level: 16, title: 'Đại Cát', expNext: 43_000, realm: 6, realmName: 'Đại Cát', stage: 1 });
  // Trên đỉnh thang thì exp vẫn tăng nhưng vị trí không đổi; mốc kế tiếp là bước nhảy
  // cuối của chính thang (72.000 → 88.000) để thanh tiến độ còn vẽ được.
  assert.deepEqual(levelFromExp(99_999), { level: 19, title: 'Như Ý', expNext: 88_000, realm: 7, realmName: 'Như Ý', stage: 1 });
});

test('rung gaps grow monotonically and every rung round-trips through expForLevel', async () => {
  const { LADDER_SIZE, expForLevel, levelFromExp } = await import('./identity.ts');
  const gaps: number[] = [];
  for (let level = 2; level <= LADDER_SIZE; level += 1) gaps.push(expForLevel(level)! - expForLevel(level - 1)!);
  assert.equal(gaps.length, 18);
  // "Lên bậc nhanh lúc đầu, bậc sau lâu hơn" dịch ra đúng một bất đẳng thức: khoảng
  // cách giữa hai bậc phải lớn hơn khoảng cách trước nó ở mọi bậc. Bảng cũ vi phạm chỗ
  // này (18 bước nhảy gần như đều nhau), nên thang mới không còn gì để nhắm sau tuần đầu.
  assert.ok(gaps.every((g, i) => i === 0 || g > gaps[i - 1]!), `bước nhảy không tăng dần: ${gaps.join(', ')}`);
  // Ba bậc một vận, đỉnh đứng một mình, và mốc của bậc nào đọc lại phải ra đúng bậc đó.
  for (let level = 1; level <= LADDER_SIZE; level += 1) {
    const rung = levelFromExp(expForLevel(level)!);
    assert.equal(rung.level, level, `mốc của bậc ${level} đọc lại ra bậc ${rung.level}`);
    assert.equal(rung.realm, Math.min(7, Math.ceil(level / 3)));
    assert.equal(rung.stage, level === LADDER_SIZE ? 1 : ((level - 1) % 3) + 1);
  }
});

test('toPlayerProfile carries only what the room frame can draw', async () => {
  const { toPlayerProfile } = await import('./identity.ts');
  const profile = {
    userId: randomUUID(),
    playerId: 42,
    name: 'Lữ Khách An Lạc',
    sect: 'flex',
    title: 'Người Thắp Đèn',
    honor: 'Lữ khách cầu may',
    exp: 150,
    sen: 500,
    ngoc: 200,
    duc: 100,
    fruit: 5,
    streak: 1,
    bestStreak: 1,
    appearance: { hero: 'luffy_g5' },
    // Bộ sưu tập đi kèm hình đang mặc: hồ sơ này là một người đã mở đúng một nhân vật.
    heroes: ['luffy_g5'],
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
  assert.equal(wire.name, 'Lữ Khách An Lạc');
  assert.equal(wire.level, 3);
  // sen/ngoc/duc là số liệu riêng tư: chúng không được đi theo avatar.
  assert.equal(Object.keys(wire).sort().join(','), 'appearance,equipped,honor,id,level,name,sect,title');
  // riot là key duy nhất được gắn thêm *sau* bước lọc quyền riêng tư, nên khi không có
  // Riot ID công khai thì nó phải biến mất hẳn chứ không được nằm trên dây với giá trị
  // null/rỗng — một chuỗi rỗng sẽ hiện thành hàng trống trong thẻ người chơi.
  assert.equal(toPlayerProfile(profile, null).riot, undefined);
  assert.equal(Object.keys(toPlayerProfile(profile, null)).length, Object.keys(wire).length);
  assert.equal(toPlayerProfile(profile, 'Leesin#123').riot, 'Leesin#123');
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
      assert.match(profile.name, /^Lữ Khách /);
      assert.ok(profile.name.length <= 28);
      assert.equal(profile.sen, 500);
      assert.equal(profile.ngoc, 200);
      assert.equal(profile.duc, 100);
      assert.equal(profile.sect, 'flex', 'a new profile starts on the flex playstyle, not a sect id');
      assert.equal(profile.equipped.robe, 'ao_lam', 'defaults copied from the original client');
      // Ba id này phải có thật trong meta.json: world.js:474 tra this.items[id].data,
      // nên một id lạ là một người mới không bệ ngồi, không bạn đồng hành.
      assert.equal(profile.equipped.cushion, 'bd_nau');
      assert.equal(profile.equipped.pet, 'lt_huou');
      assert.equal(profile.inventory.lt_huou, 1);
      // Vườn đã bị cắt: gói ngày đầu không được còn hạt giống, nếu không HUD sẽ hiện
      // một món đồ không route nào dùng được nữa.
      assert.equal(profile.inventory.cay_bode, undefined, 'no seeds in the starter pack');
      assert.equal(profile.level, levelFromExp(profile.exp).level);

      // Idempotent: gọi lại không được mọc thêm hồ sơ hay đổi tên đang dùng.
      const again = await ensureTempleProfile(guest.user.id);
      assert.deepEqual(again, profile);

      // Hai khách khác nhau không được trùng player id — frame nhị phân coi trùng id
      // là một người, avatar sẽ đè nhau trong sảnh.
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
        'temple_profiles', 'temple_practice',
        'temple_plants', 'temple_donations', 'temple_greetings', 'temple_friends', 'temple_dms',
        'temple_groups', 'temple_group_members', 'temple_group_messages', 'temple_draws', 'temple_announcements',
      ]],
    );
    assert.equal(rows.length, 12, `missing shrine tables: ${rows.map((r) => r.table_name).join(', ')}`);

    const columns = await pool.query<{ is_nullable: string }>(
      "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_guest'"
    );
    assert.equal(columns.rows[0]?.is_nullable, 'NO', 'users.is_guest exists and cannot be null');
  }
);
