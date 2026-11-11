// Gate sảnh chờ "Tìm Bạn Chơi".
//
// Test này không chạy qua HTTP một mình: một hàng trên bảng là *giao của hai điều kiện*
// — còn live trong database (lobby_at + trần 30 phút) và còn ngồi trong chánh điện
// (ws.ts:onlinePlayerIds). Cắt một trong hai thì nửa hợp đồng còn lại không được đo, nên
// mỗi người ở đây có một socket thật và bài test bỏ từng điều kiện một cách riêng biệt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { once } from 'node:events';
import express from 'express';
import { WebSocket } from 'ws';
import type { Pool } from 'pg';
import type { Server } from 'node:http';

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../../.env'));
  } catch {
    // Không có .env thì bỏ qua cả file, theo đúng thông lệ của repo.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);

type Json = Record<string, any>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test(
  'temple lobby lists players who are both online and unexpired',
  { skip: !hasDb, concurrency: false, timeout: 240_000 },
  async () => {
    const pool: Pool = (await import('../db.ts')).pool;
    const identity = await import('./identity.ts');
    const { issueWsTicket } = await import('./tickets.ts');
    const { templeRouter } = await import('./routes.ts');
    const { attachTempleWs } = await import('./ws.ts');

    const app = express();
    app.use(express.json());
    app.use('/api/temple', templeRouter);
    const server: Server = app.listen(0);
    await once(server, 'listening');
    const realtime = attachTempleWs(server);
    const addr = server.address() as { port: number };

    const userIds: string[] = [];
    const sockets: WebSocket[] = [];

    const send = async (path: string, cookie: string, method = 'GET', body?: unknown) => {
      const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
        method,
        headers: { cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      let json: Json = {};
      try {
        json = (await res.json()) as Json;
      } catch {
        // thân rỗng thì giữ {}, để assert trên .code tự fail thay vì ném lỗi parse
      }
      return { status: res.status, json, code: json.code as string | undefined };
    };
    const get = (path: string, cookie: string) => send(path, cookie);
    const post = (path: string, cookie: string, body?: unknown) => send(path, cookie, 'POST', body ?? {});
    const del = (path: string, cookie: string) => send(path, cookie, 'DELETE');
    const put = (path: string, cookie: string, body: unknown) => send(path, cookie, 'PUT', body);

    // Khung gửi đến được xếp hàng theo từng socket thay vì đọc nhỏ giọt: 'joined' và
    // 'prof' đi sát nhau tới mức một listener gắn sau khi bài test await xong 'joined'
    // thường đã trượt mất khung 'prof'. Hàng đợi giữ cả những khung tới trước khi kịp nhìn.
    const queues = new Map<WebSocket, Json[]>();
    function watch(ws: WebSocket): void {
      const queue: Json[] = [];
      queues.set(ws, queue);
      ws.on('message', (data, binary) => {
        if (!binary) queue.push(JSON.parse(String(data)) as Json);
      });
    }

    async function until(ws: WebSocket, want: (m: Json) => boolean, label: string): Promise<Json> {
      const queue = queues.get(ws)!;
      const deadline = Date.now() + 5_000;
      for (;;) {
        const hit = queue.find(want);
        if (hit) return hit;
        if (Date.now() > deadline) throw new Error(`socket never carried ${label}`);
        await sleep(50);
      }
    }

    type Person = { cookie: string; userId: string; playerId: number; ws: WebSocket };

    async function newUser(name: string, riot?: [string, string]): Promise<Omit<Person, 'ws'>> {
      const guest = await identity.createGuest();
      userIds.push(guest.user.id);
      const cookie = `mb_session=${guest.token}`;
      // Nâng cấp tại chỗ: mọi tuyến ghi của sảnh chờ đi qua withAccount.
      await pool.query('UPDATE users SET is_guest = false, email = $2 WHERE id = $1', [
        guest.user.id,
        `lobby-${guest.user.id}@example.com`,
      ]);
      await put('/api/temple/profile', cookie, { name });
      if (riot) {
        await pool.query('UPDATE users SET riot_game_name = $2, riot_tagline = $3 WHERE id = $1', [
          guest.user.id,
          riot[0],
          riot[1],
        ]);
      }
      return { cookie, userId: guest.user.id, playerId: guest.profile.playerId };
    }

    // Ngồi vào chánh điện — không có bước này thì nhân vật chưa tồn tại trong phòng,
    // và danh sách sẽ rỗng kể cả khi lobby_at vừa được ghi.
    async function seat(p: Omit<Person, 'ws'>): Promise<Person> {
      const issued = await issueWsTicket(p.userId);
      assert.ok(issued.ok);
      const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/ws?ticket=${issued.ticket.token}`);
      sockets.push(ws);
      watch(ws);
      await once(ws, 'open', { signal: AbortSignal.timeout(5_000) });
      ws.send(JSON.stringify({ t: 'join' }));
      await until(ws, (m) => m.t === 'joined', 'joined');
      return { ...p, ws };
    }

    try {
      const a = await newUser('An', ['Samuel', '1234']);
      const b = await newUser('Binh', ['Binh', 'VN9']);
      const nobody = await newUser('Chi');

      /* ---- khách vãng lai: nhìn được, không vào được, không thấy gì ---- */
      const walkIn = await identity.createGuest();
      userIds.push(walkIn.user.id);
      const guestCookie = `mb_session=${walkIn.token}`;
      const guestView = await get('/api/temple/lobby', guestCookie);
      assert.equal(guestView.status, 200);
      assert.deepEqual(guestView.json, { riot: null, in: false, rows: [] });
      const guestJoin = await post('/api/temple/lobby', guestCookie);
      assert.equal(guestJoin.code, 'guest_account_required');

      /* ---- điều kiện vào: phải có Riot ID, và chỉ riêng việc đó không bật gì hết ---- */
      const blocked = await post('/api/temple/lobby', nobody.cookie);
      assert.equal(blocked.status, 400);
      assert.equal(blocked.code, 'needs_riot_id');

      /* ---- chưa ai ngồi trong đền thì bảng rỗng, dù lobby_at đã ghi ---- */
      const early = await post('/api/temple/lobby', a.cookie);
      assert.equal(early.status, 200);
      assert.deepEqual(early.json.rows, []);
      // `in` do danh sách quyết: socket chưa nối thì người này chưa hiện ra trước mắt ai.
      assert.equal(early.json.in, false);
      // Cột mốc vừa ghi ở trên là có thật — người này sẽ bật badge ngay khi ngồi xuống.
      // Dọn về 0 để phần còn lại đo đúng cái mà một cú bấm "Vào Sảnh Chờ" tạo ra.
      await pool.query('UPDATE temple_profiles SET lobby_at = NULL WHERE user_id = $1', [a.userId]);

      const [sa, sb] = [await seat(a), await seat(b)];

      // Người vừa vào phòng chưa bỏ phiếu cho ai, chưa có mốc sảnh chờ.
      const peers = await until(
        sb.ws,
        (m) => m.t === 'prof' && Array.isArray(m.p) && m.p.some((p: Json) => p.id === sa.playerId),
        `prof for ${sa.playerId}`,
      );
      const seen = peers.p.find((p: Json) => p.id === sa.playerId);
      assert.equal(seen.lobby, undefined);
      // Cờ riot_public không bật theo lời mời gọi này, nên người khác chưa thấy Riot ID
      // của nhau trên dây — sảnh chờ là chỗ duy nhất phát nó.
      assert.equal(seen.riot, undefined);

      /* ---- vào sảnh: hàng hiện ra, badge hiện trên đầu avatar ---- */
      // Hai lần ghi của cùng một người phải cách nhau nhịp 1s mà server giữ.
      await sleep(1_100);
      const enter = await post('/api/temple/lobby', sa.cookie);
      assert.equal(enter.status, 200);
      assert.equal(enter.json.in, true);
      assert.equal(enter.json.rows.length, 1);
      const row = enter.json.rows[0];
      assert.equal(row.id, sa.playerId);
      assert.equal(row.name, 'An');
      assert.equal(row.riot, 'Samuel#1234');
      assert.equal(row.up, 0);
      assert.equal(row.down, 0);
      assert.equal(row.vote, 0);
      assert.ok(Number.isFinite(Date.parse(row.at)));

      await until(
        sb.ws,
        (m) => m.t === 'prof' && m.p?.some((p: Json) => p.id === sa.playerId && p.lobby === true),
        'lobby badge',
      );

      /* ---- phiếu: một người một phiếu, bấm lại nút cũ là xoá ---- */
      const vote = (p: Person, id: number, value: number) => post('/api/temple/lobby/vote', p.cookie, { id, value });
      const anRow = (rows: Json[]) => rows.find((r) => r.id === sa.playerId)!;

      assert.equal((await vote(sb, sa.playerId, 0)).code, 'invalid_vote');
      assert.equal((await vote(sb, sb.playerId, 1)).code, 'self_vote');
      assert.equal((await vote(sb, 4_294_967_295, 1)).status, 404);

      const up = await vote(sb, sa.playerId, 1);
      assert.equal(up.status, 200);
      assert.deepEqual([anRow(up.json.rows).up, anRow(up.json.rows).down, anRow(up.json.rows).vote], [1, 0, 1]);

      // Cùng một người, hai phiếu liền nhau: nhịp 1s do server giữ.
      const tooFast = await vote(sb, sa.playerId, -1);
      assert.equal(tooFast.code, 'too_fast');
      await sleep(1_100);

      const flip = await vote(sb, sa.playerId, -1);
      assert.deepEqual([anRow(flip.json.rows).up, anRow(flip.json.rows).down, anRow(flip.json.rows).vote], [0, 1, -1]);
      await sleep(1_100);

      // Huỷ là xoá hàng, không phải ghi value = 0: "chưa bỏ phiếu" chỉ có một cách biểu
      // diễn, nên không ai đếm nhầm một phiếu huỷ thành một phiếu trừ.
      const cancel = await vote(sb, sa.playerId, -1);
      assert.deepEqual([anRow(cancel.json.rows).up, anRow(cancel.json.rows).down, anRow(cancel.json.rows).vote], [0, 0, 0]);

      // Người đã rời bảng vẫn bỏ phiếu được: phiếu xác nhận một trận *đã đánh*, và trận
      // đó có thể xong sau khi cả hai đã rời sảnh chờ.
      await sleep(1_100);
      const afterLeave = await del('/api/temple/lobby', sa.cookie);
      assert.equal(afterLeave.json.in, false);
      assert.deepEqual(afterLeave.json.rows, []);
      const late = await vote(sb, sa.playerId, 1);
      assert.equal(late.status, 200);
      assert.equal((await get('/api/temple/lobby', sb.cookie)).json.rows.length, 0);
      const counted = await pool.query<{ up: string; down: string }>(
        `SELECT COUNT(*) FILTER (WHERE value = 1)::text AS up,
                COUNT(*) FILTER (WHERE value = -1)::text AS down
           FROM temple_lobby_votes WHERE to_user = $1`,
        [sa.userId],
      );
      assert.deepEqual([counted.rows[0].up, counted.rows[0].down], ['1', '0']);

      /* ---- hết hạn 30 phút: hàng rời bảng, người đó không còn "đang ở đây" ---- */
      await sleep(1_100);
      assert.equal((await post('/api/temple/lobby', sa.cookie)).json.in, true);
      // Lùi đồng hồ 31 phút chứ không phải 30: mốc cắt là `lobby_at > now() - 30 minutes`,
      // nên đúng 30 là còn nằm trên ranh giới của hai đáp án.
      await pool.query(`UPDATE temple_profiles SET lobby_at = now() - INTERVAL '31 minutes' WHERE user_id = $1`, [sa.userId]);
      const stale = await get('/api/temple/lobby', sb.cookie);
      assert.deepEqual(stale.json.rows, []);
      assert.equal((await get('/api/temple/lobby', sa.cookie)).json.in, false);

      /* ---- rớt mạng: socket đóng là hàng biến mất, không cần ai dọn ---- */
      await sleep(1_100);
      assert.equal((await post('/api/temple/lobby', sa.cookie)).json.in, true);
      sa.ws.terminate();
      let offline = (await get('/api/temple/lobby', sb.cookie)).json.rows;
      for (let i = 0; i < 30 && offline.length; i++) {
        await sleep(100);
        offline = (await get('/api/temple/lobby', sb.cookie)).json.rows;
      }
      assert.deepEqual(offline, []);
    } finally {
      for (const ws of sockets) ws.terminate();
      realtime.close();
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  },
);
