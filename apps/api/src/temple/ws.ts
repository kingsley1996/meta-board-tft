// Cầu WebSocket cho chánh điện. Máy khách (components/temple/room.ts:77) tự nối
// `wss://…/ws` và đọc frame theo protocol v4, nên máy chủ phải nói đúng tiếng đó thay
// vì đổi client. Phòng được key bằng `temple:room`, mã phòng lấy từ query của chính
// đường WS vì join chỉ gửi temple (room.ts:83).
//
// Nhận dạng (tickets.ts, -- 04): vé xác minh ngay ở đây, trước khi phòng ghi nhận ai,
// và hồ sơ vẽ avatar lấy từ Postgres chứ không từ máy khách. Một kết nối không có vé
// còn hiệu lực bị đóng ngay, nên không có "chế độ khách tự khai".
import type { Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { readState, type PlayerProfile } from './protocol.ts';
import { ROOM_TICK_MS, TempleRooms, type RoomMember } from './rooms.ts';
import { ensureTempleProfile, templeProfile, toPlayerProfile } from './identity.ts';
import { redeemWsTicket, type TicketHolder } from './tickets.ts';

const MAX_PAYLOAD_BYTES = 8192;
// Trình duyệt đóng mà không kịp báo (tab bị macOS thắt cổ, mất mạng, proxy cắt giữa
// chừng) thì socket không bao giờ phát 'close', nên phòng phải tự hỏi thăm. Chu kỳ
// 30s vì máy khách đã gửi vị trí mỗi 200ms; một nhịp không pong là socket chết.
const HEARTBEAT_MS = 30_000;

type TempleSocket = WebSocket & { member?: RoomMember; alive?: boolean };

export type TempleRealtime = {
  rooms: TempleRooms;
  close: () => void;
};

// Sổ phòng của process đang chạy. Route REST không có socket riêng nên nó phải mượn
// cái này để báo tin cho người chơi; khi chưa attach (test chỉ gọi hall router) thì
// notifyPlayer âm thầm bỏ qua — hành động vẫn thành công, chỉ không có ai để báo.
let activeRooms: TempleRooms | null = null;

export function notifyPlayer(playerId: number, payload: Record<string, unknown>): void {
  activeRooms?.notify(playerId, JSON.stringify(payload));
}

function send(ws: WebSocket, payload: Buffer | string): void {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(payload);
  } catch {
    // Khung ghi hỏng thường là socket vừa bị phía kia đóng; close sẽ dọn phòng.
  }
}

// Hồ sơ để vẽ một avatar. Đọc lại từ database theo từng lượt join (không phải theo
// từng frame) nên một tab mở lại sau vài giờ cũng nhận được áo/chuỗi người chơi vừa
// đổi. playerId trong vé phải khớp với hồ sơ: hai hàng khác nhau cấp cho cùng một
// người thì frame nhị phân sẽ vẽ một người đứng hai chỗ.
async function profileForJoin(holder: TicketHolder): Promise<PlayerProfile | null> {
  const profile = (await templeProfile(holder.userId)) ?? (await ensureTempleProfile(holder.userId));
  if (!profile || profile.playerId !== holder.playerId) return null;
  return toPlayerProfile(profile);
}

