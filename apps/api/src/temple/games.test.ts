// Gate cho tuyến tỷ thí: hai người thật đánh nhau, và Độ May nằm trong kết quả.
//
// Vì sao chạy qua HTTP thật: trò chơi chỉ có nghĩa khi hai máy khách nhìn thấy cùng một
// trận. Những gì dễ hỏng ở tầng này là "ai được tự khai điểm", "một vòng được trả công
// mấy lần", "đòn oẳn tù tì có lộ sang bên kia trước khi phân định không" — cả ba chỉ lộ
// ra khi có hai request đi qua nẹp phiên và đè nhau lên cùng một hàng.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import type { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../../.env'));
  } catch {
    // Không có .env thì bỏ qua cả file, theo đúng thông lệ của repo.
  }
}
const hasDb = Boolean(process.env.DATABASE_URL);

type Json = Record<string, any>;
type Side = { cookie: string; user: string; me: Json };
type Settled = { json: Json; actor: Side };

test(
  'temple duels keep the dice, the signs and the luck on the server',
  { skip: !hasDb, concurrency: false, timeout: 240_000 },
  async () => {
    const pool: Pool = (await import('../db.ts')).pool;
    const identity = await import('./identity.ts');
    const { templeRouter } = await import('./routes.ts');

    const app = express();
    app.use(express.json());
    app.use('/api/temple', templeRouter);
    const server: Server = app.listen(0);
    await new Promise((res) => server.once('listening', res));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

    const users: string[] = [];
    const send = async (path: string, opts: { cookie?: string; method?: string; body?: unknown } = {}) => {
      const res = await fetch(`${base}${path}`, {
        method: opts.method ?? 'GET',
        headers: {
          ...(opts.cookie ? { cookie: opts.cookie } : {}),
          ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });
      const status = res.status;
      let json: Json = {};
      try {
        json = (await res.json()) as Json;
      } catch {
        // thân rỗng thì giữ {}, để assert trên .code tự fail thay vì ném lỗi parse.
      }
      return { status, json, code: json.code as string | undefined };
    };
    const get = (path: string, cookie: string) => send(path, { cookie });
    const post = (path: string, body: unknown, cookie: string) => send(path, { cookie, method: 'POST', body });
    const put = (path: string, body: unknown, cookie: string) => send(path, { cookie, method: 'PUT', body });

    async function newUser(name: string): Promise<Side> {
      const guest = await identity.createGuest();
      users.push(guest.user.id);
      const cookie = `mb_session=${guest.token}`;
      // Tỷ thí là việc của tài khoản: hàng users phải bỏ cờ is_guest trước khi mời ai.
      await pool.query('UPDATE users SET is_guest = false, email = $2 WHERE id = $1', [guest.user.id, `duel-${guest.user.id}@example.com`]);
      await put('/api/temple/profile', { name }, cookie);
      return { cookie, user: guest.user.id, me: (await get('/api/temple/state', cookie)).json.state };
    }

    async function newGuest(): Promise<Side> {
      const guest = await identity.createGuest();
      users.push(guest.user.id);
      const cookie = `mb_session=${guest.token}`;
      return { cookie, user: guest.user.id, me: (await get('/api/temple/state', cookie)).json.state };
    }

    // Mời qua HTTP thì vướng nhịp 5 giây chống spam, còn kịch bản bên dưới cần nhiều trận
    // trong một nhịp: mọc hàng qua SQL đúng bằng cái POST /games vẫn ghi.
    async function seedMatch(kind: 'dice' | 'rps', a: Side, b: Side, status: 'invite' | 'live' = 'invite'): Promise<number> {
      const { rows } = await pool.query<{ id: string }>(
        'INSERT INTO temple_games (kind, a_user, b_user, status) VALUES ($1, $2, $3, $4) RETURNING id',
        [kind, a.user, b.user, status],
      );
      return Number(rows[0].id);
    }

    // Độ May đọc từ exp + chuỗi ngày + điểm hôm nay + bùa, nên muốn có một con số chắc
    // chắn thì ghi đúng bốn thứ đó, đừng trông chờ vào gì các bước trước để lại.
    async function fortune(sides: Side[], opt: { exp: number; streak?: number; today?: number; charm?: boolean }) {
      const ids = sides.map((s) => s.user);
      const { exp, streak = 0, today = 0, charm = false } = opt;
      await pool.query('DELETE FROM temple_practice WHERE user_id = ANY($1::uuid[])', [ids]);
      await pool.query(
        `UPDATE temple_profiles
            SET exp = $2, streak = $3, best_streak = GREATEST(best_streak, $3), buff_until = $4
          WHERE user_id = ANY($1::uuid[])`,
        [ids, exp, streak, charm ? new Date(Date.now() + 5 * 60_000) : null],
      );
      if (today) {
        await pool.query("INSERT INTO temple_practice (user_id, day, exp) SELECT u, (now() + INTERVAL '7 hours')::date, $2 FROM unnest($1::uuid[]) AS u", [ids, today]);
      }
    }

    const openOf = async (side: Side, id: number): Promise<Json> => {
      const body = (await get('/api/temple/games', side.cookie)).json;
      const match = [...body.open, ...body.history].find((m: Json) => m.id === id);
      assert.ok(match, `match ${id} is in the list`);
      return match;
    };

    const expOf = async (side: Side) => (await get('/api/temple/state', side.cookie)).json.state.exp as number;
    const sum = (dice: number[]) => dice.reduce((a, b) => a + b, 0);

    // Đánh cho tới khi ngã ngũ. Bên đã đi trong vòng này thì được bỏ qua — máy khách thật
    // cũng chỉ còn cách chờ, bấm lại là 409 chứ không đi tiếp.
    async function playToOver(id: number, sides: Side[], picks: [string, string] = ['', '']): Promise<Settled> {
      for (let guard = 0; guard < 12; guard += 1) {
        const settled: Settled[] = [];
        for (const [i, side] of sides.entries()) {
          const pick = picks[i];
          const r = await post(`/api/temple/games/${id}/move`, pick ? { pick } : {}, side.cookie);
          if (r.code === 'already_moved') continue;
          assert.equal(r.status, 200, `a legal throw is not rejected (${r.code})`);
          if (r.json.result) settled.push({ json: r.json, actor: side });
        }
        assert.ok(settled.length <= 1, 'one round is settled by exactly one request');
        if (settled[0]?.json.over) return settled[0];
        assert.ok(settled[0], 'a round needs both throws');
      }
      throw new Error('the match never ended');
    }

    try {
      const A = await newUser('Đấu Thủ Một');
      const B = await newUser('Đấu Thủ Hai');
      const C = await newUser('Đấu Thủ Ba');
      const D = await newUser('Đấu Thủ Bốn');
      const g = await newGuest();

      // ---- Cửa khách: đọc được, mời không -----------------------------------------
      const guestRead = await get('/api/temple/games', g.cookie);
      assert.equal(guestRead.status, 200, 'a guest may look at the board');
      assert.ok(Array.isArray(guestRead.json.open) && Array.isArray(guestRead.json.history));
      const guestAsk = await post('/api/temple/games', { kind: 'dice', id: B.me.id }, g.cookie);
      assert.equal(guestAsk.status, 403, 'a guest cannot open a match');
      assert.equal(guestAsk.code, 'guest_account_required');

      // ---- Lời mời ---------------------------------------------------------------
      assert.equal((await post('/api/temple/games', { kind: 'chess', id: B.me.id }, A.cookie)).code, 'invalid_game');
      assert.equal((await post('/api/temple/games', { kind: 'dice', id: A.me.id }, A.cookie)).code, 'self_game');
      assert.equal((await post('/api/temple/games', { kind: 'dice', id: 4_294_967_294 }, A.cookie)).status, 404);
      assert.equal((await post('/api/temple/games/999999/accept', {}, A.cookie)).code, 'no_such_game');
      assert.equal((await post('/api/temple/games/abc/move', {}, A.cookie)).code, 'invalid_game_id');

      const invite = await post('/api/temple/games', { kind: 'dice', id: B.me.id }, A.cookie);
      assert.equal(invite.status, 201);
      const m1: Json = invite.json.match;
      assert.equal(m1.status, 'invite');
      assert.equal(m1.a.player.id, A.me.id, 'the inviter is side a');
      assert.equal(m1.b.player.id, B.me.id);
      assert.equal(m1.wins_needed, 1, 'a dice match is one round to the winner');
      assert.equal(m1.max_rounds, 3, 'and three rounds of ceiling for the ties');
      assert.equal(m1.a.player.luck, 27, 'a fresh practitioner: 20 for showing up, 3 for bậc 1, 4 for the day-one streak');
      assert.equal(m1.a.player.bonus, 1, 'the lowest lộc, and the only edge a newcomer gets');

      // Một cặp không có hai ván; lời mời trùng bị chặn TRƯỚC nhịp chống spam, còn mời
      // người khác thì ăn 429 — cả hai cửa đều phải đóng.
      const again = await post('/api/temple/games', { kind: 'dice', id: B.me.id }, A.cookie);
      assert.equal(again.status, 409, 'the pair already has a match');
      assert.equal(again.code, 'already_open');
      const spam = await post('/api/temple/games', { kind: 'rps', id: C.me.id }, A.cookie);
      assert.equal(spam.status, 429, 'a loop of invites to other people is throttled');
      assert.equal(spam.code, 'too_fast');

      // ---- Nhận lời mời ----------------------------------------------------------
      const early = await post(`/api/temple/games/${m1.id}/move`, {}, A.cookie);
      assert.equal(early.status, 409, 'nobody throws before the rival says yes');
      assert.equal(early.code, 'match_not_live');
      assert.equal((await post(`/api/temple/games/${m1.id}/accept`, {}, C.cookie)).code, 'not_your_game', 'a stranger cannot take the invitation');
      assert.equal((await post(`/api/temple/games/${m1.id}/accept`, {}, A.cookie)).code, 'not_your_game', 'not even the one who sent it');
      const accept = await post(`/api/temple/games/${m1.id}/accept`, {}, B.cookie);
      assert.equal(accept.json.match.status, 'live');
      assert.equal((await post(`/api/temple/games/${m1.id}/accept`, {}, B.cookie)).code, 'match_not_live', 'the seat is taken once');

      // ---- Độ May: bốn cột đó, và nó đi vào tổng xúc xắc ---------------------------
      const m0 = await seedMatch('dice', A, D, 'live');
      await fortune([A], { exp: 33000, streak: 12, today: 600 });
      const rich = await openOf(A, m0);
      assert.equal(rich.a.player.luck, 90, 'vận đỉnh + chuỗi dài + một ngày bận');
      assert.equal(rich.a.player.bonus, 4, 'bốn lộc trên tổng 3..18 — phần nhiều vẫn do xúc xắc quyết');
      await fortune([A], { exp: 20, charm: true });
      assert.equal((await openOf(A, m0)).a.player.luck, 33, 'the charm is one of the four columns');
      await fortune([A], { exp: 33000, streak: 12, today: 600, charm: true });
      assert.equal((await openOf(A, m0)).a.player.luck, 100, 'and all of them at once is the ceiling');
      await fortune([D], { exp: 20 });
      const heavy = (await post(`/api/temple/games/${m0}/move`, {}, A.cookie)).json.match;
      assert.equal(heavy.a.move.total - sum(heavy.a.move.dice), 5, 'the sum the HUD prints is the roll plus that player lộc');
      assert.equal((await openOf(D, m0)).b.player.bonus, 1, 'and the rival rolls bare');
      assert.equal((await post(`/api/temple/games/${m0}/move`, {}, A.cookie)).code, 'already_moved', 'one throw per side per round');
      const settled0 = await playToOver(m0, [A, D]);
      assert.equal(settled0.actor, D, 'the one who throws last settles the round');
      assert.equal(settled0.json.match.status, 'over');

      // ---- Xúc xắc: hai cú bấm cùng giây, phần thưởng chia hai ---------------------
      await fortune([A, B], { exp: 20 });
      const expA = await expOf(A);
      const expB = await expOf(B);
      const [rA, rB] = await Promise.all([
        post(`/api/temple/games/${m1.id}/move`, {}, A.cookie),
        post(`/api/temple/games/${m1.id}/move`, {}, B.cookie),
      ]);
      for (const r of [rA, rB]) assert.equal(r.status, 200, `a simultaneous throw is not rejected (${r.code})`);
      const decided = [rA, rB].filter((r) => r.json.result);
      assert.equal(decided.length, 1, 'two packets in one second settle the round once');
      const race: Settled = { json: decided[0].json, actor: decided[0] === rA ? A : B };
      // Tổng 3 viên có thể bằng nhau: vòng hòa thì hai bên gieo lại, không ai mất lượt.
      const { json: over1, actor } = race.json.over ? race : await playToOver(m1.id, [A, B]);
      assert.equal(over1.over, true);
      const r1: Json = over1.result;
      for (const mv of [r1.a, r1.b]) {
        assert.equal(mv.dice.length, 3, 'three dice, all of them server-rolled');
        assert.ok(mv.dice.every((d: number) => d >= 1 && d <= 6), 'and every face is a face');
        assert.equal(mv.total - sum(mv.dice), mv.bonus);
      }
      const final1 = await openOf(A, m1.id);
      assert.equal(final1.status, 'over');
      assert.equal(final1.a.score + final1.b.score, 1, 'one scoring round decided the whole match');
      assert.ok([A.me.id, B.me.id].includes(final1.winner), 'someone won');
      const actorWon = final1.winner === actor.me.id;
      const gainOf = (side: Side) => (side === actor ? (actorWon ? 40 : 12) : actorWon ? 12 : 40);
      // Thua vẫn được cộng, vì sảnh không có chỗ trắng tay; hai con số này là toàn bộ
      // phần thưởng của một ván xúc xắc.
      assert.equal(over1.outcome, actorWon ? 'win' : 'lose');
      assert.equal(over1.gained, gainOf(actor), 'the actor is paid for their own outcome');
      const afterA = await expOf(A);
      const afterB = await expOf(B);
      assert.equal(afterA, expA + gainOf(A));
      assert.equal(afterB, expB + gainOf(B), 'the rival is paid once, through the notify, not by re-asking');

      // ---- Một trận chỉ trả công một lần -------------------------------------------
      const extra = await post(`/api/temple/games/${m1.id}/move`, {}, A.cookie);
      assert.equal(extra.status, 409, 'a finished match cannot be thrown at again');
      assert.equal(extra.code, 'match_finished');
      assert.equal(await expOf(A), afterA, 'and it pays nothing a second time');

      // ---- Oẳn tù tì: đòn giấu tới khi phân định ------------------------------------
      const m2 = await seedMatch('rps', B, C, 'live');
      const badSign = await post(`/api/temple/games/${m2}/move`, { pick: 'scissors' }, B.cookie);
      assert.equal(badSign.status, 400, 'an English sign is not a sign');
      assert.equal(badSign.code, 'invalid_sign');
      const first = await post(`/api/temple/games/${m2}/move`, { pick: 'bua' }, B.cookie);
      assert.equal(first.json.match.status, 'live');
      assert.equal(first.json.waiting, true);
      assert.equal(first.json.result, undefined, 'one sign alone is not a round');
      assert.equal(first.json.match.a.move.pick, 'bua', 'your own throw stays readable, so a reload mid-round shows it');
      const peek = await openOf(C, m2);
      assert.equal(peek.a.moved, true, 'the rival can see that you threw');
      assert.ok(!JSON.stringify(peek.a.move).includes('bua'), 'but not what you threw — that would be a free win');
      assert.equal((await post(`/api/temple/games/${m2}/move`, { pick: 'keo' }, B.cookie)).code, 'already_moved');
      const m2round = (await post(`/api/temple/games/${m2}/move`, { pick: 'keo' }, C.cookie)).json;
      assert.equal(m2round.over, false, 'oẳn tù tì is best of three: one round is not a match');
      assert.equal(m2round.result.winner, 'a', 'búa eats kéo');
      assert.equal(m2round.result.a.pick, 'bua', 'once the round is settled both signs are public');
      assert.equal(m2round.result.b.pick, 'keo');
      assert.equal(m2round.match.a.score, 1);
      assert.equal(m2round.match.round, 2, 'and the next round starts with empty slots');
      assert.equal(m2round.match.a.move, null, 'so nobody can pay for the old round twice');
      const ended2 = await playToOver(m2, [B, C], ['bua', 'keo']);
      assert.equal(ended2.actor, C, 'the one who signs last settles the round');
      assert.equal(ended2.json.over, true);
      assert.equal(ended2.json.match.a.score, 2, 'two rounds won closes the match');
      assert.equal(ended2.json.match.winner, B.me.id);
      assert.equal(ended2.json.outcome, 'lose', 'and C, who signed the decider, is the one who lost');
      assert.equal(ended2.json.gained, 12);

      // ---- Hòa đòn thì Độ May quyết --------------------------------------------------
      const m3 = await seedMatch('rps', A, D, 'live');
      assert.equal((await post(`/api/temple/games/${m3}/move`, { pick: 'bao' }, B.cookie)).code, 'not_your_game', 'a stranger cannot throw into a match that is not theirs');
      await fortune([A], { exp: 20 });
      await fortune([D], { exp: 33000, streak: 12, today: 600 });
      assert.equal((await openOf(D, m3)).b.player.luck, 90);
      await post(`/api/temple/games/${m3}/move`, { pick: 'bao' }, A.cookie);
      const tie = (await post(`/api/temple/games/${m3}/move`, { pick: 'bao' }, D.cookie)).json;
      assert.equal(tie.result.winner, 'b', 'same sign: the heavier fortune takes the round');
      assert.equal(tie.result.b.pick, 'bao', 'and the round is public once both have signed');
      assert.deepEqual(tie.result.luck, [23, 90]);
      const ended3 = await playToOver(m3, [A, D], ['bao', 'bao']);
      assert.equal(ended3.json.match.winner, D.me.id, 'duyên nặng hơn thì thắng cả trận khi hai bên cùng oẳn một đòn');
      assert.equal(ended3.json.outcome, 'win');
      assert.equal(ended3.json.gained, 40);

      // ---- Hai bên duyên ngang nhau thì trận vẫn có ngày hết --------------------------
      const m4 = await seedMatch('rps', A, B, 'live');
      await fortune([A, B], { exp: 500 });
      const evenLuck = await openOf(A, m4);
      assert.equal(evenLuck.a.player.luck, evenLuck.b.player.luck, 'equal fortune, so every round below is a tie');
      const expA4 = await expOf(A);
      const expB4 = await expOf(B);
      const { json: drawn } = await playToOver(m4, [A, B], ['bua', 'bua']);
      assert.equal(drawn.over, true);
      assert.equal((await openOf(A, m4)).round, 7, 'seven tied rounds is the ceiling, not a run forever');
      assert.equal(drawn.match.winner, null, 'and a draw has no winner');
      assert.equal(drawn.gained, 20, 'both walk away with the draw purse');
      assert.equal(await expOf(A), expA4 + 20);
      assert.equal(await expOf(B), expB4 + 20, 'the peer gets the same purse without asking for it');

      // ---- Từ chối, rút lui, quá hạn ---------------------------------------------------
      const asked = await seedMatch('dice', A, B);
      const declined = await post(`/api/temple/games/${asked}/decline`, {}, B.cookie);
      assert.equal(declined.json.match.status, 'dead');
      assert.equal(declined.json.match.reason, 'declined');
      assert.equal((await post(`/api/temple/games/${asked}/decline`, {}, B.cookie)).code, 'match_not_live', 'the invitation is gone');
      assert.equal((await post(`/api/temple/games/${asked}/accept`, {}, B.cookie)).code, 'match_not_live', 'and cannot be accepted after the fact');

      const running = await seedMatch('dice', D, A, 'live');
      const quit = await post(`/api/temple/games/${running}/cancel`, {}, A.cookie);
      assert.equal(quit.json.match.reason, 'cancelled', 'the one who was invited may still walk out');
      assert.equal((await post(`/api/temple/games/${running}/move`, {}, A.cookie)).code, 'match_finished');

      // Một lời mời bỏ ngỏ không nằm trong danh sách mãi: người được mời có thể đã tắt máy.
      const stale = await seedMatch('rps', C, A);
      await pool.query("UPDATE temple_games SET updated_at = now() - (11 * INTERVAL '1 minute') WHERE id = $1", [stale]);
      const board = (await get('/api/temple/games', A.cookie)).json;
      assert.ok(!board.open.some((m: Json) => m.id === stale), 'an eleven-minute-old invitation is not offered');
      const dead = board.history.find((m: Json) => m.id === stale);
      assert.equal(dead.reason, 'expired', 'and it is filed as expired, not silently dropped');

      // Quét nền: hàng quá hạn phải chết kể cả khi không ai mở bảng, vì người kia có
      // thể đã tắt máy và bot thì không tự mở tab Tỷ Thí.
      const abandoned = await seedMatch('dice', C, A, 'live');
      await pool.query("UPDATE temple_games SET updated_at = now() - (11 * INTERVAL '1 minute') WHERE id = $1", [abandoned]);
      const { expireStaleGames } = await import('./games.ts');
      await expireStaleGames();
      const swept = await pool.query<{ status: string; reason: string }>('SELECT status, reason FROM temple_games WHERE id = $1', [abandoned]);
      assert.equal(swept.rows[0]?.status, 'dead', 'the sweeper cancels an abandoned match without a reader');
      assert.equal(swept.rows[0]?.reason, 'expired');

      // ---- Trần Điểm May Mắn tỷ thí trong ngày ---------------------------------------------
      // Ghi sổ như thể hai người đã ăn gần hết trần: 110/120. Ván đáng ra 40 (thắng) hoặc
      // 12 (thua) nhưng phần còn lại của ngày chỉ 10, nên cả hai bên đều chỉ nhận 10.
      const m5 = await seedMatch('dice', A, B, 'live');
      await fortune([A, B], { exp: 20, today: 100 });
      await pool.query("UPDATE temple_practice SET game_exp = 110 WHERE user_id = ANY($1::uuid[])", [[A.user, B.user]]);
      const expA5 = await expOf(A);
      const expB5 = await expOf(B);
      const { json: over5, actor: actor5 } = await playToOver(m5, [A, B]);
      assert.equal(over5.cap.max, 120, 'the ceiling is on the wire, not guessed by the HUD');
      assert.equal(over5.cap.awarded, 10, 'the purse stops at the ceiling, not at the roll');
      assert.equal(over5.cap.today, 120);
      assert.equal(over5.gained, 10);
      assert.notEqual(over5.cap.nominal, 10, 'and the match still knows what it was worth');
      assert.equal(await expOf(A), expA5 + 10);
      assert.equal(await expOf(B), expB5 + 10, 'the peer is capped by the same rule');
      assert.equal((await get('/api/temple/games', A.cookie)).json.cap.today, 120, 'the board reads the same ledger');

      // Qua trần thì ván vẫn chạy tới nơi tới chốn, chỉ cái ví là đứng lại.
      const m6 = await seedMatch('dice', A, B, 'live');
      const { json: over6 } = await playToOver(m6, [A, B]);
      assert.equal(over6.over, true, 'a capped match still ends with a result');
      assert.equal(over6.cap.awarded, 0);
      assert.equal(over6.gained, 0);
      assert.equal(await expOf(A), expA5 + 10, 'and it pays nothing more today');

      // ---- Kết quả nằm lại "Đang tỷ thí" một cửa sổ -------------------------------------
      // Người bấm nước cuối phải thấy ván vừa rồi ngay tại chỗ, không phải sang tab khác
      // hoặc đoán qua một dòng toast. Hết cửa sổ thì hàng chỉ còn ở lịch sử.
      const fresh = (await get('/api/temple/games', A.cookie)).json;
      assert.equal(fresh.result_ms, 180_000, 'the board hands the client the window it just applied');
      assert.ok(fresh.open.some((m: Json) => m.id === m6), 'a match that just ended is still on the board');
      assert.ok(!fresh.history.some((m: Json) => m.id === m6), 'and it is not filed twice, one row per tab');
      await pool.query("UPDATE temple_games SET updated_at = now() - (4 * INTERVAL '1 minute') WHERE id = $1", [m6]);
      const later = (await get('/api/temple/games', A.cookie)).json;
      assert.ok(!later.open.some((m: Json) => m.id === m6), 'four minutes later it is history only');
      assert.ok(later.history.some((m: Json) => m.id === m6));
      assert.ok(!later.open.some((m: Json) => m.status === 'dead'), 'a swept dead row never jumps back onto the board');
    } finally {
      server.close();
      if (users.length) await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
      await pool.end();
    }
  },
);
