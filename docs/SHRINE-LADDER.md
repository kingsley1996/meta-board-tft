# SHRINE-LADDER — Thang Cát Vận: cấp độ may mắn & danh hiệu

Docs trước, **chưa code**. Mốc code: `16d4246` (2026-11-06). Người chốt: chủ project.

## 0. Phạm vi, và hai quyết định cũ bị đề nghị ghi đè

Ý định: thay bậc cấp hiện tại bằng một **thang cấp độ may mắn mang tên Hán Việt** (mục 3), lấy
Điểm May Mắn (`temple_profiles.exp`) làm nội công, và tách **cấp độ** (đường thăng tiến) khỏi
**danh hiệu** (huy hiệu do thành tựu, không cộng điểm).

Chỉ **khung** của thang tu luyện được mượn: bậc lớn chia 3 bậc nhỏ, vượt bậc lớn là một mốc ăn
mừng. **Toàn bộ tên gọi tu tiên bị loại** theo chỉ thị 2026-11-06 và thay bằng trường từ vựng
cát tường 吉祥 (xem §3.2).

| Quyết định cũ | chỗ ghi | đề nghị |
|---|---|---|
| "7 bậc, ngưỡng exp giữ nguyên" | `SHRINE-CONTENT-MAP.md:30-42` | **Ghi đè.** Ngưỡng cũ do `api.js:195-213` để lại, không phải do thiết kế; nó cho phép một người để tab mở qua hết bậc 7 trong chưa tới một ngày (xem §1.3). |
| "Không thêm hệ gameplay mới" | `SHRINE-PLAN.md:29` | **Giữ nguyên, và doc này vẫn đúng ràng buộc.** Không có tiền mới, không có bảng mới, không có endpoint mới, không có RNG mới. `exp` vẫn là cột duy nhất; *vận* chỉ là cách đọc cột đó. Hai thứ duy nhất chạm vào gameplay là §2 (siết nguồn điểm) và §4 (cửa "duyên"), cả hai chỉ thêm điều kiện trên dữ liệu đã tồn tại. |

Bất biến phải giữ (`SHRINE-PLAN.md:20-29`): server giữ mọi con số; **không hứa may mắn ảnh
hưởng trận đấu**; không tiền thật; không phải rank TFT — BXH vẫn là bảng chuyên cần.

## 1. Hiện trạng (đo từ code, không từ trí nhớ)

### 1.1 Thang đang chạy

`apps/api/src/temple/identity.ts:68-76` — `LEVELS`, 7 bậc, exp `0/50/150/320/600/1000/1600`,
danh hiệu Tân Binh → Lữ Khách → Người Thắp Đèn → Kẻ Thử Vận → Cao Thủ → Bậc Thầy Hex →
Huyền Thoại. `levelFromExp()` (`:78-90`) là hàm duy nhất map exp→bậc; bậc cuối trả
`expNext = exp + 1000` chỉ để thanh tiến độ không chia 0.

Chuỗi danh hiệu cũ **không phải** tên tu tiên, nhưng cùng họ "fantasy" — và nó đã được chọn có ý
để *không* mượn tên rank TFT (comment `identity.ts:65-67`), nên đổi sang tên Hán Việt vẫn không
phá quyết định đó.

### 1.2 Nguồn điểm (mọi đường cộng exp)

