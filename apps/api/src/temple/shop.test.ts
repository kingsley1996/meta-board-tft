// Gate cho hai cửa mua đồ: giá đúng như asset, tiền trừ một lần, và duyên chỉ ba món
// một ngày.
//
// Vì sao chạy qua HTTP thật: phần dễ hỏng ở đây không phải phép trừ mà là *thứ tự* —
// máy chủ có tra giá ở catalog trước khi trừ ví không, một cú chạm đúp có mua được hai
// lần không, và một món đang mặc nhưng chưa từng nằm trong túi có ai bán lại không.
// Những điều đó chỉ lộ ra khi request đi qua nẹp phiên và đè lên cùng một hàng hồ sơ.
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

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Vài con số dưới đây lấy nguyên văn từ meta.json — nếu asset đổi giá thì test phải
// đổi theo, đó là lúc người ta biết mình vừa sửa một thứ có thật trong game.
const NEN = { id: 'nen_sap', sen: 10 };
const HOA = { id: 'hoa_dang', sen: 15 };
const AO_SEN = { id: 'ao_sen', ngoc: 60 };
const AO_VANG = { id: 'ao_vang', sen: 500, level: 10 };
const TRAU_VANG = { id: 'lt_trau_vang', ngoc: 1280 };
const MAT_PER_DAY = 3;
// Giá duyên không còn flat: 680 một món áo Quý, gấp rưỡi món Sen đắt nhất trong cửa
// hàng (ao_vang 500) — đó chính là chỗ test này phải đỏ lên nếu ai đó đổi thang giá.
const QUY_MIN = 550;

