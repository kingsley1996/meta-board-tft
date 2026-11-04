# Plan triển khai Patch Notes

Ngày lập: 2026-11-02. Cập nhật phạm vi: 2026-11-03 — user chốt scope (§1.1).
Trạng thái: **P0→P2d đã build xong, micro patch (§4.2) và màn list dạng hàng + dải icon (§5, §7) đã live trên dev — 5 bài, mỗi bản vá nhỏ có trang riêng, list có sẵn panel "Sắp ra mắt" dựng từ `pbe.json`.** P0b (chuỗi snapshot) cũng đã chạy. Còn lại: trang bài viết cho bản sắp ra mắt (P3), ô chỉnh `rows` trong editor (P3b), báo cáo tuần (P4, chờ mốc snapshot thứ hai), wisps/encounters (P5). Kiến trúc tham chiếu đã được phân tích bằng REA từ tftips.app (`/en/patches`), chi tiết ở §3; nguồn PBE và tham chiếu "báo cáo tuần" của datatft đã probe ở §2.2 và §2.3.

## 1. Mục tiêu và phạm vi

Một mục Patch Notes để người chơi biết **bản vá này đổi gì, đổi bao nhiêu, ảnh hưởng comp nào**, ngay trong app, có tiếng Việt, và có trang "sắp ra mắt" từ dữ liệu PBE.

Bên trong phạm vi: champions, traits, items, augments; danh sách bản vá kèm badge bản nhỏ; **mỗi bản vá là một bài viết mở đầu bằng card "TIÊU ĐIỂM"** theo đúng hình Riot đã công bố (§5.1), có baseline để so sánh; **nội dung lấy từ patch notes chính thức của Riot** (kèm link về bài gốc theo từng bản); màn "Sắp ra mắt" từ snapshot PBE; breadcrumbs + JSON-LD + sitemap.

Ngoài phạm vi đợt này: wisps/encounters (nguồn MetaTFT, shape khác — pha 2), so sánh hai bản vá bất kỳ không liền nhau trên mobile, tự động viết lời bình bằng AI, theo dõi tier sau patch. Có đụng production DB nhưng chỉ một cột: `ALTER TABLE guides ADD COLUMN IF NOT EXISTS kind` — không bảng mới, không endpoint mới, và mọi ghi production vẫn cần phê duyệt riêng có `pg_dump` trước.

### 1.1 Phạm vi user chốt (2026-11-03)

- **Phải cào: 18.4 → bản hiện tại, cộng bản sắp ra mắt (PBE 18.6).** Không backfill 18.1→18.3 dù Riot có đủ (§2.1) — phạm vi nhỏ lại để parser chỉ phải đúng trên shape của hai bản dense nhất.
- **UI tham chiếu: trang list và trang detail của tftips** (`/en/patches`, đã REA ở §3), cho hai màn `/patches` và `/patches/[patch]`.
- **Bề mặt thứ ba: báo cáo hằng tuần**, tham chiếu cách datatft dựng trang `/weeklyReport/{id}` (§2.3). Đây là nội dung **ta tự viết từ số liệu của ta**, không phải bản dịch của ai.

## 2. Quyết định cần user chốt (gate)

- **Q1 — Nguồn dữ liệu.** Đã đổi quyết định so với bản đầu: nguồn chính là **patch notes chính thức của Riot** trên `teamfighttactics.leagueoflegends.com`, không phải diff snapshot. Lý do: Riot đã viết sẵn từng dòng "cũ ⇒ mới" theo từng nhóm entity, và **toàn bộ Set 18 (18.1→18.5) nằm trên host đó, đọc được bằng JSON** (bằng chứng ở §2.1). Hệ quả tốt: không có cold-start, không cần backfill `tftflow change_log`, số liệu là bản gốc của Riot. Community Dragon **bị loại làm nguồn kiểm tra chéo** vì bản `latest` của nó đang đi sau game thật (§2.2). Nguồn cho màn "Sắp ra mắt" là **catalog PBE của tftips** (§2.2), không phải Riot.
- **Q2 — JSON hay DB.** Bản này đổi quyết định so với đề xuất đầu, vì user chốt thêm yêu cầu: bài patch notes phải là **một bài viết biên tập** theo dạng card "TIÊU ĐIỂM" (§5.1) mà **admin sửa được tại production**. JSON tĩnh không sửa được nếu không deploy lại. Đề xuất: **hai tầng, mỗi tầng một nơi** — (a) *số liệu máy đọc được* vẫn là `packages/shared/data/patch-notes.json` do crawler sinh, app chỉ đọc, không bảng; (b) *bài viết* nằm trong bảng `guides` hiện có, thêm cột `kind` (`guide` | `patch_notes`), cột `sections` jsonb nhận thêm loại block có `rows`. Không tạo bảng mới, không editor mới: admin dùng `/admin/guides/[slug]/edit`, agent cào về thì cùng một payload POST vào `/api/admin/guides`.
- **Q3 — Nhãn patch.** Dữ liệu của ta đang mang hai số: `tft.json.patch = "16.21.1"` (patch Liên Minh) trong khi cộng đồng và comps dùng `18.5c` (patch TFT). Không còn phải tự phân giải: bài viết của Riot mang nhãn TFT trong metadata (`jsonLd.TechArticle.version = "18.5"`), còn `16.21.1` chỉ còn là metadata của snapshot. Resolver `patchOf` vẫn cần, nhưng nguồn nhãn là Riot chứ không phải suy từ client version.
- **Q4 — Buff/nerf do máy phân loại.** Chiều đổi số không tự nó nói "tăng là tốt": mana tối đa tăng là nerf, thời hồi kỹ năng giảm là buff. Đề xuất một bảng polarity tường minh cho từng field (`hp/ad/ar/mr/dmg/score → +good`, `mpMax/mpStart/cost/duration → +bad`) nằm trong crawler, có unit test; field nào không có trong bảng thì trả `adjust`, không đoán.
- **Q5 — phạm vi i18n.** Riot **có bản tiếng Việt chính thức** cho cùng một bài (`/vi-vn/news/game-updates/teamfight-tactics-patch-18-5/`, heading đã dịch: TƯỚNG / TỘC-HỆ / NÂNG CẤP / TINH LINH), nhưng bản vi **lệch** so với bản en: bài 18.5 en có 84 dòng đổi và mục 27/10, bản vi mới 78 dòng và dừng ở 22/10. Đề xuất: en là nguồn chuẩn để dựng hàng đổi; tên hiển thị tiếng Việt lấy từ `nameVi` của `tft.json` (đã khớp với phần còn lại của app), nhãn field lấy theo bài vi khi nó đã dịch, chưa dịch thì giữ nhãn en — không tự bịa tiếng Việt cho số.

### 2.1 Bằng chứng về nguồn chính thức của Riot (probe trực tiếp, 2026-11-03)

- **Host riêng cho TFT:** `teamfighttactics.leagueoflegends.com`, `robots.txt` là `Allow: /`, bài patch notes có `type = "patchNote"`, id dạng `patchNote.<uuid>.<locale>`. Bài `teamfight-tactics-patch-18-5` trả 200, `/18-6/` trả 404 (chưa ra). Lịch sử trên host này phủ từ 9.x tới 18.5, tức **Set 18 có đủ 18.1→18.5**.
- **Có JSON, không chỉ HTML:** `/_next/data/{buildId}/{locale}/news/game-updates/{slug}.json` — `buildId` đọc từ `__NEXT_DATA__` của bất kỳ trang nào trên host. Bài 18.5: 55KB JSON bản en, 62KB bản vi, so với 220KB HTML. `translationId` là khoá chung giữa các locale (đã verify en-us và vi-vn cùng một `translationId`).
- **Cấu trúc nội dung:** `page.blades[]` → blade `patchNotesRichText` → `richText.body` là HTML có quy ước class: `h2` = phần lớn (`MID-PATCH UPDATE`, `PATCH HIGHLIGHTS`, `LARGE CHANGES`, `BUG FIXES`), `h3` = ngày của bản vá giữa chu kỳ (`OCTOBER 27TH`), `h4` = nhóm thực thể (`CHAMPIONS`, `UNITS: TIER 2..5`, `TRAITS`, `RADIANT ITEMS`, `AUGMENTS`, `WISPS`), rồi `li` tên thực thể + `ul` con mỗi dòng là `Stat: 250/345/500 ⇒ 230/310/450` bọc trong `span.change-indicator`. Bài 18.5 bản en có **84 marker `⇒`**; parser tạm (đi đúng 4 tag `h2/h3/h4/li`) đếm được **129 dòng thực thể và 84 dòng đổi**, chia thành 15 nhóm — `LARGE CHANGES › AUGMENTS` dày nhất (41 thực thể nhưng chỉ 24 dòng có số), `WISPS` 14/7, `UNITS: TIER 4` 7/12. Hai cảnh báo khi viết parser: (a) `li` lồng `ul` — cắt theo `</li>` đầu tiên sẽ nuốt luôn dòng con và mất tên thực thể, phải dùng HTML parser thật hoặc stack; (b) `h2` có cả `PERFORMANCE/STABILITY BUG FIXES` và `COSMETICS CONVERTED IN PATCH 18.5` (18 thực thể, 0 dòng số) — những nhóm này không được tính vào bộ đếm buff/nerf.
- **Bản dịch tiếng Việt luôn đi sau — bản en là nguồn đúng nhất.** Cùng bài 18.5: en có 84 dòng đổi và mục `OCTOBER 27TH`, vi chỉ có **78 dòng và dừng ở `NGÀY 22/10`** (không có `230/310/450`). Riot dịch chậm hơn vài ngày với mỗi lần sửa giữa chu kỳ, nên pipeline phải lấy en làm chuẩn và có quy tắc fallback tường minh cho hàng chưa được dịch.
- **Nhãn patch có sẵn:** `jsonLd.TechArticle.version = "18.5"`, `datePublished` = ngày ra bản.
- **Discovery = sitemap, không phải trang tag:** `/{locale}/sitemap_loc.xml` (1162 URL, có `lastmod`) cập nhật tới bản mới nhất. Trang tag `/news/tags/teamfight-tactics-patch-notes/` có `articleCardGrid` 131 card nhưng **lag** (card mới nhất là 2025-04, nút "SHOW MORE" trỏ `#`) — không được dùng để phát hiện bản mới.
- **Bẫy micro patch:** 18.5b/18.5c **không có URL riêng**; Riot ghi đè vào chính bài 18.5 dưới `MID-PATCH UPDATE`, và `lastmod`/`dateModified` vẫn là `2026-10-20` dù nội dung 27/10 đã nằm trong bài. Nên bản vá giữa chu kỳ chỉ phát hiện được bằng **hash body / `analytics.rev` đổi trên cùng một URL**, không bằng ngày.
- **PBE:** Riot không viết patch notes cho PBE. Thứ gần nhất trên host đó là bài dev (`tft-dev-video-enchanted-wilds-pbe-check-in`, lastmod 2026-08-13) và các bài *rundown* — mà rundown 18.5 **chuyển hướng (302) thẳng sang YouTube**, tức là video, không có số để parse. Nguồn PBE phải đến từ bên thứ ba, xem §2.2.
- **Data Dragon không có đường TFT nào sống:** `/cfw/tft/set/set-18.json` và mọi biến thể trả 403 (S3 NoSuchKey), chỉ `/cdn/16.21.1/data/en_US/champion.json` của LoL trả 200.
- **Ảnh card "TIÊU ĐIỂM" mà user gửi chính là ảnh Riot nhúng sẵn trong bài.** `richText.body` của bài 18.5 có 3 thẻ `img`: hai ảnh avatar designer 300x300 và một ảnh highlights — bản en `…-1920x1080.jpg`, bản vi `…-2400x1350.png` trên `cmsassets.rgpub.io`. Nghĩa là hình dạng thị giác của màn bài viết **đã có bản gốc của Riot để đối chiếu**, nhưng nó là ảnh bitmap nên không phải nguồn dữ liệu; ô icon vẫn phải dựng từ số đã parse.