| Hành động | exp | chỗ ghi | trần/chống farm |
|---|---|---|---|
| Ghé sảnh lần đầu trong ngày | 20 | `merit.ts:33`, `practice.ts:54-64` | `temple_practice.visits`; lần sau trả 0 |
| Cầu may (bow) | 5/lần | `merit.ts:35`, `practice.ts:65-67` | cooldown 3s/gói (`practice.ts:39`), `MAX_COUNT=30`/gói (`merit.ts:26`), client gom 4-5 (`temple-app.tsx:176,195`) |
| Thiền | 12/phút | `merit.ts:36`, `practice.ts:72-76,200-220` | 60 phút/nhịp, **240 phút/ngày** (`merit.ts:29-30`) |
| Dâng bùa / nến / đóa sao | 10 / 5 / 8 | `practice.ts:30-34,88-107` | trừ đồ trong cùng UPDATE (`merit.ts:218-229`); bùa mở buff ×1.2 / 10 phút |
| Quẻ đội hình | 15 | `merit.ts:40`, `hall.ts:130-148` | 1 lần/ngày (PK `temple_draws`) |
| Tùy hỷ | `ceil(amount/10)` | `hall.ts:86` | theo số donate |
| Gửi lời chúc / mở quà | 10 / 5 | `social.ts:278,307` | chúc cooldown 3s |
| Buff lá bùa | ×1.2 | `merit.ts:53-56` | hết hạn theo `buff_until` |

Vòng quay Hex **không** cộng exp (`hall.ts:98-122`) — chỉ sen/ngoc/đồ.

### 1.3 Vì sao thang cũ không đứng được

- Trần lý thuyết một ngày: thiền 240 phút = **2.880 exp**, chưa tính cầu may lặp gói (25 exp/3s
  ≈ 500 exp/phút). Bậc 7 = 1.600 ⇒ **một đêm để tab mở là xong thang**.
- Không có khái niệm "đỉnh để nhắm": sau 1.600 exp người chơi chỉ nhìn một thanh tiến độ
  `exp + 1000` vô nghĩa (`identity.ts:89`).
- `exp` không bao giờ giảm ⇒ đây là thước *tổng thời gian hành trì*, hợp với tu luyện nhưng phải
  nói rõ để sau này không ai coi là bug.
- Hai cột **chết** trong lúc liên quan trực tiếp: `title text DEFAULT ''` (`schema.sql:25`) —
  không route nào ghi, HUD luôn rơi về fallback theo bậc (`state.ts:51,91`); `honor` (`:26`) — chỉ
  seed `'Lữ khách cầu may'` (`identity.ts:155`), không ai quản lý.Doc này dùng đúng hai cột đó,
  không thêm cột.

## 2. Bước 0 — siết nguồn điểm trước khi dựng thang

**Đã chốt 2026-11-06** ("siết trần như đề xuất"). Không làm bước này thì mọi ngưỡng ở §3 chỉ là
chữ. Hai chỉnh sửa, mỗi cái một hằng số:

- `MAX_MEDITATE_MIN_DAY` 240 → **90** phút (`merit.ts:30`). Lý do: 4 tiếng thiền/ngày biến BXH
  "chuyên cần" thành bảng xếp hạng máy để mở; người thật không theo nổi và sẽ nghỉ.
- Thêm hằng **`MAX_BOWS_DAY = 60`** (= 300 exp) cạnh `MAX_COUNT` (`merit.ts:26` — hằng đó chặn một
  *gói*, không chặn một *ngày*), chặn bằng `temple_practice.bows` — cột đã có và đã được ghi
  (`merit.ts:113-134`), không cần schema mới.

Sau siết: casual ~100 exp/ngày, người chuyên ~340 exp/ngày, người cày nặng ~1.500 exp/ngày
(mức trần), và các mốc ngày ở §3 mới có nghĩa.

## 3. Thang CÁT VẬN — 6 vận × 3 bậc + đỉnh, tên Hán Việt tự đặt

**Không mượn tên tu tiên.** Luyện Khí / Trúc Cơ / Kim Đan / Nguyên Anh / Hoá Thần / Liên Hư /
Đại Thừa bị loại theo chỉ thị 2026-11-06. Chỉ giữ **khung** của thang tu luyện (bậc lớn chia 3
bậc nhỏ, vượt bậc lớn là một mốc ăn mừng, lên bậc nhỏ thì nhẹ nhàng), còn toàn bộ từ vựng chuyển
sang trường **cát tường 吉祥 — lời chúc lành**, vì đơn vị điểm của chùa là Điểm May Mắn, còn tên
tu tiên thì kể chuyện luyện đan.

