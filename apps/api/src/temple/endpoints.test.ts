// Gate P2b: mọi tuyến HUD gọi, chạy qua HTTP thật với một phiên khách thật.
//
// Vì sao không test từng hàm SQL: cái dễ hỏng ở tầng này không phải câu query mà là
// hợp đồng giữa máy khách và máy chủ — ai được tự khai số gì, một hành động được trả
// công mấy lần, và hai người cùng tương tác thì dữ liệu có đè nhau không. Những điều
// đó chỉ lộ ra khi có một request thật đi qua nẹp phiên.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import type { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../../.env'));
  } catch {
    // Không có .env thì bỏ qua cả file, theo đúng thông lệ của repo.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);

type Json = Record<string, any>;

test(
  'temple endpoints keep the numbers on the server',
  { skip: !hasDb, concurrency: false, timeout: 240_000 },
  async () => {
    const t0 = Date.now();
    const pool: Pool = (await import('../db.ts')).pool;
    const identity = await import('./identity.ts');
    const { templeRouter } = await import('./routes.ts');

    const app = express();
    app.use(express.json());
    app.use('/api/temple', templeRouter);
    const server: Server = app.listen(0);
    await new Promise((res) => server.once('listening', res));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

    const users: string[] = [];
    const send = async (path: string, opts: { cookie?: string; method?: string; body?: unknown } = {}) => {
      const res = await fetch(`${base}${path}`, {
        method: opts.method ?? 'GET',
        headers: {
          ...(opts.cookie ? { cookie: opts.cookie } : {}),
          ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });
      const status = res.status;
      let json: Json = {};
      try {
        json = (await res.json()) as Json;
      } catch {
        // thân rỗng thì giữ {}, để assert trên .code tự fail thay vì ném lỗi parse.
      }
      return { status, json, code: json.code as string | undefined };
    };
    const get = (path: string, cookie: string) => send(path, { cookie });
    const post = (path: string, body: unknown, cookie: string) => send(path, { cookie, method: 'POST', body: body ?? {} });
    const put = (path: string, body: unknown, cookie: string) => send(path, { cookie, method: 'PUT', body });

    // Mỗi người một hàng khách thật, ghi lại để xoá khi chạy xong.
    async function newUser(name: string): Promise<{ cookie: string; user: string; me: Json }> {
      const guest = await identity.createGuest();
      users.push(guest.user.id);
      const cookie = `mb_session=${guest.token}`;
      await put('/api/temple/profile', { name }, cookie);
      return { cookie, user: guest.user.id, me: (await get('/api/temple/state', cookie)).json.state };
    }

    // Dịch chuyển đồng hồ của server thay vì ngủ: một phút chờ trong test là một phút
    // mỗi lần chạy, và con số cần chứng minh là *cách cắt*, không phải thời gian thực.
    async function rewindSit(cookie: string, user: string, minutes: number) {
      await pool.query('UPDATE temple_profiles SET meditate_start = now() - ($2::int * INTERVAL \'1 minute\') WHERE user_id = $1', [
        user,
        minutes,
      ]);
      return (await post('/api/temple/practice', { type: 'meditate_end' }, cookie)).json;
    }

    try {
      // --- Nạp HUD -----------------------------------------------------------
      const me = await newUser('Đồng Tu Một');
      assert.equal(typeof me.me.id, 'number', 'the HUD gets the u32 id, never the uuid');
      assert.equal(me.me.level, 1);
      assert.equal(me.me.sen, 500, 'the wallet of the original build');
      assert.equal(me.me.inventory.den_hoa_dang, 8);
      assert.equal(me.me.today.bows, 0);
      assert.equal(me.me.lifetime.bows, 0);
      assert.equal((await send('/api/temple/state')).status, 401, 'no cookie, no state');

      // --- Nhịp lạy: ngưỡng nằm ở server, không ở máy khách ------------------
      const bows = (await post('/api/temple/practice', { type: 'bow', count: 3 }, me.cookie)).json;
      assert.equal(bows.gained, 15, 'three bows at five merit each, exactly the original ladder');
      assert.equal(bows.state.today.bows, 3);
      assert.equal(bows.state.lifetime.bows, 3, 'the milestone counter reads the same ledger');
      assert.equal(bows.state.exp, 35, '20 seeded on day one plus the gate above');
      const over = await post('/api/temple/practice', { type: 'bow', count: 9999 }, me.cookie);
      assert.equal(over.status, 400, 'one packet cannot buy a level');
      assert.equal(over.code, 'invalid_count');
      const junk = await post('/api/temple/practice', { type: 'mo' }, me.cookie);
      assert.equal(junk.status, 400, 'the wooden fish was cut from the temple');

      // Máy khách chỉ được đổi những gì nhìn thấy trên người mình.
      const stolen = await put('/api/temple/profile', { name: 'Ai Đó', sen: 99_999, level: 7, exp: 99_999 }, me.cookie);
      assert.equal(stolen.status, 200);
      const after = (await get('/api/temple/state', me.cookie)).json.state;
      assert.equal(after.name, 'Ai Đó');
      assert.equal(after.sen, bows.state.sen, 'a PUT cannot print Sen');
      assert.equal(after.level, bows.state.level, 'nor the level');
      await put('/api/temple/profile', { name: 'Đồng Tu Một' }, me.cookie);

      // --- Ngồi thiền đo bằng đồng hồ server ---------------------------------
      const early = await post('/api/temple/practice', { type: 'meditate_end' }, me.cookie);
      assert.equal(early.status, 400, 'ending a sit that never started');
      assert.equal((await post('/api/temple/practice', { type: 'meditate_start' }, me.cookie)).status, 200);
      const twice = await post('/api/temple/practice', { type: 'meditate_start' }, me.cookie);
      assert.equal(twice.status, 409, 'one sit at a time');
      const ended = await rewindSit(me.cookie, me.user, 40);
      assert.equal(ended.extra.minutes, 40, 'forty minutes of server clock, not whatever the client claimed');
      assert.equal(ended.state.meditate_start, null, 'the sit is cleared once it is paid out');
      assert.equal(ended.gained, 480, 'twelve merit a minute, capped by a clock nobody edits');
      // Một sit ba tiếng phải bị cắt về một tiếng, nếu để nguyên thì đứng nhất BXH.
      assert.equal((await post('/api/temple/practice', { type: 'meditate_start' }, me.cookie)).status, 200);
      const clamped = await rewindSit(me.cookie, me.user, 180);
      assert.equal(clamped.extra.minutes, 60, 'the longest single sit the temple counts');

      // --- Dâng hương: trừ đồ trước, cộng công đức sau ------------------------
      const used = (await post('/api/temple/use', { item: 'huong_tram' }, me.cookie)).json;
      assert.equal(used.state.inventory.huong_tram, 14);
      assert.equal(used.left, 14, 'the same request says what is left in the bag');
      assert.ok(used.state.buff_until, 'the offering opened the +20% window');
      const buffed = (await post('/api/temple/practice', { type: 'bow', count: 5 }, me.cookie)).json;
      assert.equal(buffed.gained, 30, 'five bows x 5 x 1.2 while the incense still burns');
      assert.equal((await post('/api/temple/use', { item: 'guong_su' }, me.cookie)).status, 400);
      // Tắt hương: mọi con số bên dưới là mức nền, không phải mức nhân.
      await pool.query('UPDATE temple_profiles SET buff_until = NULL WHERE user_id = $1', [me.user]);

      const nothing = await newUser('Không Hương');
      await pool.query("UPDATE temple_profiles SET inventory = '{\"lt_huou\": 1}'::jsonb WHERE user_id = (SELECT user_id FROM temple_profiles WHERE player_id = $1)", [
        nothing.me.id,
      ]);
      const broke = await post('/api/temple/use', { item: 'huong_tram' }, nothing.cookie);
      assert.equal(broke.status, 409, 'an empty bag is not an offering');

      // --- Hoa đăng ----------------------------------------------------------
      const lit = (await post('/api/temple/lanterns', { text: 'Nguyện cho muôn loài an lạc' }, me.cookie)).json;
      assert.equal(lit.gained, 20, 'the incense was put out, so this is the base rate');
      assert.equal(lit.state.inventory.den_hoa_dang, 7);
      // Đèn của người chưa xác minh email nằm ở pending; khách thì chưa xác minh,
      // nên lời nguyện chưa được phép hiện lên cả chánh điện.
      const verified = (await get('/api/temple/me', me.cookie)).json.user.emailVerified as boolean;
      assert.equal(lit.lantern.status, verified ? 'live' : 'pending');
      const others = (await get('/api/temple/lanterns', nothing.cookie)).json.lanterns as Json[];
      const visible = others.some((l) => l.id === lit.lantern.id);
      assert.equal(visible, verified, 'a pending wish is invisible to everyone else');
      const mine = (await get('/api/temple/lanterns', me.cookie)).json.lanterns as Json[];
      assert.equal(mine[0].mine, true);
      const rejoiced = (await post(`/api/temple/lanterns/${lit.lantern.id}/rejoice`, {}, nothing.cookie)).json;
      assert.equal(rejoiced.likes, 1);
      const again = await post(`/api/temple/lanterns/${lit.lantern.id}/rejoice`, {}, nothing.cookie);
      assert.equal(again.status, 409, 'one rejoice per person per lantern');
      assert.equal((await post('/api/temple/lanterns', { text: 'x'.repeat(200) }, me.cookie)).status, 400);

      // --- Vườn cây ----------------------------------------------------------
      // Vườn là của chung một chùa, nên so với cây của chính mình chứ không với số
      // hàng của cả vườn: một người đang trồng ở dev không được làm bài test đỏ.
      const treesBefore = (await get('/api/temple/garden', me.cookie)).json.trees as number;
      assert.equal((await post('/api/temple/plants', { item: 'cay_bode', x: 3.5, z: 12 }, me.cookie)).status, 200);
      assert.equal((await post('/api/temple/plants', { item: 'ao_lam', x: 1, z: 1 }, me.cookie)).status, 400, 'only seeds go in the ground');
      const garden = (await get('/api/temple/plants', me.cookie)).json;
      const own = garden.plants.filter((p: Json) => p.mine);
      assert.equal(own.length, 1);
      const picked = (await post('/api/temple/plants/harvest', { id: own[0].id }, nothing.cookie)).json;
      assert.equal(picked.got, 3);
      assert.equal(picked.state.fruit, 8, 'five from the gift pack plus one pick');
      assert.equal((await post('/api/temple/plants/harvest', { id: own[0].id }, nothing.cookie)).status, 409, 'the tree sleeps a day');
      const traded = (await post('/api/temple/plants/exchange', {}, nothing.cookie)).json;
      assert.equal(traded.ngoc, 8);
      assert.equal(traded.state.fruit, 0);
      assert.equal((await post('/api/temple/plants/exchange', {}, nothing.cookie)).status, 409, 'nothing left to trade');
      assert.equal((await get('/api/temple/garden', me.cookie)).json.trees, treesBefore + 1);

      // --- Bảng tri ân: trả bằng Sen nội bộ -----------------------------------
      const before = (await get('/api/temple/state', me.cookie)).json.state.sen as number;
      const gave = (await post('/api/temple/donations', { amount: 120, note: 'Cúng dường tam bảo' }, me.cookie)).json;
      assert.equal(gave.state.sen, before - 120 + Math.ceil(gave.gained * 0.4), 'the offering pays Sen only through the merit ratio');
      assert.equal((await post('/api/temple/donations', { amount: 100_000 }, nothing.cookie)).status, 409, 'Sen cannot go negative');
      assert.equal((await post('/api/temple/donations', { amount: 9_999_999 }, me.cookie)).status, 400, 'and a gift that large is not a gift');
      const stele = (await get('/api/temple/stele', me.cookie)).json.rows as Json[];
      assert.equal(stele[0].score, 120);
      // temple.js:439 khắc name/title/score lên bia, nên title phải là danh hiệu theo
      // bậc của chính người cúng, không phải honor và cũng không phải rỗng.
      const donorTitle = (await get('/api/temple/state', me.cookie)).json.state.title as string;
      assert.equal(stele[0].title, donorTitle);
      assert.equal(((await get('/api/temple/donations', me.cookie)).json.rows as Json[])[0].note, 'Cúng dường tam bảo');

      // --- Lộc: một lần mỗi ngày ---------------------------------------------
      const wheel = (await post('/api/temple/draws/wheel', {}, me.cookie)).json;
      const repeat = (await post('/api/temple/draws/wheel', {}, me.cookie)).json;
      assert.equal(repeat.again, true, 'the day already drew');
      assert.equal(repeat.result.idx, wheel.result.idx, 'and it shows that result, not a reroll');
      assert.equal((await get('/api/temple/draws/wheel', me.cookie)).json.can, false);
      const que = (await post('/api/temple/draws/que', {}, me.cookie)).json;
      assert.ok(que.que.rank, 'a card came back');
      assert.equal(que.gained, 15);
      const queAgain = (await post('/api/temple/draws/que', {}, me.cookie)).json;
      assert.equal(queAgain.already, true);
      assert.equal(queAgain.gained, 0, 'reading the same fortune twice does not pay twice');
      assert.equal((await get('/api/temple/draws/que', me.cookie)).json.que.rank, que.que.rank);

      // --- BXH ---------------------------------------------------------------
      const board = (await get('/api/temple/leaderboard?scope=day', me.cookie)).json;
      const row = (board.rows as Json[]).find((r) => r.you);
      assert.ok(row, 'the practitioner is on the board');
      assert.ok(row.score >= 60, `today only, and today was busy (got ${row.score})`);
      assert.equal(row.title, (await get('/api/temple/state', me.cookie)).json.state.title, 'the board and the progress bar call you the same thing');
      assert.ok((board.sects as Json[]).length, 'the sect table reads the same window');
      const all = (await get('/api/temple/leaderboard?scope=all', me.cookie)).json;
      assert.ok((all.rows as Json[]).length >= (board.rows as Json[]).length, 'a wider window cannot be shorter');
      // '?scope=__proto__' tra vào object thường thì trả về một prototype, mà ghép
      // prototype vào WHERE là một cú 500 ngay trước mắt người bấm bảng xếp hạng.
      assert.equal((await get('/api/temple/leaderboard?scope=__proto__', me.cookie)).json.scope, 'week');

      // --- Bạn bè, thư riêng, nhóm đồng tu ------------------------------------
      const asked = (await post('/api/temple/friends', { id: nothing.me.id, action: 'add' }, me.cookie)).json;
      assert.equal(asked.accepted, false);
      assert.equal(((await get('/api/temple/friends', nothing.cookie)).json.incoming as Json[]).length, 1);
      assert.equal((await post('/api/temple/friends', { id: me.me.id, action: 'accept' }, nothing.cookie)).json.accepted, true);
      assert.equal(((await get('/api/temple/friends', me.cookie)).json.friends as Json[]).length, 1, 'stored on both sides');
      assert.equal((await post('/api/temple/friends', { id: me.me.id, action: 'add' }, me.cookie)).status, 400, 'not friends with yourself');
      assert.equal((await post('/api/temple/friends', { id: 4_294_967_294, action: 'add' }, me.cookie)).status, 404);

      assert.equal((await post('/api/temple/dms', { id: nothing.me.id, text: 'A Di Đà Phật' }, me.cookie)).status, 200);
      const thread = (await get(`/api/temple/dms/${nothing.me.id}`, me.cookie)).json;
      assert.equal((thread.messages as Json[]).length, 1);
      assert.equal(thread.messages[0].mine, true, 'the sender sees it as theirs');
      assert.equal(((await get('/api/temple/dms', nothing.cookie)).json.threads as Json[])[0].unseen, 1);
      assert.equal(((await get(`/api/temple/dms/${me.me.id}`, nothing.cookie)).json.messages as Json[]).length, 1);
      assert.equal(((await get('/api/temple/dms', nothing.cookie)).json.threads as Json[])[0].unseen, 0, 'opening the thread read it');
      assert.equal((await post('/api/temple/dms', { id: nothing.me.id, text: '   ' }, me.cookie)).status, 400);

      const group = (await post('/api/temple/group', { name: 'Đạo Tràng Test' }, me.cookie)).json.group;
      assert.equal(group.members.length, 1);
      assert.equal(group.owner, true);
      const joined = (await post('/api/temple/group/join', { code: group.code.toLowerCase() }, nothing.cookie)).json.group;
      assert.equal(joined.members.length, 2);
      assert.ok(joined.merit > 0, 'group merit is summed from each member practice');
      assert.equal((await post('/api/temple/group', { name: 'Nhóm Khác' }, me.cookie)).status, 409, 'one group at a time');
      assert.equal((await post('/api/temple/group/message', { text: 'Chúc mọi người tu tập an lạc' }, nothing.cookie)).status, 200);
      const board2 = (await get('/api/temple/group', me.cookie)).json.group;
      assert.equal((board2.messages as Json[]).length, 1);
      const stranger = await newUser('Người Ngoài');
      assert.equal((await post('/api/temple/group/join', { code: 'ZZZZZZ' }, stranger.cookie)).status, 404);

      // --- Kết duyên ----------------------------------------------------------
      const sent = (await post('/api/temple/greetings', { id: nothing.me.id, kind: 'huong', text: 'Gửi bạn nén hương' }, me.cookie)).json;
      assert.equal(sent.gained, 10);
      const box = (await get('/api/temple/greetings', nothing.cookie)).json.rows as Json[];
      assert.equal(box.length, 1);
      assert.equal(box[0].from.id, me.me.id, 'the inbox shows who sent it');
      const opened = (await post(`/api/temple/greetings/${box[0].id}/open`, {}, nothing.cookie)).json;
      assert.equal(opened.gained, 5);
      assert.equal((await post(`/api/temple/greetings/${box[0].id}/open`, {}, nothing.cookie)).status, 404, 'one open per gift');

      // --- Tin chạy -----------------------------------------------------------
      assert.deepEqual((await get('/api/temple/announcements', me.cookie)).json.rows, [], 'the board is empty until the temple posts');

      assert.equal((await post('/api/temple/practice', { type: 'bow', count: 1 }, 'mb_session=nonsense')).status, 401);
      console.log(`   endpoints: ${Math.round((Date.now() - t0) / 1000)}s`);
    } finally {
      server.close();
      if (users.length) await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
      await pool.end();
    }
  },
);
