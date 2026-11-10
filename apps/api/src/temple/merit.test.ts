import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

// PERF-01 (docs/SECURITY-PERFORMANCE-REVIEW.md §4): một lượt cộng điểm chỉ được
// dùng đúng một connection.
//
// db.ts đọc PG_POOL_MAX ngay lúc được import, nên biến này phải vào môi trường
// trước khi động import: cả file chạy với pool một slot. Đây không phải phép đo
// sức chịu tải — đó là cách rẻ nhất để biến "xin thêm slot thứ hai" thành một vụ
// treo nhìn thấy được thay vì một hàng chờ vô hình trong log của pool 8 slot.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../../.env'));
  } catch {
    // Không có .env thì skip cả file.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);
process.env.PG_POOL_MAX = '1';

/** Một request giữ connection rồi đi xin connection thứ hai sẽ chờ tới
 *  `connectionTimeoutMillis` (10s) của pool. Chết ở 3s cho báo lỗi rõ ràng. */
function withinSlotDeadline<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('addMerit is still waiting for a connection: it holds one and asked for a second')), 3_000);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

test(
  'addMerit answers a one-connection pool and returns the row it just committed',
  { skip: !hasDb, timeout: 120_000 },
  async (t) => {
    const { pool } = await import('../db.ts');
    const { ensureTempleTables } = await import('./schema.ts');
    const { createGuest, templeProfile } = await import('./identity.ts');
    const { addMerit } = await import('./merit.ts');

    await ensureTempleTables();
    const guests = await Promise.all([createGuest(), createGuest(), createGuest()]);
    t.after(async () => {
      // user_sessions và temple_profiles cascades theo hàng users.
      await Promise.all(guests.map((guest) => pool.query('DELETE FROM users WHERE id = $1', [guest.user.id])));
    });

    const results = await Promise.all(
      guests.map(async (guest, i) => ({ guest, merit: await withinSlotDeadline(addMerit(guest.user.id, { exp: 10 + i })) })),
    );

    for (const { guest, merit } of results) {
      const gained = merit.gained;
      assert.ok(gained > 0);
      assert.equal(guest.profile.exp + gained, merit.profile.exp, 'the answer carries the gain it just made');
      // Đọc lại bằng pool-level query (không còn client nào giữ): phản hồi và sổ
      // phải là cùng một hàng.
      assert.deepEqual(await templeProfile(guest.user.id), merit.profile, 'the committed row is the row the caller was answered with');
    }

    // Hai nhịp của cùng một người trên pool một slot: cái sau chờ cái trước chứ
    // không ăn đè, và không ai phải giữ hai connection để hoàn tất.
    const one = guests[0];
    const before = (await templeProfile(one.user.id))?.exp ?? 0;
    await Promise.all([withinSlotDeadline(addMerit(one.user.id, { exp: 5 })), withinSlotDeadline(addMerit(one.user.id, { exp: 7 }))]);
    assert.equal((await templeProfile(one.user.id))?.exp, before + 12, 'two concurrent gains add up');
  }
);