| Đơn vị | chữ | vì sao |
|---|---|---|
| Bậc lớn | **VẬN 運** (6 vận + 1 đỉnh) | "vận" đã là tiếng Việt thông thường ("đang vào vận", "đổi vận"), không mang mùi tu tiên, và chỉ thẳng vào may. |
| Bậc nhỏ | **BẬC 級** 1-3, không có tên riêng | HUD ghi `Vận III · bậc 2`; đặt tên cho 18 bậc nhỏ là 18 chuỗi người chơi phải học. **Đã ship 2026-11-06**: `levelFromExp()` trả thêm `{ realm, realmName, stage }`, `toProfile()` bỏ precedence `row.title ||` (title dẫn xuất thuần từ exp, không phải migrate), phần hiển thị phía máy khách dùng `vendor/temple/js/ladder.js` — một hàm `rungOf(level)` duy nhất cho cả HUD React lẫn nhãn 3D. |
| Mốc vượt vận | **THĂNG VẬN 升運** | từ ghép tự đặt (升 lên + 運 vận), thay cho "chứng ngộ". |
| Cửa ngày (§4) | **DUYÊN 緣** | không phải thuật ngữ tu tiên, là chữ sẵn có của đi lễ. |

### 3.1 Bảng thang

Cấp độ may mắn = vị trí trên thang này. `levelFromExp()` vẫn là hàm duy nhất map exp → vị trí,
vẫn đọc đúng một cột `exp`, trả thêm `{ realm, realmName, stage }`.

| exp cộng dồn | Vị trí | Tên hiển thị | nghĩa nôm (tooltip + bản en) | feedback |
|---|---|---|---|---|
| 0 | Vận I · 1 | **KHAI VẬN 開運** | mở vận, bước qua cửa | |
| 180 | I · 2 | Khai Vận | | toast |
| 350 | I · 3 | Khai Vận | | toast |
| **500** | Vận II · 1 | **HANH THÔNG 亨通** | trôi, không vướng | THĂNG VẬN |
| 750 | II · 2 | Hanh Thông | | toast |
| 1100 | II · 3 | Hanh Thông | | toast |
| **1600** | Vận III · 1 | **CÁT KHÁNH 吉慶** | việc lành đáng mừng | THĂNG VẬN |
| 2200 | III · 2 | Cát Khánh | | toast |
| 3000 | III · 3 | Cát Khánh | | toast |
| **4200** | Vận IV · 1 | **CÁT TƯỜNG 吉祥** | điềm lành đã thấy | THĂNG VẬN |
| 5600 | IV · 2 | Cát Tường | | toast |
| 7500 | IV · 3 | Cát Tường | | toast |
| **9500** | Vận V · 1 | **HỒNG PHƯỚC 洪福** | phúc lớn | THĂNG VẬN |
| 12000 | V · 2 | Hồng Phước | | toast |
| 15000 | V · 3 | Hồng Phước | | toast |
| **18000** | Vận VI · 1 | **Đại CÁT 大吉** | may lớn | THĂNG VẬN |
| 22000 | VI · 2 | Đại Cát | | toast |
| 27000 | VI · 3 | Đại Cát | | toast |
| **33000** | ĐỈNH | **NHƯ Ý 如意** | cầu gì được nấy | THĂNG VẬN |

Bộ tên đã chốt 2026-11-06 (phương án "Khai Vận → Như Ý"); các phương án khác đã loại: giữ Thuỵ
Quang (瑞 đọc dễ nhầm 諡 thụy hiệu), nhánh Dịch Kinh 元亨利貞, nhánh thiên tượng 甘露/青雲.

Đường tên vẫn có chủ ý: **Khai Vận → Đại Cát → Như Ý** — mở bằng "mở vận", kết bằng "may lớn" rồi
"đúng như mình cầu". Sáu trong bảy nhãn là tiếng Việt sẵn dùng, nên người chơi đọc hiểu ngay
không cần tooltip; tooltip chỉ còn để giải thích chữ Hán cho ai tò mò.

