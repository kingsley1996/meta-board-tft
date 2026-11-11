// Sảnh chờ "Tìm Bạn Chơi": bảng những người đang treo Riot ID của mình lên để ai đó
// chép lấy mà mời vào trận ngoài Liên Minh.
//
// Ba quyết định định hình file này:
//
// MỘT: không có nút "Mời" trong đền. Đền không có client Liên Minh, nên mọi lời mời
// tự dựng đều là một cú click hứa hẹn điều máy chủ không làm được. thứ máy khách cần là
// đúng một dòng chữ để copy, vì vậy tuyến này chỉ có danh sách + copy + phiếu xác nhận.
//
// HAI: vào sảnh chờ KHÔNG cần (và không tự bật) cờ `riot_public`. Cờ đó là "lộ Riot ID
// ở mọi nơi trong đền"; sảnh chờ là một chỗ *hẹp* mà người chơi chủ động bước vào rồi
// chủ động bước ra, nên danh sách đọc thẳng hai cột riot_game_name/riot_tagline.
// Ai không nhập Riot ID thì chưa vào được — 400 `needs_riot_id`.
//
// BA: hàng trong danh sách phải tồn tại mà không cần ai dọn. Tuổi thọ của nó là phép
// so với `now()` trong SQL, còn sự có mặt là hỏi phòng (ws.ts:onlinePlayerIds) — hai
// điều kiện đó cắt nhau ngay lúc một tab đóng, nên không có cron, không có job, không
// có hàng rớt mạng nằm lại trên bảng.
import { Router } from 'express';
import { formatRiotId } from '../accounts.ts';
import { pool } from '../db.ts';
import { ensureTempleProfile, levelFromExp, LOBBY_TTL_MS } from './identity.ts';
import { ApiError, cooldown, playerId, withAccount, withUser } from './http.ts';
import { ensureTempleTables } from './schema.ts';
import { playerByPlayerId } from './state.ts';
import { announceProfile, onlinePlayerIds } from './ws.ts';

export const lobbyRouter = Router();

// Một bàn cờ chỉ có 8 ghế, nhưng người ta mở sheet để *lướt tìm* bạn, nên cho thấy
// nhiều hơn sĩ số một trận. Hàng cũ nhất rơi xuống đáy vì danh sách xếp theo giờ vào.
const LIST_LIMIT = 60;

// Phút, không phải mili giây: cột mốc nằm trong SQL nên con số phải đi vừa một
// `INTERVAL '1 minute' * $n`. LOBBY_TTL_MS là nguồn duy nhất (identity.ts) — chỗ này
// và chỗ kia mà đổi lệch nhau thì badge trên đầu avatar sống lâu hơn hàng của nó.
const TTL_MINUTES = Math.round(LOBBY_TTL_MS / 60_000);

export type LobbyRow = {
  id: number;
  name: string;
  level: number;
  // Luôn có mặt: JOIN trong SQL lọc những hàng thiếu một trong hai cột, nên không ai
  // đọc danh sách rồi mới phải đoán "dòng này copy đi đâu".
  riot: string;
  at: string;
  up: number;
  down: number;
  // Phiếu của chính người đang xem: 1 / -1 / 0 (chưa bỏ). Máy khách tô đúng cái nút
  // họ đã bấm, khỏi giữ trạng thái riêng dễ lệch với server.
  vote: number;
};

type LobbySqlRow = {
  user_id: string;
  player_id: string;
  name: string;
  exp: number;
  lobby_at: Date;
  riot_game_name: string | null;
  riot_tagline: string | null;
  up: number;
  down: number;
  vote: number;
};
async function listRows(userId: string): Promise<LobbyRow[]> {
  const online = onlinePlayerIds();
  // Không có ai trong chánh điện thì khỏi hỏi database. `= ANY('{}'::bigint[])` cho ra
  // cùng một kết quả rỗng, nhưng một phép thử JS rẻ hơn một vòng query.
  if (!online.length) return [];
  const { rows } = await pool.query<LobbySqlRow>(
    `SELECT p.user_id, p.player_id, p.name, p.exp, p.lobby_at,
            u.riot_game_name, u.riot_tagline,
            COALESCE(v.up, 0)::int AS up, COALESCE(v.down, 0)::int AS down,
            COALESCE(mv.value, 0)::int AS vote
       FROM temple_profiles p
       JOIN users u
         ON u.id = p.user_id AND u.riot_game_name IS NOT NULL AND u.riot_tagline IS NOT NULL
       LEFT JOIN (
         SELECT to_user,
                COUNT(*) FILTER (WHERE value = 1) AS up,
                COUNT(*) FILTER (WHERE value = -1) AS down
           FROM temple_lobby_votes
          GROUP BY to_user
       ) v ON v.to_user = p.user_id
       LEFT JOIN temple_lobby_votes mv ON mv.to_user = p.user_id AND mv.from_user = $3
      WHERE p.lobby_at > now() - ($2::int * INTERVAL '1 minute')
        AND p.player_id = ANY($1::bigint[])
      ORDER BY p.lobby_at DESC
      LIMIT ${LIST_LIMIT}`,
    [online, TTL_MINUTES, userId],
  );
  return rows.flatMap((r) => {
    const riot = formatRiotId(r);
    if (!riot) return [];
    return [
      {
        id: Number(r.player_id),
        name: r.name,
        level: levelFromExp(r.exp).level,
        riot,
        at: r.lobby_at.toISOString(),
        up: r.up,
        down: r.down,
        vote: r.vote,
      },
    ];
  });
}

