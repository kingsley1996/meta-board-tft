# SHRINE-BADGE-FRAMES — Khung cho vận và danh hiệu

Docs trước, **chưa code**. Mốc code: `16d4246` (2026-11-06). Đây là deliverable của ô **C**
("mở khoá hiển thị theo vận — cần duyệt mock") trong `SHRINE-LADDER.md §9`.

Việc được giao (2026-11-06, nguyên văn): *"tìm asset các khung danh hiệu để trang trí và thể hiện
các cấp độ danh hiệu game để thu hút user"*. Hai hỏi phải tách ra, và doc này trả lời cả hai:

1. Có asset khung nào ngoài kia dùng được thật không (licence **và** style)?
2. Khung phải *thể hiện* điều gì để người chơi nhìn là biết bậc, trước khi đọc chữ?

## 1. Khảo sát nguồn asset — tất cả mở được hôm nay, chép nguyên văn chữ licence

| # | Nguồn | Bằng chứng | Hình hài thật | Kết |
|---|---|---|---|---|
| 1 | **Kenney UI Pack** — `kenney.nl/assets/ui-pack` (curl, HTTP 200) + gương `kenney-assets.itch.io/ui-pack` (curl, HTTP 200) | trang kenney ghi nguyên văn `License Creative Commons CC0`, `Files 430×`, tags `button panel slider interface`; trang itch ghi nguyên văn: "License: **CC0 1.0 Universal**. You're allowed to use these game assets in any project including commercial ones. There's no need to ask permission before using these and **giving attribution is not required** (but is appreciated!)" | ảnh preview chính main `sample.png` (918×515): panel phẳng bo góc to, tab, slider, sao "Level 30", "Your reward 10,000 PTS" — đúng chất cửa hàng game phương Tây | ** Licence sạch nhất, style sai rõ ràng.** PNG panel kích thước cố định ⇒ không co giãn theo chữ, mờ ở 24px; "cửa hàng game hiện đại" không cùng họ với `--gold/--cream` của chùa. Chỉ đáng mượn nếu cần gấp một khung modal chữ nhật. |
| 2 | **game-icons.net** | trang tác giả ghi nguyên văn `Authors Lorc, Delapouite & contributors License CC BY 3.0`. **URL SVG thô đã dò ra** (không phải đoán): `https://game-icons.net/icons/ffffff/transparent/1x1/lorc/<name>.svg` — `laurel-crown.svg` trả 200, 5.646 B, `viewBox="0 0 512 512"`, một path `fill="#fff"` trên nền trong suốt ⇒ tint bằng CSS filter được. Pattern lấy từ chính `src` của trang icon (`/icons/ffffff/000000/1x1/lorc/thorny-vine.svg`), còn `1x1/lorc/<name>.svg` là **404** | glyph 1 màu, nét dày và "người làm nghề" hơn hẳn glyph tự vẽ | **Hợp làm hoa văn *trong* khung, không hợp làm khung.** CC BY ⇒ bắt buộc ghi công, mà repo **chưa có surface credit nào cho asset chùa**. Chỉ chọn nếu chấp nhận mở một trang credit. |
| 3 | **OpenGameArt** | `curl` với browser-UA mới trả 200 (WebFetch bị 403); tìm `"ornate frame"` / `"frame"` chỉ trả về trang art-challenge và mục không liên quan; kho lớn nhất liên quan: *Public Domain Pack* (Drummyfish, 24-05-2018) `License(s): CC0`, 94 mục khắc gỗ cũ | tags `portraits architecture animals font` — **không có mục khung nào** | **Cụt.** Không có frame CC0 ở đây; đừng ghi nguồn này vào docs sau. |
| 4 | **Wikimedia Commons** (API `api.php`, đọc field licence *từng tệp*) | `Burns' popular songs - title frame.png`, `The Melodist - Title frame.png`, `Frame, title page of European Elegies (1928).png` → `Public domain`; hoa văn Á Đông: `Plate with Cloud Pattern - ABDMS024827.jpg` → `Public domain`, `Western Zhou Bronze Bu with Cloud & Thunder Pattern.jpg` → `CC0`, `Ruyi motifi - Bitki Tabani cizimi.svg` → `CC BY-SA 4.0` | ảnh quét/PDF của sách và đồ đồng | **Có thật và sạch**; cùng hàng với hàng 6 về chất Á Đông nhưng *thô* hơn — Commons là ảnh quét của sách/đồ đồng, chưa ai tách thành khung |
| 5 | **Trong repo** (đo bằng grep, không kể từ trí nhớ) | `apps/web/public` chỉ **5** SVG, toàn icon TFT. `apps/web/vendor/temple/img/` còn **1** tệp jpg thừa. `app.css` **đã có công thức khung theo bậc nhưng chết**: `.card.rank-hiem` `:836` (`box-shadow: 0 0 0 1.5px #d9b25a inset`), `.card.rank-quy` `:837` (inset 2px + gradient + glow), `.que-rank` `:1032`, `.bond-pic.rank-hiem/.rank-toi_thuong` `:993-994` — grep `rank-hiem|rank-quy|rank-toi_thuong` trong `.ts/.tsx`: **không kết quả** | — | **Cái ta cần đã nằm sẵn trong CSS vendor**, bị mồ côi khi bỏ hệ độ hiếm. Chỉ chờ đổi điều kiện từ *hiếm* sang *vận*. |
| 6 | **biendodo — *Dark Oriental Frames, Pixel UI Border Pack*** (`biendodo.itch.io/dark-oriental-frames-pixel-ui-border-pack`, curl HTTP 200) | trang ghi nguyên văn: `Free for personal and commercial projects. You may modify and use them in your games. Please do not resell the raw files as-is.` — **không đòi ghi công** | "6 unique frames (96×96)", `1-bit, white on transparent`; tác giả mô tả `Korean / East-Asian mood, featuring gwimyeonwa (ogre-tile) and dragon door-knocker motifs` và "they're 1-bit so they tint to any palette" — **đã tải thật**: ảnh preview của gói là sheet 630×500, 6 khung xếp 3×2, mỗi khung ~185×178 px trong sheet, góc là khiên gwimyeonwa (mặt quỷ) / đầu rồng / mây cuộn; cắt từng khung về 96×92 và tint `--gold` để render trong mock so sánh 4 phương án | **Khớp chất Á Đông nhất trong mọi nguồn đã mở, và licence dùng được thật.** Nhưng vẫn là PNG 96×96 pixel ⇒ chỉ đặt được ở chỗ cỡ cố định (modal), không dùng cho chip co giãn; 1-bit pixel cũng không cùng họ nét với 61 glyph `stroke-width 1.7`. → **dùng làm tham chiếu motif góc** (khiên mặt quỷ + đầu rồng), ở việc đó nó tốt hơn ảnh quét Commons vì đã có người tách khung chuẩn. |
| 7 | **Kho ảnh thương mại**: vecteezy `free-svg/ornamental-border` (613 mục), pngtree `game-ui-border`, dreamstime, shutterstock, stock.adobe, rawpixel, picryl, freesvg.org, publicdomainvectors.org | `curl` browser-UA: **403 toàn bộ** (`vecteezy.com/license`, `publicdomainvectors.org`, `picryl.com`, `rawpixel.com/license`, `freesvg.org/…`) | snippet mô tả "royalty-free"; freesvg tự xưng "Creative Commons 0" | **Không được đưa vào danh sách dùng được.** Không mở được trang licence từ máy này thì không có bằng chứng; "royalty-free" ở các kho này thường kèm ghi công hoặc tính tiền theo tệp. Muốn dùng thì phải mở từng trang licence bằng trình duyệt thật và chép nguyên văn vào doc. |
| 8 | **Sheet #1 người dùng gửi** — `/Users/samuel/Downloads/Fantasy Tiered Game UI Asset Sheet.png` (2026-11-06) | **không có metadata gì cả** (`Image.info keys: []`), không có URL nguồn ⇒ licence **chưa xác định**, và tôi *không suy đoán* hộ. Check trong suốt là thật: góc ảnh alpha = 1, lòng khung alpha = 0, `mode RGBA`, alpha min/max (0, 254) | đo được **1536×1024**, lưới **3 hàng × 6 cột** (dải hàng theo alpha: `(43,402) (422,620) (639,905)`, cột = lưới 256px cố định). Ô cắt ra: hàng 1 **245–256 × 320–352** (nhẫn, cao hơn rộng vì củi tua dài), hàng 2 **247–256 × 156–185** (bảng tên elip), hàng 3 **223–256 × 227–255** (ấn). 6 cột = 6 bậc màu đồng→lục→lam→tía→kim→hoả | **Nguồn ngoài đầu tiên trùng đúng 3 thiết bị ở §3** (nhẫn / bảng tên / ấn) và đúng 6 bậc màu. Nhưng xem §1.2: chỉ 2/6 bề mặt lắp được, và có hai chuyện không kỹ thuật phải xin ý kiến trước. |
| 9 | **Sheet #2 người dùng gửi** — `/Users/samuel/Downloads/Fantasy Elemental UI Frame Sprite Sheet.png` (2026-11-06, 2.692.859 B) | cũng **không metadata** (`info keys: []`), không URL nguồn ⇒ licence vẫn **chưa xác định**. Trong suốt thật: 50,5% pixel alpha<10, không có nền trắng baked-in (chỉ 1,4% pixel vừa trắng vừa đặc) | **2201×714**, lưới 3×6 tách theo mật độ alpha: cột `28-347 · 393-713 · 758-1077 · 1126-1440 · 1489-1814 · 1855-2180` (~320px mỗi cột), hàng `11-265 · 292-428 · 456-700`. Ô thật (bbox alpha>40): nhẫn **236–258 × 254**, bảng tên **314–325 × 136**, ấn **246–300 × 237–241**. Chủ đề *ngũ hành + kim*: đồng/nâu · mộc/lục · thủy/lam · lôi-tía · kim/vàng · hỏa/đỏ | **Là bản sửa lại của hàng 8, và sửa đúng hai chỗ từng làm nó dùng được.** Xem §1.3. |
| 10 | **Sheet #3 người dùng gửi** — `/Users/samuel/Downloads/Seven-Tier Fantasy Badge Collection.png` (2026-11-06, 3.383.491 B) | **vẫn không metadata**, không URL nguồn. Trong suốt thật: 42,6% pixel alpha<10, corner alpha (1,0,1,1), chỉ 1,2% pixel trắng-đặc | **1536×1024 = đúng khổ sheet #1 nhưng chứa 7 cột × 6 hàng = 42 ô.** Cột `15-222 · 238-429 · 448-637 · 657-847 · 866-1060 · 1080-1282 · 1306-1518`; hàng `17-225 · 237-329 · 345-476 · 489-640 · 659-814 · 834-1002`. Hàng 1 nhẫn **185–212 × 208** (lỗ trong 106–138 × 101–108), hàng 2 bảng tên **189–212 × 92**, hàng 3–6 **bốn biến thể ấn** cao 131 / 151 / 155 / 168 | **Sheet duy nhất trong ba cái khớp đúng 7 nhãn đã chốt** (Khai Vận → Như Ý) mà không phải gộp bậc hay vẽ thêm, và cột 7 có **hình khác thật** chứ không chỉ đổi màu. Cái giá: mỗi nhẫn còn 40.6k px (**0,65×** sheet #2) nên modal 250px phải **phóng** 1,2–1,3× thay vì thu nhỏ. Xem §1.4. |

