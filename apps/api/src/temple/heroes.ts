// Bộ sưu tập nhân vật: mọi hình nặn sẵn trong engine, mở một lần miễn phí rồi mỗi lần
// đổi thêm là một lần trả Kim Cương.
//
// Vì sao không đi qua PUT /profile: tuyến đó máy khách tự khai appearance và không có
// ví ở gần, nên nếu nó còn nhận `hero` thì một cú curl đổi được hình đang mặc mà không
// mất đồng nào. `hero` đã bị lọc khỏi whitelist ở identity.ts và mọi cú gửi nó lên trả
// 400 hero_needs_purchase — im lặng bỏ qua sẽ khiến người chơi tưởng mình vừa đổi được.
//
// Ba trạng thái của cột `heroes` (schema.sql), và mỗi trạng thái một giá:
//   - NULL (hàng cũ trước cơ chế này): bản backfill đã ghi đúng nhân vật họ đang đứng,
//     nên không ai bị đòi 100 Kim Cương chỉ để giữ nguyên hình mình đang có.
//   - '{}' (hàng mới sinh): chưa chọn lần nào -> lần chọn đầu miễn phí.
//   - đã có id: đổi sang id đã nằm trong danh sách thì miễn phí (dùng lại món đã mở),
//     ra ngoài thì trả HERO_COST_NGOC.
//
// Khách dùng được tuyến này, giống hai cửa hàng (shop.ts): nó chỉ đụng ví và avatar của
// chính người bấm, không để lại hàng nào nhân danh một email giả ngoài sảnh.
//
// Tài khoản admin (`users.role`) đổi được mọi hình mà không trừ đồng nào, cùng hướng
// với /admin/gear (đổ cả 63 món mặc được vào túi để thử đồ Quý/Hiếm ngay): thử tạo hình
// là việc vận hành, không phải việc phải trả Kim Cương. `role` đọc từ hàng users chứ
// không từ máy khách, nên không ai tự phong được bằng một cú PUT.
import { Router } from 'express';
import { pool } from '../db.ts';
import type { AuthUser } from '../accounts.ts';
import { ensureTempleProfile } from './identity.ts';
import { ApiError, idName, withUser } from './http.ts';
import { ensureTempleTables } from './schema.ts';
import { templeState } from './state.ts';

export const heroRouter = Router();

// Toàn bộ id mà avatar.js:HERO_LIST nặn được. Id là khoá của hình (buildHeroHead3D
// nhảy theo id) nên danh sách này là phía máy chủ của ô 'hero' trong hồ sơ: một id lạ
// không rơi về hình nào cả, engine chỉ quay vòng ngẫu nhiên (avatar.js:resolveHero).
export const HERO_IDS = [
  'luffy_g5',
  'naruto_sage',
  'zoro',
  'sasuke',
  'sanji',
  'kakashi',
  'law',
  'itachi',
  'ace',
  'shanks',
  'minato',
  'kaido',
  'yone_chibi',
  'leesin_chibi',
  'batman_chibi',
];

// Giá một lần đổi — con số 100 là của đề bài. Nó nằm gọn trong dải giá Kim Cương mà
// catalog đã dùng cho đồ (60..300 trong meta.json), tức một hình mới đắt ngang một món
// Quý giữa bảng; quà lên bậc ở merit.ts:92 (bậc 2 +40, bậc 3 +60) vừa đủ trả cho nó.
export const HERO_COST_NGOC = 100;

// Giá một hình mới *cho tài khoản này*. Cả hai response đều trả nó thay vì hằng số để
// HUD không phải tự suy ra quy tắc "admin thì miễn phí" từ một cờ nào khác: một chỗ
// quyết giá, và chỗ đó là server.
const priceFor = (user: AuthUser): number => (user.role === 'admin' ? 0 : HERO_COST_NGOC);

// Bộ sưu tập + giá, cho ô nhân vật trong Hồ sơ vẽ trước khi người chơi bấm cú nào.
// Giá không có bản sao ở máy khách: catalog.ts đọc giá đồ từ meta.json, còn nhân vật
// thì không nằm trong asset nào, nên con số duy nhất là hằng số dưới đây và HUD lấy
// nó từ đây — một cú sửa giá chỉ đi qua một chỗ.
heroRouter.get('/hero', withUser(async (req, res, user) => {
  await ensureTempleTables();
  const profile = await ensureTempleProfile(user.id);
  res.json({ heroes: profile.heroes, cost: priceFor(user), current: profile.appearance?.hero ?? null });
}));

