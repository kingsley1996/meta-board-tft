// Một ngọn đèn thả bằng REST phải bay lên máy người đang ngồi trong chánh điện: đó là
// hợp đồng giữa hall.ts (publishToTemple) và room.ts (onEvent), chỉ một socket thật
// mới kiểm được. Frame nhị phân của nhịp phòng cố tình bị bỏ qua ở đây.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import { WebSocket } from 'ws';

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../../.env'));
  } catch {
    // Không có .env thì bỏ qua cả file, theo đúng thông lệ của repo.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);

type Json = Record<string, any>;

async function until(check: () => boolean, what: string, timeoutMs = 8000): Promise<void> {
  const t0 = Date.now();
  while (!check()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${what}`);
    await new Promise((res) => setTimeout(res, 25));
  }
}

test(
  'a lantern released over REST flies into the room over WS',
  { skip: !hasDb, concurrency: false, timeout: 180_000 },
  async () => {
    const { pool } = await import('../db.ts');
    const identity = await import('./identity.ts');
    const { templeRouter } = await import('./routes.ts');
    const { attachTempleWs } = await import('./ws.ts');

    const app = express();
    app.use(express.json());
    app.use('/api/temple', templeRouter);
    const server: Server = app.listen(0);
    await new Promise((res) => server.once('listening', res));
    const port = (server.address() as { port: number }).port;
    const realtime = attachTempleWs(server);

    const users: string[] = [];
    const sockets: WebSocket[] = [];
    const call = async (path: string, opts: { cookie?: string; method?: string; body?: unknown } = {}): Promise<Json> => {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: opts.method ?? 'GET',
        headers: {
          ...(opts.cookie ? { cookie: opts.cookie } : {}),
          ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });
      return (await res.json()) as Json;
    };

    // Một người chơi thật: hàng khách, hồ sơ chùa, vé một lần, socket đã nhận id.
    async function seated(name: string) {
      const guest = await identity.createGuest();
      users.push(guest.user.id);
      const cookie = `mb_session=${guest.token}`;
      await call('/api/temple/profile', { cookie, method: 'PUT', body: { name } });
      const state = (await call('/api/temple/state', { cookie })).state as Json;
      const issued = await call('/api/temple/ws-ticket', { cookie, method: 'POST', body: {} });
      const url = `ws://127.0.0.1:${port}/ws?ticket=${encodeURIComponent(String(issued.ticket))}&temple=nhattru&room=chung`;
      const ws = new WebSocket(url);
      sockets.push(ws);
      const events: Json[] = [];
      ws.on('message', (raw: Buffer, isBinary: boolean) => {
        if (isBinary) return;
        events.push(JSON.parse(raw.toString('utf8')) as Json);
      });
      await new Promise<void>((res, rej) => {
        ws.once('open', () => {
          ws.send(JSON.stringify({ t: 'join', temple: 'nhattru', room: 'chung', v: 4 }));
          res();
        });
        ws.once('error', rej);
      });
      await until(() => events.some((e) => e.t === 'joined'), `${name} joins the hall`);
      return { cookie, user: guest.user.id, state, ws, events };
    }

    try {
      const a = await seated('Thả Đèn');
      const b = await seated('Nhìn Đèn');
      assert.equal(realtime.rooms.size, 2, 'both are in the same room');

      // Đèn chỉ bay khi lời nguyện đã hiện lên chánh điện, nên người thả phải là
      // tài khoản đã xác minh email — khách thì nằm ở pending.
      await pool.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [a.user]);
      const wish = 'Nguyện cho người nhà bình an';
      const lit = await call('/api/temple/lanterns', { cookie: a.cookie, method: 'POST', body: { text: wish } });
      assert.equal(lit.lantern.status, 'live');
      await until(() => b.events.some((e) => e.t === 'lantern'), 'the peer is told about the lantern');

      const flown = b.events.find((e) => e.t === 'lantern') as Json;
      assert.equal(flown.text, wish);
      assert.equal(flown.name, a.state.name, 'the toast can name who released it');
      // Người thả không nhận tin của chính mình: máy khách đã phóng đèn ngay khi REST
      // trả về, nhận thêm một tin nữa là hai ngọn đèn một người.
      assert.equal(
        a.events.some((e) => e.t === 'lantern'),
        false,
        'the actor is not told about their own lantern',
      );

      // Lời nguyện còn chờ duyệt thì chưa có gì để xem, nên phòng phải im lặng.
      const held = await call('/api/temple/lanterns', {
        cookie: b.cookie,
        method: 'POST',
        body: { text: 'Nguyện chưa được duyệt' },
      });
      assert.equal(held.lantern.status, 'pending');
      await new Promise((res) => setTimeout(res, 300));
      assert.equal(
        a.events.some((e) => e.t === 'lantern'),
        false,
        'a pending wish never reaches the room',
      );
    } finally {
      for (const ws of sockets) ws.close();
      realtime.close();
      server.close();
      if (users.length) await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
      await pool.end();
    }
  },
);
