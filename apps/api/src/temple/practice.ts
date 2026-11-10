// Nhịp cầu may: 3 lần cầu một gói, rồi một nhịp ngồi — và bảng
// xếp hạng cộng từ những nhịp đó.
//
// Máy khách gửi "tôi vừa làm gì, bao nhiêu lần"; số Điểm May Mắn, bậc, Tinh Hoa đều tính ở
// đây. Bảng quy đổi giữ nguyên như bản gốc (api.js:449-526) để cảm giác một phiên không
// đổi, chỉ đổi chỗ nó được quyết định.
import { Router } from 'express';
import { pool } from '../db.ts';
import { ensureTempleProfile, levelFromExp } from './identity.ts';
import { ApiError, cooldown, num, withUser } from './http.ts';
import {
  MAX_BOWS_DAY,
  MAX_COUNT,
  MAX_MEDITATE_MIN,
  MAX_MEDITATE_MIN_DAY,
  MERIT_PER,
  addMerit,
  consumeItem,
  touchStreak,
  vnDay,
  type PracticeDelta,
} from './merit.ts';
import { templeState } from './state.ts';
import { ensureTempleTables } from './schema.ts';

export const practiceRouter = Router();

// Đồ dâng bùa: ba con số dưới đây là nguồn duy nhất — mô tả trong meta.json chỉ còn
// là chữ, không chứa điểm nữa. nen_sap/hoa_dang chỉ có điểm, riêng bùa (huong_tram)
// mở buff 20% trong 10 phút.
const OFFERINGS: Record<string, { exp: number; buffMs?: number }> = {
  huong_tram: { exp: 10, buffMs: 10 * 60_000 },
  nen_sap: { exp: 5 },
  hoa_dang: { exp: 8 },
};

// Máy khách tự gom nhịp: 4 lần cầu một lần gửi (temple-app.tsx, tối đa 5 lần một gói).
// Mốc dưới đây thấp hơn nhịp thật của người chơi nên không ăn gian điểm của ai, nhưng
// một vòng lặp POST thì dính.
const COOLDOWN_MS: Record<string, number> = { bow: 3_000 };

practiceRouter.post('/practice', withUser(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const type = String(req.body?.type ?? '');
  const count = num(req.body?.count ?? 1, 1, MAX_COUNT, 'invalid_count');
  // Nhịp chặn sau phần kiểm tra gói tin: một request sai quy cách bị 400 thì chưa
  // "làm" gì, nên không được chiếm chỗ của nhịp kế tiếp.
  const gap = Object.hasOwn(COOLDOWN_MS, type) ? COOLDOWN_MS[type] : undefined;
  if (gap !== undefined) cooldown(`${user.id}:${type}`, gap);
  const extra: Record<string, number> = {};
  const practice: PracticeDelta = {};
  let exp = 0;

  if (type === 'visit') {
    // Một sảnh duy nhất nên không còn "dấu chân hành hương" của bản gốc; mốc này chỉ
    // trả công cho lần đặt chân đầu tiên trong ngày, và temple_practice.visits là
    // bằng chứng máy chủ tự giữ thay vì tin máy khách.
    const today = await practiceRow(user.id);
    if (today.visits > 0) {
      res.json({ state: await templeState(user.id), gained: 0, extra: { already: true }, level_ups: [] });
      return;
    }
    exp = MERIT_PER.visit_first;
    practice.visits = 1;
  } else if (type === 'bow') {
    // Trần ngày của số lần lạy (SHRINE-LADDER.md §2). cooldown 3s và MAX_COUNT chỉ
    // chặn từng gói, nên người ngồi bấm liên tục vẫn tích được ~30.000 điểm mỗi giờ;
    // quá trần thì vẫn lạy được, chỉ là không cộng thêm điểm.
    const today = await practiceRow(user.id);
    const credited = Math.min(count, Math.max(0, MAX_BOWS_DAY - today.bows));
    if (!credited) {
      res.json({
        state: await templeState(user.id),
        gained: 0,
        extra: { capped: true, bows: today.bows, max_bows: MAX_BOWS_DAY },
        level_ups: [],
      });
      return;
    }
    exp = credited * MERIT_PER.bow;
    practice.bows = credited;
  } else if (type === 'meditate_start') {
    const started = await startMeditation(user.id);
    res.json({ state: await templeState(user.id), meditate_start: started });
    return;
  } else if (type === 'meditate_end') {
    const minutes = await endMeditation(user.id);
    exp = minutes * MERIT_PER.meditate_min;
    practice.meditateMin = minutes;
    extra.minutes = minutes;
  } else {
    throw new ApiError(400, 'unknown_practice_type', `the temple does not track "${type}"`);
  }

  const result = await addMerit(user.id, { exp, practice });
  const streak = await touchStreak(user.id);
  res.json({ state: await templeState(user.id), gained: result.gained, extra, level_ups: result.levelUps, streak });
}));

