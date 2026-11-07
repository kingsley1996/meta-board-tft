// Hai cửa lấy đồ của sảnh: Cửa hàng bày những món có giá, Lão Hành Khất giữ những
// món không có giá.
//
// Máy khách biết giá vì nó đọc cùng một meta.json, nhưng giá không đi theo request:
// người chơi chỉ gửi *tên món*, còn bao nhiêu tiền và có được bán không là máy chủ
// tra ở catalog.ts. Không có nẹp này thì một cú sửa body là mua được Áo Choàng Như Ý
// với giá 1 Sen.
//
// Vì sao hai cửa chứ không phải một: 47 món có giá thì bán đúng giá đã soạn là xong.
// 19 món còn lại không có giá nào trong asset — bản gốc giấu chúng sau "Duyên truyền
// thuyết" và một ông lão bán bí kiếp, ba phần một ngày. Cửa thứ hai giữ nguyên nhịp đó;
// giá thì dẫn xuất từ chính asset thay vì để flat (catalog.ts:duyenPrice), vì 15/19 món
// trên chiếu là hàng Quý và để nó ngang giá chiếc áo xám mặc lúc mới vào thì không ai
// còn lý do săn chiếu lão nữa.
//
// Vì sao khách mua được (withUser chứ không phải withAccount): hai cửa này chỉ đụng ví
// và túi của chính người bấm, không để lại hàng nào nhân danh một email giả ngoài
// sảnh — đúng như vòng quay Hex đã cấp đồ cho khách từ trước (hall.ts:102).
import { Router } from 'express';
import { pool } from '../db.ts';
import { DUYEN_POOL, duyenPrice, isSold, isStackable, itemById, type CatalogItem } from './catalog.ts';
import { ensureTempleProfile, levelFromExp } from './identity.ts';
import { ApiError, cooldown, idName, withUser } from './http.ts';
import { vnDay } from './merit.ts';
import { ensureTempleTables } from './schema.ts';
import { templeState } from './state.ts';

export const shopRouter = Router();

// Nhịp của bản gốc (api.js:916): `{fated: true, left: 3}` — ba món một ngày. Giá thì
// không còn flat: xem catalog.ts:duyenPrice, suy từ dải hàng Quý trong chính asset.
const DUYEN_PER_DAY = 3;

// Tên cột ví trùng tên cột trong DB một cách cố ý: giá trị đến từ bảng phân loại ở
// dưới, không đến từ chữ người chơi gửi lên, nên nó an toàn khi ghép vào SQL.
const WALLET = { sen: 'sen', ngoc: 'ngoc' } as const;
type Wallet = keyof typeof WALLET;

shopRouter.post('/shop/buy', withUser(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const item = needItem(req.body?.item);
  if (!isSold(item)) throw new ApiError(400, 'not_for_sale', `${item.id} has no price in the catalog`);
  const wallet: Wallet = req.body?.currency === 'ngoc' ? 'ngoc' : 'sen';
  const price = wallet === 'ngoc' ? item.price_ngoc : item.price_sen;
  // Một món chỉ có một loại tiền trong asset (47/47), nên giá 0 ở đây nghĩa là người
  // chơi trả nhầm thứ tiền, không phải món đó đang miễn phí.
  if (!price) throw new ApiError(400, 'wrong_currency', `${item.id} is not sold for ${wallet}`);
  cooldown(`${user.id}:buy:${item.id}`, 1_000);
  await payAndGrant(user.id, item, wallet, price);
  res.json({ state: await templeState(user.id), item: item.id, price, currency: wallet });
}));

// Ba món duyên của hôm nay, và lão còn mấy phần. Giá đi theo từng món vì mỗi món một
// bậc (catalog.ts:duyenPrice); máy khách không còn một con số duy nhất để tự vẽ.
shopRouter.get('/hermit', withUser(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const day = vnDay();
  const [taken, owned] = await Promise.all([exchangedToday(user.id, day), ownedSet(user.id)]);
  res.json({
    left: Math.max(0, DUYEN_PER_DAY - taken.length),
    offers: duyenOffers(day, owned, DUYEN_PER_DAY - taken.length).map((id) => ({ id, price: duyenPrice(itemById.get(id)!) })),
    total: DUYEN_POOL.length,
  });
}));

shopRouter.post('/hermit/exchange', withUser(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const item = needItem(req.body?.item);
  const day = vnDay();
  const [taken, owned] = await Promise.all([exchangedToday(user.id, day), ownedSet(user.id)]);
  // Hai lời từ chối khác nhau vì hai chuyện khác nhau: "hết phần hôm nay" thì ngày mai
  // còn, còn "món này không nằm trên chiếu" thì có chờ cũng không tới lượt nó.
  if (taken.length >= DUYEN_PER_DAY) throw new ApiError(409, 'duyen_sold_out', 'the hermit sold all three portions today');
  const offers = duyenOffers(day, owned, DUYEN_PER_DAY - taken.length);
  if (!offers.includes(item.id)) throw new ApiError(409, 'no_duyen_offer', `${item.id} is not on the hermit's mat today`);
  cooldown(`${user.id}:duyen`, 1_000);
  const price = duyenPrice(item);
  await payAndGrant(user.id, item, 'sen', price, day);
  res.json({ state: await templeState(user.id), item: item.id, price });
}));

