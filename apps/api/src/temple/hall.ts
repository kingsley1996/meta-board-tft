// Những gì cả chùa cùng nhìn thấy: đèn hoa đăng, vườn cây, bảng tri ân, vòng quay
// lộc, xỉ quẻ và tin chạy.
//
// Một nơi duy nhất: "multi-temple" đã bị cắt theo đề bài, nên temple không lấy từ
// máy khách nữa. Column temple vẫn nằm trong schema để dữ liệu cũ không vô nghĩa.
import { Router } from 'express';
import { pool } from '../db.ts';
import { ensureTempleProfile, levelFromExp } from './identity.ts';
import { ApiError, num, text, withUser } from './http.ts';
import { LANTERN_EXP, QUE_EXP, REJOICE_EXP, addMerit, consumeItem, grantItem, vnDay } from './merit.ts';
import { ensureTempleTables } from './schema.ts';
import { templeState } from './state.ts';

export const hallRouter = Router();

const TEMPLE_ID = 'nhattru';
// Lời nguyện của một ngọn đèn bay lên cả chánh điện, nên nó là nội dung do người
// khác duyệt, không phải chuỗi tự do đổ vào DOM.
const MAX_WISH = 120;
const CAP_PER_TEMPLE = 50;
const PICK_INTERVAL_MS = 24 * 3_600_000;

// Xỉ quẻ: bốn thẻ lấy nguyên văn từ hàng 'temple' của bản gốc (api.js:99-102), bỏ
// nhánh nhà thờ vì nội dung chùa chỉ còn tiếng Việt.
const QUE_CARDS = [
  { rank: 'Thượng Cát · Tâm An', name: 'Hoa Sen Nở Sớm', text: 'Trăng trong đáy nước lòng thanh tịnh, gió thoảng hương sen dạ nhẹ nhàng.', advice: 'Hôm nay thuận lợi khi giữ lời nói hòa ái, làm việc thiện nhỏ và giữ tâm bình thản.' },
  { rank: 'Đại Cát · Thuận Duyên', name: 'Mây Lành Hội Tụ', text: 'Gieo nhân lành ắt gặt quả ngọt, bước chân chánh niệm vạn sự hanh thông.', advice: 'Hãy mỉm cười với người xung quanh và dành vài phút tĩnh tâm lắng nghe hơi thở.' },
  { rank: 'Trung Cát · Tĩnh Định', name: 'Trúc Xanh Vững Chãi', text: 'Gió lay cành trúc không xao động, giữ vững sơ tâm vượt dặm dài.', advice: 'Việc gì chưa rõ hãy chậm lại một nhịp, thở sâu ba hơi trước khi quyết định.' },
  { rank: 'An Lành · Phước Báo', name: 'Suối Nguồn Từ Bi', text: 'Một niệm từ bi muôn oán giải, lòng biết ơn mở cửa phúc lành.', advice: 'Gửi lời hỏi thăm cha mẹ hoặc người thân để kết nối yêu thương hôm nay.' },
];

// Vòng quay lộc: sáu cung và trọng số đúng như api.js:701-709. Phần thưởng chỉ có
// Sen/Ngọc/đồ trong túi — economy-lite, không có tiền thật ở bất kỳ đâu.
type Segment = { label: string; pct: number; sen?: number; ngoc?: number; item?: string; count?: number; rare?: boolean };

const WHEEL_SEGMENTS: Segment[] = [
  { label: '30 Sen', pct: 30, sen: 30 },
  { label: '50 Sen', pct: 25, sen: 50 },
  { label: '20 Ngọc', pct: 15, ngoc: 20 },
  { label: '3 Nén Hương Trầm', pct: 15, item: 'huong_tram', count: 3 },
  { label: '2 Đèn Hoa Đăng', pct: 10, item: 'den_hoa_dang', count: 2 },
  { label: '100 Ngọc Quý', pct: 5, ngoc: 100, rare: true },
];

// ---- Đèn hoa đăng ------------------------------------------------------------

