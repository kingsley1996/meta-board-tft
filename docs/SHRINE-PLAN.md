# Kế hoạch chuyển Chùa Cầu May thành Đền Cầu May TFT

- **Ngày:** 2026-11-05
- **Trạng thái:** kế hoạch, chưa sửa code — riêng tượng bàn thờ đã là penguin vàng (`b38a8a9`)
- **Mốc code:** `b38a8a9` (fix `aa92383` + `5c958ad` + `27e79ce` đã vào; lantern đã bị bỏ; tượng Quan Âm ở Nhất Trụ đã thay bằng pengu vàng)
- **Phạm vi:** `apps/web/components/temple/*`, `apps/web/vendor/temple/*`, `apps/api/src/temple/*`
- **Tài liệu liên quan:** `docs/TEMPLE-REVIEW.md` (đã cũ ở một số mục so với HEAD)

> Bản này đã rà lại từng khẳng định so với code ở `b38a8a9`. Kết luận: **hướng đi và bảng map
> nội dung vẫn đúng**, nhưng mục 3.0 liệt kê 11 chỗ plan lệch hoặc thiếu chi tiết — đọc hết 3.0
> trước khi triển khai phase nào.

---

## 1. Quyết định đã chốt

- Giữ khung đền và UI/UX hiện có; **bỏ tượng Phật, sen, áo tràng**, thêm đồ Hex/TFT.
- Chỉ làm **nghi lễ trước trận**; không ghi kết quả trận, không tích hợp Riot API.
- **Bỏ** vườn cây, gõ mõ, quét sân, chuông.
- **Giữ** bia tri ân/donate, bạn bè, nhóm, tin nhắn — chỉ đổi tên và nội dung.
- **Việt trước, Anh sau**.
- **Một sảnh chung, MỘT theme do admin chọn.** Không làm picker cho người chơi; việc chọn bản nào để admin quyết qua `/admin/settings` (đã chốt 2026-11-05 vì chưa chốt mẫu cuối) — xem 3.0.1 và Phase 3a.

---

## 2. Mục tiêu và nguyên tắc

1. **Không nhân bản dữ liệu TFT.** Đền đọc từ `comps`, `champions`, `traits`, `items`, `augments`, `guides`, patch notes có sẵn; không tạo bảng comp thứ hai.
2. **Không thêm hệ gameplay mới.** Chỉ đổi nhãn/nội dung và nối dữ liệu vào các chỗ đã có: quẻ, đọc meta, cẩm nang, NPC.
3. **Không hứa may mắn ảnh hưởng trận.** Đây là nghi lễ vui trước khi queue; ghi rõ trong phần giới thiệu/cài đặt.
4. **Giữ tên nội bộ `temple_*` và `/api/temple` ở giai đoạn đầu.** Đổi URL/route sau để tránh migration và churn test.
5. **Server vẫn giữ mọi con số.** Client không tự tính điểm, không tự chọn comp.
6. **Ưu tiên xóa hơn thêm.** Không dựng lại tính năng đã bỏ; không thêm màn hình mới nếu một sheet hiện có chứa được nội dung.

---

## 3. Hiện trạng và phần tái dùng

### 3.0. Audit: 11 chỗ plan lệch hoặc thiếu chi tiết (đo ở `b38a8a9`)

1. **15 chùa, không phải 1.** `meta.json.temples` có 15 mục, cả 15 `enabled: true`; 14 mục vẫn
   mang tượng Phật (`shakya` / `quanam` / `amida` / `khmer`) + `extras` (tower, stalactites,
   bamboo, naga, haze). Code chỉ đọc `meta.temples` **một chỗ duy nhất** —
   `apps/web/components/temple/engine.ts:57`, ghim `'nhattru'`; server ghim
   `apps/api/src/temple/hall.ts:16` (`TEMPLE_ID = 'nhattru'`). → "đổi `temples[0]`" là không đủ, và
   **hướng xử lý đã chốt**: 14 mục kia không phải dead config cần xoá mà là danh sách theme để
   **admin chọn một bản** qua `app_settings` (Phase 3a).
2. **Vòng 30 hạt:** số 108 nằm ở **10 điểm thuộc hai loại khác nhau**, plan cũ chỉ ghi một dòng.
   Cap chống gian: `apps/api/src/temple/merit.ts:27` (`MAX_COUNT = 108`). Số chia vòng:
   `apps/api/src/temple/practice.ts:70`. Client hardcode 7 chỗ
   (`apps/web/components/temple/temple-app.tsx:209,210,213,221,222,537,875`), copy ở
   `hall.tsx:590`, và `Array(108)` câu niệm trong `vendor/temple/js/kinh.js:6`.
3. **`temple_draws` đã có `CHECK (kind IN ('wheel','que'))`** (`apps/api/src/temple/schema.sql:172`).
   Quẻ đội hình dùng lại `que` thì ai đã xỉ quẻ cùng ngày trên prod nhận về snapshot chữ Phật cũ
   render trong thẻ comp → hoặc xoá/label lại hàng `kind='que'` khi migrate, hoặc bật ngày quẻ mới.
4. **`sect` không có CHECK trong DB** (`schema.sql:21`, map phái mới chỉ cần `UPDATE` + `DEFAULT`),
   nhưng id phái phải khớp `ID_PATTERN = /^[0-9a-z_]{1,24}$/` (`identity.ts:252`) trong khi
   `comps.style` là `'Fast 8'` / `'Fast 9'` (hoa + khoảng trắng, CHECK ở
   `apps/api/src/schema.sql:48`) → cần bảng dịch id↔style, plan cũ chưa có.
5. **Đồng tiền thứ 4 `duc`.** Schema mang `exp/sen/ngoc/duc/fruit`; `duc` được vận chuyển qua API
   nhưng không HUD nào hiển thị → chốt map sang gì, hoặc xoá luôn.
