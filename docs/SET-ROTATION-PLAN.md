# Set rotation: chuẩn bị cho ngày TFT sang mùa mới

Phạm vi: trả lời hai câu của chỉ thị — (1) các chức năng trên trang có sống được qua một set mới không, (2) kiến trúc có chịu được nhịp đổi phiên bản 3–4 tháng một lần của game không.

Kết luận ngắn: **kiến trúc không cần trở thành multi-set** — nhưng phải chịu được **hai set cùng tồn tại**: PBE của mùa mới mở trước ngày launch 4–6 tuần, và trong suốt cửa sổ đó server live vẫn ở 18.x. Ba thứ còn thiếu:

- **Nhiều chỗ mà mã hoặc copy gõ tay số `18`** thay vì suy ra từ dữ liệu — liệt kê đủ ở §3 (R1–R14). Ba file trong số đó ở tầng *ghép tên/id thực thể*: ngày set đổi, pipeline gãy hàng loạt nhưng gãy **kêu to** (throw), không im lặng.
- **Chỗ im lặng thật sự**: bảng `comps` không có cột set, còn `seed:comps` thì upsert mà không xoá — nên đội hình mùa cũ vẫn ngồi trên tier list với tên tướng đã không còn trong catalog.
- **Chỗ im lặng nghiêm trọng nhất nằm trong chính cửa sổ preview** (R13): bảng "Sắp ra mắt" resolve tên theo catalog của mùa *đang live*, nên toàn bộ thực thể mùa 19 bị đẩy vào `unresolved` và trang thành rỗng đúng 4–6 tuần nó có giá trị nhất — mà `stats.rows: 0` thì trông giống hệt trường hợp hợp pháp hôm nay. D8 là cơ chế hai con số (`liveSet` / `previewSet`) để cửa sổ đó là trạng thái được khai báo, không phải tai nạn.

Mọi số liệu dưới đây đo ngày 2026-11-04, trên dữ liệu set 18 / patch 18.6.

---

## 1. Game đổi theo ba nhịp; hai nhịp đã tự động

| Nhịp | Ví dụ | Máy đã tự theo chưa | Còn gì |
|---|---|---|---|
| Hotfix trong một bài viết | 18.5 → 18.5b → 18.5c | Rồi — `versionSequence()` quét chữ cái `a..h`, tách mid-patch thành entry riêng có bằng chứng | — |
| Major cùng set | 18.6 → 18.7 | Rồi — `readNewsIndex()` lấy patch live từ trang tin Riot; baseline và nhãn preview suy từ cache (`nextMajor`, `catalogSet`): crawler `94892ac`, app `552ed3e` | tầng fetch patch notes vẫn có danh sách patch dự phòng gõ tay `['18.4', '18.5']`; bộ dựng bài patch vẫn có `?? 18` |
| **Sang set** | 18.6 → **19.1**, `DA_18_*` → `DA_19_*`, cơ chế đổi, queue stats đổi | Chưa — xem §3 | đây là chủ đề của tài liệu này |

Nhịp phụ đáng nhớ: Riot **đổi bảng XP / odds shop giữa chừng một set**. `packages/shared/src/mechanics.ts:4` gõ tay `mechanicsPatch = '18.4'`; không có machine check nào cho loại này, nên nó chỉ *sai*, không bao giờ *đỏ*.

## 2. Dòng dữ liệu và chỗ nào là "một slot duy nhất"

```
nguồn ngoài ── crawler (.cache) ──┬─▶ packages/shared/data/{tft,meta,patch-notes,pbe}.json
                                  ├─▶ apps/web/lib/{wisps,loot,economy}.json
                                  ├─▶ apps/web/public/tft/{champions 65, items 254, traits 36,
                                  │      augments 597, abilities 28, loot 4}
                                  ├─▶ apps/api/seed/{comps 54, comp-candidates, comp-extras}.json
                                  └─▶ apps/web/lib/champion-focus.json (65 key, tên file "da-18-*.png")

Postgres: meta (key/value) · champions/items/traits/augments (PK = apiName gắn số set)
          comps (PK = slug) · comp_units/comp_items/comp_augments/comp_stages
          guides (kind: 'guide' | 'patch_notes')
Corpus assistant: apps/api/data/knowledge/chunks.jsonl (id "mechanics:18:en:<topic>")
```

