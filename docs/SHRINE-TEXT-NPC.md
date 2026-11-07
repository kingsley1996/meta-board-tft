# SHRINE text + NPC — kiểm kê và plan đổi nội dung

Đo ở HEAD `eb76882`, ngày 2026-11-07. Nguồn quyết định: `SHRINE-PLAN.md` §5 (bảng map) + §5.1
(glossary), `SHRINE-CONTENT-MAP.md` §5 (từ cấm + phạm vi gate). File này là **bản thực thi cho phần
text/NPC còn lệch**, không thay hai file kia.

Mọi chuỗi đã đối chiếu NFC. `content.json` và `meta.json` nén một dòng nên trích dẫn là `:1` + JSON path.

## 0. Ba sự thật quyết định phạm vi

1. **Đền active hardcode `nhattru` ở cả hai đầu** — `apps/web/components/temple/engine.ts:58` và
   `apps/api/src/temple/hall.ts:17` (`TEMPLE_ID`). Chưa có admin skin picker (đã chốt ở
   `SHRINE-CONTENT-MAP.md` §0 #6 nhưng chưa dựng). → 14 đền còn lại là **nội dung chết hôm nay**,
   không phải "sẽ dùng nay mai".
2. **View đang dựng là `theme.view = 'pond'`** (`meta.json $.temples[0].theme`), và
   `buildSurroundings` chỉ chạy `VIEWS[view]` (`exterior.js:3108`). `VIEWS.pond` = dòng 1580–1672,
   **không có chuỗi Việt hiển thị nào** (5 hit trong khoảng đó đều là comment).
   `buildTempleModel` (`exterior.js:3138`) **không còn ai import**.
   → 223 dòng có chữ Việt trong `exterior.js` (222 KB) nằm cả trong 14 view chết + hàm chết.
3. **`cable` chỉ được gán trong `VIEWS.baden` (:2117) và `VIEWS.fansipan` (:2481)**, không phải
   `pond`. → nhãn "Đi cáp treo lên đỉnh" / "Rời cáp treo" là copy mồ côi, **đã xoá ở P0** cùng
   `cable` trong `EngineCtx` (`engine.ts:83`). `world.js:757` vẫn emit `cable` và `nearCable`/
   `rideCable`/`endRide` (:373,377,388) vẫn còn → phần máy cáp treo thuộc P1.

## 1. Kiểm kê NPC

| # | Kind / nguồn | Tên đang hiện | Nội dung nó đọc | Kết luận |
|---|---|---|---|---|
| 1 | `abbot` — `world.js:257-277` → `engine.ts:177,184` → `people.tsx:329-442` | **HLV Tomo** (`stories.ts:40`), sub-modal "Huấn luyện viên Đền Cầu May" (`people.tsx:331`). **Nhưng nhãn 3D trên đầu vẫn là `Lục Đạo Trụ Trì · chạm để thưa chuyện`** (`world.js:269`, hardcode, engine chỉ thay `name`) | `stories.nhattru` = bài Chùa Một Cột; `guides[sect]` = 5 trang TFT | Tên đúng, **nhãn 3D sai** + **ruột sai** (P0) |
| 2 | `hermit` — `world.js:287`, API `/hermit`, `/hermit/exchange` | **Lão Hành Khất** · "Bán bí kiếp, chỉ bán cho người hữu duyên" (`people.tsx:288`) | `catalog.ts:63,100` + `shop.ts`; 8 `HERMIT_LESSONS` (`stories.ts:43-52`) đều là TFT | **Giữ nguyên.** Không có từ cấm; vai người bán, không phải "Nhà phân tích" như §5 cũ |
| 3 | `teller` ×2 — `world.js:328-382`, nhãn :375, modal `people.tsx:291-327` | **Cụ Từ Lâm** · role "Cụ từ giữ chùa"; **Cô Thanh Hà** · role "Hướng dẫn viên" (`content.json $.tales.nhattru`) | 4 truyện: "Giấc mộng tòa sen", "Cột đá giữa hồ Linh Chiểu", "Chuông Giác Thế", "Ngôi chùa được dựng lại" | **Sai cả tên, role, ruột.** HUD gọi hành động này là "Nghe tiên tri Hex" (`temple-app.tsx:69`) → bấm vào gặp cụ từ giữ chùa kể chuyện tòa sen (P0) |
| 4 | NPC ảo client ×2 — `world.js:514-536`, số lượng `meta.json $.temples[0].npc = 2` | `${heroDef.name} (${phapDanh()})`; `phapDanh` ghép `PD_A`/`PD_B` (`world.js:30-31`, toàn vần Phật giáo: Diệu, Huệ, Tịnh, Phước…), fallback `'Phật tử'` (:38) | chỉ có tên, không thoại | **Bộ sinh tên phải thay** (P0). Toggle `hall.tsx:840` "Hiện chú tiểu NPC" → "Hiện người chơi ảo" |
| 5 | Bot server ×12 (6 online/ngày) — `bots.ts:103-164`, boot `index.ts:490` | 4×"Đồng Tu …", 2×"Phật Tử …", 3×"Lữ Khách …", Ngọc Diệp, Chân Như, Quang Dũng | 8 câu chúc `bots.ts:168-177` ("Nguyện bạn một ngày an lành", "Chúc bạn tinh tấn từ sớm"…); kit vẫn trỏ id đồ cũ | **Đổi tên + câu chúc + kit** (P1). `seed()` gọi `updateTempleProfile(..., { name: def.name })` (`bots.ts:550`) mỗi lần boot → **tên mới tự vào DB, không cần migration** |
| 6 | Không phải NPC nhưng có persona | Tượng pengu vàng (`theme.statues[0]`); 12 hero (`avatar.js:6-163`, `quote`/`skillName` **không đâu đọc**); `OUTFIT_LIST` (`avatar.js:168-248`) | `world.js:518` khắc `av.outfit?.name` làm **nhãn phụ trên đầu 2 NPC ảo** → `name` là chữ **live** | Pengu giữ. **5 `OUTFIT_LIST[].name` đã đổi ở P0** (mục 3). `desc`/`badge`/`icon` + `quote`/`skillName` = 0 reader, chữ chết trong bundle (P1) |

"Tiên tri Hex" và "Nhà Phân Tích" hiện **chỉ là nhãn/comment** (`temple-app.tsx:69`, `people.tsx:195`,
`stories.ts:42`) — chưa có NPC nào mang hai vai đó. §5 của `SHRINE-PLAN.md` map 3 vai cũ
(trụ trì / ẩn sĩ / kể chuyện) sang 3 vai mới, nhưng code thật chỉ có 2 vai NPC + 1 vai người bán:

- trụ trì → **Huấn luyện viên**: đã xong ở tên, còn nhãn 3D + ruột.
- kể chuyện → **Tiên tri Hex**: nhãn HUD đã đổi, NPC thì chưa.
- ẩn sĩ → **Nhà phân tích**: **không áp dụng** — `hermit` trong code thật là thương nhân. Giữ Lão Hành Khất.

## 2. Kiểm kê bề mặt text

| Bề mặt | Ở đâu | Trạng thái |
|---|---|---|
| Cẩm nang (5 lối chơi + chuyện đền + 7 vận) | `hall.tsx:638-742`, data `content.json $.guides` (5) + `$.stories.nhattru` | guides **sạch** (0 hit từ cấm); story **chùa/Phật nguyên văn** |
| Modal NPC (3 vai) | `people.tsx:238-442` | HLV đọc story chùa; teller đọc 4 truyện chùa; hermit sạch |
| HUD: menu, ví, nút, ctx, dẫn chuyện | `temple-app.tsx:65-71,79,99,791-837,857-902` | toast **"+N điểm may"** (:223) và 2 nhãn cáp treo mồ côi → **đã sửa/đã xoá ở P0**. Nút **"Thiền"** (:896) **giữ nguyên** |
| Sheet Thiền định / Vòng quay Hex / Quẻ | `practice.tsx:59,95,122-144,225,320,332` | **sạch** — thiền là tính năng hợp lệ; chỉ :142 viết thường "điểm may mắn" |
| Bảng dịch lỗi | `api.ts:133-176` | sạch — :139-140 "Bạn đang thiền rồi" / "Chưa có lần thiền nào để kết thúc" là đúng |
| Hai tấm bia khắc trong sảnh 3D | `temple.js:446-450,489-505` | **đúng chuẩn** (BẢNG XẾP HẠNG / ĐIỂM MAY MẮN TUẦN NÀY · BẢNG TRI ÂN / TINH HOA ĐÓNG GÓP) |
| Nhãn zone 3D | `temple.js:529` "🏯 Trong Chánh Điện Thanh Tịnh" | lệch register → **đã sửa ở P0** |
| Nhãn 3D trên đầu NPC | `world.js:269,287,375` (HLV / hermit / teller) + `:518` (NPC ảo, sub = `outfit.name`) | :269 **vi phạm "trụ trì"**, :518 kéo theo 2 tên outfit cũ → **đã sửa ở P0** |
| Quẻ đội hình (server phát) | `api/src/temple/hall.ts:22-25` `QUE_CARDS` (4) | TFT thuần, sạch |
| 7 vận + màn chờ | `ladder.js:13-19`, `stories.ts:55-73` | sạch |
| Tỷ thí / Túi đồ / Cửa hàng / Hồ sơ / Cài đặt | `games.tsx`, `hall.tsx:292-616,743+` | `hall.tsx:688` ("Quét sân" mồ côi) và `hall.tsx:840` ("chú tiểu") → **đã sửa ở P0**, phần còn lại sạch |
| Metadata trang | `apps/web/app/(temple)/[lang]/temple/page.tsx:15` | description **"lễ Phật, thắp hương"** (trang `noindex` nên không lộ ra search, vẫn sai) |
| Nội dung chết | `content.json` 14 stories + 58 tales; `meta.json $.temples[1..14]`; `exterior.js` 14 view + `buildTempleModel`; `avatar.js` `OUTFIT_LIST.desc/badge/icon` + `HERO_LIST.quote/skillName` | chữ Phật/chùa ship trong bundle client. **`OUTFIT_LIST.name` không chết** — đã đổi ở P0 |

**Đếm:** `content.json` 67.526 B, phần đang được đọc chỉ **10.824 B** (−84%).
`meta.json` 31.946 B; bỏ `place`/`inspired`/`description` (0 reader) mà **giữ đủ 15 theme** → 27.982 B.

## 3. P0 — chuỗi live lệch, đổi từng dòng

**Thiền giữ nguyên.** Chủ project chốt 2026-11-07: thiền là tính năng được chấp nhận giữ lại và hợp
lệ của Đền Cầu May. Không đổi tên tính năng, không đổi field/code, và `thiền` đã được gỡ khỏi danh
sách từ cấm (`SHRINE-CONTENT-MAP.md` §5, `SHRINE-PLAN.md` §5 hàng 160 + §5.1 hàng 193).
→ `practice.tsx:59,95,122,125,141`, `api.ts:139-140`, `hall.tsx:108`, `temple-app.tsx:896` và
`content.json $.guides.tempo.inApp` **không phải việc**, giữ nguyên văn.

| File:line (ở HEAD) | Đang là | Đổi thành |
|---|---|---|
| `hall.tsx:688` | `Cầu may · Thiền · Dâng bùa · Quét sân.` | `Cầu may · Thiền · Dâng bùa · Tỷ thí.` — "Quét sân" là tính năng đã cắt; thay bằng **Tỷ thí** cho đúng danh sách việc thật |
| `hall.tsx:840` | `Hiện chú tiểu NPC` | `Hiện người chơi ảo` |
| `temple-app.tsx:223` | `+N điểm may` | `+N Điểm May Mắn` |
| `practice.tsx:142` | `+N điểm may mắn` | `+N Điểm May Mắn` |
| `world.js:269` | `Lục Đạo Trụ Trì · chạm để thưa chuyện` | `Huấn luyện viên · chạm để trò chuyện` — rút "thưa" thành "trò" cho vừa khổ 512 px của `labelTex` (`textures.js:568-579`, sub không có maxWidth) |
| `world.js:258` | fallback `Thầy trụ trì` | `Huấn luyện viên` |
| `world.js:30-38` | `PD_A`/`PD_B` + fallback `Phật tử` | **xoá cả bộ vần + `phapDanh()` + `export`**; tên ảo = `<tên hero> · khách vãng lai` (`world.js:517`), bỏ `this.npcNames` |
| `temple.js:529` | `🏯 Trong Chánh Điện Thanh Tịnh` | `Trong sảnh Đền Cầu May` |
| `page.tsx:15` | `Chánh điện 3D: lễ Phật, thắp hương, gieo quẻ…` | `Sảnh 3D Đền Cầu May trước trận TFT: ngồi thiền, rút quẻ đội hình, dâng bùa lấy vía.` |
| `temple-app.tsx:65-66` | 2 nhãn cáp treo "Đi cáp treo lên đỉnh" / "Rời cáp treo" | **xoá** cùng field `cable` trong `EngineCtx` (`engine.ts:83`). `clickCtx` chưa từng có nhánh `ride`/`unride` → nút vốn không bấm được |

**Thêm vào P0 khi thực thi — `OUTFIT_LIST[].name` là chữ live** (`world.js:518` khắc nó làm nhãn phụ
trên đầu NPC ảo). Bản kiểm kê đầu tiên ghi nhầm là 0 reader; 5 tên dưới đây đã đổi, **chỉ `name`**,
giữ nguyên `id`/màu/flag nên không đụng tới hình 3D hay dữ liệu người chơi:

| id | Cũ | Mới | Dẫn từ |
|---|---|---|---|
| `sansa_sage` | Pháp Phục Sansa (Lá Thông) | **Áo Choàng Lá Thông** | `robeColor #bdc5ad` |
| `sansa_lotus` | Pháp Phục Sansa (Hồng Sen) | **Áo Choàng Hồng Phấn** | `#e5b0aa` (bỏ "Sen") |
| `sansa_celadon` | Pháp Phục Sansa (Bạch Ngọc) | **Áo Choàng Lam Ngọc** | `#b9c8c2` |
| `sansa_kasa` | Đại Y Thiền Sư (Cà Sa Đỏ Vàng) | **Áo Choàng Đỏ Vàng** | `#dfc890` + `kasaColor #b94048` |
| `hanbok_maru` | Lễ Phục Hanbok Chùa Cổ | **Áo Hai Tầng Lam Khói** | `#adbcdb`, `sansaRobe` 2 tầng (bỏ "Chùa") |

`default` = "Nguyên Bản Anime" giữ nguyên (sạch). Naming theo `SHRINE-CONTENT-MAP.md` §4.2
("Áo Choàng + màu"); `desc`/`badge`/`icon` vẫn còn register cũ nhưng 0 reader → P1.

## 4. P0 — ruột chuyện đền (`content.json $.stories.nhattru` + `$.tales.nhattru`)

Đây là chỗ lệch lớn nhất: **Cẩm nang và HLV Tomo đang đọc nguyên văn bài Chùa Một Cột**
(intro "kiến trúc Phật giáo Việt Nam", story[0] Bồ Tát Quán Thế Âm / nhà sư Thiền Tuệ,
story[1] "tụng kinh cầu phúc", visitTip "Ăn mặc kín đáo… Dịp Phật đản").

Nguyên tắc viết lại: **chuyện của Đền Cầu May phải nói đúng thứ app đang làm**, không bịa lịch sử,
không mượn tích chùa thật. Field `real`/`location`/`founded`/`sources` **không UI nào đọc**
(chỉ `intro`, `story[]`, `highlights`, `visitTip` — `hall.tsx:682-683`, `people.tsx:330,401`) → xoá.

`$.stories.nhattru` mới:

- `intro`: Đền Cầu May là sảnh chờ trước trận TFT — ngồi một nhịp cho tĩnh, rút một quẻ đội hình,
  rồi vào trận với cái đầu lạnh. Đền không bảo đảm thắng; nó ghi lại thói quen tốt bằng Điểm May Mắn.
- `story[0]`: **Đền này cho ai** — người vừa queue xong, người vừa thua một round, người muốn
  xem meta trước khi vào trận. Ba việc làm được: cầu may, thiền, dâng bùa.
- `story[1]`: **Bảy vận, mười chín mốc** — vận nào khung ấy ấn ấy; mốc là chuyên cần,
  **không phải rank TFT**. Dẫn từ `ladder.js` để không chép lại số.
- `story[2]`: **Hai tấm bảng trong sảnh** — trái là Bảng Xếp Hạng (Điểm May Mắn tuần này),
  phải là Bảng Tri Ân (Tinh Hoa đóng góp). Số do máy chủ tính, đổi thiết bị vẫn còn.
- `highlights` (4–5): kéo trái để đi / vuốt phải để xoay; W A S D · B cầu may · E ngồi/đứng;
  Tinh Hoa mua đồ, Kim Cương mở nhân vật; Tỷ thí có trần Điểm May Mắn mỗi ngày.
- `visitTip` → mẹo ghé đền: `Máy tính: W A S D đi lại · B cầu may · E ngồi/đứng. Điện thoại: kéo nửa
  trái để đi, vuốt nửa phải để xoay góc nhìn.` (trùng khớp `hall.tsx:687-690`, đừng viết hai bản khác nhau).

`$.tales.nhattru` mới — 2 người kể, 4 truyện, vai **Tiên tri Hex** cho khớp nhãn HUD `temple-app.tsx:69`:

| Cũ | Mới | Role mới | 2 truyện |
|---|---|---|---|
| Cụ Từ Lâm | **Tiên Tri Hex** | `Người giữ quẻ` | "Quẻ không nói thắng, quẻ nói nhịp" · "Một ngày chỉ một quẻ" |
| Cô Thanh Hà | **Người Giữ Đền** | `Người giữ sảnh` | "Tấm bảng bên trái nhớ ai chăm" · "Tấm bảng bên phải nhớ ai gửi tấm lòng" |

Bốn truyện viết mới, mỗi truyện 2–3 câu, register đền cầu may + TFT; **không** nhắc Chùa Một Cột,
không nhắc tòa sen / chuông / tụng kinh. Nội dung phải khớp cơ chế thật (`hall.ts:130-175` mỗi ngày
một quẻ, `QUE_CARDS` 4 lá; bảng trái theo tuần, bảng phải theo Tinh Hoa).

**Đã thực thi 2026-11-07.** Chỉ hai node `$.stories.nhattru` + `$.tales.nhattru` đổi (đối chiếu từng
node với HEAD: `guides` và 14 đền còn lại y nguyên). `real`/`location`/`founded`/`sources` đã xoá.
`content.json` 67.526 → 67.515 B; **live subset 18/118 → 0/111 chuỗi dính từ cấm**.

Hai chỗ lệch đề xuất ban đầu, đều có lý do đo được:

1. **Role rút ngắn** (`Người giữ quẻ của đền` → `Người giữ quẻ`, `Trông sảnh và hai tấm bảng` →
   `Người giữ sảnh`). `world.js:363` khắc `role + ' · chạm để nghe kể'` bằng `labelTex`, mà sub vẽ
   30px trên canvas 512px **không có maxWidth** (`textures.js:577`) → dài hơn là bị cắt hai đầu.
   Role mới cho sub 31–32 ký tự, đúng bằng độ dài sub cũ ("Cụ từ giữ chùa ·…", "Hướng dẫn viên ·…")
   vốn đã vừa khổ. Ý nghĩa đầy đủ nằm trong hai truyện của mỗi người.
2. **Số lấy từ nguồn, không bịa**: bow 5 / thiền 12 một phút (`merit.ts:40-42`), quẻ 15 exp + 18
   Tinh Hoa (`merit.ts:45`, `hall.ts:152`), dâng tối thiểu 10 Tinh Hoa (`hall.ts:79`), trần tỷ thí
   120/ngày (`games.ts:43`), nhân vật 100 Kim Cương (`heroes.ts:54`), bùa +20% trong 10 phút
   (`practice.ts:31`, `merit.ts:61`), bảng trái 7 ngày Hà Nội (`practice.ts:117`), bảng phải cộng dồn
   mọi thời điểm (`hall.ts:48-55`). `story[1]` **không** chép lại tên 7 vận — Cẩm nang đã render
   `REALMS` từ `ladder.js` ngay dưới bài (`hall.tsx:697-712`), chép vào JSON chỉ tổ lệch khi đổi thang.

## 5. P1 — chữ chết trong bundle + register còn lệch

| Chỗ | Cân nặng | Việc |
|---|---|---|
| `content.json` 14 stories + 58 tales không đền nào đọc | 67.526 → 10.824 B | **Xoá.** Giữ `guides` (5) + `stories.nhattru` + `tales.nhattru`. Khi dựng skin picker thì viết truyện cho skin đó, không sống lại truyện chùa |
| `meta.json $.temples[*].place/inspired/description` | 31.946 → 27.982 B | **Xoá 3 field** (0 reader). **Giữ đủ 15 theme** đúng §0 #6. `$.temples[1..14].name` ("Chùa Trấn Hồ", "Thiền viện Đỉnh Mây"…) sẽ hiện trong picker tương lai → đổi sang tên cảnh trung tính ("Sảnh Hồ Gương", "Sảnh Hang Đá"…), không phải tên chùa |
| `exterior.js` 14 view chết + `buildTempleModel` | 222.876 B | `buildTempleModel`: **xoá** (0 import). 14 view: **giữ hình, đổi chữ** — ~20 biển bảng đang khắc "QUAN THẾ ÂM BỒ TÁT", "Nam mô A Di Đà Phật", "VƯỜN CỘT KINH / 32 cột đá khắc lời kinh", "CHÙA CỬU PHONG", "THÁP CHUÔNG BẢY TẦNG". Admin chọn skin là chúng thành live, nên phải trung tính hoá **trước** khi dựng picker |
| `avatar.js` `OUTFIT_LIST[].desc/badge/icon`, `HERO_LIST[].quote/skillName` | — | **Xoá các field chữ** vì 0 reader (chỉ màu/flag được đọc, `avatar.js:872-953`; không file `.ts/.tsx` nào nhắc `outfit`). `name` **không** nằm trong nhóm này — nó live ở `world.js:518` và đã đổi ở P0. 3 hit từ cấm còn lại của `avatar.js` (:181,195,209) đều ở `desc` |
| `meta.json` mô tả pet còn register cũ | — | "Bạch Tượng Lục Nha — voi trắng sáu ngà trong mộng lành của một hoàng hậu", "Trâu Vàng — hình ảnh của cái tâm đã thuần" → viết lại 1 dòng theo hướng cổ tích, bỏ tích Phật |
| `bots.ts` kit + `bots.ts:63-67` "bồ đoàn" (comment) | — | kit trỏ id đồ đã đổi tên/đã bỏ → rà lại `catalog.ts`; comment dọn cho lần grep sau không nhiễu. Tên `meditate`/`meditateMin` **giữ** (thiền hợp lệ) |
| `world.js:69` localStorage `niemphat:quality` | — | **Giữ key** (đổi là mất setting chất lượng của người đang chơi); chỉ dọn comment quanh nó |

## 6. P2 — bot và DB

**Bot (`bots.ts`)** — 12 tên, đề xuất giữ nguyên vần đệm đã sạch và chỉ thay tiền tố:

| Cũ | Mới |
|---|---|
| Đồng Tu Minh Anh / Thanh Tùng / Quốc Bảo / Bích Đào | **Lữ Khách** Minh Anh / Thanh Tùng / Quốc Bảo / Bích Đào |
| Phật Tử Diệu Liên / Tuệ Tâm | **Người Thắp Đèn** Diệu Liên / Tuệ Tâm (tên bậc 3 trong thang) |
| Chân Như | **Chân Kim** (thuật ngữ luyện kim, hết register Phật) |
| Lữ Khách Hải Đăng / Phương Nam / Hà Sơn, Ngọc Diệp, Quang Dũng | giữ |

`bots.ts:168-177` — 8 câu chúc thay bằng register Đền: "Chúc bạn vào trận tay vững", "Chúc bạn về
đúng bài mình cần", "Chúc bạn một ngày toàn top 4"… (lấy cùng nguồn `WISHES` `stories.ts:55-60` để
hai nơi không lệch nhau). **Không cần migration**: `seed()` ghi đè `name` mỗi lần boot (`bots.ts:550`).

