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

// Nhánh hết hạn (15 giây) không được chờ bằng sleep trong test: đồng hồ của riêng test
// bị quay tới sau TTL, vẫn đi qua đúng một cửa `expiresAt > now` như máy chủ thật.
test(
  'a temple ws ticket opens exactly one connection',
  { skip: !hasDb },
  async () => {
    const { pool } = await import('../db.ts');
    const { createUser } = await import('../accounts.ts');
    const { issueWsTicket, redeemWsTicket, LIVE_TICKETS_PER_USER } = await import('./tickets.ts');

    const user = await createUser({ email: `test-${randomUUID()}@example.com`, emailVerified: true });
    try {
      const issued = await issueWsTicket(user.id);
      assert.ok(issued.ok, 'the ticket is handed back once');
      const ticket = issued.ticket;
      assert.equal(ticket.userId, user.id);
      assert.ok(ticket.playerId >= 1 && ticket.playerId <= 4_294_967_295, 'player id fits the u32 frame');
      // Cấp vé cũng dựng hồ sơ chùa cho tài khoản chưa từng vào chùa, nên đường WS
      // không cần một tuyến "tạo hồ sơ" riêng.
      assert.equal(ticket.profile.userId, user.id);
      assert.ok(ticket.profile.name.length <= 28);

      assert.deepEqual(redeemWsTicket(ticket.token), { ok: true, holder: { userId: user.id, playerId: ticket.playerId } });
      // Một vé = một kết nối: nối lại bằng đúng vé vừa dùng phải bị coi như vé giả.
      assert.deepEqual(redeemWsTicket(ticket.token), { ok: false, reason: 'unknown' });

      assert.deepEqual(redeemWsTicket('khong-phai-ve-cua-chua'), { ok: false, reason: 'unknown' });
      assert.deepEqual(redeemWsTicket(null), { ok: false, reason: 'absent' });
      assert.deepEqual(redeemWsTicket(''), { ok: false, reason: 'absent' });
    } finally {
      await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    }
  }
);

// Máy chậm dựng cảnh mở socket sau khi vé quá TTL. Nhánh đó phải trả 'expired' chứ
// không phải 'unknown' vì ws.ts đổi nó thành một code để máy khách thử lại; vé của
// người gõ tay một chuỗi bịa ra thì vẫn là 'unknown' và bị chặn vĩnh viễn.
// Không sleep chờ TTL: quay đồng hồ của riêng test, đúng chỗ `expiresAt > now`.
test(
  'a ticket that aged out is reported as expired, not as a forgery',
  { skip: !hasDb },
  async () => {
    const { pool } = await import('../db.ts');
    const { createUser } = await import('../accounts.ts');
    const { issueWsTicket, redeemWsTicket, TICKET_TTL_MS } = await import('./tickets.ts');

    const user = await createUser({ email: `test-${randomUUID()}@example.com`, emailVerified: true });
    const realNow = Date.now;
    try {
      const issued = await issueWsTicket(user.id);
      assert.ok(issued.ok);
      Date.now = () => realNow() + TICKET_TTL_MS + 1_000;
      assert.deepEqual(redeemWsTicket(issued.ticket.token), { ok: false, reason: 'expired' });
      // Vé hết hạn vẫn bị đốt: lần thử tiếp theo là 'unknown', không phải vòng lặp
      // 'expired' mãi mãi trên cùng một chuỗi.
      Date.now = realNow;
      assert.deepEqual(redeemWsTicket(issued.ticket.token), { ok: false, reason: 'unknown' });
    } finally {
      Date.now = realNow;
      await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    }
  }
);

// Trần thay cho giới hạn theo IP: đếm số vé *một người* đang giữ mà chưa nối, nên một
// phòng máy cùng reconnect sau lần deploy không bị chặn, còn kẻ đốt vé thì tự khoá
// chính mình trong đúng TTL.
test(
  'a user can only hold a few unredeemed tickets',
  { skip: !hasDb },
  async () => {
    const { pool } = await import('../db.ts');
    const { createUser } = await import('../accounts.ts');
    const { issueWsTicket, redeemWsTicket, LIVE_TICKETS_PER_USER } = await import('./tickets.ts');

    const user = await createUser({ email: `test-${randomUUID()}@example.com`, emailVerified: true });
    const other = await createUser({ email: `test-${randomUUID()}@example.com`, emailVerified: true });
    const tokens: string[] = [];
    try {
      for (let i = 0; i < LIVE_TICKETS_PER_USER; i++) {
        const issued = await issueWsTicket(user.id);
        assert.ok(issued.ok, `ticket ${i + 1} of the allowance is still granted`);
        tokens.push(issued.ticket.token);
      }
      const blocked = await issueWsTicket(user.id);
      assert.deepEqual(blocked, { ok: false, reason: 'capped' }, 'the allowance is a ceiling, not a suggestion');

      // Người khác không dính trần của nhau — đây là lý do trần theo IP phạt cả phòng.
      const neighbour = await issueWsTicket(other.id);
      assert.ok(neighbour.ok, 'another player is not affected');
      if (neighbour.ok) tokens.push(neighbour.ticket.token);

      // Dùng bớt một vé thì cửa lại mở: trần là vé *chưa nối*, không phải vé *đã xin*.
      assert.ok(redeemWsTicket(tokens[0]).ok);
      const after = await issueWsTicket(user.id);
      assert.ok(after.ok, 'redeeming one ticket frees one slot');
    } finally {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[user.id, other.id]]);
    }
  }
);