### 2.2 Bằng chứng về nguồn PBE (probe trực tiếp, 2026-11-03)

Kết luận: **nguồn "sắp ra mắt" đáng tin nhất hiện chạy được là catalog PBE của tftips**, không phải Riot, cũng không phải Community Dragon.

- **Riot không có gì cho 18.6.** Sitemap `en-us` chỉ có 9 URL với `lastmod ≥ 2026-10-01`; hai mục game-update cuối là `teamfight-tactics-patch-18-5` và `tft-patch-18-5-rundown`, đều chốt ở `2026-10-20`. Không có URL 18.6, không có bài PBE nào mới hơn 13/08.
- **tftips có snapshot PBE thật, đủ 4 loại entity, đủ cả locale `vi`.** `GET /api/catalog/pbe/{en|vi}/{champs|traits|augs|items}` trả 200 (96.880 / 26.373 / 126.601 / 103.982 byte bản en; 105.549 / 30.012 / 137.920 / 111.479 byte bản vi). Cùng shape với snapshot patch (`18.5c` trả 200, `18.6` trả 404), nên diff được ngay mà không cần chờ Riot ra bài.
- **Diff `pbe` so với `18.5c` ra đúng nội dung của bản sắp tới, đã loại nhiễu `sortIdx`/`icon`:**
  - *champs 9/68 thực thể đổi số:* Alistar 306/437/646 ⇒ 276/397/566 (nerf), Gromp 180/270/43x ⇒ 160/240/37x và AD theo sao 50/75/112.5 ⇒ 45/67.5/101.25 (nerf), Kobuko 334/423/639 ⇒ 349/438/709, Malphite shield 735/885 ⇒ 750/925, Murkwolf 65/100/16x ⇒ 60/90/15x, Nidalee 185/275 ⇒ 195/295, Rek'Sai 17/27/43 ⇒ 17/29/47, Sentinel 505/709/2521 ⇒ 531/756/2625, Warwick 230/345/535 ⇒ 215/325/500.
  - *traits 2/37:* Blossom "Gain 4 gold after buying a Wisp, 50% ⇒ 55%", Elderwood `hiddenValues[0].values[3]` 1.25 ⇒ 1.1.
  - *augs 248 → 247:* **thêm** `18_heartofsteel` (Heart of Steel / *Trái Tim Sắt Đá*), **bỏ** `18_constructacompanion` và `18_forgeafriend`; đổi số ở Clockwork Accelerator 10 ⇒ 12, Fae trait-augment 50 ⇒ 35, Plot Armor 8 ⇒ 10, Shopping Spree 6 ⇒ 7; ba lõi đổi cờ `isTraitAugment` false ⇒ true.
  - *items 8/… nhưng chỉ 2 là số:* Armor/MR booster 8 ⇒ 10, Speed booster 6 ⇒ 8; 6 dòng còn lại là `statLine` đổi cách đặt `()` — phải lọc, nếu không sẽ ra "buff giả".
- **Bản `vi` của cùng snapshot đã có tiếng Việt thật, không phải máy dịch của ta:** `18_heartofsteel` = "Trái Tim Sắt Đá" với mô tả tiếng Việt đã điền số PBE; traits dịch sẵn (Ăn Mòn, Bá Chủ, Cổ Thụ, Cự Thạch). Tên tướng vẫn giữ tiếng Anh (Ahri, Alistar) — khớp với quy ước `nameVi` của app.
- **Community Dragon không dùng được làm "bản hiện tại" để đối chiếu.** `latest` và `pbe` đều mới (Last-Modified 31/10 và 30/10), nhưng `latest` vẫn giữ `DA_BuildABud.NumGold = 6` trong khi bài 18.5 của Riot ghi `6 ⇒ 9` và tftips `18.5c` đã là "Gain 9 gold"; `pbe` lại là 9. Suy ra `latest` của cdragon đi sau game thật, nên diff `pbe − latest` **không** phải "thay đổi sắp ra" mà là độ trễ của chính cdragon. Hệ quả phụ: `tft.json` của ta (kéo 02/11) cũng đang ghi "Gain 6 gold" cho Build A Bud — lệch một bản so với số Riot đã công bố; đây là việc của crawler, ngoài phạm vi tài liệu này.
- **Cẩn trọng khi dùng số của Riot làm chuẩn:** trong bài 18.5, mục `AUGMENTS` có 41 thực thể nhưng chỉ 24 dòng có `⇒`; phần còn lại là sửa chữ. Card TIÊU ĐIỂM của Riot gom "9 NÂNG CẤP" / "12 NÂNG CẤP" — tức họ tự chốt nhóm bằng tay, không suy từ số.

### 2.3 Bằng chứng về "báo cáo hằng tuần" của datatft (probe API, 2026-11-03)

Trang `https://www.datatft.com/weeklyReport/163` là SPA Vue: HTML 20KB **không chứa dữ liệu**, mọi thứ đi qua `api.datatft.com`. Route `/weeklyReport` map vào chunk `WeeklyReportView`, và chunk đó gọi hai endpoint (tên thật là **dailyReport**, không phải weekly):

- `POST /dailyReport/query` body `{pageNum, pageSize, type}` → `{total, list[], pageNum, pages, …}`, bọc trong `{code, message, data, success}` như mọi endpoint khác của họ; thành công là `code === 1`.
- `GET /dailyReport/detail/{id}` → `{id, reportDate, type, source, title, content, season, createTime}` với `content` là **markdown thuần** (10.002 ký tự cho id 163).

Bốn điều rút ra được, đều là **hình thức**, không phải nội dung:

- **Một feed, nhiều loại, phân biệt bằng `type`.** 41 bản ghi (đo `pageSize=50`, `total=41`): `type=1` là công bố bản vá (18.5, 18.4, 18.3…), `type=3` là bản tin đặc biệt. `source` ghi rõ gốc: `英雄联盟官方` (công bố tiếng Trung của máy chủ Trung Quốc), `Teamfight Tactics` (Riot en), `PBE 更新速报`, `莫狗`/Mortdog.
- **`type=3` id 160 chính là "báo cáo PBE" mà ta đang cần làm.** Nội dung: đối chiếu 18.3b với PBE tại một thời điểm, có `## 更新摘要` (tóm tắt: 28 quân cờ / 9 tộc hệ / 6 trang bị / 30 lõi), rồi ** nhóm nerf → buff → chỉ đổi mô tả, trong mỗi nhóm xếp theo bậc phí tăng dần**, mỗi thực thể một `####` kèm dòng `只有 4 段斜线 = 1/2/3/4 sao`. Đây là bố cục đáng học cho màn "Sắp ra mắt" của ta, và nó **đối chiếu độc lập với số ta đo từ tftips** (Warwick `230/345/535 ⇒ 215/325/500` khớp từng chữ số).
- **`周报` thứ nghĩa là một surface khác.** Cùng feed có các bản titled "2026年…周 报" (id 33, 34, 39, 43, 47, 96) với bố cục: tổng quan môi trường → tộc hệ mạnh/yếu → **改动 có đạt kỳ vọng không** → lõi/trang bị đạt-ngưỡng-ngoài-dự-đoán. Đây là báo cáo meta hằng tuần, **khác** bài patch notes.
- **Có một mẹo render đáng lấy:** bài của họ đánh dấu thực thể nội line bằng `§tên§`, và client biến mỗi marker thành ô quân cờ/ấn (đọc được trong chunk: `{hexId, img, name, desc, round}`). Bài của ta đã cần đúng thứ này cho card TIÊU ĐIỂM (§5.1).

**Ràng buộc phải ghi rõ:** toàn bộ `content` của datatft là **tiếng Trung và là nội dung biên tập của họ** — không được chép câu chữ vào sản phẩm ta, không dùng `title` của họ làm tên bài. Nguồn câu chữ tiếng Việt/en của ta chỉ là Riot (§2.1), và lời bình của báo cáo tuần là **ta tự viết từ số liệu của ta**. Datatft chỉ là tham chiếu về bố cục và là bằng chứng rằng loại nội dung này có thể dựng hoàn toàn từ dữ liệu.

### 2.4 Điều kiện tiên quyết cho báo cáo tuần: chuỗi snapshot theo thời gian

Câu hỏi cốt lõi của một báo cáo tuần — "bản vá vừa rồi có đạt kỳ vọng không" — là **so sánh tuần này với tuần trước**, nên nó cần chuỗi thời gian, không cần bài viết nào cả. Hiện tại crawler **không giữ lịch sử**: `.cache/metatft/cluster-stats.json` là một snapshot duy nhất có `generatedAt` và `patch`, mỗi lần chạy là ghi đè. Việc cần làm rất rẻ và cần bắt đầu càng sớm càng tốt: **lưu bản sao có ngày mỗi lần harvest** (`snapshots/{YYYY-MM-DD}/…`) để sau ~2 tuần là có đủ hai mốc cho báo cáo đầu tiên. Ghi đè snapshot trong DB (`comps.tier` v.v.) thì đã có `updated_at`, nhưng không đủ để dựng đường cong.

**Đã dựng (03/11) — `npm run snapshot`, `lib/snapshot.mjs` + `scripts/snapshot.mjs`.** Mốc lưu theo ngày UTC, gzip từng file: chạy thật đầu tiên cho **19 file, 3,78MB ⇒ 0,49MB**. Manifest **không hardcode số bản vá** — nó suy từ dữ liệu: mỗi bài trong `riot-patch-notes/index.json` thành một mục, và cả hai phía của diff PBE (catalog `pbe` + đúng `baseline.patch` ghi trong `pbe.json`), nên đổi baseline là archive tự đổi nội dung. Năm file là **bắt buộc** (`meta`, `tft`, `patch-notes`, `cluster-stats`, `riot-index`): thiếu thì script `exit 1` **và không ghi gì** (đọc hết các file trước khi nén, nên một lần chạy hỏng không để lại `index.json` mô tả một ngày thiếu cột) thay vì âm thầm sinh một báo cáo thiếu cột; phần còn lại (`pbe`, từng bài Riot, catalog tftips) vắng thì ghi vào `index.json.absent`. Đã đo: chạy với app repo rỗng trả `exit 1, vắng 5: meta, tft, patch-notes, wisps, pbe` và `index.json` của ngày tốt không đổi byte nào. `sha256` tính trên nguồn chưa nén để hai ngày so bằng hash trước khi giải nén, và `index.json.head` (`latestPatch`, `metaPatch`, `pbePatch`, `pbeBaseline`) đủ để chọn hai mốc mà không đọc file nào. `data:pull`, `comps` và `patches` nối `snapshot` ở bước cuối, nên chỉ cần harvest là có mốc. Test: `test/snapshot.test.mjs` (9).



