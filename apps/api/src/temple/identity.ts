// Danh tính trong sảnh đền: ai vừa bước vào, hồ sơ của họ nằm ở đâu.
//
// Người lạ không cần tài khoản để vào sảnh — máy chủ cấp một hàng users với
// is_guest = true, email giả không nhận thư, và không mật khẩu. Khi người đó đăng ký
// thì hàng đó được nâng cấp tại chỗ (accounts.ts: promoteGuest), vẫn nguyên users.id,
// nên điểm, đồ và bạn bè đã lưu dưới khoá users(id) tự động ở lại.
//
// Giá trị mặc định lấy đúng như source gốc đã khởi tạo nhân vật (api.js:296-337):
// Áo Choàng Lam, Vòng Gỗ, Bệ Nâu, Hươu Non tặng sẵn — đổi số này là đổi cảm giác
// "ngày đầu vào sảnh" mà người viết engine đã chọn.
import { randomBytes } from 'node:crypto';
import { createSession, createUser, type UserRow } from '../accounts.ts';
import { pool } from '../db.ts';
import type { PlayerProfile } from './protocol.ts';
import { ensureTempleTables } from './schema.ts';

export type TempleProfile = {
  userId: string;
  playerId: number;
  name: string;
  sect: string;
  title: string;
  honor: string;
  exp: number;
  sen: number;
  ngoc: number;
  duc: number;
  fruit: number;
  streak: number;
  bestStreak: number;
  appearance: Record<string, unknown>;
  equipped: Record<string, string | null>;
  inventory: Record<string, number>;
  // id những nhân vật người này đã mở. Rỗng = chưa chọn lần nào, nên lần chọn đầu
  // không mất tiền (heroes.ts).
  heroes: string[];
  noChan: boolean;
  level: number;
  expNext: number;
  // Hai mốc chỉ server viết: hết hạn buff nhân đôi điểm, và giờ mở một nhịp thiền.
  buffUntil: string | null;
  meditateStart: string | null;
};

type TempleProfileRow = {
  user_id: string;
  // pg trả bigint dạng chuỗi vì nó ngoài phạm vi an toàn của Number.
  player_id: string;
  name: string;
  sect: string;
  title: string;
  honor: string;
  exp: number;
  sen: number;
  ngoc: number;
  duc: number;
  fruit: number;
  streak: number;
  best_streak: number;
  appearance: Record<string, unknown>;
  equipped: Record<string, string | null>;
  inventory: Record<string, number>;
  heroes: string[] | null;
  no_chan: boolean;
  buff_until: Date | null;
  meditate_start: Date | null;
};

// Thang 19 mốc ở docs/SHRINE-LADDER.md §3 (chốt 2026-11-06): sáu "vận" ba bậc cộng một
// đỉnh Như Ý. `level` là vị trí 1..19 trên thang, `realm` 1..7 là vận — vận cũng chính là
// bộ khung/ấn cắt từ sheet (7 cột), còn bậc chỉ hiện bằng chữ. Tên cố ý không mượn rank
// TFT (Sắt → Thách Đấu) hay tên tu tiên/tăng lữ; xem §3.2 để biết vì sao.
const REALMS = ['Khai Vận', 'Hanh Thông', 'Cát Khánh', 'Cát Tường', 'Hồng Phước', 'Đại Cát', 'Như Ý'];
const MILESTONES = [
  0, 180, 350, 500, 750, 1100, 1600, 2200, 3000, 4200, 5600, 7500, 9500, 12000, 15000, 18000, 22000,
  27000, 33000,
];

export type LadderRung = {
  level: number;
  title: string;
  expNext: number;
  realm: number;
  realmName: string;
  stage: number;
};

export function levelFromExp(exp: number): LadderRung {
  let i = 0;
  while (i + 1 < MILESTONES.length && exp >= MILESTONES[i + 1]) i += 1;
  const level = i + 1;
  // Ba bậc một vận; bậc 19 là đỉnh, đứng một mình nên không có "bậc 1" để đếm.
  const realm = Math.min(REALMS.length, Math.ceil(level / 3));
  const stage = realm === REALMS.length ? 1 : ((level - 1) % 3) + 1;
  // Đỉnh thang vẫn phải trả một mốc kế tiếp để thanh tiến độ vẽ được, nhưng không gợi ý
  // còn gì để lên (§3.3).
  const expNext = i + 1 < MILESTONES.length ? MILESTONES[i + 1] : MILESTONES[i] + 5000;
  return { level, title: REALMS[realm - 1], expNext, realm, realmName: REALMS[realm - 1], stage };
}