6. **`sects.bonus` / `bonusText` / `titles` không nơi nào đọc** (chỉ `.name` và `.color`) →
   **xoá 3 field**, đừng viết lại bonus cho 5 lối chơi.
7. **Bỏ vườn mới nêu một nửa.** SEEDS có **3** id (`cay_bode`, `cay_sen`, `cay_sala`),
   `engine.ts` import `showGardenTrees` / `showPlants` từ `chores.js`, `grounds.js:53,77` có
   `gardenBlock`, `meta.exp` vẫn còn `sweep` / `plant` / `bell` (dù `meta.exp` không nơi nào đọc).
8. **`meta.json.donate` chứa số tài khoản ngân hàng + tên thật** (`{bank:'MB', account:'…',
   name:'…', tag:'S2 '}`) và được inline vào bundle client qua `engine.ts:12`. **Đã kiểm: không một
   dòng code nào đọc nó** — `engine.ts` là nơi duy nhất import `meta.json`, còn `SteleSheet` chỉ
   gọi `/stele` + `/donations` (tiền nội bộ, không có cổng thanh toán). `meta.json.fund` cũng vậy.
   → quyết định không còn là "giấu đi đâu" mà là **xoá khỏi JSON**; chỉ cần xác nhận không ai dán
   thủ công số đó vào UI mới.
9. **Bỏ tượng ≠ bỏ đồ chùa.** `vendor/temple/js/temple.js:285-343` dựng hương án, nến, hai lọ sen,
   lư hương **vô điều kiện**, kể cả khi `theme.statues: []`. Riêng `extras: ['lotusPond']` của
   nhattru là **dead config** — không renderer nào đọc.
10. **Id phái cũ bị hardcode 3 chỗ**, đổi `sects` trong meta.json là chưa đủ:
    `hall.tsx:546` `['truclam','tinhdo','lamte','taodong']`, `hall.tsx:538` fallback `'tinhdo'`,
    `identity.ts:153` `sect: 'tinhdo'` (và `DEFAULT 'tinhdo'` ở `schema.sql:21`).
11. **`apps/web/lib/shrine/` chưa từng tồn tại** (chỉ còn chunk `.next` cũ) → mọi tham chiếu tới
    nó là ảo, đừng kế hoạch hoá dựa trên nó.

Điểm plan nói **đúng** (khỏi đo lại): 5 lối chơi Reroll / Fast 8 / Fast 9 / Flex / Tempo khớp chính
xác CHECK `comps.style`; rule loại tier `X` khớp CHECK tier; `/api/comps`, `/api/comps/:slug`,
`/api/guides`, `/api/tft/set`, `/[lang]/tierlist/comps/[slug]`, `/api/temple/rooms` đều có thật.
API và web chạy cùng process nên **gọi hàm nội bộ**, đừng tự HTTP vòng ra ngoài.

### 3.0.1. Tính năng chọn map chùa: đã mất, và vì sao không được dựng lại thành room

Bản `main.js` (xoá ở `ca163b4` khi HUD React vào) từng có chọn chùa theo vùng, "chùa này đã đủ X
người", dấu chân hành hương `visited`, nhớ chùa ở localStorage. Giờ HUD join bằng hằng số
`TEMPLE.id, 'chung'`, không đọc key `temple` trong localStorage, không test nào chạm 14 id kia.
Server vẫn nhận `?temple=` và key phòng là `temple:room`, nhưng REST ghim `nhattru` → một client tự
chế `?temple=tranho` chỉ tách ra một phòng mà **mọi người vẫn đang nhìn chùa Nhất Trụ**.

Lý do không dựng lại theo hướng "mỗi map một room": các map **không đồng bộ kích thước** — đã đo
trong `meta.json`: `size` W 26→43, D 26→40, H 9→13.8; `cushions` 8×7 = 56 chỗ (nhattru) tới
14×11 = 154 chỗ (baison), `z0` khác nhau từng map; chỉ `linhung` và `kimson` trùng nhau cả `size`
lẫn `cushions`. Frame WS gửi **cả** `x/z` tuyệt đối **cả** `seat`, mà bên nhận tra
`this.temple.cushions[p.seat]` trên mảng cushion của **map máy nó đang render**
(`vendor/temple/js/world.js:581`), nội suy thô không clamp → để mỗi người một map trong cùng room
thì avatar ngồi sai ô và đi xuyên tường.

### 3.1. Đang có trong đền

- Cảnh 3D **Chùa Một Cột** (nhattru): bàn thờ là **tượng penguin vàng thủ tục** từ `b38a8a9`, còn
  hương án/nến/lọ sen/lư hương và 14 map chùa khác vẫn nguyên; hồ sen, bồ đoàn, áo tràng; 12 avatar
  anime (`vendor/temple/js/avatar.js` — `HERO_LIST`).
- HUD: lạy, tràng hạt 108, tụng kinh + mõ, thiền, dâng lễ, vòng quay, xỉ quẻ, vườn, BXH, bia tri ân, hồ sơ, túi đồ, cẩm nang, cài đặt, bạn bè/nhóm/DM, NPC trụ trì/ẩn sĩ/kể chuyện.
- Backend: `temple_profiles`, `temple_practice`, `temple_plants`, `temple_donations`, `temple_greetings`, `temple_friends`, `temple_dms`, `temple_groups`, `temple_draws`, `temple_announcements`; phòng WS chung.
- Kinh tế nội bộ: Sen, Ngọc, Đức, công đức, quả; không có cổng thanh toán thật. (`duc` và `fruit`
  không HUD nào hiển thị — xem 3.0 mục 5.)

### 3.2. Nội dung TFT có sẵn trong project

