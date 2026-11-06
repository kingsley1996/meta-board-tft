// Người quen của sảnh đền: đồng đội, thư riêng, tổ đội và quà cầu may.
//
// Mọi tuyến ở đây định danh người bằng player_id (số mà sảnh đang hiển thị trên
// đầu avatar), không phải uuid. Người chơi nhìn thấy cái gì thì mới chọn được bằng
// cái đó.
import { Router } from 'express';
import { pool } from '../db.ts';
import { ensureTempleProfile } from './identity.ts';
import { ApiError, cooldown, num, playerId, text, withAccount, withUser } from './http.ts';
import { addMerit, type LevelUp } from './merit.ts';
import { ensureTempleTables } from './schema.ts';
import { playerByPlayerId, templeState, toPublic, toPublicOf, type PublicPlayer, type PublicRow, type TempleState } from './state.ts';
import { notifyPlayer } from './ws.ts';

export const socialRouter = Router();

const MAX_DM = 400;

async function userIdOf(id: number, code = 'no_such_player'): Promise<string> {
  const row = await playerByPlayerId(id);
  if (!row) throw new ApiError(404, code, 'nobody in the temple carries that id');
  return row.user_id;
}

async function publicMap(userIds: string[]): Promise<Map<string, PublicPlayer>> {
  const unique = [...new Set(userIds)];
  if (!unique.length) return new Map();
  const { rows } = await pool.query<PublicRow>(
    'SELECT user_id, player_id, name, sect, title, honor, exp FROM temple_profiles WHERE user_id = ANY($1::uuid[])',
    [unique],
  );
  return new Map(rows.map((r) => [r.user_id, toPublic(r)]));
}

socialRouter.get('/friends', withUser(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const { rows } = await pool.query<{ friend_id: string; status: string }>(
    'SELECT friend_id, status FROM temple_friends WHERE user_id = $1',
    [user.id],
  );
  const accepted = rows.filter((r) => r.status === 'accepted').map((r) => r.friend_id);
  const outgoing = rows.filter((r) => r.status === 'pending').map((r) => r.friend_id);
  const incoming = await pool.query<{ user_id: string }>(
    "SELECT user_id FROM temple_friends WHERE friend_id = $1 AND status = 'pending'",
    [user.id],
  );
  const all = await publicMap([...accepted, ...outgoing, ...incoming.rows.map((r) => r.user_id)]);
  const pick = (ids: string[]) => ids.map((i) => all.get(i)).filter((p): p is PublicPlayer => !!p);
  res.json({ friends: pick(accepted), incoming: pick(incoming.rows.map((r) => r.user_id)), outgoing: pick(outgoing) });
}));

// Kết đồng đội hai chiều: một lời mời là một hàng pending từ phía mời; khi được chấp nhận
// thì ghi hai hàng accepted (đè lên pending nếu có) để đọc danh sách bằng một query.
// Phía được mời/b được nhận được báo qua socket ngay (t 'friend') thay vì phải mở lại
// sheet "Đồng đội" mà đoán.
socialRouter.post('/friends', withAccount(async (req, res, user) => {
  await ensureTempleTables();
  const id = playerId(req.body?.id);
  const action = String(req.body?.action ?? '');
  const other = await userIdOf(id);
  if (other === user.id) throw new ApiError(400, 'self_friend', 'you are already friends with yourself');

  if (action === 'add') {
    const already = await pool.query<{ status: string }>(
      'SELECT status FROM temple_friends WHERE user_id = $1 AND friend_id = $2',
      [user.id, other],
    );
    if (already.rows[0]?.status === 'accepted') throw new ApiError(409, 'already_friends', 'already friends');
    const me = toPublicOf(await ensureTempleProfile(user.id));
    // Một chiều mời không biến thành bạn bè: chỉ khi phía kia cũng đã mời mình
    // (một hàng pending ngược chiều) thì hai chiều mới được ghi accepted.
    const invited = await pool.query(
      "DELETE FROM temple_friends WHERE user_id = $2 AND friend_id = $1 AND status = 'pending' RETURNING user_id",
      [user.id, other],
    );
    if (invited.rowCount) {
      await pool.query(
        "INSERT INTO temple_friends (user_id, friend_id, status) VALUES ($1, $2, 'accepted'), ($2, $1, 'accepted') ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'accepted'",
        [user.id, other],
      );
      notifyPlayer(id, { t: 'friend', kind: 'accept', by: me });
      res.json({ accepted: true, player: await publicOne(other) });
      return;
    }
    await pool.query(
      "INSERT INTO temple_friends (user_id, friend_id, status) VALUES ($1, $2, 'pending') ON CONFLICT (user_id, friend_id) DO NOTHING",
      [user.id, other],
    );
    notifyPlayer(id, { t: 'friend', kind: 'request', by: me });
    res.json({ accepted: false, player: await publicOne(other) });
    return;
  }

  if (action === 'accept') {
    res.json({ accepted: true, player: await acceptFriend(user.id, id) });
    return;
  }

  if (action === 'decline' || action === 'remove') {
    await pool.query('DELETE FROM temple_friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)', [
      user.id,
      other,
    ]);
    res.json({ removed: true });
    return;
  }
  throw new ApiError(400, 'unknown_action', 'add | accept | decline | remove');
}));

