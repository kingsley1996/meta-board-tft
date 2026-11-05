// -- 03 cấp vé · -- 04 xác minh vé (cả hai qua hàm thật trong tickets.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../../.env'));
  } catch {
    // No .env — the tests below skip.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);

// Nhánh hết hạn (15 giây) không được chờ bằng sleep trong test: vé chết vẫn bị từ chối
// qua đúng một cửa `expiresAt > now` như vé lạ, và cửa đó được test ở đây rồi.
test(
  'a temple ws ticket opens exactly one connection',
  { skip: !hasDb },
  async () => {
    const { pool } = await import('../db.ts');
    const { createUser } = await import('../accounts.ts');
    const { issueWsTicket, redeemWsTicket } = await import('./tickets.ts');

    const user = await createUser({ email: `test-${randomUUID()}@example.com`, emailVerified: true });
    try {
      const ticket = await issueWsTicket(user.id);
      assert.ok(ticket?.token, 'the ticket is handed back once');
      assert.equal(ticket?.userId, user.id);
      assert.ok(ticket!.playerId >= 1 && ticket!.playerId <= 4_294_967_295, 'player id fits the u32 frame');
      // Cấp vé cũng dựng hồ sơ chùa cho tài khoản chưa từng vào chùa, nên đường WS
      // không cần một tuyến "tạo hồ sơ" riêng.
      assert.equal(ticket?.profile.userId, user.id);
      assert.ok(ticket!.profile.name.length <= 28);

      assert.deepEqual(redeemWsTicket(ticket!.token), { userId: user.id, playerId: ticket!.playerId });
      // Một vé = một kết nối: nối lại bằng đúng vé vừa dùng phải bị coi như vé giả.
      assert.equal(redeemWsTicket(ticket!.token), null);

      assert.equal(redeemWsTicket('khong-phai-ve-cua-chua'), null);
      assert.equal(redeemWsTicket(null), null);
      assert.equal(redeemWsTicket(''), null);
    } finally {
      await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    }
  }
);