Tất cả các ô trên là **một slot, không có lịch sử**. Lịch sử thật nằm ở git (artifact) và ở bảng `guides` (bài patch 18.x sống qua rotation — có chủ đích). Đây là quyết định thiết kế đúng; kế hoạch này không đổi nó, chỉ làm cho phép *thay cả slot* diễn ra nguyên tử và có kiểm chứng.

### 2.1 Nội dung nào cross-set, nội dung nào bắt buộc thay cả khối

Đo bằng cách đếm tham chiếu set trong chính file (`grep`/python trên từng artifact, ngày 2026-11-04):

| Khối | Bằng chứng | Cross-set? |
|---|---|---|
| Bài skill trong `guides` (7 bài: economy stage 2, item slam, rolling on 8, positioning, tier list là hàng đợi, augment tiers) | `apps/api/seed/guides.ts` — **0** tham chiếu `18`; row nằm ở Postgres nên artifact PR không ghi đè | **Có** — sống nguyên, không việc gì phải làm |
| Tips (`apps/api/seed/tips.ts`, 387 dòng) | **0** tham chiếu `18` | **Có** |
| Bài patch notes (row `guides` `kind='patch_notes'`, `schema.sql:250`) | 18.4→18.6 là sự kiện đã xảy ra, không bao giờ sai | **Có** — lịch sử |
| Cơ chế chung của game | `packages/shared/data/mechanics-knowledge.json` đã tách sẵn `general` (8 topic: core, economy, leveling, items, augments, carousel, combat, metrics) khỏi `sets.18` (19 topic — tên tộc hệ mùa này). Loader `apps/api/src/assistant/mechanics-knowledge.ts:275` lấy `general` rồi **override theo topic id trùng** trong block set | **Có** — cấu trúc đã đúng, chỉ cần thêm `sets.19` + đổi `defaultSet` |
| 8 chiến lược kinh tế (`strategies` trong `packages/shared/data/economy.json`) | `1-cost-reroll`, `fast-8`, `fast-9`… — **0** tham chiếu `18` trong cả 8 block (11 vòng text mỗi block) | **Có** — trang `/economy` không biến mất |
| 44 hàng comp của nguồn kinh tế (`comps` cùng file) | **451** tham chiếu (`DA_18_Yorick`, `DA_Fiddlesticks18`, …) + `source.page: "…/set18"` | Không — thay cả file |
| Catalog, stats, wisps, loot, ảnh, focus map, `apps/api/seed/comps.json` | id mang số set khắp nơi (R1) | Không |
| Bảng số trong `packages/shared/src/mechanics.ts` | `shopOdds`/`xpTable`/`poolSizes` đổi theo set; `incomeBase`/`interest`/`streakBonus` thường bền nhưng **không có gì bảo đảm** — Riot từng xiết lãi giữa mùa | Không (phải kiểm chứng lại từng block mỗi set) |
| Trang chi tiết thực thể `/[lang]/champions/da-18-ahri` | PK là id gắn set (`schema.sql` champions.apiName) | Không — nhưng **tên tướng thì sống**: AHRI có thể có mặt ở cả 19, nên `da-18-ahri → da-19-ahri` dựng được bằng join theo tên (xem D5) |

Hệ quả trực tiếp cho quyết định "giữ gì": **không cần archive**. Thứ đáng giữ đã nằm ở nơi không bị rotation chạm tới (Postgres + block `general`), còn thứ gắn set thì thay cả khối là đúng — giữ lại chỉ tạo ra trang nói sai.