// ---- helpers ------------------------------------------------------------------

function needItem(value: unknown): CatalogItem {
  const item = itemById.get(idName(value, 'invalid_item'));
  if (!item) throw new ApiError(404, 'no_such_item', `"${String(value ?? '')}" is not in the catalog`);
  return item;
}

// Danh sách duyên xoay theo ngày, không theo người: bản gốc chọn "chùa duyên" bằng
// `temples[ngày % số chùa]` (api.js:425), nên cả sảnh cùng thấy một bộ mặt hôm nay.
// Món đã nằm trong túi thì bị bỏ qua, vì đổi một món mình đang có là mất tiền mà không
// lấy lại được gì — và chính cách bỏ đó khiến người đổi đều ba món một ngày sạch 19 món
// sau bảy ngày, mà không cần server giữ thêm danh sách kho nào khác.
export function duyenOffers(day: string, owned: Set<string>, left: number): string[] {
  if (left <= 0 || !DUYEN_POOL.length) return [];
  const start = Number(day.replace(/-/g, '')) % DUYEN_POOL.length;
  const out: string[] = [];
  for (let k = 0; k < DUYEN_POOL.length && out.length < left; k += 1) {
    const it = DUYEN_POOL[(start + k) % DUYEN_POOL.length]!;
    if (!owned.has(it.id)) out.push(it.id);
  }
  return out;
}

// Trừ ví và trao đồ trong một transaction trên hàng hồ sơ đã khoá.
//
// Toàn bộ điều kiện đứng SAU `FOR UPDATE`: kiểm tra ví trước khi khoá hàng thì hai cú
// chạm cùng lúc cùng thấy đủ tiền và cùng mua được một món — sảnh mất tiền mà người
// chơi chỉ nhận một món. Cột temple_exchanges ghi cùng nhịp để một SLOT duyên
// không được dùng hai lần; INSERT xung đột là toàn bộ giao dịch bại.
async function payAndGrant(userId: string, item: CatalogItem, wallet: Wallet, price: number, duyenDay?: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ exp: number; sen: number; ngoc: number; inventory: Record<string, number> }>(
      'SELECT exp, sen, ngoc, inventory FROM temple_profiles WHERE user_id = $1 FOR UPDATE',
      [userId],
    );
    const row = rows[0];
    if (!row) throw new Error(`no temple profile for ${userId}`);
    if (levelFromExp(row.exp).level < item.unlock_level) {
      throw new ApiError(403, 'level_locked', `${item.id} needs level ${item.unlock_level}`);
    }
    // Bộ sưu tập thì một lần: bán trùng một món mặc được là bán lại thứ người chơi đã có.
    if (!isStackable(item) && item.id in row.inventory) throw new ApiError(409, 'already_owned', `${item.id} is already in the bag`);
    if (row[wallet] < price) throw new ApiError(409, wallet === 'ngoc' ? 'not_enough_ngoc' : 'not_enough_sen', `not enough ${wallet}`);

    if (duyenDay) {
      const claimed = await client.query(
        'INSERT INTO temple_exchanges (user_id, item, day) VALUES ($1, $2, $3) ON CONFLICT (user_id, item, day) DO NOTHING RETURNING item',
        [userId, item.id, duyenDay],
      );
      if (!claimed.rowCount) throw new ApiError(409, 'already_exchanged', `${item.id} was already exchanged today`);
      const { rows: used } = await client.query<{ n: string }>(
        'SELECT COUNT(*)::text AS n FROM temple_exchanges WHERE user_id = $1 AND day = $2',
        [userId, duyenDay],
      );
      if (Number(used[0]?.n ?? 0) > DUYEN_PER_DAY) throw new ApiError(409, 'duyen_sold_out', 'the hermit is sold out today');
    }

    await client.query(
      `UPDATE temple_profiles
          SET ${WALLET[wallet]} = ${WALLET[wallet]} - $2,
              inventory = jsonb_set(inventory, ARRAY[$3], to_jsonb((COALESCE(inventory -> $3, '0')::int) + 1)),
              updated_at = now()
        WHERE user_id = $1`,
      [userId, price, item.id],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function ownedSet(userId: string): Promise<Set<string>> {
  const { rows } = await pool.query<{ inventory: Record<string, number> }>('SELECT inventory FROM temple_profiles WHERE user_id = $1', [
    userId,
  ]);
  return new Set(Object.keys(rows[0]?.inventory ?? {}));
}

async function exchangedToday(userId: string, day: string): Promise<string[]> {
  const { rows } = await pool.query<{ item: string }>('SELECT item FROM temple_exchanges WHERE user_id = $1 AND day = $2', [
    userId,
    day,
  ]);
  return rows.map((r) => r.item);
}
