# SHRINE content map — chùa → Đền Cầu May TFT

Nguồn quyết định: `docs/SHRINE-PLAN.md` (mục 3.0 là số đo, mục 5 là bảng map). File này là **bản
thực thi**: tên/chuỗi nào thay, thay thành gì, thay ở đâu. Mọi con số dưới đây đo ở HEAD `b38a8a9`.

## 0. Chốt Phase 0

| # | Quyết định | Trạng thái |
|---|---|---|
| 1 | Một vòng = **30 hạt** (sửa đủ 10 điểm, xem §7) | ✅ |
| 2 | Khởi động mặc định **5 phút** | ✅ |
| 3 | Tổ đội **8 người** (khớp lobby TFT) | ✅ |
| 4 | Tên cấp theo hướng **fantasy**, không dùng rank TFT thật (Sắt→Thách Đấu) | ✅ |
| 5 | **Giữ `/temple`**, không đổi `/shrine` | ✅ |
| 6 | 15 map chùa: **giữ cả 15 làm theme, admin chọn một bản** qua `/admin/settings`; khoá `size`/`cushions`/`view` | ✅ |
| 7 | Avatar anime 12 nhân vật: **giữ cho MVP**, quyết ở Phase 3 → đã quyết 2026-11-07, xem §9 | ✅ |
| 8 | Đèn cầu may (Phase 2b): **hoãn**, không nhắc trong UI | ✅ |
| 9 | `meta.json.donate` + `fund` (số TK + tên thật, **không code nào đọc**): **xoá** | ✅ |

## 1. Tiền tệ

Hai tên dưới đây là tên chốt (2026-11-07) — mọi nhãn UI, toast và phần thưởng đều dùng
**Tinh Hoa** / **Kim Cương**, không còn biến thể nào khác. Field DB giữ nguyên `sen`/`ngoc`.

| Cũ | Mới | Field DB | Ghi chú |
|---|---|---|---|
| Công đức | **Điểm May Mắn** | `exp` | giữ field, chỉ đổi nhãn |
| Sen | **Tinh Hoa** | `sen` | field không đổi; gate từ ngữ **không** quét `sen` |
| Ngọc | **Kim Cương** | `ngoc` | từ Wheel, thưởng lên bậc và đổi quà; không có cổng tiền thật |
| Đức | *(xoá)* | `duc` | server vẫn vận chuyển, không HUD nào hiển thị |
| Quả | *(xoá theo vườn)* | `fruit` | `hall.ts:123` từng đổi quả → Kim Cương: đã bỏ cả đường đó |

## 2. Cấp (7 bậc, ngưỡng exp giữ nguyên)

`apps/api/src/temple/identity.ts:67-74` — `LEVELS`, exp `0/50/150/320/600/1000/1600`.

| Level | exp | Cũ | Mới |
|---|---|---|---|
| 1 | 0 | Phật tử Sơ Tâm | **Tân Binh** |
| 2 | 50 | Phật tử Tinh Tấn | **Lữ Khách** |
| 3 | 150 | Cư sĩ Thanh Tịnh | **Người Thắp Đèn** |
| 4 | 320 | Hành giả Chánh Niệm | **Kẻ Thử Vận** |
| 5 | 600 | Thiền sinh An Định | **Cao Thủ** |
| 6 | 1000 | Hộ Pháp Tâm Thành | **Bậc Thầy Hex** |
| 7 | 1600 | Bồ Tát Giữa Đời | **Huyền Thoại** |

`honor` mặc định: `Tâm Sáng Như Sen` → **`Lữ khách cầu may`** (`identity.ts:155`).
`sect` mặc định: `tinhdo` → **`flex`** (3 chỗ: `identity.ts:153`, `schema.sql:21` DEFAULT,
`hall.tsx:538` fallback).

## 3. Lối chơi (thay 4 thiền phái)

Id phải khớp `ID_PATTERN ^[0-9a-z_]{1,24}$` (`identity.ts:252`); `comps.style` lại là chữ hoa +
dấu cách nên **cần bảng dịch một chiều** `sect → style`:

