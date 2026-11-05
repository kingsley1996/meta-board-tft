// Mô-đun đọc của chùa: mọi response của HUD đều đi qua đây, để HUD chỉ phải biết
// đúng một kiểu dữ liệu thay vì hai mươi hình dạng khác nhau theo từng tuyến.
import { pool } from '../db.ts';
import { levelFromExp, templeProfile, type TempleProfile } from './identity.ts';
import { practiceJournal, practiceToday, type PracticeDelta } from './merit.ts';

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
  journal?: { day: string; exp: number }[];
};

// Hồ sơ của người khác thì khác một điểm: Sen/Ngọc/công đức là chuyện riêng, còn
// avatar trong chánh điện thì ai cũng thấy. Table này giữ phần công khai.
export type PublicPlayer = {
  id: number;
  name: string;
  sect: string;
  title: string;
  honor: string;
  level: number;
};

export function toState(profile: TempleProfile, today: PracticeDelta & { day: string }): TempleState {
  const ladder = levelFromExp(profile.exp);
  return {
    id: profile.playerId,
    name: profile.name,
    sect: profile.sect,
    // Danh hiệu đi theo bậc, không đi theo hàng vừa lưu: một người lạy thêm 100 lạy
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
  };
}

// Nỗi đau của mọi HUD: sau mỗi hành động phải hiện ví tiền mới. Vì vậy các tuyến ghi
// đều trả về toàn bộ state kèm phần thưởng vừa nhận, đúng như api.js mock vẫn làm
// (api.js:525) — một request, không phải hai.
export async function templeState(userId: string, opts: { journal?: boolean } = {}): Promise<TempleState> {
  const profile = await templeProfile(userId);
  if (!profile) throw new Error(`no temple profile for ${userId}`);
  const today = await practiceToday(userId);
  const state = toState(profile, today);
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

export async function playerByPlayerId(playerId: number): Promise<PublicRow | null> {
  const { rows } = await pool.query<PublicRow>(
    'SELECT user_id, player_id, name, sect, title, honor, exp FROM temple_profiles WHERE player_id = $1',
    [playerId],
  );
  return rows[0] ?? null;
}
