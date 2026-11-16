# Set 19 "Prismatic Tour": tra cứu và chuẩn bị update

Đo ngày **2026-11-16**, một ngày trước khi PBE mở. Mọi con số ở đây lấy từ nguồn ghi ở §11, không
phải từ dữ liệu trong repo. Kế hoạch xoay mùa tổng quát (R1–R14) nằm ở
[`SET-ROTATION-PLAN.md`](SET-ROTATION-PLAN.md); tài liệu này chỉ ghi **cái mới của set 19** và
những chỗ kế hoạch cũ chưa thấy.

## 1. Sự kiện

| | |
|---|---|
| Tên | **Prismatic Tour** (chưa có tên tiếng Việt chính thức) |
| PBE | **Thứ Ba 17/11/2026** |
| Live | **Thứ Tư 2/12/2026** (ngày Riot ghi trong video reveal) |
| Bản mang set | 19.1 |
| Chủ đề | âm nhạc: 14 ban nhạc, 14 lớp, 19 "Solo Artist", 94 tướng |
| Cơ chế set | unlock/quest theo từng ván, trait Prismatic chọn qua quest, 4 tướng **7 vàng** |
| Khác | Tour Collection (70+ mục), 500 Treasure Token sau 1 ván, 1 Mythic Chibi ngẫu nhiên sau 20 ván, Convergence Fest 11–13/12 |

Riot chưa đăng bài set 19 trên trang tin `vi-vn` (index chỉ có teaser "nhóm nhạc" ngày 2/11). Vì vậy
**không tự đặt tên tiếng Việt**: `set.json.upcoming.name` chỉ có `en` cho tới khi Riot công bố.

## 2. Roster

**94 tướng**, không có 6 vàng:

| Vàng | 1 | 2 | 3 | 4 | 5 | 7 |
|---|---|---|---|---|---|---|
| Số tướng | 15 | 18 | 16 | 22 | 19 | 4 |

Bốn tướng 7 vàng, **cả bốn đều phải unlock**: Baron Nashor, Rakan, Smeech, Sona.
Hai **Akali riêng biệt** cùng 5 vàng (K/DA và True Damage), ability/quest/pool riêng — không còn
đổi dạng theo board như Remix Rumble.

**36 tướng unlockable** (35 trên trang champions của Blitz + Akali True Damage): 1 tướng 1 vàng,
7 tướng 2 vàng, 4 tướng 3 vàng, 9 tướng 4 vàng, 11 tướng 5 vàng, cả 4 tướng 7 vàng. 9/22 tướng 4
vàng khởi đầu khoá, nên shop 7–8 vàng khác nhau giữa các ván.

Luật unlock giữ từ Lore and Legends: mở xong thì vào pool cả ván; shop kế tiếp có 1 bản; tướng
cao vàng ít người mở thì khó 3 sao hơn; bỏ qua một lần thì nó giảm dần tần suất xuất hiện.

Quest 7 vàng (đây là mốc tiến trình, không phải "đợi đủ vàng"):

| Tướng | Quest |
|---|---|
| Baron Nashor | gom đủ 5 Mystical Instrument + đủ sát thương bằng Malzahar (không cần level) |
| Rakan | chuỗi thắng **hoặc** chuỗi thua ở level ≥ 8 |
| Smeech | level 9 + ≥ 8 trait không-unique đang bật |
| Sona | level 10 + Collab được "inspire" đủ lần |

## 3. Trait: 47 cái, ba nhóm

14 **band** (có mốc riêng), 14 **class**, 19 trait **chỉ một tướng**. Tổng 47.

Band, nguyên văn mốc:

| Band | Mốc | Ghi chú |
|---|---|---|
| Ionic Spark | 3/5/7/10 | |
| K/DA | 3/5/7/10/13/15/21 **tổng sao** | không đếm số tướng |
| Beach Pop | 3/5/7 | |
| Heartsteel | 1/3/5/7 | Bias chọn mỗi ván |
| Pentakill | 3/5/7 | |
| Classical | 2/4/6 | chỉ Katarina, Jhin mở từ đầu |
| Rock | 3/4/5/7 | |
| True Damage | 3/5 | hai "mặt" A/B, xem §4 |
| Hyperpop | 2/3/4/5 | chỉ Ziggs mở từ đầu |
| Gu Feng | 2/3/4 | chỉ Xayah mở từ đầu; đường lên **level 11** |
| Illbeats | 2/3/4 | mixer Decibel |
| Jazz | 2/3/4 | đếm trait đang bật, không phải tướng |
| EDM | 2 | một mốc duy nhất |
| R&B | 1/2 | |

