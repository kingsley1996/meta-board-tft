// Tỷ thí giữa hai người chơi: xúc xắc, oẳn tù tì và cờ caro.
//
// Vì sao trận nằm trong database chứ không trong bộ nhớ phòng: một cú mời có thể tới lúc
// người kia đang để tab nền, và một nước đi có thể tới trước khi nước kia kịp ghi. Hàng
// `temple_games` là nơi duy nhất trả lời "đến lượt ai, vòng mấy, tỉ số bao nhiêu" cho cả
// hai máy khách, còn socket chỉ làm nhiệm vụ báo cho họ nhìn vào đó.
//
// Vì sao máy chủ gieo xúc xắc, quyết vòng hòa và tính hàng thắng: ba thứ đó là toàn bộ trò
// chơi. Nếu máy khách tự khai thì một gói tin là thắng mọi trận, và "Độ May" trở thành
// chữ trang trí. Riêng caro, luật nằm ở caro.ts — đây chỉ là giao dịch quanh nó.
import { Router } from 'express';
import { pool } from '../db.ts';
import { CELLS, EMPTY_BOARD, isEmpty, isFull, place, turnOf, winLine, type CaroSide } from './caro.ts';
import { ensureTempleProfile, levelFromExp } from './identity.ts';
import { ApiError, cooldown, num, playerId, withAccount, withUser } from './http.ts';
import { addMerit, practiceToday, type LevelUp, type Queryable as Db } from './merit.ts';
import { ensureTempleTables } from './schema.ts';
import { playerByPlayerId, templeState, toPublic, type PublicPlayer, type PublicRow, type TempleState } from './state.ts';
import { notifyPlayer } from './ws.ts';

export const gamesRouter = Router();

export type GameKind = 'dice' | 'rps' | 'caro';

type Rule = { name: string; wins: number; maxRounds: number; dice: number };

// Xúc xắc một ván ăn ngay (ai tổng lớn hơn thắng), oẳn tù tì đánh ba thắng hai. Trần vòng
// tồn tại vì vòng hòa không tính điểm: không có nó thì hai người hòa liên tiếp là trận
// không bao giờ kết thúc.
//
// Caro không có "vòng" theo nghĩa của hai môn kia: một vòng của nó là hai nước (bên mời
// rồi bên nhận), nên 81 ô chia hết thành 40 vòng + nước cuối của bên a. maxRounds 41 là
// chỗ bàn cờ đầy, và bàn đầy thì luật đã xử ở caro.ts chứ không nhờ trần vòng.
const RULES: Record<GameKind, Rule> = {
  dice: { name: 'Xúc Xắc', wins: 1, maxRounds: 3, dice: 3 },
  rps: { name: 'Oẳn Tù Tì', wins: 2, maxRounds: 7, dice: 0 },
  caro: { name: 'Cờ Caro', wins: 1, maxRounds: 41, dice: 0 },
};

// Búa ăn Kéo, Kéo ăn Bao, Bao ăn Búa.
const SIGNS: Record<string, string> = { bua: 'keo', keo: 'bao', bao: 'bua' };

// Phần thưởng một trận. Thua vẫn được cộng vì sảnh đền không có chỗ nào để "trắng tay":
// người thua cần lý do ở lại trận sau hơn là cần thêm một cái thua.
const REWARD = { win: 40, lose: 12, draw: 20 };

// Trần Điểm May Mắn từ tỷ thí trong một ngày (theo danh nghĩa phần thưởng, chưa nhân bùa):
// ba ván thắng. Qua trần thì vẫn mời, vẫn đánh, vẫn thấy kết quả — chỉ là ví không dày
// thêm. Ghi sổ ở temple_practice.game_exp, cùng một hàng với các nhịp cầu may khác.
const SEN_CAP_DAY = 120;

// Trận vừa ngã ngũ vẫn nằm lại "Đang tỷ thí" thêm cửa sổ này: hai người cần thấy mặt xúc
// xắc và tỉ số ngay chỗ vừa đánh, không phải sang tab "Từng đấu" hoặc đoán qua một dòng
// toast thoáng qua. Hết cửa sổ thì hàng về lịch sử, đúng chỗ của nó.
const RESULT_MS = 3 * 60_000;

// Lời mời bỏ ngỏ và trận bỏ dang phải tự hết hạn: người kia có thể đã tắt máy và không
// ai bấm "Hủy" hộ ai. expire() cắt ngay khi một người mở bảng; expireStaleGames() quét
// nền mỗi phút (bots.ts) để hàng chết kể cả khi không ai đọc. Bot cũng đọc đúng
// STALE_MS để bỏ qua lời mời/trận đã quá hạn thay vì nhặt chúng sống lại.
export const STALE_MS = 10 * 60_000;