### 1.0 Từ khoá đã dò (để lần sau khỏi làm lại)

`game title border` · `gaming title border` · `game ui frame` · `ornate frame border svg` ·
`badge frame CC0` · `ornamental border public domain` · `Chinese cloud pattern` · `ruyi motif` ·
`itch.io free UI frame border commercial use`.

Bài học đo được: từ khoá **"title border" kéo về kho ảnh thương mại 403 (hàng 7), không kéo về asset
trò chơi**; khung *dùng được* nằm ở tag `border` + `frame` + `1-bit` trên itch.io (hàng 6) và ở Commons
API (hàng 4). OpenGameArt trả kết quả rác với mọi biến thể của "frame".

### 1.1 Phát hiện quyết định: chùa đã có một hệ SVG nội bộ, và nó là hạ tầng của khung

`apps/web/vendor/temple/js/icons.js` — **61** glyph tự vẽ, mỗi cái một chuỗi path trong object `P`,
lắp vào sprite ở `:80`:

```
<symbol id="i-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
```

và `drawIcon(g, name, x, y, size, color)` (`:94-96`) nung đúng symbol đó thành PNG trên **canvas 3D**.

Nghĩa là: một hình vẽ thêm vào `icons.js` **tự động** dùng được ở cả hai nơi — HUD (`<Icon name/>`,
`ui.tsx:58-64`) và sân chùa 3D — cùng một nét, cùng một màu `currentColor`, không thêm request nào,
không licence nào. Khung nên sinh ra ở đây, không phải ở một kho ảnh ngoài.