14 class: Arcanist 2/4/6, Bodyguard 2/4/6, Choreographer 2/3/4/5, Collab 3/5, Encore 2/4,
Frontman 2/4/6, Hitmaker 2/4, Juggernaut 2/4/6, Manager 2/3/4, Prodigy 2/3/4/5, Renegade 2/3/4/5,
Slayer 2/4/6, Swiftstriker 2/3/4/5, Trickshot 2/3/4.

19 Solo Artist (trait + tướng): Indie–Seraphine, Emo–Amumu, Composer–Malzahar, Country–Alistar,
Synthwave–Garen, Freestyle–Akali (TD), Record Mogul–Dr. Mundo, Melodic Heart–Gwen,
Windblessed–Janna, 8-Bit–Miss Fortune, Mariachi–Nidalee, Disco–Nunu & Willump, Beat Master–Rell,
Hype Man–Teemo, Tango–Twisted Fate, Goth–Zeri, One Monster Band–Baron Nashor (chiếm **2 slot**),
Boy Band–Rakan, Producer–Sona.

**5 trait Prismatic chọn qua quest, không qua Ấn:** Pentakill, Ionic Spark, K/DA, Heartsteel,
True Damage. Ấn vẫn tồn tại (augment Circlet/Crown vẫn cho Ấn + nguyên liệu) nhưng **không mở mốc
Prismatic** nữa.

Ba trait không biểu diễn được bằng "đếm số tướng trên board":
- **K/DA**: mốc = tổng star level (3→21), thành viên 4 sao ở mốc 21.
- **Jazz**: mỗi trait đang bật không-unique cho Máu + Damage Amp — con số phụ thuộc cả board.
- **Collab**: danh sách tướng có Collab **đổi mỗi ván**.

## 4. Cơ chế ảnh hưởng tới dữ liệu

| Cơ chế | Nó làm gì | Hệ quả cho repo |
|---|---|---|
| Unlock/quest | tướng khoá cho tới khi xong quest, rồi vào pool cả ván | chưa có chỗ nào chứa quest. Cần field trên champion (vd `unlock: { vi, en }`) + hiển thị ở trang tướng và board |
| 7 vàng | 4 tướng, pool riêng | `poolSizes` không có cost 6/7; `shopOdds` 5 cột; màu cost 1–5 |
| Level 11 (Gu Feng) | Scroll of the Beast + level 10 mở đường lên 11; 2 thua liên tiếp thì mất ván | `shopOdds` đã có dòng 11 nhưng `xpTable` dừng ở 10; thiếu XP và tỉ lệ 7 vàng |
| Prismatic qua quest | bỏ đường Ấn → Prismatic | đừng xoá code Ấn; chỉ đừng giả định Ấn mở mốc cuối |
| True Damage A/B | thắng ở B-Side mất Bling; đổi mặt mỗi phase | trạng thái trong ván, **không** thuộc comp schema |
| Illbeats mixer | chia Decibel vào Máu/AD/AP/tỉ lệ vàng, 10 mức mỗi kênh | như trên: cơ chế trong ván, không phải dữ liệu comp |
| Heartsteel Bias | chọn thiên hướng mỗi ván | như trên |
| Collab random | roster Collab đổi mỗi ván | comp ghi Collab chỉ đúng một phần; ghi chú ở UI, đừng tính trait này như trait tĩnh |
| Baron chiếm 2 slot | 1 hex, 2 slot đội | board 10 hex vẫn đúng; chỉ ảnh hưởng text |

## 5. Nguồn đã sẵn sàng tới đâu (đo hôm nay)

| Nguồn | Kết quả | Ý nghĩa |
|---|---|---|
| `raw.communitydragon.org/pbe/cdragon/tft/en_us.json` | 23 MB, `setData` max = **18**, `TFTSet18` 91 tướng / 36 trait | PBE chưa mở; đây là nguồn sẽ sinh catalog 19 |
| `raw.communitydragon.org/latest/...` | max = 18 | live còn 18, đúng |
| `tftips.app/api/catalog/pbe/en/{champs,traits,items}` | 200, **68/37/158 id toàn `18_*`** | feed preview **chưa** flip — đây là công tắc của `set.json.upcoming` |
| `tftips.app/api/catalog/19.1/en/champs` | 404 | chỉ có key `pbe` trước launch, đừng probe `19.1` |
| `tft.ninja/sets/19/{units,traits,augments}` | có trang, đủ roster + mốc | nguồn đối chiếu tốt nhất trước PBE |
| blitz.gg bài set 19 | đủ 94 tướng, 28 trait band/class, 36 quest | nguồn của tài liệu này |
| Augment | Blitz ghi 333 (86/138/109); Riot/Blitz copy nói "350+" | **đừng gate theo số**; crawler lấy từ cdragon |