| sect id | Nhãn UI | → `comps.style` | Màu | Icon | Mô tả (1 dòng) |
|---|---|---|---|---|---|
| `reroll` | Reroll | `Reroll` | `#c4688a` | 🔁 | Đẩy level sớm rồi về 0 vàng ở cấp 5–6 để find comp |
| `fast8` | Fast 8 | `Fast 8` | `#4f8a4a` | ⚡ | Nhảy 8 nhanh, lấy comp bài 4–5 tiền |
| `fast9` | Fast 9 | `Fast 9` | `#3f6f9a` | 🚀 | Thẳng lên 9, chơi tướng bài 5 |
| `tempo` | Tempo | `Tempo` | `#c0602e` | ⏱️ | Lên cấp đúng nhịp, ép sân bằng unit mạnh tạm, giữ tiền chặt |
| `flex` | Flex | `Flex` | `#8a5cc8` | 🧩 | Không khoá comp, rẽ nhánh theo ấn và lõi |

Map dữ liệu cũ: `truclam→fast8`, `tinhdo→reroll`, `lamte→tempo`, `taodong→flex` — chạy thành một
câu `UPDATE ... WHERE sect IN (...)` idempotent trong `schema.sql`, cạnh DEFAULT. Cặp cũ/mới chọn
theo màu (`#4f8a4a`/`#c4688a`/`#c0602e` giữ nguyên) nên avatar không đổi sắc, chỉ đổi nhãn.
**Xoá** `bonus`, `bonusText`, `titles` khỏi `meta.sects` — không nơi nào đọc (chỉ `.name`, `.color`).

## 4. Trang bị (70 mục trong `meta.json.items`)

Chỉ hai chuỗi hiển thị: `name` và `description` (`hall.tsx:505`). `data.color/sash/model/...` giữ
nguyên — đó là thông số render, không phải copy. **3 mục `type: plant` và 1 `type: fruit` bị xoá** theo vườn → còn **66**. Quy tắc: bỏ hết từ vựng Phật/kinh, giữ đúng 1 dòng, không giải thích cơ chế.

63/66 mục thuộc nhóm mặc được (`WEARABLE` trong `catalog.ts`). Tài khoản admin có nút **Cấp toàn bộ
trang bị** (`POST /api/temple/admin/gear`, khối Quản trị trong Hồ sơ) đổ cả 63 món vào túi để thử đồ
ngay — người thường vẫn phải mua qua Cửa hàng hoặc đổi duyên ở cửa Lão Hành Khất.

### 4.1. Dâng lễ (`consumable`, 3) — thành bộ đồ cầu may

| id | Cũ | Mới |
|---|---|---|
| `huong_tram` | Hương trầm | **Bùa May Mắn** 🧧 |
| `nen_sap` | Nến sáp ong | **Nến Hex** 🕯️ |
| `hoa_dang` | Hoa dâng Phật | **Đóa Sao** ✨ |

### 4.2. Áo choàng (`robe`, 19) — `ao_*` + 2 item legend

`ao_lam/ao_xam/ao_nau/ao_trang/ao_vang` (miễn phí/mua bằng Tinh Hoa) → **Áo Choàng Lam / Xám / Nâu /
Trắng / Vàng Cam** (đổi tên, mô tả thành "màu áo mặc khi vào sảnh", bỏ chữ "Phật tử", "chú tiểu").
`ao_sen` Áo hoa sen → **Áo Choàng Hồng Sương**. `ao_vulan` Áo Vu Lan hồng → **Áo Choàng Má Hồng**
(Vu Lan là lễ Phật giáo). `ao_may_bac` → **Áo Choàng Mây Bạc** (giữ). `ao_truc` → **Áo Choàng Trúc
Xanh** (giữ). `ao_nguyet` Áo nguyệt bạch → **Áo Choàng Nguyệt Bạch** (giữ). `ao_lien_hoa` Áo gấm liên
hoa → **Áo Gấm Hồng Gai**. `ao_thien_thanh` Áo gấm thiên thanh → **Áo Gấm Thiên Thanh** (giữ).
`ao_hoang_kim` Áo gấm hoàng kim → **Áo Gấm Hoàng Kim** (giữ). `tang_bao` Tăng bào trụ trì tặng →
**Áo Choàng Quà Sảnh** (bỏ "tăng bào/trụ trì"). `ao_cam_lan` Cẩm lan cà sa → **Áo Gấm Cẩm Lan** (bỏ
"cà sa"). Legend: `ao_chien_bao` Chiến Bào Sắt (giữ), `ao_non_tan` Áo Non Tản (giữ), `ao_vay_rong`
Áo Vảy Rồng (giữ), `ao_hoa_sala` Áo Hoa Sala → **Áo Choàng Hoa Vàng** (bỏ hình ảnh cây sala).