// Hộp thư: một hàng cho mỗi tin, đọc theo chuỗi giữa hai người. Không có hàng
// "thread" riêng vì trạng thái đã đọc nằm trên từng tin.
//
// MAX(at) để nguyên kiểu timestamp rồi đổi sang ISO ở đây: ::text của Postgres ra
// "2026-11-05 10:10:21.508+00" (dấu cách, không có T), và new Date(...) của máy khách
// đọc chuỗi đó theo giờ máy — ngày cuối cùng của cuộc hội thoại lệch mất một buổi.
socialRouter.get('/dms', withUser(async (req, res, user) => {
  await ensureTempleTables();
  const { rows } = await pool.query<{ peer: string; last: Date; unseen: string }>(
    `SELECT peer, MAX(at) AS last, COUNT(*) FILTER (WHERE NOT mine AND unseen)::text AS unseen
       FROM (
         SELECT CASE WHEN from_user = $1 THEN to_user ELSE from_user END AS peer,
                created_at AS at,
                from_user = $1 AS mine,
                seen_at IS NULL AND from_user <> $1 AS unseen
           FROM temple_dms WHERE from_user = $1 OR to_user = $1
       ) t
      GROUP BY peer
      ORDER BY MAX(at) DESC
      LIMIT 40`,
    [user.id],
  );
  const all = await publicMap(rows.map((r) => r.peer));
  res.json({
    threads: rows
      .map((r) => {
        const player = all.get(r.peer);
        return player ? { player, last: r.last.toISOString(), unseen: Number(r.unseen) } : null;
      })
      .filter((t): t is { player: PublicPlayer; last: string; unseen: number } => !!t),
  });
}));

socialRouter.get('/dms/:id', withUser(async (req, res, user) => {
  await ensureTempleTables();
  const id = playerId(req.params.id);
  const other = await userIdOf(id);
  const { rows } = await pool.query<{ from_user: string; to_user: string; text: string; created_at: Date }>(
    `SELECT from_user, to_user, text, created_at FROM temple_dms
      WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1)
      ORDER BY created_at ASC LIMIT 200`,
    [user.id, other],
  );
  await pool.query('UPDATE temple_dms SET seen_at = now() WHERE from_user = $2 AND to_user = $1 AND seen_at IS NULL', [user.id, other]);
  res.json({
    player: await publicOne(other),
    messages: rows.map((r) => ({ mine: r.from_user === user.id, text: r.text, at: r.created_at.toISOString() })),
  });
}));

socialRouter.post('/dms', withAccount(async (req, res, user) => {
  await ensureTempleTables();
  const id = playerId(req.body?.id);
  const other = await userIdOf(id);
  const message = text(req.body?.text, MAX_DM, 'invalid_message');
  const me = toPublicOf(await ensureTempleProfile(user.id));
  await pool.query('INSERT INTO temple_dms (from_user, to_user, text) VALUES ($1, $2, $3)', [user.id, other, message]);
  notifyPlayer(id, { t: 'dm', by: me, text: message });
  res.json({ sent: true });
}));