## 6. Repo app: chỗ sẽ gãy

Mức: 🔴 im lặng hoặc chặn hẳn · 🟡 hỏng một phần, kêu to · ⚪ chỉ sai copy.

| # | Chỗ | Hiện tại | Sang 19 thì | Mức |
|---|---|---|---|---|
| N1 | `packages/shared/src/mechanics.ts:34-40` `poolSizes` | cost 1–5, `distinct` = 14/13/14/14/10 | thiếu cost 7; `distinct` phải là 15/18/16/22/19. Coach (`mechanics-knowledge.ts:233`) in nguyên bảng này cho người dùng | 🔴 |
| N2 | `mechanics.ts:6-18,22-32` | `shopOdds` dòng 11 có 5 cột 5 vàng; `xpTable` dừng ở 10 | level 11 của Gu Feng cần XP + cột 7 vàng. Chưa có số ⇒ để nguyên, đừng đoán | 🟡 |
| N3 | `apps/web/components/ui.tsx:44-52` + `app/globals.css:31-35` + `lib/palette-tokens.test.ts:49` | `costColor` 1–5, token 1–5, test đòi đủ 5 | tướng 7 vàng rơi về màu cost 1 (`costOf` fallback) — sai im lặng; thêm token 7 là việc thiết kế, cần màu thật từ client | 🟡 |
| N4 | `apps/web/app/[lang]/champions/page.tsx:15` | `const costs = [1,2,3,4,5]` | 4 tướng 7 vàng **không có chip lọc**, không xuất hiện khi lọc theo vàng | 🟡 |
| N5 | `apps/api/src/schema.sql:20` | `name text UNIQUE NOT NULL`; hôm nay chỉ sống được vì tên trùng trong cdragon đều là quái PvE (`Krug`, `Murkwolf`, …) bị `traits.length > 0` loại | **nếu** cdragon trả cùng `name` cho hai Akali thì `INSERT` thứ hai vi phạm unique ⇒ rollback cả lô; `applyCatalog` bắt lỗi rồi **giữ set 18** (`index.ts:456-466`) — site im lặng ở mùa cũ. Kiểm `name` thật trong payload PBE: tiền lệ Lux cho thấy cdragon có thể phân biệt bằng ngoặc (`Lux (Blackthorn)`) | 🔴 |
| N6 | `apps/web/lib/search.ts:37`, `apps/api/src/assistant/ranking.ts:50`, `crawler/lib/seed-rules.mjs:99,102,116` | tra tướng **theo tên** | nếu hai Akali cùng `name`: icon/cost/items lấy nhầm bản đầu tiên; comp board không phân biệt được. Nếu cdragon đặt "Akali (K/DA)" thì tên hiển thị có ngoặc, và mọi join theo tên nguồn khác vẫn lệch | 🟡 |
| N7 | `apps/web/components/comp-panel.tsx:101` | mốc = `count >= threshold` | K/DA đếm tổng sao, Jazz đếm trait đang bật, Collab đổi roster ⇒ chip trait hiện sai mốc | 🟡 |
| N8 | `apps/api/src/schema.sql:44-55` | `comps` không có cột set | comp 18 nằm lại tier list; comp 19 bị `validateCompPayload` chặn vì `unknown champion` (R4) | 🔴 |
| N9 | `apps/web/lib/data.ts:12-15` | throw khi `set.json` ≠ `tft.json` ≠ `meta.json` | ngày launch hai nguồn flip lệch giờ: `fetch-data` xong trước `fetch-meta` ⇒ **build web đỏ**. Phải chạy `data:pull` khi cả hai nguồn đã ở 19 | 🟡 |
| N10 | `apps/web/lib/messages.ts` | chỉ còn 1 comment nhắc "18.5" (`:245`); badge mùa và mô tả SEO đã suy từ dữ liệu | không phải sửa | ⚪ |
| N11 | `apps/web/lib/champion-focus.json` + `champion-focus.test.ts:10-12` | key `da-18-*`, test đòi khớp 1:1 với thư mục ảnh | 94 ảnh mới ⇒ test đỏ tới khi regenerate focus map (R6) | 🟡 |
| N12 | `apps/web/components/nav.tsx:87-88` | gate `wisps`/`encounters` theo `season.features` | set 19 không có Wisp/Kỳ Ngộ (không xuất hiện trong toàn bộ tài liệu reveal — xác nhận trên PBE) ⇒ `features` cả hai `false`, nav tự ẩn | ⚪ |
| N13 | `apps/web/lib/economy-match.ts:56` | Reroll ⇒ `${cost}-Cost Reroll` | 7 vàng không phải comp reroll; không sửa trừ khi nguồn xuất bản comp 7 vàng | ⚪ |