### 3.2 Kiểm chứng từng chữ (đừng có chấp Hán Việt bịa)

| Tên | chữ | nghĩa gốc | điểm phải biết |
|---|---|---|---|
| Khai Vận | 開運 | 開 = mở, 運 = vận | chữ 運 người Việt nhận ra qua "vận may", nên "khai vận" hiểu được dù không thông dụng bằng "khai trương" |
| Hanh Thông | 亨通 | 亨 = hanh, thông suốt (quẻ 乾: 元亨利貞) | tiếng Việt có sẵn "hanh thông", đây là nhãn dễ nhất trong thang |
| Cát Khánh | 吉慶 | 吉 = lành, 慶 = phúc đáng mừng | "khánh" quen qua "khánh tiết"; hơi gần 慶 Hỷ (họ Khánh) |
| Cát Tường | 吉祥 | 吉 = lành, 祥 = điềm lành | quen nhất nhóm, nhưng cũng là tên thương hiệu/địa danh phổ thông — chấp nhận, nghĩa tốt và không nhầm được |
| Hồng Phước | 洪福 | 洪 = lớn, "hồng phúc tề thiên" 洪福齊天 | cũng là tên đường/chùa; đọc vẫn ra "phúc lớn" |
| Đại Cát | 大吉 | 大 = lớn + 吉 = lành | cặp đối xứng với 小吉 (tiểu cát), thang không dùng 小吉 nữa |
| Như Ý | 如意 | 如 = vừa, 意 = lòng; 玉如意 "ngọc như ý" là vật cầu lành | quen thuộc tuyệt đối, và là *kết quả* của đi cầu may chứ không phải bậc tu |

**Ba nhóm từ bị cấm**, ghi rõ để lần sau không ai đề xuất lại:
- *Tu tiên*: 煉氣 LUYỆN KHÍ, 結丹 KẾT ĐAN, 元嬰 NGUYÊN ANH, 化神 HOÁ THẦN, 渡劫 ĐỘ KIẾP,
  靈根 LINH CĂN (linh căn gắn theo nhân vật sẽ biến thành *hứa* may mắn — phạm §0).
- *Tăng lữ*: 佛子 PHẬT TỬ, 居士 CƯ SĨ, 菩薩 BỒ TÁT, 禪師 THIỀN SINH — đúng bộ tên cũ đã bị thay ở
  `SHRINE-CONTENT-MAP.md:36-42`, không quay lại.
- *Rank TFT*: Sắt → Thách Đấu — đã bị từ chối có lý do ghi trong `identity.ts:65-67`.

### 3.3 Đường lên (sau khi siết ở §2)

| Mốc | casual ~100/ngày | chuyên ~340/ngày | cày nặng ~1500/ngày |
|---|---|---|---|
| II Hanh Thông (500) | 5 ngày | 1,5 ngày | 8 giờ |
| III Cát Khánh (1600) | 16 ngày | 5 ngày | 1,1 ngày |
| IV Cát Tường (4200) | 42 ngày | 12 ngày | 2,8 ngày |
| V Hồng Phước (9500) | 95 ngày | 28 ngày | 6,3 ngày |
| VI Đại Cát (18000) | 180 ngày | 53 ngày | 12 ngày |
| Đỉnh Như Ý (33000) | ~11 tháng | 97 ngày | 22 ngày |

Như Ý là mốc cuối ⇒ `expNext = exp + 5000` (thay `+1000` cũ, `identity.ts:89`) để thanh tiến
độ vẫn vẽ được mà không gợi ý còn gì để lên.

Cấu trúc tham chiếu (chỉ mượn *khung*, không mượn tên):
https://vanphongcac614.wordpress.com/2019-09-19/mot-so-thong-tin-chung-trong-truyen-tien-hiep-huyen-huyen/