## 3. Nhật ký rủi ro (mức: 🔴 sai im lặng hoặc chặn hẳn · 🟡 hỏng một phần, kêu to · ⚪ chỉ sai copy)

| # | Chỗ | Bằng chứng | Ngày set 19 | Mức |
|---|---|---|---|---|
| R1 | Ghép tên/id theo số set | `apps/api/src/assistant/entities.ts:286` là khuôn **đúng** (`^(TFT\d*_\|DA_\d+_\|DA_)`, số set bằng `\d+`), trong khi ba file ở tầng fetch (bộ chuẩn hoá tên, overlay stats theo đơn vị, bộ đọc wisp) vẫn có regex gõ `18` — danh sách file:dòng nằm ở `docs/runbook.md` §6, repo crawler | join tên hỏng dây chuyền: catalog ↔ nguồn stats ↔ nguồn guide ↔ alias. Kêu to (throw / "unknown champion"), nhưng phải sửa tay ba file | 🟡→🔴 |
| R2 | Danh sách patch dự phòng gõ tay | tầng fetch patch notes (crawler) | nếu trang tin Riot lỗi đúng ngày set đổi, artifact quay lại nói "18.5 là bản live" trong khi game đã 19.1 | 🔴 |
| R3 | Số set fallback | bộ dựng bài patch notes: `?? 18` | bài 19.1 mang `set: 18` trong payload → trang patches nói sai, không ai biết | 🔴 |
| R4 | **comp mùa cũ còn trong DB** | `apps/api/src/comps.ts:297` `ON CONFLICT (slug) DO UPDATE` (không xoá gì); `apps/api/seed/seed.ts:42` `DELETE FROM comps` **chỉ ở lệnh seed đầy đủ**; `apps/api/src/schema.sql:44` `comps` PK slug, không cột set; `comp_units.name` là text, FK chỉ tới `comps` (`schema.sql:109-110`) | 54 đội hình 18 vẫn hiển thị; hàng 19 bị `comps.ts:248` (`unknown champion`) chặn → board nửa cũ nửa trống | 🔴 |
| R5 | Copy gắn "18" | `apps/web/lib/messages.ts` — 34 dòng chứa `18` (36 lần xuất hiện); badge `:274` `"Set 18 · Enchanted Wilds"` / `:1278` `"Mùa 18 · Đại Ngàn Kỳ Bí"`; mô tả SEO `:1045-1051`; chú thích nguồn `:1492`; disclaimer `:1629`. **Nhãn nav thì đã suy đúng**: `components/nav.tsx:78-79` + `messages.ts:37,1065` (`Set ${major}` / `Mùa ${major}`) | trang mang chữ Mùa 18 trên dữ liệu 19 | ⚪→🟡 |
| R6 | Ảnh và focus map | `apps/web/public/tft/**` 984 file commit; `apps/web/lib/champion-focus.json` key là `da-18-ahri.png`; test `champion-focus.test.ts:12` bắt key khớp **1:1** với thư mục ảnh; `components/ui.tsx:22` tra focus **theo tên file** | thiếu/regenerate không đúng ⇒ build fail (tốt). JSON trỏ file không tồn tại ⇒ **broken img**, vì không tile nào có `onError` (chỉ `UnitHex` có fallback 2 chữ cái) | 🟡/⚪ |
| R7 | Trang theo cơ chế riêng của set | `wisps`: guard rỗng `app/[lang]/wisps/page.tsx:151,194`; `encounters`: `notFound()` `:43`; `tables/[slug]`: `:13,31`; **nav vẫn hard-link** `components/nav.tsx:86-87` | set 19 bỏ Wisp/Kỳ ngộ ⇒ trang 404 hoặc khối "trống" nhưng vẫn nằm trong menu | 🟡 |
| R8 | Bảng cơ chế gõ tay | `packages/shared/src/mechanics.ts:1-4,21`; `packages/shared/data/mechanics-knowledge.json:3` `defaultSet: "18"`, topic `:410` `set18`; loader `apps/api/src/assistant/mechanics-knowledge.ts:338` mặc định `setId = '18'`. **Đã giảm một nửa** nhờ cấu trúc có sẵn: block `general` (8 topic) là cross-set và loader `:275` đã override đúng topic trùng id (§2.1) — phần phải viết mới chỉ là `sets.19` + các bảng số trong `mechanics.ts` | `/tables` và câu trả lời của Coach vẫn là số của 18.4 in trên dữ liệu 19 | 🔴 |
| R9 | Corpus + eval assistant | `apps/api/data/knowledge/chunks.jsonl` id `mechanics:18:*`; eval pin `champion:DA_18_Ahri`, `mechanics:set18`, `rag-baseline.json` pin topic id | `test:rag` / `test:accuracy` đỏ tới khi viết lại mechanics và build lại corpus | 🟡 |
| R10 | Test pin số set | `apps/web/tests/header.spec.ts:95` đòi chữ "Mùa 18"; `search.spec.ts:13`, `champion-stats.spec.ts:7,22,29` đòi URL `da-18-ahri` | CI đỏ đúng ngày rotation, kể cả khi app đúng → dễ bị hiểu là bug và bị nới gate | 🟡 |
| R11 | URL đã index biến mất | `apps/web/app/[lang]/layout.tsx:25` `export const dynamicParams = false` (di truyền xuống page con); `sitemap.ts` sinh URL từ artifact mới | build đầu tiên sau rotation biến hàng trăm URL `/en/champions/da-18-*` thành **404**. An toàn: `guides/[slug]`, `patches/[patch]` (params từ DB, bài 18.x còn trong store) | 🔴 |
| R12 | Cửa sổ stats theo sau release | `apps/api/src/tft.ts:123-125` ghi `patch/set_number/set_name/catalog_release`, `:75` ghi queue id của nguồn stats vào bảng `meta`; crawler lấy metadata cluster **từ nguồn** nên `tft_set`/`cluster_id` tự đổi theo set (đo hôm nay: `TFTSet18`, `426`), nhưng queue id thì pin một số cố định và **throw** nếu payload báo queue khác | ngày launch chưa đủ trận cho cửa sổ 7 ngày ⇒ tier board rỗng hoặc vẫn số mùa 18. Queue id của set mới là **ẩn số**: code kêu to chứ không im lặng, nhưng cần một lệnh probe để biết số nào đúng | 🟡 |
| R13 | **Bảng "Sắp ra mắt" im lặng suốt cửa sổ cross-set** | `scripts/build-pbe-diff.mjs:21` lấy `roster = packages/shared/data/tft.json` — tức **catalog của set đang live**; `lib/pbe-diff.mjs:194` và `:173` gọi `resolveEntity(tên, kind, roster)` và mọi thực thể không khớp bị đẩy vào `unresolved`, không sinh row. Khi PBE mở mùa 19, id chuyển hết từ `18_*` sang `19_*` ⇒ `presence()` coi **toàn bộ** hai bên là added/removed, và gần như mọi tên 19 đều `unresolved` vì roster 18 không có chúng | 4–6 tuần lễ quan trọng nhất của một mùa, `/patches` không có gì để xem, `/patches/19.1` là bài rỗng. **Im lặng**: `stats.rows: 0` trông giống hệt trường hợp hợp pháp hôm nay (PBE đã ship = diff 0 dòng, `patch: null`). Đo hôm nay: `coverage` champs 68/68, traits 37/37, augs 248/248, items 158/158 — hai bên cùng set nên bằng nhau bởi construction | 🔴 |
| R14 | `pickSet()` lấy số lớn nhất thay vì số đang live | `scripts/fetch-tft.mjs:170-175` `Math.max(...setData.map(e => e.number))`. Cây `latest` của CommunityDragon hôm nay mang các set 1→18 và `latest` theo bản live, nên max = 18 = đúng. Nhưng max chỉ là **giả định**, không phải bất biến được kiểm: nếu `latest` có `TFTSet19` trước khi news index của Riot kịp đổi major (hoặc ngược lại), toàn bộ artifact sống bật sang 19 trong khi stats/lookups/wisps vẫn pin 18 (`fetch-metatft.mjs:218`, `fetch-wisps.mjs:10-11` — đều gõ tay) | giữa chừng cửa sổ thì chưa sao; **ngay ngày launch** hai nguồn flip cách nhau vài giờ ⇒ catalog 19 + stats 18, một nửa site nói tiếng nửa kia | 🔴 |