## 3. Kiến trúc tham chiếu rút ra từ tftips (bằng chứng, không phải suy đoán)

Chỉ học cách họ **trưng bày** (URL hoá baseline, SSR, badge, bộ đếm). Phần **nguồn** thì khác: tftips tự diff snapshot của riêng họ, còn ta lấy thẳng dòng "cũ ⇒ mới" Riot đã viết (§2.1) — không phải đoán lại chiều đổi cho những thứ Riot đã ghi rõ.

- **Họ không chứa bài viết changelog; họ chứa snapshot theo patch.** Route `/api/catalog/{patch}/{locale}/{entity}` (entity chỉ nhận `champs|traits|augs|items`) trả map id → object với `ability.desc` HTML, `stats` theo sao, `cost`, `traits`, `apiName`. PBE nằm dưới khoá `pbe`, cùng shape nên diff được trước khi patch ra.
- **Diff là machine-generated.** Mỗi token số bị đổi được bọc `.tft-diff-change.tft-diff-change-good|bad`, render grid ba hàng (giá trị cũ / chevron / giá trị mới bằng `grid-area:1/N` và `3/N`); thêm/bớt dùng `tft-diff-ins|del`. Trên trang 18.5c đếm được 82 khối `bad`; trang 18.5 có 116 `good` / 82 `bad`.
- **Baseline là một phần của URL.** `/patches/{v}/from/{base}` (`/from/18.4` trả HTML khác, `/from/99.99` trả 404), trong khi `?base=` bị server bỏ qua — ba lần fetch với query khác nhau trả đúng một md5. Trang 18.5c so với 18.4 nặng 724KB so với 176KB mặc định, nên cache là bắt buộc: request đầu `x-vinext-cache: MISS` 2,5s, sau đó HIT với `age≈13.000s`.
- **Client không fetch dữ liệu patch.** REA `analyze_javascript_application` trên 129 chunk (Evidence `ev_c968f2af894e7b3d…`) chỉ tìm thấy 4 endpoint phía client: `/api/comps/updated-at`, `/api/supporter/star4/{patch}/{locale}`, `/cdn-cgi/trace`, `/signout`. Toàn bộ patch notes nằm trong SSR payload.
- **Information architecture đơn giản và nên học:** list chia `Upcoming Patches` / `Released Patches`; card gồm `Patch {v}` + badge `Latest`/`Micro patch` + `<time dateTime>` + bộ đếm Buffs/Nerfs/Added/Removed/Adjustments + tên các wisp bị ảnh hưởng, cả card là một link. Detail gồm h1 + link sang patch notes chính thức của Riot + select baseline + chip lọc theo loại (kể cả loại 0) + section Buffs/Nerfs, mỗi row là icon link về trang entity (mài theo `border-cost-N`) rồi tới mô tả có diff nội line.
- **SEO:** JSON-LD `Article` + `BreadcrumbList`, sitemap có 13 URL patch, canonical + hreflang cho 8 locale.

## 4. Thiết kế dữ liệu

Pipeline mới trong crawler: `scripts/fetch-patch-notes.mjs` (sitemap → bài `patchNote` của từng bản, hai locale, lưu `.cache/riot-patch-notes/{patch}/{locale}.json` kèm sha256 của `richText.body` để phát hiện micro patch) rồi `scripts/build-patch-notes.mjs` (blades → rows, khớp tên thực thể với `tft.json`, phân loại chiều đổi). Output là `packages/shared/data/patch-notes.json`:

```
{ generatedAt, latestPatch,
  patches: [ { patch, release, base, dayDate, set, title, titleVi?, publishedAt, updatedAt,
               version, revision,
               sha256: {en, vi}, url: {en, vi}, source: {name, label{en,vi}},
               stats: { articleArrows, rows, unmatched }, counts: { buff, nerf, adjust },
               rows: [Row], unmatched: [Gap] } ] }
Row = { ref, slug, kind, table, name{en,vi}, icon, cost|null, day, dayDate,
        heading, field: {en, vi?}, from, to, direction, note?: {en} }
```

`Row` là đơn vị duy nhất UI phải render (một dòng = một thay đổi), `unmatched` giữ nguyên những gì parser nhìn thấy nhưng không nối được tên.

`stats.articleArrows` là số marker `⇒` của **cả bài Riot**, kể cả những block đã bị cắt sang entry khác — nó là thước đo độ đầy đủ của crawler trên từng bài (84 cho 18.5, 120 cho 18.4), không phải thuộc tính của entry. `stats.rows` và `counts` mới là của riêng entry đó.

`release` là `'base'` khi Riot tự đặt tên bài bằng nó, `'mid_patch'` khi họ chỉ viết `h2 MID-PATCH UPDATE` bên trong bài gốc; `base` trỏ về bản gốc, `dayDate` là ngày Riot ghi trong `h3`. Một bản có thể sinh nhiều entry `mid_patch` (18.5 → 18.5b + 18.5c), và **chỉ sinh khi có bằng chứng** — xem §4.2. Nhãn patch và `publishedAt` lấy từ `jsonLd.TechArticle` của chính bài viết. `fields` sinh từ dòng `Stat: cũ ⇒ mới` của Riot — không còn bước diff hai snapshot JSON, nên engine chỉ phải (a) tách tên thực thể khỏi dòng đổi, (b) chuẩn hoá tên để nối với `tft.json`, (c) quyết định chiều tốt/xấu. Dòng nào không có số (kiểu "Wisp Filtering") đi vào `adjustments` với `descDiff` nguyên văn.

**Trang bị Ánh Sáng là một thực thể khác, không phải trang bị thường đội tên.** Riot không bao giờ gọi tên món đồ ánh sáng của họ: block `RADIANT ITEMS` liệt kê "Adaptive Helm", còn mục giữa bản vá viết `Radiant Omnivamp: 30% ⇒ 25%` dưới tên "Hand of Justice". Catalog lại giữ **một mục riêng** cho từng món ánh sáng (`TFT5_Item_AdaptiveHelmRadiant`) — ảnh của chính nó, tên tiếng Việt Riot đã dịch ("Mũ Thích Nghi Ánh Sáng"), và trang `/en/items/<slug>` riêng (đã đo 200). Nối theo tên Riot in ra nghĩa là vẽ ảnh trang bị thường và link tới trang của món đồ khác. Quy tắc nằm trong `lib/patch-notes.mjs` → `radiantEntity(group, line, hit, tft)`; build script gọi nó lúc đẩy row và **chỉ đổi khi cả ba điều kiện** giữ: (a) `hit.table === 'items'`, (b) heading là `RADIANT ITEMS` **hoặc** chính nhãn dòng bắt đầu bằng "Radiant", (c) `resolveEntity('Radiant <tên>')` thật sự tìm thấy mục catalog — không có mục thì không có tuyên bố. Dòng ghép ("Azir / Kha'Zix") nhiều hit thì không đổi bao giờ, và wisp có dòng "Radiant Mana Restored" vẫn là wisp (đo trên 18.4: hai dòng đó ở lại `DA_ManaPotion18_Charm`). Tra nhãn vi vẫn dùng tên gốc vì bài vi cũng ghi tên gốc, nên swap không ăn mất tiếng Việt nào. Số đo 03/11: 4 dòng radiant (`Radiant Adaptive Helm` ×2 + `Radiant Blue Buff` ở 18.5, `Radiant Hand of Justice` ở 18.5c), **row counts và join rate không đổi** (70/99%, 6/100%, 7/100%, 26/96%, 69/85%), vi-labels không đổi (64/70, 7/7).

### 4.2 Chữ cái bản vá nhỏ: chỉ ghi khi version đã phát hành chứng minh

Riot không viết bài riêng cho 18.5b/18.5c (§2.1), nên thứ duy nhất nói "một bản có thật, và nó đổi những dòng này" là **dữ liệu version đã phát hành**. Engine `lib/patch-versions.mjs` (crawler) nối mỗi block ngày với một version bằng ba bước:

- `versionSequence(cacheDir)` đọc mọi snapshot catalog đã cache (`.cache/tftips-catalog/{version}/…`) và dựng chuỗi version theo ngày, không hardcode danh sách.
- `proves(versionA, versionB, rows, out)` trả `true` **chừng nào còn một dòng trong block đọc khác nhau giữa hai version đã cache**. Một ngày mà không dòng nào lệch thì không có gì để chứng minh, và entry đó bị bỏ.
- `attributeVersions(...)` gán block → chữ cái; nó từ chối và in lý do thay vì đoán: `no catalog sequence for …`, `no row of this block reads differently in any cached version`, `the same evidence reads in …` (một version cho ra hai block), `${version} is claimed by more than one dated block`, `the version order does not follow the dates`.

Kết quả đo 03/11 (`node scripts/build-patch-notes.mjs`):

```
PROOF 18.4 2026-10-07 → 18.4b  17 dòng: Alistar · Spell Damage | Gromp · AP Form Splash Damage | …
PROOF 18.5 2026-10-22 → 18.5b  1 dòng: Brambleback · Healing On-Hit
PROOF 18.5 2026-10-27 → 18.5c  4 dòng: Kha'Zix · Base Damage | Kha'Zix · Isolated Damage | Hand Of Justice · Omnivamp | Radiant Hand of Justice · Radiant Omnivamp
```

Một entry `mid_patch` mang **cả block ngày**, không riêng dòng có bằng chứng (`18.5c` = 6 dòng từ 4 dòng chứng minh), vì Riot ghi cả mục đó trong cùng một lần sửa; phần chữ cái thì chỉ đến từ bằng chứng. Bản `vi` của `18.5c` có `vi-labels=0` — Riot chưa dịch mục 27/10, nên nhãn field trên bài vi tiếng Việt hiển thị tiếng Anh của Riot. Đó là độ trễ của nguồn, không phải chỗ để ta tự viết tiếng Việt (§Q5).

