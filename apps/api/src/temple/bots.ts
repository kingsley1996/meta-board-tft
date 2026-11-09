// Bot của chánh điện: những "người" đứng cùng người thật trong sảnh.
//
// Bốn quyết định đã chốt (2026-11-08):
//  - Số bot do admin chọn (0..20), luôn có mặt kể cả khi đền vắng hay đông.
//  - Chỉ chào/đấu với người thật, không bao giờ với bot khác; lời mời và trận bỏ dở
//    tự chuyển 'dead' sau STALE_MS nhờ nhịp quét trong work().
//  - Điểm, BXH, sổ ngày như người thật: bot có hàng temple_practice và tự kiếm thêm.
//    Kinh tế thường: mọi phần thưởng đi qua đúng hàm mà HUD gọi, nên trần ngày (tỷ thí
//    120 điểm, thiền 60 phút một nhịp và 240 phút một ngày) tự áp dụng cho bot.
//  - Không có nhãn "bot" ở bất kỳ đâu: chúng là hàng users + temple_profiles như mọi
//    hàng khác, chỉ khác chỗ không có phiên và không có mật khẩu.
//
// Vì sao bot đứng trong phòng bằng RoomMember chứ không xin vé WebSocket: phòng dựng
// thành viên từ một kết nối thật, và bot thì không có kết nối. Một RoomMember có
// `send` rỗng là đúng bản chất của nó — avatar ai cũng nhìn thấy, còn tin nhắn gửi cho
// nó thì rơi vào khoảng không, nên bot phải tự quay lại bàn đọc (duel, quà, lời mời)
// thay vì chờ được báo.
//
// Vì sao bot gọi thẳng tầng dữ liệu thay vì fetch('/api/temple/...'): mọi tuyến ghi đều
// đứng sau withAccount, mà khách thì bị chặn có chủ ý (http.ts:50). Đi đường vòng qua
// HTTP là phải dựng một lớp vé-giả-cookie-giả chỉ để gọi được chính hàm đã nằm trong
// process này.
import { pool } from '../db.ts';
import { createUser } from '../accounts.ts';
import { bestMove, type CaroSide } from './caro.ts';
import { STALE_MS, acceptMatch, expireStaleGames, inviteMatch, moveMatch } from './games.ts';
import { TEMPLE_ID } from './hall.ts';
import { ApiError } from './http.ts';
import { ensureTempleProfile, templeProfile, toPlayerProfile, updateTempleProfile } from './identity.ts';
import {
  MAX_MEDITATE_MIN,
  MAX_MEDITATE_MIN_DAY,
  MERIT_PER,
  addMerit,
  bumpPractice,
  practiceToday,
  touchStreak,
  vnDay,
} from './merit.ts';
import { ROOM_TICK_MS, type RoomMember, type TempleRooms } from './rooms.ts';
import { acceptFriend, sendGreeting } from './social.ts';
import { ensureTempleTables } from './schema.ts';
import type { PlayerProfile, PlayerState } from './protocol.ts';

export type TempleBots = { stop: () => void };

// Phòng mà máy khách nối tới (ws.ts:93-94).
const HALL = TEMPLE_ID;
const ROOM = 'chung';

// Nhịp hình thể bằng đúng nhịp phát frame của phòng để một cú bước được đẩy đi liền
// mạch; máy khách nội suy theo dt*8 (world.js:1168) nên 4 lần/giây là đủ mượt.
const BEAT_MS = ROOM_TICK_MS;
// Đúng tốc độ bước của người thật (world.js:1138) — bot đi nhanh hơn là trông như trượt.
const SPEED = 2.8;
// Một cú lạy dài đúng chu kỳ của máy khách (avatar.js:1024 BOW_TIME = 2,6 s): bot đếm
// số cái theo đồng hồ thật nên điều người ta nhìn thấy và điều ghi vào sổ là một.
const BOW_MS = 2600;
// Người thật gom 4 cú một gói rồi mới gửi (temple-app.tsx:277); bot cũng gom từng ấy.
const BOW_BATCH = 4;
const PRESENCE_BEATS = 8;
export const BOT_MAX = 20;
const BOT_DEFAULT = 6;
// Số bot là một hàng trong temple_settings chứ không phải biến RAM: admin đổi một
// lần là cả sảnh (và lần restart sau) thấy cùng một con số. Bản trong process chỉ
// được đọc lại theo nhịp này để một instance khác sửa thì cũng dần khớp.
const BOT_REFRESH_MS = 60_000;
// Nhịp quét trận quá hạn. STALE_MS là 10 phút; quét mỗi phút để hàng chết không nằm
// lại lâu hơn một nhịp thở của người đang chờ.
const GAME_SWEEP_MS = 60_000;
// Khoảng lặng chào giữa hai lần tới một người thật, tính chung mọi bot. Không có nó
// thì sáu bot, mỗi bot 45–120 giây, biến hộp thư của người đứng lâu thành một dòng thác.
const GREET_QUIET_MS = 5 * 60_000;
// Khoảng lặng tỷ thí, cùng nghĩa với chào nhưng cho lời mời đánh: nhịp duel 6–14 giây
// và cửa 30% là để bot *đáp ứng* nước đi của ván đang live kịp thời, không phải để mời.
// Một người vì thế nhận tối đa một lời mời bot trong chặng này, tính chung mọi bot.
const DUEL_QUIET_MS = 5 * 60_000;
let botCount = BOT_DEFAULT;
let botCountAt = 0;
let gameSweepAt = 0;
let botUsers = new Set<string>();