test(
  'the shop sells at the authored price and the hermit sells three portions a day',
  { skip: !hasDb, concurrency: false, timeout: 240_000 },
  async () => {
    const t0 = Date.now();
    const pool: Pool = (await import('../db.ts')).pool;
    const identity = await import('./identity.ts');
    const { DUYEN_POOL, duyenPrice } = await import('./catalog.ts');
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
      let json: Json = {};
      try {
        json = (await res.json()) as Json;
      } catch {
        // thân rỗng thì giữ {}, để assert trên .code tự fail thay vì ném lỗi parse.
      }
      return { status: res.status, json, code: json.code as string | undefined };
    };
    const get = (path: string, cookie: string) => send(path, { cookie });
    const post = (path: string, body: unknown, cookie: string) => send(path, { cookie, method: 'POST', body: body ?? {} });
    const buy = (item: string, currency: string, cookie: string) => post('/api/temple/shop/buy', { item, currency }, cookie);

    // Khách nguyên bản: cửa mua đồ chỉ đụng ví và túi của chính người bấm, nên nó đứng
    // phía withUser — cùng quyết định với vòng quay Hex (hall.ts:102).
    const guest = await identity.createGuest();
    users.push(guest.user.id);
    const cookie = `mb_session=${guest.token}`;

    try {
      const start = (await get('/api/temple/state', cookie)).json.state as Json;
      assert.equal(start.sen, 500);
      assert.equal(start.ngoc, 200);
      assert.equal(start.exp, 20, 'a fresh profile is level 1');
      assert.equal(start.inventory[NEN.id], 10, 'the day-one bag');

      // --- Cửa hàng: đúng giá, đúng loại tiền ----------------------------------
      const first = (await buy(NEN.id, 'sen', cookie)).json;
      assert.equal(first.state.sen, 500 - NEN.sen, 'the wallet drops by exactly the authored price');
      assert.equal(first.state.inventory[NEN.id], 11, 'a gift item stacks');
      assert.equal(first.state.exp, 20, 'buying earns no merit — economy-lite has no pay-to-rank');
      assert.equal(first.item, NEN.id);

      const loop = await buy(NEN.id, 'sen', cookie);
      assert.equal(loop.status, 429, 'a loop on one card is the same thing a loop on bows is');
      assert.equal(loop.code, 'too_fast');
      // 429 trả {error, code} — không có state, nên cái ví phải hỏi lại bằng đường đọc.
      assert.equal((await get('/api/temple/state', cookie)).json.state.sen, 490, 'and the refused packet spent nothing');
      assert.equal((await get('/api/temple/state', cookie)).json.state.inventory[NEN.id], 11, 'nor handed out a second candle');

      const second = (await buy(HOA.id, 'sen', cookie)).json;
      assert.equal(second.state.sen, 500 - NEN.sen - HOA.sen, 'a different card is not blocked by the first');
      assert.equal(second.state.inventory[HOA.id], 11);

      // --- Cửa hàng: ba lời từ chối phải khác nhau -----------------------------
      const locked = await buy(AO_VANG.id, 'sen', cookie);
      assert.equal(locked.status, 403, `level 1 cannot buy the level ${AO_VANG.level} robe`);
      assert.equal(locked.code, 'level_locked');

      const freebie = await buy('ao_lam', 'sen', cookie);
      assert.equal(freebie.status, 400, 'the catalog has no price for it, so the shop does not sell it');
      assert.equal(freebie.code, 'not_for_sale');

      const wrongWallet = await buy(AO_SEN.id, 'sen', cookie);
      assert.equal(wrongWallet.status, 400, 'ao_sen is bought with Ngoc, and Sen is not a substitute');
      assert.equal(wrongWallet.code, 'wrong_currency');

      const junkShape = await buy('../../etc/passwd', 'sen', cookie);
      assert.equal(junkShape.status, 400, 'an id that is not an id never reaches the wallet query');
      assert.equal(junkShape.code, 'invalid_item');

      const junk = await buy('khong_co_trong_asset', 'sen', cookie);
      assert.equal(junk.status, 404);
      assert.equal(junk.code, 'no_such_item');

      const wearable = (await buy(AO_SEN.id, 'ngoc', cookie)).json;
      assert.equal(wearable.state.ngoc, 200 - AO_SEN.ngoc);
      assert.equal(wearable.state.inventory[AO_SEN.id], 1, 'a collection piece enters the bag once');

      await sleep(1_050);
      const again = await buy(AO_SEN.id, 'ngoc', cookie);
      assert.equal(again.status, 409, 'the shop does not sell you your own robe twice');
      assert.equal(again.code, 'already_owned');

      const broke = await buy(TRAU_VANG.id, 'ngoc', cookie);
      assert.equal(broke.status, 409);
      assert.equal(broke.code, 'not_enough_ngoc');

      // --- Chiếu duyên ---------------------------------------------------------
      // Hàng Quý giờ đắt hơn ví ngày đầu, nên nạp ví bằng SQL ngay tại đây. Bốn món nền
      // được bỏ sẵn vào túi để chiếu hôm nay chắc chắn toàn hàng Quý: không thì ngày
      // xoay ra bộ đồ mới tinh và đoạn này chẳng đo được giá Quý nào cả.
      await pool.query(
        `UPDATE temple_profiles
            SET inventory = inventory || '{"ao_lam":1,"ao_xam":1,"chuoi_go":1,"bd_xam":1}'::jsonb,
                sen = 6000
          WHERE user_id = $1`,
        [guest.user.id],
      );
      const mat = (await get('/api/temple/hermit', cookie)).json;
      assert.equal(mat.left, MAT_PER_DAY);
      assert.equal(mat.offers.length, MAT_PER_DAY, 'three portions, exactly the `left: 3` of api.js:916');
      assert.equal(mat.total, DUYEN_POOL.length);
      for (const o of mat.offers) {
        const it = DUYEN_POOL.find((i) => i.id === o.id);
        assert.ok(it, `${o.id} is not a hermit item`);
        assert.equal(o.price, duyenPrice(it), 'the mat quotes the derived ladder, not one number for everything');
        // Món Quý phải đứng trên đỉnh cột Sen của cửa hàng; món nền thì giữ đúng giá
        // cánh cổng bản gốc.
        assert.ok(it!.default ? o.price === 100 : o.price > QUY_MIN - 1, `${o.id} at ${o.price} is not a Quý price`);
      }

      const taken: string[] = [];
      let spent = 0;
      let wallet = (await get('/api/temple/state', cookie)).json.state.sen as number;
      for (let i = 0; i < MAT_PER_DAY; i += 1) {
        const current = (await get('/api/temple/hermit', cookie)).json;
        assert.equal(current.left, MAT_PER_DAY - i);
        // Món đã đổi bị bỏ khỏi chiếu ngay trong ngày, nên offers[0] không bao giờ là
        // một món đã mua — đó là cách người chơi không trả 680 Sen cho đồ của mình.
        const offer = current.offers[0];
        assert.ok(!taken.includes(offer.id), 'an already exchanged item must not stay on the mat');
        const got = await post('/api/temple/hermit/exchange', { item: offer.id }, cookie);
        assert.equal(got.status, 200, `exchange ${i + 1} of the day`);
        assert.equal(got.json.price, offer.price, 'the receipt charges the price the mat showed');
        spent += offer.price;
        wallet -= offer.price;
        assert.equal(got.json.state.sen, wallet);
        assert.equal(got.json.state.inventory[offer.id], 1, 'the traded item is in the bag, not only on the avatar');
        taken.push(offer.id);
        await sleep(1_050);
      }
      assert.equal(taken.length, new Set(taken).size, 'three portions must be three different items');
      // Chiếu hôm nay chắc chắn toàn hàng Quý (xem đoạn nạp túi ở trên), nên ba phần
      // không thể rẻ hơn ba lần đáy của thang Quý.
      assert.ok(spent >= QUY_MIN * MAT_PER_DAY, `three Quý portions should cost a Quý purse, got ${spent}`);

      const rows = await pool.query(
        'SELECT item FROM temple_exchanges WHERE user_id = $1 AND day = (now() + INTERVAL \'7 hours\')::date',
        [guest.user.id],
      );
      assert.equal(rows.rowCount, MAT_PER_DAY, 'the ledger has one row per portion');

      const soldOut = await post('/api/temple/hermit/exchange', { item: taken[0] }, cookie);
      assert.equal(soldOut.status, 409, 'the fourth portion of a day is not sold');
      assert.equal(soldOut.code, 'duyen_sold_out');
      const emptyMat = (await get('/api/temple/hermit', cookie)).json;
      assert.equal(emptyMat.left, 0);
      assert.deepEqual(emptyMat.offers, []);

      // Tiền của ngày hôm qua không quay lại hôm nay: sen đã tiêu là hết.
      assert.equal(
        (await pool.query('SELECT sen FROM temple_profiles WHERE user_id = $1', [guest.user.id])).rows[0].sen,
        6000 - spent,
        'the purse is short by exactly the three mat prices, and the refused fourth spent nothing',
      );

      assert.equal((await post('/api/temple/shop/buy', { item: NEN.id }, 'mb_session=nonsense')).status, 401);
      console.log(`   shop: ${Math.round((Date.now() - t0) / 1000)}s`);
    } finally {
      server.close();
      if (users.length) await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
      await pool.end();
    }
  },
);
