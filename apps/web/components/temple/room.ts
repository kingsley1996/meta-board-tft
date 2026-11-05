// Phòng chánh điện: một kết nối WebSocket tới apps/api, decode frame nhị phân bản
// compact (protocol v4) và đổi lại thành danh sách người để HUD vẽ.
//
// Vì sao không đi qua Next: rewrite /api/* chỉ chuyển request HTTP, còn cú pháp nâng
// cấp WebSocket thì không, nên phòng phải được nối thẳng tới origin của API
// (NEXT_PUBLIC_TEMPLE_WS). Danh tính nằm trong tấm vé xin qua /api — cookie không đi
// theo đường nâng cấp này.
'use client';

import { wsTicket } from './api';

export type RemotePlayer = {
  id: number;
  name: string;
  sect: string;
  title: string;
  honor: string;
  level: number;
  appearance: Record<string, unknown>;
  equipped: Record<string, unknown>;
  x: number;
  z: number;
  y: number;
  r: number;
  seat: number;
  a: number;
};

export type NetState = { x: number; z: number; y: number; r: number; seat: number; a: number };

export type RoomEvents = {
  onPlayers: (players: RemotePlayer[], online: number) => void;
  onJoined: (playerId: number) => void;
  onFull: (info: { count: number; cap: number }) => void;
  onEvent: (msg: Record<string, unknown>) => void;
  onConnection: (up: boolean) => void;
};

// [kind u8, online u16, n u16, n×15 byte, gone u16, gone×u32]
const ENTRY_BYTES = 15;

export class TempleRoom {
  private ws: WebSocket | null = null;
  private profs = new Map<number, Omit<RemotePlayer, keyof NetState>>();
  private states = new Map<number, NetState & { id: number }>();
  private retry = 0;
  private lastSent = '';
  private pushT: number | null = null;
  private closed = false;