- `comps` + `comp_units/items/augments/stages`: tier, style, độ khó, carry, items, augment, tips, matchups.
- `champions`, `traits`, `items`, `augments`, patch notes, guides.
- Trang: `/tierlist/comps`, `/champions`, `/items`, `/augments`, `/guides`, `/patches`, `/item-priority`, `/economy`, `/assistant`.
- API: `/api/comps`, `/api/tft/set`, `/api/guides`.
- Component có thể tham khảo: `CompPanel`, `HexBoard`, `AugmentOdds`, `ItemBoard`.

### 3.3. Kết luận

Phần lớn UI giữ được. Cái cần thay là **copy + nguồn nội dung**, không phải kiến trúc. Tượng bàn thờ
đã là penguin vàng nên phần 3D còn lại là **cắt đồ thờ + props Hex + skin**, không phải dựng cảnh từ
đầu — và nó vẫn là phần tốn thời gian nhất (Phase 3).

---

## 4. Trải nghiệm trước trận đề xuất

1. **Mở đền** trước khi queue: HUD hiện patch hiện tại, 3 comp top, trạng thái "hôm nay đã cầu may chưa".
2. **Rút quẻ đội hình** (1 lần/ngày): server chọn một comp thật từ DB theo lối chơi + tier; thẻ quẻ hiện board unit, items, augment, 2–3 tip, nút "Xem comp đầy đủ".
3. **Thắp đèn cầu may** (tùy chọn, xem Phase 2b): nhập mục tiêu ngắn, prefill theo comp vừa rút; đèn bay lên sảnh, người khác "tiếp lửa".
4. **Khởi động**: ngồi 1–5 phút, màn hình xoay tip/comp; tính điểm như thiền hiện tại.
5. **Đọc meta**: đọc/nghe một bài ngắn từ comp guide hoặc patch notes; có link nguồn.
6. **Quay Hex**: 1 lượt/ngày, nhận Tinh Hoa/Kim Cương/bùa/đèn.
7. **Vào trận**: nút "Mang quẻ vào trận" mở trang comp hoặc copy nội dung; không có Riot API.

Điểm quan trọng: **đền là lớp nghi lễ + khám phá nội dung**, không phải nơi thay đổi kết quả trận.

---

## 5. Bảng map nội dung

| Hạng mục | Hiện tại | Thành | Ghi chú |
|---|---|---|---|
| Tên | Chùa Cầu May | **Đền Cầu May** | Giữ thương hiệu TFTIQ; URL tính sau |
| Không gian | Chùa Một Cột, hương án/nến/lọ sen/lư hương, hồ sen | Đền gỗ + bàn Hex, đèn, bảng meta | Tượng bàn thờ **đã là pengu vàng**; phần còn lại là `temple.js:285-343` (xem 3.0 mục 9) + xoá `lotusPond` dead config; thêm props Hex |
| Map chùa | 15 map `enabled`, 14 map còn tượng Phật | 1 map thật + **skin** chọn trong Cài đặt | Khoá `size` + `cushions`, chỉ đổi vật liệu/đồ trang trí — xem Phase 3 |
| Người chơi | Phật tử | Nhà lữ hành | `DEFAULT_GUEST`, tên mặc định |
| Cấp 1–7 | Phật tử → Bồ Tát | Tân binh → Huyền thoại | Không dùng tên rank TFT thật để tránh nhầm |
| Phái | 4 thiền phái | 5 lối chơi: Reroll, Fast 8, Fast 9, Flex, Tempo | Lấy đúng `style` trong DB |
| Công đức | Công đức | **Điểm may mắn** | Field `exp` giữ nguyên |
| Sen | Sen | **Tinh Hoa** | Field `sen` giữ nguyên |
| Ngọc | Ngọc | **Kim Cương** | Field `ngoc` giữ nguyên |
| Quả | Quả | Bỏ (theo vườn) | Field `fruit` để dormant |
| Lạy Phật | 3 lạy | **3 lần Cầu may** | Giữ cơ chế đếm |
| Tràng hạt 108 | Lần 108 hạt | **Vòng Hex 30 hạt** | Đề xuất 30 cho vừa một phiên trước trận; sửa cả server/client |
| Tụng kinh + mõ | Kinh Phật, gõ mõ | **Đọc meta** | Nội dung: comp guide/patch; nút "Tiếp", bỏ mõ tự động |
| Thiền | Thiền | **Khởi động** | Giữ timer, thêm tip xoay vòng |
| Dâng lễ | Hương/nến/hoa/chuông | **Bùa may mắn / Nến Hex / Đóa sao** | Bỏ chuông; thay animation 3D bằng glow Hex nếu kịp |
| Xỉ quẻ | 4 quẻ Phật | **Quẻ đội hình** | Server trả comp thật + lời đọc từ tips/stages |
| Vòng quay lộc | Sen/Ngọc/hương/hoa | **Vòng quay Hex** | Thưởng: Tinh Hoa, Kim Cương, bùa, đèn |
| Vườn Phật | Trồng/hái/đổi quả | **Bỏ** | Ẩn UI + route; giữ bảng dormant |
| Bia tri ân | Donate nội bộ | **Bảng đồng hành** | Giữ, đổi copy |
| BXH | Điểm tu tập | **BXH cầu may** | Ghi rõ "chuyên cần, không phải rank TFT" |
| Hồ sơ | Tên, nhân vật, áo tràng | **Nhà lữ hành, trang phục Hex** | Đổi tên/emoji/màu; giữ slot |
| Túi đồ | Đồ chùa + hạt giống | **Trang bị** | Bỏ tab cây/hạt giống |
| Cẩm nang | 4 thiền phái | **5 lối chơi** | Mỗi lối chơi: mô tả + top comp + link |
| Cộng đồng | Nhóm đồng tu (10) | **Tổ đội** (8) | TFT lobby 8 người; đổi copy, `max_members` 8 |
| Đồng tu | Bạn bè | **Đồng đội** | Giữ |
| Tin nhắn | DM | **Tin nhắn** | Giữ |
| NPC trụ trì | Kể chuyện đạo | **Huấn luyện viên** | Mở top comp/assistant |
| NPC ẩn sĩ | Kể chuyện | **Nhà phân tích** | Patch, augment odds, item priority |
| NPC kể chuyện | Truyện chùa | **Tiên tri Hex** | Kích hoạt rút quẻ |
| Thông báo | Tin chùa | Patch/meta/tin site | Lấy từ patch notes/announcements |
| Hiệu ứng | Cánh sen | **Mảnh Hex/ngôi sao** | Đổi emoji/particle; giữ đèn |
| Avatar 3D | 12 nhân vật anime | Giữ tạm, cân nhắc genericize | Điểm lệch thương hiệu lớn nhất |
| Âm thanh | Chuông, mõ | Chime + nhạc nền nhẹ | Bỏ toggle mõ/chuông |