// ---- Độ May -------------------------------------------------------------------
//
// Điểm May Mắn không chỉ là số trang trí: người tu hành dày, đang giữ chuỗi ngày, hôm nay
// đã cầu may và đang bật bùa thì gieo xúc xắc nặng tay hơn. Trần 100 và mỗi thành phần
// một trần riêng để một người chăm thiền không thành "ăn chắc": lộc tối đa là +5 trên tổng
// 3 viên (3..18), tức phần nhiều vẫn do xúc xắc quyết.
const LUCK = { base: 20, level: 30, streak: 20, today: 20, charm: 10 };

export type GamePlayer = PublicPlayer & { luck: number; bonus: number };

type LuckRow = PublicRow & { streak: number; buff_until: Date | null; today_exp: number };

function luckOf(row: LuckRow, now = Date.now()): number {
  const level = levelFromExp(row.exp).level;
  const charm = row.buff_until && row.buff_until.getTime() > now ? LUCK.charm : 0;
  const parts = [
    LUCK.base,
    Math.min(LUCK.level, level * 3),
    Math.min(LUCK.streak, row.streak * 4),
    Math.min(LUCK.today, Math.floor(row.today_exp / 25)),
    charm,
  ];
  return Math.min(100, parts.reduce((a, b) => a + b, 0));
}

// Phần cộng vào tổng xúc xắc, và là thứ HUD in ra cạnh từng lượt gieo.
const bonusOf = (luck: number) => Math.floor(luck / 20);

async function luckRows(userIds: string[], db: Db = pool): Promise<Map<string, GamePlayer>> {
  const unique = [...new Set(userIds)];
  if (!unique.length) return new Map();
  // Cửa sổ "hôm nay" phải là ngày Hà Nội, đúng biểu thức mà practice.ts ghi sổ điểm;
  // lấy CURRENT_DATE thì người cầu may buổi tối thấy Độ May của mình tụt về 0.
  const { rows } = await db.query<LuckRow>(
    `SELECT pr.user_id, pr.player_id, pr.name, pr.sect, pr.title, pr.honor, pr.exp, pr.streak,
            pr.buff_until, COALESCE(p.exp, 0)::int AS today_exp
       FROM temple_profiles pr
       LEFT JOIN temple_practice p ON p.user_id = pr.user_id AND p.day = (now() + INTERVAL '7 hours')::date
      WHERE pr.user_id = ANY($1::uuid[])`,
    [unique],
  );
  return new Map(
    rows.map((r) => {
      const luck = luckOf(r);
      return [r.user_id, { ...toPublic(r), luck, bonus: bonusOf(luck) }];
    }),
  );
}

// ---- Kiểu dữ liệu trên dây ------------------------------------------------------

type Move = { dice?: number[]; pick?: string; cell?: number; bonus: number; total?: number };
// `line` chỉ có ở caro: năm ô thắng cuộc. Máy khách tô sáng đúng các ô này thay vì tự
// tính lại luật — luật mà nằm ở hai nơi thì sớm muộn cũng lệch nhau.
type RoundResult = { round: number; a: Move; b: Move; winner: 'a' | 'b' | ''; luck: [number, number]; line?: number[] };
export type GameSide = { player: GamePlayer; score: number; moved: boolean; move: Move | null };

export type GameMatch = {
  id: number;
  kind: GameKind;
  status: 'invite' | 'live' | 'over' | 'dead';
  reason: string;
  round: number;
  max_rounds: number;
  wins_needed: number;
  a: GameSide;
  b: GameSide;
  winner: number | null;
  result: RoundResult | null;
  // Bàn caro dưới dạng chuỗi 81 ký tự ('.', 'a', 'b'); môn khác rỗng. Đây là sự thật duy
  // nhất về mặt trận, nên nó đi theo trận chứ không suy ra từ lịch sử nước đi ở máy khách.
  board: string;
  at: string;
};

type GameReward = { state: TempleState; gained: number; level_ups: LevelUp[]; outcome: 'win' | 'lose' | 'draw'; cap: GameCap };

// Trần hôm nay của một người: đã ăn bao nhiêu điểm tỷ thí, so với trần, và ván vừa rồi
// đáng ra được bao nhiêu so với thực nhận. Máy khách dùng nó để in chữ "đã trần" thay vì
// tự đoán vì sao một ván thắng lại +0.
export type GameCap = { today: number; max: number; nominal?: number; awarded?: number };