Test giữ hợp đồng: `crawler/test/patch-versions.test.mjs` (kể cả khoá cache có `cacheDir`, vì hai lần chạy trên hai cache không được đọc chéo snapshot của nhau — một version chưa từng fetch mà vẫn "có bằng chứng" là bug thật, đã sửa), và `test/patch-notes.test.mjs` assert đúng năm entry `18.5c/18.5b/18.5/18.4b/18.4` kèm `articleArrows {18.5: 84, 18.4: 120}`. Bốn test radiant trong cùng file giữ quy tắc §4: hai case đổi (heading `RADIANT ITEMS`, nhãn "Radiant …"), một case "không có mục catalog thì không đổi" (wisp, trang bị không có bản ánh sáng, dòng ghép), một assert trên **file đã sinh** — mỗi dòng radiant phải có `icon` kết thúc bằng `/${slug}.png` (ảnh của chính nó, không phải ảnh trang bị thường), `name.en` bắt đầu bằng "Radiant " và `name.vi` kết thúc bằng "Ánh Sáng". `fields` sinh từ dòng `Stat: cũ ⇒ mới` của Riot — không còn bước diff hai snapshot JSON, nên engine chỉ phải (a) tách tên thực thể khỏi dòng đổi, (b) chuẩn hoá tên để nối với `tft.json`, (c) quyết định chiều tốt/xấu. Dòng nào không có số (kiểu "Wisp Filtering") đi vào `adjustments` với `descDiff` nguyên văn.

`patch_snapshots` của Community Dragon **bị loại hẳn** (§2.2: bản `latest` đi sau game thật nên diff `pbe − latest` đo độ trễ của cdragon, không đo bản sắp ra). Data blob live của Riot cũng **bị loại** bằng chính bằng chứng ngược: `patch-notes.json` của bản 18.5 có dòng `Taric Resists 65 ⇒ 70` (đã ra game), nhưng blob kéo ngày 02/11 vẫn ghi 65 — diff `pbe − blob` vì thế bịa ra 5 dòng "sắp ra mắt" cho những thứ đã phát hành. Nên màn "Sắp ra mắt" chỉ được dựng từ **hai snapshot cùng một nhà sản xuất**: `tftips /api/catalog/18.5c/…` (bản đã ra gần nhất) và `/api/catalog/pbe/…`.

### 4.1 Board "Sắp ra mắt": `packages/shared/data/pbe.json`

Lệnh: `npm run build:pbe` (`node scripts/build-pbe-diff.mjs [--patch=18.6] [--base=18.5c]`), engine `lib/pbe-diff.mjs`. Kết quả đo được 02/11, khớp từng chữ số với probe độc lập ở §2.2:

```
{ generatedAt, patch: "18.6", set: 18, isPbe: true,
  source:  { provider: 'tftips-catalog', fetchedAt },
  baseline:{ patch: '18.5c', provider: 'tftips-catalog', fetchedAt },
  coverage:{ champs|traits|augments|items: { released, pbe } },
  stats:   { rows, added, removed, editorial, unmatched, skipped },
  counts:  { nerf: 7, buff: 10, adjust: 2 },
  rows: [Change], added: [Card], removed: [Card], editorial: [Edit], unmatched: [Gap] }
```

`Change` giống hệt shape row trong `patch-notes.json` (`ref/slug/kind/table/name{en,vi}/icon/cost/day/dayDate/heading/field{en}/from/to/direction` + `note`) nên màn "Sắp ra mắt" dùng chung đúng một component với bài patch notes đã phát hành. **19 dòng / 9 tướng + 1 tộc hệ + 4 lõi** — ví dụ `Alistar Health 306/437/646 ⇒ 276/397/566`, `Warwick of the damage dealt 25% ⇒ 20%`, `Shopping Spree gold 6 ⇒ 7`; cộng `Heart of Steel` sinh mới và `Construct a Companion` / `Forge a Friend` bị bỏ.

Bốn quy tắc giữ cho board không bịa:

- **Số đi kèm đơn vị.** `10% ⇒ 12%`, không phải `10 ⇒ 12` — Riot cũng viết "230/310/450 AP". Giá trị theo sao giữ nguyên một chuỗi `306/437/646`.
- **Một dòng chỉ là dòng khi khung chữ khớp nhau** (mọi số thay bằng `#` thì hai bên giống hệt) **và cùng số lượng nhóm số**. Câu bị viết lại ("One, Two, Five!", Pandora's Items II) đi vào `editorial` kèm `from`/`to` nguyên văn cho người đọc quyết, không đoán.
- **Không có số đổi thì không có gì để công bố.** `50 %` → `50%` hay dấu chấm thừa là định dạng lại, nên `state='same'`; rule này đã cắt queue từ 9 xuống 1.
- **`statLine` của item bị loại hẳn**, chỉ diff `desc`: đó là chuỗi máy dựng, dấu `%` và `()` của nó dịch chuyển không theo game (Crownguard `20 (AP)` ở 18.5c, `20% (AP)` ở PBE → ra một "buff" giả).

Nhãn trường lấy từ chính chữ của Riot cạnh con số (`labelBeside`): cụm phía sau cho tới số tiếp theo, cắt giới từ treo ("Shield for 4 seconds" → `Shield`), fallback về cụm phía trước khi giá trị kết thúc dòng — và `direction` dùng lại đúng bảng polarity của parser patch notes (`directionOf`), không có bảng thứ hai.

Hai khoảng trống đã biết, ghi rõ để P3 quyết: (a) `Armor and Magic Resist Booster` / `Attack Speed Booster` đổi số thật (8 ⇒ 10, 6% ⇒ 8%) nhưng catalog 150 trang bị của `tft.json` không có loại Booster → nằm trong `unmatched`, có in cảnh báo nhưng không chặn pipeline; (b) Elderwood đổi ở `hiddenValues` (1.25 ⇒ 1.1) — feed không đặt số đó trong `desc` nên board không thấy; (c) nhãn tiếng Việt cho các dòng PBE chưa có nguồn chính thống, để UI xử lý ở P3.

## 5. UI

Route: `/[lang]/patches`, `/[lang]/patches/[patch]`, `/[lang]/patches/[patch]/from/[base]`; `generateStaticParams` theo đúng số patch đã biết, `dynamicParams = false` như mọi trang data; `revalidate = 86_400`. Nav: thêm vào nhóm `database` trong `components/nav.tsx` (ngay sau `economy`). `PatchBar` hiện có trở thành điểm vào: bản `patch` của nó link về `/patches/[current]`.

List: **một hàng một bản vá** (§7, làm theo khung của tftips nhưng bằng surface của TFTIQ), không phải lưới 3 cột. Mỗi hàng là một link: cột trái 132px chứa `18.5c` + ngày + chip `Latest` (một lần) hoặc `Micro patch · 18.5`, phần còn lại là `PatchStrip` — **một dòng cho mỗi chiều đổi**, mở đầu bằng chip đếm (`19 buffs`, đọc từ `rows` qua `countByCard`, chữ in thường bằng class `lowercase`) rồi tới dải icon 28px của từng thực thể, tối đa 12 ô một dòng, phần bị cắt gom thành `+N`; nhóm vượt 4 cùng loại vẫn gom thành chip đếm (`5 wisps`) **trừ `champion`** — cùng quy tắc với card TIÊU ĐIỂM (§5.1). Ô icon không kèm tên: tên là tooltip (`data-tip`), vì một hàng có tên sẽ cao gấp ba và không đọc được nữa. `PatchTile`/`cardGroups` nới từ `PatchArticleRow` sang `PatchRow` để list dùng lại đúng một implementation với bài viết, không có component "list-only" thứ hai.
Phía trên list là nhóm `Upcoming` / `Sắp ra mắt`: một panel nét đứt cho `18.6` với `PBE · 18.5c` + chip `Not final` / `Chưa chốt` và cùng một `PatchStrip` dựng từ `pbeCardRows(pbe)` (`added`/`removed` vào thẳng làm `direction`). Panel **đã là link** về `/[lang]/patches/18.6` (user chốt 03/11: "bổ sung trang chi tiết kể cả chưa chính thức") — nó vẫn giữ nét đứt để phân biệt với bản đã phát hành, và bài của nó tự nhận là bản xem trước (§5.3). Ngày viết dạng `27/10` thuần, không kèm thứ trong tuần.

Detail: card TIÊU ĐIỂM (§5.1), rồi **một hàng tab lọc theo loại thực thể** (§5.3), rồi các section. Diff render bằng hai class mới trong `globals.css` — `.diff-old` (mist, gạch chéo mờ) và `.diff-new` (số màu `--color-diff-easy` cho buff, `--color-diff-hard` cho nerf) — không lấy màu mới, vì palette-tokens test bắt mọi màu phải thuộc hai ladder đã có. `<select>` baseline vẫn chưa làm: nó là lớp UI trên dữ liệu đã có, không phải thứ bài này thiếu.

### 5.1 Bài viết patch notes và template admin sửa được

User chốt: mỗi bản vá là **một bài viết** mở đầu bằng card "TIÊU ĐIỂM / BẢN CẬP NHẬT {patch}" giống ảnh Riot (ba khối TĂNG SỨC MẠNH / GIẢM SỨC MẠNH / ĐIỀU CHỈNH, mỗi khối là dãy ô icon lục giác kèm tên tiếng Việt, và một ô gộp dạng "TĂNG SỨC MẠNH 9 NÂNG CẤP").

**Lưu trữ: dùng lại máy bài viết `guides` đã có, không mở bảng mới.**
- `guides` đã có `sections jsonb` + cặp `title_vi/excerpt_vi/sections_vi`, `validateGuidePayload`/`writeGuide`/`listGuides` ([apps/api/src/guides.ts:41](file:///Users/samuel/ai-projects/tft-comps/apps/api/src/guides.ts#L41)), CRUD sau `adminGuard` ([apps/api/src/index.ts:232](file:///Users/samuel/ai-projects/tft-comps/apps/api/src/index.ts#L232)), editor `components/admin/guide-form.tsx`, và `notifyRevalidate('guides')` đã nối vào write path (#157). Một bài patch notes = một row `guides` slug `patch-18-5`.
- Thêm cột `kind text NOT NULL DEFAULT 'guide'` theo đúng pattern idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` mà cột `cover` đã dùng ([apps/api/src/schema.sql:225](file:///Users/samuel/ai-projects/tft-comps/apps/api/src/schema.sql#L225)). `/[lang]/guides` lọc `kind='guide'` để bài patch notes không lạc sang mục hướng dẫn; `/[lang]/patches/[patch]` đọc `kind='patch_notes'`.
- `validateGuidePayload` hiện bắt `body` khác rỗng (`requireBody: true`). Nới ra: section có `rows` thì không buộc `body`, section không có `rows` giữ nguyên hành vi cũ để toàn bộ guide đang có không đổi nghĩa.

**Shape của `sections` (jsonb, mỗi phần tử một block) — đã chốt khác bản draft: không có trường `type`.** Hai loại block phân biệt được ngay bằng sự có mặt của `rows`, nên `type` chỉ là một trường thứ hai có thể khai lệch với nội dung thật. Block `quote` cũng bỏ: trích dẫn bên thứ ba không được chép vào sản phẩm, còn gạch đầu dòng thì `list` đã có.

```
{ heading, body: [paragraph], list? }        // block text — y nguyên shape guides đang dùng
{ heading, rows: [Row] }                     // block "Hàng đổi"; body có thể rỗng
Row = { ref: "TFT18_Caitlyn",                // khoá khớp tft.json → có icon + link entity
        slug: "caitlyn", kind: "champion|trait|item|augment|wisp|emblem",
        name: { en, vi? }, icon, cost,       // bản thân nó: thực thể bị `removed` thì catalog không còn
        field: { en: "Empowered Auto Damage", vi? },
        from: "190/285/470", to: "200/300/490",
        direction: "buff|nerf|adjust|added|removed",
        note?: { en },
        card?: "buff|nerf|adjust" }          // ghi đè ô TIÊU ĐIỂM, xem đoạn dưới
```

`Row` là `PatchRow` trong `@tftiq/shared/patch-notes` — cùng khế ước với `patch-notes.json` / `pbe.json` do crawler sinh, kèm `isPatchRow` để app từ chối row lệch shape ngay khi đọc.

**Card TIÊU ĐIỂM là dẫn xuất, không phải dữ liệu nhập.** Gộp toàn bộ `rows` của mọi block theo `direction`, rồi **tách tiếp theo `kind`** (`cardGroups` trong `@tftiq/shared/patch-notes`, khử trùng theo `direction|kind|ref`): mỗi ô là một khuôn mặt thật (icon từ `ref` qua `UnitHex`/`ItemTile`/`ItemHex` trong `components/ui.tsx` — trang bị là ô vuông, xem §5.6; tên dưới icon, link tới trang thực thể), mở đầu mỗi dòng là nhãn loại kèm số thực thể (`CHAMPIONS 11`). Vì nó tính từ `rows`, admin chỉ cần sửa hàng đổi là card tự đúng — không có trạng thái thứ hai để lệch. **Không còn ô đếm "Nâng cấp 10"** — user chốt 03/11 rằng chips đếm theo loại "khá chung chung và khó hiểu", nên card vẽ hết, chỉ cắt bằng trần `HIGHLIGHT_FACE_LIMIT = 8` khuôn mặt một dòng và in `+N` cho phần bị cắt (đo trên bài 18.5: card 1139px cao, hướng mạnh 1303px, bản chips đếm 495px). Trần gộp `stripMerges`/`STRIP_MERGE_LIMIT = 4` vẫn còn và giờ chỉ `PatchStrip` của trang list dùng — list cần một hàng gọn, card cần danh sách đọc được. Ngoại lệ đã đo trên bài 18.5: Riot xếp **Chim Mẹ** và **Vệ Binh** vào ô ĐIỀU CHỈNH dù hai dòng này có số giảm, nên Row có field ghi đè tường minh `card?: "buff|nerf|adjust"` — dẫn xuất từ `direction` khi vắng mặt (`cardBucketOf`), và `seed:patch-notes` không tự đặt nó. Ghi đè này là dữ liệu biên tập, không phải số máy đoán, nên nó thuộc phần admin/agent viết bài chứ không thuộc engine.

**Một ô đếm phải đọc đúng số nhiều của nó.** Bản 18.5b có đúng một dòng nerf, nên card ghi "1 Nerf" chứ không "1 Nerfs": `messages[lang].patches.directionsOne` là bộ số ít, và trang list chọn giữa hai bộ theo `counts[direction] === 1`. Tiếng Việt không chia số ít/số nhiều nên `directionsOne` vi trùng `directions`. Cùng quy tắc cho câu tóm tắt do máy viết trong `summaryFor` (`counted(count, one, many)`), và vì `mergePatchArticle` chỉ thay excerpt khi nó còn khớp từng byte với chuỗi do máy sinh, bản đã seed với chữ "1 nerfs" phải **xoá và seed lại** chứ không sửa đè được.

**Đường của agent:** crawler sinh `patch-notes.json` (§4), rồi một script `seed:patch-notes` dựng payload `guides` từ JSON đó (title/excerpt/sections en+vi, `kind='patch_notes'`, `published_on` = `datePublished` của Riot) và gọi thẳng `writeGuide` — cùng hình dạng với `seed:comps`/`seed:tiers` đã có. Chạy lại chỉ ghi đè phần máy sinh, không xoá bài admin đã tay sửa: so `updated_at` với `rev` của Riot, nếu admin sửa sau lần sync cuối thì in diff và bỏ qua, không im lặng đè.

**Editor admin:** `guide-form.tsx` thêm một loại block "Hàng đổi" — chọn thực thể từ `tft.json` (ô tìm kiếm theo tên en/vi, để icon luôn đúng), nhập field/cũ/mới, chọn chiều. Đây là phần việc lớn nhất của tính năng. **Quyết định (đã chốt thay vì chờ): đợt đầu `rows` do agent sinh, editor chỉ đọc**; admin sửa được toàn bộ phần text bằng block text mà form đã có, còn ô chỉnh `rows` tách sang P3b. Lý do: bài vá vẫn dùng được ngay khi `rows` chưa có editor, và block có `rows` đã có hình dạng ổn định để editor bám vào sau này.

### 5.2 Báo cáo hằng tuần — surface thứ ba, dựng sau khi có chuỗi số

Bề mặt này không phải patch notes: nó trả lời "bản vá vừa rồi **có đạt kỳ vọng không**", nên nó cần hai mốc thời gian chứ không cần Riot (§2.3, §2.4).

- **Định dạng học từ datatft** (chỉ bố cục, không lấy câu chữ): tổng quan môi trường → tộc hệ/nhóm mạnh và yếu → **từng thay đổi của bản vá trước được gắn nhãn đạt / chưa đạt / ngoài dự đoán** → lõi và trang bị. Cái hay nhất là mục thứ ba: nó biến patch notes thành một vòng lặp có bằng chứng, đúng thứ mà app ta có dữ liệu để làm còn blog thì không.
- **Lưu trữ: vẫn là `guides`, `kind='weekly_report'`.** Không bảng mới, không route dữ liệu mới — block `rows` tái sử dụng cho mục "đổi gì trong tuần", còn số liệu so tuần là block text thường do người viết bài đọc từ snapshot. Đường agent: `seed:weekly-report` dựng khung bài (danh sách thay đổi của bản vá gần nhất + bảng tier hai mốc) để biên tập viên điền nhận xét, thay vì bắt họ gõ lại số.
- **Điều kiện chạy được:** `snapshots/{YYYY-MM-DD}/` trong crawler phải có **≥2 mốc** (§2.4). Mốc đầu là `2026-11-02` (tên theo UTC, tức rạng sáng 03/11 giờ VN); chưa có UI nào cho tới khi có tuần thứ hai.
- **Route:** `/[lang]/reports` (list) và `/[lang]/reports/[slug]`, dùng lại renderer bài viết của patch notes; `revalidate = 86_400`, `noindex` cho trang list nếu sau này số bài vượt tầm kiểm soát SEO.

### 5.3 Tab lọc theo loại thực thể (03/11)

User chốt: "dưới phần highlight phải chia tab các loại như champions, trait, items, augments, wisps, encounters. Tab nào không có thông tin thay đổi thì hiện 0 và disabled."

`apps/web/components/patch-kind-tabs.tsx` là một client component tối thiểu: nó chỉ giữ `active` và đổi thuộc tính `data-kind-filter` trên khối bao quanh bài. **Toàn bộ nội dung đã nằm trong HTML prerender** — tab không render lại rows, không import `lib/tips` hay `tft.json` vào bundle, và không có hydration flash hay giật scroll (bài học #191). Con số trên tab là **số thực thể** (`countEntities`, khử trùng theo `ref`), khác với chip đếm trên card là **số dòng** — 20 augments nhưng 23 dòng bảng.

Cơ chế ẩn hiện là 7 rule CSS trong `globals.css`, không phải JS DOM:

```
[data-kind-filter='champion'] :is(li:not([data-kind='champion']),
                                 [data-kind-block]:not(:has([data-kind='champion']))) { display: none; }
```

`li[data-kind]` do `PatchChangeTable` gắn trên từng **mục thực thể** (§5.5), `section[data-kind-block]` bao mỗi heading của bài, nên **một block mà toàn bộ hàng thuộc loại khác biến mất cùng tiêu đề của nó** — điều này giữ được các heading do Riot viết (bài vi là `TỘC/HỆ`, `TINH LINH`), thứ mà ba test e2e đang dùng làm bằng chứng bản dịch. Vì block bị ẩn vẫn còn trong DOM, `:first-child` không còn đáng tin cho viền phân cách nên hàng dùng `border-b … last:border-b-0`.

Tab có `count === 0` thì `disabled` + nét đứt + `opacity-40`, và **vẫn hiện** để người đọc biết "loại này không đổi" thay vì đoán trang quên chưa xem. `encounter` chưa có dòng nào ở bất kỳ bản nào (bề mặt diff của crawler chỉ chạm champion/trait/augment/item) — tab đó tồn tại theo đúng chỉ thị của user, như một lời hứa về phạm vi chứ không phải một bộ lọc đang có dữ liệu. Bài mở ở loại đầu tiên có row (`ENTITY_KINDS` theo thứ tự), không phải mặc định hard-code.

### 5.4 Trang chi tiết của bản chưa phát hành (03/11)

`/[lang]/patches/18.6` là trang thật, dựng từ `pbe.json` bằng **cùng engine** với bài đã phát hành: `pbeCardRows(pbe)` → `cardGroups` → card TIÊU ĐIỂM, rồi tab và bảng đổi. Khác biệt chỉ ở những thứ bài này không được phép giả vờ có:

- **Không link nguồn Riot.** Riot chưa công bố, nên trích dẫn một bài không tồn tại là bịa (`tests/patches.spec.ts` đếm `a[href*="leagueoflegends"]` phải bằng 0).
- **Không tên nguồn thứ ba.** `pbe.json` có `source.provider` của catalog bên ngoài; copy công khai không được lộ nguồn fetch, nên trang chỉ in `PBE · 18.5c` (baseline để người đọc tự hiểu độ lệch) + `Not final` / `Chưa chốt` + `t.pbeSub`.
- **Không đoạn `note`.** Note là văn bản biên tập của nguồn, không chép nguyên văn vào sản phẩm → `.map((row) => ({ ...row, note: undefined }))`.
- **Block "chỉ đổi mô tả"** (`t.descOnly` / `Chỉ đổi mô tả`) dựng từ `pbe.editorial`: thực thể có mặt trên máy chủ thử mà catalog chưa từng có, không có số trước/sau để so. Nó mang `data-kind` của chính nó nên vẫn theo đúng tab.
- **`added`/`removed` không có cặp số** → hàng in chip chiều đổi (`Addition` / `Removal`, CSS hạ thành thường) thay vì `old ⇒ new`.
- Chân trang nói thẳng bản chưa phát hành và bài của Riot sẽ thay nó khi công bố (`t.pbeFoot`).

`generateStaticParams` cộng `pbe.patch` vào danh sách slug (dedupe bằng `Map` theo `lang|patch`), `sitemap.xml` cũng vậy, nên 18.6 được index như mọi bản khác. Khi Riot phát hành, entry `patch-notes.json` thắng và bản xem trước tự biến mất khỏi route — không có trạng thái thứ hai để dọn.

### 5.5 Một thực thể một mục, N dòng thay đổi (03/11)

User chốt: "gom các thay đổi của cùng 1 tướng vào chung trong 1 mục, không đưa thành 2 mục — ví dụ 2 dòng thay đổi cho cùng 1 tướng thì gom thành 1 mục Kha'Zix với 2 vòng thay đổi."

`PatchChangeTable` (`apps/web/components/patch-rows.tsx`) khử trùng theo `ref` **trong từng block** bằng `Map` rồi giao mỗi nhóm cho `ChangeEntry`. User chốt tiếp (03/11): "cho mỗi thay đổi thành 1 row riêng nằm dưới nhóm thực thể, hiện tại đang bị lệch dòng giữa title và value" — nên mục không còn là N dòng dồn vào một hàng nữa mà là **một hàng tiêu đề + N hàng thay đổi**:

- Hàng tiêu đề: ô ảnh (`ROW_TILE`) rồi tên thực thể, một link cho icon và một cho tên.
- Mỗi thay đổi là một `<div data-change-line>` riêng: field ở trái, cặp số `old ⇒ new` ở phải, tất cả thụt vào `LABEL_INDENT = ROW_TILE + 10` để field **bắt đầu đúng cột với tên** và mọi giá trị **kết thúc đúng một mép**. Đã đo trên mục Alune ở 1440: `name.x = field.x = 323.0` cho cả ba dòng, mép phải của `.diff-new` là 1157.0 cho cả ba.
- Hàng dùng `flex-wrap`, không `truncate`: ở 390px một field dài ("Base Damage") không còn bị cắt thành "Bas…" vì cặp số dài — nó tự chiếm một dòng, giá trị xuống dòng sau. Đo lại: overflow ngang 0px ở `en/18.5c`, `vi/18.5`, `en/18.5`.
- `data-kind` nằm trên `<li>` chứ không trên từng dòng vì tab lọc trả lời cho cả thực thể. Vì vậy các hàng thay đổi **phải là `div`**: rule CSS của tab ẩn mọi `li` không đúng loại, và một `li` lồng trong mục sẽ bị ẩn theo.

Hai quyết định có chủ ý:
- **Đếm theo `ref` toàn block, không theo adjacency.** Dòng ghép "Azir / Kha'Zix" được push xen kẽ (mỗi field một hit), nên gom kiểu "dòng liền kề cùng tên" sẽ tách một thực thể thành bốn mục. Gom theo `Map` thì thứ tự xuất hiện đầu tiên giữ nguyên, đúng thứ tự Riot viết.
- **`note` là một dòng riêng dưới tên, không nối vào field đầu.** Note dài tới 119 ký tự ("Mana lock now ends when the Tiny Beaks start to despawn…") nên nối vào field thì bị `truncate` cắt mất; để nó tự xuống dòng trong một hàng 11px thì đọc hết, và nó vẫn chỉ in một lần cho cả mục.

Tổng số dòng `⇒` trên trang **không đổi** — chỉ tên và icon in một lần thay vì N lần. Số đo 03/11 trên bản 18.5: 70 dòng → **49 mục** (champion 27→16, augment 23→20, trait 10→6, wisp 7→5, item 3→2); 18.5c: 6 dòng → 4 mục, Kha'Zix và Bụi Gai Đỏ mỗi tướng 2 dòng. Test khoá lại đúng hình dạng đó: `patches.spec.ts` đếm `li[data-kind="champion"]` = 16 nhưng `.diff-new` trong đó = 27; mục Alune phải có 3 `.diff-new`, đúng 2 link tới `/en/champions/…`, 3 `[data-change-line]` thẳng cột với tên và chung một mép phải.

### 5.6 Trang bị là ô vuông, không phải hex (03/11)

User chốt: "trang bị không cần dùng UI hex vì sẽ bị khuất ảnh, dùng ô vuông bo tròn giống như UI ô trang bị ở chỗ khác." `PatchTile` là ô dùng chung cho cả ba bề mặt (card TIÊU ĐIỂM, bảng đổi, dải icon ở list), nên một nhánh `kind === 'item'` → `ItemTile` sửa được cả ba cùng lúc: ảnh trang bị về nguyên bản vuông với ring `rounded-[22%]`, đúng ô mà trang item và board comp đang dùng. Hex vẫn giữ cho champion (rim là bậc), trait (màu tộc hệ) và wisp/emblem.

Đây là chỗ radiant lộ rõ nhất: góc của ảnh Ánh Sáng chính là viền phát sáng, hex cắt đúng phần đó. Đo trên `/en/patches/18.5`: hai mục item có **0** `.hex` và **2** ô vuông; dải `18.5c` trên list tăng lên 4 ảnh và một trong số đó là `tft5-item-handofjusticeradiant.png`.

## 6. Kiểm chứng

- Unit cho parser (`crawler/test/patch-notes.test.mjs`): fixture là `richText.body` thật của 18.5, ép từng nhánh — dòng nhiều số (`250/345/500 ⇒ 230/310/450`), dòng phần trăm, dòng chữ không số (`Wisp Filtering`), tên thực thể kèm bậc (`Elderwood (9)`), tên gộp (`Azir/Kha'Zix`), mục `MID-PATCH UPDATE` nhiều ngày, entity không khớp `tft.json` (phải rơi vào bucket `unmatched`, không được âm thầm bỏ).
- Unit cho `patchOf`/`isMicro`/`counts`, bảng polarity, và **tỷ lệ khớp tên** (đặt ngưỡng tối thiểu cho 18.4 và 18.5, là hai bản dens nhất).
- `npm run test:web` phải còn xanh `palette-tokens.test.ts` với hai class diff mới; `npm run typecheck` cho cả hai workspace.
- e2e Playwright: `/en/patches` và `/vi/patches` render, chuyển baseline đổi nội dung mà không vỡ scroll, locale switch giữ nguyên vị trí (bài học #191: `scrollAtRest` phải chờ glide + settle xong mới đo).
- Nghiệm thu bằng số: bản 18.5 phải dựng ra đúng các dòng đã đối chiếu tay trong bài Riot — Kha'Zix `250/345/500 ⇒ 230/310/450` và `280/390/590 ⇒ 250/350/530`, Brambleback `5% ⇒ 4%` — cả ở nhãn en lẫn vi.
- Nghiệm thu theo phạm vi đã chốt (§1.1): bản **18.4** phải dựng ra `120 dòng "⇒" trên 80 thực thể, 20 nhóm` và bản **18.5** là `84 dòng trên 54 thực thể, 11 nhóm` (đo trực tiếp trên JSON đã tải, §2.1). Hai con số này là giới hạn dưới: thiếu một dòng nghĩa là parser rơi vào nhánh `unmatched`, không được âm thầm bỏ.
- Kiểm tra chéo PBE (không dùng làm nguồn): bản tin PBE ngày 03/10 của datatft và diff tftips `pbe − 18.5c` cho cùng một dòng Warwick `230/345/535 ⇒ 215/325/500` (§2.2, §2.3) — hai nguồn độc lập khớp số là dấu hiệu pipeline PBE của ta không lệch.

## 7. Roadmap (theo scope đã chốt §1.1)

- **P0 — fetch trong crawler, giới hạn 18.4 → hiện tại + PBE.** `scripts/fetch-patch-notes.mjs`: đọc sitemap en-us + vi-vn, tải JSON bài `patchNote` của **18.4 và 18.5** (micro patch nằm trong chính bài 18.5, phát hiện bằng sha256 body), và `tftips /api/catalog/pbe/{en,vi}/{entity}` cho màn sắp ra mắt. Lưu `.cache/riot-patch-notes/{patch}/{locale}.json`.
- **P0b — đã xong (03/11):** `npm run snapshot` lưu `.cache/snapshots/{YYYY-MM-DD}/` (19 file, 3,78MB ⇒ 0,49MB gz) và được nối vào cuối `data:pull` / `comps` / `patches`. Từ giờ mỗi lần harvest là một mốc; báo cáo tuần cần **hai mốc**, tức khoảng hai tuần nữa.
- **P1 — đã xong (02/11):** parser + join + polarity + fixtures, output `packages/shared/data/patch-notes.json` cho `18.4` (95 dòng) và `18.5` (83 dòng), khớp tên 99%/88%. **P1b — đã xong:** board "Sắp ra mắt" là file riêng `packages/shared/data/pbe.json` (§4.1), không nằm trong `patch-notes.json` nữa — nó là dữ liệu chưa chốt nên không được lẫn vào bài viết của bản đã phát hành.
- **P2 — bài viết + UI**: cột `kind`, nới `validateGuidePayload` cho block có `rows`, component card TIÊU ĐIỂM (dẫn xuất từ `rows`, có `card` override), route `/[lang]/patches` và `/[lang]/patches/[patch]` theo hình list/detail của tftips (§3), nav, metadata, sitemap, e2e. `rows` đợt đầu do agent sinh (§5.1).
  - **P2a đã xong (03/11).** Cột `kind` (`guide` | `patch_notes`, `NOT NULL DEFAULT 'guide'`, CHECK `guides_kind_values`, index `(kind, published_on DESC)`) + đường đọc phân loại: `GET /api/guides` mặc định chỉ trả `guide`, `?kind=patch_notes` trả kệ kia, `?kind=all` trả cả hai, `?kind=` giá trị lạ đọc như `guide`; tra theo slug bỏ qua kind vì slug là khoá chính. `writeGuide` ghi `kind` ở INSERT và **không** đổi nó khi UPDATE vì form admin không có ô kind — một lần lưu không được phép phân loại lại bài. `@tftiq/shared/patch-notes` (`PatchRow`, `isPatchRow`, `cardBucketOf`, `countByCard`) là khế ước giữa crawler và app. Bằng chứng: test SQL-shape chạy ở mọi nơi, test ghi/đọc thật asserting kệ thường không lẫn bài `patch_notes` + DB từ chối kind ngoài CHECK; probe `:4000/api/guides` cho 4 giá trị `kind` ra đúng 28/28/0/28.
- **P2b đã xong (03/11).** Block `rows` đi vào payload: `validSections` nhận `rows: PatchRow[]` (chấp nhận cả block vừa có `body` dẫn vừa có bảng), bỏ bắt buộc `body` khi block có `rows`, từ chối `rows` rỗng và từng row lệch shape qua `isPatchRow`; block thường giữ nguyên hành vi cũ nên 28 guide đang có không đổi nghĩa. `writeGuide(guide, { sync })` là đường cho seed: `sync=true` ghi thêm `title_vi/excerpt_vi/sections_vi` bằng `COALESCE` để một lần sync không mang tiếng Việt vẫn không xoá bản dịch đang có. `GuideSection` giờ import từ `@tftiq/shared/patch-notes` thay vì khai lại trong API. Kiểm chứng: `apps/api/src/guides.test.ts` 11 test (7 pure + 4 DB) xanh, `npm test` = 509/509, typecheck cả workspace sạch.
  - **Chưa làm trong P2a, dời sang P3b:** `/admin/guides` vẫn chỉ liệt kê `kind=guide`, nên bài patch notes chưa hiện trong danh sách admin. Khi làm editor cho `rows` phải cho admin thấy cả hai kind và nút "View" phải trỏ `/patches/[slug]` chứ không phải `/guides/[slug]`.
- **P2c đã xong (03/11).** `apps/api/src/patch-notes-article.ts` là bộ dựng bài: `patchArticle()` biến một `PatchNote` trong `patch-notes.json` thành bài `guides` (mỗi nhóm Riot một block `rows`, excerpt là chuỗi đếm do `countsOf` + `summaryFor` viết cho cả en lẫn vi), `mergePatchArticle()` giữ ranh giới số/văn — chạy lại thì bảng thay, block văn và mọi trường admin sửa còn nguyên, `syncPatchNotes()` báo `written/unchanged/skipped/hijacked` và từ chối ghi đè một slug không do nó sinh. `npm run seed:patch-notes` đã ghi `patch-18-4` (95 dòng) và `patch-18-5` (83 dòng), mỗi bài cả kệ en lẫn vi qua `writeGuide(..., {sync:true})`. Bằng chứng: 10 test trong `patch-notes-article.test.ts` xanh; `--dry-run` sau khi seed in `0 written, 2 already matching` nên lần chạy thứ hai không ghi gì.
- **P2d đã xong (03/11).** Route + card + móc dẫn đường, không thêm bảng nào:
  - `/[lang]/patches` ([apps/web/app/[lang]/patches/page.tsx:32](file:///Users/samuel/ai-projects/tft-comps/apps/web/app/%5Blang%5D/patches/page.tsx#L32)) — một thẻ một bản, newest first, chip "Latest" chỉ ở thẻ đầu; các ô đếm `19 buffs / 17 nerfs / 34 adjustments` đọc thẳng từ `rows` bằng `countByCard` chứ không lưu một bản tóm tắt thứ hai có thể lệch.
  - `/[lang]/patches/[patch]` ([apps/web/app/[lang]/patches/[patch]/page.tsx:23](file:///Users/samuel/ai-projects/tft-comps/apps/web/app/%5Blang%5D/patches/%5Bpatch%5D/page.tsx#L23)) — `generateStaticParams` chỉ sinh slug thực sự có bài, `dynamicParams=false` nên `/en/patches/18.1` là 404 (đã đo). URL mang số Riot in (`18.5`), `slugToPatch`/`patchToSlug` là cây cầu duy nhất và có unit test vòng đổi, kể cả `18.5c`.
  - Card TIÊU ĐIỂM ([apps/web/components/patch-rows.tsx:46](file:///Users/samuel/ai-projects/tft-comps/apps/web/components/patch-rows.tsx#L46)) dẫn xuất 100% từ rows: một loại có ≤4 thực thể thì vẽ hex + tên (2 dòng, không cắt giữa chữ), vượt ngưỡng thì gom thành một ô đếm theo đúng cách Riot làm ("5 wisps", "14 augments") — riêng `champion` không bao giờ gom (xem §5.1). Màu chỉ đến từ `DIRECTION_TONE` — màu là dữ liệu nên không có token palette mới; class `.diff-old`/`.diff-new` reuse các biến đã có.
  - Nav "Database", breadcrumb, `sitemap.xml` và `lib/revalidate.ts` (kind `guides` nay purge thêm `patches` + `patches/[patch]`).
  - **Lệch kế hoạch còn lại (đã đảo một chỗ):** (1) `PatchBar` giờ vào **thẳng bài của bản mà client báo** (`meta.source.patch = 18.5c`) khi `patch-notes.json` có entry đó — điều kiện 404 mà P2d lo không còn, vì micro patch đã có bài riêng; khi nào chưa có bằng chứng cho một version thì bar vẫn về list. (2) chưa làm `<select>` baseline và chip lọc theo loại thực thể — vẫn là lớp UI trên dữ liệu đã có.
  - Kiểm chứng: typecheck sạch, `test:web` 64/64 (mới: `apps/web/lib/patches.test.ts` cho slug/entityHref/textOf/rowsOf/tone), `test:server` 519 test (2 fail ở `membership-schema.test.ts` là deadlock flake đã biết — chạy lẻ từng file thì xanh), Playwright `apps/web/tests/patches.spec.ts` phủ list/detail/thẻ đếm/404/vi heading/locale switch/sitemap/không tràn ngang, screenshot 1440 + 390 cho `/en/patches`, `/vi/patches`, `/vi/patches/18.5`.
- **Micro patch đã xong (03/11) — hai chỉ thị của user.** (1) "patch notes chia ra các bản 18.5a, 18.5b, 18.5c chứ không gom chung chỉ 1 bản 18.5": crawler tách bằng chứng (§4.2), `patch-notes.json` có **5 entry** (`18.5c/18.5b/18.5/18.4b/18.4`, `latestPatch = 18.5c`), `seed:patch-notes` dựng 5 bài × 2 locale, và `/[lang]/patches/18.5c` là một trang thật. (2) "highlight nên list rõ ảnh tướng buff, nerf": `cardCollapses` miễn trừ `champion`.
  - App đọc entry micro mà không thêm cột nào: `slugToPatch`/`patchToSlug` đã round-trip chữ cái, `generateStaticParams` lấy slug từ chính các bài có trong DB, bài `mid_patch` in nhãn `Giữa bản vá 18.5` / "Mid-patch update of 18.5" (`t.mid`), và ngày của block `h3` trở thành ngày của bài — `18.5c` in `October 27` ở en, `27/10` ở vi, `18.5` không còn mang dòng 27/10 nữa.
  - Số liệu sau khi tách (đo từ payload, không phải ước): `18.5c` 6 dòng (2 nerf, 4 adjust) · `18.5b` 7 dòng (1 nerf, 6 adjust) · `18.5` 70 dòng (19 buff, 17 nerf, 34 adjust) · `18.4b` 26 dòng · `18.4` 69 dòng. `articleArrows` vẫn 84/120 cho thấy không dòng nào mất khi cắt.
  - Kiểm chứng: `crawler` 95/95; app `typecheck` sạch, `test:server` 519/519, `apps/api/src/patch-notes-article.test.ts` 10/10, `apps/web/lib/patches.test.ts` 9/9 (thêm `cardGroups`: 11 tướng không gom, 5 wisp gom, 4 wisp không gom, Sivir xuất hiện một lần ở cả hai bucket; thêm block kiểm tra `patch-notes.json` — slug duy nhất, `base` của entry micro phải có bài, `dayDate` của micro lớn hơn `publishedAt` của bản gốc, ngày giảm dần). Playwright `patches.spec.ts` **11/11**: năm thẻ theo đúng thứ tự, card hotfix "1 Nerf"/"6 Adjustments", `/en/patches/18.5` có 21 ô tướng và không có ô "N champions", bài `18.5c` mang dòng `230/310/450 AP` mà bài `18.5` không còn, 404 cho cả `18.1` và `18.5a` (chưa có bằng chứng), bar dẫn thẳng vào `18.5c` rồi breadcrumb đưa về list, locale switch giữ `18.5c`, sitemap có `/en/patches/18.5c`, 390px không tràn ngang.
  - **Bẫy đã gặp:** build không prerender đủ 5 bài vì `backendJson` trong `generateStaticParams` ăn cache `.next/cache` viết từ trước khi seed — phải `rm -rf apps/web/.next` rồi build lại; sau đó `server/app/{en,vi}/patches/` có đủ `18.4 18.4b 18.5 18.5b 18.5c`.
- **List dạng hàng đã xong (03/11) — user chốt "A + mục Sắp ra mắt" và "không, chỉ tooltip".** Khảo sát bằng mock thật (`/tmp/mock-patches-list.mjs` dựng từ `patch-notes.json` + `pbe.json` và 214/214 ảnh thật, đo ở 1440 và 390) trước khi code, vì đây là lần đổi layout cả màn. Hình đã đổi, cách trưng bày thì học từ tftips (§3), còn bề mặt vẫn là TFTIQ: một hàng một bản, chip đếm của ta, hex của ta, không thêm tên dưới ô.
  - Số đo sau khi ship (đọc từ DOM của bản `next start`, không phải ước): list có **5 link**, **150 ô icon**, hàng `18.5c` 3 ảnh (2 khuôn mặt tướng), `18.5b` 1, `18.5` 34 (21 khuôn mặt tướng, buffs clip `+4`, adjustments clip `+2`), `18.4b` 18, `18.4` 28; panel PBE **20 ô, 0 link**. 390px không tràn ngang ở cả `en` lẫn `vi`.
  - `data-section="pbe-preview"` và `data-section="patch-list"` là hai móc để test bám vào; `patches.spec.ts` **12/12** (test mới: "a row shows which entities moved, not only how many"). Một bẫy đáng ghi: `Chip` lowercased bằng CSS nên DOM vẫn là `"19 Buffs"` — `getByText(..., {exact:true})` phải khớp DOM, không khớp thứ ta nhìn thấy.
- **P3 — màn "Sắp ra mắt" đã xong (03/11).** Bài PBE dựng từ `packages/shared/data/pbe.json` (§4.1) chứ không từ `patch-notes.json`, dùng lại đúng engine của bài đã phát hành (§5.4); panel list đã thành link. Phần "xếp theo bậc phí" của §2.3 chưa làm vì diff PBE chỉ phát hiện *có* thay đổi chứ không có thứ tự Riot viết — nó thuộc về ngày Riot công bố.
- **Detail page + tab lọc đã xong (03/11) — ba chỉ thị của user.** (1) trang chi tiết cho 18.6 dù chưa chính thức (§5.4); (2) card TIÊU ĐIỂM bỏ ô đếm theo loại, vẽ hết thực thể với trần 8 + `+N` (§5.1); (3) hàng tab lọc theo loại, loại 0 hiện 0 và disabled (§5.3). Số đo sau khi ship (đọc từ DOM của bản `next start`): bài `18.5` card 18 khuôn mặt trên 3 chiều đổi, `+3` ở buff champions và `+6` ở adjust augments; tab `champions 16 / traits 6 / items 2 / augments 20 / wisps 5 / emblems 0 / encounters 0`, mở ở `champion` với 27 hàng `li[data-kind="champion"]` và 0 hàng augment nhìn thấy, bấm `augments 20` còn 23 hàng augment và đúng một `h2` AUGMENTS. Trang `18.6`: 22 dòng, tab `champions 9 / traits 1 / augments 7`, bốn tab 0 disabled, 1 hàng `addition` + 2 hàng `removal`, block `Chỉ đổi mô tả` có Pandora, **0** link `leagueoflegends` và **0** lần lộ tên nguồn thứ ba. prerender: `server/app/{en,vi}/patches/18.6.html` có thật (141KB / 142KB).
  - Kiểm chứng: `typecheck` sạch, `test:web` **70/70** (thêm `countEntities`, `merged`, case "giữ thực thể của bucket đã gom"), `patches.spec.ts` **14/14** (3 test mới: highlight nêu tên thay vì đếm loại, tab lọc bài viết, trang xem trước của bản chưa phát hành), 390px không tràn ngang ở `18.5` và `18.6` cả en lẫn vi.
- **Ảnh Ánh Sáng + một thực thể một mục đã xong (03/11) — hai chỉ thị của user.** (1) *"map đúng ảnh cho trang bị ánh sáng (radiant) thay vì dùng ảnh trang bị thường"* → sửa ở tầng dữ liệu (§4), không phải CSS: `radiantEntity()` xuất từ `crawler/lib/patch-notes.mjs` là nguồn duy nhất của luật, `build-patch-notes.mjs` bỏ bản duplicate. (2) *"Gom các thay đổi của cùng 1 tướng vào chung trong 1 mục … gom thành 1 mục Khazix với 2 vòng thay đổi"* → `ChangeEntry` (§5.5).
  - Số đo: `patch-notes.json` có **4 dòng radiant** (`18.5c` Hand of Justice → `TFT5_Item_HandOfJusticeRadiant` cho dòng Radiant Omnivamp `30% ⇒ 25%`; `18.5` RADIANT ITEMS hai mục `TFT5_Item_AdaptiveHelmRadiant` + `TFT5_Item_BlueBuffRadiant`); tổng dòng và tỷ lệ khớp tên của mọi bản **không đổi** — đây là đổi *danh tính* thực thể, không phải thêm dòng. Gom mục ở `18.5`: **70 dòng → 49 mục** (champion 27→16, augment 23→20, trait 10→6, wisp 7→5, item 3→2); ở `18.5c`: 6 dòng → 4 mục.
  - Kiểm chứng: `crawler` `node --test test/patch-notes.test.mjs` **26/26** (4 test radiant mới: heading đổi danh tính, nhãn "Radiant …" đổi trong block nhiều ngày, **không có mục radiant trong catalog thì không được bịa** — gồm cả wisp có dòng "Radiant Mana Restored", và bất biến dữ liệu `row.icon` kết thúc bằng `/${row.slug}.png`); app `typecheck` sạch, `test:web` **70/70**, `patches.spec.ts` **14/14** (dải `18.5c` đi từ 3 ảnh lên 4 và phải có ảnh `tft5-item-handofjusticeradiant.png`; bài `18.5` có đúng 1 mục "Radiant Adaptive Helm" với 2 dòng `⇒` và 1 ảnh radiant của riêng nó; mục Alune 1 `li` nhưng 3 `.diff-new` và 2 link tướng), toàn suite Playwright **103/104** — fail còn lại là `header.spec.ts:125` (card trang chủ → `/vi/learn/champions` 307), có sẵn từ HEAD, ngoài phạm vi hai chỉ thị này.
  - **Bẫy đã gặp:** build đầu sau khi seed vẫn prerender ảnh trang bị thường vì `fetch-cache` giữ response `/api/guides` cũ — phải `rm -rf apps/web/.next/cache/fetch-cache` rồi build lại; `npm run start:api` ở root thiếu `--env-file-if-exists` nên fail SASL, dùng `npm run dev:api`.
- **Ô vuông trang bị + mỗi thay đổi một row đã xong (03/11) — hai chỉ thị tiếp theo của user trên chính bảng vừa ship.** (1) *"trang bị không cần dùng UI hex vì sẽ bị khuất ảnh, dùng ô vuông bo tròn giống như UI ô trang bị ở chỗ khác"* → `PatchTile` nối `kind === 'item'` vào `ItemTile` (§5.6), một nhánh sửa cả card, bảng và dải list vì ba bề mặt dùng chung ô này. (2) *"Gom thay đổi cùng một thực thể: cho mỗi thay đổi thành 1 row riêng nằm dưới nhóm thực thể, hiện tại đang bị lệch dòng giữa title và value"* → `ChangeEntry` đổi từ "N dòng dồn một hàng + ô đệm" sang "một hàng tiêu đề + N hàng `[data-change-line]`" (§5.5).
  - Số đo sau khi ship (đọc từ DOM của bản `next start`, không phải ước): 18.5 vẫn **49 mục / 70 cặp `diff-old`+`diff-new`** trên cả en lẫn vi, `li` không có `data-kind` trong bảng = **0** (các hàng thay đổi là `div` — nếu là `li` thì rule của tab sẽ ẩn chúng); mục Alune có `name.x = field.x = 323.0` và mép phải `.diff-new` = 1157.0 cho cả ba dòng; hai mục item ở 18.5 có **0** `.hex` và **2** ô `rounded-[22%]`; 390px overflow **0px** ở `en/18.5`, `vi/18.5`, `en/18.5c`, và field "Base Damage" in đầy đủ thay vì "Bas…".
  - Kiểm chứng: `typecheck` sạch, `test:web` **70/70**, `patches.spec.ts` **14/14** với ba assertion mới (cột thẳng hàng của Alune, `0 .hex` + `2` ô vuông trong `li[data-kind="item"]`, field không bị cắt ở 390px), toàn suite **103/104** — fail duy nhất vẫn là `header.spec.ts:125` có sẵn từ HEAD.
  - **Bẫy đã gặp:** `boundingBox()` trong Playwright trả `Box | null` nên phép đo cột phải guard trước khi trừ; `next build` type-check cả thư mục `tests/` nên lỗi này hiện ở build chứ không ở `npm run typecheck`.
- **Tách nhãn "Patch" khỏi cửa sổ stats (04/11) — chỉ thị của user: chip trên navbar và bar ở các trang vẫn in `18.5c` trong khi game đã 18.6.** Refresh dữ liệu không sửa được: MetaTFT `units_distribution?queue=1100&days=7&patch=current` hôm nay vẫn trả `patch "18.5" + b_patch_version "c"` (17.670.683 trận). `lib/data.ts` thành hai số — `patch.version = patch-notes.json.livePatch` (bản Riot đã phát hành, fallback `meta.source.patch`) cho nav chip / PatchBar / con dấu trên guide cover / `/admin`, còn `patch.stats = meta.source.patch` chỉ đi kèm chỗ có số trận: hint "số liệu 18.5c" dưới ô *Số trận được phân tích* của trang chi tiết trang bị, chip `Patch số liệu` và dòng nguồn của `/tierlist/map`, dòng nguồn của `/item-priority`. `/admin` đọc `patch.version` từ web thay vì `compsData.patch.version` (API vẫn trả window stats qua `patchLabel()`, và nó được hiển thị tách riêng trong hint).
  - Kiểm chứng: `typecheck` sạch, build lại `@tftiq/web`, `patches.spec.ts` **14 pass / 1 skip** (bar đổi sang href `/en/patches/18.6` dựng từ `livePatch`; test mới "chrome names the release and the numbers name the window they cover" so `livePatch` ở `[data-section="nav"]` với `patch ${statsPatch}` ở `main`, cả hai đọc từ artifact nên vẫn đúng khi MetaTFT bắt kịp), items/header/guides/catalog/admin **22/22**. Đo trên `next start`: `/en/augments` in `href="/en/patches/18.6"`, `/en/items/tft-item-deathblade` in `18.5c data` và `/vi` in `số liệu 18.5c`, `/en/tierlist/map` giữ `patch 18.5c · queue 1100`.
- **P3b — ô chỉnh `rows` trong `guide-form.tsx`** + mục "comp nào bị ảnh hưởng" (nối `comp_units`/`comp_items`).
- **P4 — báo cáo hằng tuần** (§5.2): `/[lang]/reports` + `kind='weekly_report'` + `seed:weekly-report` dựng khung từ hai snapshot. **Chỉ làm sau khi P0b có đủ hai mốc.**
- **P5 — wisps/encounters** (Riot đã viết sẵn mục WISPS trong bài; 18.4 có `WISPS` 8 thực thể, 18.5 có 14).

## 8. Rủi ro đã biết

- **Parser dính quy ước markup của Riot.** Bài patch notes không có `data-*`, chỉ có class (`change-indicator`, `change-detail-title`, `content-border`) và chữ `⇒`; Riot đổi cách trình bày là parser im lặng sai. Giảm rủi ro: fixture thật cho cả 5 bản Set 18 + build fail toạ khi một bản có `h4` nhóm mới mà parser không nhận ra, và luôn giữ `unmatched` nổi lên trong log chứ không âm thầm bỏ.
- **Khớp tên thực thể là chỗ dễ gãy nhất.** Riot dùng tên hiển thị ("Brambleback", "Elderwood (9)", "Adaptive HelmMana Regen" — hai tên dính nhau do markup), còn `tft.json` nối bằng `name`/`slug`. Đo tỷ lệ khớp từng bản trước khi tin số; phần không khớp đi vào hàng đợi biên tập chứ không suy đoán.
- **PBE phụ thuộc vào một trang thứ ba.** Nguồn duy nhất chạy được là catalog của tftips — không chính thức, có thể đổi route hoặc bỏ khoá `pbe` bất cứ lúc nào. Giảm rủi ro: màn "Sắp ra mắt" tự ẩn khi fetch fail (không dựng bài rỗng), và mọi ô số trên đó đều mang chip "PBE · chưa chốt" để người đọc không hiểu là cam kết.
- **Ghép bài patch notes vào bảng `guides` là con dao hai lưỡi.** Cùng một hàng đợi biên tập, cùng `/admin/guides`, cùng `notifyRevalidate('guides')` — nhưng nếu quên lọc `kind`, bài patch notes hiện lẫn vào danh sách hướng dẫn và ngược lại. Buộc `CHECK (kind IN ('guide','patch_notes'))` và một test API rằng `/api/guides` không bao giờ trả bài `patch_notes`.
- **`writeGuide` cố ý chỉ ghi cột `*_vi` lúc INSERT** ([apps/api/src/guides.ts:75](file:///Users/samuel/ai-projects/tft-comps/apps/api/src/guides.ts#L75) — "admin saves (English) keep them"): `ON CONFLICT DO UPDATE` không đụng `sections_vi`. Với admin lưu tay thì đúng, nhưng với bài do agent sync lại mỗi lần Riot sửa giữa chu kỳ thì bản vi sẽ đóng băng mãi ở lần tạo đầu. Cần một cờ `sync` riêng (ghi cả vi) thay vì đổi hành vi cho mọi save.
- Một số mô tả chứa số không phải stat (hex, "% per hex", "3 hex radius"): nếu token hoá mọi số sẽ ra buff giả. Polarity table bắt buộc đi kèm danh sách field bị loại.
- **Số lượng trang prerender.** `generateStaticParams` cho tổ hợp `/from/` là 5 bản × 4 baseline × 2 locale ≈ 40 trang; tăng build time nhưng không có rủi ro page weight lúc chạy như tftips (724KB SSR của họ là do payload họ nhúng cả snapshot, ta chỉ nhúng rows đã parse).
- Chi phí SEO: route `/from/{base}` tạo nhiều URL với nội dung trùng; chỉ index canonical default, `noindex` cho tổ hợp `/from/`.