## 4. Cửa "duyên" — vì sao lên *bậc* khác lên *vận*

Đúng mô-típ của thang tu luyện, bỏ hết tên: đủ điểm thì lên một **bậc** trong vận, nhưng vượt
**vận** cần **duyên 緣** — tức thời gian có mặt thật sự, không phải tổng exp dồn trong một đêm.

Điều kiện, cả hai vế server tính, đều đo từ dữ liệu đã có:

| Qua vận | exp (§3.1) **và** số ngày hành trì khác nhau |
|---|---|
| II Hanh Thông | 500 và ≥ 3 ngày |
| III Cát Khánh | 1600 và ≥ 7 ngày |
| IV Cát Tường | 4200 và ≥ 14 ngày |
| V Hồng Phước | 9500 và ≥ 25 ngày |
| VI Đại Cát | 18000 và ≥ 40 ngày |
| Đỉnh Như Ý | 33000 và ≥ 70 ngày |

"Số ngày hành trì khác nhau" = `COUNT(*) FROM temple_practice WHERE user_id = $1` (bảng đã có PK
`(user_id, day)`, mỗi người một hàng một ngày ⇒ đếm hàng là đếm ngày, không cần cột mới).

- Chưa đủ điểm → HUD báo `Thiếu N Điểm May Mắn`.
- Đủ điểm, thiếu ngày → HUD báo `Đủ công quả, chưa đủ duyên — cần thêm k ngày hành trì`, và thanh
  tiến độ **treo ở 100%**, không ẩn đi. Đây là chỗ duy nhất có chữ mới ngoài §3, và nó chặn đúng
  một kiểu gian lận (để tab mở) mà không phạt người chơi đều.
- Bậc trong cùng một vận: không cần duyên, chỉ cần exp.

Ràng buộc: cửa duyên **không** áp dụng cho BXH (vẫn là exp trong ngày, `practice.ts:121-168`),
không đổi `/leaderboard`, không đụng `temple_practice`.

## 5. Danh hiệu — cột `title` đang chết, dùng nó

Danh hiệu là **huy hiệu**, không phải cấp: không cộng exp, không mở cửa, không ảnh hưởng trận.
Máy chủ tự tính từ dữ liệu đã có; máy khách không được set (`routes.ts:85-93` đã chặn ghi
`title`/`exp` — giữ nguyên). Cột `temple_profiles.title` lưu **id danh hiệu đang đeo**;
danh hiệu đủ điều kiện tính lúc đọc hồ sơ, không lưu ⇒ **không migration, không bảng mới**.

| id | danh hiệu | chữ | nghĩa nôm (tooltip) | điều kiện (đo được hôm nay) |
|---|---|---|---|---|
| `so_tam` | SƠ TÂM | 初心 | lòng ban đầu | mặc định cho hồ sơ mới (`streak ≥ 1`) |
| `tinh_tan` | TINH TẤN | 精進 | siêng không ngơi | ≥ 21 ngày hành trì |
| `bang_thu` | BẢNG THỦ | 榜首 | đứng đầu bảng | top 10 BXH tuần một lần (`temple_practice` theo tuần) |
| `an_toa` | AN TỌA | 安坐 | ngồi yên được lâu | ≥ 240 phút thiền cộng dồn |
| `cat_qua` | CÁT QUẺ | 吉卦 | quẻ lành | ≥ 30 hàng `kind='que'` trong `temple_draws` |
| `bat_tuc` | BẤT TỨC | 不息 | không dứt (自強不息) | `best_streak ≥ 30` |
| `shi_chu` | THÍ CHỦ | 施主 | người dâng lễ | `SUM(temple_donations.amount) ≥ 100000` |
| `tri_ky` | TRI KỶ | 知己 | bạn đồng hành | ≥ 3 hàng `temple_friends` trạng thái chấp nhận |
| `du_khanh` | DƯ KHÁNH | 餘慶 | phúc còn lại ("tích thiện chi gia tất hữu dư khánh" 積善之家必有餘慶, Dịch truyện) | `best_streak ≥ 100` |
| `tien_phong` | TIÊN PHONG | 先鋒 | người đi trước | chỉ cấp một lần lúc migrate: `exp ≥ 1600` (§7) |

