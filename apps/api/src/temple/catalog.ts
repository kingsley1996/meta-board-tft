// Kho đồ của sảnh: giá, bậc mở khoá và món nào "không bán" — đọc thẳng từ asset.
//
// Vì sao máy chủ đọc tệp của app web thay vì giữ một bản sao trong apps/api: mấy con số
// này là thông số của meta.json vendored, và apps/web/scripts/rename-meta.mjs ghi rõ
// `id`/`price_*`/`unlock_level`/`data` không được đổi. Thêm một bản sao ở server là thêm
// chỗ đầu tiên để hai bên lệch nhau — máy khách báo một giá, máy chủ trừ một giá khác.
// Render dựng cả repo từ gốc (render.yaml: rootDir '.'), nên tệp này nằm cạnh cả hai
// service; test ở catalog.test.ts là chốt chặn nếu ai đó sửa giá mà quên sửa server.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type CatalogItem = {
  id: string;
  name: string;
  type: string;
  description: string;
  price_sen: number;
  price_ngoc: number;
  unlock_level: number;
  // Hai cờ lấy từ `data` của asset: `rank` để viền khung và dán nhãn hạng hiếm,
  // `legend`/`default` chỉ để test và chữ nghĩa biết món đó thuộc nhóm nào.
  rank: string;
  legend: boolean;
  default: boolean;
};

type RawItem = {
  id: string;
  name: string;
  type: string;
  description?: string;
  price_sen?: number;
  price_ngoc?: number;
  unlock_level?: number;
  data?: Record<string, unknown>;
  enabled?: boolean;
};

const META_PATH = join(import.meta.dirname, '../../../web/vendor/temple/data/meta.json');

const { items } = JSON.parse(readFileSync(META_PATH, 'utf8')) as { items: RawItem[] };

// `enabled: false` là món asset đã cất đi: không vẽ trong túi, không bày ở cửa hàng.
export const CATALOG: CatalogItem[] = items
  .filter((i) => i.enabled !== false)
  .map((i) => ({
    id: i.id,
    name: i.name,
    type: i.type,
    description: i.description ?? '',
    price_sen: i.price_sen ?? 0,
    price_ngoc: i.price_ngoc ?? 0,
    unlock_level: i.unlock_level ?? 1,
    rank: String(i.data?.rank ?? ''),
    legend: i.data?.legend === true,
    default: i.data?.default === true,
  }));

export const itemById = new Map(CATALOG.map((i) => [i.id, i]));

// Hai cửa, và thế là đủ để một người thật lấy được mọi món trong asset:
//  - cửa hàng: món có price_sen hoặc price_ngoc, bán đúng giá đã soạn (50 món);
//  - đổi duyên: món không có giá nào (19 món) — Lão Hành Khất giữ, xem shop.ts.
//
// Cửa thứ hai cố ý rộng hơn mấy món "huyền thoại": áo lam và vòng gỗ mà hồ sơ ngày đầu
// đang mặc (identity.ts:174-176) không nằm trong *túi*, nên tháo ra là mất nếu không có
// ai bán. Đổi thành 100 Sen vẫn là một cửa, và nó chặn luôn cái lỗ đó.
export const isSold = (it: CatalogItem): boolean => it.price_sen > 0 || it.price_ngoc > 0;
export const isDuyen = (it: CatalogItem): boolean => !isSold(it);

// Đồ dâng thì mua dồn được (dùng hết là mua thêm); mọi loại khác là một món trong
// bộ sưu tập — túi không nhân bản áo.
export const isStackable = (it: CatalogItem): boolean => it.type === 'consumable';

export const SELLABLE: CatalogItem[] = CATALOG.filter(isSold);
export const DUYEN_POOL: CatalogItem[] = CATALOG.filter(isDuyen);

// ---- Thang giá đổi duyên -------------------------------------------------------
//
// Asset không cột giá cho 19 món này, nhưng "100 Sen một món như nhau" thì đặt Áo
// Chiến Bào ngang với chiếc áo xám mặc lúc mới vào. Ba bước dưới chỉ lấy số đã có
// trong asset và trong economy của đền, không thêm số nào mới:
//
//  1. Tỷ giá Sen/Ngọc = 2.5. Hai nguồn nội bộ trùng nhau: ví ngày đầu 500 Sen : 200
//     Ngọc (schema.sql:28-29) và kỳ vọng một ngày quay vòng 21.5 Sen : 8 Ngọc
//     (hall.ts:32-39).
//  2. Giá gốc của hàng Quý cùng loại = median `price_ngoc` của những món *có bày ở
//     cửa hàng* mang đúng rank 'quy' cùng type (robe 270, hat 270, staff 280, beads
//     220, cushion 220, cloud 360 Ngọc). Chiếu lão toàn hàng Quý nên đây là loại
//     so sánh đúng, không phải hàng Hiếm hay hàng Thường.
//  3. Đổi sang Sen theo bước 1 rồi làm tròn bậc 10 — bậc mà mọi price_* trong asset
//     đang dùng. Loại chưa từng có hàng Quý nào được bày bán (bí kiếp) lấy trần của
//     cả dải Quý; bộ đồ nền (data.default) lấy đáy của cột Sen (100), đúng mức
//     cánh cổng bản gốc đã đi.
//
// Ra: 4 món nền 100, chuỗi/bồ đoàn 550, áo/mũ 680, gậy 700, bí kiếp 950, mây 900 —
// tổng chiếu 10.630 Sen. Ở nhịp chăm trung bình của roster bot (218 Điểm May Mắn mỗi
// ngày => ~109 Sen/day) thì sạch chiếu mất khoảng ba tháng, tức là một cái đích để
// đeo đuổi chứ không phải thứ mua được bằng hai cú quay.
const SEN_PER_NGOC = 2.5;

const WEARABLE = new Set(['robe', 'cape', 'beads', 'cushion', 'hat', 'staff', 'pet', 'cloud', 'bikiep']);

// Mọi món mặc/đeo được, không kể nó nằm ở cửa hàng hay trên chiếu lão. Tuyến admin
// (admin.ts) cấp nguyên một lần để thử hết các khung hình avatar mà không phải đi
// qua 66 nhịp mua.
export const WEARABLE_POOL: CatalogItem[] = CATALOG.filter((i) => WEARABLE.has(i.type));

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
};

const QUY_SELLABLE = SELLABLE.filter((i) => i.rank === 'quy' && i.price_ngoc > 0);
const QUY_BY_TYPE = new Map<string, number>(
  [...new Set(QUY_SELLABLE.map((i) => i.type))].map((t) => [t, median(QUY_SELLABLE.filter((i) => i.type === t).map((i) => i.price_ngoc))]),
);
const QUY_CEILING = Math.max(...QUY_SELLABLE.map((i) => i.price_ngoc));
const SEN_FLOOR = Math.min(...SELLABLE.filter((i) => WEARABLE.has(i.type) && i.price_sen > 0).map((i) => i.price_sen));

export function duyenPrice(it: CatalogItem): number {
  if (it.default) return SEN_FLOOR;
  const ngoc = QUY_BY_TYPE.get(it.type) ?? QUY_CEILING;
  return Math.round((ngoc * SEN_PER_NGOC) / 10) * 10;
}