**DB dev (đo 2026-11-07, read-only):** 364 hồ sơ; **131** hàng còn honor cũ `Tâm Sáng Như Sen`;
**141** tên mang register Phật (gồm 12 bot + tài khoản harness, ví dụ "Đồng Tu Một" ×9,
"Phật Tử Lộc Tịnh" ×4). Tên khách mới sinh đã đúng chuẩn (`identity.ts:119-126` → `Lữ Khách X Y`),
honor mặc định đã đúng (`identity.ts:176` → `Lữ khách cầu may`).

→ Hai việc, **chỉ chạy trên dev** trong đợt này:
1. `UPDATE temple_profiles SET honor = 'Lữ khách cầu may' WHERE honor = 'Tâm Sáng Như Sen'` (idempotent).
2. Tên Phật: **không đổi hàng loạt tên người dùng tự đặt**. Chỉ đổi tên bot (đã tự qua `seed()`) và
   tên tài khoản harness nếu cần sạch BXH dev.

**Prod:** chưa đo và **chưa được phép ghi**. Cùng một câu UPDATE honor là migration prod, phải xin
duyệt riêng kèm backup theo đúng quy tắc phạm vi. `title` trong DB không cần đụng — `toProfile`
(`identity.ts:145-147`) đã dẫn xuất từ `exp`, cột chữ cũ không được đọc.