export async function readBotCount(): Promise<number> {
  const { rows } = await pool.query<{ value: string }>("SELECT value FROM temple_settings WHERE key = 'bot_count'");
  const n = Number(rows[0]?.value);
  return Number.isInteger(n) ? Math.min(Math.max(n, 0), BOT_MAX) : BOT_DEFAULT;
}

export async function saveBotCount(n: number): Promise<void> {
  await pool.query(
    `INSERT INTO temple_settings (key, value) VALUES ('bot_count', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [String(n)],
  );
  botCount = n;
  botCountAt = Date.now();
}

// ---- lưới bệ ngồi ---------------------------------------------------------------
//
// Chép từ theme.cushions của đền 'nhattru' trong vendor/temple/data/meta.json, và thứ
// tự phải đúng như vòng lặp dựng ghế trong temple.js:402 (hàng trước, cột sau) vì chỉ
// số ghế trên dây là máy khách dùng để đặt avatar.
const COLS = [-8.8, -6.4, -4, -1.6, 1.6, 4, 6.4, 8.8];
const ROWS = 7;
const Z0 = -5.6;
const DZ = 2.4;
const SEATS = COLS.length * ROWS;
// Kẽ giữa hai cột ghế — đi dọc đây thì không băng qua người đang ngồi.
const AISLES = [-7.6, -5.2, -2.8, 0, 2.8, 5.2, 7.6];
// Dải sàn giữa ban thờ và hàng ghế đầu: chỗ đứng nhìn lên ban thờ, và yaw 0 là hướng
// ban thờ (thế ngồi bị máy khách khoá về 0 — world.js:1168).
const FRONT_Z = -6.9;

type Point = { x: number; z: number };

const seatOf = (i: number): Point => ({ x: COLS[i % COLS.length], z: Z0 + Math.floor(i / COLS.length) * DZ });
const nearest = (list: number[], x: number): number => list.reduce((best, v) => (Math.abs(v - x) < Math.abs(best - x) ? v : best), list[0]);
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)] as T;
const rnd = (min: number, max: number): number => min + Math.random() * (max - min);

// ---- dàn nhân vật ---------------------------------------------------------------

type BotDef = {
  slug: string;
  name: string;
  sect: string;
  // Tổng điểm tích luỹ lúc mới sinh ra trong DB, và số ngày ghi sổ tương ứng: hai con
  // số này quyết định bậc trên đầu avatar và chỗ đứng trên BXH tuần.
  exp: number;
  days: number;
  look: { hero: string; gender: 'nam' | 'nu'; hair: string; skin: string };
  kit: { robe: string; beads: string; cushion: string; hat: string | null; staff: string | null; cloud: string | null; pet: string | null };
};

// Hai mươi bot cho chánh điện: các hình của avatar.js:HERO_LIST được dùng lại
// với tóc/skin/đồ khác nhau, vì giới hạn bot của admin là 20 (BOT_MAX). Trang phục
// bậc thấp đứng trước, bậc cao đứng sau: một người vận Như Ý mà mặc áo tặng ngày
// đầu thì ngược nhau.
const ROSTER: BotDef[] = [
  {
    slug: 'minh_anh', name: 'Thích Tiêu Tiền', sect: 'reroll', exp: 260, days: 6,
    look: { hero: 'luffy_g5', gender: 'nam', hair: 'ngan', skin: '#f5cba7' },
    kit: { robe: 'ao_lam', beads: 'chuoi_go', cushion: 'bd_nau', hat: null, staff: null, cloud: null, pet: 'lt_huou' },
  },
  {
    slug: 'an_nhien', name: 'bé bơ', sect: 'flex', exp: 360, days: 5,
    look: { hero: 'naruto_sage', gender: 'nu', hair: 'ngan', skin: '#f7d9b8' },
    kit: { robe: 'ao_vang', beads: 'chuoi_go', cushion: 'bd_sen', hat: null, staff: null, cloud: null, pet: 'lt_tho_ngoc' },
  },
  {
    slug: 'dieu_lien', name: 'giang đẫm', sect: 'tempo', exp: 420, days: 8,
    look: { hero: 'naruto_sage', gender: 'nu', hair: 'dai', skin: '#efd6bb' },
    kit: { robe: 'ao_xam', beads: 'chuoi_bode', cushion: 'bd_xam', hat: null, staff: null, cloud: null, pet: 'lt_tho_ngoc' },
  },
  {
    slug: 'tinh_yen', name: 'Cà Khịa Chúa', sect: 'tempo', exp: 540, days: 7,
    look: { hero: 'sanji', gender: 'nu', hair: 'dai', skin: '#f3c6a5' },
    kit: { robe: 'ao_cam_lan', beads: 'chuoi_tudan', cushion: 'bd_xam', hat: null, staff: null, cloud: null, pet: 'lt_su_tu_xanh' },
  },
  {
    slug: 'hai_dang', name: 'Top 4 Là Đủ', sect: 'flex', exp: 620, days: 7,
    look: { hero: 'zoro', gender: 'nam', hair: 'trau', skin: '#e8b48c' },
    kit: { robe: 'ao_nau', beads: 'chuoi_go', cushion: 'bd_vang', hat: 'mu_kim_co', staff: null, cloud: null, pet: null },
  },
  {
    slug: 'bao_long', name: 'Thích chơi game', sect: 'fast8', exp: 780, days: 8,
    look: { hero: 'zoro', gender: 'nam', hair: 'trau', skin: '#dcb088' },
    kit: { robe: 'ao_vulan', beads: 'chuoi_hophach', cushion: 'bd_vang', hat: 'mu_kim_co', staff: 'tr_tre_nga', cloud: null, pet: null },
  },
  {
    slug: 'thanh_tung', name: 'roll không ra 3 sao', sect: 'fast8', exp: 900, days: 10,
    look: { hero: 'sasuke', gender: 'nam', hair: 'ngan', skin: '#f0c9a8' },
    kit: { robe: 'ao_trang', beads: 'chuoi_tram', cushion: 'bd_nau', hat: null, staff: 'tr_thien_truong', cloud: null, pet: 'lt_nghe' },
  },
  {
    slug: 'cam_tu', name: 'Chị Đại Số Nhọ', sect: 'reroll', exp: 1100, days: 9,
    look: { hero: 'shanks', gender: 'nu', hair: 'dai', skin: '#efd6bb' },
    kit: { robe: 'ao_hoa_sala', beads: 'chuoi_ngoc', cushion: 'bd_mai_rua', hat: null, staff: null, cloud: null, pet: 'lt_trau_vang' },
  },
  {
    slug: 'ngoc_diep', name: 'Mèo Lười Đánh TFT', sect: 'tempo', exp: 1250, days: 9,
    look: { hero: 'sanji', gender: 'nam', hair: 'dai', skin: '#f7d9b8' },
    kit: { robe: 'ao_sen', beads: 'chuoi_go', cushion: 'bd_sen', hat: null, staff: null, cloud: null, pet: 'lt_su_tu_xanh' },
  },
  {
    slug: 'dong_phong', name: 'Dân Chơi Không Ngại Mưa', sect: 'flex', exp: 1550, days: 10,
    look: { hero: 'itachi', gender: 'nam', hair: 'ngan', skin: '#e6bd94' },
    kit: { robe: 'ao_truc', beads: 'chuoi_thach_anh', cushion: 'bd_tuyet', hat: null, staff: 'tr_kim_co_bong', cloud: 'may_can_dau', pet: null },
  },
  {
    slug: 'hue_tam', name: 'Ông Hoàng Về Nhì', sect: 'reroll', exp: 1750, days: 12,
    look: { hero: 'kakashi', gender: 'nam', hair: 'trau', skin: '#e6bd94' },
    kit: { robe: 'ao_vulan', beads: 'chuoi_bode', cushion: 'bd_may', hat: 'mu_tu_kim', staff: null, cloud: null, pet: null },
  },
  {
    slug: 'ngoc_han', name: 'Tấm Chiếu Mới', sect: 'tempo', exp: 2100, days: 11,
    look: { hero: 'kakashi', gender: 'nu', hair: 'dai', skin: '#f5d0b5' },
    kit: { robe: 'ao_sen', beads: 'chuoi_luu_ly', cushion: 'bd_ngoc', hat: 'mu_ty_lu', staff: null, cloud: null, pet: 'lt_huyen_vu' },
  },
  {
    slug: 'quoc_bao', name: 'Độc Lạ Bình Dương', sect: 'flex', exp: 2400, days: 11,
    look: { hero: 'law', gender: 'nam', hair: 'ngan', skin: '#f1c9a0' },
    kit: { robe: 'ao_truc', beads: 'chuoi_thach_anh', cushion: 'bd_tuyet', hat: null, staff: 'tr_dinh_ba', cloud: null, pet: 'lt_chu_tuoc' },
  },
  {
    slug: 'van_du', name: 'Không Có Gì Ngoài Đam Mê', sect: 'fast8', exp: 2900, days: 12,
    look: { hero: 'law', gender: 'nam', hair: 'trau', skin: '#f1c9a0' },
    kit: { robe: 'ao_nguyet', beads: 'chuoi_dua_do', cushion: 'bd_tram_sen', hat: null, staff: 'tr_nguyet_nha', cloud: 'may_song_bac', pet: 'lt_bach_tuong' },
  },
  {
    slug: 'phuong_nam', name: 'anh ba khía', sect: 'fast8', exp: 3300, days: 13,
    look: { hero: 'itachi', gender: 'nam', hair: 'dai', skin: '#dcb088' },
    kit: { robe: 'ao_nguyet', beads: 'chuoi_tram', cushion: 'bd_ngoc', hat: null, staff: null, cloud: 'may_can_dau', pet: 'lt_huyen_vu' },
  },
  {
    slug: 'truong_an', name: 'Bỉm Sữa Đánh TFT', sect: 'reroll', exp: 3900, days: 13,
    look: { hero: 'minato', gender: 'nam', hair: 'ngan', skin: '#f5cba7' },
    kit: { robe: 'ao_hoang_kim', beads: 'chuoi_kim', cushion: 'bd_kim_lien', hat: 'mu_non_than', staff: 'tr_gay_than', cloud: null, pet: 'lt_thanh_long' },
  },
  {
    slug: 'chan_nhu', name: 'Linh Hồn Của Gió', sect: 'tempo', exp: 4600, days: 14,
    look: { hero: 'ace', gender: 'nam', hair: 'ngan', skin: '#f5cba7' },
    kit: { robe: 'ao_may_bac', beads: 'chuoi_luu_ly', cushion: 'bd_tram_sen', hat: 'mu_ty_lu', staff: 'tr_nguyet_nha', cloud: null, pet: 'lt_bach_tuong' },
  },
  {
    slug: 'bich_dao', name: 'Pha Cà Rốt', sect: 'reroll', exp: 6200, days: 16,
    look: { hero: 'shanks', gender: 'nu', hair: 'dai', skin: '#efd6bb' },
    kit: { robe: 'ao_lien_hoa', beads: 'chuoi_ngoc', cushion: 'bd_mai_rua', hat: null, staff: null, cloud: null, pet: 'lt_trau_vang' },
  },
  {
    slug: 'quang_dung', name: 'chơi cho vui', sect: 'flex', exp: 8200, days: 15,
    look: { hero: 'minato', gender: 'nam', hair: 'ngan', skin: '#e8b48c' },
    kit: { robe: 'ao_thien_thanh', beads: 'chuoi_kim', cushion: 'bd_kim_lien', hat: 'mu_non_than', staff: 'tr_gay_than', cloud: null, pet: 'lt_thanh_long' },
  },
  {
    slug: 'ha_son', name: 'spam roll', sect: 'tempo', exp: 11500, days: 18,
    look: { hero: 'kaido', gender: 'nam', hair: 'trau', skin: '#d9a97c' },
    kit: { robe: 'tang_bao', beads: 'chuoi_dau', cushion: 'bd_vang', hat: null, staff: 'tr_tram_dot', cloud: 'may_song_bac', pet: 'lt_bach_tuong' },
  },
];

// Lời chúc gửi cho người. Câu chúc nào cũng có chữ: một thẻ thông báo chỉ toàn icon
// không nói được ai vừa chúc mình, còn quà tặng giữa hai bot thì không cần lời.
const WISHES = [
  'Chúc bạn một ngày toàn top 4',
  'Chúc bạn về đúng bài mình cần',
  'Chúc bạn lên 3 sao đúng chủ lực',
  'Chúc bạn queue sạch, không gặp người bỏ trận',
  'Chúc bạn vào trận tay vững',
  'Chúc bạn đủ vàng đúng nhịp',
  'Chúc bạn một ván không ai tranh bài',
  'Chúc bạn thắng round cuối bằng một máu',
];

const SIGNS = ['bua', 'bao', 'keo'];
const EMOTES = ['pray', 'smile'];

// ---- sổ bot ---------------------------------------------------------------------

type Seeded = { def: BotDef; userId: string; playerId: number };
type Mood = 'sit' | 'pray' | 'roam';

type Bot = {
  entry: Seeded;
  profile: PlayerProfile;
  member: RoomMember;
  // Ghế của bot, và ghế đang báo trên dây (-1 = đang đứng giữa sân).
  cushion: number;
  seat: number;
  pos: Point;
  yaw: number;
  anim: number;
  path: Point[];
  mood: Mood;
  // 0 = còn đang đi, chưa tới chỗ làm việc. Điểm chỉ cộng cho phần đã *đến nơi*.
  begun: number;
  until: number;
  meditate: boolean;
  // Nhịp cầu may: số cú còn thiếu, số đã lạy nhưng chưa ghi sổ, và mốc cú kế tiếp.
  bowsLeft: number;
  bowsQueued: number;
  nextBow: number;
  next: { greet: number; duel: number; inbox: number; emote: number };
};

export function startTempleBots(rooms: TempleRooms): TempleBots {
  const present = new Map<string, Bot>();
  let seeded: Seeded[] = [];
  let botIds = new Set<number>();
  let running = false;
  let beat = 0;

  // ---- hình thể ----

  // stateOf đứng riêng khỏi Bot vì lúc vừa sinh ra một bot thì member còn chưa gắn vào
  // nó: tư thế đầu tiên phải có trước khi đối tượng tồn tại, không được bịa một Bot giả.
  type Pose = { id: number; pos: Point; yaw: number; seat: number; anim: number };

  function stateOf(p: Pose): PlayerState {
    return {
      id: p.id,
      x: +p.pos.x.toFixed(2),
      z: +p.pos.z.toFixed(2),
      y: 0,
      r: +p.yaw.toFixed(3),
      seat: p.seat,
      a: p.anim,
    };
  }

  const poseOf = (bot: Bot): Pose => ({ id: bot.profile.id, pos: bot.pos, yaw: bot.yaw, seat: bot.seat, anim: bot.anim });

  function push(bot: Bot): void {
    rooms.markDirty(bot.member, stateOf(poseOf(bot)));
  }

  // Đi theo đường chữ U: ra kẽ giữa hai cột ghế, dọc theo kẽ ấy tới hàng của đích, rồi
  // mới chéo vào chỗ. Một đường thẳng từ ghế này sang ghế kia là đi xuyên ba người.
  function walkTo(bot: Bot, to: Point): void {
    bot.seat = -1;
    bot.anim = 1;
    const lane = nearest(AISLES, to.x);
    bot.path = [
      { x: lane, z: bot.pos.z },
      { x: lane, z: to.z },
      to,
    ];
    bot.begun = 0;
  }

  function step(bot: Bot, now: number): void {
    const goal = bot.path[0];
    if (!goal) {
      if (bot.mood === 'roam' && now < bot.until) walkTo(bot, spotOnFloor());
      return;
    }
    const dx = goal.x - bot.pos.x;
    const dz = goal.z - bot.pos.z;
    const d = Math.hypot(dx, dz);
    const stride = (SPEED * BEAT_MS) / 1000;
    bot.yaw = Math.atan2(-dx, -dz);
    if (d <= stride + 0.02) {
      bot.pos = { x: goal.x, z: goal.z };
      bot.path.shift();
    } else {
      bot.pos = { x: bot.pos.x + (dx / d) * stride, z: bot.pos.z + (dz / d) * stride };
    }
    if (bot.path.length) {
      push(bot);
      return;
    }
    // Tới nơi: ngồi xuống ghế của mình, cúi lạy, hoặc đứng chơi.
    bot.begun = now;
    if (bot.mood === 'sit') {
      bot.seat = bot.cushion;
      bot.yaw = 0;
      bot.anim = bot.meditate ? 3 : 0;
    } else if (bot.mood === 'pray') {
      // Cầu may của người thật là *ngồi trên bệ* rồi lạy — bấm nút khi chưa ngồi thì
      // máy khách tự ngồi xuống (temple-app.tsx:284), nên bot cũng vậy: về ghế của mình,
      // yaw 0 hướng ban thờ, và giữ thế lạy trên dây cho tới cú cuối.
      bot.seat = bot.cushion;
      bot.yaw = 0;
      bot.anim = 2;
      bot.nextBow = now + BOW_MS;
    } else {
      bot.anim = 0;
    }
    push(bot);
  }

  function spotOnFloor(): Point {
    const front = Math.random() < 0.4;
    return { x: pick(COLS), z: front ? rnd(FRONT_Z, -6.4) : rnd(Z0, Z0 + (ROWS - 1) * DZ) };
  }

  // ---- chọn việc ----

  function choose(bot: Bot, now: number): void {
    const roll = Math.random();
    bot.meditate = false;
    bot.bowsLeft = 0;
    bot.bowsQueued = 0;
    bot.nextBow = 0;
    // Không có ghế thì không ngồi được: hai việc dưới đây bỏ, chỉ còn đi dạo.
    if (bot.cushion < 0) {
      roam(bot, now);
      return;
    }
    if (roll < 0.4) {
      bot.mood = 'sit';
      bot.meditate = Math.random() < 0.5;
      bot.until = now + walkMs(bot, seatOf(bot.cushion)) + rnd(60_000, 240_000);
      walkTo(bot, seatOf(bot.cushion));
    } else if (roll < 0.8) {
      bot.mood = 'pray';
      bot.bowsLeft = Math.round(rnd(3, 8));
      bot.until = now + walkMs(bot, seatOf(bot.cushion)) + bot.bowsLeft * BOW_MS + 1200;
      walkTo(bot, seatOf(bot.cushion));
    } else {
      roam(bot, now);
    }
    push(bot);
  }

  function roam(bot: Bot, now: number): void {
    bot.mood = 'roam';
    const to = spotOnFloor();
    bot.until = now + walkMs(bot, to) + rnd(20_000, 45_000);
    walkTo(bot, to);
  }

  function walkMs(bot: Bot, to: Point): number {
    const lane = nearest(AISLES, to.x);
    const d = Math.abs(lane - bot.pos.x) + Math.abs(to.z - bot.pos.z) + Math.abs(to.x - lane);
    return (d / SPEED) * 1000;
  }

  // Đồng hồ lạy chạy trong lúc bot ngồi yên: mỗi BOW_MS là một cú, gom đủ gói thì ghi
  // sổ bằng đúng công thức mà tuyến /practice của người chơi dùng (practice.ts:65-67).
  // Không bao giờ cộng vượt số cú đã lạy, nên bot không bao giờ giàu hơn người thật.
  async function bowTick(bot: Bot, now: number): Promise<void> {
    if (bot.mood !== 'pray' || !bot.begun || bot.bowsLeft <= 0 || now < bot.nextBow) return;
    bot.bowsLeft -= 1;
    bot.bowsQueued += 1;
    bot.nextBow += BOW_MS;
    if (bot.bowsLeft === 0) {
      bot.anim = 0;
      push(bot);
    }
    if (bot.bowsQueued < BOW_BATCH) return;
    await credit(bot, { exp: bot.bowsQueued * MERIT_PER.bow, practice: { bows: bot.bowsQueued } });
    bot.bowsQueued = 0;
  }

  async function settle(bot: Bot, now: number): Promise<void> {
    if (!bot.begun) return;
    const held = Math.max(0, now - bot.begun);
    if (bot.mood === 'pray') {
      // Phần lẻ chưa thành gói: cùng một cách flush mà máy khách làm trước khi đứng dậy.
      if (bot.bowsQueued) await credit(bot, { exp: bot.bowsQueued * MERIT_PER.bow, practice: { bows: bot.bowsQueued } });
      bot.bowsQueued = 0;
    } else if (bot.mood === 'sit' && bot.meditate) {
      const today = await practiceToday(bot.entry.userId);
      const minutes = Math.min(
        Math.max(1, Math.round(held / 60_000)),
        MAX_MEDITATE_MIN,
        Math.max(0, MAX_MEDITATE_MIN_DAY - (today.meditateMin ?? 0)),
      );
      if (minutes > 0) await credit(bot, { exp: minutes * MERIT_PER.meditate_min, practice: { meditateMin: minutes } });
    }
  }

  // Cộng điểm rồi đối chiếu lại hồ sơ: bậc trên đầu avatar lấy từ profile trên dây, nên
  // một cú lên vận mà không phát lại hồ sơ thì cả hall vẫn gọi người đó bằng bậc cũ.
  async function credit(bot: Bot, gain: { exp: number; practice?: { bows?: number; meditateMin?: number } }): Promise<void> {
    await addMerit(bot.entry.userId, gain);
    await touchStreak(bot.entry.userId);
    await refresh(bot);
  }

  async function refresh(bot: Bot): Promise<void> {
    const fresh = await templeProfile(bot.entry.userId);
    if (!fresh) return;
    const next = toPlayerProfile(fresh);
    if (next.level === bot.profile.level && next.title === bot.profile.title && next.name === bot.profile.name) return;
    bot.profile = next;
    bot.member.profile = next;
    rooms.publish(HALL, ROOM, JSON.stringify({ t: 'prof', p: [next] }));
  }

  // ---- việc xã hội ----

  function others(bot: Bot): RoomMember[] {
    return rooms.members(HALL, ROOM).filter((m) => m.profile.id !== bot.profile.id);
  }

  async function greet(bot: Bot): Promise<void> {
    // Chỉ người thật: bot chào bot là một vòng quà không ai đọc, và mỗi lời chúc còn
    // cộng điểm cho cả hai bên.
    const peers = others(bot).filter((m) => !botIds.has(m.profile.id));
    if (!peers.length) return;
    // Mỗi người chỉ nhận một lời chào mỗi 5 phút, tính chung mọi bot: sáu bot hẹn giờ
    // riêng sẽ dội hàng loạt thông báo lên cùng một người. Lọc theo người nhận thay vì
    // theo cặp bot-người để người đứng lâu không bị đổi bot liên tục chào.
    const { rows } = await pool.query<{ player_id: string }>(
      `SELECT pr.player_id FROM temple_profiles pr
        WHERE pr.player_id = ANY($1::bigint[])
          AND NOT EXISTS (
            SELECT 1 FROM temple_greetings g
             WHERE g.to_user = pr.user_id
               AND g.created_at > now() - ($2::int * INTERVAL '1 millisecond')
          )`,
      [peers.map((m) => m.profile.id), GREET_QUIET_MS],
    );
    if (!rows.length) return;
    await sendGreeting(bot.entry.userId, Number(pick(rows).player_id), 'chuc', pick(WISHES), 0);
  }

  // Hộp thư của bot chỉ còn việc phải làm: quà tới tay là đã ghi sổ và đã cộng thưởng
  // ở social.ts:sendGreeting, nên không còn gì để "mở" nữa.
  async function inbox(bot: Bot): Promise<void> {
    const asked = await pool.query<{ player_id: string }>(
      `SELECT pr.player_id FROM temple_friends f JOIN temple_profiles pr ON pr.user_id = f.user_id
        WHERE f.friend_id = $1 AND f.status = 'pending' ORDER BY f.created_at ASC LIMIT 3`,
      [bot.entry.userId],
    );
    for (const row of asked.rows) {
      const id = Number(row.player_id);
      // Lời mời kết bạn còn sót từ bot khác (trước luật chỉ tương tác với người thật)
      // không được tự nhận: nó sẽ mở một quan hệ không ai yêu cầu.
      if (!botIds.has(id)) await acceptFriend(bot.entry.userId, id);
    }
  }

  // Chỉ mời người thật đang đứng trong sảnh. Bot đánh với nhau là vòng lặp không ai
  // xem; còn lời mời từ bot tới người thật thì mở đúng bảng Tỷ Thí của họ, và hàng
  // quá STALE_MS sẽ bị work() quét sang 'dead'.
  async function duel(bot: Bot): Promise<void> {
    const invited = await pool.query<{ id: string }>(
      `SELECT id FROM temple_games
        WHERE b_user = $1 AND status = 'invite'
          AND NOT (a_user = ANY($2::uuid[]))
          AND updated_at > now() - ($3::int * INTERVAL '1 millisecond')
        ORDER BY updated_at DESC LIMIT 1`,
      [bot.entry.userId, [...botUsers], STALE_MS],
    );
    if (invited.rows[0]) {
      await acceptMatch(Number(invited.rows[0].id), bot.entry.userId);
      return;
    }
    const turn = await pool.query<{ id: string; kind: string; board: string; a_user: string }>(
      `SELECT id, kind, board, a_user FROM temple_games
        WHERE (a_user = $1 OR b_user = $1) AND status = 'live'
          AND (CASE WHEN kind = 'caro'
                    THEN (CASE WHEN a_user = $1 THEN a_move IS NULL
                                                      ELSE a_move IS NOT NULL AND b_move IS NULL END)
                    ELSE (CASE WHEN a_user = $1 THEN a_move ELSE b_move END) IS NULL END)
          AND NOT ((CASE WHEN a_user = $1 THEN b_user ELSE a_user END) = ANY($2::uuid[]))
          AND updated_at > now() - ($3::int * INTERVAL '1 millisecond')
        ORDER BY updated_at ASC LIMIT 2`,
      [bot.entry.userId, [...botUsers], STALE_MS],
    );
    if (turn.rows.length) {
      for (const row of turn.rows) {
        // Caro đi luân phiên, nên điều kiện ở trên mới là phần khó: hỏi sai là bot ngồi
        // nhìn một ván của người thật tới tận STALE_MS. Phần dễ là nước đi — caro.ts chọn
        // ô (hoàn thành hàng, chặn hàng, còn thì xây gần đám đông), hai môn kia vẫn ra
        // đòn cũ. Cả hai đường đều qua moveMatch, tức bot không có luật riêng.
        const me: CaroSide = row.a_user === bot.entry.userId ? 'a' : 'b';
        const move = row.kind === 'caro' ? bestMove(row.board, me) : pick(SIGNS);
        if (move === null) continue;
        await moveMatch(Number(row.id), bot.entry.userId, move);
      }
      await refresh(bot);
      return;
    }
    const rivals = others(bot).filter((m) => !botIds.has(m.profile.id));
    if (!rivals.length || Math.random() >= 0.3) return;
    const rival = pick(rivals);
    // Một người chỉ nhận một lời mời tại một thời điểm: sáu bot cùng hẹn giờ sẽ dội
    // sáu popup lên cùng một người nếu mỗi bot tự mời. `quiet` là nửa còn lại — ván vừa
    // tắt là `busy` hết chặn, và nhịp duel 6–14 giây cho bot kế tiếp mời liền ngay sau đó.
    // Khoảng lặng tính theo mọi bot và theo cả hai chiều (người tự mời cũng được nghỉ),
    // nên một người chỉ gặp lại lời mời sau DUEL_QUIET_MS kể từ hoạt động tỷ thí cuối.
    const { rows } = await pool.query<{ busy: boolean; quiet: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM temple_games
          WHERE status IN ('invite', 'live')
            AND (a_user = (SELECT user_id FROM temple_profiles WHERE player_id = $1)
              OR b_user = (SELECT user_id FROM temple_profiles WHERE player_id = $1))
       ) AS busy,
       EXISTS (
         SELECT 1 FROM temple_games
          WHERE (a_user = (SELECT user_id FROM temple_profiles WHERE player_id = $1)
                 OR b_user = (SELECT user_id FROM temple_profiles WHERE player_id = $1))
            AND updated_at > now() - ($2::int * INTERVAL '1 millisecond')
       ) AS quiet`,
      [rival.profile.id, DUEL_QUIET_MS],
    );
    if (rows[0]?.busy || rows[0]?.quiet) return;
    await inviteMatch(pick(['dice', 'rps', 'caro'] as const), bot.entry.userId, rival.profile.id);
  }

  // ---- vào/ra ----

  // Lát cắt của hôm nay: botCount người, xoay theo ngày để hall không bao giờ chỉ có
  // một bộ mặt. Số bot không đổi theo số người (chỉ đổi *tính có mặt*), nên phép cộng
  // trừ người trên màn hình luôn đúng.
  function todaysSlice(): Seeded[] {
    const day = Number(vnDay().replace(/-/g, ''));
    const off = day % seeded.length;
    return Array.from({ length: Math.min(botCount, seeded.length) }, (_, i) => seeded[(off + i) % seeded.length] as Seeded);
  }

  function humans(): number {
    return rooms.members(HALL, ROOM).filter((m) => !botIds.has(m.profile.id)).length;
  }

  function freeSeat(from: number): number {
    const taken = new Set(rooms.members(HALL, ROOM).map((m) => m.state.seat).filter((s) => s >= 0));
    for (let k = 0; k < SEATS; k++) {
      const i = (from + k) % SEATS;
      if (!taken.has(i)) return i;
    }
    return -1;
  }

  async function admit(entry: Seeded): Promise<void> {
    const fresh = await templeProfile(entry.userId);
    if (!fresh) return;
    const profile = toPlayerProfile(fresh);
    const cushion = freeSeat(profile.id % SEATS);
    const pos = cushion >= 0 ? seatOf(cushion) : spotOnFloor();
    const member: RoomMember = {
      profile,
      state: stateOf({ id: profile.id, pos, yaw: 0, seat: cushion, anim: 0 }),
      dirty: true,
      temple: HALL,
      room: ROOM,
      // Bot không có socket: tin gửi tới nó rơi vào khoảng không, nên mọi việc của bot
      // đều do chính nó đi hỏi lại database.
      send: () => {},
    };
    const bot: Bot = {
      entry,
      profile,
      member,
      cushion,
      seat: cushion,
      pos,
      yaw: 0,
      anim: 0,
      path: [],
      mood: 'sit',
      begun: 0,
      until: 0,
      meditate: false,
      bowsLeft: 0,
      bowsQueued: 0,
      nextBow: 0,
      next: { greet: 0, duel: 0, inbox: 0, emote: 0 },
    };
    rooms.add(member);
    // Phòng chỉ phát hồ sơ lúc một socket thật join, nên người đang ngồi sẽ chẳng bao
    // giờ nhận được frame của bot nếu không có dòng này: avatar bot vô hình vì máy
    // khách bỏ qua id không có hồ sơ (world.js:584).
    rooms.publish(HALL, ROOM, JSON.stringify({ t: 'prof', p: [profile] }));
    present.set(entry.def.slug, bot);
    choose(bot, Date.now());
  }

  function release(bot: Bot): void {
    present.delete(bot.entry.def.slug);
    // remove() chỉ đánh dấu; hết cửa sổ ân hạn nhịp phòng mới báo "gone", đúng như một
    // người thật tắt máy — không có avatar nào biến mất giữa chừng một cú nhảy.
    rooms.remove(bot.member);
  }

  async function presence(now: number): Promise<void> {
    const keep = new Set(todaysSlice().map((e) => e.def.slug));
    for (const bot of [...present.values()]) if (!keep.has(bot.entry.def.slug)) release(bot);
    // Một bot mỗi nhịp: hall đông dần thay vì bật lên hai mươi người cùng một khung hình.
    const entry = todaysSlice().find((e) => !present.has(e.def.slug));
    if (entry) await admit(entry);
  }

  // ---- seeding ----

  async function seed(): Promise<void> {
    await ensureTempleTables();
    botCount = await readBotCount();
    botCountAt = Date.now();
    const out: Seeded[] = [];
    for (const def of ROSTER) {
      // '.invalid' là tên miền dành riêng (RFC 2606): không host nào nhận thư, không
      // email thật nào trùng, và is_guest thì giữ bot nằm ngoài mọi màn hình tài khoản.
      const email = `bot-${def.slug}@temple.invalid`;
      const found = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
      const userId = found.rows[0]?.id ?? (await createUser({ email, name: def.name, isGuest: true })).id;
      const profile = await ensureTempleProfile(userId);
      await updateTempleProfile(userId, { name: def.name, sect: def.sect, appearance: def.look, equipped: def.kit });
      await backfill(userId, profile.exp, def);
      out.push({ def, userId, playerId: profile.playerId });
    }
    seeded = out;
    botIds = new Set(out.map((e) => e.playerId));
    botUsers = new Set(out.map((e) => e.userId));
  }

  // Ngày cũ của bot ghi đúng đường mà một người tu thật để lại: một hàng
  // temple_practice mỗi ngày và chuỗi ngày đếm theo touchStreak. Không có đoạn này thì
  // bot mới sinh mang đúng 20 điểm của ngày đầu, đứng chót BXH và không ai tin nổi.
  async function backfill(userId: string, exp: number, def: BotDef): Promise<void> {
    // Hàng bot đã sinh từ lần chạy trước có số điểm của riêng nó — không được cộng lại.
    if (exp > MERIT_PER.visit_first) return;
    const total = def.exp - exp;
    const per = Math.floor(total / def.days);
    for (let i = def.days; i >= 1; i -= 1) {
      const day = vnDay(new Date(Date.now() - i * 86_400_000));
      const gain = i === 1 ? total - per * (def.days - 1) : per;
      await bumpPractice(pool, userId, { exp: gain, bows: Math.round(gain / MERIT_PER.bow), meditateMin: Math.round(gain / MERIT_PER.meditate_min) }, day);
      await touchStreak(userId, day);
    }
    // exp trên hồ sơ là tổng tích luỹ, còn BXH cộng từ sổ điểm: hai số phải khớp nhau
    // thì bậc trên đầu avatar và chỗ đứng trên bảng mới là cùng một người.
    await pool.query('UPDATE temple_profiles SET exp = $2, updated_at = now() WHERE user_id = $1', [userId, def.exp]);
  }

  // ---- vòng lặp ----

  async function work(): Promise<void> {
    const now = Date.now();
    if (!seeded.length) {
      // Seeding hỏng thì để ngỏ cho nhịp sau thử lại, đúng cách schema.ts tự chữa một
      // lần DDL fail: một cú DB chập chờn lúc khởi động không được khóa cả đền.
      await seed();
      return;
    }
    if (now - gameSweepAt >= GAME_SWEEP_MS) {
      gameSweepAt = now;
      await expireStaleGames();
    }
    if (beat % PRESENCE_BEATS === 0) {
      if (now - botCountAt >= BOT_REFRESH_MS) {
        botCount = await readBotCount();
        botCountAt = now;
      }
      await presence(now);
    }
    // Bot vẫn đứng trong sảnh khi vắng người, nhưng chỉ chào/đấu khi có người thật:
    // hai việc đó mới là thứ mở giao dịch xã hội, để 20 bot không tự chơi với nhau
    // cả ngày trên DB. Hẹn giờ vẫn chạy để lúc người vào không dội một loạt cùng lúc.
    const hasHumans = humans() > 0;
    for (const bot of [...present.values()]) {
      step(bot, now);
      await bowTick(bot, now);
      if (now >= bot.until) {
        await settle(bot, now);
        choose(bot, now);
      }
      if (now >= bot.next.duel) {
        bot.next.duel = now + rnd(6_000, 14_000);
        if (hasHumans) await duel(bot);
      }
      if (now >= bot.next.greet) {
        bot.next.greet = now + rnd(45_000, 120_000);
        if (hasHumans) await greet(bot);
      }
      if (now >= bot.next.inbox) {
        bot.next.inbox = now + rnd(40_000, 90_000);
        await inbox(bot);
      }
      if (now >= bot.next.emote) {
        bot.next.emote = now + rnd(25_000, 70_000);
        if (bot.mood === 'pray' || bot.mood === 'sit') rooms.publish(HALL, ROOM, JSON.stringify({ t: 'emote', id: bot.profile.id, e: pick(EMOTES) }));
      }
    }
  }

  const timer = setInterval(() => {
    if (running) return;
    running = true;
    beat += 1;
    work()
      .catch((error: unknown) => {
        // Một nhịp lỗi không được biến thành cả nghìn dòng log: ApiError là chuyện
        // thường (hai bot cùng giành một nước đi), còn lại mới đáng kể một lần.
        if (error instanceof ApiError) return;
        console.error('temple bot', error instanceof Error ? error.message : error);
      })
      .finally(() => {
        running = false;
      });
  }, BEAT_MS);
  timer.unref();

  return {
    stop: () => {
      clearInterval(timer);
      for (const bot of [...present.values()]) release(bot);
    },
  };
}