// Số bậc của thang — HUD vẽ đúng bấy nhiêu lựa chọn trong ô đặt bậc của admin.
export const LADDER_SIZE = MILESTONES.length;

// Ngược của levelFromExp: bậc -> mốc Điểm May Mắn của chính nó. Admin đặt bậc là đặt exp
// về mốc đó, nên không bao giờ có hồ sơ mà `level` và `exp` cãi nhau.
export function expForLevel(level: number): number | null {
  return level >= 1 && level <= MILESTONES.length ? MILESTONES[level - 1]! : null;
}

// '.invalid' được dành riêng (RFC 2606): không bao giờ có host thật, nên không thể
// trùng với email của người đăng ký sau này và không thư nào gửi tới được.
const GUEST_EMAIL_SUFFIX = '@guest.invalid';

// Vần để ghép tên khách. Chữ này tự chọn, không phải dữ liệu chép từ source: bản
// gốc chỉ có một tên cố định ('Phật Tử An Lạc', api.js:301) nên cả sảnh sẽ đầy
// người trùng nhau. Onboarding cho đổi lại tên ngay lần vào đầu.
const GUEST_GIVEN = ['An', 'Bình', 'Cẩm', 'Dương', 'Hà', 'Hải', 'Hoàng', 'Khánh', 'Lam', 'Long', 'Minh', 'Nam', 'Nhi', 'Phong', 'Quang', 'Sơn', 'Thạch', 'Vân', 'Vũ', 'Yên'];

function guestName(): string {
  const i = Math.floor(Math.random() * GUEST_GIVEN.length);
  let j = Math.floor(Math.random() * (GUEST_GIVEN.length - 1));
  if (j >= i) j += 1; // hai từ khác nhau, để không ai tên "Lữ Khách An An"
  // Cùng khuôn hai-vần với tên mặc định bản gốc (api.js:301). Người dùng tự đổi ở
  // onboarding; nhãn này chỉ để avatar trong sảnh có tên.
  return `Lữ Khách ${GUEST_GIVEN[i]} ${GUEST_GIVEN[j]}`;
}

function newPlayerId(): number {
  // randomBytes(4) chia lấy dư sẽ lệch nhẹ về đầu dưới nhưng không ai mượn id để
  // quay số thưởng; đổi lại id vào được đúng khoảng u32 của frame nhị phân.
  return (readUInt32() % 4_294_967_295) + 1;
}

function readUInt32(): number {
  return randomBytes(4).readUInt32LE(0);
}

function toProfile(row: TempleProfileRow): TempleProfile {
  const { level, title, expNext } = levelFromExp(row.exp);
  return {
    userId: row.user_id,
    playerId: Number(row.player_id),
    name: row.name,
    sect: row.sect,
    // Dẫn xuất thuần từ exp: cột `title` trong DB là chữ để lại của thang cũ ("Lữ Khách"),
    // mà thang đã đổi thì không có lý do gì để hàng cũ giữ nhãn cũ.
    title,
    honor: row.honor,
    exp: row.exp,
    sen: row.sen,
    ngoc: row.ngoc,
    duc: row.duc,
    fruit: row.fruit,
    streak: row.streak,
    bestStreak: row.best_streak,
    appearance: row.appearance,
    equipped: row.equipped,
    inventory: row.inventory,
    heroes: row.heroes ?? [],
    noChan: row.no_chan,
    level,
    expNext,
    buffUntil: row.buff_until ? row.buff_until.toISOString() : null,
    meditateStart: row.meditate_start ? row.meditate_start.toISOString() : null,
  };
}

