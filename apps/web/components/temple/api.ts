// Client HTTP của sảnh đền. Một hàm duy nhất để HUD không chỗ nào tự đoán mã lỗi:
// máy chủ trả { error, code }, và code là thứ dịch ra tiếng Việt được.
'use client';

export type PracticeDay = {
  day: string;
  bows: number;
  meditateMin: number;
  visits: number;
  exp: number;
};

export type TempleState = {
  id: number;
  name: string;
  sect: string;
  title: string;
  honor: string;
  level: number;
  exp: number;
  exp_next: number;
  sen: number;
  ngoc: number;
  streak: number;
  best_streak: number;
  inventory: Record<string, number>;
  appearance: Record<string, string>;
  equipped: Record<string, string | null>;
  buff_until: string | null;
  meditate_start: string | null;
  today: PracticeDay;
  lifetime: PracticeDay;
  journal?: { day: string; exp: number }[];
};

// Người khác trong sảnh: không có ví, không có điểm may.
export type PublicPlayer = {
  id: number;
  name: string;
  sect: string;
  title: string;
  honor: string;
  level: number;
};

// Trả lời của POST /guest — hồ sơ danh tính máy chủ vừa cấp. Phần này đủ để dựng avatar
// trong sảnh mà chưa cần tới số điểm của hôm nay, nên cảnh bắt đầu xây ngay thay vì
// chờ thêm một round trip nữa.
export type GuestReply = {
  guest: boolean;
  profile: {
    playerId: number;
    name: string;
    sect: string;
    title: string;
    honor: string;
    level: number;
    appearance: Record<string, unknown>;
    equipped: Record<string, string | null>;
  };
};

export type Gain = {
  state: TempleState;
  gained?: number;
  level_ups?: { level: number; title: string; sen: number }[];
  // Nhịp cầu may nào có số liệu riêng thì máy chủ bỏ vào đây (số phút thiền, số
  // số vòng vừa tròn…). HUD đọc nó để nói đúng con số thay vì tự đếm ở máy khách.
  extra?: Record<string, number | boolean>;
};

export class TempleApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Câu tiếng Anh của máy chủ dành cho logs; người chơi chỉ thấy tiếng Việt.
const MESSAGES: Record<string, string> = {
  unauthenticated: 'Phiên đã hết hạn, vào lại sảnh nhé',
  too_fast: 'Chậm một nhịp nhé, sảnh vừa ghi nhận bạn rồi',
  invalid_count: 'Số lần không hợp lệ',
  invalid_player_id: 'Không tìm thấy người này',
  no_such_player: 'Người này không còn trong sảnh',
  already_friends: 'Hai bạn đã là đồng đội rồi',
  already_meditating: 'Bạn đang thiền rồi',
  not_meditating: 'Chưa có lần thiền nào để kết thúc',
  out_of_item: 'Hộp đã hết vật phẩm này',
  not_enough_sen: 'Không đủ Tinh Hoa trong ví',
  already_in_a_group: 'Bạn đang ở một tổ đội khác rồi',
  no_group: 'Bạn chưa vào tổ đội nào',
  group_full: 'Tổ đội đã đủ người',
  no_such_group: 'Mã mời này không mở được tổ đội nào',
  no_invitation: 'Người này chưa gửi lời kết bạn',
  greeting_not_found: 'Phần quà này đã mở rồi',
  invalid_wish: 'Lời nguyện quá dài',
  unknown_offering: 'Sảnh không nhận vật phẩm này',
};

export async function templeApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const sending = init.body !== undefined;
  const res = await fetch(`/api/temple${path}`, {
    method: sending ? (init.method ?? 'POST') : 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    ...(sending ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) } : {}),
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // đáp viên rỗng (HEAD/502 của proxy) thì coi như không có gì để đọc
  }
  if (!res.ok) {
    const code = String(body.code ?? `http_${res.status}`);
    // Mã lỗi là thứ dịch được; câu tiếng Anh trong `error` chỉ dành cho logs.
    throw new TempleApiError(res.status, code, MESSAGES[code] ?? 'Việc này sảnh chưa làm được, thử lại sau nhé');
  }
  return body as T;
}

export const get = <T>(path: string) => templeApi<T>(path);
export const post = <T>(path: string, body?: unknown) => templeApi<T>(path, { method: 'POST', body: body ?? {} });
export const put = <T>(path: string, body: unknown) => templeApi<T>(path, { method: 'PUT', body });

// Vé mở phòng: chỉ dùng một lần và vài giây là hết hạn, nên lần nào nối cũng xin cái mới.
// Phiên đã được dựng một lần ở temple-app khi tải trang, nên đây không phải chỗ tạo khách.
export async function wsTicket(): Promise<string> {
  const { ticket } = await post<{ ticket: string }>('/ws-ticket');
  return ticket;
}
