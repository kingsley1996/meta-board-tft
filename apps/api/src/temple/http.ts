// Nẹp chung cho các tuyến HTTP của sảnh đền: một lần kiểm phiên, một lần bắt lỗi.
//
// Vì sao không viết tay ở từng route: HUD sẽ gọi hai chục tuyến, và tuyến nào cũng
// phải trả lời y hệt nhau khi người chơi hết hạn phiên hoặc khi máy chủ từ chối một
// con số. Lặp lại mười hai lần là mười hai chỗ lệch về sau.
import type { NextFunction, Request, Response } from 'express';
import { currentSessionUser } from '../auth-routes.ts';
import type { AuthUser } from '../accounts.ts';

// Lỗi chủ động ném từ tầng dữ liệu lên, kèm mã để HUD dịch ra tiếng Việt thay vì
// đoán nghĩa từ chuỗi tiếng Anh của Postgres.
export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type TempleHandler = (req: Request, res: Response, user: AuthUser) => Promise<void>;

export function withUser(handler: TempleHandler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await currentSessionUser(req);
    if (!user) {
      res.status(401).json({ error: 'not signed in', code: 'unauthenticated' });
      return;
    }
    try {
      await handler(req, res, user);
    } catch (error) {
      if (error instanceof ApiError) {
        res.status(error.status).json({ error: error.message, code: error.code });
        return;
      }
      next(error);
    }
  };
}

// Khách (`is_guest`) chỉ cầu may: mọi nhịp để lại dấu vết trong DB nhân danh một email
// giả — kết bạn, nhắn tin, tặng quà, tùy hỷ, đổi tên — đều cần tài khoản. Điểm không
// mất: /api/auth/register nâng cấp đúng hàng users đang có phiên (accounts.ts:
// promoteGuest), nên hành trình "thử trước, đăng ký sau" vẫn giữ nguyên số liệu.
// Chỉ phần *ghi* bị chặn; các tuyến đọc trả về danh sách rỗng chứ không 403, để HUD
// vẽ nguyên một tấm CTA thay vì một hàng lỗi đỏ.
export function withAccount(handler: TempleHandler) {
  return withUser(async (req, res, user) => {
    if (user.isGuest) throw new ApiError(403, 'guest_account_required', 'a registered account is required for this');
    await handler(req, res, user);
  });
}

// Tuyến chỉ tài khoản admin (`users.role = 'admin'`) được chạm. `role` đến từ hàng
// users mà currentSessionUser đọc ra, không từ máy khách, và mã 403 `admin_only` là
// đúng mã cả repo này dùng cho các router admin (index.ts:adminGuard).
export function withAdmin(handler: TempleHandler) {
  return withUser(async (req, res, user) => {
    if (user.role !== 'admin') throw new ApiError(403, 'admin_only', 'an admin account is required for this');
    await handler(req, res, user);
  });
}

export function num(value: unknown, min: number, max: number, code: string): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < min || n > max) throw new ApiError(400, code, `expected a number between ${min} and ${max}`);
  return n;
}

export function text(value: unknown, max: number, code: string): string {
  const t = String(value ?? '').trim();
  if (!t) throw new ApiError(400, code, 'expected some text');
  // Đếm theo code point chứ không theo byte: một lời nguyện 120 ký tự tiếng Việt
  // có dấu đã là hơn 200 byte, và CHECK trên cột sẽ từ chối cả câu.
  if ([...t].length > max) throw new ApiError(400, code, `too long (max ${max} characters)`);
  return t;
}

// id trên dây của sảnh là player_id (số nguyên u32 mà frame nhị phân mang), không
// phải uuid. uuid không rời khỏi server, nên HUD muốn nhắn cho ai cũng chỉ cần biết
// cái số nó đã nhìn thấy trong chánh điện.
export function playerId(value: unknown, code = 'invalid_player_id'): number {
  return num(value, 1, 4_294_967_295, code);
}

export function idName(value: unknown, code = 'invalid_id'): string {
  const t = String(value ?? '');
  if (!/^[0-9a-z_]{1,24}$/.test(t)) throw new ApiError(400, code, 'expected a lowercase id');
  return t;
}

// Nhịp tối thiểu giữa hai lần làm cùng một việc, tính theo từng người.
//
// Con số đã nằm ở máy chủ nhưng tần suất thì máy khách quyết, nên không chặn nhịp thì
// một vòng lặp POST mua được cả bảng xếp hạng. Các mốc dưới (practice.ts, social.ts)
// đều đặt thấp hơn nhịp máy khách thật gửi — chặn kẻ spam mà không ăn gian điểm
// của người tu thật.
const lastAct = new Map<string, number>();

export function cooldown(key: string, ms: number): void {
  const now = Date.now();
  const at = lastAct.get(key);
  if (at !== undefined && now - at < ms) {
    throw new ApiError(429, 'too_fast', `slow down: next in ${Math.ceil((ms - (now - at)) / 1000)}s`);
  }
  // Cùng cách attempts của auth-routes tự dọn: một map theo user sẽ lớn dần mãi.
  if (lastAct.size > 10_000) lastAct.clear();
  lastAct.set(key, now);
}