### 5.1. Glossary nhanh

| Từ cũ | Từ mới |
|---|---|
| Chùa / Chánh điện | Đền / Sảnh đền |
| Phật tử / đạo hữu | Nhà lữ hành / người chơi |
| Công đức | Điểm may mắn |
| Sen | Tinh Hoa |
| Ngọc | Kim Cương |
| Lạy Phật | Cầu may |
| Tràng hạt | Vòng Hex |
| Tụng kinh | Đọc meta |
| Thiền | Khởi động |
| Dâng lễ | Dâng bùa |
| Xỉ quẻ | Quẻ đội hình |
| Vòng quay lộc | Vòng quay Hex |
| Vườn Phật | (bỏ) |
| Bia tri ân | Bảng đồng hành |
| Đồng tu | Đồng đội |
| Nhóm đồng tu | Tổ đội |
| Thiền phái | Lối chơi |
| Trụ trì | Huấn luyện viên |
| Ẩn sĩ | Nhà phân tích |
| Người kể chuyện | Tiên tri Hex |
| Bồ đoàn | Bệ ngồi |
| Áo tràng | Áo choàng |
| Tràng hạt | Vòng năng lượng |
| Hồ sen | Hồ Hex |

---

## 6. Kiến trúc và dữ liệu

### 6.1. API mới (thêm vào `/api/temple`)

- `GET /meta`: patch hiện tại, set, top 3 comp, số người online (nếu cần).
- `GET /fortune` + `POST /fortune`: quẻ hôm nay; lần đầu chọn comp, lưu snapshot vào `temple_draws`
  (kind `que`), các lần sau trả lại đúng kết quả. **Cảnh báo:** hàng `que` cũ trên prod là chữ Phật
  (3.0 mục 3) — phải đổi/nhãn lại hoặc chọn id quẻ khác.
- `GET /reads`: 3–5 bài đọc ngắn sinh từ `tips`/`stages` của comp top; fallback static.
- `GET /playstyles`: 5 lối chơi + top comp mỗi lối; hoặc client tự group từ `/api/comps`.

### 6.2. Quy tắc chọn quẻ

- Chỉ comp tier S/A/B; loại `X`, cân nhắc loại `situational`.
- Ưu tiên comp cùng `style` với hồ sơ người chơi; nếu không có thì chọn ngẫu nhiên có trọng số theo tier.
- **Bảng dịch id↔style là bắt buộc** (3.0 mục 4): id phái phải qua `ID_PATTERN`
  (`identity.ts:252`, `^[0-9a-z_]{1,24}$`) còn `comps.style` là `'Fast 8'` / `'Fast 9'` /
  `'Reroll'` / `'Tempo'` / `'Flex'` (`apps/api/src/schema.sql:48`). Đặt nó ở server, một chiều
  `sect → style`, để `flex` là giá trị fallback cả hai chiều.
- Trả kèm `slug`, `title`, `titleVi`, `tier`, `style`, `difficulty`, `units`, `items`, `augments`, `tips`, `stages`.
- Comp bị xoá sau khi rút: snapshot vẫn hiển thị; nút link báo "comp đã đổi" thay vì 404 trắng.
- DB rỗng: trả thông điệp + link `/tierlist/comps`, không vẽ thẻ rỗng.

### 6.3. Migration dữ liệu

- **`sect` không có CHECK trong DB** (3.0 mục 4) → map phái mới chỉ cần một `UPDATE` + đổi
  `DEFAULT`, không cần migration ràng buộc. Id mới vẫn phải qua `ID_PATTERN`.
- Map `sect` cũ → mới:
  - `truclam` → `fast8`
  - `tinhdo` → `reroll`
  - `lamte` → `tempo`
  - `taodong` → `flex`
  - Người mới mặc định: `flex`.
- `honor` mặc định "Tâm Sáng Như Sen" → "Lữ khách cầu may".
- Bỏ **cả 3** id cây khỏi gói đồ mới — `cay_bode`, `cay_sen` **và `cay_sala`** (3.0 mục 7); đồ cũ
  trong túi để dormant hoặc convert thành Tinh Hoa.
- **`duc`:** quyết một trong hai — map sang một vật phẩm TFT, hoặc xoá khỏi `exp`/API. Hiện nó đi
  qua đường truyền mà không HUD nào hiển thị.
- **`temple_draws`:** dọn hàng `kind='que'` cũ (snapshot chữ Phật) trước khi bật quẻ đội hình.
- **`meta.json.donate` + `fund`:** số tài khoản + tên thật nằm trong bundle client mà **không code
  nào đọc** (3.0 mục 8) → **xoá khỏi JSON**, không cần chuyển ra server. Xác nhận trước là không ai
  định dán lại thủ công.