Thêm một điểm thuận: bộ 61 glyph **đã** có sẵn `lotus`, `temple`, `medal`, `spark`, `bow`, `beads` —
từ vựng chùa đã được vẽ một lần rồi, nên khung không bắt đầu từ số không mà chỉ cần thêm phần *viền*.

### 1.2 Sheet 1536×1024 (hàng 8) đã thử lắp thật vào HUD — kết luận từng bề mặt

Mock dựng riêng để đo, không đoán: `visualizations/shrine-sheet-trial.html` (trong session dir), cắt đủ
18 ô bằng base64 rồi nhét vào đúng CSS của HUD (`.me-chip`, `.me-lv`, `.ringwrap`, `.modalbox`). Số đo
`getBoundingClientRect()` lấy từ trang đã render:

| Bề mặt | Lắp thẳng được? | Bằng chứng đo được |
|---|---|---|
| Nhẫn avatar 38px | **CÓ** | ô hàng 1 = 150×210; đặt rộng 60px ⇒ **60×84**, vòng nhẫn bọc kín avatar 38px. Cỡ cố định nên raster không phải co giãn — đây là chỗ duy nhất ràng buộc §2 không chặn nó |
| Modal THĂNG VẬN 250px | **CÓ** | ô hàng 2 = 150×116 ⇒ phóng 250px đạt **250×193**, gần 1:1 nên nét còn sạch; nhưng *vừa khít*, muốn modal 320px là phải xin sheet ô 512px |
| Ấn danh hiệu 44px | **MỘT PHẦN** | ô hàng 3 = 110×114 đủ cỡ, nhưng sheet chỉ có **6 biến thể màu** cho cùng một hình, còn §5 SHRINE-LADDER cần **10 danh hiệu khác hình**, và thang cần **7 nhãn** (6 vận + đỉnh Như Ý) |
| Chip cấp 24px | **KHÔNG** | tỷ lệ 150:116 ⇒ cao 24px chỉ rộng **31px** (đo đúng 31×24 trong mock). Không chứa nổi "Cát Tường · bậc 2". Để chữ đọc được thì phải 150×116 ⇒ **đổi layout HUD** (nameplate riêng, viết lại `.me-lv` và `max-width:60vw` của `.me-chip`) |
| BXH 30 hàng | **KHÔNG** | mỗi hàng một ảnh painterly = noise; `.medal` 26px sẵn có đã đủ |
| Canvas 3D | **KHÔNG** | `drawIcon` chỉ nung từ `symbol` SVG trong `icons.js`; ảnh raster vào sân chùa phải viết thêm đường nạp texture — đúng cái lệ "bớt đường không cần thiết" §6 |

**Hai chuyện phải user chốt, không phải vấn đề kỹ thuật:**
1. **Licence/provenance chưa xác định.** Tôi không tự gán cho nó là CC0 hay "đã mua": tệp không metadata,
   không nguồn. Nếu không xác nhận được thì chỉ dùng làm **chỉ đạo nghệ thuật** (vẽ lại 3 thiết bị + 6 màu
   + mây/củi tua thành vector trong `icons.js`), **không** đưa PNG vào bundle.
