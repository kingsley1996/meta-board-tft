// Cầu WebSocket cho chánh điện. Máy khách (vendor/temple/js/main.js:1286) tự nối
// `wss://…/ws` và đọc frame theo protocol v4, nên máy chủ phải nói đúng tiếng đó thay
// vì đổi client. Phòng được key bằng `temple:room`, mã phòng lấy từ query của chính
// đường WS vì join chỉ gửi temple (main.js:1294).
import type { Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { readProfile, readState } from './protocol.ts';
import { ROOM_TICK_MS, TempleRooms, type RoomMember } from './rooms.ts';

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

function send(ws: WebSocket, payload: Buffer | string): void {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(payload);
  } catch {
    // Khung ghi hỏng thường là socket vừa bị phía kia đóng; close sẽ dọn phòng.
  }
}

export function attachTempleWs(server: Server): TempleRealtime {
  const rooms = new TempleRooms();
  // Một người chơi mở hai tab: state trên dây key bằng id nên tab thứ hai sẽ đè lên
  // tab đầu và hall hiển thị một người đứng hai chỗ. Tab cũ bị đá, đúng như máy chủ
  // gốc báo bằng close code 4000 mà client đã hiểu (main.js:1414).
  const byId = new Map<number, TempleSocket>();

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://temple.invalid');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket as Duplex, head, (ws) => onConnection(ws as TempleSocket, url));
  });

  function onConnection(ws: TempleSocket, url: URL): void {
    const temple = url.searchParams.get('temple') || 'nhattru';
    const room = url.searchParams.get('room') || 'chung';
    ws.alive = true;
    ws.on('pong', () => {
      ws.alive = true;
    });

    ws.on('message', (raw: Buffer) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
      } catch {
        return;
      }
      if (msg.t !== 'join') {
        if (ws.member) onMemberMessage(ws.member, msg);
        return;
      }

      const profile = readProfile(msg.prof);
      if (!profile) {
        // P2 sẽ lấy hồ sơ từ Postgres theo token; cho tới lúc đó máy khách phải tự
        // khai, và một khai báo thiếu id/name thì không có gì để vẽ cho người khác.
        console.warn('temple ws: join without a usable profile');
        ws.close(1008, 'profile required');
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
        hidden: false,
        dirty: true,
        temple,
        room,
        send: (payload) => send(ws, payload),
      };
      const peers = rooms.add(member);
      ws.member = member;

      send(ws, JSON.stringify({ t: 'joined' }));
      if (peers.length) send(ws, JSON.stringify({ t: 'prof', p: peers }));
      rooms.broadcast(member, JSON.stringify({ t: 'prof', p: [profile] }));
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

  function onMemberMessage(member: RoomMember, msg: Record<string, unknown>): void {
    switch (msg.t) {
      case 's':
        rooms.markDirty(member, readState(member.profile, msg));
        break;
      case 'emote':
        if (typeof msg.e === 'string') {
          rooms.broadcast(member, JSON.stringify({ t: 'emote', id: member.profile.id, e: msg.e.slice(0, 8) }));
        }
        break;
      case 'chore':
        if (typeof msg.k === 'string') {
          rooms.broadcast(member, JSON.stringify({ t: 'chore', id: member.profile.id, k: msg.k.slice(0, 16) }));
        }
        break;
      case 'vis':
        // Tab ẩn không còn là người "đang hành trì" nhưng vẫn phải thấy người khác,
        // nên chỉ loại khỏi số đếm online, không rời phòng.
        member.hidden = msg.h === true;
        member.dirty = true;
        break;
      case 'giftSeen':
        break;
      default:
        // Các loại tin còn lại (lantern, plant, dm, mail…) là tác vụ REST mà máy chủ
        // broadcast sang phòng, không chiều ngược lại.
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
