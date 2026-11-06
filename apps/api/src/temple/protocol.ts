// Phòng chánh điện đồng bộ cho nhiều người. Frame trạng thái gửi dưới dạng nhị phân
// vì máy khách đẩy vị trí mỗi 200ms (room.ts:125) và một hall đầy người sẽ tốn quá
// nhiều băng thông nếu gửi bằng JSON — định dạng này do chính máy khách quy định
// (room.ts:155-177 đọc nó), máy chủ chỉ lặp lại nó.

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
// Cửa sổ ân hạn cho một socket vừa đứt. Di chuyển của máy khách nội suy mỗi khung
// hình với tốc độ dt*8, nên một avatar bị xoá rồi dựng lại giữa chánh điện bị kéo
// về (0,0) rồi trượt lại chỗ cũ mất cỡ một giây — đúng cái người chơi gọi là "chớp
// tắt, nhảy vị trí". Tab bị treo, proxy cắt giữa chừng hay một cú pong trễ đều nối
// lại trong cỡ vài trăm ms, đủ để không ai phải thấy gì.
const GONE_GRACE_MS = 3_000;

export const TICK = { fullSnapshotMs: FULL_SNAPSHOT_MS, deltaMs: DELTA_TICK_MS, goneGraceMs: GONE_GRACE_MS };

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

// Máy khách không còn tự khai những trường này: identity.ts dựng PlayerProfile từ
// hàng temple_profiles theo vé, nên một gói tin không đổi được level/tên của ai đó.

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

// readState của một gói 'join' không kê vị trí cho ra đúng hình này. Phòng dùng nó
// để biết "máy khách chưa kịp nói mình ở đâu" chứ không phải "người này đang đứng ở
// gốc sân chùa": một cú nối lại rơi vào hình này thì giữ chỗ cũ của người đó.
export function isUnknownState(s: PlayerState): boolean {
  return s.x === 0 && s.z === 0 && s.y === 0 && s.r === 0 && s.seat === -1 && s.a === 0;
}