// Dâng bùa / nến / đóa sao: trừ một món khỏi túi rồi mới cộng điểm, để
// không ai bấm cùng một lá bùa hai lần mà vẫn được tính.
practiceRouter.post('/use', withUser(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const item = String(req.body?.item ?? '');
  const offering = OFFERINGS[item];
  if (!offering) throw new ApiError(400, 'unknown_offering', `"${item}" is not something the temple takes"`);

  // consumeItem trừ đồ và kiểm tra còn hàng trong cùng một câu UPDATE: SELECT ... FOR UPDATE
  // đứng một mình thì Postgres nhả khoá ngay khi câu query xong, không chặn được hai cú chạm.
  const spent = await consumeItem(user.id, item);
  if (!spent) throw new ApiError(409, 'out_of_item', `no ${item} left in the bag`);
  if (offering.buffMs) {
    await pool.query("UPDATE temple_profiles SET buff_until = now() + ($2::int * INTERVAL '1 millisecond') WHERE user_id = $1", [
      user.id,
      offering.buffMs,
    ]);
  }
  const result = await addMerit(user.id, { exp: offering.exp });
  res.json({ state: await templeState(user.id), left: spent[item] ?? 0, gained: result.gained, level_ups: result.levelUps });
}));

// BXH. Cộng từ temple_practice theo cửa sổ ngày, không lấy exp tích luỹ: người chơi
// từ tháng trước mà nghỉ thì không nên đứng trên người vừa cầu may hôm nay.
// now() chứ không phải CURRENT_DATE: CURRENT_DATE đã là một `date` nên cộng thêm 7
// tiếng rồi cast ::date vẫn trả đúng ngày UTC cũ, tức là cửa sổ đi sau giờ Hà Nội
// bảy tiếng trong khi bumpPractice() ghi ngày Hà Nội — người cầu may lúc 6h sáng thấy
// điểm của mình biến mất khỏi "Hôm nay".
const SCOPES: Record<string, string> = {
  day: `p.day = (now() + INTERVAL '7 hours')::date`,
  week: `p.day >= (now() + INTERVAL '7 hours')::date - 6`,
  all: 'TRUE',
};

practiceRouter.get('/leaderboard', withUser(async (req, res, user) => {
  await ensureTempleTables();
  const asked = String(req.query?.scope ?? '');
  // Object.hasOwn thay vì tra bảng trực tiếp: '?scope=__proto__' thì bảng thường
  // trả về một object, và object đó ghép vào WHERE là một cú 500.
  const scope = (Object.hasOwn(SCOPES, asked) ? SCOPES[asked] : undefined) ?? SCOPES.week;
  const scopeName = Object.hasOwn(SCOPES, asked) ? asked : 'week';
  const { rows } = await pool.query<{
    user_id: string;
    player_id: string;
    name: string;
    sect: string;
    title: string;
    honor: string;
    exp: number;
    score: number;
  }>(
    `SELECT pr.user_id, pr.player_id, pr.name, pr.sect, pr.title, pr.honor, pr.exp, SUM(p.exp)::int AS score
       FROM temple_practice p
       JOIN temple_profiles pr ON pr.user_id = p.user_id
      WHERE ${scope}
      GROUP BY pr.user_id, pr.player_id, pr.name, pr.sect, pr.title, pr.honor, pr.exp
      ORDER BY score DESC, pr.name ASC
      LIMIT 100`,
  );
  const meRow = rows.find((r) => r.user_id === user.id) ?? null;
  const mine = meRow
    ? { rank: rows.indexOf(meRow) + 1, score: meRow.score }
    : await rankAlone(user.id, scope);
  res.json({
    scope: scopeName,
    rows: rows.map((r, i) => ({
      rank: i + 1,
      id: Number(r.player_id),
      name: r.name,
      sect: r.sect,
      // Danh hiệu phải dẫn xuất từ exp tích luỹ, giống /state: hai chỗ gọi một người
      // bằng hai chữ khác nhau thì HUD tự mâu thuẫn ngay trên màn hình.
      title: levelFromExp(r.exp).title,
      honor: r.honor,
      score: r.score,
      you: r.user_id === user.id,
    })),
    // Bảng theo pháp môn chỉ là cùng một phép cộng, nhóm theo sect.
    sects: await sectScores(scope),
    me: mine,
  });
}));