- **`sects.bonus` / `bonusText` / `titles`:** không nơi nào đọc → **xoá**, đừng viết nội dung mới.
- Không đổi tên bảng/cột ở phase đầu.

### 6.4. Copy và i18n

- Tạo một file glossary/copy deck dùng chung; Việt trước.
- Các chuỗi mới tách khỏi JSX để sau này dịch Anh, nhưng **không** refactor toàn bộ HUD sang i18n ngay.
- `apps/web/components/temple/api.ts` có bảng `MESSAGES` riêng: phải rà cả file này (đang có "chùa", "đồng tu", "ngồi thiền", "hạt giống", "vườn", "Sen"…).
- Dọn cả comment trong các file temple để lần grep sau không nhiễu; không bắt buộc 100% ngay.

### 6.5. Đèn cầu may

Lantern hiện đã bị bỏ (commit `e11b660`) vì ngõ cụt duyệt đèn. Nếu muốn giữ hình ảnh "đền cầu may", làm lại bản tối giản ở Phase 2b:

- Tất cả đèn auto-live, có filter từ ngữ + nút báo cáo; hoặc chỉ người xác minh email được auto-live.
- Trừ vật phẩm và cộng điểm **sau** khi ghi đèn thành công.
- Feed giới hạn 30 đèn gần nhất; có thể ẩn đèn cũ.
- Không bắt buộc cho MVP; nếu gấp thì bỏ hẳn, chỉ giữ quẻ/đọc/quay.

---

## 7. Kế hoạch theo phase

### Phase 0 — Chốt nội dung (1–2 ngày)

- Viết `docs/SHRINE-CONTENT-MAP.md`: glossary, danh sách từ cấm, bảng map item/level/style, danh sách giữ/bỏ.
- Chốt 3 con số: **30 hạt/vòng**, **5 phút khởi động mặc định**, **tổ đội 8 người**.
- Chốt tên cấp: fantasy (Tân binh → Huyền thoại), không dùng rank TFT thật.
- Chốt số phận 14 map chùa còn lại: **giữ cả 15, admin chọn một theme** (3.0.1 + Phase 3a), không picker cho user, không tách room. *(đã chốt)*
- **Chốt 6 điểm 3.0 còn mở:** số hạt (mục 2), `temple_draws` cũ (mục 3), `duc` (mục 5),
  thông tin ngân hàng trong `meta.json.donate` (mục 8), 14 map chùa cắt hay thành skin (mục 1),
  avatar anime.
- Rà toàn bộ chuỗi hiển thị trong `apps/web/components/temple`, `apps/web/vendor/temple/data`, `apps/api/src/temple`, `messages.ts`.
- **Acceptance:** glossary + mapping được duyệt; không còn điểm mơ hồ về tên gọi; 6 điểm trên có
  quyết định ghi thành văn bản.

### Phase 1 — Đổi copy và cấu hình, chưa đụng schema (4–6 ngày)

**Nội dung:**

- `apps/web/vendor/temple/data/meta.json`:
  - Đổi **`temples[0]` (nhattru)** — tên/mô tả, màu ánh sáng. `theme.statues` **không đặt `[]`**:
    từ `b38a8a9` nó là `[{kind:'pengu',x:0,scale:1.2,mat:'gold'}]` và đó là thứ nên giữ.
    `theme.extras: []` chỉ là dọn `lotusPond` dead config (3.0 mục 9).
  - 14 mục `temples` còn lại: hoặc cắt khỏi JSON (giảm bundle), hoặc giữ làm skin ở Phase 3 —
    **quyết ở Phase 0, đừng để lơ**. `content.json` có `stories`/`tales` keyed theo đủ 15 id.
  - Đổi `sects` → 5 lối chơi, **xoá `bonus`/`bonusText`/`titles`** (3.0 mục 6).
  - Đổi `items` (tên/emoji/mô tả); bỏ item cây/hạt giống (**3** id SEEDS, mục 7).
  - Đổi `announcement`/`ticker`; căn `maxLevel` nếu còn dùng. `meta.exp` (`sweep`/`plant`/`bell`)
    không nơi nào đọc — sửa kèm comment cho khỏi nhiễu, đừng vội dựng lại.
  - **Xoá `donate` và `fund`** khỏi JSON (3.0 mục 8).
- `apps/web/vendor/temple/data/content.json`: thay guides/stories/tales bằng nội dung TFT (phase 1 có thể static).
- `apps/web/components/temple/stories.ts`: đổi NPC, WISHES, QUOTES.
- `apps/web/vendor/temple/js/kinh.js` → file `reads.ts` mới; `ChantView` đọc từ đây; bỏ mõ tự động. `Array(108)` ở dòng 6 đi theo.
- Server:
  - `identity.ts`: LEVELS, sect mặc định, tên mặc định, honor; giữ `ID_PATTERN`, thêm bảng dịch
    sect→`comps.style`.
  - **Vòng hạt 108 → 30: 10 điểm, 2 loại** (3.0 mục 2) — `merit.ts:27` `MAX_COUNT`,
    `practice.ts:70` số chia vòng, 7 chỗ `temple-app.tsx`, copy `hall.tsx:590`, `kinh.js:6`.
    Sửa `merit.ts` mà quên `practice.ts` thì vòng không bao giờ tròn; sửa client mà quên server thì
    HUD hiện `/ 30` còn máy chủ tính theo 108.
  - `practice.ts`: bỏ `bell`.
  - `hall.ts`: bỏ garden routes, đổi wheel segments/que static, donate copy; `TEMPLE_ID` giữ
    `'nhattru'` (đổi nó = đổi key phòng, xem Phase 3).
  - `social.ts`: copy, group 8.
  - `schema.sql`: comment/seed; không rename.