Đỉnh Như Ý **không** kèm danh hiệu tự động: tên vận đã là phần thưởng, và một huy hiệu trùng tên
bậc vừa đạt chỉ thêm một dòng chữ trong card. `tien_phong` (thay cho KHAI SƠN 開山) vì "Khai Sơn"
đứng cạnh "Khai Vận" của vận I thì hai mốc gần như đồng âm, người chơi sẽ tưởng cùng một thứ.

Cùng trường từ vựng 吉祥 với thang ở §3.1: **danh hiệu không tên tu tiên, không tên tăng lữ**.
Mỗi cái phải có **cả hai** — nhãn Hán Việt in ở card, nghĩa nôm trong tooltip — vì người chơi
hiện tại không đọc được chữ Hán; nhãn nào không giải thích nổi trong 4 chữ thì đổi nhãn.

Quy tắc hiển thị: tên người + danh hiệu đang đeo ở card (`people.tsx:103,407,605`) và HUD
(`temple-app.tsx:613`);BXH giữ cột `title` (`practice.ts:133`) nhưng đổi nghĩa chuỗi. Người đeo
danh hiệu mặc định (`so_tam`) thì HUD **không in** dòng danh hiệu — đỡ một dòng chữ vô nghĩa
trong card.

Cột `honor`: chuyển sang hàng chờ — doc này không dùng. Nếu muốn nó thành "dòng ghi chú tự do
của hồ sơ" thì phải tách thành quyết định riêng (hiện chỉ seed, không route nào ghi).

## 6. Thưởng, HUD, và tiết tấu thông báo

- **Lên bậc trong vận**: toast một dòng, không modal, không thưởng (`levelUps` trả về vẫn có nhưng
  client chỉ toast). 18 mốc mà mốc nào cũng bật modal thì modal thành noise.
- **Lên vận**: modal **THĂNG VẬN** (dùng lại modal sẵn ở `temple-app.tsx:795-803`, đổi chữ và nội
  dung), thưởng sen = `100/200/400/800/1500/3000` theo vận II→đỉnh, thay cho `level × 50` cũ
  (`merit.ts:82-87`). Con số vẫn là **sen** (Tinh thể/`ngoc` không đụng) — economy-lite, không tiền thật.
- **Treo danh hiệu**: đổi trong panel Hồ sơ, không thưởng.
- Thanh tiến độ HUD vẽ theo *bậc hiện tại → bậc kế* (không phải → vận kế) để luôn có nhịp phản hồi
  ≤ 2 ngày với người chuyên.
- Chip cấp trong HUD chỉ in **nhãn ngắn** (`Cát Tường · bậc 2`) — không in chữ Hán trong chip 60px;
  chữ Hán + nghĩa nôm chỉ xuất hiện ở modal Thăng Vận và tooltip.
- Không đổi màu avatar/không đổi tượng theo vận ở pha đầu; phần thưởng hiển thị duy nhất là
  **chữ**. Mở khoá theo vận (áo, bệ, bạn đồng hành) để riêng ở §11 pha C, vì nó đụng
  `meta.json` + `world.js` và cần duyệt ảnh trước.

## 7. Chuyển đổi số liệu cũ — không ai bị tụt

`exp` **không reset, không nhân, không chia** — vẫn là cùng một cột, chỉ ngưỡng đọc khác đi.
Hệ quả phải nói thẳng:

| Người có exp | nhãn cũ | nhãn mới |
|---|---|---|
| 1600 (Huyền Thoại cũ) | Huyền Thoại | Cát Khánh · bậc 1 |
| 1000 (Bậc Thầy Hex) | Bậc Thầy Hex | Hanh Thông · bậc 2 |
| 320 (Kẻ Thử Vận) | Kẻ Thử Vận | Khai Vận · bậc 2 |

Để "không ai mất gì", ai từng chạm bậc 7 cũ (`exp ≥ 1600` lúc migrate) được đeo vĩnh viễn danh
hiệu `tien_phong` — **TIÊN PHONG 先鋒** (§5), điều kiện `exp_cũ ≥ 1600`, cấp một lần bằng
`UPDATE temple_profiles SET title='tien_phong'` trong script migrate (script một phát, chạy idempotent
theo kiểu `rename-meta.mjs` đã dùng, không phải gameplay).

Prod hiện có bao nhiêu hồ sơ `exp ≥ 1600`: **chưa đo** — phải `SELECT count(*)` trước khi quyết
danh hiệu đó có đáng tồn tại không (§12 câu hỏi 6).

## 8. Chuỗi mới phải viết ở đâu (6 bề mặt)

**Bản en hoãn lại (chỉ thị 2026-11-06: "hiện tại chưa làm bản tiếng anh").** Chùa đang hardcode
tiếng Việt, nên pha A chỉ viết chuỗi vi; mọi nhãn dưới đây giữ nguyên một chỗ duy nhất
(`identity.ts` `FATES`) để khi làm en chỉ phải thêm một field `glossEn`, không phải dò lại 6 bề mặt.

1. `identity.ts` — mảng `LEVELS` thay bằng `FATES`: `{exp, realm, han, gloss, title}` (nhãn Hán Việt
   + nghĩa nôm đi cùng nhau ngay tại nguồn, không để chuỗi tự do lang thang).
2. `temple-app.tsx:613, 527, 795-803` — chip cấp, thanh tiến độ, modal Thăng Vận, chữ "chưa đủ duyên".
3. `people.tsx:103, 407, 605` + `hall.tsx:21-94` — card người chơi và cột BXH.
4. `api.ts:84-103` `MESSAGES` — mã lỗi server → tiếng Việt, thêm `not_enough_affinity`.
5. `practice.ts` / `identity.ts` — `title` seed, `OFFERINGS`, `QUE_CARDS` nếu đổi tên theo vận.
6. `data/meta.json`, `data/content.json` — chữ mô tả vật phẩm nếu nhắc tới bậc.

Riêng bản **en** (hoãn): đây là lần đầu chùa có chuỗi Hán Việt, và khi làm en không được dịch thô
("Great Luck") mà nên giữ nguyên nhãn La tinh hoá (`Dai Cat`) + gloss tiếng Anh
(`great fortune`) — cùng khuôn với cách `sect`/`honor` đang xử lý. Ghi lại để quyết định này không
phải nghĩ lại từ đầu.

Bẫy đã ghi ở `SHRINE-CONTENT-MAP.md §5`: có một gate grep quét chuỗi Việt trong source; đặt tên
mới phải chạy lại gate đó.

## 9. Việc phải làm (không code, chỉ đường dẫn)

| Pha | File | Nội dung |
|---|---|---|
| A0 | `merit.ts:26,30` | siết trần thiền + trần cầu may/ngày (§2) |
| A1 | `identity.ts:68-90` | `FATES` + `levelFromExp()` trả `{realm, stage, han, gloss, title, expNext, affinityDays}` |
| A2 | `merit.ts:65-105` | `levelUps` phân biệt lên-bậc / lên-vận; thưởng sen theo vận |
| A3 | `state.ts:51,91`, `practice.ts:159` | hồ sơ đọc ra mang nhãn mới; cửa duyên chặn ở server, không phải client |
| A4 | `temple-app.tsx`, `people.tsx`, `hall.tsx` | HUD/card/BXH theo §6 |
| B | `identity.ts` (danh hiệu), `routes.ts` (PUT chọn đeo), `ui.tsx` (panel Hồ sơ) | §5, không migration |
| C | `meta.json`, `world.js`, `avatar.js` | mở khoá hiển thị theo vận — **tạm hoãn, cần duyệt mock** |
| migrate | `apps/api/src/temple/` script + `schema.sql` | chạy một lần: đếm `exp ≥ 1600`, set `title='tien_phong'` |

