// Mô-đun đọc của chùa: mọi response của HUD đều đi qua đây, để HUD chỉ phải biết
// đúng một kiểu dữ liệu thay vì hai mươi hình dạng khác nhau theo từng tuyến.
import { pool } from '../db.ts';
import { levelFromExp, templeProfile, type TempleProfile } from './identity.ts';
import { practiceJournal, practiceLifetime, practiceToday, type PracticeDelta } from './merit.ts';

export type TempleState = {
  id: number;
  name: string;
  sect: string;
  title: string;
  honor: string;
  level: number;
  exp: number;
  exp_next: number;
  sen: number;
  ngoc: number;
  duc: number;
  fruit: number;
  streak: number;
  best_streak: number;
  inventory: Record<string, number>;
  appearance: Record<string, unknown>;
  equipped: Record<string, string | null>;
  buff_until: string | null;
  meditate_start: string | null;
  today: PracticeDelta & { day: string };
  lifetime: PracticeDelta;
  journal?: { day: string; exp: number }[];
};

// Hồ sơ của người khác thì khác một điểm: ví và điểm may là chuyện riêng, còn
// avatar trong sảnh thì ai cũng thấy. Table này giữ phần công khai.
export type PublicPlayer = {
  id: number;
  name: string;
  sect: string;
  title: string;
  honor: string;
  level: number;
};

export function toState(profile: TempleProfile, today: PracticeDelta & { day: string }, lifetime: PracticeDelta): TempleState {
  const ladder = levelFromExp(profile.exp);
  return {
    id: profile.playerId,
    name: profile.name,
    sect: profile.sect,
    // Danh hiệu đi theo bậc, không đi theo hàng vừa lưu: một người cầu may thêm 100 lần
    // thì title phải đổi ngay mà không cần ai ghi lại cột title.
    title: profile.title || ladder.title,
    honor: profile.honor,
    level: profile.level,
    exp: profile.exp,
    exp_next: ladder.expNext,
    sen: profile.sen,
    ngoc: profile.ngoc,
    duc: profile.duc,
    fruit: profile.fruit,
    streak: profile.streak,
    best_streak: profile.bestStreak,
    inventory: profile.inventory,
    appearance: profile.appearance,
    equipped: profile.equipped,
    buff_until: profile.buffUntil,
    meditate_start: profile.meditateStart,
    today,
    lifetime,
  };
}

// Nỗi đau của mọi HUD: sau mỗi hành động phải hiện ví tiền mới. Vì vậy các tuyến ghi
// đều trả về toàn bộ state kèm phần thưởng vừa nhận, đúng như api.js mock vẫn làm
// (api.js:525) — một request, không phải hai.
export async function templeState(userId: string, opts: { journal?: boolean } = {}): Promise<TempleState> {
  const profile = await templeProfile(userId);
  if (!profile) throw new Error(`no temple profile for ${userId}`);
  const [today, lifetime] = await Promise.all([practiceToday(userId), practiceLifetime(userId)]);
  const state = toState(profile, today, lifetime);
  if (opts.journal) state.journal = await practiceJournal(userId);
  return state;
}

export type PublicRow = { user_id: string; player_id: string; name: string; sect: string; title: string; honor: string; exp: number };

export function toPublic(row: PublicRow): PublicPlayer {
  return {
    id: Number(row.player_id),
    name: row.name,
    sect: row.sect,
    title: row.title || levelFromExp(row.exp).title,
    honor: row.honor,
    level: levelFromExp(row.exp).level,
  };
}

// Cùng phần công khai, lấy từ hồ sơ đang có trong bộ nhớ thay vì đọc lại bảng: một
// tuyến báo tin cho người khác thì tên/bậc của người hành động vừa nằm sẵn ở đó rồi.
export function toPublicOf(profile: TempleProfile): PublicPlayer {
  return {
    id: profile.playerId,
    name: profile.name,
    sect: profile.sect,
    title: profile.title,
    honor: profile.honor,
    level: profile.level,
  };
}

export async function playerByPlayerId(playerId: number): Promise<PublicRow | null> {
  const { rows } = await pool.query<PublicRow>(
    'SELECT user_id, player_id, name, sect, title, honor, exp FROM temple_profiles WHERE player_id = $1',
    [playerId],
  );
  return rows[0] ?? null;
}
