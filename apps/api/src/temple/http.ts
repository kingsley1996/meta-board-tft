// Nẹp chung cho các tuyến HTTP của chùa: một lần kiểm phiên, một lần bắt lỗi.
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

// id trên dây của chùa là player_id (số nguyên u32 mà frame nhị phân mang), không
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