2. **Ấn Thái Cực 太極 ở giữa sheet là hình Đạo giáo**, mà chùa này đã cố ý bỏ hết hình tượng tôn giáo
   (`SHRINE-PLAN`: bỏ tượng Phật / sen / áo tràng). Cùng họ tâm linh nhưng khác tôn — quyết định của user.

**Điểm sheet này đúng và mock trước thiếu:** nó chia thiết bị theo **nhẫn / bảng tên / ấn** — trùng §3 —
và nó cho rằng **màu được phép khác nhau giữa các bậc**. Lệ "một màu accent" không chặn điều này, vì lệ
đó nới khi *màu là dữ liệu*; ở đây màu chính là bậc vận. Đây là lập luận mạnh nhất để nghiêng về hướng
"6 màu" thay vì hướng "chỉ khác nét" của phương án A ở §5.

### 1.3 Sheet #2 (hàng 9) — đo cạnh sheet #1, cùng cỡ hiển thị

Mock dựng riêng: `visualizations/shrine-sheet2-trial.html` (session dir) — cắt đủ 18 ô bằng bbox alpha,
ghép vào đúng CSS HUD (`.me-chip`, `.me-lv`, `.ringwrap`, `.modalbox`), mỗi bề mặt đặt **cạnh ô tương
ứng của sheet #1 ở cùng một bề rộng**. Số đo `getBoundingClientRect()` từ trang đã render:

| Bề mặt (cùng bề rộng) | Sheet #1 | Sheet #2 | Kết luận |
|---|---|---|---|
| Nhẫn, 62px (= lỗ trong 38px avatar) | cao **81 / 85 / 89** | cao **64 / 64 / 61** | #2 vào chip 50px chỉ tràn ~7px mỗi phía; #1 tràn ~19px ⇒ **chỉ #2 là không buộc đổi layout HUD** |
| Bảng tên, 150px | cao **96 / 106** (tỷ lệ 1,6:1) | cao **65 / 63** (tỷ lệ 2,35:1) | #2 đúng dáng nameplate một hàng; nền trong cũng tối hơn (L trung bình 30–43 so với 44–57) ⇒ chữ `--cream` tương phản tốt hơn |
| Ấn, 44px | cao 43–44 | cao 35–36 | ngang nhau, #2 gọn hơn chút |
| Bảng tên ép xuống 24px của `.me-lv` | rộng **31px** | rộng **56px** | cả hai vẫn **KHÔNG** — muốn chứa "Cát Tường · bậc 2" (~110px chữ) phải đổi layout chip, không phải đổi asset |

**Cái #2 hơn (đo được):** hình học bố cục như trên; và trong tệp gốc, biến độ Laplacian của ô nhẫn
**8,3k–15,8k** so với **1,6k–2,3k** của #1 — nhiều nét con hơn hẳn.

**Cái #2 KHÔNG hơn, và không được nói quá:** khi đã co về cỡ HUD thật (60px) thì độ nét hai tệp **ngang
nhau trong ±20%** (ring 16,0k vs 20,2k · plate 10,5k vs 9,1k · crest 16,7k vs 14,0k). Lợi thế độ phân
giải của #2 **tiêu biến ở 60px** — không có bề mặt nào trong chùa lớn hơn 250px.