Điểm sáng có chủ đích: gate tuổi 30h từng board trong `refresh-all` (đã ship) chính là lưới bắt R2/R8 — nếu fetcher chết vì URL gắn `TFTSet18`, board bị đánh dấu quá hạn thay vì âm thầm dùng bản cũ.

## 4. Kiến trúc mục tiêu — 8 quyết định

**D1 — Một con số chỉ gõ tay ở MỘT nơi, và nơi đó phải là thứ máy không tự biết được.** Số set: luôn suy (đã xong). **Tên riêng của set** ("Enchanted Wilds") thì máy *không* lấy được: nguồn catalog trả `tft.json` có `set.name = "Set10"` trong khi `set.number = 18` — con người phải viết. Vì vậy tên set phải nằm ở đúng một file, không rải 34 dòng.

**D2 — `packages/shared/data/set.json` là nhà mới của phần gõ tay:**

```json
{ "number": 18,
  "name": { "en": "Enchanted Wilds", "vi": "Đại Ngàn Kỳ Bí" },
  "launchedAt": "2026-…",
  "banner": "/images/tft/enchanted-wilds-banner.webp",
  "features": { "wisps": true, "encounters": true, "radiant": true, "lootTables": true } }
```

`number` do script build ghi từ `tft.json` (không gõ); người chỉ sửa `name` / `banner` / `features`. `features` nối vào `components/nav.tsx:86-87` và các trang R7, để menu tự ẩn mục mà set mới không có.