// Sổ điểm: 28 ngày gần nhất, để HUD vẽ biểu đồ "ngày nào kiếm bao nhiêu điểm".
practiceRouter.get('/merit', withUser(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  res.json({ state: await templeState(user.id, { journal: true }) });
}));

async function practiceRow(userId: string): Promise<{ visits: number; meditate_min: number; bows: number }> {
  const { rows } = await pool.query<{ visits: number; meditate_min: number; bows: number }>(
    'SELECT visits, meditate_min, bows FROM temple_practice WHERE user_id = $1 AND day = $2',
    [userId, vnDay()],
  );
  return rows[0] ?? { visits: 0, meditate_min: 0, bows: 0 };
}

// Đồng hồ thiền là đồng hồ server. Máy khách chỉ báo "bắt đầu" và "xong";
// nếu nó được gửi số phút thì một gói tin là mua được cả ngày đứng nhất BXH.
//
// Mỗi nhịp là một câu UPDATE chiếm chỗ: hai request cùng đọc rồi cùng ghi thì mỗi cú
// kết thúc đều được cộng điểm.
async function startMeditation(userId: string): Promise<string> {
  const { rows } = await pool.query<{ meditate_start: Date }>(
    'UPDATE temple_profiles SET meditate_start = now() WHERE user_id = $1 AND meditate_start IS NULL RETURNING meditate_start',
    [userId],
  );
  const start = rows[0]?.meditate_start;
  if (!start) throw new ApiError(409, 'already_meditating', 'a sit is already running');
  return start.toISOString();
}

async function endMeditation(userId: string): Promise<number> {
  // RETURNING của UPDATE trả giá trị *sau khi ghi*, nên "SET ... = NULL RETURNING
  // meditate_start" luôn trả NULL. Giờ ngồi phải lấy từ hàng con, và điều kiện khớp giờ
  // cũ biến cú ghi thành nhịp chiếm chỗ: ai đến sau không update được hàng nào.
  const { rows } = await pool.query<{ started: Date }>(
    `UPDATE temple_profiles p
        SET meditate_start = NULL
       FROM (SELECT meditate_start AS started FROM temple_profiles WHERE user_id = $1 AND meditate_start IS NOT NULL) x
      WHERE p.user_id = $1 AND p.meditate_start = x.started
      RETURNING x.started AS started`,
    [userId],
  );
  const start = rows[0]?.started;
  if (!start) throw new ApiError(400, 'not_meditating', 'no sit is running');
  const raw = Math.round((Date.now() - start.getTime()) / 60_000);
  const today = await practiceRow(userId);
  const room = Math.max(0, MAX_MEDITATE_MIN_DAY - today.meditate_min);
  // Ngồi 30 giây vẫn được tính một phút (api.js:506 dùng Math.max(1, ...)), nhưng
  // không quá một tiếng cho một nhịp và không quá 4 tiếng một ngày.
  return Math.min(Math.max(1, raw), MAX_MEDITATE_MIN, room);
}

async function sectScores(scope: string): Promise<{ sect: string; score: number }[]> {
  const { rows } = await pool.query<{ sect: string; score: number }>(
    `SELECT pr.sect, SUM(p.exp)::int AS score
       FROM temple_practice p
       JOIN temple_profiles pr ON pr.user_id = p.user_id
      WHERE ${scope}
      GROUP BY pr.sect
      ORDER BY score DESC`,
  );
  return rows;
}

// Người chưa có mặt trong 100 hàng đầu vẫn phải thấy mình đứng đâu. Điểm của hàng
// này phải tính bằng đúng cửa sổ đang hỏi, nếu không thì BXH ngày sẽ báo một số của
// BXH cả đời.
async function rankAlone(userId: string, scope: string): Promise<{ rank: number | null; score: number }> {
  const { rows } = await pool.query<{ score: number }>(
    `SELECT COALESCE(SUM(p.exp), 0)::int AS score
       FROM temple_practice p
      WHERE p.user_id = $1 AND ${scope}`,
    [userId],
  );
  const score = rows[0]?.score ?? 0;
  if (!score) return { rank: null, score: 0 };
  const ahead = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM (
       SELECT p.user_id, SUM(p.exp) AS score FROM temple_practice p WHERE ${scope} GROUP BY p.user_id
     ) t WHERE t.score > $1`,
    [score],
  );
  return { rank: Number(ahead.rows[0]?.n ?? 0) + 1, score };
}
