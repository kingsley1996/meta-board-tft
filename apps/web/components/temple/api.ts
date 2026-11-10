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
  // Mốc Điểm May Mắn của bậc hiện tại và của bậc kế. Cả hai vạch tiến độ (chip HUD và
  // bảng Hồ sơ) đều đo đoạn đã đi *trong* bậc, không chia cho cả thang.
  exp_prev: number;
  exp_next: number;
  sen: number;
  ngoc: number;
  streak: number;
  best_streak: number;
  inventory: Record<string, number>;
  appearance: Record<string, string>;
  // id những nhân vật đã mở. Rỗng = chưa chọn lần nào -> 12 ô đều còn suất miễn phí.
  heroes: string[];
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
  level_ups?: { level: number; title: string; sen: number; ngoc: number }[];
  // Nhịp cầu may nào có số liệu riêng thì máy chủ bỏ vào đây (số phút thiền, số
  // số vòng vừa tròn…). HUD đọc nó để nói đúng con số thay vì tự đếm ở máy khách.
  extra?: Record<string, number | boolean>;
};

export type GameKind = 'dice' | 'rps' | 'caro';

// Một nước đi trong trận. Xúc xắc thì có `dice`/`total`; oẳn tù tì chỉ có `pick`, và
// khi vòng còn chờ bên kia thì máy chủ giấu đòn của đối thủ — bên đó chỉ còn `bonus`.
// Caro có `cell` (0..80, đọc từ `board` ra), và vì bàn cờ là công khai nên chẳng có gì
// phải giấu: nước đi chỉ để HUD nói bên đó vừa đặt ô nào.
export type GameMove = { dice?: number[]; pick?: string; cell?: number; bonus: number; total?: number };
export type GameRound = {
  round: number;
  a: GameMove;
  b: GameMove;
  winner: '' | 'a' | 'b';
  luck: [number, number];
  // Chỉ có khi caro ngã ngũ: năm ô thắng cuộc, để HUD tô sáng đúng hàng đó.
  line?: number[];
};
export type GamePlayer = PublicPlayer & { luck: number; bonus: number };
export type GameSide = { player: GamePlayer; score: number; moved: boolean; move: GameMove | null };
export type GameMatch = {
  id: number;
  kind: GameKind;
  status: 'invite' | 'live' | 'over' | 'dead';
  reason: string;
  round: number;
  max_rounds: number;
  wins_needed: number;
  a: GameSide;
  b: GameSide;
  // player_id của người thắng, null là hòa — và chỉ có khi trận đã ngã ngũ.
  winner: number | null;
  result: GameRound | null;
  // Bàn caro: 81 ký tự '.', 'a', 'b'. Máy chủ giữ bàn vì nó là sự thật của mặt trận; hai
  // môn khác trả chuỗi rỗng.
  board: string;
  at: string;
};

// Trần tỷ thí trong ngày, máy chủ tính và gửi kèm: đã nhận bao nhiêu, trần ở đâu, và ván
// vừa rồi đáng ra được bao nhiêu so với thực nhận. Có nó HUD mới nói đúng vì sao một ván
// thắng lại +0 thay để người chơi tự đoán mình bị ăn gian.
export type GameCap = { today: number; max: number; nominal?: number; awarded?: number };

export type GamesPayload = { open: GameMatch[]; history: GameMatch[]; cap: GameCap; result_ms: number };

// Một trận kết thúc thì phần thưởng của người nhận đi kèm tin báo (hoặc response),
// nên HUD không phải đoán ví tiền sau ván thắng.
export type GameOutcome = 'win' | 'lose' | 'draw';
export type GameReply = Gain & {
  match: GameMatch;
  result?: GameRound;
  waiting?: boolean;
  over?: boolean;
  outcome?: GameOutcome;
  cap?: GameCap;
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
  invalid_bot_count: 'Số bot không hợp lệ',
  invalid_player_id: 'Không tìm thấy người này',
  no_such_player: 'Người này không còn trong sảnh',
  already_friends: 'Hai bạn đã là đồng đội rồi',
  already_meditating: 'Bạn đang thiền rồi',
  not_meditating: 'Chưa có lần thiền nào để kết thúc',
  out_of_item: 'Hộp đã hết vật phẩm này',
  not_enough_sen: 'Không đủ Tinh Hoa trong ví',
  invalid_item: 'Không hiểu món đồ này',
  no_such_item: 'Sảnh không có món đồ này',
  not_for_sale: 'Món này không bày ở cửa hàng — hỏi Lão Hành Khất',
  wrong_currency: 'Món này phải trả bằng loại tiền khác',
  level_locked: 'Cần lên bậc cao hơn mới mua được món này',
  already_owned: 'Bạn đã có món này rồi',
  not_enough_ngoc: 'Không đủ Kim Cương trong ví',
  no_duyen_offer: 'Món này không nằm trên chiếu hôm nay',
  duyen_sold_out: 'Hôm nay lão bán hết phần rồi — mai hãy quay lại',
  already_exchanged: 'Món này bạn đã đổi hôm nay rồi',
  already_in_a_group: 'Bạn đang ở một tổ đội khác rồi',
  no_group: 'Bạn chưa vào tổ đội nào',
  group_full: 'Tổ đội đã đủ người',
  no_such_group: 'Mã mời này không mở được tổ đội nào',
  no_invitation: 'Người này chưa gửi lời kết bạn',
  greeting_not_found: 'Phần quà này đã mở rồi',
  invalid_wish: 'Lời nguyện quá dài',
  unknown_offering: 'Sảnh không nhận vật phẩm này',
  guest_account_required: 'Chức năng này cần tài khoản — đăng ký để giữ lại điểm đang có nhé',
  no_such_game: 'Ván này không còn trong sảnh',
  invalid_game: 'Sảnh chỉ mở ba môn: xúc xắc, oẳn tù tì và cờ caro',
  invalid_game_id: 'Không tìm thấy ván này',
  invalid_sign: 'Chọn Búa, Bao hoặc Kéo thôi',
  invalid_cell: 'Ô đó không có trên bàn',
  cell_taken: 'Ô đó đã có quân rồi',
  not_your_turn: 'Chưa tới lượt bạn',
  self_game: 'Không ai tỷ thí với chính mình',
  already_open: 'Hai bạn còn một ván chưa ngã ngũ',
  match_not_live: 'Lời mời này không còn chờ nữa',
  match_finished: 'Ván này đã kết thúc rồi',
  already_moved: 'Vòng này bạn đã ra nước đi rồi',
  not_your_game: 'Ván này không có tên bạn',
  profile_missing: 'Sảnh chưa đọc được hồ sơ của hai người này',
  admin_only: 'Khối này chỉ tài khoản admin dùng được',
  no_such_hero: 'Sảnh không vẽ được nhân vật này',
  invalid_hero: 'Không hiểu nhân vật này',
  hero_needs_purchase: 'Nhân vật phải đổi ở ô chọn hình, nơi trừ Kim Cương',
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
