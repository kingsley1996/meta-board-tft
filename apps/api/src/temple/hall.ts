// Những gì cả sảnh cùng nhìn thấy: bảng tri ân, vòng quay Hex, quẻ và tin chạy.
//
// Một nơi duy nhất: "multi-temple" đã bị cắt theo đề bài, nên temple không lấy từ
// máy khách nữa. Column temple vẫn nằm trong schema để dữ liệu cũ không vô nghĩa.
import { Router } from 'express';
import { pool } from '../db.ts';
import { ensureTempleProfile, levelFromExp } from './identity.ts';
import { ApiError, num, text, withAccount, withUser } from './http.ts';
import { QUE_EXP, addMerit, grantItem, vnDay } from './merit.ts';
import { ensureTempleTables } from './schema.ts';
import { templeState } from './state.ts';

export const hallRouter = Router();

// Đền duy nhất đang mở, và là mã phòng mặc định mà ws.ts:93 gắn cho một kết nối không
// hỏi temple. Bot đền (bots.ts) phải đứng đúng vào key này thì người thật mới thấy.
export const TEMPLE_ID = 'nhattru';

// Quẻ hiện tại: bốn thẻ tĩnh, dùng lại đúng khuôn `que` của bản gốc (api.js:99-102).
// Phase 2 thay bằng comp thật lấy từ DB — xem SHRINE-PLAN.md §6.2.
const QUE_CARDS = [
  {
    rank: 'Thượng Cát · Khai Vận',
    name: 'Nhân Phẩm Đỉnh Cao',
    text: 'Mở màn quá đẹp! Tướng ra đúng ý, đồ rơi đúng bài, khởi đầu không thể thuận lợi hơn.',
    advice: 'Đang có lợi thế thì cứ giữ chuỗi thắng. Lên cấp đúng nhịp, đừng roll quá tay khi chưa cần thiết.'
  },
  {
    rank: 'Đại Cát · Vượng Vận',
    name: 'Vào Form Thần Tốc',
    text: 'Cờ thủ đang vào form! Đội hình dần hoàn thiện, thắng liên tiếp và máu vẫn còn rất đẹp.',
    advice: 'Đừng ham roll sớm. Giữ vàng, lên cấp 8 và tìm những quân cờ chủ lực để chốt bài.'
  },
  {
    rank: 'Trung Cát · Tranh Bài',
    name: 'Đụng Hàng Không Lối Thoát',
    text: 'Có vẻ nhiều nhà đang nhắm cùng một đội hình. Muốn chơi bài này thì phải xem nhân phẩm đến đâu!',
    advice: 'Soi bài đối thủ thường xuyên. Nếu bị tranh quá nhiều, mạnh dạn xoay bài thay vì cố chấp roll đến cạn tiền.'
  },
  {
    rank: 'An Lành · Bình Vận',
    name: 'Tích Tiền Chờ Thời',
    text: 'Vận may hôm nay khá bình thường. Chưa có gì nổi bật nhưng vẫn còn cơ hội lật kèo.',
    advice: 'Đừng hoảng khi thua vài round đầu. Giữ kinh tế, giữ máu và chỉ roll khi đã đến đúng ngưỡng sức mạnh.'
  },
];

// Vòng quay Hex: sáu cung và trọng số đúng như api.js:701-709. Phần thưởng chỉ có
// Tinh Hoa/Kim Cương/đồ trong túi — economy-lite, không có tiền thật ở bất kỳ đâu.
type Segment = { label: string; pct: number; sen?: number; ngoc?: number; item?: string; count?: number; rare?: boolean };

const WHEEL_SEGMENTS: Segment[] = [
  { label: '30 Tinh Hoa', pct: 30, sen: 30 },
  { label: '50 Tinh Hoa', pct: 25, sen: 50 },
  { label: '20 Kim Cương', pct: 15, ngoc: 20 },
  { label: '3 Bùa May', pct: 15, item: 'huong_tram', count: 3 },
  { label: '5 Đóa Sao', pct: 10, item: 'hoa_dang', count: 5 },
  { label: '100 Kim Cương Quý', pct: 5, ngoc: 100, rare: true },
];

// ---- Bảng tri ân --------------------------------------------------------------

hallRouter.get('/stele', withUser(async (req, res) => {
  await ensureTempleTables();
  // Mỗi người một dòng, điểm là tổng Tinh Hoa đã đóng góp. Gom theo user_id chứ không theo
  // tên: trên dev có 9 tài khoản khác cùng mang một tên hiển thị, gom theo tên sẽ đúc họ
  // thành một dòng có điểm cộng dồn của cả chín. Danh hiệu tính từ exp chứ không đọc cột
  // title — cột đó do máy khách gửi lên và có thể lệch với thang cấp hiện tại.
  const { rows } = await pool.query<{ name: string; exp: number; score: number }>(
    `SELECT p.name, p.exp, SUM(d.amount)::int AS score
       FROM temple_donations d
       JOIN temple_profiles p ON p.user_id = d.user_id
      GROUP BY p.user_id, p.name, p.exp
      ORDER BY score DESC
      LIMIT 12`,
  );
  res.json({ rows: rows.map((r) => ({ name: r.name, title: levelFromExp(r.exp).title, score: r.score })) });
}));

hallRouter.get('/donations', withUser(async (req, res) => {
  await ensureTempleTables();
  const { rows } = await pool.query<{ name: string; note: string; amount: number; created_at: Date }>(
    `SELECT p.name, d.note, d.amount, d.created_at
       FROM temple_donations d
       JOIN temple_profiles p ON p.user_id = d.user_id
      ORDER BY d.created_at DESC
      LIMIT 30`,
  );
  res.json({ rows: rows.map((r) => ({ name: r.name, note: r.note, amount: r.amount, at: r.created_at.toISOString() })) });
}));