**D3 — Sửa ghép id bằng `\d+` ở tầng fetch theo khuôn `entities.ts:286`,** gom vào một helper `lib/set-id.mjs` (crawler) dùng chung cho canon / overlay stats / wisps. Test: cùng một tên với id `18_*` và `19_*` phải cho ra **một** canonical.

**D4 — Không mở trục set trong DB, nhưng gắn nhãn để lọc được.** *(đã chốt 2026-11-04: ẩn theo set, giữ row)* Thêm **một** cột `comps.set_number` (nullable, backfill 18) và một vị từ "board hiện chỉ lấy row đúng set" — R4 đổi từ "sai im lặng" thành "hàng mùa cũ tự ẩn". Không nhân bản toàn bộ schema ra multi-set: sản phẩm là meta hiện tại, lịch sử đã có `guides` và git.

**D5 — Rotation là một lệnh, không phải checklist 20 bước.** `npm run rotate:set -- --to=19 --dry-run`: pg_dump → seed catalog mới → seed comps mới → ẩn row lệch set → build lại corpus → in số đo (65/254/36/597/28/4 so với catalog) → sinh `apps/web/lib/set-redirects.json` từ snapshot cũ trong git, **ghép theo tên thực thể chứ không theo id**: `da-18-ahri → da-19-ahri` nếu AHRI vẫn có mặt ở mùa mới (tướng quay lại là chuyện thường), tên không còn thì không redirect — để 404 thật còn trung thực hơn một trang nói sai. `--dry-run` chạy trên dev; prod là phạm vi riêng theo `feedback-scoped-production-approvals`.

