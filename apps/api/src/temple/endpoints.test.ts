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
    const { MAX_BOWS_DAY, vnDay } = await import('./merit.ts');
    const { templeRouter } = await import('./routes.ts');

    const app = express();
    app.use(express.json());
    app.use('/api/temple', templeRouter);
    // Riot ID ghi qua tuyến tài khoản (bảng users), nên bài test quyền riêng tư dưới đây
    // cần cả hai router trong cùng một app.
    app.use('/api/auth', (await import('../auth-routes.ts')).authRouter);
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
      // Nâng cấp tại chỗ thay vì gọi /api/auth/register: router ở đây không có route
      // đó, và phần lớn các tuyến bên dưới cần một tài khoản thật mới chạy được.
      await pool.query('UPDATE users SET is_guest = false, email = $2 WHERE id = $1', [
        guest.user.id,
        `account-${guest.user.id}@example.com`,
      ]);
      await put('/api/temple/profile', { name }, cookie);
      return { cookie, user: guest.user.id, me: (await get('/api/temple/state', cookie)).json.state };
    }

    // Khách nguyên bản: chưa đăng ký, chưa tự đặt tên — đúng một hàng users mà
    // POST /api/temple/guest mọc ra.
    async function newGuest(): Promise<{ cookie: string; user: string; me: Json }> {
      const guest = await identity.createGuest();
      users.push(guest.user.id);
      const cookie = `mb_session=${guest.token}`;
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


      // Chọn nhân vật: lần đầu miễn phí, hình mới trả 100 Kim Cương, hình đã mở thì
      // dùng lại không mất gì. Id bịa thì 404 — resolveHero (avatar.js:877) không rơi
      // về hình nào cả mà quay vòng random rồi lưu một nhân vật vô hình.
      const first = await post('/api/temple/hero', { hero: 'zoro' }, me.cookie);
      assert.equal(first.status, 200);
      assert.equal(first.json.spent, 0, 'a player who has never picked gets the first form free');
      assert.equal(first.json.state.appearance.hero, 'zoro');
      assert.deepEqual(first.json.state.heroes, ['zoro'], 'and the pick lands in the collection');
      // Cú đổi hình không được xoá những gì còn lại trên người: hàng lối được gộp
      // (jsonb ||) thay vì thay cả object.
      assert.equal(first.json.state.appearance.hair, 'ngan', 'a hero packet keeps the seed haircut');
      assert.equal(first.json.state.equipped.beads, 'chuoi_go', 'nor does it strip the bag');
      const unequip = await put('/api/temple/profile', { equipped: { pet: null } }, me.cookie);
      assert.equal(unequip.json.profile.equipped.pet, null, 'an explicit null still takes the pet off');
      assert.equal(unequip.json.profile.equipped.beads, 'chuoi_go', 'and leaves the rest worn');

      const wallet = first.json.state.ngoc as number;
      const second = await post('/api/temple/hero', { hero: 'kaido' }, me.cookie);
      assert.equal(second.json.spent, 100, 'every new form after the first one is paid for');
      assert.equal(second.json.state.ngoc, wallet - 100, 'and it leaves the wallet on the way out');
      assert.deepEqual(second.json.state.heroes, ['zoro', 'kaido'], 'the collection remembers both');
      const again = await post('/api/temple/hero', { hero: 'zoro' }, me.cookie);
      assert.equal(again.json.spent, 0, 'wearing an unlocked form again is free');
      assert.equal(again.json.state.heroes.length, 2, 'and it does not get listed twice');

      await pool.query('UPDATE temple_profiles SET ngoc = 50 WHERE user_id = $1', [me.user]);
      const brokeForm = await post('/api/temple/hero', { hero: 'law' }, me.cookie);
      assert.equal(brokeForm.status, 409, 'an empty wallet stops a new form');
      assert.equal(brokeForm.code, 'not_enough_ngoc');
      const back = await post('/api/temple/hero', { hero: 'kaido' }, me.cookie);
      assert.equal(back.status, 200, 'but it never locks the collection you already paid for');
      const fakeHero = await post('/api/temple/hero', { hero: 'songoku' }, me.cookie);
      assert.equal(fakeHero.status, 404, 'a hero the engine cannot draw is not a choice');
      // PUT /profile không còn là đường vòng qua giá: im lặng bỏ qua sẽ trả 200 và người
      // bấm tưởng mình vừa đổi được hình.
      const bypass = await put('/api/temple/profile', { appearance: { hero: 'sasuke' } }, me.cookie);
      assert.equal(bypass.status, 400, 'the wallet cannot be skipped by editing appearance');
      assert.equal(bypass.code, 'hero_needs_purchase');
      assert.equal((await get('/api/temple/state', me.cookie)).json.state.appearance.hero, 'kaido', 'and nothing moved');

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
      // Hai trần chặn nhau: 60 phút cho một nhịp (MAX_MEDITATE_MIN) và 90 phút cho một
      // ngày (MAX_MEDITATE_MIN_DAY). Ngày đã tiêu 40 nên sit ba tiếng chỉ còn được phần
      // chưa tiêu — chính trần ngày mới là thứ chặn người để tab mở qua đêm.
      assert.equal((await post('/api/temple/practice', { type: 'meditate_start' }, me.cookie)).status, 200);
      const clamped = await rewindSit(me.cookie, me.user, 180);
      assert.equal(clamped.extra.minutes, 50, 'a three-hour sit stops where the day runs out');
      assert.equal(clamped.gained, 600, 'still twelve merit a minute, just not past the ceiling');
      // Trần ngày là trần cứng: ngồi thêm ba tiếng nữa cũng không cộng được dòng nào.
      assert.equal((await post('/api/temple/practice', { type: 'meditate_start' }, me.cookie)).status, 200);
      const drained = await rewindSit(me.cookie, me.user, 180);
      assert.equal(drained.extra.minutes, 0, 'the day is already fully counted');
      assert.equal(drained.gained, 0, 'and a closed ceiling pays nothing');
      // Lần này hai cú xả chạy song song khi thời thiền vẫn còn: một cú chiếm được
      // hàng, cú kia không còn gì để cộng. Dọn lại trần ngày trước để con số cộng được
      // là số phút ngồi thật, không phải 0 vì hết phòng.
      await pool.query("UPDATE temple_practice SET meditate_min = 0 WHERE user_id = $1 AND day = (now() + INTERVAL '7 hours')::date", [me.user]);
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

      // --- Trần số lần lạy của MỘT NGÀY (SHRINE-LADDER.md §2) --------------------
      // MAX_COUNT chỉ chặn một gói, COOLDOWN_MS chỉ chặn tần suất gói, nên hai trần cộng lại
      // vẫn cho ai đó ngồi bấm liên tục ~30.000 điểm mỗi giờ — nhanh hơn bất kỳ ngưỡng nào
      // trong bảng. Ghi sổ ngày sát trần bằng SQL rồi lạy tiếp: phần vượt vẫn được lạy,
      // chỉ là không thành điểm.
      await new Promise((r) => setTimeout(r, 3200));
      await pool.query(
        "UPDATE temple_practice SET bows = $2 WHERE user_id = $1 AND day = (now() + INTERVAL '7 hours')::date",
        [me.user, MAX_BOWS_DAY - 2],
      );
      const lastTwo = (await post('/api/temple/practice', { type: 'bow', count: 5 }, me.cookie)).json;
      assert.equal(lastTwo.gained, 10, 'only the two bows still under the ceiling are paid');
      assert.equal(lastTwo.state.today.bows, MAX_BOWS_DAY, 'and the ledger stops exactly at the cap');
      await new Promise((r) => setTimeout(r, 3200));
      const full = await post('/api/temple/practice', { type: 'bow', count: 5 }, me.cookie);
      assert.equal(full.status, 200, 'the temple never refuses a bow, it just stops paying');
      assert.equal(full.json.extra.capped, true);
      assert.equal(full.json.gained, 0, 'a finished day of bows earns nothing more');
      assert.equal(full.json.state.today.bows, MAX_BOWS_DAY, 'and the counter does not move');

      const nothing = await newUser('Không Bùa');
      await pool.query("UPDATE temple_profiles SET inventory = '{\"lt_huou\": 1}'::jsonb WHERE user_id = (SELECT user_id FROM temple_profiles WHERE player_id = $1)", [
        nothing.me.id,
      ]);
      const broke = await post('/api/temple/use', { item: 'huong_tram' }, nothing.cookie);
      assert.equal(broke.status, 409, 'an empty bag is not an offering');

      // --- Bảng tri ân: trả bằng Tinh Hoa nội bộ -------------------------------
      const before = (await get('/api/temple/state', me.cookie)).json.state.sen as number;
      const gave = (await post('/api/temple/donations', { amount: 120, note: 'Gửi lời chúc sảnh' }, me.cookie)).json;
      assert.equal(gave.state.sen, before - 120 + Math.ceil(gave.gained * 0.4), 'the offering pays Sen only through the merit ratio');
      assert.equal((await post('/api/temple/donations', { amount: 100_000 }, nothing.cookie)).status, 409, 'Sen cannot go negative');
      assert.equal((await post('/api/temple/donations', { amount: 9_999_999 }, me.cookie)).status, 400, 'and a gift that large is not a gift');
      // Tìm dòng theo tên chứ không lấy hàng đầu: /stele đọc cả DB nên một người cúng
      // nhiều hơn (account thật đang chơi trên dev) sẽ chiếm chỗ số 1.
      const mine = ((await get('/api/temple/stele', me.cookie)).json.rows as Json[]).find((r) => r.name === 'Lữ Khách Một');
      assert.equal(mine?.score, 120);
      // temple.js khắc name/title/score lên bia, nên title phải là danh hiệu theo bậc của
      // chính người đóng góp, không phải honor và cũng không phải rỗng.
      const donorTitle = (await get('/api/temple/state', me.cookie)).json.state.title as string;
      assert.equal(mine?.title, donorTitle);
      assert.ok(((await get('/api/temple/donations', me.cookie)).json.rows as Json[]).some((r) => r.note === 'Gửi lời chúc sảnh'));

      // Hai tài khoản trùng tên hiển thị là hai dòng bia, không phải một dòng cộng dồn.
      // Gộp theo GROUP BY p.name từng đúc 9 người cùng tên trên dev thành một dòng.
      const twin = await newUser('Lữ Khách Một');
      await post('/api/temple/donations', { amount: 200 }, twin.cookie);
      const twins = ((await get('/api/temple/stele', me.cookie)).json.rows as Json[]).filter((r) => r.name === 'Lữ Khách Một');
      assert.equal(twins.length, 2, 'same-name donors keep separate lines on the plaque');
      assert.deepEqual(
        twins.map((r) => r.score).sort((a, b) => (a as number) - (b as number)),
        [120, 200],
        'and each line carries only its own giving',
      );

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

      // --- Lên bậc: Tinh Hoa và Kim Cương cùng rơi xuống ví ---------------------
      // Ngưỡng bậc 4 là 650 Điểm May Mắn (identity.ts:74) nên dịch exp bằng SQL rồi trả
      // một nhịp cầu may thật: phần thưởng phải ra từ addMerit, không từ máy khách.
      const climber = await newUser('Bậc Thang');
      await pool.query('UPDATE temple_profiles SET exp = 640 WHERE user_id = $1', [climber.user]);
      const up = (await post('/api/temple/practice', { type: 'bow', count: 3 }, climber.cookie)).json;
      assert.equal(up.level_ups.length, 1, 'one rung crossed');
      assert.equal(up.level_ups[0].level, 4);
      assert.equal(up.level_ups[0].sen, 200, 'level × 50 Tinh Hoa');
      assert.equal(up.level_ups[0].ngoc, 80, 'level × 20 Kim Cương = the same bonus at the 2.5 ratio');
      assert.equal(up.state.sen, 500 + 6 + 200, 'the wallet gain is the ratio plus the rung bonus');
      assert.equal(up.state.ngoc, 200 + 80, 'and Kim Cương only ever arrives as a grant');

      // --- Admin: hai tuyến chỉ sửa được chính mình ----------------------------
      const { WEARABLE_POOL } = await import('./catalog.ts');
      const boss = await newUser('Thủ Đền');
      await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [boss.user]);
      assert.equal((await get('/api/temple/state', boss.cookie)).json.admin, true, 'the HUD gets the flag, the gate stays on the server');
      assert.equal((await get('/api/temple/state', me.cookie)).json.admin, false);
      assert.equal((await post('/api/temple/admin/level', { level: 19 }, me.cookie)).status, 403, 'a normal account cannot self-promote');
      assert.equal((await post('/api/temple/admin/level', { level: 20 }, boss.cookie)).status, 400, 'the ladder has 19 rungs');
      const promoted = (await post('/api/temple/admin/level', { level: 19 }, boss.cookie)).json;
      assert.equal(promoted.state.level, 19);
      assert.equal(promoted.state.exp, 72_000, 'a rung is written as its own milestone, never a raw number');
      const kit = await post('/api/temple/admin/gear', {}, boss.cookie);
      assert.equal(kit.status, 200);
      const bag = Object.keys(kit.json.state.inventory as Record<string, number>);
      for (const it of WEARABLE_POOL) assert.ok(bag.includes(it.id), `${it.id} is still missing from the admin bag`);
      assert.ok(WEARABLE_POOL.some((it) => it.rank === 'quy'), 'and the Quý pieces are part of what got handed over');

      // Số bot là cấu hình dùng chung: tuyến này ghi temple_settings chứ không phải
      // RAM của riêng process, và chỉ admin chạm được.
      assert.equal((await get('/api/temple/admin/bots', me.cookie)).status, 403, 'a normal account cannot read the hall config');
      assert.equal((await post('/api/temple/admin/bots', { bots: 21 }, boss.cookie)).status, 400, 'the hall holds at most twenty bots');
      assert.equal((await post('/api/temple/admin/bots', { bots: -1 }, boss.cookie)).status, 400, 'and never a negative crowd');
      const botBefore = (await get('/api/temple/admin/bots', boss.cookie)).json as { bots: number; max: number };
      assert.equal(botBefore.max, 20);
      const setBots = await post('/api/temple/admin/bots', { bots: 20 }, boss.cookie);
      assert.equal(setBots.status, 200);
      assert.equal(setBots.json.bots, 20);
      assert.equal((await get('/api/temple/admin/bots', boss.cookie)).json.bots, 20, 'the value is read back from the shared row');
      await post('/api/temple/admin/bots', { bots: botBefore.bots }, boss.cookie);

      // Admin thử tạo hình cũng là việc vận hành: /hero trả giá 0 cho đúng tài khoản đó
      // và không cú bấm nào trừ ví, kể cả cú mà người thường phải trả 100.
      const { HERO_IDS } = await import('./heroes.ts');
      assert.equal((await get('/api/temple/hero', me.cookie)).json.cost, 100, 'a normal account still pays');
      assert.equal((await get('/api/temple/hero', boss.cookie)).json.cost, 0, 'the free pass is read from users.role, not from the client');
      const bossWallet = (await get('/api/temple/state', boss.cookie)).json.state.ngoc as number;
      const wears = (await get('/api/temple/state', boss.cookie)).json.state.appearance.hero as string;
      // Hai hình chắc chắn chưa đứng: hình đang mặc thì spent 0 ở tài khoản nào cũng vậy,
      // nên nó không chứng minh được gì.
      const unseen = HERO_IDS.filter((h) => h !== wears).slice(0, 2);
      const firstForm = (await post('/api/temple/hero', { hero: unseen[0] }, boss.cookie)).json;
      assert.equal(firstForm.spent, 0, 'the admin pays nothing to open a form');
      const secondForm = await post('/api/temple/hero', { hero: unseen[1] }, boss.cookie);
      assert.equal(secondForm.json.spent, 0, 'and not on the second form either, which is the one a player buys');
      assert.equal(secondForm.json.state.ngoc, bossWallet, 'the wallet never moved');
      assert.deepEqual(
        [firstForm.state.heroes, secondForm.json.state.heroes].map((h: string[]) => h.length),
        [1, 2],
        'free does not mean unrecorded: each form still lands in the collection',
      );

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

      // --- Riot ID: một ô nhập, hai số phận theo một cờ ----------------------------
      // Ghi ở tuyến tài khoản (PUT /api/auth/me) vì nó là danh tính người chơi chứ không
      // phải thứ mặc trên avatar; đọc ở tuyến đền (GET /friends) vì đó là chỗ duy nhất
      // *người khác* được thấy. Một request đi qua nẹp phiên thật mới chứng minh được cờ
      // ấy chặn được gì.
      const riotPut = (body: Json, cookie: string) => send('/api/auth/me', { cookie, method: 'PUT', body });
      const peerRow = async (cookie: string, id: number) =>
        (((await get('/api/temple/friends', cookie)).json.friends as Json[]).find((p) => p.id === id) ?? {}) as Json;

      assert.equal((await riotPut({ riot_id: 'Leesin#12' }, me.cookie)).code, 'invalid_riot_id', 'tag is 3-5 characters');
      assert.equal((await riotPut({ riot_id: 'TFTIQ  Samuel#123' }, me.cookie)).code, 'invalid_riot_id', 'one space, not two');
      // Tên hai từ là dạng hay gặp của Riot ID thật, nên phải qua được cả route lẫn cột
      // stores; làm trên `stranger` để không đổi số phận của `me` ở các dòng dưới.
      const spaced = await riotPut({ riot_id: 'TFTIQ Samuel#1234', riot_public: true }, stranger.cookie);
      assert.equal(spaced.status, 200, 'a two-word game name is a real riot id');
      assert.equal(spaced.json.user.riotId, 'TFTIQ Samuel#1234');
      assert.equal((await riotPut({ riot_id: 'Leesin#123' }, 'mb_session=nonsense')).status, 401, 'no session, no identity');

      const lit = await riotPut({ riot_id: 'Leesin#123', riot_public: true }, me.cookie);
      assert.equal(lit.status, 200);
      assert.equal(lit.json.user.riotId, 'Leesin#123');
      assert.equal(lit.json.user.riotPublic, true);
      assert.equal((await peerRow(me.cookie, nothing.me.id)).riot, undefined, 'the peer has not entered one yet');
      assert.equal((await peerRow(nothing.cookie, me.me.id)).riot, 'Leesin#123', 'a public id reaches the friend list');

      // Tắt cờ là biến mất ở lần đọc kế tiếp, không cần chờ ai xoá gì.
      assert.equal((await riotPut({ riot_id: 'Leesin#123', riot_public: false }, me.cookie)).json.user.riotPublic, false);
      assert.equal((await peerRow(nothing.cookie, me.me.id)).riot, undefined, 'private again, immediately');

      // Bộ đôi mới là thứ duy nhất; trùng *tên* thì Riot còn cho phép, và viết hoa khác
      // nhau không phải đường lọt qua chỉ mục.
      assert.equal((await riotPut({ riot_id: 'Leesin#999', riot_public: true }, nothing.cookie)).status, 200);
      const clash = await riotPut({ riot_id: 'leESIN#999', riot_public: true }, stranger.cookie);
      assert.equal(clash.status, 409, 'the pair is already claimed');
      assert.equal(clash.code, 'riot_id_taken');
      // Chuỗi trống là XOÁ (khác 'tắt cờ'): một Riot ID rỗng mà còn treo public thì vô nghĩa.
      const wiped = await riotPut({ riot_id: '', riot_public: true }, nothing.cookie);
      assert.equal(wiped.json.user.riotId, null);
      assert.equal(wiped.json.user.riotPublic, false);
      assert.equal((await peerRow(me.cookie, nothing.me.id)).riot, undefined, 'the wipe took the peer view too');

      // --- Quà cầu may ----------------------------------------------------------
      // Thưởng mở quà nay cộng ngay lúc quà tới tay (social.ts:sendGreeting), nên phép
      // đo là ví người *nhận* đổi ra sao quanh một cú gửi — không còn lượt bấm ở đầu kia.
      const purse = async (c: string) => ((await get('/api/temple/state', c)).json.state as Json);
      const giftBefore = await purse(nothing.cookie);
      const sent = (await post('/api/temple/greetings', { id: nothing.me.id, kind: 'huong', text: 'Gửi bạn lá bùa' }, me.cookie)).json;
      assert.equal(sent.gained, 10);
      // Quà cầu may phải nằm trong khoảng số nguyên
      // thành một cú 500, còn 10001 in ra một món quà không ai trả nổi.
      assert.equal((await post('/api/temple/greetings', { id: nothing.me.id, kind: 'chuc', gift_sen: 'abc' }, me.cookie)).status, 400, 'a gift has to be a number');
      assert.equal((await post('/api/temple/greetings', { id: nothing.me.id, kind: 'chuc', gift_sen: 10_001 }, me.cookie)).status, 400, 'and within the gift ceiling');
      const box = (await get('/api/temple/greetings', nothing.cookie)).json.rows as Json[];
      assert.equal(box.length, 1);
      assert.equal(box[0].from.id, me.me.id, 'the inbox shows who sent it');
      assert.equal('seen' in box[0], false, 'and the log reports no read/unread state — there is nothing left to open');
      const giftAfter = await purse(nothing.cookie);
      assert.equal(Number(giftAfter.exp) - Number(giftBefore.exp), 5, 'the +5 Điểm May Mắn the open button used to pay is in the wallet at arrival');
      assert.equal(Number(giftAfter.sen) - Number(giftBefore.sen), 7, 'and +7 Tinh Hoa: the 5 the gift pays plus 2 from the 0.4 ratio on those points');
      assert.equal((await post(`/api/temple/greetings/${box[0].id}/open`, {}, nothing.cookie)).status, 404, 'the open route is gone');
      const stamped = await pool.query<{ seen_at: Date | null }>('SELECT seen_at FROM temple_greetings WHERE id = $1', [box[0].id]);
      assert.ok(stamped.rows[0]?.seen_at, 'the row is born already granted, so no gift can wait unopened');

      // --- Khách chỉ cầu may -----------------------------------------------------
      // Một hàng khách mang email giả, nên bất kỳ dấu vết công khai nào cũng nhân danh
      // người không tồn tại. Phần *ghi* social phải 403; phần đọc thì không, vì HUD vẽ
      // tấm CTA đăng ký từ một danh sách rỗng chứ không từ một hàng lỗi.
      const visitor = await newGuest();
      assert.equal(visitor.me.level, 1, 'a fresh guest starts at the first rung');
      assert.equal((await post('/api/temple/practice', { type: 'bow', count: 3 }, visitor.cookie)).status, 200, 'cầu may still works');
      for (const [path, body] of [
        ['/friends', { id: me.me.id, action: 'add' }],
        ['/dms', { id: me.me.id, text: 'Chào bạn' }],
        ['/group', { name: 'Nhóm Của Khách' }],
        ['/group/join', { code: 'ABCDEF' }],
        ['/group/leave', {}],
        ['/group/message', { text: 'Chào cả nhóm' }],
        ['/greetings', { id: me.me.id, kind: 'chuc' }],
        ['/donations', { amount: 50 }],
      ] as [string, Json][]) {
        const blocked = await post(`/api/temple${path}`, body, visitor.cookie);
        assert.equal(blocked.status, 403, `POST ${path} is not for guests`);
        assert.equal(blocked.code, 'guest_account_required', `POST ${path} says why`);
      }
      const guestName = await put('/api/temple/profile', { name: 'Tự Đặt' }, visitor.cookie);
      assert.equal(guestName.status, 403, 'and a guest does not choose the name over their head');
      assert.equal(guestName.code, 'guest_account_required');
      // Hình dáng thì vẫn đổi được, và nhân vật cũng vậy: hai thứ đó chỉ đụng ví và
      // avatar của chính người bấm, không để lại dấu vết công khai nào dưới một email giả.
      const guestLook = await put('/api/temple/profile', { appearance: { skin: '#112233' } }, visitor.cookie);
      assert.equal(guestLook.status, 200, 'but the avatar is still theirs to dress');
      assert.equal(guestLook.json.profile.appearance.skin, '#112233');
      const guestHero = await post('/api/temple/hero', { hero: 'zoro' }, visitor.cookie);
      assert.equal(guestHero.json.spent, 0, 'and the first form is free for a guest too');
      assert.equal(guestHero.json.state.appearance.hero, 'zoro');
      // Đọc thì mở hết, trả về rỗng chứ không 403.
      for (const path of ['/friends', '/dms', '/group', '/greetings']) {
        assert.equal((await get(`/api/temple${path}`, visitor.cookie)).status, 200, `GET ${path} stays open`);
      }
      // Quà thì khách vẫn nhận được, phần thưởng vẫn vào ví — chặn đầu nhận mới là cắt
      // mất phần thưởng. Người gửi là `nothing`: `me` vừa gửi một quà ở blok trên và nhịp
      // /greetings còn đang cooldown.
      const guestBefore = await purse(visitor.cookie);
      const toGuest = (await post('/api/temple/greetings', { id: visitor.me.id, kind: 'huong', text: 'Gửi lữ khách' }, nothing.cookie)).json;
      assert.equal(toGuest.gained, 10);
      const guestBox = (await get('/api/temple/greetings', visitor.cookie)).json.rows as Json[];
      assert.equal(guestBox.length, 1);
      const guestAfter = await purse(visitor.cookie);
      assert.equal(Number(guestAfter.exp) - Number(guestBefore.exp), 5, 'a guest is paid for the gift at arrival, with no click to make');

      // Đăng ký nâng cấp đúng hàng khách đó (accounts.ts:promoteGuest), nên số liệu
      // đang có không mất — đây là lời hứa "thử trước, giữ sau" của màn chờ.
      await pool.query('UPDATE users SET is_guest = false, email = $2 WHERE id = $1', [
        visitor.user,
        `moved-${visitor.user}@example.com`,
      ]);
      const upgraded = (await get('/api/temple/state', visitor.cookie)).json.state;
      assert.equal(upgraded.today.bows, 3, 'the bows the guest already made survive the upgrade');
      assert.equal((await put('/api/temple/profile', { name: 'Đã Là Thành Viên' }, visitor.cookie)).status, 200, 'and now the name is theirs');

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