## 7. Gate

1. **Gate từ cấm** (một nguồn duy nhất, chạy lại là no-op). Đo bằng **AST TypeScript**
   (`createSourceFile`), không grep thô — bản grep thô bỏ sót `JsxText` (phần lớn copy HUD là text
   node JSX) và bắt nhầm regex `/[&<>"']/g` ở `ui.tsx:84` thành chuỗi.
   - Phạm vi: `apps/web/components/temple/*.ts*`, `apps/api/src/temple/*.ts` (**trừ `*.test.ts`** —
     message assert không phải copy), `apps/web/vendor/temple/js/*.js`,
     `apps/web/vendor/temple/data/*.json`, `apps/web/lib/messages.ts`, `apps/web/app/(temple)/**`.
   - Chỉ lấy `StringLiteral` / `NoSubstitutionTemplateLiteral` / phần literal của
     `TemplateExpression` / `JsxText`. Comment và identifier không có trong AST → tự loại.
     Chuỗi là code (identifier trần `sen`, `not_enough_sen`; câu SQL) cũng loại.
   - Khớp có ranh giới từ Unicode `(?<![\p{L}\p{N}_])…(?![\p{L}\p{N}_])`: `ao_sen`/`price_sen`/
     `gift_sen`/URL `Chùa_Một_Cột` không tính; `sent`/`Send`/`Phương án` trong `messages.ts` không tính.
   - Danh sách từ: `SHRINE-CONTENT-MAP.md` §5 (**không có `thiền`**). FP khai trong script:
     "kinh tế", "kinh nghiệm", "tưởng niệm", "Mường Hoa", "Lam Kinh" (địa danh),
     `not enough Sen in the wallet` (message nội bộ của `ApiError`; client dịch qua `api.ts:142`).
   - JSON: chỉ field hiển thị `name`/`description`/`intro`/`story`/`highlights`/`visitTip`/`text`/
     `title`/`role`.
   - **Số đo sau P0 chuỗi + P0 ruột (2026-11-07):** code **28/4658** chuỗi dính = `bots.ts` ×6 (P2) +
     `avatar.js` `desc` :181,195,209 ×3 (P1) + `exterior.js` view chết ×19 (P1).
     **0 hit** trong `components/temple`, `app/(temple)`, `world.js`, `temple.js`, `messages.ts`.
     `content.json`: toàn file 164/535; phần đang đọc **0/111** (trước khi viết lại là 18/118).
     `guides` 0 hit. `meta.json` display-field 19/167 (P1).
   - **Mong đợi:** P0 xong → phần đang đọc 0 hit (đã đạt). Sau P1+P2 → 0 trên toàn phạm vi.