type GameRow = {
  id: string;
  kind: GameKind;
  status: GameMatch['status'];
  a_user: string;
  b_user: string;
  winner: string | null;
  reason: string;
  round: number;
  a_score: number;
  b_move: Move | null;
  a_move: Move | null;
  b_score: number;
  result: RoundResult | null;
  board: string;
  updated_at: Date;
};

// Vòng oẳn tù tì chưa phân định thì đòn của đối thủ phải nằm lại trong database: nếu cả
// hai nước đi cùng về một máy khách thì người ra trước thắng trận mà không cần chơi.
// Đòn của chính mình thì vẫn lộ, vì người reload giữa vòng phải thấy mình đã oẳn gì.
// Xúc xắc không có gì phải giấu — tổng đã là kết quả, và nó chỉ hiện ra khi cả hai đã gieo.
function hiddenWhilePending(row: GameRow, userId: string, viewer: string): boolean {
  return row.kind === 'rps' && row.status === 'live' && userId !== viewer;
}

function matchOf(row: GameRow, players: Map<string, GamePlayer>, viewer = ''): GameMatch {
  const rule = RULES[row.kind];
  const side = (userId: string, score: number, move: Move | null): GameSide => {
    const player = players.get(userId);
    if (!player) throw new ApiError(500, 'profile_missing', 'a player left the temple mid-match');
    const shown = hiddenWhilePending(row, userId, viewer) ? (move ? { bonus: move.bonus } : null) : move;
    return { player, score, moved: !!move, move: shown };
  };
  return {
    id: Number(row.id),
    kind: row.kind,
    status: row.status,
    reason: row.reason,
    round: row.round,
    max_rounds: rule.maxRounds,
    wins_needed: rule.wins,
    a: side(row.a_user, row.a_score, row.a_move),
    b: side(row.b_user, row.b_score, row.b_move),
    winner: row.winner ? (players.get(row.winner)?.id ?? null) : null,
    result: row.result && Object.keys(row.result).length ? row.result : null,
    board: row.board ?? '',
    at: row.updated_at.toISOString(),
  };
}

// Tin báo cho đối thủ. `match` phải xây theo mắt *người nhận*: nếu dùng lại object đã gửi
// cho người vừa hành động thì đòn oẳn tù tì của họ sang tới nơi bên kia nguyên vẹn.
function tellPeer(players: Map<string, GamePlayer>, row: GameRow, userId: string, kind: string, extra: Record<string, unknown> = {}): void {
  const other = row.a_user === userId ? row.b_user : row.a_user;
  const me = players.get(userId);
  const peer = players.get(other);
  if (!me || !peer) return;
  notifyPlayer(peer.id, { t: 'game', kind, by: me, match: matchOf(row, players, other), ...extra });
}

// ---- Vòng đấu -------------------------------------------------------------------

function roll(count: number): number[] {
  return Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6));
}

// 'a'/'b' là bên thắng vòng, '' là hòa. Với oẳn tù tì, hòa đòn không phải là hết chuyện:
// Độ May quyết vòng đó, đúng cái người chơi gọi là "duyên nặng hơn nên được nhường".
function roundWinner(kind: GameKind, a: Move, b: Move, luckA: number, luckB: number): 'a' | 'b' | '' {
  if (kind === 'dice') {
    const ta = a.total ?? 0;
    const tb = b.total ?? 0;
    return ta === tb ? '' : ta > tb ? 'a' : 'b';
  }
  if (a.pick === b.pick) return luckA === luckB ? '' : luckA > luckB ? 'a' : 'b';
  return SIGNS[a.pick ?? ''] === b.pick ? 'a' : 'b';
}

function signOf(value: unknown): string {
  const t = String(value ?? '');
  if (!Object.hasOwn(SIGNS, t)) throw new ApiError(400, 'invalid_sign', 'pick bua, bao or keo');
  return t;
}

function gameId(value: unknown): number {
  return num(value, 1, 4_294_967_295, 'invalid_game_id');
}

async function loadGame(id: number): Promise<GameRow> {
  const { rows } = await pool.query<GameRow>('SELECT * FROM temple_games WHERE id = $1', [id]);
  if (!rows[0]) throw new ApiError(404, 'no_such_game', 'that match is not in this temple');
  return rows[0];
}

async function expire(userId: string): Promise<void> {
  await pool.query(
    `UPDATE temple_games SET status = 'dead', reason = 'expired', updated_at = now()
      WHERE (a_user = $1 OR b_user = $1)
        AND status IN ('invite', 'live')
        AND updated_at < now() - ($2::int * INTERVAL '1 millisecond')`,
    [userId, STALE_MS],
  );
}