// Tổ đội (bản gốc là nhóm đồng tu): tự đặt tên, lấy mã mời mà vào, giới hạn thành
// viên theo cột max_members của hàng nhóm — mặc định 8, đúng sĩ số một lobby TFT.
socialRouter.get('/group', withUser(async (req, res, user) => {
  await ensureTempleTables();
  const mine = await pool.query<{ group_id: string }>('SELECT group_id FROM temple_group_members WHERE user_id = $1 LIMIT 1', [user.id]);
  if (!mine.rows.length) {
    res.json({ group: null });
    return;
  }
  const groupId = Number(mine.rows[0].group_id);
  res.json({ group: await readGroup(groupId, user.id) });
}));

socialRouter.post('/group', withAccount(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const name = text(req.body?.name, 40, 'invalid_group_name');
  if ([...name].length < 2) throw new ApiError(400, 'invalid_group_name', 'a name needs at least two characters');
  const joined = await pool.query('SELECT group_id FROM temple_group_members WHERE user_id = $1', [user.id]);
  if (joined.rows.length) throw new ApiError(409, 'already_in_a_group', 'leave the current group first');
  const created = await pool.query<{ id: string; code: string }>(
    `INSERT INTO temple_groups (name, code, owner_id) VALUES ($1, $2, $3) RETURNING id, code`,
    [name, inviteCode(), user.id],
  );
  await pool.query('INSERT INTO temple_group_members (group_id, user_id) VALUES ($1, $2)', [created.rows[0].id, user.id]);
  res.status(201).json({ group: await readGroup(Number(created.rows[0].id), user.id) });
}));

socialRouter.post('/group/join', withAccount(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const code = String(req.body?.code ?? '').trim().toUpperCase();
  const group = await pool.query<{ id: string; max_members: number }>('SELECT id, max_members FROM temple_groups WHERE code = $1', [
    code,
  ]);
  const target = group.rows[0];
  if (!target) throw new ApiError(404, 'no_such_group', 'that invite code opens no group');
  const already = await pool.query('SELECT 1 FROM temple_group_members WHERE group_id = $1', [target.id]);
  if ((already.rowCount ?? 0) >= target.max_members) throw new ApiError(409, 'group_full', 'this group is already at capacity');
  const mine = await pool.query('SELECT group_id FROM temple_group_members WHERE user_id = $1', [user.id]);
  if (mine.rows.length) throw new ApiError(409, 'already_in_a_group', 'you are already in a group');
  await pool.query('INSERT INTO temple_group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [target.id, user.id]);
  res.json({ group: await readGroup(Number(target.id), user.id) });
}));

socialRouter.post('/group/leave', withAccount(async (req, res, user) => {
  await ensureTempleTables();
  await pool.query('DELETE FROM temple_group_members WHERE user_id = $1', [user.id]);
  res.json({ left: true });
}));

// Bảng tin của tổ đội. Điểm chung của đội thì đọc từ temple_practice của từng
// thành viên (xem readGroup), không có cột "total" cho ai đó ghi đè.
socialRouter.post('/group/message', withAccount(async (req, res, user) => {
  await ensureTempleTables();
  await ensureTempleProfile(user.id);
  const mine = await pool.query<{ group_id: string }>('SELECT group_id FROM temple_group_members WHERE user_id = $1', [user.id]);
  if (!mine.rows.length) throw new ApiError(409, 'no_group', 'join a group first');
  const message = text(req.body?.text, MAX_DM, 'invalid_message');
  await pool.query('INSERT INTO temple_group_messages (group_id, user_id, text) VALUES ($1, $2, $3)', [mine.rows[0].group_id, user.id, message]);
  res.json({ sent: true });
}));

// Quà cầu may: một lá bùa hoặc một lời chúc gửi cho một người. Người nhận cộng điểm
// khi *mở*, nên tuyến này trả về phần thưởng thay vì âm thầm ghi điểm.
socialRouter.get('/greetings', withUser(async (req, res, user) => {
  await ensureTempleTables();
  const { rows } = await pool.query<{ id: string; from_user: string; kind: string; text: string; gift_sen: number; seen_at: Date | null; created_at: Date }>(
    `SELECT id, from_user, kind, text, gift_sen, seen_at, created_at FROM temple_greetings
      WHERE to_user = $1 ORDER BY created_at DESC LIMIT 60`,
    [user.id],
  );
  const senders = await publicMap(rows.map((r) => r.from_user));
  res.json({
    rows: rows.map((r) => ({
      id: Number(r.id),
      from: senders.get(r.from_user) ?? null,
      kind: r.kind,
      text: r.text,
      gift_sen: r.gift_sen,
      seen: !!r.seen_at,
      at: r.created_at.toISOString(),
    })),
  });
}));

