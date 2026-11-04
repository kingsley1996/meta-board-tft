// Phòng chánh điện đồng bộ cho nhiều người. Frame trạng thái gửi dưới dạng nhị phân
// vì máy khách đẩy vị trí mỗi 200ms (main.js:1486) và một hall đầy người sẽ tốn quá
// nhiều băng thông nếu gửi bằng JSON — định dạng này do chính máy khách quy định
// (main.js:1300-1309), máy chủ chỉ lặp lại nó.

export type PlayerState = {
  id: number;
  x: number;
  z: number;
  y: number;
  r: number;
  seat: number;
  a: number;
};

// Hồ sơ hiển thị cho avatar của người khác: world.js:599-644 dựng lại nhân vật khi
// appearance/equipped đổi và vẽ nhãn từ name/level/honor, nên chỉ các trường đó đi
// trên dây. id phải là số nguyên 32-bit vì frame nhị phân mã nó bằng writeUInt32LE.
export type PlayerProfile = {
  id: number;
  name: string;
  level: number;
  honor?: string;
  sect?: string;
  title?: string;
  avatar?: string | null;
  appearance?: Record<string, unknown>;
  equipped?: Record<string, string>;
  q?: boolean;
};

const ENTRY_BYTES = 15;
const FULL_SNAPSHOT_MS = 5_000;
const DELTA_TICK_MS = 250;

export const TICK = { fullSnapshotMs: FULL_SNAPSHOT_MS, deltaMs: DELTA_TICK_MS };

// i16 với tỉ lệ 1/100 cho toạ độ, 1/1000 cho góc quay: đủ cho sân chùa vài chục mét
// và giữ được frame gọn. Ngoài khoảng đó là client đã gửi dữ liệu không hợp lệ.
function scaled(value: number, factor: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-32_768, Math.min(32_767, Math.round(value * factor)));
}

export function packRoomFrame(
  full: boolean,
  online: number,
  states: PlayerState[],
  gone: number[]
): Buffer {
  const buffer = Buffer.alloc(5 + states.length * ENTRY_BYTES + 2 + gone.length * 4);
  buffer.writeUInt8(full ? 2 : 1, 0);
  buffer.writeUInt16LE(Math.min(65_535, online), 1);
  buffer.writeUInt16LE(states.length, 3);

  let offset = 5;
  for (const s of states) {
    buffer.writeUInt32LE(s.id >>> 0, offset);
    buffer.writeInt16LE(scaled(s.x, 100), offset + 4);
    buffer.writeInt16LE(scaled(s.z, 100), offset + 6);
    buffer.writeInt16LE(scaled(s.y, 100), offset + 8);
    buffer.writeInt16LE(scaled(s.r, 1000), offset + 10);
    buffer.writeInt16LE(s.seat, offset + 12);
    buffer.writeUInt8(s.a & 0xff, offset + 14);
    offset += ENTRY_BYTES;
  }

  buffer.writeUInt16LE(gone.length, offset);
  offset += 2;
  for (const id of gone) {
    buffer.writeUInt32LE(id >>> 0, offset);
    offset += 4;
  }
  return buffer;
}

// Máy khách chỉ biết vẽ một avatar từ những trường này; nhận thêm key từ trình duyệt
// sẽ biến người chơi thành nơi gửi dữ liệu tuỳ ý vào máy chủ khác, nên lọc trắng.
export function readProfile(raw: unknown): PlayerProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const id = Number(p.id);
  if (!Number.isInteger(id) || id < 0 || id > 4_294_967_295) return null;
  const name = typeof p.name === 'string' ? p.name.slice(0, 28) : '';
  if (!name) return null;
  const profile: PlayerProfile = { id, name, level: Number(p.level) || 1 };
  if (typeof p.honor === 'string') profile.honor = p.honor.slice(0, 40);
  if (typeof p.sect === 'string') profile.sect = p.sect.slice(0, 24);
  if (typeof p.title === 'string') profile.title = p.title.slice(0, 40);
  if (typeof p.avatar === 'string' || p.avatar === null) profile.avatar = p.avatar as string | null;
  if (p.appearance && typeof p.appearance === 'object') profile.appearance = p.appearance as Record<string, unknown>;
  if (p.equipped && typeof p.equipped === 'object') profile.equipped = p.equipped as Record<string, string>;
  if (p.q) profile.q = true;
  return profile;
}

export function readState(profile: PlayerProfile, raw: Record<string, unknown>): PlayerState {
  return {
    id: profile.id,
    x: Number(raw.x) || 0,
    z: Number(raw.z) || 0,
    y: Number(raw.y) || 0,
    r: Number(raw.r) || 0,
    seat: Number.isInteger(raw.seat) ? Math.max(-1, Math.min(32_767, raw.seat as number)) : -1,
    a: Number(raw.a) || 0,
  };
}
