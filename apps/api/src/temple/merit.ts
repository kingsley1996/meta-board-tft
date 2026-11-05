// Sổ công đức: mọi con số mà người chơi nhìn thấy trong HUD đều được cộng ở đây,
// không phải chỗ máy khách gửi lên.
//
// Lý do máy chủ phải giữ phần này: máy khách chỉ còn gửi "tôi vừa lạy ba lạy", còn
// lạy thành bao nhiêu công đức, lên bậc nào, được thưởng bao nhiêu Sen là quyết định
// của chùa. Đổi công thức trong file này thì cả chùa đổi theo, không phải chờ bản
// phát hành của trang.
//
// Bảng quy đổi lấy đúng như bản gốc đã tính (api.js:449-526). Sen luôn đi kèm công
// đức với tỉ lệ 0.4 (api.js:523) và lên bậc thưởng thêm level × 50 Sen
// (api.js:267-271) — economy-lite nên hai loại tiền này chỉ ra từ đây, không có
// đường mua bằng tiền thật.
import { pool } from '../db.ts';
import { levelFromExp, type TempleProfile, templeProfile } from './identity.ts';

// Chùa ở Việt Nam nên "một ngày" là ngày theo giờ Hà Nội, còn đồng hồ máy chủ (và
// Render) là UTC. Trừ khi cộng 7 giờ thì người lạy lúc 21h sẽ bị tính sang ngày hôm
// sau và mất luôn chuỗi ngày tu.
export function vnDay(at: Date = new Date()): string {
  return new Date(at.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export const SEN_PER_EXP = 0.4;
// Ngưỡng chống "một gói tin làm giàu". Máy khách gửi số lần, không gửi điểm, nên chỉ
// cần chặn ở phía số lần: 108 là một vòng chuỗi trọn vẹn, không ai lạy hơn 108 lạy
// trong một nhịp gõ.
export const MAX_COUNT = 108;
// Một nhịp ngồi thiền tối đa được ghi nhận: 60 phút, và 240 phút mỗi ngày. Không có
// mốc này thì một người để máy treo cả đêm sẽ đứng đầu BXH.
export const MAX_MEDITATE_MIN = 60;
export const MAX_MEDITATE_MIN_DAY = 240;

const MERIT_PER: Record<string, number> = {
  visit_first: 20,
  visit_again: 5,
  bow: 5,
  bead: 1,
  round: 40,
  chant_done: 45,
  meditate_min: 12,
  bell: 10,
  sweep: 25,
  plant: 25,
  sit: 6,
  stroll: 6,
};

// Thưởng cố định cho vài hành động nằm ngoài nhịp gõ (thả đèn, xem đèn, xỉ quẻ).
export const LANTERN_EXP = 20;
export const REJOICE_EXP = 5;
export const QUE_EXP = 15;

export type PracticeDelta = {
  bows?: number;
  beads?: number;
  rounds?: number;
  meditateMin?: number;
  chants?: number;
  visits?: number;
  exp?: number;
};

export type LevelUp = { level: number; title: string; sen: number };

export type MeritResult = { profile: TempleProfile; gained: number; levelUps: LevelUp[] };

function scaled(exp: number, buffed: boolean): number {
  // Nén hương làm +20% công đức trong 10 phút (meta.json: huong_tram.description).
  return buffed ? Math.ceil(exp * 1.2) : exp;
}

// Cộng một lần hành trì vào hồ sơ. Đọc–ghi trong một transaction vì hai request của
// cùng một người (lạy + lần chuỗi, gửi gần như cùng lúc) nếu cộng theo kiểu
// "đọc rồi ghi" sẽ ăn đè nhau và mất điểm của nhịp trước.
//
// Số ghi vào temple_practice là số *đã nhân nén hương*, đúng bằng số cộng vào exp của
// hồ sơ: sổ công đức mà mỗi ngày một khác so với thanh tiến độ thì người chơi sẽ
// hoặc nghi chùa tính gian, hoặc nghi HUD hiển thị sai.
export async function addMerit(
  userId: string,
  gain: { exp?: number; sen?: number; ngoc?: number; duc?: number; fruit?: number; practice?: PracticeDelta },
): Promise<MeritResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<TempleProfileRowForMerit>(
      'SELECT exp, sen, ngoc, duc, fruit, buff_until FROM temple_profiles WHERE user_id = $1 FOR UPDATE',
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
         SET exp = exp + $2, sen = $3, ngoc = ngoc + $4, duc = LEAST(100, duc + $5),
             fruit = fruit + $6, updated_at = now()
       WHERE user_id = $1`,
      [userId, expGain, sen, gain.ngoc ?? 0, gain.duc ?? 0, gain.fruit ?? 0],
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

type TempleProfileRowForMerit = { exp: number; sen: number; ngoc: number; duc: number; fruit: number; buff_until: Date | null };

// Cộng dồn vào hàng hành trì của hôm nay. Một hàng cho mỗi người mỗi ngày là đủ để
// dựng chuỗi ngày, BXH và sổ công đức, mà không phải giữ từng tiếng chuông.
export async function bumpPractice(db: Queryable, userId: string, delta: PracticeDelta, day = vnDay()): Promise<void> {
  const cols: { column: string; value: number }[] = [];
  const push = (column: string, value: number) => {
    if (value) cols.push({ column, value });
  };
  push('bows', delta.bows ?? 0);
  push('beads', delta.beads ?? 0);
  push('rounds', delta.rounds ?? 0);
  push('meditate_min', delta.meditateMin ?? 0);
  push('chants', delta.chants ?? 0);
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

// Chuỗi ngày tu. Chỉ đếm một lần mỗi ngày, và đứt một ngày thì bắt đầu lại từ 1 —
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

// Số liệu ngày hôm nay của một người, để HUD tô mấy ô "hôm nay: bao nhiêu lạy".
export async function practiceToday(userId: string, day = vnDay()): Promise<PracticeDelta & { day: string }> {
  const { rows } = await pool.query<{
    bows: number;
    beads: number;
    rounds: number;
    meditate_min: number;
    chants: number;
    visits: number;
    exp: number;
  }>('SELECT bows, beads, rounds, meditate_min, chants, visits, exp FROM temple_practice WHERE user_id = $1 AND day = $2', [userId, day]);
  const row = rows[0];
  return {
    day,
    bows: row?.bows ?? 0,
    beads: row?.beads ?? 0,
    rounds: row?.rounds ?? 0,
    meditateMin: row?.meditate_min ?? 0,
    chants: row?.chants ?? 0,
    visits: row?.visits ?? 0,
    exp: row?.exp ?? 0,
  };
}

// Tổng cả đời tu, không theo ngày. Hai chỗ trong HUD cần nó mà không suy ra được từ
// `today`: mốc "108 lạy đầu tiên" (main.js:1839 so với số lạy tích luỹ) và nhãn
// "Vòng thứ N" của tràng hạt — cả hai đều là chuyện của cả quá trình, còn
// temple_practice thì mỗi ngày một hàng và hàng cũ bị journal cắt ở 28 ngày.
export async function practiceLifetime(userId: string): Promise<PracticeDelta> {
  const { rows } = await pool.query<{
    bows: number;
    beads: number;
    rounds: number;
    meditate_min: number;
    chants: number;
    visits: number;
    exp: number;
  }>(
    `SELECT COALESCE(SUM(bows), 0)::int AS bows,
            COALESCE(SUM(beads), 0)::int AS beads,
            COALESCE(SUM(rounds), 0)::int AS rounds,
            COALESCE(SUM(meditate_min), 0)::int AS meditate_min,
            COALESCE(SUM(chants), 0)::int AS chants,
            COALESCE(SUM(visits), 0)::int AS visits,
            COALESCE(SUM(exp), 0)::int AS exp
       FROM temple_practice WHERE user_id = $1`,
    [userId],
  );
  const row = rows[0];
  return {
    bows: row?.bows ?? 0,
    beads: row?.beads ?? 0,
    rounds: row?.rounds ?? 0,
    meditateMin: row?.meditate_min ?? 0,
    chants: row?.chants ?? 0,
    visits: row?.visits ?? 0,
    exp: row?.exp ?? 0,
  };
}

// Sổ công đức 28 ngày: BXH tuần và trang "tu tập của tôi" cùng đọc từ đây.
export async function practiceJournal(userId: string, days = 28): Promise<{ day: string; exp: number }[]> {
  const { rows } = await pool.query<{ day: string; exp: number }>(
    `SELECT day, exp FROM temple_practice
      WHERE user_id = $1 AND day >= (CURRENT_DATE + INTERVAL '7 hours')::date - $2::int
      ORDER BY day DESC LIMIT $3`,
    [userId, days, days],
  );
  return rows.map((r) => ({ day: typeof r.day === 'string' ? r.day : vnDay(new Date(r.day)), exp: r.exp }));
}

// Trừ vật phẩm khỏi túi, trả về số còn lại; null khi không đủ đồ.
//
// Túi là jsonb nên không có CHECK nào chặn được âm số, và "đọc rồi ghi" thì hai cú
// chạm liền nhau có thể cùng thấy 15 nén hương và cùng ghi 14 — tức là chùa mất một
// cây đèn mà không ai trả đồ. Điều kiện đủ đồ nằm ngay trong WHERE nên bản cập nhật
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
