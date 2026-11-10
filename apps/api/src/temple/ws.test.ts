import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once, on } from 'node:events';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { pool } from '../db.ts';
import { issueWsTicket } from './tickets.ts';
import { attachTempleWs } from './ws.ts';

async function nextJson(ws: WebSocket, type: string): Promise<Record<string, any>> {
  for await (const [data, binary] of on(ws, 'message', { signal: AbortSignal.timeout(3_000), close: ['close'] })) {
    if (binary) continue;
    const message = JSON.parse(data.toString());
    if (message.t === type) return message;
  }
  throw new Error(`socket closed before ${type}`);
}

async function join(ws: WebSocket): Promise<Record<string, any>> {
  const joined = nextJson(ws, 'joined');
  const profile = nextJson(ws, 'prof');
  ws.send(JSON.stringify({ t: 'join' }));
  const [message] = await Promise.all([joined, profile]);
  return message;
}

test('temple WebSocket isolates invalid input and dispatch failures', { timeout: 15_000 }, async (t) => {
  const rows = new Map<string, Record<string, unknown>>();
  const failedReads = new Set<string>();
  // Riot ID công khai của từng người, đúng như bảng users: chỉ hàng có mặt ở đây mới
  // rời database. Một lượt vào sảnh bây giờ hỏi hai câu — hồ sơ đền rồi tới Riot ID —
  // nên mock phải phân nhánh theo SQL, nếu không câu thứ hai chết vì assert.equal bên
  // dưới và mọi ca nối đều bị đóng socket.
  const riots = new Map<string, [string, string]>();
  t.mock.method(pool, 'query', async (sql: string, values: unknown[]) => {
    if (sql.startsWith('SELECT id, riot_game_name')) {
      const ids = values[0] as string[];
      return {
        rows: ids
          .filter((id) => riots.has(id))
          .map((id) => ({ id, riot_game_name: riots.get(id)![0], riot_tagline: riots.get(id)![1] })),
      };
    }
    assert.equal(sql, 'SELECT * FROM temple_profiles WHERE user_id = $1');
    if (failedReads.has(values[0] as string)) throw new Error('private database failure');
    const row = rows.get(values[0] as string);
    return { rows: row ? [row] : [] };
  });
  const errors = t.mock.method(console, 'error', (_message: string, _detail: unknown) => {});
  const server = createServer((_req, res) => res.end('ok'));
  const realtime = attachTempleWs(server);
  const sockets: WebSocket[] = [];
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    realtime.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  const origin = `http://127.0.0.1:${port}`;

  async function connect() {
    const userId = randomUUID();
    const playerId = rows.size + 1;
    rows.set(userId, {
      user_id: userId, player_id: String(playerId), name: `Player ${playerId}`, sect: 'flex',
      title: '', honor: '', exp: 0, sen: 0, ngoc: 0, duc: 0, fruit: 0, streak: 0, best_streak: 0,
      appearance: {}, equipped: {}, inventory: {}, heroes: [], no_chan: false,
      buff_until: null, meditate_start: null,
    });
    const issued = await issueWsTicket(userId);
    assert.ok(issued.ok);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?ticket=${issued.ticket.token}`);
    sockets.push(ws);
    await once(ws, 'open', { signal: AbortSignal.timeout(3_000) });
    return { ws, userId, playerId };
  }

  async function assertServing() {
    const response = await fetch(origin, { signal: AbortSignal.timeout(3_000) });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'ok');
  }

  await t.test('invalid JSON and non-message values are ignored before and after join', async () => {
    const actor = await connect();
    const invalid = ['{', 'null', '[]', '[{"t":"join"}]', '1', 'true', '"join"', '{}', '{"t":null}', '{"t":[]}', '{"t":1}', '{"t":{}}', '{"t":"unknown"}'];
    for (const payload of invalid) actor.ws.send(payload);
    assert.equal((await join(actor.ws)).id, actor.playerId);
    const peer = await connect();
    const peerArrival = nextJson(actor.ws, 'prof');
    await join(peer.ws);
    assert.equal((await peerArrival).p[0].id, peer.playerId);

    for (const payload of invalid) actor.ws.send(payload);
    const profile = nextJson(actor.ws, 'prof');
    actor.ws.send(JSON.stringify({ t: 'look' }));
    assert.equal((await profile).p[0].id, actor.playerId);
    const emote = nextJson(peer.ws, 'emote');
    actor.ws.send(JSON.stringify({ t: 's', x: 4, z: 2, seat: -1 }));
    actor.ws.send(JSON.stringify({ t: 'emote', e: 'wave' }));
    assert.deepEqual(await emote, { t: 'emote', id: actor.playerId, e: 'wave' });
    assert.equal(realtime.rooms.members('nhattru', 'chung').find((m) => m.profile.id === actor.playerId)?.state.x, 4);
    assert.equal(actor.ws.readyState, WebSocket.OPEN);
    assert.equal(errors.mock.callCount(), 0);
    await assertServing();
  });

  await t.test('a shared riot id rides the profile frame, and unsharing erases it', async () => {
    const owner = await connect();
    const peer = await connect();
    await join(owner.ws);
    await join(peer.ws);

    // Một nhịp 'look' là đúng tuyến máy khách đi sau khi PUT /profile: hồ sơ đọc lại
    // từ database rồi phát cho cả phòng, nên đây là chỗ cờ "Hiện Riot ID" có tác dụng.
    const ownerFrameSeenByPeer = async () => {
      const frame = nextJson(peer.ws, 'prof');
      owner.ws.send(JSON.stringify({ t: 'look' }));
      const prof = (await frame).p[0];
      assert.equal(prof.id, owner.playerId, 'the peer sees the owner');
      return prof;
    };

    assert.equal('riot' in (await ownerFrameSeenByPeer()), false, 'nothing shared, nothing on the wire');

    riots.set(owner.userId, ['Leesin', '123']);
    assert.equal((await ownerFrameSeenByPeer()).riot, 'Leesin#123');

    // Tắt cờ xoá HẴN key khỏi hồ sơ phát lại. Để lại chuỗi rỗng thì thẻ người chơi
    // vẫn vẽ một danh tính, và hồ sơ cũ nằm trong bộ nhớ phòng cho tới nhịp này.
    riots.delete(owner.userId);
    assert.equal('riot' in (await ownerFrameSeenByPeer()), false, 'the revoked id stops travelling');
    assert.equal(errors.mock.callCount(), 0, 'none of these reads failed');
    await assertServing();
  });

  await t.test('a rejected look closes only the affected socket', async () => {
    const broken = await connect();
    const healthy = await connect();
    await join(broken.ws);
    await join(healthy.ws);
    failedReads.add(broken.userId);
    const closed = once(broken.ws, 'close', { signal: AbortSignal.timeout(3_000) });
    broken.ws.send(JSON.stringify({ t: 'look' }));
    const [code, reason] = await closed;
    assert.equal(code, 1011);
    assert.doesNotMatch(reason.toString(), /private database failure/);
    const profile = nextJson(healthy.ws, 'prof');
    healthy.ws.send(JSON.stringify({ t: 'look' }));
    assert.equal((await profile).p[0].id, healthy.playerId);
    assert.equal(healthy.ws.readyState, WebSocket.OPEN);
    assert.ok(errors.mock.calls.some((call) => call.arguments.includes('private database failure')));
    await assertServing();
  });

  await t.test('a rejected join does not prevent another player from joining', async () => {
    const broken = await connect();
    failedReads.add(broken.userId);
    const closed = once(broken.ws, 'close', { signal: AbortSignal.timeout(3_000) });
    broken.ws.send(JSON.stringify({ t: 'join' }));
    const [code, reason] = await closed;
    assert.equal(code, 1011);
    assert.doesNotMatch(reason.toString(), /private database failure/);
    const healthy = await connect();
    assert.equal((await join(healthy.ws)).id, healthy.playerId);
    await assertServing();
  });

  await t.test('synchronous state conversion failures in join and movement are contained', async () => {
    for (const type of ['join', 's']) {
      const broken = await connect();
      if (type === 's') await join(broken.ws);
      const closed = once(broken.ws, 'close', { signal: AbortSignal.timeout(3_000) });
      broken.ws.send(JSON.stringify({ t: type, x: { valueOf: null, toString: null } }));
      const [code] = await closed;
      assert.equal(code, 1011);
      const healthy = await connect();
      assert.equal((await join(healthy.ws)).id, healthy.playerId);
      await assertServing();
    }
  });
});