// Cùng luật quá hạn nhưng không chờ ai mở bảng: lời mời/trận bỏ dở phải tự chết kể cả
// khi cả hai bên đã tắt máy. Nhịp quét nằm trong vòng lặp bot (bots.ts) để không thêm
// một đồng hồ nền thứ hai phải dọn lúc shutdown.
export async function expireStaleGames(): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE temple_games SET status = 'dead', reason = 'expired', updated_at = now()
      WHERE status IN ('invite', 'live')
        AND updated_at < now() - ($1::int * INTERVAL '1 millisecond')`,
    [STALE_MS],
  );
  return rowCount ?? 0;
}

// Trận đang mở giữa hai người cụ thể — một cặp không nên có hai ván cùng lúc, vì máy khách
// thì không biết mình đang trả lời ván nào.
async function openBetween(kind: GameKind, a: string, b: string): Promise<GameRow | null> {
  const { rows } = await pool.query<GameRow>(
    `SELECT * FROM temple_games
      WHERE kind = $1 AND status IN ('invite', 'live')
        AND ((a_user = $2 AND b_user = $3) OR (a_user = $3 AND b_user = $2))
      ORDER BY updated_at DESC LIMIT 1`,
    [kind, a, b],
  );
  return rows[0] ?? null;
}

async function userIdOf(id: number): Promise<string> {
  const row = await playerByPlayerId(id);
  if (!row) throw new ApiError(404, 'no_such_player', 'nobody in the temple carries that id');
  return row.user_id;
}

// Một trận vừa ngã ngũ thì cả hai bên phải được trả lời bằng số liệu của chính mình, nên
// phần thưởng cộng ở đây và gửi kèm state trong tin báo — máy khách không phải đoán ví
// tiền sau ván thắng.
//
// `actor` là người bấm nước đi cuối cùng: người đó đã nhận trọn kết quả trong response
// HTTP của chính request, nên không gửi tin 'over' cho họ nữa — hai bản tin là hai thẻ
// thông báo chồng lên nhau trên màn hình.
async function finish(row: GameRow, actor: string) {
  const rewards = new Map<string, GameReward>();
  for (const userId of [row.a_user, row.b_user]) {
    const outcome: GameReward['outcome'] = !row.winner ? 'draw' : row.winner === userId ? 'win' : 'lose';
    const nominal = REWARD[outcome];
    // Phần còn lại của ngày, tính trên số đã ghi sổ: hai trận kết thúc cùng giây cho cùng
    // một người thì có thể vượt trần một chút, đổi lại không phải dựng thêm một đồng hồ.
    const today = (await practiceToday(userId)).gameExp ?? 0;
    const awarded = Math.max(0, Math.min(nominal, SEN_CAP_DAY - today));
    const merit = await addMerit(userId, { exp: awarded, practice: { gameExp: awarded } });
    rewards.set(userId, {
      state: await templeState(userId),
      gained: merit.gained,
      level_ups: merit.levelUps,
      outcome,
      cap: { today: today + awarded, max: SEN_CAP_DAY, nominal, awarded },
    });
  }
  // Chỉ bên kia cần được báo: người ra đòn cuối đã nhận trọn kết quả trong response của
  // chính request, gửi thêm một tin 'over' cho họ là hai thẻ thông báo chồng lên nhau.
  // Hồ sơ đọc lại sau khi cộng điểm: bậc trong thẻ thông báo phải là bậc *sau* ván đấu,
  // nếu không thì người vừa thăng vận thấy đối thủ vẫn đứng ở bậc cũ.
  const after = await luckRows([row.a_user, row.b_user]);
  const other = row.a_user === actor ? row.b_user : row.a_user;
  const reward = rewards.get(other);
  if (reward) tellPeer(after, row, actor, 'over', reward);
  return rewards;
}

// ---- Lối đi chung cho máy khách và bot ------------------------------------------
//
// Ba hàm dưới đây là toàn bộ vòng đời một trận, không biết gì về HTTP. Bot đền
// (bots.ts) đánh cùng những trận đó, và nếu nó đi đường vòng qua fetch() thì phải
// có vé, có cookie, có nẹp withAccount — tức là thêm một lớp giấy tờ giả chỉ để gọi
// được chính hàm đã tồn tại trong process. Validation và phần chống spam nằm ở đây
// nên hai bên nhận đúng cùng một quy tắc.
export async function inviteMatch(kindRaw: string, fromUserId: string, toPlayerId: number): Promise<GameMatch> {
  await ensureTempleTables();
  await ensureTempleProfile(fromUserId);
  const kind = String(kindRaw ?? '');
  if (!Object.hasOwn(RULES, kind)) throw new ApiError(400, 'invalid_game', 'the temple runs dice, rock-paper-scissors and caro');
  const other = await userIdOf(toPlayerId);
  if (other === fromUserId) throw new ApiError(400, 'self_game', 'nobody duels themselves');
  const existing = await openBetween(kind as GameKind, fromUserId, other);
  if (existing) throw new ApiError(409, 'already_open', 'a match between you two is still open');
  // Một vòng lặp mời không được mọc ra cả chục ván chờ; nhịp này chặn cửa ghi, còn lời mời
  // trùng thì đã bị 409 ở trên chặn trước (nên một cặp treo một ván, không treo cả chục).
  cooldown(`${fromUserId}:game`, 5_000);

  const created = await pool.query<GameRow>(
    'INSERT INTO temple_games (kind, a_user, b_user, board) VALUES ($1, $2, $3, $4) RETURNING *',
    // Bàn caro sinh ra đã là 81 ô trống thay vì chuỗi rỗng: một hàng đọc được bằng mắt
    // thì sửa được bằng tay, còn DEFAULT '' chỉ tồn tại cho hai môn không có bàn.
    [kind, fromUserId, other, kind === 'caro' ? EMPTY_BOARD : ''],
  );
  const players = await luckRows([fromUserId, other]);
  tellPeer(players, created.rows[0], fromUserId, 'invite');
  return matchOf(created.rows[0], players, fromUserId);
}

// Nhận lời mời: cú UPDATE là nhịp chiếm chỗ, hai tab cùng bấm "Đồng ý" thì một tab nhận 409.
export async function acceptMatch(gid: number, userId: string): Promise<GameMatch> {
  await ensureTempleTables();
  await ensureTempleProfile(userId);
  const taken = await pool.query<GameRow>(
    `UPDATE temple_games SET status = 'live', reason = '', updated_at = now()
      WHERE id = $1 AND b_user = $2 AND status = 'invite'
      RETURNING *`,
    [gid, userId],
  );
  const row = taken.rows[0];
  if (!row) {
    const found = await loadGame(gid);
    // Người ngoài cuộc thì 403, còn đúng người được mời nhưng lời mời đã hết chờ thì 409:
    // hai trường hợp này HUD vẽ hai chữ khác nhau, không được gộp một.
    if (found.b_user !== userId) throw new ApiError(403, 'not_your_game', 'this invitation is not yours to take');
    throw new ApiError(409, 'match_not_live', 'that invitation is no longer waiting');
  }
  const players = await luckRows([row.a_user, row.b_user]);
  tellPeer(players, row, userId, 'accept');
  return matchOf(row, players, userId);
}

// Một nước đi: phần thân cũ của route /move, nay đứng riêng để bot gieo xúc xắc, ra đòn
// oẳn tù tì và đặt ô caro bằng đúng đường của người thật — kể cả phần thưởng và trần điểm
// trong ngày.
//
// Các key vắng mặt có ý nghĩa: máy khách đọc `result` như bằng chứng "vòng vừa phân
// định", nên nhịp mới là bên ra trước phải trả về *không có* hai key ấy, đúng như body
// mà route từng gửi. Với caro thì gần như mọi nước đều thuộc nhịp này: caro chỉ có
// `result` khi trận ngã ngũ, còn bàn cờ đã đi theo `match.board`.
export type GameMoveResult = {
  match: GameMatch;
  result?: RoundResult;
  over?: boolean;
  waiting?: boolean;
} & Partial<GameReward>;

export async function moveMatch(gid: number, userId: string, rawMove: unknown): Promise<GameMoveResult> {
  await ensureTempleTables();
  await ensureTempleProfile(userId);
  const turn = await playTurn(gid, userId, rawMove);
  const { row, result, players } = turn;
  const match = matchOf(row, players, userId);

  if (!result) {
    // Bên ra trước chỉ báo "đến lượt bạn": tellPeer xây match theo mắt người nhận nên
    // đòn vừa ghi của bên này không đi theo tin báo.
    tellPeer(players, row, userId, 'move');
    return { match, waiting: true };
  }

  if (row.status === 'over') {
    const rewards = await finish(row, userId);
    return { match, result, over: true, ...(rewards.get(userId) ?? { state: await templeState(userId) }) };
  }

  // Vòng kế tiếp: người ra đòn đã có result trong response, chỉ bên kia cần được báo.
  tellPeer(players, row, userId, 'round', { result });
  return { match, result, over: false };
}

// ---- Tuyến đọc ------------------------------------------------------------------

// HUD gọi khi mở bảng và mỗi lần có tin 'game' tới. Không phân trang: list thứ nhất ngắn
// theo tuổi thọ của một ván (10 phút chờ) cộng cửa sổ kết quả, còn lịch sử thì cắt 10 trận.
gamesRouter.get('/games', withUser(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  await expire(user.id);
  // Chỉ 'over' được ở lại thêm một cửa sổ: đó là trận có kết quả. Còn 'dead' thì không —
  // nhịp quét lời mời quá hạn ghi updated_at = now() cho hàng nó vừa tắt, nên nếu tính cả
  // 'dead' thì mở bảng lên là đống lời mời chết từ hôm qua tự nhảy về tab "Đang tỷ thí".
  const open = await pool.query<GameRow>(
    `SELECT * FROM temple_games
      WHERE (a_user = $1 OR b_user = $1)
        AND (status IN ('invite', 'live') OR (status = 'over' AND updated_at > now() - ($2::int * INTERVAL '1 millisecond')))
      ORDER BY updated_at DESC LIMIT 20`,
    [user.id, RESULT_MS],
  );
  // Hai tab chia nhau một hàng, không tab nào lặp lại hàng của tab kia: "Đang tỷ thí" giữ
  // trận đang chờ/đang đánh và trận vừa hạ màn trong cửa sổ kết quả, "Từng đấu" nhận phần
  // còn lại. Nếu không thì một ván vừa xong hiện ở cả hai chỗ và người chơi không biết chỗ
  // nào là chỗ của nó.
  const history = await pool.query<GameRow>(
    `SELECT * FROM temple_games
      WHERE (a_user = $1 OR b_user = $1)
        AND status IN ('over', 'dead')
        AND NOT (status = 'over' AND updated_at > now() - ($2::int * INTERVAL '1 millisecond'))
      ORDER BY updated_at DESC LIMIT 10`,
    [user.id, RESULT_MS],
  );
  const players = await luckRows([...open.rows, ...history.rows].flatMap((r) => [r.a_user, r.b_user]));
  const today = await practiceToday(user.id);
  res.json({
    open: open.rows.map((r) => matchOf(r, players, user.id)),
    history: history.rows.map((r) => matchOf(r, players, user.id)),
    cap: { today: today.gameExp ?? 0, max: SEN_CAP_DAY },
    // Máy khách cần đúng con số này để hẹn một lần đọc lại: cửa sổ do máy chủ quyết, còn
    // đồng hồ thì phải chạy ở nơi đang hiển thị danh sách.
    result_ms: RESULT_MS,
  });
}));

// ---- Mời, nhận, thôi -------------------------------------------------------------

gamesRouter.post('/games', withAccount(async (req, res, user) => {
  res.status(201).json({ match: await inviteMatch(String(req.body?.kind ?? ''), user.id, playerId(req.body?.id)) });
}));

gamesRouter.post('/games/:id/accept', withAccount(async (req, res, user) => {
  res.json({ match: await acceptMatch(gameId(req.params.id), user.id) });
}));

gamesRouter.post('/games/:id/decline', withAccount(async (req, res, user) => {
  await ensureTempleTables();
  const gid = gameId(req.params.id);
  const done = await pool.query<GameRow>(
    `UPDATE temple_games SET status = 'dead', reason = 'declined', updated_at = now()
      WHERE id = $1 AND b_user = $2 AND status = 'invite' RETURNING *`,
    [gid, user.id],
  );
  const row = done.rows[0];
  if (!row) throw new ApiError(409, 'match_not_live', 'that invitation is no longer waiting');
  const players = await luckRows([row.a_user, row.b_user]);
  tellPeer(players, row, user.id, 'decline');
  res.json({ match: matchOf(row, players, user.id) });
}));

// Rút lui thì cả hai bên được: bên mời bỏ lời mời treo, bên đang đánh bỏ luôn trận. Không
// có phần thưởng vì trận chưa ngã ngũ.
gamesRouter.post('/games/:id/cancel', withAccount(async (req, res, user) => {
  await ensureTempleTables();
  const gid = gameId(req.params.id);
  const done = await pool.query<GameRow>(
    `UPDATE temple_games SET status = 'dead', reason = 'cancelled', updated_at = now()
      WHERE id = $1 AND (a_user = $2 OR b_user = $2) AND status IN ('invite', 'live') RETURNING *`,
    [gid, user.id],
  );
  const row = done.rows[0];
  if (!row) throw new ApiError(409, 'match_not_live', 'this match is already closed');
  const players = await luckRows([row.a_user, row.b_user]);
  tellPeer(players, row, user.id, 'cancel');
  res.json({ match: matchOf(row, players, user.id) });
}));

// ---- Nước đi ----------------------------------------------------------------------

// Toàn bộ vòng đấu nằm trong một transaction có FOR UPDATE: hai người bấm cùng giây thì
// một người đợi, và người đến sau thấy vòng đã bị đóng nên không đi dồn vào vòng cũ.
// Phần thưởng và tin báo chạy sau COMMIT — trong lock mà gọi thêm transaction khác
// (addMerit) là cửa cho deadlock.
type Turn = { row: GameRow; result: RoundResult | null; players: Map<string, GamePlayer> };

async function playTurn(gid: number, userId: string, rawMove: unknown): Promise<Turn> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query<GameRow>('SELECT * FROM temple_games WHERE id = $1 FOR UPDATE', [gid]);
    const row = found.rows[0];
    if (!row) throw new ApiError(404, 'no_such_game', 'that match is not in this temple');
    if (row.status === 'invite') throw new ApiError(409, 'match_not_live', 'your rival has not accepted the invitation yet');
    if (row.status !== 'live') throw new ApiError(409, 'match_finished', 'this match is already over');
    const side: 'a' | 'b' | null = row.a_user === userId ? 'a' : row.b_user === userId ? 'b' : null;
    if (!side) throw new ApiError(403, 'not_your_game', 'you are not in this match');
    if (row[`${side}_move`]) throw new ApiError(409, 'already_moved', 'you already threw this round');

    const players = await luckRows([row.a_user, row.b_user], client);
    const rule = RULES[row.kind];
    const mine = players.get(userId);
    if (!mine) throw new ApiError(500, 'profile_missing', 'no temple profile for this player');
    // Caro đi luân phiên nên không chung nhịp "cả hai nước rồi mới phân định" ở dưới; nó
    // có nhánh riêng trong cùng transaction, giữ nguyên lock và hai cột nước đi.
    if (row.kind === 'caro') return await caroTurn(client, gid, row, side, players, rawMove);
    const move: Move = row.kind === 'dice' ? (() => {
      const dice = roll(rule.dice);
      return { dice, bonus: mine.bonus, total: dice.reduce((a, b) => a + b, 0) + mine.bonus };
    })() : { pick: signOf(rawMove), bonus: mine.bonus };

    await client.query(`UPDATE temple_games SET ${side}_move = $2, updated_at = now() WHERE id = $1`, [gid, move]);
    const other: 'a' | 'b' = side === 'a' ? 'b' : 'a';
    const peerMove = row[`${other}_move`];
    if (!peerMove) {
      // Vòng chưa phân định: hàng chỉ khác `row` ở đúng ô nước đi vừa ghi nên bản copy
      // trong bộ nhớ là đủ, không phải đọc lại khi đang giữ lock.
      const pending: GameRow = { ...row, updated_at: new Date() };
      if (side === 'a') pending.a_move = move;
      else pending.b_move = move;
      await client.query('COMMIT');
      return { row: pending, result: null, players };
    }
    const aMove = side === 'a' ? move : peerMove;
    const bMove = side === 'b' ? move : peerMove;

    const luckA = players.get(row.a_user)?.luck ?? 0;
    const luckB = players.get(row.b_user)?.luck ?? 0;
    const winner = roundWinner(row.kind, aMove, bMove, luckA, luckB);
    const result: RoundResult = { round: row.round, a: aMove, b: bMove, winner, luck: [luckA, luckB] };
    const aScore = row.a_score + (winner === 'a' ? 1 : 0);
    const bScore = row.b_score + (winner === 'b' ? 1 : 0);
    const decided = aScore >= rule.wins || bScore >= rule.wins || row.round >= rule.maxRounds;
    const winnerUser = decided ? (aScore > bScore ? row.a_user : bScore > aScore ? row.b_user : null) : null;

    await client.query(
      `UPDATE temple_games
          SET a_score = $2, b_score = $3, round = $4, status = $5, winner = $6,
              a_move = NULL, b_move = NULL, result = $7, updated_at = now()
        WHERE id = $1`,
      [gid, aScore, bScore, decided ? row.round : row.round + 1, decided ? 'over' : 'live', winnerUser, result],
    );
    const settled = await client.query<GameRow>('SELECT * FROM temple_games WHERE id = $1', [gid]);
    await client.query('COMMIT');
    return { row: settled.rows[0], result, players };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Caro: một nước là một ô, và "ô này có hợp lệ không, hàng thắng thành chưa, tới lượt ai"
// đều do caro.ts trả lời — máy khách không có đường nào tự khai kết quả. Hai nhịp ghi khớp
// đúng hai nhịp của playTurn: nước chưa quyết định thì về không có `result`, nước ngã ngũ thì
// ghi `result` kèm năm ô thắng.
//
// Bên mời (a) mở màn và đi nước đầu của mỗi vòng, nên hai cột a_move/b_move vẫn trả lời được
// "đến lượt ai" bằng SQL cho bot, không ai phải đếm ký tự bàn cờ trong câu hỏi.
async function caroTurn(
  client: Db,
  gid: number,
  row: GameRow,
  side: CaroSide,
  players: Map<string, GamePlayer>,
  rawMove: unknown,
): Promise<Turn> {
  const cell = num(rawMove, 0, CELLS - 1, 'invalid_cell');
  if (turnOf(row.board) !== side) throw new ApiError(409, 'not_your_turn', 'caro is played one square at a time, and the inviter opens');
  if (!isEmpty(row.board, cell)) throw new ApiError(400, 'cell_taken', 'that square is already on the board');
  const board = place(row.board, cell, side);
  const move: Move = { cell, bonus: 0 };
  const luckA = players.get(row.a_user)?.luck ?? 0;
  const luckB = players.get(row.b_user)?.luck ?? 0;
  const line = winLine(board, cell);

  if (line || isFull(board)) {
    // Kết quả vẫn là một RoundResult cho đủ bộ với hai môn kia, nhưng nước của bên không
    // kịp đi trong vòng này là nước rỗng: máy khách caro vẽ theo `board` và `line`, còn
    // `a`/`b` chỉ để lịch sử không thiếu mặt bên nào.
    const blank: Move = { bonus: 0 };
    const result: RoundResult = {
      round: row.round,
      a: side === 'a' ? move : blank,
      b: side === 'b' ? move : blank,
      winner: line ? side : '',
      luck: [luckA, luckB],
      ...(line ? { line } : {}),
    };
    // Bàn đầy mà không ai đủ 5 là hòa: winner NULL, hai bên nhận phần thưởng hòa như mọi
    // trận hòa khác của sảnh.
    await client.query(
      `UPDATE temple_games
          SET a_score = $2, b_score = $3, status = 'over', winner = $4, board = $5,
              a_move = NULL, b_move = NULL, result = $6, updated_at = now()
        WHERE id = $1`,
      [
        gid,
        row.a_score + (line && side === 'a' ? 1 : 0),
        row.b_score + (line && side === 'b' ? 1 : 0),
        line ? (side === 'a' ? row.a_user : row.b_user) : null,
        board,
        result,
      ],
    );
    const settled = await client.query<GameRow>('SELECT * FROM temple_games WHERE id = $1', [gid]);
    await client.query('COMMIT');
    return { row: settled.rows[0], result, players };
  }

  // Chưa ngã ngũ: bên a để vòng dở (b còn chưa đi), bên b khép vòng và vòng mới mở lại ở a
  // — cùng nhịp reset hai cột mà playTurn vẫn dùng cho xúc xắc, chỉ khác là caro không có
  // điểm ở giữa vòng.
  if (side === 'b') {
    await client.query(
      'UPDATE temple_games SET a_move = NULL, b_move = NULL, board = $2, round = $3, updated_at = now() WHERE id = $1',
      [gid, board, row.round + 1],
    );
    await client.query('COMMIT');
    return { row: { ...row, a_move: null, b_move: null, board, round: row.round + 1, updated_at: new Date() }, result: null, players };
  }
  await client.query('UPDATE temple_games SET a_move = $2, board = $3, updated_at = now() WHERE id = $1', [gid, move, board]);
  await client.query('COMMIT');
  return { row: { ...row, a_move: move, board, updated_at: new Date() }, result: null, players };
}

// `pick` hay `cell` tùy môn, và máy khách không cần biết route thích một hay hai key:
// caro thì `pick` vắng mặt, xúc xắc thì cả hai vắng mặt.
gamesRouter.post('/games/:id/move', withAccount(async (req, res, user) => {
  res.json(await moveMatch(gameId(req.params.id), user.id, req.body?.pick ?? req.body?.cell));
}));