`apps/web/lib/season-window.ts` là cổng cứng: feed preview lên 19 mà `set.json` chưa có `upcoming`
thì **throw**; có `upcoming` khi feed còn 18 cũng throw. Thứ tự bắt buộc: feed flip → thêm
`upcoming` (chỉ `en`) → launch thì xoá.

Đã sửa 16/11: **N4** (chip lọc vàng suy từ `units`) và **N5** (bỏ `UNIQUE` trên `champions.name`,
kèm `ALTER … DROP CONSTRAINT` cho DB đang chạy).

## 7. Repo crawler: chỗ sẽ gãy

| # | Chỗ | Hiện tại | Sang 19 thì | Mức |
|---|---|---|---|---|
| C1 | `scripts/fetch-tft.mjs:308` | `.filter(c => c.cost >= 1 && c.cost <= 5 ...)` | **bỏ 4 tướng 7 vàng** khỏi cả catalog live lẫn roster preview, không cảnh báo. Sửa: bỏ cận trên | 🔴 |
| C2 | `scripts/fetch-loot-tables.mjs:98,115,216` | `/tables/set18` | 404 hoặc bảng cũ; phải đổi path | 🟡 |
| C3 | `scripts/fetch-economy.mjs:31,64,109,118-119,129` | `compositions-set18.json`, `set === 'set18'`, gate `only N set 18 comps` | script fail cho tới khi KB tftflow có set mới | 🟡 |
| C4 | `scripts/fetch-metatft.mjs:19` `QUEUE = 1100` | guard `:208` throw khi payload báo queue khác | queue id của set 19 chưa biết; code kêu to, cần probe ngày launch | 🟡 |
| C5 | `scripts/build-pbe-diff.mjs:27-34` | đòi `.cache/preview/tft.json` đúng mùa feed | đã đúng; chỉ cần chạy `fetch:preview` trước `build:pbe` | — |
| C6 | `lib/set-id.mjs`, `fetch-tft.mjs:245`, `fetch-wisps.mjs` | set đọc từ dữ liệu / `--tree=pbe` | đã sẵn sàng | — |

Các dòng R1–R3, R13, R14 trong kế hoạch cũ **đã xong**; `runbook.md` §6 đã được cập nhật ngày
16/11 (bảng 4/11 giữ làm lịch sử), đừng sửa lại lần hai.

Đã sửa 16/11: **C1** (bỏ `cost <= 5`), **C2** (`fetch-loot-tables` lấy `${kb.set}`), **C3**
(`fetch-economy` lấy `catalogSetNumber()`; thiếu `compositions-setN.json` là throw).

## 8. Đã làm ngay (16/11, không cần dữ liệu)

Không mục nào đổi hành vi hôm nay — set 18 cho ra đúng cùng kết quả (đo: 65 tướng, 14/13/14/14/10
theo vàng).

1. **C1** — bỏ cận `c.cost <= 5` trong `fetch-tft.mjs`; tầng lọc còn lại là `cost >= 1 &&
   traits.length > 0`, đúng 65 tướng set 18 và sẽ giữ 4 tướng 7 vàng của set 19.
2. **N5** — `champions.name` thôi `UNIQUE` trong `schema.sql`, kèm
   `ALTER TABLE champions DROP CONSTRAINT IF EXISTS champions_name_key;` cho DB đang chạy (chạy
   `psql -f` như `RUNBOOK-MEMBERSHIP.md:23` **trước** ngày launch).
3. **N4** — chip vàng ở `/champions` suy từ `units` thay cho `[1,2,3,4,5]`.
4. **C2** — `fetch-loot-tables.mjs` lấy `${kb.set}` cho cả ba URL tftflow.
5. **C3** — `fetch-economy.mjs` lấy `catalogSetNumber()` cho tên file, filter, URL và thông báo;
   thiếu `compositions-setN.json` là throw thay vì lặng lẽ xuất comp mùa cũ.