### 4.3. Vòng năng lượng (`beads`, 11) — `chuoi_*`

`chuoi_go` Tràng hạt gỗ → **Vòng Gỗ**; `chuoi_bode` Tràng hạt bồ đề → **Vòng Hạt Tự Nhiên**;
`chuoi_tram` Tràng hạt trầm hương → **Vòng Trầm**; `chuoi_ngoc` Tràng hạt ngọc bích → **Vòng Ngọc
Bích**; `chuoi_hophach` Tràng hạt hổ phách → **Vòng Hổ Phách**; `chuoi_tudan` Tràng hạt tử đàn →
**Vòng Anh Đào**; `chuoi_thach_anh` Tràng hạt thạch anh hồng → **Vòng Thạch Anh**; `chuoi_luu_ly`
Tràng hạt lưu ly → **Vòng Lưu Ly**; `chuoi_kim` Tràng hạt hoàng kim → **Vòng Hoàng Kim**; legend
`chuoi_dua_do` Tràng Hạt Dưa Đỏ → **Vòng Dưa Đỏ**, `chuoi_dau` Tràng Hạt Dâu → **Vòng Dâu** (deviation:
bản nháp ghi "giữ tên" nhưng hai tên đó chứa đúng chữ bị cấm ở dòng dưới — lệnh cấm thắng). Bỏ chữ
"tràng hạt" trong mọi tên và mô tả → "vòng 30 hạt".

### 4.4. Bệ ngồi (`cushion`, 10) — `bd_*`

Bỏ hẳn chữ **bồ đoàn**: `bd_xam` → **Bệ Xám**, `bd_nau` → **Bệ Nâu**, `bd_vang` → **Bệ Vàng**,
`bd_sen` Bồ đoàn đài sen → **Bệ Hồng Sương**, `bd_may` Bồ đoàn mây lam → **Bệ Mây Lam**, `bd_tuyet` →
**Bệ Tuyết**, `bd_ngoc` → **Bệ Ngọc**, `bd_kim_lien` → **Bệ Hoàng Kim**, legend `bd_tram_sen` Bồ Đoàn
Trăm Sen → **Bệ Trăm Hoa**, `bd_mai_rua` Bồ Đoàn Mai Rùa → **Bệ Mai Rùa**.

### 4.5. Gậy (`staff`, 7), Mũ (`hat`, 4), Item legend (`bikiep`, 1)

`tr_thien_truong` Thiền trượng cửu hoàn → **Gậy Chín Khoen**; `tr_kim_co_bong` Kim Cô Bổng (giữ);
`tr_dinh_ba` Cửu xỉ đinh ba (giữ); `tr_nguyet_nha` Nguyệt nha sản (giữ); legend `tr_tre_nga` Trượng
Tre Ngà (giữ), `tr_gay_than` Gậy Thần (giữ), `tr_tram_dot` Trượng Trăm Đốt (giữ).
`mu_kim_co` Vòng kim cô (giữ tên, sửa mô tả); `mu_tu_kim` Tử kim quan lông trĩ → **Mũ Lông Trĩ**;
`mu_ty_lu` Mũ Tỳ Lư (Buddhist_Vairocana) → **Mũ Chóp Vàng**; legend `mu_non_than` Nón Thần (giữ).
`bi_kiep_van_phat` Bí Kiếp Vạn Phật Thần Chưởng → **Bùa Vô Cực** (bỏ "Vạn Phật").