- Client:
  - `temple-app.tsx`: toàn bộ label, bỏ nút chuông, bỏ tab vườn, bỏ drum settings.
  - `hall.tsx`: bỏ `GardenSheet`, đổi Rank/Stele/Bag/Profile/Guide/Settings; **sửa id phái hardcode
    ở `hall.tsx:538,546`** (3.0 mục 10) và fallback `sect: 'tinhdo'` trong `identity.ts:153` +
    `DEFAULT` ở `schema.sql:21` — không thì cẩm nang vẫn là thiền phái và người mới sinh ra với phái
    đã bị xoá. `identity.test.ts:25` cũng đang pin `'tinhdo'`.
  - `practice.tsx`: Chant/Meditate/Wheel/Que copy.
  - `people.tsx`: NPC, friends/groups/DM.
  - `api.ts`: MESSAGES.
  - `effects.ts`: sen → Hex/star.
  - `engine.ts`: TEMPLE/SECTS/ITEMS; rà luôn `engine.ts:12` (donate inline) và `engine.ts:57`
    (ghim `nhattru`).
- Trang: metadata `page.tsx`, nav `messages.ts`, title "Đền Cầu May · TFTIQ".
- Tests: `identity.test.ts`, `endpoints.test.ts`, `temple.spec.ts` (nhãn mới; 12 hero card vẫn giữ nếu chưa đổi avatar).
- Thêm test/grep gate cho từ cấm trên file copy (không quét identifier `sen`).

**Acceptance:**

- Tất cả luồng hiện tại chạy; không còn UI vườn/chuông/mõ.
- Không còn từ chùa/Phật/thiền/tụng/lạy/công đức trong chuỗi hiển thị.
- Một vòng tròn đúng **30** hạt: lần thứ 30 được thưởng vòng, không lần nào giữa 1–29 thưởng
  (chứng minh `merit.ts` và `practice.ts` đi cùng số).
- `typecheck` + test temple pass.

**Ước lượng:** 4–6 ngày.

### Phase 2 — Nối dữ liệu TFT (4–6 ngày)

- Thêm module `fortune.ts` (hoặc mở rộng `hall.ts`) với các endpoint ở mục 6. Web và API chạy cùng
  process nên **gọi hàm nội bộ**, không tự `fetch` vòng sang `/api/comps`.
- `QueModal` nhận thêm `comp`; render thẻ gọn: tier, style, difficulty, 4–7 unit icon, item, augment, 2 tip; nút "Xem comp" link `/[lang]/tierlist/comps/[slug]`.
- HUD: badge patch + top 3 comp; bấm mở comp hoặc quẻ.
- `GuideSheet`: 5 lối chơi, top comp mỗi lối, link.
- NPC:
  - Coach → top comp/assistant.
  - Analyst → patch/augment odds/item priority.
  - Fortune → mở quẻ.
- `ChantView`: gọi `/reads`, fallback static; hiện nguồn.
- Prefill mục tiêu/đèn theo comp vừa rút (nếu Phase 2b làm đèn).
- Tests: quẻ trả comp hợp lệ, 1 lần/ngày, fallback DB rỗng, link đúng.

**Acceptance:** mỗi ngày rút được một comp thật; nội dung đọc lấy từ DB; mobile không vỡ.

**Ước lượng:** 4–6 ngày.

### Phase 2b — Đèn cầu may (tùy chọn, 2–3 ngày)

- Làm lại bản tối giản theo mục 6.5.
- Nếu không làm, bỏ hẳn khỏi flow và không nhắc trong UI.

### Phase 3 — Bỏ đồ chùa, thêm props TFT (5–8 ngày)

**3a. Một theme do admin chọn (thay cho ý tưởng "nhiều chùa / nhiều room / mỗi người một skin")**

Chốt 2026-11-05: **cả sảnh chỉ dùng MỘT theme, admin là người chọn bản nào.** Không làm picker cho
người chơi, không lưu pref ở localStorage. Lý do thật: chưa chốt được mẫu nào là bản cuối, nên việc
cần làm là *giữ quyền đổi mà không phải sửa code/redeploy*, không phải cá nhân hoá cảnh.

- **Cơ chế đã có sẵn, chỉ nối thêm** (đã kiểm trong repo):
  - Bảng `app_settings (key, value, updated_by)` — `apps/api/src/schema.sql:293`.
  - Allow-list trong `apps/api/src/settings.ts` (`ASSISTANT_SETTING_SPECS`, mỗi key có
    `env/label/hint/kind/options`), một row trong bảng thắng env của host, xoá row thì trả về env.
  - UI đã có ở `apps/web/app/admin/(shell)/settings/page.tsx` — thêm spec là **tự hiện** lên trang.
- **Key mới:** `TEMPLE_THEME`, `kind` chọn trong 15 id `meta.json.temples`, giá trị mặc định
  `'nhattru'` (id lạ hoặc rỗng thì fallback về `nhattru`, không được để trắng cảnh).
- **Đường đi của giá trị:** server đọc setting → trả trong `/api/temple/state` (hoặc
  `/api/temple/theme`) → `engine.ts:57` dựng `TEMPLE` theo id đó thay vì hằng số. **Không** cho client
  tự chọn và **không** đổi key phòng: WS vẫn gửi `temple=nhattru`, `hall.ts:16` giữ `TEMPLE_ID`, số
  online và fix `27e79ce` còn nguyên.