  constructor(
    private readonly handlers: RoomEvents,
    private readonly temple: string,
    private readonly room: string,
    private readonly state: () => NetState | null,
  ) {}

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    if (this.closed) return;
    const base = window.__TEMPLE_WS__ || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
    // Vé chỉ dùng một lần và sống vài giây, nên mỗi nhịp nối lại phải xin cái mới —
    // kể cả khi đang chờ backoff. Không có vé thì coi như chùa đang bận.
    let ticket = '';
    try {
      ticket = await wsTicket();
    } catch {
      ticket = '';
    }
    if (!ticket) {
      this.backoff();
      return;
    }
    const ws = new WebSocket(`${base}/ws?ticket=${encodeURIComponent(ticket)}&temple=${encodeURIComponent(this.temple)}&room=${encodeURIComponent(this.room)}`);
    this.ws = ws;
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      this.retry = 0;
      this.handlers.onConnection(true);
      ws.send(JSON.stringify({ t: 'join', temple: this.temple, room: this.room, v: 4 }));
      if (document.hidden) ws.send(JSON.stringify({ t: 'vis', h: true }));
      this.startPush();
    };
    ws.onerror = () => ws.close();
    ws.onclose = (ev) => {
      this.handlers.onConnection(false);
      this.stopPush();
      // 1008/4003/4008 là từ chối có chủ đích (không vé, vé hết hạn, quy chế): nối lại
      // ngay chỉ đốt vé và tiếp tay cho một vòng lặp không lối thoát.
      // 4000 = "ở nơi khác đã mở" — tab bị đá mà nối lại thì hai tab đá lẫn nhau liên
      // tục, đúng như bản gốc dừng hẳn ở code này (main.js ở commit cca9c6d).
      if (this.closed || ev.code === 1008 || ev.code === 4000 || ev.code === 4003 || ev.code === 4008) return;
      this.backoff();
    };
    ws.onmessage = (ev) => this.receive(ev.data);
  }

  send(part: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(part));
  }

  setHidden(hidden: boolean): void {
    this.send({ t: 'vis', h: hidden });
  }

  close(): void {
    this.closed = true;
    this.stopPush();
    this.ws?.close(1000, 'left');
    this.ws = null;
  }

  private backoff(): void {
    if (this.closed) return;
    const wait = Math.min(15_000, 1000 * 2 ** this.retry++);
    window.setTimeout(() => void this.connect(), wait);
  }

  // Vị trí của mình được đẩy đi mỗi 200ms, nhưng chỉ khi thật sự đổi, kèm 5% gửi lại
  // ngẫu nhiên để một khung tin rơi giữa đường không khiến avatar đứng yên mãi trên
  // máy người khác.
  private startPush(): void {
    this.stopPush();
    this.pushT = window.setInterval(() => {
      const st = this.state();
      if (!st || !this.connected) return;
      const sig = JSON.stringify(st);
      if (sig !== this.lastSent || Math.random() < 0.05) {
        this.lastSent = sig;
        this.send({ t: 's', ...st });
      }
    }, 200);
  }

  private stopPush(): void {
    if (this.pushT !== null) window.clearInterval(this.pushT);
    this.pushT = null;
  }

  private receive(data: unknown): void {
    if (data instanceof ArrayBuffer) {
      this.readBinary(data);
      return;
    }
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(data)) as Record<string, unknown>;
    } catch {
      return;
    }
    this.route(msg);
  }

  private readBinary(buffer: ArrayBuffer): void {
    const v = new DataView(buffer);
    // kind 2 là "cả phòng" (full resync) nên bản đồ cũ bị vứt; kind 1 chỉ là phần đổi.
    if (v.getUint8(0) === 2) this.states.clear();
    const n = v.getUint16(3, true);
    let o = 5;
    for (let i = 0; i < n; i++, o += ENTRY_BYTES) {
      const id = v.getUint32(o, true);
      this.states.set(id, {
        id,
        x: v.getInt16(o + 4, true) / 100,
        z: v.getInt16(o + 6, true) / 100,
        y: v.getInt16(o + 8, true) / 100,
        r: v.getInt16(o + 10, true) / 1000,
        seat: v.getInt16(o + 12, true),
        a: v.getUint8(o + 14),
      });
    }
    const gone = v.getUint16(o, true);
    o += 2;
    for (let i = 0; i < gone; i++, o += 4) this.states.delete(v.getUint32(o, true));
    this.emitPlayers(v.getUint16(1, true));
  }

  private route(msg: Record<string, unknown>): void {
    switch (msg.t) {
      case 'prof':
        for (const p of (msg.p ?? []) as RemotePlayer[]) this.profs.set(p.id, p);
        return;
      case 'room3':
        for (const p of (msg.p ?? []) as RemotePlayer[]) this.profs.set(p.id, p);
        if (msg.s) {
          this.states.clear();
          for (const e of msg.s as (NetState & { id: number })[]) this.states.set(e.id, e);
        }
        for (const e of (msg.d ?? []) as (NetState & { id: number })[]) this.states.set(e.id, e);
        for (const id of (msg.g ?? []) as number[]) this.states.delete(id);
        this.emitPlayers(Number(msg.online ?? this.states.size));
        return;
      case 'joined':
        this.profs.clear();
        this.states.clear();
        this.handlers.onJoined(Number(msg.id ?? 0));
        return;
      case 'roomFull':
        this.profs.clear();
        this.states.clear();
        this.handlers.onFull({ count: Number(msg.count ?? 0), cap: Number(msg.cap ?? 0) });
        this.handlers.onPlayers([], Number(msg.count ?? 0));
        return;
      default:
        this.handlers.onEvent(msg);
    }
  }

  private emitPlayers(online: number): void {
    const players: RemotePlayer[] = [];
    for (const st of this.states.values()) {
      const prof = this.profs.get(st.id);
      // Không có hồ sơ thì chưa vẽ được gì: một id không tên là một avatar ma.
      if (prof) players.push({ ...prof, ...st } as RemotePlayer);
    }
    this.handlers.onPlayers(players, online);
  }
}

declare global {
  interface Window {
    __TEMPLE_WS__?: string;
  }
}