// Gửi Tinh Hoa — tiền nội bộ kiếm từ hành trì. Không có cổng thanh toán ở bất kỳ
// đâu trong module đền (quyết định economy-lite), nên tuyến này không thể "nạp".
// Khách bị chặn: hàng temple_donations nhân danh một email giả thì Bảng Tri Ân sẽ khắc tên
// một người không tồn tại.
hallRouter.post('/donations', withAccount(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const amount = num(req.body?.amount, 10, 100_000, 'invalid_amount');
  const note = req.body?.note ? text(req.body.note, 120, 'invalid_note') : '';
  const spent = await pool.query(
    'UPDATE temple_profiles SET sen = sen - $2, updated_at = now() WHERE user_id = $1 AND sen >= $2 RETURNING sen',
    [user.id, amount],
  );
  if (!spent.rowCount) throw new ApiError(409, 'not_enough_sen', 'not enough Sen in the wallet');
  await pool.query('INSERT INTO temple_donations (user_id, temple, amount, note) VALUES ($1, $2, $3, $4)', [
    user.id,
    TEMPLE_ID,
    amount,
    note,
  ]);
  const merit = await addMerit(user.id, { exp: Math.ceil(amount / 10) });
  res.json({ state: await templeState(user.id), gained: merit.gained, level_ups: merit.levelUps });
}));

// ---- Lộc: vòng quay và xỉ quẻ -------------------------------------------------

hallRouter.get('/draws/wheel', withUser(async (req, res, user) => {
  await ensureTempleTables();
  const today = await readDraw(user.id, 'wheel');
  res.json({ segs: WHEEL_SEGMENTS, can: !today, result: today?.result ?? null });
}));

hallRouter.post('/draws/wheel', withUser(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const day = vnDay();
  const idx = pickWeighted(WHEEL_SEGMENTS.map((s) => s.pct));
  const seg = WHEEL_SEGMENTS[idx];
  const result = { idx, ...seg };
  const won = await pool.query(
    `INSERT INTO temple_draws (user_id, kind, day, result)
     VALUES ($1, 'wheel', $2, $3)
     ON CONFLICT (user_id, kind, day) DO NOTHING RETURNING user_id`,
    [user.id, day, result],
  );
  // Một hàng cho mỗi người mỗi ngày là khoá chính của temple_draws, nên quay hai lần thì lần
  // thứ hai trả về đúng kết quả đã nhận thay vì quay lại lần nữa.
  if (!won.rowCount) {
    const earlier = await readDraw(user.id, 'wheel');
    res.json({ state: await templeState(user.id), result: earlier?.result ?? result, again: true });
    return;
  }
  if (seg.sen) await pool.query('UPDATE temple_profiles SET sen = sen + $2 WHERE user_id = $1', [user.id, seg.sen]);
  if (seg.ngoc) await pool.query('UPDATE temple_profiles SET ngoc = ngoc + $2 WHERE user_id = $1', [user.id, seg.ngoc]);
  if (seg.item) await grantItem(user.id, seg.item, seg.count ?? 1);
  res.json({ state: await templeState(user.id), result, again: false });
}));

hallRouter.get('/draws/que', withUser(async (req, res, user) => {
  await ensureTempleTables();
  const today = await readDraw(user.id, 'que');
  res.json({ que: today?.result ?? null });
}));

hallRouter.post('/draws/que', withUser(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const day = vnDay();
  const card = QUE_CARDS[Math.floor(Math.random() * QUE_CARDS.length)];
  const drawn = await pool.query(
    `INSERT INTO temple_draws (user_id, kind, day, result)
     VALUES ($1, 'que', $2, $3)
     ON CONFLICT (user_id, kind, day) DO NOTHING RETURNING user_id`,
    [user.id, day, card],
  );
  if (!drawn.rowCount) {
    const earlier = await readDraw(user.id, 'que');
    res.json({ state: await templeState(user.id), que: earlier?.result ?? card, already: true, gained: 0, level_ups: [] });
    return;
  }
  const merit = await addMerit(user.id, { exp: QUE_EXP, sen: 18 });
  res.json({ state: await templeState(user.id), que: card, already: false, gained: merit.gained, level_ups: merit.levelUps });
}));

// ---- Tin chạy -----------------------------------------------------------------

// Bảng tin động: hàng nào treo lên hàng đó chạy. Chưa treo gì thì mảng rỗng, và HUD
// ẩn hẳn dải chữ chạy (temple-app.tsx:684) thay vì tự bịa một tin.
hallRouter.get('/announcements', withUser(async (req, res) => {
  await ensureTempleTables();
  const { rows } = await pool.query<{ id: string; text: string; effect: string }>(
    'SELECT id, text, effect FROM temple_announcements ORDER BY created_at DESC LIMIT 12',
  );
  res.json({ rows: rows.map((r) => ({ id: Number(r.id), text: r.text, effect: r.effect })) });
}));

// ---- helpers ------------------------------------------------------------------

async function readDraw(userId: string, kind: 'wheel' | 'que'): Promise<{ result: Record<string, unknown>; day: string } | null> {
  const { rows } = await pool.query<{ result: Record<string, unknown>; day: Date | string }>(
    'SELECT result, day FROM temple_draws WHERE user_id = $1 AND kind = $2 AND day = $3',
    [userId, kind, vnDay()],
  );
  if (!rows.length) return null;
  return { result: rows[0].result, day: vnDay() };
}

function pickWeighted(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i];
    if (roll < 0) return i;
  }
  return weights.length - 1;
}
