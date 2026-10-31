# Checklist đăng ký TFTIQ TFT trên Riot Developer Portal

**Website hiện tại:** https://www.tftiq.com/ (canonical; apex 308 và
`meta-board-tft.vercel.app` 301 về www)\
**Sản phẩm:** TFTIQ -- nền tảng đồng hành cùng người chơi Teamfight
Tactics (TFT)\
**Mục tiêu:** Chuẩn bị hồ sơ đăng ký sản phẩm và xin Riot API Production
Key.

> **Lưu ý:** Tài liệu này là checklist chuẩn bị dựa trên hướng dẫn và
> chính sách Riot Developer được tham khảo tại thời điểm lập. Riot có
> thể cập nhật yêu cầu hoặc đánh giá từng hồ sơ khác nhau. Hãy đối chiếu
> lại tài liệu chính thức trước khi submit.

------------------------------------------------------------------------

## 1. TFTIQ có bắt buộc phải có domain riêng không?

Website hiện chạy trên Vercel với domain riêng:

`https://www.tftiq.com/`

Cần phân biệt hai loại API key:

  -----------------------------------------------------------------------
  Loại API key            Mục đích                Domain riêng
  ----------------------- ----------------------- -----------------------
  Development API Key     Phát triển và thử       Không phải trọng tâm
                          nghiệm; thường có thời  
                          hạn ngắn                

  Personal API Key        Prototype hoặc sử dụng  Thông thường không cần
                          cá nhân/nhóm nhỏ        xác minh domain như
                                                  Production

  Production API Key      Sản phẩm public phục vụ Cần chuẩn bị bước xác
                          cộng đồng               minh website/domain
                                                  theo quy trình Riot
  -----------------------------------------------------------------------

Vercel subdomain có thể truy cập công khai, nhưng không nên mặc định
rằng `vercel.app` chắc chắn được Riot chấp nhận làm domain xác minh. Tài
liệu Riot tập trung vào việc chứng minh quyền kiểm soát website/domain.
Vì vậy, lựa chọn an toàn và chuyên nghiệp hơn là mua domain riêng.

### Domain

-   `tftiq.com` — đã mua và **đã live**: `https://www.tftiq.com/` là
    canonical, HTTPS bật, apex và hostname Vercel cũ đều redirect về www
-   Mail `support@tftiq.com` công khai trên About/Privacy;
    `admin@tftiq.com` chỉ dùng nội bộ

Không có yêu cầu phải dùng riêng `.com` hay `.gg`; domain riêng có lợi
cho việc chứng minh quyền kiểm soát, nhận diện thương hiệu và duy trì
sản phẩm lâu dài.

Website công khai, ổn định, `sitemap.xml` và `robots.txt` đều dựa trên
`https://www.tftiq.com/`.

------------------------------------------------------------------------

## 2. Đánh giá mức độ sẵn sàng của website

Các thành phần sản phẩm đã được xây dựng hoặc thể hiện trên website:

  Hạng mục                       Trạng thái ghi nhận
  ------------------------------ ---------------------
  Homepage giới thiệu sản phẩm   Có
  Bảng xếp hạng đội hình         Có
  Xếp hạng trang bị              Có
  Xếp hạng nâng cấp (Augments)   Có
  TFT Coach AI                   Có
  Hướng dẫn và tra cứu dữ liệu   Có
  Privacy Policy                 Có
  Terms of Service               Có
  About / giới thiệu sản phẩm    Có

Website đã thể hiện được định hướng của một TFT companion platform, thay
vì chỉ là landing page ý tưởng. Tuy nhiên, cần rà soát các nội dung dưới
đây trước khi submit.

------------------------------------------------------------------------

## 3. Những việc cần hoàn thiện trước khi đăng ký

### 3.1. Email liên hệ

Đã có, đã đưa vào copy công khai:

-   `support@tftiq.com` — góp ý, gửi đội hình, câu hỏi về privacy policy
-   `admin@tftiq.com` — chỉ dùng nội bộ, không xuất hiện trên site

Không còn địa chỉ `.example` nào trong `apps/web/lib/messages.ts`.

### 3.2. Bổ sung Riot legal disclaimer nguyên văn — đã xong