**D6 — Im lặng là bug.** `FALLBACK_PATCHES` (R2) và `?? 18` (R3) đổi thành throw. Loader mechanics (R8) bỏ mặc định `'18'`: thiếu file của set hiện tại ⇒ build fail — cùng nguyên tắc vừa ship ở PBE, `patch: null` thay vì bịa số.

**D7 — Test chỉ đọc số từ artifact.** R9/R10 là cái bẫy lặp lại: cùng kiểu pin dữ liệu sống đã chết hai lần trong tuần (`patch-notes.test.mjs`, `pbe-diff.test.mjs`). Quy tắc thành văn: không literal `18`, `da-18-`, `Mùa 18`, `18.6` trong assertion — đọc từ `set.json`/`tft.json`, hoặc dùng fixture tự chứa (`patch-notes-article.test.ts` là mẫu tốt).

**D8 — Hai con số, hai quyền ghi, và cửa sổ 4–6 tuần là trạng thái bình thường chứ không phải lỗi.** Khác với hotfix, PBE của một set mới chạy **trong khi server live vẫn ở 18.x** — nên hệ thống phải phân biệt được hai thứ mà hiện tại đang trộn một:

| | Suy từ đâu | Được ghi vào |
|---|---|---|
| `liveSet` | major của `_livePatch` (news index Riot) — đã có sẵn, chỉ chưa được dùng làm quyền | `tft.json`, `apps/web/public/tft/**`, `champion-focus.json`, `apps/api/seed/comps.json`, stats/lookups/wisps |
| `previewSet` | `catalogSet(after.champs)` của feed preview — cũng đã có sẵn | **chỉ** `pbe.json` + block còi báo trong PR body |

Ba bất biến phải được kiểm bằng code, không bằng kỷ luật:
1. `pickSet()` chọn theo `liveSet` chứ không lấy max (`fetch-tft.mjs:171`), và **throw** khi cây `latest` chưa có `TFTSet<liveSet>` — R14. Trong cửa sổ, `latest` vẫn max = 18 nên hành vi hôm nay không đổi; khác biệt nằm ở ngày launch, khi catalog và stats flip lệch giờ.
2. Khi `previewSet > liveSet`, đối chiếu tên của bảng preview với **catalog của set mới**, không phải roster live — R13. Nguồn xác thực: cây `pbe` của CommunityDragon (`/pbe/cdragon/tft/en_us.json`, cùng shape với `latest`) tải về `.cache` riêng, cho tên + icon gốc của set 19. Không có nó thì **throw**, đừng in một bảng "Sắp ra mắt" rỗng: `stats.rows: 0` hôm nay là sự thật hợp pháp (PBE đã ship), nên nó không được phép là cách diễn đạt "tôi không join được ai".
3. Trong cửa sổ, mặt trận live **không đổi**: `/tierlist`, `/wisps`, `/tables`, `/items`, `/champions` vẫn 18; Coach không nhận `pbe.json` vào corpus. Đây là hành vi đúng, chỉ cần nó được **khai** bằng test thay vì ngẫu nhiên.

Điều này cũng đổi một câu trong D2: `set.json` cần thêm `upcoming` — không phải multi-set, mà là một field tùy chọn sống đúng 4–6 tuần rồi bị xoá ngày launch:

```json
{ "number": 18, "…": "…",
  "upcoming": { "number": 19, "name": { "en": "…", "vi": "…" }, "features": { "wisps": false } } }
```

## 5. Lịch theo mốc — mốc là tín hiệu đo được, không phải ngày đoán

Không ai biết Riot sang set ngày nào, nhưng pipeline **tự phát hiện** — đó là đồng hồ của kế hoạch này.