// Một hàng hồ sơ cho mỗi users.id. Chạy lại trên hồ sơ đã có là no-op, nên route nào
// cũng gọi được mà không lo ghi đè số liệu của người đang chơi.
export async function ensureTempleProfile(userId: string): Promise<TempleProfile> {
  await ensureTempleTables();
  const seed = {
    name: guestName(),
    player_id: newPlayerId(),
    sect: 'flex',
    honor: 'Lữ khách cầu may',
    // Người mới đã có sẵn 20 Điểm May Mắn và chuỗi 1 ngày (api.js:306-311): vào sảnh
    // lần đầu mà thanh tiến độ trống trơn thì HUD hiện "0/50" thay vì một nhịp đã làm.
    exp: 20,
    streak: 1,
    best_streak: 1,
    appearance: { hero: 'luffy_g5', gender: 'nam', hair: 'ngan', skin: '#f5cba7' },
    // Id phải là id có thật trong meta.json: world.js:474 tra this.items[id].data, nên
    // một id lạ (bản mock cũ viết 'bo_doan_nau'/'pet_nai') nghĩa là không có bệ ngồi,
    // không có bạn đồng hành — người mới vào sảnh mà tay không.
    equipped: { robe: 'ao_lam', beads: 'chuoi_go', cushion: 'bd_nau', hat: null, staff: null, cloud: null, pet: 'lt_huou' },
    // Gói đồ ngày đầu, đúng số bản gốc phát (api.js:123-130 · api.js:333), trừ hai thứ
    // đã bỏ theo plan: đèn hoa đăng và hạt giống vườn (`cay_bode`/`cay_sen`). Ba món
    // consumable giữ id cũ vì id là identifier, chỉ tên trong meta.json đổi.
    inventory: { huong_tram: 15, nen_sap: 10, hoa_dang: 10, lt_huou: 1 },
  };
  for (let attempt = 0; ; attempt += 1) {
    try {
      await pool.query(
        // heroes '{}' chứ không phải [nhân vật đang đứng]: người mới chưa chọn lần nào,
        // nên lần mở màn hình Hồ sơ họ đổi được một nhân vật miễn phí (heroes.ts).
        `INSERT INTO temple_profiles (user_id, player_id, name, sect, honor, exp, streak, best_streak, appearance, equipped, inventory, heroes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '{}')
         ON CONFLICT (user_id) DO NOTHING`,
        [
          userId,
          seed.player_id,
          seed.name,
          seed.sect,
          seed.honor,
          seed.exp,
          seed.streak,
          seed.best_streak,
          seed.appearance,
          seed.equipped,
          seed.inventory,
        ],
      );
      break;
    } catch (error) {
      // 23505 = unique_violation: chỉ có thể là player_id trùng. Thử số khác, nhưng
      // không lặp vô hạn — 10 lần không trúng thì database đang có vấn đề thật.
      if ((error as { code?: string }).code !== '23505' || attempt >= 9) throw error;
      seed.player_id = newPlayerId();
    }
  }
  const profile = await templeProfile(userId);
  if (!profile) throw new Error(`temple profile missing for ${userId}`);
  return profile;
}

export async function templeProfile(userId: string): Promise<TempleProfile | null> {
  const { rows } = await pool.query<TempleProfileRow>('SELECT * FROM temple_profiles WHERE user_id = $1', [userId]);
  return rows[0] ? toProfile(rows[0]) : null;
}

// Hồ sơ mà máy khách cần để vẽ avatar một người. Máy khách không còn tự khai các
// trường này: số liệu trên dây phải đến từ database, nếu không ai cũng đổi được
// level/tên của mình bằng một gói tin.
export function toPlayerProfile(profile: TempleProfile): PlayerProfile {
  return {
    id: profile.playerId,
    name: profile.name,
    level: profile.level,
    honor: profile.honor,
    sect: profile.sect,
    title: profile.title,
    // Không có avatar: máy khách vẽ người chơi từ appearance/equipped.
    appearance: profile.appearance,
    // world.js đọc equipped theo từng ô; giữ null là "không mặc", đúng như source.
    equipped: profile.equipped as Record<string, string>,
  };
}

export type GuestSession = { user: UserRow; token: string; profile: TempleProfile };

export async function createGuest(): Promise<GuestSession> {
  // ensureAccountTables đi trước createUser: hàng users mới cần cột is_guest, và trên
  // database vừa dựng xong chưa từng chạy module temple thì cột đó chưa tồn tại.
  await ensureTempleTables();
  const user = await createUser({
    email: `g-${randomBytes(9).toString('hex')}${GUEST_EMAIL_SUFFIX}`,
    isGuest: true,
  });
  const token = await createSession(user.id);
  const profile = await ensureTempleProfile(user.id);
  return { user, token, profile };
}

