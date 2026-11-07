// Hai tuyến admin, chỉ tác động lên chính tài khoản đang đăng nhập: đặt bậc và cấp
// toàn bộ trang bị.
//
// Vì sao phải nằm ở server thay vì để HUD tự viết hồ sơ: `level` không phải một cột,
// nó suy ra từ exp (identity.ts:levelFromExp), và mọi cổng giá trong shop.ts đọc đúng
// cái exp đó (shop.ts:125). Máy khách mà tự khai được bậc thì cũng tự mở được cửa mua
// hàng Quý. Ở đây admin chỉ đổi được exp của mình, theo đúng thang 19 mốc mà người
// chơi thật phải leo — không có con số nào mới.
import { Router } from 'express';
import { pool } from '../db.ts';
import { WEARABLE_POOL } from './catalog.ts';
import { LADDER_SIZE, ensureTempleProfile, expForLevel } from './identity.ts';
import { num, withAdmin } from './http.ts';
import { ensureTempleTables } from './schema.ts';
import { templeState } from './state.ts';

export const adminRouter = Router();

// Đặt bậc: ghi exp về đúng mốc của bậc đó. Trả về toàn bộ state vì HUD vẽ cả thanh
// tiến độ, danh hiệu và cả cửa "unlock_level" của cửa hàng từ số này.
adminRouter.post('/admin/level', withAdmin(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const level = num(req.body?.level, 1, LADDER_SIZE, 'invalid_level');
  await pool.query('UPDATE temple_profiles SET exp = $2, updated_at = now() WHERE user_id = $1', [user.id, expForLevel(level)]);
  res.json({ state: await templeState(user.id), level });
}));

// Cấp một lần mọi món mặc/đeo được, kể cả Hiếm và Quý — thứ mà người chơi thật phải
// mua qua hai cửa. Đồ dâng (consumable) không nằm ở đây vì nó là vật tư dùng hết thì
// mua lại, không phải bộ sưu tập.
//
// `inventory || $2` là phép hợp nhất jsonb: món đã có thì vẫn một chiếc (không nhân
// bản áo), món chưa có thì thêm vào với số 1.
adminRouter.post('/admin/gear', withAdmin(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const grant = JSON.stringify(Object.fromEntries(WEARABLE_POOL.map((i) => [i.id, 1])));
  const { rows } = await pool.query<{ inventory: Record<string, number> }>(
    `UPDATE temple_profiles
        SET inventory = COALESCE(inventory, '{}'::jsonb) || $2::jsonb, updated_at = now()
      WHERE user_id = $1
      RETURNING inventory`,
    [user.id, grant],
  );
  res.json({ state: await templeState(user.id), items: Object.keys(rows[0]?.inventory ?? {}).length });
}));