Footer và trang Terms hiển thị nguyên văn câu của Riot (không ghép thêm
bản dịch tự viết), ở cả hai locale:

> TFTIQ isn't endorsed by Riot Games and doesn't reflect the views or
> opinions of Riot Games or anyone officially involved in producing or
> managing Riot Games properties. Riot Games, and all associated
> properties are trademarks or registered trademarks of Riot Games, Inc.

Footer có thêm dòng `© 2026 TFTIQ.` phía trước; About cũng nói rõ phần
phân tích là của TFTIQ và không được Riot bảo trợ.

### 3.3. Làm rõ nguồn dữ liệu và phương pháp xếp hạng — đã xong trên /about

Trang About có các mục:

-   **How the tiers are made** — dữ liệu trận + vòng đánh giá của biên
    tập viên; đội hình chỉ đổi hạng khi cả hai đồng thuận.
-   **How item and augment tiers are made** — trang bị theo tỉ lệ chọn và
    chênh lệch vị trí so với chính tướng đó; nâng cấp theo độ hợp với
    đội hình trong mẫu hiện tại, không chỉ win rate.
-   **Where the data comes from** — tướng/tộc hệ/trang bị/nâng cấp/icon
    lấy từ dữ liệu game công khai của Riot qua Data Dragon; số liệu trận
    tổng hợp từ dữ liệu trận TFT công khai, được biên tập viên rà lại;
    nêu rõ **chưa gọi Riot API trên production** và kế hoạch chuyển
    sang Riot API.
