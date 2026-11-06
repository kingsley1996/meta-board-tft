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
//
// Vì sao route /ws-ticket không còn giới hạn theo IP: mỗi lần nối lại phòng đều xin
// một vé, nên sau một lần deploy Render, cả một phòng máy/trợ lý chung một NAT sẽ
// reconnect cùng phút. Trần 10 request/phút/IP của auth-routes chặn người thật trước
// cả bot. Cửa đúng ở đây là *số vé một người đang giữ chưa dùng*, vì vé chỉ sống
// TTL_MS giây và bị đốt ngay khi đọc — kẻ thử lại mãi vé cũ không tích thêm được gì,
// còn người thật thì hai tab + vài lần rớt mạng vẫn nằm trong trần.
import { hashToken, newToken } from '../accounts.ts';
import { ensureTempleProfile, templeProfile, type TempleProfile } from './identity.ts';

const TTL_MS = 15_000;
export const TICKET_TTL_MS = TTL_MS;
// Đủ cho hai tab của cùng một người mở cùng lúc, cộng vài vé của những lần nối bị
// đứt mà chưa kịp dùng.
export const LIVE_TICKETS_PER_USER = 5;

export type TicketHolder = { userId: string; playerId: number };
export type IssuedTicket = TicketHolder & { token: string; profile: TempleProfile };
export type TicketIssue = { ok: true; ticket: IssuedTicket } | { ok: false; reason: 'capped' | 'profile_unavailable' };

// key là bản sha256 của vé, giống cách lưu session token: chuỗi thật rời khỏi hàm này
// ngay khi được cấp, nên một bản dump của map cũng không mở được cửa nào.
const issued = new Map<string, TicketHolder & { expiresAt: number }>();

export async function issueWsTicket(userId: string): Promise<TicketIssue> {
  const now = Date.now();
  let live = 0;
  for (const [key, entry] of issued) {
    if (entry.expiresAt <= now) {
      issued.delete(key);
      continue;
    }
    if (entry.userId === userId) live += 1;
  }
  if (live >= LIVE_TICKETS_PER_USER) return { ok: false, reason: 'capped' };

  const profile = (await templeProfile(userId)) ?? (await ensureTempleProfile(userId));
  if (!profile) return { ok: false, reason: 'profile_unavailable' };
  const token = newToken();
  issued.set(hashToken(token), { userId, playerId: profile.playerId, expiresAt: now + TTL_MS });
  return { ok: true, ticket: { token, userId, playerId: profile.playerId, profile } };
}

// Một vé = một phiên kết nối. Đọc xong là xoá, kể cả khi kết nối thất bại: để vé sống
// tới hết hạn nghĩa là kẻ nghe được đường dây còn nguyên quyền vào chùa.
//
// Lý do phải phân biệt "hết hạn" với "không phải vé": máy khách xin vé rồi mở socket
// ngay trong cùng một nhịp, nhưng dựng cảnh chùa là một khúc blocking dài của main
// thread. Máy yếu thì khoảng đó vượt TTL, vé chết trước khi socket kịp nối, và nếu coi
// nó như vé giả thì người thật bị khoá ngoài chánh điện cả phiên.
export type TicketRedeem = { ok: true; holder: TicketHolder } | { ok: false; reason: 'absent' | 'unknown' | 'expired' };

export function redeemWsTicket(token: string | null): TicketRedeem {
  if (!token) return { ok: false, reason: 'absent' };
  const key = hashToken(token);
  const entry = issued.get(key);
  if (!entry) return { ok: false, reason: 'unknown' };
  issued.delete(key);
  return entry.expiresAt > Date.now()
    ? { ok: true, holder: { userId: entry.userId, playerId: entry.playerId } }
    : { ok: false, reason: 'expired' };
}