| Mốc | Tín hiệu | Việc phải xong |
|---|---|---|
| **T0** | feed preview mang id `19_*` ⇒ `catalogSet()` = 19, `nextMajor()` ra `19.1`. **Không** phải "`pbe.json` có dòng": với roster hiện tại thì `rows: 0` và `unresolved` đầy lên (R13) | `refresh-all` in thêm block `## Set mới đang tới (19)` vào PR body — còi báo mở cửa sổ 4–6 tuần. Đây là **việc đầu tiên của P0** |
| **Cửa sổ (T0 → launch)** | `liveSet` = 18, `previewSet` = 19, hai bên cùng tồn tại | Bảng "Sắp ra mắt" phải **có row mùa 19** (D8-2); mọi trang live vẫn 18 (D8-3); `set.json.upcoming` mang tên 19 để badge/preview nói đúng mùa |
| **T0 + ~1 tuần** | Riot công bố tên set + cơ chế | `set.json` (tên en/vi, features), ảnh bìa, bảng XP/odds set mới + bản dịch vi |
| **T−2 tuần** | PBE đã đủ thực thể | helper `set-id.mjs` đã merge; regenerate `champion-focus.json` + tải ảnh mới; KB cho loot/economy đã tải bản set mới (nằm trong P1 cron) |
| **T−3 ngày** | — | `rotate:set --dry-run` trên dev; **toàn bộ suite phải xanh trên dữ liệu 19 ở dev**; đếm ảnh thiếu so với catalog |
| **Launch** | `livePatch` = 19.1; `pbe.json` về `patch: null` (hành vi đã ship tuần này) | prod: pg_dump → `rotate:set` → `seed:comps`/`seed:tiers` → purge/revalidate kiểu `/[lang]/…` + type page → `npm run verify` → xem `/en`, `/vi`, `/sitemap.xml`, `/en/patches/19.1` |
| **T+3..7 ngày** | cửa sổ stats đủ trận; cluster id tự lấy từ nguồn | tier board hồi số; empty state "đang đo mùa 19" tắt được |
| **T+2 tuần** | Search Console | redirect map chạy, không còn soft-404 tăng vọt |

## 6. Việc, xếp theo chi phí

**P0 — vài buổi, chặn "sai im lặng", không đổi UX**
1. Còi báo set mới trong `refresh-all` (mốc T0) + test fixture cho nhánh id `19_*`. *(crawler)*
2. Preview roster theo set mới: tải catalog cây preview về `.cache` riêng, cho `build-pbe-diff.mjs` resolve theo **preview catalog** khi `previewSet > liveSet`, throw khi thiếu (R13, D8-2). *(crawler)*
3. `pickSet()` chọn theo `liveSet` + throw khi `latest` chưa có `TFTSet<liveSet>` (R14, D8-1). *(crawler)*
4. Gom ba file ở tầng fetch còn regex gắn `18` về một helper `\d+` dùng chung (D3) + test. *(crawler)*
5. Bỏ danh sách patch dự phòng và `?? 18` → throw (D6). *(crawler)*
6. `set.json` (kèm `upcoming`) + nối `messages.ts` (badge/mô tả/disclaimer), banner, `features` cho nav (D2, D8). 
7. Bỏ literal set/patch khỏi `header.spec.ts:95`, `search.spec.ts:13`, `champion-stats.spec.ts:7,22,29` (D7).
8. Test bất biến cửa sổ: với fixture `liveSet=18 / previewSet=19`, asserting (a) artifact live không đổi, (b) `pbe.json` có row, (c) không route nào của 19 lọt vào `generateStaticParams` của trang live (D8-3).

**P1 — 1–2 tuần, biến rotation thành một thao tác**
9. Cột `comps.set_number` + vị từ lọc board + `verify` in "db is on set X" (D4).
10. `scripts/rotate-set.mjs` có `--dry-run` + viết lại `runbook.md` §6 thành thao tác một lệnh (D5), kèm hai lượt `Run workflow` ngày launch (§7-3).
11. Mechanics version-key theo set, loader bắt buộc đúng set, build fail khi thiếu (R8).
12. Corpus + eval đọc id từ catalog (R9); fallback `onError` cho tile ảnh (R6).
13. `set-redirects.json` + empty state "đang đo mùa 19" (R11, R12).