`schema.sql`: **không đổi**. Toàn bộ nằm trong `identity.ts` (ngưỡng), `merit.ts` (trần/thưởng),
`practice.ts` (đọc nhãn + chặn cửa duyên), và ba component HUD.

## 10. Gate phải cập nhật (không được "sửa test" theo nghĩa nới lỏng)

- `identity.test.ts:8-16` **khoá cứng** ngưỡng `LEVELS` (đoan 4 assertion `deepEqual` chuỗi
  `'Tân Binh'/'Lữ Khách'/'Huyền Thoại'`) ⇒ đây là test duy nhất bị vỡ có chủ đích; viết lại thành
  bảng `FATES` 19 mốc + test "exp 499 chưa lên vận II; exp 500 mà mới 2 ngày thì chưa qua, đủ
  3 ngày thì qua" — cửa duyên **phải có test**, không chỉ có chữ trong doc.
- `endpoints.test.ts:196` ("số của `/stele` là title theo bậc chứ không phải honor") vẫn đúng nghĩa
  nhưng phải đổi chuỗi dự đoán theo nhãn mới.
- `rooms.test.ts`, `tickets.test.ts`: không đụng (hệ WS độc lập).
- `apps/web/tests/temple.spec.ts`: không thêm case — Playwright **không chạy trong CI**, và case
  HUD mới chỉ đáng thêm nếu đổi layout thật; nghiệm bằng screenshot headless như mọi khi.
- Lệnh gate: `cd apps/api && node --env-file-if-exists=.env --test src/temple/*.test.ts`,
  `npx playwright test temple.spec.ts` (root), typecheck web + `next build`.

## 11. Tiên lượng & thứ tự

- **A0-A3 (server + nhãn)**: nửa ngày, rủi ro thấp, vỡ duy nhất `identity.test.ts`.
- **A4 (HUD)**: một buổi, rủi ro ở layout card đã chốt (`SHRINE-REVIEW` từng ghi layout vỡ).
- **B (danh hiệu)**: một ngày, có `PUT` chọn đeo + 10 điều kiện SQL; rủi ro là mỗi điều kiện phải
  đo được bằng test, không phải bằng mắt.
- **C (mở khoá hiển thị)**: chưa ước lượng — cần mock trước khi code theo lệ đã chốt.

## 12. Cần người dùng chốt

**Đã chốt 2026-11-06:**
- (1) Sáu tên vận + đỉnh = **Khai Vận / Hanh Thông / Cát Khánh / Cát Tường / Hồng Phước / Đại Cát /
  Như Ý** (§3.1).
- (2) Ghi đè `SHRINE-CONTENT-MAP.md §2` và siết trần — thiền 90 phút/ngày, cầu may 60 lần/ngày (§2).
- (5a) **Bản en hoãn lại** — chưa làm chuỗi tiếng Anh cho thang này (§8).

**Còn mở:**

1. 19 mốc (đỉnh ~3,5 tháng cho người chuyên) hay rút xuống 5 vận / 16 mốc cho người chơi thật tới
   được đỉnh?
2. Cửa "duyên" (§4): giữ, hay để lên vận chỉ cần exp?
3. `honor` để ngỏ hay thành ghi chú tự do của hồ sơ?
4. `exp ≥ 1600` trên prod (tôi đo trước khi code — cần bạn duyệt cho đọc prod DB): cấp `tien_phong`
   cho từng đó người có ổn không?

Khung hình cho các nhãn này không nằm ở doc này — xem [SHRINE-BADGE-FRAMES.md](SHRINE-BADGE-FRAMES.md).