### 4.6. Thú đồng hành (`pet`, 9) + Mây (`cloud`, 2)

Giữ 7 (`lt_nghe`, `lt_su_tu_xanh`, `lt_thanh_long`, `lt_chu_tuoc`, `lt_huyen_vu`, `lt_bach_tuong`,
`lt_trau_vang`) + `may_song_bac` Mây Sóng Bạc, vì chúng là cổ tích/ngụ ngôn chứ không phải nghi lễ.
Đổi 3: `lt_huou` Hươu Lộc Uyển (Lộc Uyển = vườn nai nơi Phật thuyết pháp đầu) → **Hươu Non**;
`lt_tho_ngoc` Thỏ Ngọc (mặt trăng Phật giáo) → **Thỏ Bông**; `may_can_dau` Cân Đẩu Vân → **Mây Chở
Đi** (mây của Tôn Ngộ Không trong Tây Du Ký).

## 5. Glossary + từ cấm

Xem bảng đầy đủ ở `SHRINE-PLAN.md` §5.1. **Từ cấm trong chuỗi hiển thị** (gate kiểm):
`chùa`, `phật`, `thiền`, `tụng`, `lạy`, `kinh`, `mõ`, `chuông`, `công đức`, `bồ đoàn`, `áo tràng`,
`tràng hạt`, `đồng tu`, `đạo hữu`, `trụ trì`, `ẩn sĩ`, `bồ tát`, `cư sĩ`, `niệm`, `hương án`, `lư
hương`, `vườn`, `hạt giống`, `quẻ bói`, `an di đà phật`, `sen` (chỉ trong chuỗi, **không** quét field
`price_sen`/`chuoi_*`/biến).

Gate: `grep -riE` trên `apps/web/components/temple/*.ts*`, `apps/api/src/temple/*.ts`,
`apps/web/vendor/temple/data/*.json`, `apps/web/lib/messages.ts` — chỉ so khớp **trong chuỗi đơn/kép
và trường `name`/`description` của JSON**, không quét comment, không quét identifier.

## 6. Dead config phải xoá (đo: chỉ 3/19 key của `meta.json` có reader)

`engine.ts:12` là **nơi duy nhất** import `meta.json` và code chỉ đọc `meta.temples`, `meta.sects`,
`meta.items` (`engine.ts:23-25,57`). Mười sáu key cấp cao nhất còn lại (kèm `sort`/`region` lồng
trong temples) là chữ Phật đã ship vào bundle client:
`levels` (mảng 100 ngưỡng!), `maxLevel`, `appearance`, `event`, `announcement`, `announcementFx`,
`ticker`, `tickers`, `fund`, `donate`, `sessions`, `serverNow`, `paymentMode`, `packages` (bảng giá
VND), `chantAudio`, `exp` (`mo/bell/sweep/plant`), `sort`/`region` trong temples.
→ Phase 1 cắt sạch: `37.960 → 31.946` byte (-16%), `meta.json` còn đúng `sects`/`temples`/`items`,
và `packages`/`paymentMode` không còn nghĩa là "giá tiền thật" bị hiểu lầm. Toàn bộ nằm trong
`apps/web/scripts/rename-meta.mjs` — một nguồn duy nhất, chạy lại là no-op.

## 7. Bề mặt copy đã đo cho Phase 1

Vòng 30 hạt — **10 điểm, 2 loại**: `apps/api/src/temple/merit.ts:27` (`MAX_COUNT`),
`apps/api/src/temple/practice.ts:70` (số chia vòng), `apps/web/components/temple/temple-app.tsx`
(dòng `209,210,213,221,222,537,875`), `hall.tsx:590`, `apps/web/vendor/temple/js/kinh.js:6`.

Id phái cũ hardcode: `hall.tsx:538,546`, `identity.ts:153`, `schema.sql:21`, `identity.test.ts:25`.