// Tuyến đọc đi bằng withUser, không phải withAccount: khách chưa vào sảnh được nhưng
// vẫn có quyền *nhìn* xem trong đó có ai — cùng phép với mọi danh sách đọc khác trong
// đền (http.ts:49). Phần thân trả rỗng chứ không 403 để HUD vẽ nguyên một tấm CTA.
lobbyRouter.get('/lobby', withUser(async (req, res, user) => {
  await ensureTempleTables();
  if (user.isGuest) {
    res.json({ riot: null, in: false, rows: [] });
    return;
  }
  const [profile, account] = await Promise.all([
    ensureTempleProfile(user.id),
    pool.query<{ riot_game_name: string | null; riot_tagline: string | null }>(
      'SELECT riot_game_name, riot_tagline FROM users WHERE id = $1',
      [user.id],
    ),
  ]);
  const rows = await listRows(user.id);
  res.json({
    riot: formatRiotId(account.rows[0] ?? {}),
    // "Đang ở sảnh chờ" là *có mặt trong danh sách này*, không phải cột lobby_at còn
    // sống: hai nghĩa lệch nhau đúng vào lúc người chơi rớt mạng, và lúc đó cái máy
    // khách cần biết là danh sách nghĩ gì.
    in: rows.some((r) => r.id === profile.playerId),
    rows,
  });
}));

// Ghi mốc rồi báo cho chánh điện: badge trên đầu avatar người đó mọc lên ở cùng một
// nhịp, nên không ai phải mở bảng "Tìm Bạn Chơi" mới thấy ai đang tìm.
lobbyRouter.post('/lobby', withAccount(async (req, res, user) => {
  await ensureTempleTables();
  const account = await pool.query<{ riot_game_name: string | null; riot_tagline: string | null }>(
    'SELECT riot_game_name, riot_tagline FROM users WHERE id = $1',
    [user.id],
  );
  if (!formatRiotId(account.rows[0] ?? {})) {
    throw new ApiError(400, 'needs_riot_id', 'save a Riot ID before joining the lobby');
  }
  // Nhịp do server giữ: vào/ra liên tục thì mỗi lần là một lần broadcast tới cả phòng.
  cooldown(`${user.id}:lobby`, 1_000);
  const profile = await ensureTempleProfile(user.id);
  await pool.query('UPDATE temple_profiles SET lobby_at = now() WHERE user_id = $1', [user.id]);
  await announceProfile(user.id);
  const rows = await listRows(user.id);
  // `in` cũng do danh sách quyết, như ở tuyến đọc: bấm "Vào" trong lúc socket đang nối
  // lại thì người chơi chưa hiện ra trước mắt ai, và một cái nút chuyển thành "Rời"
  // lúc đó là máy chủ tự contradicts chính cái bảng nó vừa vẽ.
  res.json({ in: rows.some((r) => r.id === profile.playerId), rows });
}));

lobbyRouter.delete('/lobby', withAccount(async (req, res, user) => {
  await ensureTempleTables();
  cooldown(`${user.id}:lobby`, 1_000);
  const profile = await ensureTempleProfile(user.id);
  await pool.query('UPDATE temple_profiles SET lobby_at = NULL WHERE user_id = $1', [user.id]);
  await announceProfile(user.id);
  const rows = await listRows(user.id);
  res.json({ in: rows.some((r) => r.id === profile.playerId), rows });
}));

// "Đã chơi cùng người này" — phiếu của một người cho một người, một lần duy nhất.
// Bấm lại đúng nút cũ là XOÁ hàng chứ không ghi value = 0: "chưa bỏ phiếu" chỉ có một
// cách biểu diễn nên không ai đếm nhầm một phiếu huỷ thành một phiếu trừ.
//
// Điều kiện bỏ phiếu là người đó *có thật trong đền*, không phải còn đang ở sảnh chờ.
// Người ta xác nhận một trận vừa đánh, và trận đó có thể kết thúc sau khi cả hai đã
// rời bảng; giữ quyền bầu tới lúc hàng biến mất thì đúng ra là giữ tới lúc tiến trình
// này khởi động lại.
lobbyRouter.post('/lobby/vote', withAccount(async (req, res, user) => {
  await ensureTempleTables();
  const id = playerId(req.body?.id);
  const raw = Number(req.body?.value);
  if (raw !== 1 && raw !== -1) throw new ApiError(400, 'invalid_vote', 'value must be 1 or -1');
  const other = await playerByPlayerId(id);
  if (!other) throw new ApiError(404, 'no_such_player', 'nobody in the temple carries that id');
  if (other.user_id === user.id) throw new ApiError(400, 'self_vote', 'you cannot vote for yourself');
  cooldown(`${user.id}:lobbyvote`, 1_000);

  const mine = await pool.query<{ value: number }>(
    'SELECT value FROM temple_lobby_votes WHERE from_user = $1 AND to_user = $2',
    [user.id, other.user_id],
  );
  if (mine.rows[0]?.value === raw) {
    await pool.query('DELETE FROM temple_lobby_votes WHERE from_user = $1 AND to_user = $2', [user.id, other.user_id]);
  } else {
    await pool.query(
      `INSERT INTO temple_lobby_votes (from_user, to_user, value) VALUES ($1, $2, $3)
       ON CONFLICT (from_user, to_user) DO UPDATE SET value = EXCLUDED.value`,
      [user.id, other.user_id, raw],
    );
  }
  // Trả cả danh sách thay vì hai con số của một hàng: máy khách đổi lại đúng mảng nó
  // đang giữ, nên số phiếu của *người khác* trong bảng cũng tươi theo mà không cần
  // thêm một request nào.
  res.json({ rows: await listRows(user.id) });
}));