**P2 — còn lại một việc**
14. Port loot/economy khỏi KB local (đã nằm trong backlog cron) — cho tới khi xong, ngày launch vẫn phải có người chạy `fetch-data` trên máy vì hai board đó đọc KB tftflow local.

**Đã huỷ (chốt ở §7):** archive snapshot `packages/shared/data/archive/<set>/` và `/patches` nhóm theo set. §2.1 đo rằng nội dung đáng giữ không nằm ở các khối bị rotation thay, nên hai việc này chỉ thêm một lớp quản lý.

## 7. Chốt của chủ repo (2026-11-04)

1. **Giữ công khai:** chỉ những khối cross-set thật, đã đo ở §2.1 — bài skill + tips (row `guides`, 0 tham chiếu set), bài patch notes (`kind='patch_notes'`), block `general` của mechanics, 8 chiến lược kinh tế. **Không archive** trang thực thể mùa cũ: `/champions/da-18-*` và comp mùa 18 là nội dung *gắn set*, giữ lại chỉ tạo trang nói sai. Vì vậy `set.json` vẫn là **một slot live**, chỉ thêm `upcoming` tùy chọn sống trong cửa sổ preview (D8) — không phải danh sách nhiều set, và P2 cũ (archive snapshot + `/patches` nhóm theo set) **bị huỷ**, không phải để sau.
2. **Vote/cover của user:** **ẩn theo set, giữ row** (đúng D4). Không xoá: quyền chọn này làm D4 thành bắt buộc chứ không chỉ nên, vì `seed:comps` upsert mà không xoá sẽ để hàng mùa cũ ngồi lại trên board.
3. **Ngày launch:** bấm `Run workflow` tay. Hệ quả phải biết trước — nếu không bấm, lần đầu site nhìn thấy 19.1 là PR 01:30 UTC hôm sau. Đổi lại: cron chỉ chạy một đợt mỗi ngày nên đợt nào hỏng cũng chết ở PR, đúng như ý bạn đã chốt từ đầu.

Còn một việc phát sinh từ câu 3: ngày launch cần **hai** lượt bấm (sáng để lấy catalog 19.1, chiều/ tối để lấy cửa sổ stats khi đã đủ trận) — ghi vào runbook lúc làm P1-7, không phải code.

## 8. Tái hiện số đo

```bash
ls apps/web/public/tft/{champions,items,traits,augments,abilities,loot} | wc -l   # 65 254 36 597 28 4
python3 -c "import json;print(len(json.load(open('apps/web/lib/champion-focus.json'))))"  # 65
python3 -c "import json;print(json.load(open('packages/shared/data/tft.json'))['set'])"
#   {'number': 18, 'mutator': 'TFTSet18', 'name': 'Set10'}  ← tên set từ nguồn là rác, phải gõ tay
grep -cE '\b18\b' apps/web/lib/messages.ts                                          # 34 dòng
grep -oE '\b18\b' apps/web/lib/messages.ts | wc -l                                   # 36 lần
python3 -c "import json;print(len(json.load(open('apps/api/seed/comps.json'))))"     # 54
grep -n "dynamicParams" apps/web/app/\[lang\]/layout.tsx                             # 25
```

Cho §2.1 (đo cross-set):

```bash
grep -c 18 apps/api/seed/guides.ts apps/api/seed/tips.ts       # guides.ts: 0 · tips.ts: 0
python3 -c "
import json;d=json.load(open('packages/shared/data/mechanics-knowledge.json'))
print(len(d['general']['topics']), list(d['sets']), d['defaultSet'])"   # 8 ['18'] 18
python3 -c "
import json;d=json.load(open('packages/shared/data/economy.json'))
print(len(d['strategies']), d['strategies'][0]['name'].count('18'), len(d['comps']), json.dumps(d['comps']).count('18'))"
#   8 0 44 451   ← strategies cross-set, comps thì không
```