Số dòng chứa từ vựng cũ (kể comment, để biết chỗ nào phải rà) — `components/temple`:
`temple-app.tsx 50`, `people.tsx 47`, `hall.tsx 35`, `practice.tsx 31`, `api.ts 19`, `engine.ts 12`,
`room.ts 10`, `stories.ts 8`, `effects.ts 2`, `ui.tsx 1`. `api/src/temple`: `merit.ts 32`,
`hall.ts 27`, `identity.ts 27`, `social.ts 22`, `practice.ts 16`, `routes.ts 8`, `rooms.ts 6`,
`ws.ts 6`, `schema.sql 18`, còn lại ≤5. `vendor/temple/js`: `exterior.js 67`, `avatar.js 15`,
`audio.js 10`, `cushion.js 6`, `chores.js 5`, `beads.js 1`.

## 8. Giữ / bỏ

**Bỏ hẳn:** vườn (`GardenSheet`, SEEDS 3 id `cay_bode`/`cay_sen`/`cay_sala`, `showGardenTrees` +
`showPlants` trong `chores.js`, `grounds.js:53,77` `gardenBlock`, `temple_plants` để dormant), mõ,
chuông (`bell` trong `practice.ts`), quả + đường đổi quả→Ngọc (`hall.ts:123`), `duc`, đèn (đã bỏ ở
`e11b660`), đổi `/temple`→`/shrine`.
**Giữ nguyên:** khung HUD, phòng WS, bạn bè/nhóm/DM, bia tri ân (đổi tên thành Bảng Tri Ân, bỏ
thông tin ngân hàng), BXH (đổi thành BXH Cầu May + ghi rõ "chuyên cần, không phải rank TFT"), 12
avatar (tên thì đổi, xem §9), tượng pengu vàng trên bàn thờ.

## 9. 12 nhân vật: tên mới + bộ sưu tập có khoá (2026-11-07)

`apps/web/vendor/temple/js/avatar.js:6-165` là nguồn duy nhất của `HERO_LIST`. **Id không đổi** —
id là khoá trong `appearance.hero`, trong cột `heroes` của DB và trong atlas sprite; chỉ `name` và
`title` đổi. Tên cũ là tên nhân vật anime có bản quyền; tên mới tả đúng phần `buildHeroHead3D`
(`avatar.js:541-700`) thực vẽ, nên người chơi nhìn hình là đọc được tên mà không cần biết tên gốc.

| id | `name` mới | `title` đi kèm | Nét vẽ trong engine |
|---|---|---|---|
| `luffy_g5` | **Mây Bồng** | Nhịp Trống Tự Do | tóc mây trắng xoăn bồng, mũ rơm đeo lưng |
| `naruto_sage` | **Gai Vàng** | Tiên Nhân Áo Cam | tóc vàng dựng + hai sừng chakra, áo cam |
| `zoro` | **Ba Kiếm** | Đao Khách Xanh Rêu | tóc xanh rêu gai nhọn, ba khuyên tai vàng |
| `sasuke` | **Én Đêm** | Kiếm Ánh Xanh | tóc đen ánh xanh xòe hai bên ôm má |
| `sanji` | **Mái Che** | Chủ Bếp Chân Hỏa | tóc vàng rẽ ngôi che một bên mắt |
| `kakashi` | **Sương Bạc** | Người Che Một Mắt | tóc bạch kim dựng nghiêng, băng trán che mắt |
| `law` | **Mũ Đốm** | Bác Sĩ Áo Vàng | mũ vòm trắng chấm đen, áo vàng |
| `itachi` | **Tóc Dài** | Ảo Thuật Áo Đen | tóc đen dài hai bên má, áo đen |
| `ace` | **Mũ Cam** | Hỏa Quyền Tuổi Trẻ | mũ cao bồi cam hai huy hiệu, tóc đen xoăn |
| `shanks` | **Tóc Đỏ** | Bá Vương Gác Việc | tóc đỏ rực rẽ ngôi |
| `minato` | **Chớp Vàng** | Áo Trắng Nhanh Nhất | tóc vàng hai lọn ôm má, áo trắng |
| `kaido` | **Sừng Trâu** | Sinh Vật Mạnh Nhất | bờm tóc đen + cặp sừng trâu cong khổng lồ |