// ---- Lối đi chung cho máy khách và bot -------------------------------------------
//
// Vì sao bot (bots.ts) gọi thẳng hai hàm dưới đây thay vì POST qua HTTP: tuyến ghi nào
// cũng đứng sau withAccount, mà khách thì bị chặn cố ý (http.ts:50). Bot không phải
// người dùng đăng ký — nó là một chỗ ngồi trong chánh điện — nên đường đúng là dùng
// lại chính phần ghi, không phải cấp cho nó một mật khẩu giả.
// Hai hàm dưới đây trả về *đúng* nội dung một response tuyến ghi, nên route chỉ còn là
// `res.json(await ...)`: phần thân cũ không đổi một byte nào, và bot nhận cùng bộ số
// (state, gained, level_ups) mà HUD đang đọc.
export type SendGreetingResult = { state: TempleState; gained: number; level_ups: LevelUp[] };

// Chấp nhận một lời kết bạn đang chờ. Bot (bots.ts) gọi hàm này khi một người thật gửi
// lời mời tới một chỗ ngồi trong đền: không có nó thì lời mời nằm pending mãi, và người
// mời thấy một đồng đội không bao giờ trả lời.
export async function acceptFriend(userId: string, otherPlayerId: number): Promise<PublicPlayer> {
  await ensureTempleTables();
  const id = playerId(otherPlayerId);
  const other = await userIdOf(id);
  if (other === userId) throw new ApiError(400, 'self_friend', 'you are already friends with yourself');
  const invited = await pool.query(
    "DELETE FROM temple_friends WHERE user_id = $2 AND friend_id = $1 AND status = 'pending' RETURNING user_id",
    [userId, other],
  );
  if (!invited.rowCount) throw new ApiError(409, 'no_invitation', 'that person has not asked to be friends');
  await pool.query(
    "INSERT INTO temple_friends (user_id, friend_id, status) VALUES ($1, $2, 'accepted'), ($2, $1, 'accepted') ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'accepted'",
    [userId, other],
  );
  notifyPlayer(id, { t: 'friend', kind: 'accept', by: toPublicOf(await ensureTempleProfile(userId)) });
  return publicOne(other);
}

export async function sendGreeting(
  fromUserId: string,
  toPlayerId: number,
  kindRaw: unknown,
  textRaw: unknown,
  giftRaw: unknown,
): Promise<SendGreetingResult> {
  await ensureTempleTables();
  const me = toPublicOf(await ensureTempleProfile(fromUserId));
  const id = playerId(toPlayerId);
  const other = await userIdOf(id);
  const kind = String(kindRaw ?? 'chuc');
  if (kind !== 'huong' && kind !== 'chuc') throw new ApiError(400, 'invalid_kind', 'kind must be huong or chuc');
  const wish = textRaw ? text(textRaw, 120, 'invalid_wish') : '';
  const gift = num(giftRaw ?? 0, 0, 10_000, 'invalid_gift');
  // Một lời chúc = 10 điểm, nên nhịp cũng phải do server giữ như mọi nhịp cầu may.
  cooldown(`${fromUserId}:greeting`, 3_000);
  if (gift) {
    const spent = await pool.query('UPDATE temple_profiles SET sen = sen - $2 WHERE user_id = $1 AND sen >= $2 RETURNING sen', [
      fromUserId,
      gift,
    ]);
    if (!spent.rowCount) throw new ApiError(409, 'not_enough_sen', 'not enough Sen in the wallet');
    await pool.query('UPDATE temple_profiles SET sen = sen + $2 WHERE user_id = $1', [other, gift]);
  }
  await pool.query('INSERT INTO temple_greetings (from_user, to_user, kind, text, gift_sen) VALUES ($1, $2, $3, $4, $5)', [
    fromUserId,
    other,
    kind,
    wish,
    gift,
  ]);
  // Người nhận phải thấy món quà tới tay ngay, không phải mở bảng "Đồng đội" mà đoán.
  notifyPlayer(id, { t: 'gift', kind, by: me, text: wish, gift_sen: gift });
  const merit = await addMerit(fromUserId, { exp: 10 });
  return { state: await templeState(fromUserId), gained: merit.gained, level_ups: merit.levelUps };
}