- **Khoá `size` + `cushions` + `view`** cho mọi theme, lấy theo `nhattru` (`size [28,28,9]`,
  `cushions` 8 cột × 7 hàng = 56 chỗ, `z0 -5.6`, `dz 2.4`). Đây là điều kiện sống còn: frame WS gửi
  `x/z` tuyệt đối **và** `seat`, bên nhận tra `this.temple.cushions[p.seat]` trên mảng cushion của map
  mà máy nó đang render (`world.js:581`), nội suy không clamp → khác kích thước là avatar ngồi sai ô,
  xuyên tường (đo ở 3.0.1: 56→154 chỗ, `z0` khác từng map, chỉ `linhung`/`kimson` trùng).
- **Theme chỉ được khác** ở `wall`, `wallColor`, `pillar`, `floor`, `roof`, `mural`, `hallStyle`,
  `windowsAllSides`, `light`, `fog`, `extras`, `statues` + bảng nhạc. (`hallStyle` có ở 7/15 map,
  `windowsAllSides` 1/15 — đều tùy chọn nên an toàn.)
- **Gate rẻ:** một test `assert.deepEqual` `size` + `cushions` + `view` giữa mọi theme trong
  `meta.json`. Thêm theme mới không qua gate thì không được vào, và admin bấm đổi không vỡ phòng.
- **Đổi theme giữa phiên:** có hiệu lực từ lần load kế tiếp của mọi người (floor và seat vẫn đúng vì
  đã khoá), không cần dựng lại phòng.
- **Hệ quả khi bật:** `size`/`cushions`/`view` của **14 map còn lại phải ghi đè theo `nhattru`**
  (một lần, bằng script Node chỉnh JSON — `meta.json` là một dòng 38K byte, không sed thủ công).
  Không làm thế thì gate đỏ và admin đổi theme là sập phòng.
- **15 map vẫn ở lại JSON** (không cắt): chúng là danh sách choices của admin. Bundle chỉ phình thêm
  một phần của 38K — cái nên cắt là `donate`/`fund` và `content.json` stories/tales của 14 id không
  dùng.
- **Ràng buộc thật:** `exterior.js` (3.160 dòng) dựng cảnh *quanh* chùa bằng toạ độ tuyệt đối theo
  `view`, nên khi khoá `view` thì ngoại cảnh không đổi theo theme — theme chỉ đổi **nội thất**. Muốn
  đổi cả ngoại cảnh là việc Phase 3 có art, không nằm trong cơ chế admin chọn này.

**3b. Đồ chùa còn lại**

- **Bỏ `theme.statues: []`: ý này đã lỗi thời.** Bàn thờ từ `b38a8a9` là
  `[{kind:'pengu',x:0,scale:1.2,mat:'gold'}]` và nên giữ. `altarW` suy từ span `x` của statues
  (`temple.js:285-301`, mount ở `altarH = 1.3`) nên đổi scale là đổi luôn vị trí sàn quanh bàn thờ.
- Bỏ `lotusPond` (dead config, 3.0 mục 9) và cắt **hương án / nến / hai lọ sen / lư hương** trong
  `temple.js:285-343` — chúng dựng **vô điều kiện**, nên không có đường nào "bỏ tượng là hết đồ
  chùa".
- Thêm **bàn Hex / crystal / portal** dựng procedural cạnh pengu (không cần model ngoài), banner
  bằng canvas texture: tên đền, patch, top comp; tránh logo Riot.
- Đổi màu áo choàng/bồ đoàn sang palette Hex; đổi tên slot; bỏ animation hương/hoa nếu không thay
  được bằng glow.
- Đổi hiệu ứng cánh sen → mảnh Hex/star; giữ đèn.
- Quyết định avatar anime: `HERO_LIST` 12 nhân vật trong `vendor/temple/js/avatar.js` vẫn nguyên;
  giữ tạm hay genericize (xem rủi ro).

**Acceptance:** screenshot không còn tượng Phật/sen/nhang rõ rệt; FPS mobile không giảm; các chỗ
ngồi/emote vẫn hoạt động; hai máy khác skin nhìn nhau đúng chỗ ngồi (`seat`), test gate size/cushions xanh.

**Ước lượng:** 5–8 ngày (phụ thuộc art). Nối 3a (`TEMPLE_THEME` + script khoá size/cushions/view +
test gate) ~1 ngày, làm trước 3b cũng được vì nó không đụng art.

### Phase 4 — Social, URL, dọn dẹp (2–3 ngày)

- Đổi nhãn: Đồng đội, Tổ đội (max 8), Tin nhắn, Bảng đồng hành.
- BXH: "BXH cầu may", filter theo lối chơi, ghi rõ không phải rank.
- Dọn dữ liệu cũ: `honor`, `sect`, announcement cũ; bảng `temple_plants` để dormant rồi drop sau.
- **Không có chuyện đổi room / tách phòng theo map** (3.0.1). `TEMPLE_ID`, key phòng `temple:room`
  và `?temple=` giữ nguyên; đổi duy nhất là *nhãn* trong UI.
- URL: **giữ `/temple`, bỏ ý đổi `/shrine`.** Đổi path chỉ để đổi tên kéo theo redirect 301,
  sitemap, metadata, nav `messages.ts` và `/vi/temple` trong `temple.spec.ts` — không mua được gì
  cho nghi lễ trước trận. Nếu vẫn muốn đổi thì làm **sau** khi Phase 2 ship, một commit riêng.
- QA: e2e 2 trình duyệt, mobile, copy gate, a11y cơ bản.

**Acceptance:** link cũ không chết; không còn nội dung chùa trong UI; test ổn định.

**Ước lượng:** 2–3 ngày.

### Tổng thời gian

- MVP (Phase 0–2): khoảng **2–2,5 tuần** (Phase 1 đội lên 1 ngày vì vòng hạt có 10 điểm và cần bảng
  dịch sect→`comps.style`).
- Đầy đủ (gồm Phase 2b, 3, 4): khoảng **3–4 tuần**; nếu làm skin sảnh (Phase 3a) thì cộng ~1 ngày.

