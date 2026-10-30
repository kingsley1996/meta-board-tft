# Checklist đăng ký TFTIQ TFT trên Riot Developer Portal

**Website hiện tại:** https://meta-board-tft.vercel.app/\
**Domain riêng (đã có, chờ trỏ DNS):** https://tftiq.com/\
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

Website hiện tại đang chạy trên Vercel:

`https://meta-board-tft.vercel.app/`

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

-   `tftiq.com` — đã mua, mail `support@` / `admin@` đang chạy trên domain này

Không có yêu cầu phải dùng riêng `.com` hay `.gg`; domain riêng có lợi
cho việc chứng minh quyền kiểm soát, nhận diện thương hiệu và duy trì
sản phẩm lâu dài.

**Khuyến nghị:** Trỏ domain riêng về Vercel, bật HTTPS và giữ website
công khai, ổn định trước khi gửi hồ sơ.

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

### 3.2. Bổ sung Riot legal disclaimer nguyên văn

Nên bổ sung legal boilerplate của Riot vào footer hoặc trang About. Giữ
nguyên văn bản tiếng Anh sau:

> This product isn't endorsed by Riot Games and doesn't reflect the
> views or opinions of Riot Games or anyone officially involved in
> producing or managing Riot Games properties. Riot Games, and all
> associated properties are trademarks or registered trademarks of Riot
> Games, Inc.

Có thể giữ thêm bản dịch tiếng Việt để người dùng dễ hiểu, nhưng không
thay thế đoạn tiếng Anh bắt buộc bằng bản dịch tự viết.

### 3.3. Làm rõ nguồn dữ liệu và phương pháp xếp hạng

Nên có một phần giải thích ngắn, dễ tìm về:

-   Nguồn dữ liệu: Riot API, Data Dragon và các nguồn dữ liệu được phép
    sử dụng.
-   Cách thu thập, xử lý và tổng hợp dữ liệu trận đấu.
-   Phương pháp tính điểm hoặc xếp hạng đội hình.
-   Các yếu tố được dùng để đánh giá trang bị và nâng cấp.
-   Tần suất cập nhật dữ liệu.
-   Phần nào là thống kê, phần nào là phân tích hoặc đánh giá do
    TFTIQ tạo ra.

Không nên mô tả dữ liệu là dữ liệu real-time hoặc chính thức nếu thực tế
không phải như vậy. Cần bảo đảm mô tả trên website khớp với cách hệ
thống đang vận hành.

### 3.4. Rà soát mô hình monetization

TFTIQ có đề cập gói Plus trong Terms of Service. Cần mô tả rõ giá
trị của gói miễn phí và gói trả phí.

Ví dụ định hướng:

  Free                                Plus
  ----------------------------------- -------------------------------------------
  Xem bảng xếp hạng đội hình          AI Coach nâng cao
  Xem xếp hạng trang bị và nâng cấp   Phân tích chuyên sâu
  Tra cứu thông tin TFT cơ bản        Hướng dẫn cá nhân hóa
  Đọc hướng dẫn                       Công cụ học và cải thiện kỹ năng nâng cao

Riot có chính sách riêng về monetization. Cần kiểm tra điều kiện hiện
hành, bao gồm yêu cầu về trạng thái phê duyệt/ghi nhận sản phẩm, free
tier và giá trị bổ sung của nội dung trả phí. Không nên triển khai thanh
toán hoặc quảng bá gói trả phí dựa trên giả định rằng mọi mô hình đều
được chấp thuận.

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

-   [ ] Mua domain riêng cho TFTIQ.
-   [ ] Trỏ domain về Vercel và bật HTTPS.
-   [ ] Đảm bảo homepage và các trang chính truy cập công khai.
-   [ ] Kiểm tra website hiển thị tốt trên desktop và mobile.
-   [ ] Chuẩn bị khả năng đặt file xác minh tại root website.

### Legal và liên hệ

-   [ ] Thay email `.example` bằng email thật.
-   [ ] Bổ sung Riot legal disclaimer nguyên văn.
-   [ ] Rà soát Privacy Policy.
-   [ ] Rà soát Terms of Service.
-   [ ] Làm rõ chính sách dữ liệu người dùng và cách liên hệ.
-   [ ] Làm rõ free tier và gói Plus.

### Product và documentation

-   [ ] Mô tả rõ nguồn dữ liệu TFT.
-   [ ] Giải thích phương pháp xếp hạng đội hình.
-   [ ] Giải thích cách đánh giá trang bị và nâng cấp.
-   [ ] Có hướng dẫn sử dụng Coach AI.
-   [ ] Có ví dụ thực tế về giá trị sản phẩm mang lại.
-   [ ] Kiểm tra các tính năng theo TFT Game Integrity Policy.
-   [ ] Không có tính năng tự động chơi hoặc chỉ đạo người chơi theo
    trạng thái trận đấu real-time.

### Riot Developer Portal

-   [ ] Đăng ký TFTIQ thành một product riêng.
-   [ ] Chọn game Teamfight Tactics.
-   [ ] Chuẩn bị mô tả use case bằng tiếng Anh.
-   [ ] Chuẩn bị website URL.
-   [ ] Chuẩn bị screenshots hoặc demo các tính năng chính.
-   [ ] Chuẩn bị thông tin liên hệ của người vận hành.
-   [ ] Xác minh domain nếu hồ sơ Production yêu cầu.
-   [ ] Kiểm tra yêu cầu RSO nếu có tính năng đăng nhập Riot hoặc truy
    xuất dữ liệu gắn với tài khoản người chơi.

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

**Product URL:** https://tftiq.com/\
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

TFTIQ is an independent third-party product and is not affiliated
with or endorsed by Riot Games.

------------------------------------------------------------------------

## 9. Thứ tự ưu tiên đề xuất

Nếu chuẩn bị hồ sơ ngay bây giờ, nên làm theo thứ tự:

1.  **Mua domain riêng:** Đây là khoản đầu tư nhỏ nhưng có lợi cho
    thương hiệu và quy trình xác minh.
2.  **Sửa email placeholder và legal disclaimer:** Đây là các lỗi dễ
    nhận thấy trên website công khai.
3.  **Hoàn thiện mô tả nguồn dữ liệu và ranking methodology:** Giúp Riot
    hiểu TFTIQ tạo ra giá trị gì.
4.  **Rà soát Coach AI theo Game Integrity Policy:** Đảm bảo không có
    tính năng hỗ trợ chơi game theo cách bị hạn chế.
5.  **Chuẩn bị screenshots, demo và product description tiếng Anh.**
6.  **Đăng ký Product và xin Production Key:** Thực hiện theo đúng yêu
    cầu được hiển thị trong Riot Developer Portal.

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

TFTIQ đã có nền tảng sản phẩm tương đối đầy đủ để bắt đầu chuẩn bị
hồ sơ Riot Developer Portal. Không cần xây dựng lại website chỉ để đăng
ký. Việc nên ưu tiên là mua domain riêng, hoàn thiện thông tin liên hệ
và pháp lý, giải thích minh bạch nguồn dữ liệu và phương pháp ranking,
sau đó rà soát toàn bộ tính năng Coach AI theo TFT Game Integrity
Policy.

Mục tiêu nên là đăng ký TFTIQ như một TFT companion platform độc
lập, có giá trị phân tích và giáo dục rõ ràng, thay vì chỉ là website
hiển thị dữ liệu game.