**Cái #2 đi lùi (đo được):** hình viền giữa các bậc nay **giống nhau hơn** — IoU mặt nạ alpha giữa các
cột: nhẫn **0,82** (#1: 0,64), ấn **0,84** (#1: 0,77). Tức là bộ này phân biệt bậc bằng *màu* nhiều hơn
bằng *hình*, trái với cái lệ §3 ("bậc phải đếm được bằng nét, không bằng màu") và xấu cho người mù màu.

**Và nó phạm lại hai chuyện cũ, nặng hơn:**
1. **太極 giờ nằm trên 12/18 ô** — cả 6 nhẫn (đĩa ở đáy) lẫn 6 ấn (đĩa trung tâm) — thay vì vài ô như #1.
   Xoá nó là sửa từng ô, không phải cắt một ô. Quyết định vẫn là của user (`SHRINE-PLAN` đã bỏ hết hình
   tượng tôn giáo).
2. **Licence vẫn chưa xác định** — tệp không metadata, không nguồn. Tôi không tự gán CC0 hay "đã mua".
3. Vẫn **6 cột cho 7 nhãn** (thiếu đỉnh Như Ý) và **không có 10 hình ấn khác nhau** cho 10 danh hiệu.

**Kết cho doc này:** nếu buộc phải dùng raster, **dùng #2 bỏ #1** (hai lý do hình học ở bảng trên là đủ).
Nhưng kết luận phương án ở §5 **không đổi**: #2 vẫn chỉ phủ 2/6 bề mặt, vẫn không vào được canvas 3D
(`drawIcon` chỉ nung symbol SVG), và vẫn thiếu licence. Giá trị lớn nhất của #2 là nó **chứng minh bằng
hình hài thật** rằng bố cục nhẫn vuông + bảng tên 2,35:1 là thứ vector của ta nên vẽ theo.

### 1.4 Sheet #3 (hàng 10) — sheet đầu tiên phủ đủ 7 vận, và chỗ nó phải trả giá

Mock: `visualizations/shrine-sheet3-trial.html` (session dir) — 24 ô cắt từ 42 ô, lắp vào CSS HUD, 37/37
ảnh decode, 0 lỗi. Số đo `getBoundingClientRect()`:

| Phép đo | Kết quả | Ý nghĩa cho thang đã chốt |
|---|---|---|
| Nhẫn cột 0–5 ở 59px | cao **57–65px** trong chip 50px ⇒ tràn ~7px | vào được HUD mà **không** phải đổi layout (điều kiện mà #1 fail, #2 vừa đủ) |
| Nhẫn cột 6 (Như Ý) | lỗ/vòng ngoài = **0,50** ⇒ phải vẽ ở **76×75px**, tràn **13px** | đỉnh to hơn là **một tính năng nên được chọn có chủ đích**, không phải lỗi — nhưng `.me-chip` phải cho phép vùng nhô |
| Bảng tên ở 150px | cao **65–73px** | bằng #2, tốt hơn #1 (91–112px) |
| Bảng tên ép xuống 24px của `.me-lv` | rộng **49–55px** | vẫn **KHÔNG** — lần thứ ba, cùng một kết luận |
| Modal 250px | **250×108–122**, nhưng nguồn chỉ 189–212px ⇒ **phóng 1,2–1,3×** | #2 ở cùng việc này **thu nhỏ** từ 319–325px ⇒ nếu modal là bề mặt quan trọng nhất thì #2 vẫn thắng |
| Ấn ở 44px | cao 27–35px | đủ cỡ |
| 4 hàng ấn trong cùng một cột | IoU **0,82–0,89** | **không phải 4 hình khác nhau** — là một ấn ở 4 độ hoành tráng ⇒ hợp làm 3 **bậc nhỏ** dentro một VẬN, không hợp làm 4 danh hiệu |
| 7 cột so với nhau | nhẫn IoU **0,82**, bảng tên **0,95** | vẫn phân bậc bằng **màu**, trái lệ §3 |
| **Cột 6 so với 6 cột kia** | nhẫn IoU **0,75** (6 cột đầu với nhau: **0,85**), pixel đặc **0,451** vs **~0,345** | **bằng chứng đo được rằng đỉnh Như Ý có hình riêng** — điều cả #1 lẫn #2 không có |

**Cái được:** đây là sheet đầu tiên khớp 1-1 với `SHRINE-LADDER.md §1` (6 vận + đỉnh) mà không phải gộp
Đại Cát/Như Ý vào một màu, không phải vẽ bậc 7. Nó cũng trả lời câu "19 mốc có Too Many không" theo
hướng ngược lại: 7 nhãn × 3 bậc nhỏ giờ đã có hình hài cho cả hai tầng.

**Cái mất (đo được, không phải cảm giác):** nhét 7 cột vào khổ 1536×1024 làm mỗi nhẫn còn **40.6k px**
so với **62.7k** của #2 (**0,65×**) — không nhìn thấy ở 59px, nhìn thấy ở 250px.

**Và ba chuyện cũ, cái đầu nay nặng hơn hẳn:**
1. **太 Cực trên 35/42 ô** (7 nhẫn + 28 ấn; chỉ 7 bảng tên là sạch) — so với 12/18 của #2. Không còn là
   "một chi tiết phụ", mà là chủ đề của cả bộ.
2. **Licence vẫn chưa xác định** (tệp không metadata, không nguồn) ⇒ chưa được vào bundle.
3. **10 danh hiệu vẫn chưa có 10 hình**; và **canvas 3D vẫn không dùng được** vì `drawIcon` chỉ nung
   symbol SVG trong `icons.js`.

**Kết luận ba sheet:** #3 là bản **để nhìn theo** (đủ 7 bậc, đủ 3 thiết bị, đỉnh có hình riêng); #2 là
bản **để dùng thẳng** nếu phải dùng raster (nét + modal); #1 bỏ. Không sheet nào trong ba cái làm được
chip 24px, BXH, canvas 3D, hay 10 danh hiệu — bốn việc đó vẫn là việc của vector.

### 1.5 Sprite hiệu ứng cho chữ danh hiệu — Kenney *Particle Pack* 1.1, đã vào repo

Bảy tệp 256px nằm ở `apps/web/public/temple/fx/` và chỉ dùng cho nhãn canvas trên đầu nhân vật
(`vendor/temple/js/textures.js`). Nguồn `kenney.nl/assets/particle-pack`, tải bằng đường
`/download-link/<hex>` kèm cookie + referer (thiếu một trong hai → 403 `{"error":"forbidden"}`).

Bằng chứng licence — **nguyên văn `License.txt` bên trong zip**:

```
	Particle Pack (1.1)

	by Kenney Vleugels (Kenney.nl)

			------------------------------

	License (Creative Commons Zero, CC0)
	http://creativecommons.org/publicdomain/zero/1.0/

	You may use these assets in personal and commercial projects.
	Credit (Kenney or www.kenney.nl) would be nice but is not mandatory.
```

⇒ không phải xin phép, không bắt buộc ghi công, dùng được cho prod thương mại. Trong pack **không có
GIF/animation nào** — toàn PNG tĩnh, nên hoạt ảnh là việc của mã (nung spritesheet, xem §7.5).

Tệp đã lấy (từ `PNG (Transparent)/`, ép về 256px): `spark_01` `spark_02` `spark_04` `spark_07`
(bốn dạng tia lửa/sét; `spark_07` là vệt nằm ngang, làm đầu sét), `star_06` (chớp 4 cánh, quầng quanh
sao hạng), `star_09` (chớp 8 cánh, đỉnh đầu sét), `flare_01` (vệt sáng ngang, choá tại đầu sét).
Kho còn `magic_*`, `light_*`, `trace_*`, `twirl_*`, `smoke_*`, `flame_*` và pack **Light Masks 1.0**
(152 mask `cone_/fan_/ring_/streaks_`, cũng CC0) — đã thử render, bị từ chối vì không đọc ra trên nhãn
384px, chưa dùng.

**Hue của từng vận đo từ chính ảnh khung**, không đoán: với mỗi `public/temple/badges/danh-hieu-frame-N.png`,
lấy mọi pixel có alpha>200, bão hoà>0.35 và 0.18<độ sáng<0.85, xếp vào các thùng hue 15°, cụm đông nhất cho
màu trung bình và hue dưới đây. Tia sét giữ đúng hue đó nhưng nâng sáng lên 78% (`hsl(h, 95%, 78%)`) vì sét
phải trắng hơn khung mới ra sét; nét viền chữ lấy cùng hue ở `hsla(h, 80%, 32%, .9)`.

| Vận | khung | hue | màu trung bình cụm |
|---|---|---|---|
| I Khai Vận | 1 | 15° | `#aa5823` đồng |
| II Hanh Thông | 2 | 105° | `#198a0d` lục |
| III Cát Khánh | 3 | 195° | `#3685bd` lam |
| IV Cát Tường | 4 | 270° | `#66149d` tía |
| V Hồng Phước | 5 | 30° | `#ea9c22` kim |
| VI Đại Cát | 6 | 0° | `#b01006` hoả |
| VII Như Ý | 7 | 210° | `#194880` bạc |

## 2. Khung phải làm được gì (yêu cầu đo được, không phải thẩm mỹ)

Điều kiện tiên quyết: **bậc phải đọc được mà không cần hiểu chữ Hán và không cần đọc hết nhãn.**
Muốn vậy khung chỉ được khác nhau bằng biến mà mắt đếm được, không bằng sắc độ:

| Biến | thang | đọc được ở |
|---|---|---|
| Số lớp viền | 1 → 3 | 24px |
| Số góc có hoa văn | 0 → 4 | 24px |
| "Tai" như ý ở cạnh trên | không / có | 32px+ |
| Glow | không / có (từ vận V) | mọi cỡ |
| Ấn đỏ góc phải | riêng cho đỉnh | 24px |

**Cấm**, vì đã chốt ở chỗ khác: phân biệt bằng *màu thuần* (`--gold #f2c46d` / `--gold2 #c8902f` là
toàn bộ palette vàng, và lệ một-accent đã ghi ở `DESIGN-SYSTEM.md`); bằng font; bằng ảnh nền raster
(không co giãn — xem §1.1 về chiều rộng đổi theo tên người chơi).

## 3. Bảy khung cho bảy nhãn vận, và một thiết bị riêng cho danh hiệu

Tách hai loại bằng **hai thiết bị khác nhau**, để người chơi không nhầm "đang đọc vận hay đọc huy hiệu":

- **Vận = khung** (viền bao quanh chữ) — 7 biến thể theo bảng dưới, khớp `SHRINE-LADDER.md §3.1`.
- **Danh hiệu = ấn** (con dấu tròn 24px đặt *trên* khung, không viền) — 10 cái ở §5 doc kia, mỗi cái
  một glyph trong `icons.js`, không có lớp viền riêng.

| Vận | Nhãn | Lớp viền | Góc hoa văn | Tai như ý | Glow | Ấn |
|---|---|---|---|---|---|---|
| I | Khai Vận 開運 | 1 | 0 | không | không | |
| II | Hanh Thông 亨通 | 1 | 2 (trên-trái, dưới-phải) | không | không | |
| III | Cát Khánh 吉慶 | 2 | 2 | không | không | |
| IV | Cát Tường 吉祥 | 2 | 4 | nhỏ | không | |
| V | Hồng Phước 洪福 | 3 | 4 | có | nhẹ | |
| VI | Đại Cát 大吉 | 3 | 4 | có | có | |
| Đỉnh | Như Ý 如意 | 3 | 4 | có | có | **Ấn đỏ 如意** |

Ấn đỏ không phải màu mới: `#e5483b` đã là màu của `.badge` (`app.css:105`) — mượn đúng token có sẵn,
đúng lệ một-accent. Đỉnh là nhãn duy nhất có ấn, nên nó là nhãn duy nhất **không cần nhìn khung**
vẫn nhận ra — và đó là thứ người chơi sẽ khoe.

Hoa văn góc: lấy hình hài từ hai nguồn đã kiểm chứng — **6 khung 1-bit của biendodo** (khiên mặt quỷ
gwimyeonwa + đầu rồng, §1 hàng 6, licence cho phép sửa và dùng thương mại) và **bản khắc/đồ đồng
PD/CC0 trên Commons** (§1 hàng 4) — rồi **vẽ lại bằng nét `stroke-width: 1.7` cùng nhà với 61 glyph
trong `icons.js`**. Không chép ảnh quét, không tải PNG pixel vào HUD, không vẽ từ trí nhớ.

## 4. Lắp vào đâu (6 bề mặt, số đo thật từ CSS)

| Bề mặt | chỗ mount | số đo hiện tại | khung phải đạt |
|---|---|---|---|
| Chip cấp HUD | `temple-app.tsx:613` `<span className="me-lv">` | `app.css:92` cao 24px, `min-width: 24px`, `padding: 0 6px`, `border-radius: 999px` | nhẫn 24px, nét ≤1.5px, tối đa 2 góc có hoa văn. Đây là chỗ **khó nhất** vì nhỏ và chữ co giãn. |
| Chip trên avatar của ta | `temple-app.tsx:603` `.me-ava` | `:86` 38px; `:335` 32px mobile | ring bao quanh, không che mặt; kế thừa công thức `.ava-edit .ava` `:273` (`box-shadow: 0 0 0 3px var(--gold)`) |
| Card người chơi | `people.tsx:103` (`<small>{p.title}</small>`), `:407`, `:605` | `.card` `:173`; `.ava` `:270` 40px | revive `.card.rank-quy` `:837` đổi điều kiện thành vận — 2 dòng CSS, không ảnh |
| Podium/BXH | `hall.tsx:21-94`; `.medal` `:262` 26px với 3 gradient vàng/bạc/đồng `:263` | hàng `.rank-row` cột 36px/40px | **Không viền quanh hàng** (30 hàng × khung = noise). BXH đã có `.medal` làm thiết bị hạng; vận chỉ thêm ấn 16px sau tên. |
| Modal THĂNG VẬN | `temple-app.tsx:795-803`, `.big` `app.css:219` `font-size: 52px`, `.big .i` `:257` 64px (42px mobile `:357`) | chỗ duy nhất khung ≥ 64px | **Chỗ đáng đầu tư nhất**: đủ 5 biến, và chữ Hán + nghĩa nôm đặt *trong* khung. |
| Sân 3D (phóng qua `drawIcon`) | `icons.js:94-96` | `size` và `color` là tham số | cùng symbol, không việc gì phải vẽ thêm. |

Quy tắc lắp: **khung = viền CSS + mảnh SVG góc absolutely-positioned**, không phải 9-slice raster.
Lý do đo được: `.me-lv` và `.me-info b` đều đổi chiều rộng theo nội dung (`:88,92` có
`text-overflow: ellipsis`), nên mọi ảnh nguyên chiếc đều hoặc giãn lệch hoặc cắt chữ. Viền lo phần
co giãn, SVG góc lo phần *thể hiện bậc* — và góc thì luôn vuông 24×24.

Một symbol dùng chung cho cả 6 bề mặt, chỉ đổi cỡ và bật/tắt hoa văn; **không** vẽ 7 ảnh cho 6 chỗ.

## 5. Bốn phương án, và khuyến nghị

| | Phương án | Được | Mất |
|---|---|---|---|
| **A** *(khuyến nghị)* | **Tự vẽ trong `icons.js`** — thêm 7 symbol `frame-1..7` + 10 ấn, hình hài lấy từ các bản đã kiểm chứng ở §1 (hàng 4 và 6); CSS viền + SVG góc | nét đồng bộ 61 glyph sẵn có; co giãn theo chữ; chạy cả DOM lẫn canvas qua `drawIcon`; **0 licence, 0 request, 0 trang credit**; đổi theme bằng `currentColor` | là chữ ta vẽ ⇒ **bắt buộc qua mock trước khi code** (lệ đã chốt), và mỗi motif phải mở được tệp tham chiếu |
| B | Panel Kenney CC0 cho modal + SVG tự vẽ cho chip | có ngay một khung "có da" cho modal THĂNG VẬN | hai ngôn ngữ hình ảnh trong một modal; PNG giãn; style cửa hàng Tây |
| C | A + glyph của game-icons.net CC BY làm hoa văn trong ấn | nét hoa văn "người chuyên" hơn | nợ một surface credit chưa tồn tại; CC BY dây chuyền sang cả ảnh dẫn xuất |
| **D** | **Tải 6 khung 1-bit của biendodo (§1 hàng 6) về dùng thẳng**, ít nhất cho modal THĂNG VẬN | rẻ nhất trong các phương án có asset ngoài: licence nguyên văn cho phép sửa + dùng thương mại, **không đòi ghi công**; motif Á Đông có sẵn (khiên gwimyeonwa, đầu rồng) | 96×96 pixel stretch ra modal 230px là **pixel-art**, không cùng nhà với HUD vector của chùa (vốn `icons.js` stroke 1.7); một bộ khung cố định không nói được 7 bậc; vẫn phải tự viết phần chữ bên trong |

**Chọn A, dùng D làm *tham chiếu* chứ không làm asset.** Lý do đo được chứ không phải lý do thẩm mỹ:
4/6 bề mặt ở §4 có cỡ **≤ 40px** và **không bề mặt nào có chiều rộng cố định** — đúng chỗ raster fail
và vector thắng; cộng thêm ràng buộc `drawIcon` (asset raster ngoài kia không đi vào canvas 3D được
mà không viết thêm đường nạp ảnh). Riêng D vẫn đáng làm một việc: **tải về, mở lên, chép hình hài
motif** — đó là bộ khung Á Đông duy nhất tìm được có licence sạch, nên nó là bản mẫu tốt hơn mọi ảnh
quét sách cũ.

## 6. Ràng buộc phải giữ (không được phá khi làm đẹp)

- **Không hứa may mắn** (`SHRINE-LADDER.md §0`): khung không đổi màu avatar, không đổi tượng, glow
  chỉ là vẽ, không gắn vào bất kỳ công thức điểm nào.
- **Không tiền thật, không mua khung** — vận và danh hiệu là hai nguồn duy nhất.
- `SHRINE-LADDER.md §6` hiện chốt "pha đầu phần thưởng hiển thị duy nhất là **chữ**" và dời mở khoá
  hiển thị sang pha C có duyệt mock. Doc này **là** pha C đó; nó **chưa ghi đè** quyết định kia cho
  tới khi mock ở §7 được người dùng duyệt.
- Một accent: chỉ `--gold`, `--gold2` và đỏ `#e5483b` đã có; không thêm token màu.
- Không đụng `meta.json` / `world.js` / `schema.sql`: đây là tầng HUD-CSS, không phải 3D, không phải
  server. Server vẫn không biết gì về khung — khung chỉ là cách đọc `realm`/`stage` đã có trong
  response.

## 7. Việc phải làm (chưa code) + gate

| Pha | File | Nội dung | Ước lượng |
|---|---|---|---|
| **F0 — mock** | **đã làm 2026-11-06**: một trang HTML dựng cả 4 phương án A/B/C/D trên cùng một nội dung (chip 24px + modal 212px), 6 khung pixel của biendodo là **tệp thật** nhúng base64, glyph C là **tệp thật** từ URL SVG thô của game-icons. Nghiệm bằng script trong trình duyệt: 7 chip render, 6+1 ảnh pixel decode 96×92, ảnh remote 150×150, `scrollHeight` 2940 | **duyệt ảnh trước khi code** — đây là gate, không phải bước phụ | còn lại: chờ user chọn |
| F1 | `vendor/temple/js/icons.js` | 7 symbol khung + 10 ấn (stroke 1.7, viewBox 24) | nửa ngày |
| F2 | `ui.tsx` (component `<Frame fate stage>`), `temple-app.tsx:603,613` | nhẫn chip + ring avatar | nửa ngày |
| F3 | `temple-app.tsx:795-803` | modal THĂNG VẬN dùng khung cỡ lớn + chữ Hán trong khung | một buổi |
| F4 | `people.tsx:103,407,605` + `.card.rank-*` `app.css:836-837` đổi tên `.card.fate-*` | card người khác | nửa ngày |
| F5 | `hall.tsx` ấn 16px sau tên | BXH, **không** viền hàng | một buổi |

Gate: screenshot 390px + desktop mỗi pha (card từng vỡ một lần — `TEMPLE-REVIEW.md`); Playwright
`temple.spec.ts` **không** thêm case (không chạy trong CI, theo `SHRINE-LADDER.md §10`); test server
không đổi vì không có gì ở server đổi.

## 8. Cần người dùng chốt (4 câu)

1. **A / B / C / D** ở §5 — khuyến nghị A: không mua asset nào, tự vẽ trên hạ tầng `icons.js`, motif
   khớp các bản đã mở ở §1 (hàng 4 + 6). Nếu muốn có khung *ngay* cho modal mà chưa kịp vẽ, D là lựa
   chọn duy nhất trong bốn phương án có thể tải về và dùng hợp pháp hôm nay.
2. Đồng ý nguyên tắc "khung phân biệt bằng **số lớp viền + số góc hoa văn + tai như ý + glow từ vận
   V + ấn đỏ riêng cho đỉnh**, **không** bằng màu"?
3. Pha đầu gắn khung ở những chỗ nào — khuyến nghị **chip HUD + modal THĂNG VẬN** (2 bề mặt, rẻ,
   thấy ngay), card + BXH để F4/F5 sau khi mock được duyệt?
4. **Ba sheet bạn gửi (hàng 8 · 9 · 10) — chốt một trong ba:** (a) bạn xác nhận được nguồn/licence ⇒
   dùng thẳng **7 nhẫn của #3** cho chip (sheet duy nhất đủ 7 vận) và **bảng tên của #2** cho modal
   THĂNG VẬN (nguồn 319px, thu nhỏ chứ không phóng); (b) coi #3 là **bản chỉ đạo nghệ thuật**, tôi vẽ
   lại vector trong `icons.js` theo đúng bố cục đó nhưng phân bậc bằng nét đếm được thay vì màu, bỏ
   Thái Cực, và có đủ 10 hình ấn; (c) yêu cầu làm lại sheet một lần nữa (bỏ Thái Cực, 10 hình ấn khác
   nhau, ô ≥512px) rồi đo tiếp. Khuyến nghị (b): ba sheet vẫn chung ba chỗ fail không tự nhiên mà hết —
   licence chưa xác định, chip 24px, và canvas 3D.

Và một câu dẫn từ §7 `SHRINE-LADDER.md` vẫn còn mở: số hồ sơ prod `exp ≥ 1600` (để biết đỉnh Như Ý
và ấn TIÊN PHONG có ai với tới ngay không) — cần bạn duyệt cho đọc prod DB.

**Trạng thái đã ship trước 4 câu trên** (để khỏi hỏi lại): thang 19 mốc gom về **7 VẬN = 7 cột của
sheet #3** — hàng 2 (bảng tên) vẽ nhãn 3D trên đầu mọi nhân vật, kể cả nhân vật của mình; hàng 3 (ấn)
vẽ chip HUD, BXH, hồ sơ; hàng 6 (bản nổi bật) chỉ dùng cho modal THĂNG VẬN. Bậc không có khung riêng,
chỉ hiện bằng chữ `Vận III · bậc 2`. Bốn câu vẫn còn nguyên giá trị vì chúng hỏi về *nguồn gốc asset
và luật phân bậc bằng nét*, không hỏi về phép ánh xạ này.