---

## 8. Rủi ro và điểm cần chốt

1. **Avatar anime:** 12 nhân vật Luffy/Naruto… không phải TFT. Giữ nguyên thì đền vẫn "lệch tông"; thay bằng model TFT là việc lớn. Đề xuất: MVP giữ tạm, Phase 3 quyết định genericize hoặc thay bằng portrait champion cho HUD.
2. **Chất 3D sau khi bỏ đồ chùa:** tượng đã là pengu vàng, nhưng hương án/lư hương/lọ sen vẫn dựng
   vô điều kiện (`temple.js:285-343`). Bỏ chúng dễ, thay bằng bàn Hex đẹp thì cần thời gian. Nếu
   Phase 3 gấp, có thể chỉ cắt đồ thờ và thêm banner 2D.
3. **Nội dung "đọc meta":** nếu comp tips quá ngắn, bài đọc sẽ nhàm. Cần chọn lọc 3–5 comp + patch notes; không nhồi toàn bộ DB.
4. **Không có kết quả trận:** đền chỉ là thói quen trước queue; nếu không có nội dung mới mỗi ngày, người chơi sẽ bỏ. Bù bằng quẻ/comp top/patch thay đổi theo ngày.
5. **IP Riot:** đã dùng tên/icon champion; chỉ tránh logo và ngụ ý chính thức, thêm disclaimer fan-made.
6. **Migration dữ liệu cũ:** `sect`, `honor`, item cây; nếu bỏ qua, UI sẽ fallback về phái đầu tiên và hiện sai. `sect` không có CHECK trong DB nên lỗi này **không** bị DB chặn.
7. **Test cũ:** `apps/web/tests/temple.spec.ts` đang bám chữ "Hồ sơ", "Đồng Tu Một", 12 hero card, `/vi/temple`; đổi copy/URL phải sửa test cùng lúc.
8. **Copy gate false positive:** không quét các identifier như `sen`; chỉ quét file copy/JSON/chuỗi hiển thị.
9. **Bundle client mang nội dung 15 map:** `meta.json` (~38K, một dòng) được inline qua `engine.ts`,
   trong đó có `donate` (số tài khoản + tên thật) và `content.json` 84K có stories/tales keyed theo
   đủ 15 id. Cắt map là giảm cả hai.
10. **Skin lệch frame:** nếu ai đó thêm skin có `size`/`cushions` khác, lỗi nổ ở máy *người khác*
    (avatar ngồi sai ô, đi xuyên tường) chứ không ở máy người chọn — bắt buộc có test gate
    Phase 3a, không dựa vào review.

### Cần chốt thêm (nhỏ)

| Câu hỏi | Đề xuất | Trạng thái |
|---|---|---|
| 30 hạt/vòng hay giữ 108? | 30, sửa đủ 10 điểm ở 3.0 mục 2 | chưa chốt |
| Cấp fantasy hay rank TFT thật? | fantasy (Tân binh → Huyền thoại) | chưa chốt |
| URL `/temple` hay `/shrine`? | **giữ `/temple`**, bỏ hẳn ý đổi | đề xuất chốt ở đây |
| Avatar anime MVP? | giữ tạm, quyết ở Phase 3 | chưa chốt |
| Đèn cầu may Phase 2b? | làm lại bản tối giản nếu còn thời gian, không thì bỏ hẳn | chưa chốt |
| 14 map chùa: cắt hay thành theme? | **giữ cả 15 làm theme, admin chọn một bản qua `/admin/settings`** | **đã chốt 2026-11-05** |
| `meta.json.donate` (số TK + tên thật trong bundle)? | chuyển ra server hoặc bỏ cổng donate | **cần quyết trước Phase 1** |
| `duc` | xoá khỏi API/`exp` | chưa chốt |

---

## 9. Ghi chú thực thi

- Không đổi schema ở Phase 1; chỉ đổi seed/comment và map dữ liệu cũ bằng câu lệnh một lần.
- Không import component Tailwind của site chính vào HUD temple; đọc dữ liệu qua API và render bằng CSS hiện có, hoặc link ra trang canonical.
- Khi sửa `meta.json`, kiểm tra cả `world.js`/`temple.js` vì chúng đọc trực tiếp `theme.statues`, `theme.extras`, `items` — một id/item thiếu có thể làm trắng cảnh. `meta.json` là **một dòng 38K byte**, sửa bằng script hoặc editor có word-wrap, đừng grep-sed thủ công.
- `theme.statues[].scale` **đổi là đổi luôn layout quanh bàn thờ**: `altarW` suy từ span `x` của
  statues và mount ở `altarH = 1.3` (`temple.js:285-301`). Nhát hiện tại là `x:0, scale:1.2`.
- Tượng penguin dựng procedural trong `vendor/temple/js/statues.js` (`buildPengu`, dispatch ở dòng
  ~1593). Kim loại cần `envMapIntensity ≈ 2.4` + `emissive '#2a1a06'` vì `world.js` đặt
  `environmentIntensity = 0.35`; bỏ hai cái này là tượng xỉn gần đen. Preview ở `tmp-pengu-preview/`
  (`?real=1` dựng đúng tệp vendor + đúng ánh sáng chùa) — quyết định giữ hay xoá thư mục này.
- Giữ các fix gần đây: timezone `now() + 7h`, meditate atomic, XSS `esc`, WS dedupe, retry DDL,
  loader retry (`aa92383`), card người chơi trong `.modal-card` (`5c958ad`), không báo ai đã rời
  khi họ vẫn đứng trong sảnh (`27e79ce`).
- Sau mỗi phase, chạy: `npm run typecheck`, test temple API, Playwright temple; kiểm tra mobile 390×844 và desktop.