// Mở một món quà tới tay: cùng một hàng chỉ mở được một lần vì UPDATE có điều kiện
// `seen_at IS NULL`, nên người bấm hai lần chỉ nhận thưởng một lần.
export type OpenGreetingResult = {
  state: TempleState;
  gained: number;
  level_ups: LevelUp[];
  from: PublicPlayer;
  gift_sen: number;
};

export async function openGreeting(greetingId: number, userId: string): Promise<OpenGreetingResult> {
  await ensureTempleTables();
  const id = playerId(greetingId, 'invalid_greeting_id');
  const opened = await pool.query<{ from_user: string; gift_sen: number }>(
    'UPDATE temple_greetings SET seen_at = now() WHERE id = $1 AND to_user = $2 AND seen_at IS NULL RETURNING from_user, gift_sen',
    [id, userId],
  );
  const row = opened.rows[0];
  if (!row) throw new ApiError(404, 'greeting_not_found', 'nothing to open here');
  const merit = await addMerit(userId, { exp: 5, sen: 5 });
  return {
    state: await templeState(userId),
    gained: merit.gained,
    level_ups: merit.levelUps,
    from: await publicOne(row.from_user),
    gift_sen: row.gift_sen,
  };
}

socialRouter.post('/greetings', withAccount(async (req, res, user) => {
  res.json(await sendGreeting(user.id, playerId(req.body?.id), req.body?.kind, req.body?.text, req.body?.gift_sen));
}));

socialRouter.post('/greetings/:id/open', withUser(async (req, res, user) => {
  res.json(await openGreeting(playerId(req.params.id), user.id));
}));

// ---- helpers ------------------------------------------------------------------

async function publicOne(userId: string): Promise<PublicPlayer> {
  const { rows } = await pool.query(
    'SELECT user_id, player_id, name, sect, title, honor, exp FROM temple_profiles WHERE user_id = $1',
    [userId],
  );
  if (!rows.length) throw new ApiError(404, 'no_such_player', 'nobody in the temple carries that id');
  return toPublic(rows[0]);
}

async function readGroup(groupId: number, userId: string) {
  const group = await pool.query<{ id: string; name: string; code: string; owner_id: string; max_members: number; goal: number }>(
    'SELECT id, name, code, owner_id, max_members, goal FROM temple_groups WHERE id = $1',
    [groupId],
  );
  const head = group.rows[0];
  if (!head) return null;
  const members = await pool.query<{ user_id: string }>('SELECT user_id FROM temple_group_members WHERE group_id = $1 ORDER BY joined_at', [
    groupId,
  ]);
  const merit = await pool.query<{ score: number }>(
    `SELECT COALESCE(SUM(p.exp), 0)::int AS score
       FROM temple_practice p WHERE p.user_id = ANY($1::uuid[])`,
    [members.rows.map((m) => m.user_id)],
  );
  const messages = await pool.query<{ user_id: string; text: string; created_at: Date }>(
    'SELECT user_id, text, created_at FROM temple_group_messages WHERE group_id = $1 ORDER BY created_at DESC LIMIT 40',
    [groupId],
  );
  const people = await publicMap(members.rows.map((m) => m.user_id));
  return {
    id: Number(head.id),
    name: head.name,
    // Mã mời chỉ lộ cho người trong nhóm; ngoài nhóm thì không có gì để lộ.
    code: head.code,
    owner: head.owner_id === userId,
    max_members: head.max_members,
    goal: head.goal,
    merit: merit.rows[0]?.score ?? 0,
    members: [...people.values()],
    messages: messages.rows
      .map((m) => ({ by: people.get(m.user_id) ?? null, text: m.text, at: m.created_at.toISOString() }))
      .reverse(),
  };
}

function inviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
