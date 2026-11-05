// Vé vào chánh điện (-- 03 cấp vé ở routes.ts /ws-ticket · -- 04 xác minh ở ws.ts):
// một chuỗi ngẫu nhiên ngắn, đổi được đúng một lần, hết hạn sau vài giây. Máy khách
// xin vé bằng cookie phiên (đã có sẵn cho khách lẫn tài khoản thật) rồi nối
// `wss://…/ws?ticket=…`.
//
// Vé tồn tại vì hai lẽ. Một: bản nâng cấp WebSocket không đi qua proxy /api của Next
// nên không mang cookie — máy chủ không có gì để tra ra ai. Hai: nếu để máy khách tự
// khai hồ sơ trong join thì ai cũng đặt được level/tên/avatar tuỳ ý cho mình.
//
// Map này chỉ sống trong một process, và phòng chùa cũng vậy (một tiến trình trên
// Render, scale = 1) — nên vé cấp ra chắc chắn nằm đúng nơi sẽ dùng nó.
import { hashToken, newToken } from '../accounts.ts';
import { ensureTempleProfile, templeProfile, type TempleProfile } from './identity.ts';

const TTL_MS = 15_000;
export const TICKET_TTL_MS = TTL_MS;

export type TicketHolder = { userId: string; playerId: number };
export type IssuedTicket = TicketHolder & { token: string; profile: TempleProfile };

// key là bản sha256 của vé, giống cách lưu session token: chuỗi thật rời khỏi hàm này
// ngay khi được cấp, nên một bản dump của map cũng không mở được cửa nào.
const issued = new Map<string, TicketHolder & { expiresAt: number }>();

export async function issueWsTicket(userId: string): Promise<IssuedTicket | null> {
  const profile = (await templeProfile(userId)) ?? (await ensureTempleProfile(userId));
  if (!profile) return null;
  const holder: TicketHolder = { userId, playerId: profile.playerId };
  const now = Date.now();
  for (const [key, entry] of issued) {
    if (entry.expiresAt <= now) issued.delete(key);
  }
  const token = newToken();
  issued.set(hashToken(token), { ...holder, expiresAt: now + TTL_MS });
  return { token, ...holder, profile };
}

// Một vé = một phiên kết nối. Đọc xong là xoá, kể cả khi kết nối thất bại: để vé sống
// tới hết hạn nghĩa là kẻ nghe được đường dây còn nguyên quyền vào chùa.
export function redeemWsTicket(token: string | null): TicketHolder | null {
  if (!token) return null;
  const key = hashToken(token);
  const entry = issued.get(key);
  if (!entry) return null;
  issued.delete(key);
  return entry.expiresAt > Date.now() ? { userId: entry.userId, playerId: entry.playerId } : null;
}
