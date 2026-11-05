// Tuyến vào của chùa. API cho HUD sẽ về ở P2b/P3; bốn route dưới đây là nền danh
// tính: không có chúng thì không có ai để mà lưu công đức.
import { Router } from 'express';
import { attemptAllowed, attemptKey, currentSessionUser, setSessionCookie } from '../auth-routes.ts';
import { toAuthUser } from '../accounts.ts';
import { hallRouter } from './hall.ts';
import { createGuest, ensureTempleProfile, readProfilePatch, templeProfile, updateTempleProfile } from './identity.ts';
import { practiceRouter } from './practice.ts';
import { ensureTempleTables } from './schema.ts';
import { socialRouter } from './social.ts';
import { templeState } from './state.ts';
import { issueWsTicket, TICKET_TTL_MS } from './tickets.ts';
import { withUser } from './http.ts';

export const templeRouter = Router();

// Danh tính ở file này; nhịp tu tập, hoa đăng/vườn cây/bảng tri ân và bạn bè nằm
// trong từng module riêng rồi gắn vào cùng một gốc /api/temple, để HUD chỉ phải biết
// một tiền tố.
templeRouter.use(practiceRouter);
templeRouter.use(hallRouter);
templeRouter.use(socialRouter);

// Vào chùa không cần tài khoản (-- 01): một cú POST đổi lấy phiên khách (cookie như
// mọi phiên thật) và một hồ sơ nhân vật. Người đăng ký sau đó sẽ được nâng cấp chính
// hàng users này (-- 02, ở /api/auth/register), nên cây và công đức trồng từ hôm nay
// vẫn còn đó.
templeRouter.post('/guest', async (req, res) => {
  if (!attemptAllowed(attemptKey('temple_guest', req))) {
    return res.status(429).json({ error: 'too many attempts', code: 'rate_limited' });
  }
  const signedIn = await currentSessionUser(req);
  if (signedIn) {
    // Trình duyệt đã có phiên thì dùng lại — mỗi lần tải trang mà mọc thêm một
    // hàng users thì bảng khách sẽ toàn người không bao giờ quay lại.
    const profile = await ensureTempleProfile(signedIn.id);
    return res.json({ guest: signedIn.isGuest, user: signedIn, profile });
  }
  const created = await createGuest();
  setSessionCookie(res, created.token);
  res.status(201).json({ guest: true, user: toAuthUser(created.user), profile: created.profile });
});

// Máy khách gọi khi tải trang: biết mình là ai, hồ sơ ra sao, và có phải khách không.
templeRouter.get('/me', async (req, res) => {
  const user = await currentSessionUser(req);
  if (!user) return res.status(401).json({ error: 'not signed in', code: 'unauthenticated' });
  const profile = (await templeProfile(user.id)) ?? (await ensureTempleProfile(user.id));
  res.json({ guest: user.isGuest, user, profile });
});

// Nạp HUD: một request trả toàn bộ những gì một người nhìn thấy khi vào chùa — ví,
// bậc, chuỗi ngày, túi đồ và số liệu hôm nay. Tách khỏi /me vì /me trả hồ sơ danh
// tính (uuid, email) mà HUD không cần tới.
templeRouter.get('/state', withUser(async (req, res, user) => {
  await ensureTempleTables();
  const profile = await ensureTempleProfile(user.id);
  res.json({ state: await templeState(user.id, { journal: true }), guest: user.isGuest, player_id: profile.playerId });
}));

// Xin vé (-- 03) trước khi nối WebSocket. Cookie phiên đi theo request HTTP này (cùng
// host với trang, qua proxy /api của Next), còn bản thân đường WS thì không — nên vé
// là cách duy nhất máy chủ phòng biết người đang nối vào là ai, và là cách nó không
// phải tin hồ sơ do máy khách tự khai.
templeRouter.post('/ws-ticket', async (req, res) => {
  if (!attemptAllowed(attemptKey('temple_ws_ticket', req))) {
    return res.status(429).json({ error: 'too many attempts', code: 'rate_limited' });
  }
  const user = await currentSessionUser(req);
  if (!user) return res.status(401).json({ error: 'not signed in', code: 'unauthenticated' });
  const ticket = await issueWsTicket(user.id);
  if (!ticket) return res.status(503).json({ error: 'temple unavailable', code: 'temple_unavailable' });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ticket: ticket.token, expires_in_ms: TICKET_TTL_MS, profile: ticket.profile });
});

// Người chơi nặn nhân vật xong thì báo cho máy chủ cái avatar đó; không có tuyến này
// thì chánh điện chỉ biết mặc định ban đầu. Số liệu điểm (level/Sen/công đức) không
// đổi được ở đây — identity.ts chỉ nhận name/sect/appearance/equipped.
templeRouter.put('/profile', async (req, res) => {
  const user = await currentSessionUser(req);
  if (!user) return res.status(401).json({ error: 'not signed in', code: 'unauthenticated' });
  const patch = readProfilePatch(req.body);
  if (!patch) return res.status(400).json({ error: 'nothing to change', code: 'invalid_profile_patch' });
  const profile = await updateTempleProfile(user.id, patch);
  if (!profile) return res.status(404).json({ error: 'no such temple profile', code: 'profile_not_found' });
  res.json({ profile });
});
