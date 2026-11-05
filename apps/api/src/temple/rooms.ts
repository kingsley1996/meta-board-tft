// Sổ phòng. Trạng thái phòng nằm trong bộ nhớ của process, nên một instance phục vụ
// được toàn bộ người chơi; khi cần chạy nhiều instance thì chỗ này (chứ không phải
// ws.ts) là nơi thay bằng pub/sub, vì nó đã là boundary duy nhất mà máy chủ gọi tới.
import { packRoomFrame, TICK, type PlayerProfile, type PlayerState } from './protocol.ts';

export type RoomMember = {
  profile: PlayerProfile;
  state: PlayerState;
  dirty: boolean;
  temple: string;
  room: string;
  send: (payload: Buffer | string) => void;
};

function keyOf(temple: string, room: string): string {
  return `${temple}:${room}`;
}

export class TempleRooms {
  private readonly rooms = new Map<string, Set<RoomMember>>();
  private readonly lastFull = new Map<string, number>();
  // Người đã rời phòng nhưng chưa kịp báo cho những người còn lại.
  private readonly gone = new Map<string, Set<number>>();

  add(member: RoomMember): PlayerProfile[] {
    const key = keyOf(member.temple, member.room);
    this.remove(member);
    const set = this.rooms.get(key) ?? new Set<RoomMember>();
    // Một id đứng hai chỗ trong cùng phòng nghĩa là lượt vào trước chưa được gỡ (tab nối
    // lại, hoặc một gói 'join' thứ hai trên cùng socket): số người online đếm thừa mãi
    // cho tới khi tiến trình khởi động lại. Gỡ ở đây thay vì ghi vào "gone" — avatar của
    // id đó vẫn còn trong phòng, chỉ là vừa được đứng tên hai lần.
    for (const stale of [...set]) if (stale.profile.id === member.profile.id) set.delete(stale);
    const peers = [...set].map((other) => other.profile);
    set.add(member);
    this.rooms.set(key, set);
    return peers;
  }

  remove(member: RoomMember): void {
    const key = keyOf(member.temple, member.room);
    const set = this.rooms.get(key);
    if (!set) return;
    if (!set.delete(member)) return;
    if (set.size === 0) {
      this.rooms.delete(key);
      this.lastFull.delete(key);
      this.gone.delete(key);
      return;
    }
    const left = this.gone.get(key) ?? new Set<number>();
    left.add(member.profile.id);
    this.gone.set(key, left);
  }

  markDirty(member: RoomMember, state: PlayerState): void {
    member.state = state;
    member.dirty = true;
  }

  // Một nhịp = frame delta cho người vừa chuyển động, cộng snapshot đầy định kỳ để
  // client bị rớt frame (tab ẩn, mạng yếu) tự bắt lại kịp.
  tick(now = Date.now()): void {
    for (const [key, set] of this.rooms) {
      const members = [...set];
      // gone được ghi theo id, mà id đó có thể đã đứng tên lại trong cùng nhịp (tab nối
      // lại, hoặc cú đá tab cũ ở ws.ts:123): một frame vừa mang state vừa mang gone cho
      // cùng một người khiến máy khách xoá avatar của người đang đứng thật — và xoá luôn
      // hồ sơ, mà hồ sơ chỉ được phát lại lúc join, nên người đó biến mất hẳn.
      const present = new Set(members.map((m) => m.profile.id));
      const left = [...(this.gone.get(key) ?? [])].filter((id) => !present.has(id));
      this.gone.delete(key);

      const full = now - (this.lastFull.get(key) ?? 0) >= TICK.fullSnapshotMs;
      const changed = members.filter((member) => member.dirty);
      if (!full && left.length === 0 && changed.length === 0) continue;

      // Số người trên frame phải đúng bằng số avatar mà máy khách dựng được, nên đếm
      // theo thành viên của phòng chứ không theo "tab nào đang hiện": một người để tab
      // nền vẫn đứng trong chánh điện, trừ khỏi số đếm là hai bên lệch nhau ngay.
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
    for (const other of set) if (other.profile.id !== exceptId) other.send(payload);
  }

  // Báo đích danh một người chơi, không hỏi họ đang ở phòng nào: tin nhắn riêng và lời
  // mời kết bạn là chuyện của hai người, phát cả chánh điện thì thành tiếng ồn. Người
  // ngoại tuyến không nhận gì cả — tin đã nằm trong database, họ thấy khi mở hộp thư.
  notify(playerId: number, payload: string): void {
    for (const set of this.rooms.values()) {
      for (const member of set) if (member.profile.id === playerId) member.send(payload);
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
    this.gone.clear();
  }
}

export const ROOM_TICK_MS = TICK.deltaMs;