hallRouter.get('/lanterns', withUser(async (req, res, user) => {
  await ensureTempleTables();
  const { rows } = await pool.query<LanternRow>(
    `SELECT l.id, l.user_id, p.name, l.text, l.likes, l.status, l.created_at,
            EXISTS (SELECT 1 FROM temple_lantern_rejoices r WHERE r.lantern_id = l.id AND r.user_id = $1) AS rejoiced
       FROM temple_lanterns l
       JOIN temple_profiles p ON p.user_id = l.user_id
      WHERE (l.status = 'live' OR l.user_id = $1)
      ORDER BY l.created_at DESC
      LIMIT 60`,
    [user.id],
  );
  res.json({
    lanterns: rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      text: r.text,
      likes: r.likes,
      mine: r.user_id === user.id,
      yours: r.status,
      rejoiced: r.rejoiced,
      at: r.created_at.toISOString(),
    })),
  });
}));

// Thả đèn cần một chiếc đèn trong túi: đó là lý do hồ sơ mới được phát sẵn 8 đèn
// (identity.ts: seed lấy từ api.js:123-130) thay vì để ai cũng thả được vô hạn.
hallRouter.post('/lanterns', withUser(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const wish = req.body?.text === undefined || String(req.body.text).trim() === ''
    ? 'Nguyện cầu bình an cho muôn loài 🪷'
    : text(req.body.text, MAX_WISH, 'invalid_wish');

  const spent = await spendItem(user.id, 'den_hoa_dang');
  if (!spent) throw new ApiError(409, 'out_of_lanterns', 'no lantern left in the bag');

  const emailVerified = user.emailVerified;
  const { rows } = await pool.query<LanternRow>(
    `INSERT INTO temple_lanterns (user_id, temple, text, status)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [user.id, TEMPLE_ID, wish, emailVerified ? 'live' : 'pending'],
  );
  // 15 Sen cho một ngọn đèn là con số bản gốc treo thưởng (api.js:558); 8 trong số đó
  // đã nằm sẵn trong tỉ lệ công đức → Sen nên phần cộng thêm chỉ là chỗ còn lại.
  const merit = await addMerit(user.id, { exp: LANTERN_EXP, sen: 7 });
  res.json({
    state: await templeState(user.id),
    lantern: { id: Number(rows[0].id), text: rows[0].text, status: rows[0].status },
    gained: merit.gained,
    level_ups: merit.levelUps,
  });
}));

// "Hoan hỷ" với đèn của người khác: một lần mỗi người mỗi đèn, vì mỗi lượt cộng thêm
// Sen cho chủ đèn.
hallRouter.post('/lanterns/:id/rejoice', withUser(async (req, res, user) => {
  await ensureTempleTables();
  const id = num(req.params.id, 1, Number.MAX_SAFE_INTEGER, 'invalid_lantern_id');
  const inserted = await pool.query(
    'INSERT INTO temple_lantern_rejoices (lantern_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING lantern_id',
    [id, user.id],
  );
  if (!inserted.rowCount) throw new ApiError(409, 'already_rejoiced', 'this lantern was already rejoiced');
  const owner = await pool.query<{ user_id: string }>('SELECT user_id FROM temple_lanterns WHERE id = $1', [id]);
  const ownerId = owner.rows[0]?.user_id;
  if (!ownerId) throw new ApiError(404, 'lantern_not_found', 'no such lantern');
  if (ownerId !== user.id) await pool.query('UPDATE temple_profiles SET sen = sen + 2 WHERE user_id = $1', [ownerId]);
  const likes = await pool.query<{ likes: number }>('UPDATE temple_lanterns SET likes = likes + 1 WHERE id = $1 RETURNING likes', [id]);
  const merit = await addMerit(user.id, { exp: REJOICE_EXP });
  res.json({ state: await templeState(user.id), likes: likes.rows[0]?.likes ?? 0, gained: merit.gained, level_ups: merit.levelUps });
}));

// ---- Vườn cây ----------------------------------------------------------------

hallRouter.get('/plants', withUser(async (req, res, user) => {
  await ensureTempleTables();
  res.json({ plants: await readPlants(user.id), cap: CAP_PER_TEMPLE });
}));

hallRouter.get('/garden', withUser(async (req, res) => {
  await ensureTempleTables();
  const { rows } = await pool.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM temple_plants WHERE temple = $1', [TEMPLE_ID]);
  res.json({ trees: Number(rows[0]?.n ?? 0) });
}));

// Chỉ ba id này là cây trồng được: chores.js:116 (PLANT_KIND) dựng mô hình 3D theo
// đúng ba loại đó, nên một id khác dù có trong túi cũng chỉ là một cái hố trống.
const SEEDS: Record<string, true> = { cay_bode: true, cay_sen: true, cay_sala: true };

hallRouter.post('/plants', withUser(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const item = String(req.body?.item ?? '');
  if (!SEEDS[item]) throw new ApiError(400, 'not_a_seed', 'the temple only plants cay_bode, cay_sen and cay_sala');
  const existing = await readPlants(user.id);
  if (existing.length >= CAP_PER_TEMPLE) throw new ApiError(409, 'garden_full', 'the garden is full');
  const spent = await spendItem(user.id, item);
  if (!spent) throw new ApiError(409, 'out_of_seeds', 'no seeds left in the bag');

  const x = coord(req.body?.x, -40, 40);
  const z = coord(req.body?.z, -10, 40);
  // Cây trồng hôm nay hái được ngay, đúng như bản gốc (api.js:852 đặt ripe: 1); một
  // ngày ngủ chỉ tính từ lần hái kế tiếp.
  await pool.query(
    'INSERT INTO temple_plants (user_id, temple, item, x, z, per_pick, next_pick_at) VALUES ($1, $2, $3, $4, $5, 3, now())',
    [user.id, TEMPLE_ID, item, x, z],
  );
  // Trồng cây tính như một công việc trong vườn: 25 công đức, đúng mốc api.js:514.
  const merit = await addMerit(user.id, { exp: 25 });
  res.json({ state: await templeState(user.id), gained: merit.gained, level_ups: merit.levelUps });
}));

// Hái quả: ai cũng hái được, vì vườn là của chung cả chùa; cây vừa được hái thì sleeps
// một ngày để người khác còn tới phiên.
hallRouter.post('/plants/harvest', withUser(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const id = num(req.body?.id, 1, Number.MAX_SAFE_INTEGER, 'invalid_plant_id');
  const { rows } = await pool.query<{ per_pick: number; ripe: boolean; next_pick_at: Date | null }>(
    'SELECT per_pick, ripe, next_pick_at FROM temple_plants WHERE id = $1',
    [id],
  );
  const plant = rows[0];
  if (!plant) throw new ApiError(404, 'plant_not_found', 'no such plant');
  if (!plant.ripe || (plant.next_pick_at && plant.next_pick_at > new Date())) {
    throw new ApiError(409, 'not_ripe', 'this tree is still growing');
  }
  await pool.query(
    "UPDATE temple_plants SET ripe = false, fruits = fruits + 1, next_pick_at = now() + ($2::int * INTERVAL '1 millisecond') WHERE id = $1",
    [id, PICK_INTERVAL_MS],
  );
  const { rows: updated } = await pool.query<{ fruit: number }>(
    'UPDATE temple_profiles SET fruit = fruit + $2, updated_at = now() WHERE user_id = $1 RETURNING fruit',
    [user.id, plant.per_pick],
  );
  res.json({ state: await templeState(user.id), got: plant.per_pick, fruit: updated[0]?.fruit ?? 0 });
}));

// Đổi quả lấy Ngọc — cầu nối duy nhất giữa vườn và ví, tỉ lệ 1:1 như bản gốc
// (api.js:871-877). Phải đọc số quả *trước* khi xoá: RETURNING của Postgres trả hàng
// mới, mà hàng mới thì fruit đã bằng 0 rồi.
hallRouter.post('/plants/exchange', withUser(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const client = await pool.connect();
  let converted = 0;
  try {
    await client.query('BEGIN');
    const had = await client.query<{ fruit: number }>('SELECT fruit FROM temple_profiles WHERE user_id = $1 FOR UPDATE', [user.id]);
    converted = had.rows[0]?.fruit ?? 0;
    if (converted > 0) {
      await client.query('UPDATE temple_profiles SET fruit = 0, ngoc = ngoc + $2, updated_at = now() WHERE user_id = $1', [user.id, converted]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  if (!converted) throw new ApiError(409, 'no_fruit', 'nothing to exchange yet');
  res.json({ state: await templeState(user.id), ngoc: converted });
}));

// ---- Bảng tri ân --------------------------------------------------------------

hallRouter.get('/stele', withUser(async (req, res) => {
  await ensureTempleTables();
  // temple.js:439 (drawStele) khắc đúng ba chữ name/title/score lên bia, nên đây trả
  // về title chứ không phải honor như mấy bảng khác.
  const { rows } = await pool.query<{ name: string; title: string; exp: number; score: number }>(
    `SELECT p.name, p.title, p.exp, SUM(d.amount)::int AS score
       FROM temple_donations d
       JOIN temple_profiles p ON p.user_id = d.user_id
      GROUP BY p.name, p.title, p.exp
      ORDER BY score DESC
      LIMIT 12`,
  );
  res.json({ rows: rows.map((r) => ({ name: r.name, title: r.title || levelFromExp(r.exp).title, score: r.score })) });
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

// Tùy hỷ bằng Sen — tiền nội bộ kiếm từ tu tập. Không có cổng thanh toán ở bất kỳ
// đâu trong module chùa (quyết định economy-lite), nên tuyến này không thể "nạp".
hallRouter.post('/donations', withUser(async (req, res, user) => {
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
  // Một hàng cho mỗi người mỗi ngày làPK của temple_draws, nên quay hai lần thì lần
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

// Bảng tin động: hàng nào chùa treo lên hàng đó chạy. Khi chưa treo gì thì HUD giữ
// ticker trong meta.json, nên tuyến này trả mảng rỗng chứ không bịa tin.
hallRouter.get('/announcements', withUser(async (req, res) => {
  await ensureTempleTables();
  const { rows } = await pool.query<{ id: string; text: string; effect: string }>(
    'SELECT id, text, effect FROM temple_announcements ORDER BY created_at DESC LIMIT 12',
  );
  res.json({ rows: rows.map((r) => ({ id: Number(r.id), text: r.text, effect: r.effect })) });
}));

// ---- helpers ------------------------------------------------------------------

type LanternRow = { id: string; user_id: string; name: string; text: string; likes: number; status: string; created_at: Date; rejoiced?: boolean };

type PlantRow = { id: string; user_id: string; item: string; x: string; z: string; fruits: number; per_pick: number; ripe: boolean; next_pick_at: Date | null; name: string };

async function readPlants(userId: string) {
  const { rows } = await pool.query<PlantRow>(
    `SELECT l.id, l.user_id, l.item, l.x, l.z, l.fruits, l.per_pick, l.ripe, l.next_pick_at, p.name
       FROM temple_plants l
       JOIN temple_profiles p ON p.user_id = l.user_id
      WHERE l.temple = $1
      ORDER BY l.created_at DESC
      LIMIT $2`,
    [TEMPLE_ID, CAP_PER_TEMPLE],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    item: r.item,
    owner: r.name,
    mine: r.user_id === userId,
    x: Number(r.x),
    z: Number(r.z),
    fruits: r.fruits,
    per_pick: r.per_pick,
    ripe: r.ripe,
    next_at: r.next_pick_at ? r.next_pick_at.toISOString() : null,
  }));
}

async function readDraw(userId: string, kind: 'wheel' | 'que'): Promise<{ result: Record<string, unknown>; day: string } | null> {
  const { rows } = await pool.query<{ result: Record<string, unknown>; day: Date | string }>(
    'SELECT result, day FROM temple_draws WHERE user_id = $1 AND kind = $2 AND day = $3',
    [userId, kind, vnDay()],
  );
  if (!rows.length) return null;
  return { result: rows[0].result, day: vnDay() };
}

// Đành cây đèn/hạt giống phải trừ khỏi túi trước khi chùa nhận lời nguyện, và trừ
// bằng SQL nguyên tử (consumeItem) để hai cú chạm liền không cùng trừ từ 15 xuống 14.
async function spendItem(userId: string, item: string): Promise<boolean> {
  await ensureTempleProfile(userId);
  return (await consumeItem(userId, item)) !== null;
}

function coord(value: unknown, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new ApiError(400, 'invalid_spot', `spot must be between ${min} and ${max}`);
  return Math.round(n * 100) / 100;
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
