// Sổ phòng. Trạng thái phòng nằm trong bộ nhớ của process, nên một instance phục vụ
// được toàn bộ người chơi; khi cần chạy nhiều instance thì chỗ này (chứ không phải
// ws.ts) là nơi thay bằng pub/sub, vì nó đã là boundary duy nhất mà máy chủ gọi tới.
import { isUnknownState, packRoomFrame, TICK, type PlayerProfile, type PlayerState } from './protocol.ts';

export type RoomMember = {
  profile: PlayerProfile;
  state: PlayerState;
  dirty: boolean;
  temple: string;
  room: string;
  send: (payload: Buffer | string) => void;
  // Socket đã đóng nhưng người đó chưa bị báo ra đi: còn đứng trong phòng, còn nguyên
  // chỗ cũ, chỉ không nhận được gì nữa. Nối lại trong GONE_GRACE_MS là tiếp quản lại.
  leftAt?: number;
};

function keyOf(temple: string, room: string): string {
  return `${temple}:${room}`;
}

export class TempleRooms {
  private readonly rooms = new Map<string, Set<RoomMember>>();
  private readonly lastFull = new Map<string, number>();

  add(member: RoomMember): PlayerProfile[] {
    const key = keyOf(member.temple, member.room);
    const set = this.rooms.get(key) ?? new Set<RoomMember>();
    // Một id đứng hai chỗ trong cùng phòng nghĩa là lượt vào trước chưa được gỡ (tab nối
    // lại, hoặc một gói 'join' thứ hai trên cùng socket): số người online đếm thừa mãi
    // cho tới khi tiến trình khởi động lại.
    let resumed: RoomMember | null = null;
    for (const stale of [...set]) {
      if (stale.profile.id !== member.profile.id) continue;
      set.delete(stale);
      resumed = stale;
    }
    // Người cũ nối lại mà chưa kịp kê vị trí thì giữ nguyên chỗ họ đang ngồi: dùng
    // (0,0) từ readState thì cả chánh điện thấy một người vừa thiền đứng giữa sân
    // chùa rồi trượt về chỗ cũ.
    if (resumed && isUnknownState(member.state)) {
      member.state = resumed.state;
      member.dirty = resumed.dirty;
    }
    const peers = [...set].map((other) => other.profile);
    set.add(member);
    this.rooms.set(key, set);
    return peers;
  }

  // Không xoá ngay: đánh dấu rồi cho tick quyết định. Một cú rớt mạng dưới cửa sổ ân
  // hạn sẽ nối lại cùng id và không ai phải thấy avatar của người đó cả biến mất vừa
  // teleport.
  remove(member: RoomMember, now = Date.now()): void {
    const set = this.rooms.get(keyOf(member.temple, member.room));
    if (!set?.has(member) || member.leftAt) return;
    member.leftAt = now;
  }

  markDirty(member: RoomMember, state: PlayerState): void {
    member.state = state;
    member.dirty = true;
  }

  // Một nhịp = frame delta cho người vừa chuyển động, cộng snapshot đầy định kỳ để
  // client bị rớt frame (tab ẩn, mạng yếu) tự bắt lại kịp.
  tick(now = Date.now()): void {
    for (const [key, set] of this.rooms) {
      // Hết cửa sổ ân hạn mới thật là rời phòng: chỉ những id này vào danh sách "gone"
      // của frame, và một id vừa đứng tên lại đã bị add() gỡ khỏi set nên không thể
      // bị báo nhầm.
      const left: number[] = [];
      for (const stale of [...set]) {
        if (stale.leftAt && now - stale.leftAt >= TICK.goneGraceMs) {
          set.delete(stale);
          left.push(stale.profile.id);
        }
      }
      if (set.size === 0) {
        this.rooms.delete(key);
        this.lastFull.delete(key);
        continue;
      }
      const members = [...set];

      const full = now - (this.lastFull.get(key) ?? 0) >= TICK.fullSnapshotMs;
      const changed = members.filter((member) => member.dirty);
      if (!full && left.length === 0 && changed.length === 0) continue;

      // Số người trên frame phải đúng bằng số avatar mà máy khách dựng được, nên đếm
      // theo thành viên của phòng chứ không theo "tab nào đang hiện": một người để tab
      // nền vẫn đứng trong chánh điện, trừ khỏi số đếm là hai bên lệch nhau ngay. Người
      // trong ân hạn vẫn được tính — avatar của họ vẫn đang đứng đó trên mọi máy khách.
      const online = members.length;
      const states = (full ? members : changed).map((member) => member.state);
      const frame = packRoomFrame(full, online, states, left);
      for (const member of members) member.send(frame);
      for (const member of changed) member.dirty = false;
      if (full) this.lastFull.set(key, now);
    }
  }

  // Snapshot riêng cho người vừa vào, để hall hiện lên ngay thay vì chờ nhịp kế tiếp.
  snapshotOf(member: RoomMember): Buffer {
    const set = this.rooms.get(keyOf(member.temple, member.room));
    const members = set ? [...set] : [member];
    return packRoomFrame(true, members.length, members.map((m) => m.state), []);
  }

  // Phát một tin JSON cho cả phòng, bỏ qua tác nhân (người gửi socket, hoặc người mà
  // route REST vừa hành động thay). exceptId là id trên dây chứ không phải đối tượng
  // thành viên, nên một route không có socket vẫn phát được vào phòng.
  publish(temple: string, room: string, payload: string, exceptId?: number): void {
    const set = this.rooms.get(keyOf(temple, room));
    if (!set) return;
    for (const other of set) if (other.profile.id !== exceptId && !other.leftAt) other.send(payload);
  }

  // Báo đích danh một người chơi, không hỏi họ đang ở phòng nào: tin nhắn riêng và lời
  // mời kết bạn là chuyện của hai người, phát cả chánh điện thì thành tiếng ồn. Người
  // ngoại tuyến không nhận gì cả — tin đã nằm trong database, họ thấy khi mở hộp thư.
  notify(playerId: number, payload: string): void {
    for (const set of this.rooms.values()) {
      for (const member of set) if (member.profile.id === playerId && !member.leftAt) member.send(payload);
    }
  }

  summary(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, set] of this.rooms) out[key] = set.size;
    return out;
  }

  get size(): number {
    let total = 0;
    for (const set of this.rooms.values()) total += set.size;
    return total;
  }

  stop(): void {
    this.rooms.clear();
    this.lastFull.clear();
  }
}

export const ROOM_TICK_MS = TICK.deltaMs;
