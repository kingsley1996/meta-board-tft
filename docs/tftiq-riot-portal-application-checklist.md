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
    lấy từ dữ liệu game công khai của Riot qua Data Dragon và
    CommunityDragon; số liệu trận tổng hợp từ dữ liệu trận TFT công
    khai, được biên tập viên rà lại; nêu rõ **chưa gọi Riot API trên
    production** và kế hoạch chuyển sang Riot API.
-   **How fresh it is** — làm mới theo patch hoặc bản dữ liệu trận mới;
    thanh patch ghi ngày của dữ liệu đang đọc (không còn claim "hằng
    ngày").
-   **What is ours** — phần nào là thống kê, phần nào là phân tích của
    TFTIQ.

Mô tả trên site khớp với vận hành hiện tại: dữ liệu đang đọc là snapshot
`2026-10-27`, patch 18.5b, và ngày này hiển thị trên thanh patch.

**Còn phải chuẩn bị cho hồ sơ:** câu trả lời về tính hợp lệ của nguồn
dữ liệu trận công khai đang dùng, và xác nhận quyền dùng asset game
(CommunityDragon) trên sản phẩm có thu phí theo chính sách hiện hành.

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

------------------------------------------------------------------------

## 6. Checklist chuẩn bị

### Domain và website

-   [x] Mua domain riêng cho TFTIQ.
-   [x] Trỏ domain về Vercel và bật HTTPS (www là canonical).
-   [x] Đảm bảo homepage và các trang chính truy cập công khai.
-   [x] Kiểm tra website hiển thị tốt trên desktop và mobile.
-   [x] Chuẩn bị khả năng đặt file xác minh tại root website
    (`apps/web/public/riot.txt`, chưa tạo vì chưa có chuỗi từ Riot).

### Legal và liên hệ

-   [x] Thay email `.example` bằng email thật.
-   [x] Bổ sung Riot legal disclaimer nguyên văn.
-   [x] Rà soát Privacy Policy.
-   [x] Rà soát Terms of Service (có mục scope/liability).
-   [x] Làm rõ chính sách dữ liệu người dùng và cách liên hệ.
-   [x] Làm rõ free tier và gói Plus.

### Product và documentation

-   [x] Mô tả rõ nguồn dữ liệu TFT (Data Dragon, CommunityDragon; kế
    hoạch chuyển sang Riot API).
-   [x] Giải thích phương pháp xếp hạng đội hình.
-   [x] Giải thích cách đánh giá trang bị và nâng cấp.
-   [ ] Có hướng dẫn sử dụng Coach AI.
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

TFTIQ is an independent Teamfight Tactics companion platform
designed to help players understand the current game meta and improve
their gameplay through data-driven insights and educational tools.

The platform provides:

-   **Composition Tier Lists:** Data-driven rankings of TFT team
    compositions based on match statistics and additional evaluation.
-   **Item & Augment Rankings:** Insights into item and augment
    effectiveness to help players make better strategic decisions.
-   **Game Knowledge Base:** Searchable information about champions,
    traits, items, augments, and game mechanics.
-   **AI TFT Coach:** An AI-powered assistant that explains
    compositions, itemization, economy strategies, and game mechanics
    using structured TFT knowledge.
-   **Educational Guides:** Guides and learning resources that help
    players understand strategic decisions and improve over time.

**Player Benefit:**

TFTIQ aims to help TFT players make more informed decisions,
understand the reasoning behind different strategies, and improve their
gameplay through educational content and statistical insights.

The platform focuses on pre-game preparation and post-game learning. It
does not provide real-time gameplay instructions, automate player
decisions, or track opponents during matches.

**Data sources:** champions, traits, items, augments and icons come from
Riot's public game data published through Data Dragon and the
CommunityDragon mirror. Match statistics are aggregated from publicly
available TFT match data and reviewed by the operator; ingestion is
planned to move to the Riot API. TFTIQ does not currently call the Riot
API in production.

**Free and paid tiers:** every comp, tier list, item ranking, augment
ranking and guide is free to read. An optional Plus pass (99,000 VND for
30 days) adds voice input, read-aloud answers and a larger Coach quota.
It does not auto-renew and there are no ads.

**Review access:** Coach AI requires sign-in. Reviewers can sign in with
Google; a free account includes 60 Coach messages a month. TFTIQ does
not use Riot Sign On and does not display Riot account data.

TFTIQ is an independent third-party product and is not affiliated
with or endorsed by Riot Games.

------------------------------------------------------------------------

## 9. Thứ tự ưu tiên đề xuất

Trạng thái và việc còn lại, theo thứ tự:

1.  ~~Mua domain riêng~~ — xong; www là canonical, HTTPS và redirect
    đã hoạt động.
2.  ~~Sửa email placeholder và legal disclaimer~~ — xong; email thật,
    disclaimer nguyên văn, Terms có scope/liability.
3.  ~~Hoàn thiện mô tả nguồn dữ liệu và ranking methodology~~ — xong
    trên /about; còn chuẩn bị câu trả lời về nguồn match data công khai
    và quyền dùng asset CommunityDragon.
4.  ~~Rà soát Coach AI theo Game Integrity Policy~~ — xong; site nêu rõ
    phạm vi pre-game/post-game.
5.  **Screenshots, demo và product description tiếng Anh** — mô tả đã có
    ở §8; còn screenshots và kiểm tra luồng đăng nhập Google trên domain
    mới (cần thêm redirect URI trong Google Console).
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

## Kết luận

TFTIQ đã có domain riêng, thông tin liên hệ, pháp lý và phần giải thích
nguồn dữ liệu/ranking trên site. Trước khi nộp chỉ còn: thêm redirect URI
Google cho `https://www.tftiq.com/api/auth/google/callback`, chụp
screenshots, chuẩn bị câu trả lời về nguồn match data và quyền dùng asset,
rồi tạo `riot.txt` khi Riot cấp chuỗi xác minh.

Mục tiêu nên là đăng ký TFTIQ như một TFT companion platform độc
lập, có giá trị phân tích và giáo dục rõ ràng, thay vì chỉ là website
hiển thị dữ liệu game.