Kiểm: `tft-comps-crawler npm test` 113/113, app `npm run test:web` 76/76, `typecheck` web sạch.

Còn chờ dữ liệu: N1/N2 (pool + level 11), N3 (màu cost 7), N6 (Akali trùng tên), N7 (mốc K/DA,
Jazz, Collab), N8 (`comps.set_number`), N9 (thứ tự `data:pull` ngày launch), N11 (focus ảnh).

Không thêm cờ `features.unlocks` / `prismatic` khi chưa có UI đọc — đó là config không người dùng.

## 9. Checklist ngày PBE mở (17/11)

```sh
# 1. Cây PBE đã có TFTSet19 chưa (chạy lại tới khi có, thường trong ngày)
curl -s https://raw.communitydragon.org/pbe/cdragon/tft/en_us.json \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print(max(s['number'] for s in d['setData']))"

# 2. Feed preview đã flip id 19_* chưa — công tắc của set.json.upcoming
curl -s https://tftips.app/api/catalog/pbe/en/champs | python3 -c "import json,sys;print(sorted({i.split('_')[0] for i in json.load(sys.stdin)}))"

# 3. Roster preview (phải ra 94 tướng, 4 tướng cost 7)
cd ../tft-comps-crawler && npm run fetch:preview
```

Kỳ vọng ngày đầu: **94 tướng / 47 trait / 4 cost-7 / 2 Akali**. Nếu ra 90 tướng, kiểm lại bộ lọc
champion (đã bỏ cận trên ngày 16/11 — nhiều khả năng là bản crawler cũ).

Sau khi (2) ra `19`: thêm vào `packages/shared/data/set.json`

```json
"upcoming": { "number": 19, "name": { "en": "Prismatic Tour" } }
```

rồi `npm run build:pbe` và commit `pbe.json` + `set.json` cùng lúc (test `season-window.test.ts`
khoá cặp này).

## 10. Checklist ngày launch (1–2/12)

1. Chờ **cả** cdragon `latest` có `TFTSet19` **và** MetaTFT `latest_cluster_id` trả `TFTSet19`,
   rồi mới `npm run data:pull` (N9).
2. Probe `QUEUE` mới trước khi tin `fetch-meta` (C4).
3. `set.json`: `number: 19`, `name` (thêm `vi` nếu Riot đã đăng), `banner` mới,
   `features: { wisps: false, encounters: false }`, **xoá `upcoming`**.
4. `mechanics.ts`: `mechanicsPatch` 19.1, `poolSizes` + cost 7, `xpTable` + level 11 nếu có số.
5. `mechanics-knowledge.json`: `defaultSet: "19"` + `sets.19` (R8); build lại corpus (R9).
6. Seed comp 19 qua `/admin` (R4) — **không** seed DB prod.
7. `npm run build:pbe` lại sau khi feed về 19 để `pbe.json` thôi mô tả mùa 19 như "sắp ra mắt".

## 11. Ẩn số

- Tên tiếng Việt chính thức.
- XP lên level 11 và tỉ lệ shop có 7 vàng ở level 10/11.
- Pool size của 4 tướng 7 vàng (`copies`).
- Queue id TFT set 19 (1100 là set 18).
- Số augment cuối cùng (333 trang Blitz vs "350+" trong copy Riot).
- Hình dạng field quest trong payload cdragon (chưa có set 19 để xem).
- Set 19 có Wisp/Kỳ Ngộ hay không — suy đoán từ việc vắng mặt trong mọi tài liệu reveal.
- Ngày giờ flip từng nguồn (cdragon / MetaTFT / tftips) trong ngày 1–2/12.

## 12. Nguồn

- Blitz.gg, "TFT Set 19 Champions, Traits and Unlocks: Prismatic Tour", 15/11/2026 — roster, mốc
  trait, toàn bộ quest, augment, cơ chế.
- `tft.ninja/sets/19/{units,traits,augments}` — đối chiếu roster/mốc.
- CommunityDragon PBE + latest `cdragon/tft/en_us.json` — đo 16/11.
- `tftips.app/api/catalog/pbe/en/*` — đo 16/11.
- Riot news `vi-vn` index — chưa có bài set 19.
- Nội bộ: `SET-ROTATION-PLAN.md`, `tft-comps-crawler/docs/runbook.md` §6.