-   **How fresh it is** — làm mới theo patch hoặc bản dữ liệu trận mới;
    thanh patch ghi ngày của dữ liệu đang đọc (không còn claim "hằng
    ngày").
-   **What is ours** — phần nào là thống kê, phần nào là phân tích của
    TFTIQ.

Mô tả trên site khớp với vận hành hiện tại: dữ liệu đang đọc là snapshot
`2026-10-27`, patch 18.5b, và ngày này hiển thị trên thanh patch.

**Đã chuẩn bị cho hồ sơ:** câu trả lời về nguồn dữ liệu trận công
khai đang dùng và quyền dùng asset game (Data Dragon) trên sản phẩm
có thu phí — xem §11.

### 3.4. Rà soát mô hình monetization — đã xong trên /membership

Trang Membership mô tả đủ hai gói, hạn mức và chính sách hoàn tiền:

-   **Free** — 0₫, 60 câu Coach/tháng · 12/ngày, toàn bộ comp/tier
    list/guide đọc miễn phí, không cần thẻ.
-   **Plus** — 99.000₫ cho 30 ngày, 300 câu Coach/30 ngày · 60/ngày,
    20 phút voice in, 10.000 ký tự đọc thành tiếng; không tự gia hạn,
    không cộng dồn quota.
-   Hoàn tiền toàn bộ trong 7 ngày nếu chưa dùng quota của kỳ; thanh
    toán thủ công qua chuyển khoản/QR.

Terms cũng ghi Plus là gói 30 ngày và điều kiện hoàn tiền. **Khi nộp
hồ sơ phải khai báo mô hình này trong phần mô tả sản phẩm** (xem §8) và
không giả định Riot đã chấp thuận monetization trước khi được duyệt.

------------------------------------------------------------------------

## 4. Rà soát TFT Coach AI theo Game Integrity Policy

Đây là phần cần chú ý đặc biệt vì TFTIQ có tính năng AI Coach.

Hướng sản phẩm phù hợp hơn là hỗ trợ học tập, chuẩn bị trước trận và
phân tích sau trận; không phải tự động chơi hoặc đưa chỉ dẫn mang tính
quyết định trong trận.

  -----------------------------------------------------------------------
  Tính năng                           Định hướng đánh giá
  ----------------------------------- -----------------------------------
  Xếp hạng đội hình dựa trên dữ liệu  Phù hợp về nguyên tắc; cần tuân thủ
  trận đấu                            quy định dữ liệu

  Xếp hạng trang bị và nâng cấp       Phù hợp về nguyên tắc

  Hướng dẫn cách chơi đội hình        Phù hợp

  AI giải thích cơ chế, đội hình,     Phù hợp nếu dùng dữ liệu hợp lệ
  trang bị và augment                 

  Phân tích lịch sử trận đấu sau game Phù hợp nếu tuân thủ quyền riêng tư
                                      và quy định truy cập

  Gợi ý đội hình trước trận           Phù hợp về định hướng

  Chỉ đạo thay đổi đội hình theo      Rủi ro cao; cần tránh nếu vi phạm
  trạng thái trận đấu real-time       Game Integrity Policy

  Theo dõi đội hình đối thủ trong     Không nên triển khai nếu thuộc nhóm
  trận                                thông tin hoặc theo dõi bị Riot cấm
  -----------------------------------------------------------------------

Các nguyên tắc cần kiểm tra trong policy:

-   Không tạo ứng dụng đưa ra quyết định thay người chơi.
-   Không cung cấp thông tin động trong trận nhằm trực tiếp tạo lợi thế
    không công bằng.
-   Không truy cập hoặc hiển thị thông tin người chơi đã chủ động ẩn.
-   Không hiển thị các thống kê bị Riot hạn chế, ví dụ win rate cho
    Legends và Legend-based Augments nếu policy hiện hành cấm.
-   Không tự động hóa hành động chơi game.

**Định hướng nên giữ cho TFTIQ Coach AI:** hỏi đáp về đội hình,
trang bị, augment, kinh tế, cơ chế và giải thích chiến thuật dựa trên
knowledge base có kiểm chứng. Tập trung vào pre-game preparation và
post-game learning.

Bảng trên là định hướng rà soát, không thay thế việc đối chiếu từng tính
năng với policy mới nhất của Riot.

**Hiện trạng trên site:** About có mục "What Coach AI is for" và Terms có
mục "Scope and liability", nói rõ Coach dành cho chuẩn bị trước trận và
xem lại sau trận, không đưa chỉ dẫn trực tiếp trong trận, không chạy
overlay và không theo dõi đối thủ. Site không có tính năng tự động chơi
hay đọc trạng thái trận real-time.

------------------------------------------------------------------------

## 5. Xác minh website/domain cho Production Key

Khi đăng ký Production Key, Riot có thể yêu cầu xác minh quyền kiểm soát
website/domain.

Quy trình tổng quát:

1.  Đăng ký Product/Production Key trên Riot Developer Portal.

2.  Làm theo hướng dẫn xác minh mà Riot cung cấp cho hồ sơ.

3.  Tạo file `riot.txt` chứa chính xác chuỗi xác minh được Riot cấp.

4.  Đặt file tại thư mục public/root của website.

5.  Deploy và kiểm tra file có thể truy cập công khai qua URL dạng:

    `https://your-domain.com/riot.txt`

6.  Gửi URL xác minh theo yêu cầu trên Developer Portal.

7.  Chờ Riot kiểm tra và xác nhận.

### Với dự án Next.js trên Vercel

Có thể đặt file tại:

``` text
apps/web/public/riot.txt
```

Sau khi deploy, file thường được phục vụ tại root URL:

``` text
https://your-domain.com/riot.txt
```

**Quan trọng:** Chỉ tạo file sau khi Riot cung cấp chuỗi xác minh. Không
tự bịa nội dung `riot.txt`. Cần kiểm tra hướng dẫn hiện hành trong hồ sơ
vì tên file hoặc quy trình có thể thay đổi.

### Đã làm (chuỗi Riot cấp ngày 2026-10-31)

Riot yêu cầu URL `https://tftiq.com/en/riot.txt` chứ không phải root, nên
route nằm ở `apps/web/app/[lang]/riot.txt/route.ts`: trả đúng 36 byte
token, `content-type: text/plain`, không xuống dòng, không redirect, và
middleware bỏ qua vì path có dấu chấm. Test giữ hành vi này ở
`apps/web/tests/riot-verify.spec.ts`.

Lưu ý còn lại: apex `tftiq.com` đang 308 sang `www.tftiq.com` (canonical).
Nếu bước kiểm tra của Riot không theo redirect, phải đổi domain trong
Vercel để apex tự phục vụ path này thay vì redirect.

------------------------------------------------------------------------

## 6. Checklist chuẩn bị

### Domain và website

-   [x] Mua domain riêng cho TFTIQ.
-   [x] Trỏ domain về Vercel và bật HTTPS (www là canonical).
-   [x] Đảm bảo homepage và các trang chính truy cập công khai.
-   [x] Kiểm tra website hiển thị tốt trên desktop và mobile.
-   [x] Đặt file xác minh tại `/{en,vi}/riot.txt`
    (`apps/web/app/[lang]/riot.txt/route.ts`, đúng 36 byte token, có test).

### Legal và liên hệ

-   [x] Thay email `.example` bằng email thật.
-   [x] Bổ sung Riot legal disclaimer nguyên văn.
-   [x] Rà soát Privacy Policy.
-   [x] Rà soát Terms of Service (có mục scope/liability).
-   [x] Làm rõ chính sách dữ liệu người dùng và cách liên hệ.
-   [x] Làm rõ free tier và gói Plus.

### Product và documentation

-   [x] Mô tả rõ nguồn dữ liệu TFT (Data Dragon; kế hoạch chuyển sang
    Riot API).
-   [x] Giải thích phương pháp xếp hạng đội hình.
-   [x] Giải thích cách đánh giá trang bị và nâng cấp.
-   [x] Có hướng dẫn sử dụng Coach AI — trang công khai
    `/{en,vi}/assistant/guide`, link ngay dưới phần giới thiệu của Coach:
    Coach trả lời gì, hỏi sao cho đúng, điều Coach không làm (không xem
    trận đang chạy, không theo dõi đối thủ, không hứa hạng), cách tính
    lượt/giọng nói/quota và dữ liệu tài khoản. Số quota đọc từ
    `freePlan`/`plusPlan`, không hard-code.
-   [x] Có ví dụ thực tế về giá trị sản phẩm mang lại.
-   [x] Kiểm tra các tính năng theo TFT Game Integrity Policy.
-   [x] Không có tính năng tự động chơi hoặc chỉ đạo người chơi theo
    trạng thái trận đấu real-time.

### Riot Developer Portal

-   [ ] Đăng ký TFTIQ thành một product riêng.
-   [ ] Chọn game Teamfight Tactics.
-   [x] Chuẩn bị mô tả use case bằng tiếng Anh (§8).
-   [x] Chuẩn bị website URL: `https://www.tftiq.com/`.
-   [ ] Chuẩn bị screenshots hoặc demo các tính năng chính.
-   [x] Chuẩn bị thông tin liên hệ của người vận hành
    (`support@tftiq.com`).
-   [ ] Xác minh domain nếu hồ sơ Production yêu cầu.
-   [x] Kiểm tra yêu cầu RSO: site không đăng nhập Riot và không hiển
    thị dữ liệu gắn với tài khoản Riot, nên chưa cần RSO.

------------------------------------------------------------------------

## 7. Loại API Key nên đăng ký

  Loại key      Mục đích
  ------------- -----------------------------------------
  Development   Phát triển và thử nghiệm
  Personal      Prototype hoặc sử dụng cá nhân/nhóm nhỏ
  Production    Sản phẩm public phục vụ cộng đồng

Với định hướng TFTIQ là sản phẩm public, mục tiêu dài hạn nên là
Production Key. Có thể dùng Development/Personal Key trong giai đoạn
phát triển nếu phù hợp với điều kiện Riot.

Tài liệu Riot từng nêu rate limit khởi điểm cho Production Key là 500
requests/10 giây và 30.000 requests/10 phút. Đây là thông số cần kiểm
tra lại trong Developer Portal tại thời điểm được cấp key; không nên
hard-code như giới hạn chắc chắn cho mọi ứng dụng.

Nếu TFTIQ chỉ cung cấp dữ liệu thống kê tổng hợp, có thể không cần
Riot Sign On (RSO). Nếu muốn người chơi đăng nhập Riot và xem lịch sử
trận đấu của chính họ, cần kiểm tra quy trình và điều kiện RSO riêng.

------------------------------------------------------------------------

## 8. Mẫu mô tả sản phẩm tiếng Anh để submit

Có thể dùng nội dung dưới đây làm bản nháp. Chỉ giữ các tuyên bố đúng
với tính năng và cách vận hành thực tế của TFTIQ.

### TFTIQ -- Teamfight Tactics Companion

**Product URL:** https://www.tftiq.com/\
**Game:** Teamfight Tactics

**Product Description:**

TFTIQ is an independent, bilingual (English and Vietnamese) companion
website for Teamfight Tactics. It is a static reference and learning
tool: it shows how the current set is being played, explains why boards
work, and lets players rehearse decisions away from the game. Nothing on
the site reads or reacts to a live match.

The site provides:

-   **Composition tier lists:** TFT compositions ranked S to D (plus a
    separate "situational" tier) for the current set. Each comp opens
    into its final board with unit positions, star levels, item
    priorities, active traits, augment picks and a round-by-round plan.
    The list can be filtered by playstyle.
-   **Item and augment tiers:** tiered rankings with a one-line verdict
    per entry, so a player can decide what to build and what to skip.
    Augments are tiered by fit with current boards; TFTIQ publishes no
    win-rate figures for augments.
-   **Champion, trait, item, augment and Wisp reference:** searchable
    pages for every piece of Set 18 content, with aggregated match
    statistics where they exist (average placement, top-4 rate, win
    rate, pick rate and sample size), recommended item builds, and the
    comps each unit appears in.
-   **Set tables and economy:** shop odds, champion pool sizes, gold
    income, loot tables, cashouts and drop rates, plus eight
    gold-spending plans tied to the round structure.
-   **Written guides:** fundamentals, economy, leveling, positioning and
    meta-reading articles in both languages.
-   **Practice tools:** a drag-and-drop team builder with shareable
    links (board, stars, items), a personal tier-list maker, and a comp
    quiz that scores the whole tier list against the units and items a
    player already has. All of it runs in the browser.
-   **Coach AI:** a question-and-answer assistant on champions, traits,
    items, augments, economy and mechanics. Answers are drawn from
    TFTIQ's curated Set 18 knowledge base and the site's own data, and
    each answer links the pages it used. It explains and quizzes; it
    never gives live in-game instructions. Text is available on the free
    account; the paid pass adds voice questions and read-aloud answers.

**Player benefit:** TFTIQ is built for pre-game preparation and
post-game review. It helps players understand why a comp is ranked where
it is, what to build first, how to spend gold, and how to reposition,
using the set's own numbers and the editor's reasoning rather than
guessing.

**Data sources:** champion, trait, item and augment icons and game
reference data come from Riot's public TFT game data published through
Data Dragon, and are stored and served from TFTIQ's own infrastructure;
the site makes no runtime call to Riot for them. Match statistics are
aggregated from publicly available TFT match records, reviewed by an
editor, and reduced to set-level comp, item, augment and unit rankings.
TFTIQ publishes only aggregate numbers: no individual player record,
profile, match history or leaderboard is shown, and Riot Sign On is not
used. TFTIQ does not currently call the Riot API in production; the site
states this on its About page, and match ingestion is being moved to the
official TFT API.

**What TFTIQ does not do:** it does not read, modify or interact with the
game client; it provides no in-game overlay, real-time recommendations
or opponent scouting, and does not track a match as it happens; it does
not automate gameplay or make decisions for the player; it does not
offer an alternative skill rating such as an MMR or ELO calculator.

**Free and paid access:** every comp, tier list, item ranking, augment
ranking, table and guide is free to read without an account. A free
account adds 60 Coach AI messages a month. An optional Plus pass
(99,000 VND for 30 days, non-renewing) raises the Coach quota and adds
voice input and read-aloud answers; it sells Coach usage, not data or
assets. There are no ads and nothing auto-renews. Plus checkout is
paused until this product is reviewed in the Riot Developer Portal.

**Review access:** Coach AI requires a free account (email sign-up) so
each turn can be counted; no payment is involved. Reviewers can browse
every ranking, table and guide without signing in.

TFTIQ is an independent third-party product and is not affiliated with
or endorsed by Riot Games.

------------------------------------------------------------------------

## 9. Thứ tự ưu tiên đề xuất

Trạng thái và việc còn lại, theo thứ tự:

1.  ~~Mua domain riêng~~ — xong; www là canonical, HTTPS và redirect
    đã hoạt động.
2.  ~~Sửa email placeholder và legal disclaimer~~ — xong; email thật,
    disclaimer nguyên văn, Terms có scope/liability.
3.  ~~Hoàn thiện mô tả nguồn dữ liệu và ranking methodology~~ — xong
    trên /about (chỉ nêu Data Dragon); câu trả lời về nguồn match data
    công khai và quyền dùng asset đã có ở §11. Checkout Plus đã tạm
    dừng bằng cờ `MEMBERSHIP_CHECKOUT=paused` trong khi chờ duyệt.
4.  ~~Rà soát Coach AI theo Game Integrity Policy~~ — xong; site nêu rõ
    phạm vi pre-game/post-game.
5.  **Screenshots, demo và product description tiếng Anh** — mô tả đã có
    ở §8; hướng dẫn dùng Coach đã có ở `/{en,vi}/assistant/guide`; còn
    screenshots và kiểm tra luồng đăng nhập Google trên domain mới (cần
    thêm redirect URI trong Google Console).
6.  **Đăng ký Product và xin Production Key:** thực hiện theo đúng yêu
    cầu hiển thị trong Riot Developer Portal; chuẩn bị `riot.txt` khi
    Riot cấp chuỗi.

## 10. Tài liệu chính thức cần đối chiếu

-   [Riot Developer Portal](https://developer.riotgames.com/)
-   [Riot Developer Portal --
    FAQs](https://developer.riotgames.com/docs/portal)
-   [Riot API
    Documentation](https://developer.riotgames.com/docs/portal)
-   [Riot Games Legal Jibber Jabber / General
    Policies](https://www.riotgames.com/en/legal)
-   [Riot Developer
    Policies](https://developer.riotgames.com/policies/general)

> Một số đường dẫn tài liệu Riot có thể được điều hướng hoặc cập nhật
> theo thời gian. Ưu tiên nội dung policy và hướng dẫn đang hiển thị
> trong Developer Portal khi nộp hồ sơ.

------------------------------------------------------------------------

## 11. Câu trả lời về quyền dùng match data và asset

Phần này là bản nháp để dán vào hồ sơ hoặc trả lời khi Riot hỏi. Mỗi
câu chỉ nên giữ nếu đúng với trạng thái sản phẩm tại thời điểm nộp.

### 11.1. Match data (tiếng Anh)

> TFTIQ only publishes aggregate statistics. We do not use RSO, do not
> access player accounts or private match histories, and never display
> statistics for an identifiable player, which matches Riot's approved
> "aggregate player stats (no specific players)" use case for a
> production key without RSO.
>
> Match records are currently aggregated from publicly available TFT
> match data, reviewed by our editors and reduced to comp, item and
> augment rankings. TFTIQ does not call the Riot API in production yet;
> our About page says so, and we are migrating ingestion to the official
> TFT API. We do not redistribute raw match data or expose any
> player-level record.

### 11.2. Assets (tiếng Anh)

> TFTIQ uses Riot's TFT static assets only: champion, trait, item and
> augment icons. They come from Riot's published TFT game data, shown
> on our About page as Data Dragon, and are stored and served from our
> own infrastructure — the site makes no runtime request to Riot for
> them. Assets are used only to identify game content inside an original
> product; they are not resold, sublicensed, or offered as merchandise,
> and the paid plan sells Coach AI usage limits, not assets or data.

### 11.3. Trả lời ngắn nếu bị hỏi tiếp

-   **"Do you charge for access to Riot data?"** — "The paid plan sells
    additional Coach AI usage, not data access. Every ranking is free to
    browse and the free tier includes Coach messages, as the monetization
    policy requires."
-   **"Do you show win rates for Legends or Legend-based Augments?"** —
    "No. Augments are shown as tier and note with no win-rate column,
    and Set 18 has no Legends."
-   **"Do you use RSO or display player stats?"** — "No. Only aggregate
    stats across many matches; no identifiable player data."

### 11.4. Căn cứ trong policy (nguồn để trích dẫn)

-   **General Policies** (cập nhật 29/05/2025,
    <https://developer.riotgames.com/policies/general>):
    -   Asset được phép: "Data Dragon, Press Kit, TFT Assets, LOR
        Assets". CommunityDragon **không** nằm trong danh sách này.
    -   "Products should use supported services from Riot Games for data
        ingestion."
    -   Monetization: sản phẩm phải được đăng ký và ở trạng thái
        **Approved hoặc Acknowledged**; phải có free tier; nội dung thu
        phí phải transformative; subscription là cách thu tiền được
        chấp nhận.
-   **TFT Developer Docs** (<https://developer.riotgames.com/docs/tft>):
    -   Use case được duyệt cho Production Key không cần RSO:
        "Aggregate player stats (no specific players)."
    -   "Having a static recommendation for a player pre-game is
        acceptable" — đúng hướng tier list/Coach của TFTIQ.
    -   "Products cannot display win rates for Legends and Legend-based
        Augments." Site hiện không có cột win rate cho augment.
    -   "Products may not provide information that was not available
        prior to the game" — mọi thứ TFTIQ hiển thị đều là dữ liệu
        trước trận.
-   **API Terms** (cập nhật 09/12/2013,
    <https://developer.riotgames.com/terms>): nếu "charge for access to
    Game Information", phải thông báo Riot và có phê duyệt bằng văn bản
    trước — tức là chính bước đăng ký sản phẩm + monetization review.
-   **Legal Jibber Jabber** (<https://www.riotgames.com/en/legal>):
    license mặc định là noncommercial; ngoại lệ cho sản phẩm thương mại
    yêu cầu tuân thủ API Terms/Policies **và** có API key hợp lệ do Riot
    cấp.
-   **CommunityDragon docs** (<https://www.communitydragon.org/docs>):
    asset "owned by Riot Games", Riot "does not endorse or sponsor" dự
    án, và CommunityDragon không cấp license. Quyền dùng đến từ policy
    của Riot, không đến từ mirror này.

### 11.5. Phải chốt trước khi gửi hồ sơ

1.  ~~Trạng thái monetization~~ — đã xử lý: checkout Plus tắt bằng cờ
    `MEMBERSHIP_CHECKOUT=paused` (web pricing hiện "Tạm dừng bán",
    `/checkout?plan=plus` đóng, `POST /orders` trả 409 `checkout_paused`);
    đơn cũ và biên lai vẫn mở. **Cần bật cờ trên cả Vercel và Render rồi
    redeploy trước khi nộp hồ sơ**; chỉ mở lại sau khi sản phẩm được
    Approved/Acknowledged.
2.  **Nguồn match data.** Câu trả lời trên nói thật là chưa dùng Riot
    API. Nếu muốn câu trả lời mạnh nhất, chuyển ingestion sang TFT API
    trước khi nộp rồi đổi thành "from the Riot API".
3.  ~~CommunityDragon~~ — đã bỏ khỏi copy người dùng (About EN/VI, mô tả
    hạn chế của Coach) và khỏi câu trả lời; asset vẫn là file Riot được
    serve từ hạ tầng của mình. Nếu Riot hỏi thẳng tệp được lấy về bằng
    cách nào, trả lời thật; policy ghi rõ asset được phép là Data Dragon,
    Press Kit, TFT Assets, LOR Assets.
4.  **Nếu Riot hỏi thẳng tên feed match data hiện tại,** trả lời thật
    kèm kế hoạch chuyển sang Riot API. Không nên nói đang dùng Riot API
    khi chưa dùng — sai một câu ở đây có thể mất key.
5.  **Đã kiểm tra trên site:** không có cột win rate cho augment, không
    có Legends trong Set 18, free tier tồn tại, disclaimer Riot có ở
    footer và trang legal.

------------------------------------------------------------------------

## Kết luận

TFTIQ đã có domain riêng, thông tin liên hệ, pháp lý và phần giải thích
nguồn dữ liệu/ranking trên site. Trước khi nộp còn: thêm redirect URI
Google cho `https://www.tftiq.com/api/auth/google/callback`, chụp
screenshots, chốt hai câu trả lời ở mục 11 (và xử lý các điểm ở 11.5).
`riot.txt` đã có ở `/{en,vi}/riot.txt` với đúng chuỗi Riot cấp, chờ
deploy lên `www.tftiq.com` để bấm Verify.

Mục tiêu nên là đăng ký TFTIQ như một TFT companion platform độc
lập, có giá trị phân tích và giáo dục rõ ràng, thay vì chỉ là website
hiển thị dữ liệu game.