### 9.1 Bộ sưu tập: chọn lần đầu miễn phí, hình mới 100 Kim Cương

Cơ chế nằm ở `apps/api/src/temple/heroes.ts`, cột mới `temple_profiles.heroes text[]` (danh sách id
đã mở). Cột có ba trạng thái và mỗi trạng thái một giá:

| Trạng thái | Nghĩa | Giá khi chọn |
|---|---|---|
| `NULL` | hàng tạo trước cơ chế này | backfill `schema.sql` ghi đúng nhân vật họ đang đứng → **0**, không ai bị đòi 100 để giữ nguyên hình |
| `'{}'` | tài khoản mới | lần chọn đầu **0**, hình khác tiếp theo **100** |
| `[id…]` | đã mở | id đã nằm trong danh sách **0** (dùng lại), id ngoài danh sách **100** |

Không đủ 100 → `409 not_enough_ngoc`. Giá 100 dẫn xuất từ nền kinh tế thật chứ không phải số tròn
ước lượng: giá Kim Cương trong `meta.json.items` chạy 60–300, thưởng lên bậc ở `merit.ts:93` là
`level × 20` (Bậc 2 +40, Bậc 3 +60) → một hình mới ≈ hai bậc đầu tiên.

- Một transaction duy nhất theo khuôn `shop.ts:payAndGrant` (`BEGIN` → `SELECT … FOR UPDATE` → điều
  kiện → `UPDATE` → `COMMIT`). `FOR UPDATE` làm cú bấm đúp vô hại: lượt thứ hai thấy id đã vào
  `heroes` nên trả `spent 0`; vì vậy **không có cooldown**.
- `PUT /profile` không còn nhận `appearance.hero`: whitelist `APPEARANCE_KEYS` (`identity.ts`) chỉ
  còn `hair`, và `routes.ts` trả `400 hero_needs_purchase` cho body có key `hero`. Im lặng bỏ qua sẽ
  khiến người chơi tưởng mình vừa đổi được hình; đi thẳng qua curl mà không mất đồng thì cơ chế khoá
  vô hiệu.
- Khách dùng được tuyến này, ví khách cũng bị trừ thật (dev đo: 200 → 100 → 0 rồi 409).
- **Tài khoản admin (`users.role = 'admin'`) đổi được cả 12 hình mà không trừ đồng nào**, cùng hướng
  với `/admin/gear` ở §4: thử tạo hình là việc vận hành. `GET/POST /hero` trả `cost` theo *đúng tài
  khoản đang gọi* (`heroes.ts:priceFor`) chứ HUD không tự suy ra quy tắc từ cờ `admin`, nên máy
  khách không có bản sao luật nào — `cost: 0` là "mở hết", khác với "chưa đọc được giá" (HUD vẫn vẽ
  nhãn khoá). Hình admin mở vẫn ghi vào `heroes` như mọi cú mua khác.

### 9.2 Hồ sơ: bậc hiện tại + thanh tiến độ

`ProfileSheet` (`apps/web/components/temple/hall.tsx`) có khối `.pf-rank`: ấn danh hiệu
(`<TitleBadge>`), `title · Bậc N`, số Điểm May Mắn và thanh `.pf-xp`. Thanh đo **đoạn đã đi trong bậc**,
không phải tỉ lệ exp/`exp_next` tuyệt đối — hai bậc có độ dài khác nhau rất nhiều (180 → 350 → 500)
nên tỉ lệ tuyệt đối nhảy lùi khi vừa lên bậc. Vì vậy `state.ts` gửi thêm `exp_prev = expForLevel(level)`:

```
pct   = (exp - exp_prev) / (exp_next - exp_prev)     // expForLevel / exp_next theo ladder.js
còn   = exp_next - exp                                // "Còn 140 Điểm May Mắn tới Bậc 2."
```

Bậc cao nhất (`LADDER_TOP` = 19) thì thanh đầy và dòng "còn thiếu" biến mất.
