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
    const { vnDay } = await import('./merit.ts');
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
      const me = await newUser('Lữ Khách Một');
      assert.equal(typeof me.me.id, 'number', 'the HUD gets the u32 id, never the uuid');
      assert.equal(me.me.level, 1);
      assert.equal(me.me.sen, 500, 'the wallet of the original build');
      assert.equal(me.me.today.bows, 0);
      assert.equal(me.me.lifetime.bows, 0);
      assert.equal((await send('/api/temple/state')).status, 401, 'no cookie, no state');

      // --- Nhịp cầu may: ngưỡng nằm ở server, không ở máy khách ----------------
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
// Tần suất cũng là của server: một vòng lặp gửi cùng một nhịp phải bị chặn.
      const fast = await post('/api/temple/practice', { type: 'bow', count: 1 }, me.cookie);
      assert.equal(fast.status, 429, 'two packets inside one beat pay once');
      assert.equal(fast.code, 'too_fast');
      // 400 không được tính là một nhịp đã làm: gói sai quy cách chưa "làm" gì cả.
      const stillBad = await post('/api/temple/practice', { type: 'bow', count: 9999 }, me.cookie);
      assert.equal(stillBad.code, 'invalid_count', 'a rejected packet does not burn the beat');

      // Máy khách chỉ được đổi những gì nhìn thấy trên người mình.
      const stolen = await put('/api/temple/profile', { name: 'Ai Đó', sen: 99_999, level: 7, exp: 99_999 }, me.cookie);
      assert.equal(stolen.status, 200);
      const after = (await get('/api/temple/state', me.cookie)).json.state;
      assert.equal(after.name, 'Ai Đó');
      assert.equal(after.sen, bows.state.sen, 'a PUT cannot print Sen');
      assert.equal(after.level, bows.state.level, 'nor the level');
      await put('/api/temple/profile', { name: 'Lữ Khách Một' }, me.cookie);

      // Vòng hạt đã bị bỏ hẳn: không còn type nào nhận số hạt.
      assert.equal((await post('/api/temple/practice', { type: 'bead', count: 30 }, me.cookie)).status, 400);


      // Chọn nhận vật: id thật thì về tay máy khách, id bịa thì khước từ ngay — để
      // resolveHero (avatar.js:877) không quay vòng random rồi lưu một nhân vật vô hình.
      const hero = await put('/api/temple/profile', { appearance: { hero: 'zoro' } }, me.cookie);
      assert.equal(hero.status, 200);
      assert.equal(hero.json.profile.appearance.hero, 'zoro');
      // Một gói chỉ đổi nhân vật không được xoá những gì còn lại trên người: hàng lối
      // được gộp (jsonb ||) thay vì thay cả object.
      assert.equal(hero.json.profile.appearance.hair, 'ngan', 'the seed haircut survives a hero-only packet');
      assert.equal(hero.json.profile.equipped.beads, 'chuoi_go', 'nor does it strip the bag');
      const unequip = await put('/api/temple/profile', { equipped: { pet: null } }, me.cookie);
      assert.equal(unequip.json.profile.equipped.pet, null, 'an explicit null still takes the pet off');
      assert.equal(unequip.json.profile.equipped.beads, 'chuoi_go', 'and leaves the rest worn');
      const fakeHero = await put('/api/temple/profile', { appearance: { hero: 'songoku' } }, me.cookie);
      assert.equal(fakeHero.status, 400, 'a hero the engine cannot draw is not a choice');

      // --- Nhịp thiền đo bằng đồng hồ server -------------------------------
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
      // Lần này hai cú xả chạy song song khi thời thiền vẫn còn: một cú chiếm được
      // hàng, cú kia không còn gì để cộng.
      await post('/api/temple/practice', { type: 'meditate_start' }, me.cookie);
      await pool.query("UPDATE temple_profiles SET meditate_start = now() - (7 * INTERVAL '1 minute') WHERE user_id = $1", [me.user]);
      const paid = await Promise.all([post('/api/temple/practice', { type: 'meditate_end' }, me.cookie), post('/api/temple/practice', { type: 'meditate_end' }, me.cookie)]);
      const winners = paid.filter((r) => r.status === 200);
      assert.equal(winners.length, 1, 'exactly one request claims a running sit');
      assert.equal(winners[0].json.extra.minutes, 7, 'and it is the only one paid');
      assert.equal(paid.find((r) => r.status !== 200)?.code, 'not_meditating');

      // --- Dâng bùa: trừ đồ trước, cộng điểm sau -------------------------------
      const used = (await post('/api/temple/use', { item: 'huong_tram' }, me.cookie)).json;
      assert.equal(used.state.inventory.huong_tram, 14);
      assert.equal(used.left, 14, 'the same request says what is left in the bag');
      assert.ok(used.state.buff_until, 'the offering opened the +20% window');
      // Lá bùa này tới ngay sau cú cầu may bị too_fast ở trên, nên phải chờ qua cửa sổ
      // 3 giây của nhịp cầu may (COOLDOWN_MS) — nếu không thì con số bên dưới là 429 chứ
      // không phải 30.
      await new Promise((r) => setTimeout(r, 3200));
      const buffed = (await post('/api/temple/practice', { type: 'bow', count: 5 }, me.cookie)).json;
      assert.equal(buffed.gained, 30, 'five x 5 x 1.2 while the charm buff is still open');
      assert.equal((await post('/api/temple/use', { item: 'guong_su' }, me.cookie)).status, 400);
      // Tắt buff: mọi con số bên dưới là mức nền, không phải mức nhân.
      await pool.query('UPDATE temple_profiles SET buff_until = NULL WHERE user_id = $1', [me.user]);

      const nothing = await newUser('Không Bùa');
      await pool.query("UPDATE temple_profiles SET inventory = '{\"lt_huou\": 1}'::jsonb WHERE user_id = (SELECT user_id FROM temple_profiles WHERE player_id = $1)", [
        nothing.me.id,
      ]);
      const broke = await post('/api/temple/use', { item: 'huong_tram' }, nothing.cookie);
      assert.equal(broke.status, 409, 'an empty bag is not an offering');

      // --- Bảng đồng hành: trả bằng Tinh Hoa nội bộ ----------------------------
      const before = (await get('/api/temple/state', me.cookie)).json.state.sen as number;
      const gave = (await post('/api/temple/donations', { amount: 120, note: 'Gửi lời chúc sảnh' }, me.cookie)).json;
      assert.equal(gave.state.sen, before - 120 + Math.ceil(gave.gained * 0.4), 'the offering pays Sen only through the merit ratio');
      assert.equal((await post('/api/temple/donations', { amount: 100_000 }, nothing.cookie)).status, 409, 'Sen cannot go negative');
      assert.equal((await post('/api/temple/donations', { amount: 9_999_999 }, me.cookie)).status, 400, 'and a gift that large is not a gift');
      const stele = (await get('/api/temple/stele', me.cookie)).json.rows as Json[];
      assert.equal(stele[0].score, 120);
      // temple.js:439 khắc name/title/score lên bia, nên title phải là danh hiệu theo
      // bậc của chính người cúng, không phải honor và cũng không phải rỗng.
      const donorTitle = (await get('/api/temple/state', me.cookie)).json.state.title as string;
      assert.equal(stele[0].title, donorTitle);
      assert.equal(((await get('/api/temple/donations', me.cookie)).json.rows as Json[])[0].note, 'Gửi lời chúc sảnh');

      // --- Vòng quay và quẻ: một lần mỗi ngày ----------------------------------
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

      // --- Cửa "hôm nay" cắt theo giờ Hà Nội -----------------------------------
      // 17:30 UTC đã là 00:30 ngày kế tiếp ở Việt Nam. CURRENT_DATE là một cột date
      // (nửa đêm UTC), nên cộng 7 tiếng rồi cast ::date vẫn trả ngày cũ — hàng vừa ghi
      // bằng vnDay() biến mất khỏi BXH ngày và nhật ký 28 ngày. cùng biểu thức mà các
      // câu đọc dùng, chỉ khác nguồn thời gian.
      const dayAt = async (iso: string) => String((await pool.query(`SELECT ((($1::timestamptz) + INTERVAL '7 hours')::date)::text AS d`, [iso])).rows[0].d);
      assert.equal(await dayAt('2026-11-04T17:30:00Z'), '2026-11-05', 'the server clock crosses midnight on Vietnamese time');
      assert.equal(await dayAt('2026-11-04T16:30:00Z'), '2026-11-04', 'and an hour earlier it is still yesterday there');
      assert.equal(await dayAt((new Date()).toISOString()), vnDay(), 'the same window the ledger writes with');

      // --- Đồng đội, thư riêng, tổ đội -----------------------------------------
      const asked = (await post('/api/temple/friends', { id: nothing.me.id, action: 'add' }, me.cookie)).json;
      assert.equal(asked.accepted, false);
      assert.equal(((await get('/api/temple/friends', nothing.cookie)).json.incoming as Json[]).length, 1);
      assert.equal((await post('/api/temple/friends', { id: me.me.id, action: 'accept' }, nothing.cookie)).json.accepted, true);
      assert.equal(((await get('/api/temple/friends', me.cookie)).json.friends as Json[]).length, 1, 'stored on both sides');
      assert.equal((await post('/api/temple/friends', { id: me.me.id, action: 'add' }, me.cookie)).status, 400, 'not friends with yourself');
      assert.equal((await post('/api/temple/friends', { id: 4_294_967_294, action: 'add' }, me.cookie)).status, 404);

      assert.equal((await post('/api/temple/dms', { id: nothing.me.id, text: 'Chúc bạn top 1' }, me.cookie)).status, 200);
      const thread = (await get(`/api/temple/dms/${nothing.me.id}`, me.cookie)).json;
      assert.equal((thread.messages as Json[]).length, 1);
      assert.equal(thread.messages[0].mine, true, 'the sender sees it as theirs');
      assert.equal(((await get('/api/temple/dms', nothing.cookie)).json.threads as Json[])[0].unseen, 1);
      // Mốc ngày của hộp thư phải là ISO: ::text của Postgres ra "2026-11-05 10:10:21+00"
      // (dấu cách, không T), new Date(...) đọc chuỗi đó theo giờ máy nên ngày lệch.
      const threadLast = ((await get('/api/temple/dms', nothing.cookie)).json.threads as Json[])[0].last as string;
      assert.match(threadLast, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'the inbox speaks ISO');
      assert.equal(((await get(`/api/temple/dms/${me.me.id}`, nothing.cookie)).json.messages as Json[]).length, 1);
      assert.equal(((await get('/api/temple/dms', nothing.cookie)).json.threads as Json[])[0].unseen, 0, 'opening the thread read it');
      assert.equal((await post('/api/temple/dms', { id: nothing.me.id, text: '   ' }, me.cookie)).status, 400);

      const group = (await post('/api/temple/group', { name: 'Tổ Đội Test' }, me.cookie)).json.group;
      assert.equal(group.members.length, 1);
      assert.equal(group.owner, true);
      const joined = (await post('/api/temple/group/join', { code: group.code.toLowerCase() }, nothing.cookie)).json.group;
      assert.equal(joined.members.length, 2);
      assert.ok(joined.merit > 0, 'group merit is summed from each member practice');
      assert.equal((await post('/api/temple/group', { name: 'Nhóm Khác' }, me.cookie)).status, 409, 'one group at a time');
      assert.equal((await post('/api/temple/group/message', { text: 'Chúc cả đội top 1' }, nothing.cookie)).status, 200);
      const board2 = (await get('/api/temple/group', me.cookie)).json.group;
      assert.equal((board2.messages as Json[]).length, 1);
      const stranger = await newUser('Người Ngoài');
      assert.equal((await post('/api/temple/group/join', { code: 'ZZZZZZ' }, stranger.cookie)).status, 404);

      // --- Quà cầu may ----------------------------------------------------------
      const sent = (await post('/api/temple/greetings', { id: nothing.me.id, kind: 'huong', text: 'Gửi bạn lá bùa' }, me.cookie)).json;
      assert.equal(sent.gained, 10);
      // Quà cầu may phải nằm trong khoảng số nguyên
      // thành một cú 500, còn 10001 in ra một món quà không ai trả nổi.
      assert.equal((await post('/api/temple/greetings', { id: nothing.me.id, kind: 'chuc', gift_sen: 'abc' }, me.cookie)).status, 400, 'a gift has to be a number');
      assert.equal((await post('/api/temple/greetings', { id: nothing.me.id, kind: 'chuc', gift_sen: 10_001 }, me.cookie)).status, 400, 'and within the gift ceiling');
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
