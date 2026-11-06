// Sổ điểm: mọi con số mà người chơi nhìn thấy trong HUD đều được cộng ở đây,
// không phải chỗ máy khách gửi lên.
//
// Lý do máy chủ phải giữ phần này: máy khách chỉ còn gửi "tôi vừa cầu may ba lần", còn
// ba lần ấy thành bao nhiêu Điểm May Mắn, lên bậc nào, được thưởng bao nhiêu Tinh Hoa
// là quyết định của server. Đổi công thức trong file này thì cả sảnh đổi theo, không
// phải chờ bản phát hành của trang.
//
// Bảng quy đổi lấy đúng như bản gốc đã tính (api.js:449-526). Sen luôn đi kèm công
// đức với tỉ lệ 0.4 (api.js:523) và lên bậc thưởng thêm level × 50 Sen
// (api.js:267-271) — economy-lite nên hai loại tiền này chỉ ra từ đây, không có
// đường mua bằng tiền thật.
import { pool } from '../db.ts';
import { levelFromExp, type TempleProfile, templeProfile } from './identity.ts';

// Sảnh ở Việt Nam nên "một ngày" là ngày theo giờ Hà Nội, còn đồng hồ máy chủ (và
// Render) là UTC. Trừ khi cộng 7 giờ thì người cầu may lúc 21h sẽ bị tính sang ngày
// hôm sau và mất luôn chuỗi ngày.
export function vnDay(at: Date = new Date()): string {
  return new Date(at.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export const SEN_PER_EXP = 0.4;
// Ngưỡng chống "một gói tin làm giàu". Máy khách gửi số lần, không gửi điểm, nên chỉ
// cần chặn ở phía số lần; gói to hơn con số này chỉ có thể là vòng lặp POST.
export const MAX_COUNT = 30;
// Một nhịp thiền tối đa được ghi nhận: 60 phút, và 240 phút mỗi ngày. Không có
// mốc này thì một người để máy treo cả đêm sẽ đứng đầu BXH.
export const MAX_MEDITATE_MIN = 60;
export const MAX_MEDITATE_MIN_DAY = 240;

const MERIT_PER: Record<string, number> = {
  visit_first: 20,
  visit_again: 5,
  bow: 5,
  meditate_min: 12,
};

// Thưởng cố định cho vài hành động nằm ngoài nhịp gõ (xỉ quẻ).
export const QUE_EXP = 15;

export type PracticeDelta = {
  bows?: number;
  meditateMin?: number;
  visits?: number;
  exp?: number;
};

export type LevelUp = { level: number; title: string; sen: number };

export type MeritResult = { profile: TempleProfile; gained: number; levelUps: LevelUp[] };

function scaled(exp: number, buffed: boolean): number {
  // Lá bùa mở buff +20% điểm trong 10 phút; mốc hết hạn nằm ở temple_profiles.buff_until.
  return buffed ? Math.ceil(exp * 1.2) : exp;
}

// Cộng một nhịp vào hồ sơ. Đọc–ghi trong một transaction vì hai request của
// cùng một người (cầu may + quay vòng, gửi gần như cùng lúc) nếu cộng theo kiểu
// "đọc rồi ghi" sẽ ăn đè nhau và mất điểm của nhịp trước.
//
// Số ghi vào temple_practice là số *đã nhân buff*, đúng bằng số cộng vào exp của
// hồ sơ: sổ điểm mà mỗi ngày một khác so với thanh tiến độ thì người chơi sẽ
// hoặc nghi server tính gian, hoặc nghi HUD hiển thị sai.
export async function addMerit(
  userId: string,
  gain: { exp?: number; sen?: number; ngoc?: number; practice?: PracticeDelta },
): Promise<MeritResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<TempleProfileRowForMerit>(
      'SELECT exp, sen, buff_until FROM temple_profiles WHERE user_id = $1 FOR UPDATE',
      [userId],
    );
    const row = rows[0];
    if (!row) throw new Error(`no temple profile for ${userId}`);
    const expGain = scaled(gain.exp ?? 0, row.buff_until instanceof Date && row.buff_until > new Date());
    const reached = levelFromExp(row.exp + expGain);
    const before = levelFromExp(row.exp).level;
    const levelUps: LevelUp[] = [];
    let sen = row.sen + Math.ceil(expGain * SEN_PER_EXP) + (gain.sen ?? 0);
    if (reached.level > before) {
      const bonus = reached.level * 50;
      sen += bonus;
      levelUps.push({ level: reached.level, title: reached.title, sen: bonus });
    }
    await client.query(
      `UPDATE temple_profiles
         SET exp = exp + $2, sen = $3, ngoc = ngoc + $4, updated_at = now()
       WHERE user_id = $1`,
      [userId, expGain, sen, gain.ngoc ?? 0],
    );
    await bumpPractice(client, userId, { ...gain.practice, exp: (gain.practice?.exp ?? 0) + expGain });
    await client.query('COMMIT');
    const profile = await templeProfile(userId);
    if (!profile) throw new Error(`no temple profile for ${userId}`);
    return { profile, gained: expGain, levelUps };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export type Queryable = Pick<typeof pool, 'query'>;

type TempleProfileRowForMerit = { exp: number; sen: number; buff_until: Date | null };

// Cộng dồn vào hàng của hôm nay. Một hàng cho mỗi người mỗi ngày là đủ để
// dựng chuỗi ngày, BXH và sổ điểm, mà không phải giữ từng nhịp gõ.
export async function bumpPractice(db: Queryable, userId: string, delta: PracticeDelta, day = vnDay()): Promise<void> {
  const cols: { column: string; value: number }[] = [];
  const push = (column: string, value: number) => {
    if (value) cols.push({ column, value });
  };
  push('bows', delta.bows ?? 0);
  push('meditate_min', delta.meditateMin ?? 0);
  push('visits', delta.visits ?? 0);
  push('exp', delta.exp ?? 0);
  if (!cols.length) return;

  const values: unknown[] = [userId, day, ...cols.map((c) => c.value)];
  const inserts = ['user_id', 'day', ...cols.map((c) => c.column)];
  const placeholders = inserts.map((_, i) => `$${i + 1}`);
  const updates = cols.map((c, i) => `${c.column} = temple_practice.${c.column} + $${i + 3}`);
  await db.query(
    `INSERT INTO temple_practice (${inserts.join(', ')})
     VALUES (${placeholders.join(', ')})
     ON CONFLICT (user_id, day) DO UPDATE SET ${updates.join(', ')}`,
    values,
  );
}

// Chuỗi ngày cầu may. Chỉ đếm một lần mỗi ngày, và đứt một ngày thì bắt đầu lại từ 1 —
// giống hệt cách bản gốc xử lý streak, nhưng quyết định ở server để không ai tự đặt
// chuỗi của mình thành 999.
export async function touchStreak(userId: string, day = vnDay()): Promise<{ streak: number; bestStreak: number }> {
  const { rows } = await pool.query<{ practice_day: string | null; streak: number; best_streak: number }>(
    'SELECT practice_day, streak, best_streak FROM temple_profiles WHERE user_id = $1',
    [userId],
  );
  const row = rows[0];
  if (!row) return { streak: 0, bestStreak: 0 };
  if (row.practice_day === day) return { streak: row.streak, bestStreak: row.best_streak };

  const yesterday = vnDay(new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000));
  const streak = row.practice_day === yesterday ? row.streak + 1 : 1;
  const bestStreak = Math.max(row.best_streak, streak);
  await pool.query(
    'UPDATE temple_profiles SET practice_day = $2, streak = $3, best_streak = $4, updated_at = now() WHERE user_id = $1',
    [userId, day, streak, bestStreak],
  );
  return { streak, bestStreak };
}

// Số liệu ngày hôm nay của một người, để HUD tô mấy ô "hôm nay: bao nhiêu nhịp".
export async function practiceToday(userId: string, day = vnDay()): Promise<PracticeDelta & { day: string }> {
  const { rows } = await pool.query<{
    bows: number;
    meditate_min: number;
    visits: number;
    exp: number;
  }>('SELECT bows, meditate_min, visits, exp FROM temple_practice WHERE user_id = $1 AND day = $2', [userId, day]);
  const row = rows[0];
  return {
    day,
    bows: row?.bows ?? 0,
    meditateMin: row?.meditate_min ?? 0,
    visits: row?.visits ?? 0,
    exp: row?.exp ?? 0,
  };
}

// Tổng cả đời, không theo ngày. HUD cần nó cho mốc "lần đầu" mà `today` không suy ra
// được, còn temple_practice thì mỗi ngày một hàng và hàng cũ bị journal cắt ở 28 ngày.
export async function practiceLifetime(userId: string): Promise<PracticeDelta> {
  const { rows } = await pool.query<{
    bows: number;
    meditate_min: number;
    visits: number;
    exp: number;
  }>(
    `SELECT COALESCE(SUM(bows), 0)::int AS bows,
            COALESCE(SUM(meditate_min), 0)::int AS meditate_min,
            COALESCE(SUM(visits), 0)::int AS visits,
            COALESCE(SUM(exp), 0)::int AS exp
       FROM temple_practice WHERE user_id = $1`,
    [userId],
  );
  const row = rows[0];
  return {
    bows: row?.bows ?? 0,
    meditateMin: row?.meditate_min ?? 0,
    visits: row?.visits ?? 0,
    exp: row?.exp ?? 0,
  };
}

// Sổ điểm 28 ngày: BXH tuần và trang "nhịp của tôi" cùng đọc từ đây.
export async function practiceJournal(userId: string, days = 28): Promise<{ day: string; exp: number }[]> {
  const { rows } = await pool.query<{ day: string; exp: number }>(
    `SELECT day, exp FROM temple_practice
      WHERE user_id = $1 AND day >= (now() + INTERVAL '7 hours')::date - $2::int
      ORDER BY day DESC LIMIT $3`,
    [userId, days, days],
  );
  return rows.map((r) => ({ day: typeof r.day === 'string' ? r.day : vnDay(new Date(r.day)), exp: r.exp }));
}

// Trừ vật phẩm khỏi túi, trả về số còn lại; null khi không đủ đồ.
//
// Túi là jsonb nên không có CHECK nào chặn được âm số, và "đọc rồi ghi" thì hai cú
// chạm liền nhau có thể cùng thấy 15 lá bùa và cùng ghi 14 — tức là sảnh mất một
// món đồ mà không ai trả. Điều kiện đủ đồ nằm ngay trong WHERE nên bản cập nhật
// nào không lấy được đồ thì thất bại, không ghi đè.
export async function consumeItem(userId: string, item: string, count = 1): Promise<Record<string, number> | null> {
  const { rows } = await pool.query<{ inventory: Record<string, number> }>(
    `UPDATE temple_profiles
        SET inventory = jsonb_set(inventory, ARRAY[$2], to_jsonb((COALESCE(inventory -> $2, '0')::int) - $3)),
            updated_at = now()
      WHERE user_id = $1
        AND (COALESCE(inventory -> $2, '0')::int) >= $3
      RETURNING inventory`,
    [userId, item, count],
  );
  return rows[0]?.inventory ?? null;
}

// Cộng vật phẩm vào túi. jsonb_set trả về hàng mới nên không cần đọc túi trước.
export async function grantItem(userId: string, item: string, count = 1): Promise<Record<string, number> | null> {
  const { rows } = await pool.query<{ inventory: Record<string, number> }>(
    `UPDATE temple_profiles
        SET inventory = jsonb_set(inventory, ARRAY[$2], to_jsonb((COALESCE(inventory -> $2, '0')::int) + $3)),
            updated_at = now()
      WHERE user_id = $1
      RETURNING inventory`,
    [userId, item, count],
  );
  return rows[0]?.inventory ?? null;
}

export { MERIT_PER };