export function attachTempleWs(server: Server): TempleRealtime {
  const rooms = new TempleRooms();
  activeRooms = rooms;
  // Một người chơi mở hai tab: state trên dây key bằng id nên tab thứ hai sẽ đè lên
  // tab đầu và hall hiển thị một người đứng hai chỗ. Tab cũ bị đá bằng close code
  // 4000, đúng như máy chủ gốc vẫn làm.
  const byId = new Map<number, TempleSocket>();

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://temple.invalid');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket as Duplex, head, (ws) => void onConnection(ws as TempleSocket, url));
  });

  async function onConnection(ws: TempleSocket, url: URL): Promise<void> {
    const claim = redeemWsTicket(url.searchParams.get('ticket'));
    if (!claim.ok) {
      // 1008 = policy violation: máy khách không có nhánh thử lại nào cho code này,
      // nên nó dừng nối lại thay vì quay vòng xin vé giả mãi mãi. Vé *hết hạn* thì khác:
      // đó là người thật đã xin vé nhưng main thread còn đang dựng cảnh nên socket mở
      // chậm hơn TTL. 4009 là code để máy khách thử lại — nó xin vé mới sau backoff,
      // còn kẻ gõ tay một vé cũ thì rơi vào nhánh 1008 vì vé đó chưa từng được cấp.
      if (claim.reason === 'expired') {
        ws.close(4009, 'ticket expired');
        return;
      }
      ws.close(1008, claim.reason === 'absent' ? 'ticket required' : 'ticket invalid');
      return;
    }
    const holder = claim.holder;
    const temple = url.searchParams.get('temple') || 'nhattru';
    const room = url.searchParams.get('room') || 'chung';
    ws.alive = true;
    ws.on('pong', () => {
      ws.alive = true;
    });

    ws.on('message', async (raw: Buffer) => {
      // Một gói tin là bằng chứng sống ngang giá trị với một cú pong: tab bị thắt
      // nhịp độ có thể trả lời ping trễ hơn một nhịp heartbeat, và đá socket của một
      // người đang đứng giữa chánh điện thì cả phòng thấy avatar họ nhấp nháy.
      ws.alive = true;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
      } catch {
        return;
      }
      if (msg.t !== 'join') {
        if (ws.member) await onMemberMessage(ws.member, msg, holder.userId);
        return;
      }

      let profile: PlayerProfile | null;
      try {
        profile = await profileForJoin(holder);
      } catch (error) {
        console.error('temple ws: profile read failed', error instanceof Error ? error.message : error);
        ws.close(1011, 'profile unavailable');
        return;
      }
      if (!profile) {
        console.warn(`temple ws: no profile row for ${holder.userId}`);
        ws.close(1011, 'profile unavailable');
        return;
      }

      const previous = byId.get(profile.id);
      if (previous && previous !== ws) {
        // Phải xoá khỏi phòng ngay tại đây: close(4000) chỉ gửi lệnh đóng, sự kiện
        // 'close' của tab cũ đến muộn và nếu member bị gán undefined trước thì
        // forget() bỏ qua, để lại một avatar ma đứng mãi trong chánh điện.
        if (previous.member) rooms.remove(previous.member);
        previous.member = undefined;
        previous.close(4000, 'opened elsewhere');
      }
      byId.set(profile.id, ws);

      const member: RoomMember = {
        profile,
        state: readState(profile, msg),
        dirty: true,
        temple,
        room,
        send: (payload) => send(ws, payload),
      };
      const peers = rooms.add(member);
      ws.member = member;

      // id gửi lại vì từ giờ máy chủ mới là người biết số của mình: máy khách dùng nó
      // để loại chính mình khỏi danh sách avatar vẽ từ frame (room.ts:197 → engine.applyRoom).
      send(ws, JSON.stringify({ t: 'joined', id: profile.id }));
      if (peers.length) send(ws, JSON.stringify({ t: 'prof', p: peers }));
      rooms.publish(temple, room, JSON.stringify({ t: 'prof', p: [profile] }), profile.id);
      send(ws, rooms.snapshotOf(member));
    });

    const forget = () => {
      const member = ws.member;
      if (!member) return;
      ws.member = undefined;
      rooms.remove(member);
      if (byId.get(member.profile.id) === ws) byId.delete(member.profile.id);
    };
    ws.on('close', forget);
    ws.on('error', forget);
  }

  async function onMemberMessage(member: RoomMember, msg: Record<string, unknown>, userId: string): Promise<void> {
    switch (msg.t) {
      case 's':
        rooms.markDirty(member, readState(member.profile, msg));
        break;
      case 'look': {
        // Người chơi vừa PUT /profile (đổi tên, chọn nhận vật, mặc/tháo đồ). Phòng phải
        // thấy cái mới ngay, nên hồ sơ đọc lại từ database chứ không tin máy khách khai
        // — cùng một lẽ với tấm vé lúc nối. playerId phải khớp: hai hàng hồ sơ cho cùng
        // một người nghĩa là một avatar đứng hai chỗ.
        const fresh = await templeProfile(userId);
        if (!fresh || fresh.playerId !== member.profile.id) break;
        member.profile = toPlayerProfile(fresh);
        rooms.publish(member.temple, member.room, JSON.stringify({ t: 'prof', p: [member.profile] }), member.profile.id);
        break;
      }
      case 'emote':
        if (typeof msg.e === 'string') {
          rooms.publish(
            member.temple,
            member.room,
            JSON.stringify({ t: 'emote', id: member.profile.id, e: msg.e.slice(0, 8) }),
            member.profile.id,
          );
        }
        break;
      case 'giftSeen':
        break;
      default:
        // Các loại tin còn lại (nhắn tin, trồng cây, quà…) là tác vụ REST: máy khách
        // gọi HTTP, máy chủ báo thẳng tới người nhận bằng notifyPlayer (social.ts),
        // không chiều ngược lại.
        break;
    }
  }

  const timer = setInterval(() => rooms.tick(), ROOM_TICK_MS);
  timer.unref();
  const heartbeat = setInterval(() => {
    for (const client of wss.clients as Set<TempleSocket>) {
      if (client.alive === false) {
        client.terminate();
        continue;
      }
      client.alive = false;
      client.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return {
    rooms,
    close: () => {
      clearInterval(timer);
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      rooms.stop();
      byId.clear();
    },
  };
}