2. `npm run typecheck` + `node --test apps/web/lib/*.test.ts` (gate hẹp, không chạy full suite).
3. `apps/api`: `node --test src/temple/*.test.ts` — bots/identity có test, đổi tên bot phải xanh.
4. **Browser thật** (`channel:'chrome'` + swiftshader) trên `/vi/temple`: chụp (a) nhãn 3D trên
   đầu HLV, (b) Cẩm nang tab Chuyện đền, (c) modal Tiên Tri Hex, (d) sheet Thiền định (tên giữ
   nguyên), (e) Cài đặt có toggle "Hiện người chơi ảo". Không dựa vào typecheck để kết luận copy đã đúng.
5. `apps/web/tests/temple.spec.ts` **không đổi kết quả**: spec phải serial, `setTimeout 420s`, và
   không assert vào chữ vừa đổi trừ khi chủ ý cập nhật assertion.

## 8. Thứ tự

1. **P0 chuỗi** (mục 3) — một lượt sửa, gate từ cấm chạy được ngay, không cần viết văn.
2. **P0 ruột** (mục 4) — viết `stories.nhattru` + `tales.nhattru`; đây là phần cần duyệt giọng văn.
3. **P1 cắt chữ chết** (mục 5) — `content.json`, `meta.json`, `buildTempleModel`, field `avatar.js`.
   Làm **sau** bước 2 để không sửa hai lần trên cùng một file.
