// Mô-đun đọc của chùa: mọi response của HUD đều đi qua đây, để HUD chỉ phải biết
// đúng một kiểu dữ liệu thay vì hai mươi hình dạng khác nhau theo từng tuyến.
import { pool } from '../db.ts';
import { expForLevel, levelFromExp, templeProfile, type TempleProfile } from './identity.ts';
import { practiceJournal, practiceLifetime, practiceToday, type PracticeDelta } from './merit.ts';

export type TempleState = {
  id: number;
  name: string;
  sect: string;
  title: string;
  honor: string;
  level: number;
  exp: number;
  // Hai mốc của riêng bậc hiện tại: exp_prev là điểm đã chạm tới khi bước lên bậc này,
  // exp_next là điểm của bậc kế. HUD cần cả hai chứ không chỉ exp_next vì thanh tiến độ
  // phải đo đoạn đã đi *trong* bậc, không phải tỉ lệ trên cả thang.
  exp_prev: number;
  exp_next: number;
  sen: number;
  ngoc: number;
  duc: number;
  fruit: number;
  streak: number;
  best_streak: number;
  inventory: Record<string, number>;
  appearance: Record<string, unknown>;
  // 12 ô nhân vật trong Hồ sơ vẽ khoá hay mở theo danh sách này (heroes.ts).
  heroes: string[];
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
    // Danh hiệu dẫn xuất thuần từ exp: một người cầu may thêm 100 lần thì title đổi ngay
    // mà không cần ai ghi lại cột title (cột đó là chữ để lại của thang cũ).
    title: ladder.title,
    honor: profile.honor,
    level: profile.level,
    exp: profile.exp,
    // Đỉnh thang vẫn có mốc của chính nó (bậc 19 = 33000) nên thanh tiến độ không cần
    // một nhánh riêng cho "đã hết thang".
    exp_prev: expForLevel(ladder.level) ?? 0,
    exp_next: ladder.expNext,
    sen: profile.sen,
    ngoc: profile.ngoc,
    duc: profile.duc,
    fruit: profile.fruit,
    streak: profile.streak,
    best_streak: profile.bestStreak,
    inventory: profile.inventory,
    appearance: profile.appearance,
    heroes: profile.heroes,
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
    title: levelFromExp(row.exp).title,
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