// Phần hồ sơ người chơi được tự đổi: tên, pháp môn, ngoại hình và đồ đang mặc.
// level/Sen/Ngọc/điểm không nằm ở đây — máy chủ cộng chúng từ temple_practice,
// nên một request không in ra được người mới bậc 7.
export type ProfilePatch = {
  name?: string;
  sect?: string;
  appearance?: Record<string, unknown>;
  equipped?: Record<string, string | null>;
};

const ID_PATTERN = /^[0-9a-z_]{1,24}$/;
// 'hair' đổi miễn phí ở đây; 'hero' thì không — nhân vật là món phải mở, nên nó đi qua
// POST /hero (heroes.ts) nơi có ví và bộ sưu tập. PUT /profile mà còn nhận hero thì một
// cú tự khai đổi được hình đang mặc mà không trả Kim Cương nào.
const APPEARANCE_KEYS = ['hair'];
const EQUIPPED_KEYS = ['robe', 'beads', 'cushion', 'hat', 'staff', 'cloud', 'pet'];

function cleanId(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  return ID_PATTERN.test(value) ? value : undefined;
}

// Lọc trắng ngay ở ranh giới: id áo/ chuỗi là chữ thường không dấu nên kiểm khuông
// là đủ, và engine tự rơi về áo lam khi gặp id lạ (world.js:476) — một id bịa ra chỉ
// làm hỏng avatar của chính người nhập, không làm hỏng chánh điện.
export function readProfilePatch(body: Record<string, unknown> | undefined): ProfilePatch | null {
  if (!body || typeof body !== 'object') return null;
  const patch: ProfilePatch = {};

  if (typeof body.name === 'string') {
    const name = body.name.trim().slice(0, 28);
    if (!name) return null;
    patch.name = name;
  }
  if (typeof body.sect === 'string') {
    if (!ID_PATTERN.test(body.sect)) return null;
    patch.sect = body.sect;
  }
  if (body.appearance && typeof body.appearance === 'object') {
    const src = body.appearance as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of APPEARANCE_KEYS) {
      const id = cleanId(src[key]);
      if (id === undefined) continue;
      out[key] = id;
    }
    if (typeof src.gender === 'string' && (src.gender === 'nam' || src.gender === 'nu')) out.gender = src.gender;
    if (typeof src.skin === 'string' && /^#[0-9a-f]{6}$/i.test(src.skin)) out.skin = src.skin.toLowerCase();
    patch.appearance = out;
  }
  if (body.equipped && typeof body.equipped === 'object') {
    const src = body.equipped as Record<string, unknown>;
    const out: Record<string, string | null> = {};
    for (const key of EQUIPPED_KEYS) {
      const id = cleanId(src[key]);
      if (id !== undefined) out[key] = id;
    }
    patch.equipped = out;
  }

  return Object.keys(patch).length ? patch : null;
}

export async function updateTempleProfile(userId: string, patch: ProfilePatch): Promise<TempleProfile | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  // jsonb || gộp key chứ không thay cả object: máy khách chỉ đổi mỗi kiểu tóc mà ghi đè
  // nguyên tủ đồ thì người đó mất ấn, mất thú cưng ngay trên lưng avatar. null vẫn là
  // một giá trị được giữ (tháo đồ), chỉ key không gửi mới là key giữ nguyên.
  const merge = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = ${column} || $${values.length}::jsonb`);
  };
  if (patch.name !== undefined) add('name', patch.name);
  if (patch.sect !== undefined) add('sect', patch.sect);
  if (patch.appearance !== undefined) merge('appearance', patch.appearance);
  if (patch.equipped !== undefined) merge('equipped', patch.equipped);
  if (!sets.length) return templeProfile(userId);

  sets.push('updated_at = now()');
  values.push(userId);
  const { rows } = await pool.query<TempleProfileRow>(
    `UPDATE temple_profiles SET ${sets.join(', ')} WHERE user_id = $${values.length} RETURNING *`,
    values,
  );
  return rows[0] ? toProfile(rows[0]) : null;
}