4. **P2 bot + DB dev** (mục 6).
5. Gate §7 + browser evidence, rồi mới báo cáo. Deploy và migration prod xin duyệt riêng.

## 9. Cần chốt trước khi làm

Chủ project **duyệt cả 4 đề xuất** ngày 2026-11-07 và cho chạy **P0** ("Duyệt plan, bắt đầu xử lý
nhóm P0 ngay"). P1/P2 được duyệt và thực thi ngày 2026-11-07. #4 đã thực thi trong P0 chuỗi.

| # | Câu hỏi | Đề xuất |
|---|---|---|
| 1 | Giữ Lão Hành Khất hay đổi sang "Nhà phân tích" theo §5 cũ? | **Giữ.** Code thật là thương nhân; §5 map từ bản thiết kế gốc, không khớp vai hiện tại. Sửa chú thích `stories.ts:42` ("Nhà Phân Tích") cho khỏi hiểu lầm |
| 2 | Tiên tri Hex là **teller đổi tên** hay **NPC mới biết rút quẻ**? | **Teller đổi tên** (rẻ nhất, khớp nhãn HUD đã có). Việc "rút quẻ thật theo comp S/A/B" là §6.2 của `SHRINE-PLAN.md`, một tính năng riêng, không trộn vào đợt đổi copy |
| 3 | 14 view chết: xoá hay giữ hình đổi chữ? | **Giữ hình, đổi chữ** — đúng quyết định 15 skin. Chỉ xoá `buildTempleModel` vì 0 import và không thuộc đường picker |
| 4 | Nhãn cáp treo (`temple-app.tsx:65-66`) | **Xoá cùng nhánh `ctx.cable`**, vì `pond` không có cáp treo và không có kế hoạch dựng |