heroRouter.post('/hero', withUser(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const hero = idName(req.body?.hero, 'invalid_hero');
  if (!HERO_IDS.includes(hero)) throw new ApiError(404, 'no_such_hero', `"${hero}" is not one of the ${HERO_IDS.length} forms`);
  // Không có cooldown ở đây, dù hai cửa hàng đều có một nhịp 1 giây: FOR UPDATE dưới
  // đã khiến một cú bấm đúp vô hại (cú thứ hai thấy hình đã sở hữu nên không trừ tiền
  // lần hai), và vòng lặp nhanh nhất có thể viết ra là duyệt hết danh sách — tốn nhiều
  // nhất là một lần giá cho mỗi hình rồi từ đó về sau miễn phí hết. Chặn nhịp chỉ tổ
  // khiến một người bấm qua bấm lại giữa hai hình bị chậm.
  const cost = priceFor(user);
  const { spent } = await pickHero(user.id, hero, cost);
  res.json({ state: await templeState(user.id), hero, spent, cost });
}));

// ---- helpers ------------------------------------------------------------------

// PUT /profile có được gửi kèm `hero` không? Không, và phải báo rõ chứ không im lặng:
// readProfilePatch đã lọc hero ra khỏi whitelist nên nếu tuyến cứ đi tiếp thì nó trả
// 200 với một khối appearance rỗng — người bấm đổi nhân vật tưởng mình vừa đổi được
// hình mà ví không mất đồng nào. Kiểm trên body thô chứ không trên patch vì patch là
// kết quả *sau* khi lọc, và chính cái đã lọc là thứ cần bị từ chối.
//
// Cả HUD chỉ có một chỗ gửi hero (ô nhân vật trong Hồ sơ) và chỗ đó nay gọi POST /hero,
// nên chặn theo sự hiện diện của key là đủ — không có client thật nào gửi kèm nhân vật
// đang mặc cho một cú đổi tóc.
export function heroInBody(body: Record<string, unknown> | undefined): boolean {
  const appearance = body?.appearance;
  return !!appearance && typeof appearance === 'object' && 'hero' in appearance;
}

// Toàn bộ điều kiện đứng SAU `FOR UPDATE`, cùng khuôn với shop.ts:payAndGrant. Hai cú
// bấm cùng lúc mà cùng thấy "chưa sở hữu" thì người chơi mất 200 Kim Cương cho một
// nhân vật; khoá hàng hồ sơ trước khi đọc ví chặn đúng chuyện đó.
//
// `price` là giá của *tài khoản này* (priceFor): 0 với admin, HERO_COST_NGOC với người
// thường. Số trừ đi vẫn tính lại từ điều kiện sở hữu bên dưới chứ không lấy thẳng
// `price`, nên một cú bấm vào hình đang mặc hoặc đã mở luôn trả spent 0.
async function pickHero(userId: string, hero: string, price: number): Promise<{ spent: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ ngoc: number; appearance: Record<string, unknown>; heroes: string[] | null }>(
      'SELECT ngoc, appearance, heroes FROM temple_profiles WHERE user_id = $1 FOR UPDATE',
      [userId],
    );
    const row = rows[0];
    if (!row) throw new Error(`no temple profile for ${userId}`);
    const owned = row.heroes ?? [];
    const wears = row.appearance?.hero === hero;
    // Đang đứng đúng hình đó rồi thì không có gì để mua, kể cả khi `heroes` còn rỗng:
    // lần bấm đó chính là lần chọn đầu, và lần chọn đầu là miễn phí.
    const isFirstPick = owned.length === 0;
    const free = wears || isFirstPick || owned.includes(hero) || price === 0;
    const cost = free ? 0 : price;
    if (!free && row.ngoc < cost) throw new ApiError(409, 'not_enough_ngoc', `not enough ngoc: a new form costs ${cost}`);
    // Chỉ id chưa có mới được ghi thêm vào bộ sưu tập; chọn lại món đã mở thì danh sách
    // giữ nguyên, và ngoc - 0 không phải một cú ghi vô nghĩa vì updated_at vẫn phải chạy.
    const records = !owned.includes(hero);

    await client.query(
      `UPDATE temple_profiles
          SET appearance = jsonb_set(appearance, '{hero}', to_jsonb($2::text)),
              heroes = CASE WHEN $4 THEN COALESCE(heroes, '{}'::text[]) || $2::text ELSE heroes END,
              ngoc = ngoc - $3,
              updated_at = now()
        WHERE user_id = $1`,
      [userId, hero, cost, records],
    );
    await client.query('COMMIT');
    return { spent: cost };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
