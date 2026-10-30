# Unit economics — paid pilot Free + Plus (#92)

Ngày lập: 2026-10-30. Cập nhật cùng ngày sau khi user nhân đôi quota. Trạng thái: **đã được user
duyệt ngày 2026-10-30**; bảng giá §2 đã vào code ở [tariff.ts](../apps/api/src/membership/tariff.ts)
dưới version `2026-10-30`. Bổ sung cùng ngày (user duyệt): giá `google/gemini-3.5-flash-lite`, model
mà production thực sự đang gọi — hệ quả ở §4.1.
Offer đang xét: Plus 99.000đ/30 ngày, 300 chat, 1.200 giây STT, 10.000 ký tự TTS; Free 60 chat/tháng
(12/ngày). Bản trước khi nhân đôi (150 / 600 s / 5.000 ký tự, Free 30) có biến phí 11,4% cơ sở và
20,0% p95; §4 ghi lại cả hai để thấy bước nhảy.

Báo cáo này không gọi provider hosted nào. Giá lấy từ trang giá công bố, còn khối lượng lấy từ
fixture đã ghi trong DB dev (`assistant_reasoning_logs`) và từ code đang chạy. Mọi chỗ là giả định
đều được đánh dấu; con số ước tính không được trình bày như hoá đơn thật.

## 1. Phương pháp và nguồn

| Thành phần | Nguồn | Ghi chú |
| --- | --- | --- |
| Prompt/token mỗi lượt | `assistant_reasoning_logs` trên PostgreSQL dev: 920 request, 286 request có gọi model (31%), 638 request trả lời deterministic; 65 lần gọi có `inputTokens`/`outputTokens` thật | Số token do provider trả về khi chạy dev, không phải ước lượng |
| Kích thước system prompt | `buildSystemPrompt` chạy trực tiếp: 5.545 ký tự (không có mechanics), 6.840 ký tự (có mechanics primer) | Đo bằng code, không gọi model |
| Alias extraction | `unresolved-entity-detection.ts`: system prompt 847 ký tự, `maxOutputTokens: 250`, chạy sau mỗi câu trả lời không phải injection | Tính là một call riêng mỗi turn |
| Giá provider | Trang giá công bố, xem bảng §2 | Có ngày truy cập |
| Tỷ giá | 25.834,04 VND/USD, open.er-api.com cập nhật 2026-10-29 | Giả định; thẻ quốc tế có thể tính cao hơn 1–3% |
| Payment fee | sepay.vn/bang-gia.html | Gói theo giao dịch, chưa gồm VAT 8% |
| Cost ledger | `costLedger()` trong `apps/api/src/membership/cost.ts` | Dev hiện có **0** `usage_attempts`, nên chưa có actual billing để đối chiếu |

Vì ledger chưa có dòng nào, báo cáo này là **estimate từ fixture + tariff**. Khi bật
`MEMBERSHIP_ENFORCEMENT=enforce`, `costLedger()` với đúng bảng giá dưới đây sẽ là nguồn đối chiếu
thật giữa estimate và hoá đơn (điều kiện của #96).

## 2. Tariff công bố

Truy cập ngày 2026-10-30. Cột micro-VND là đơn vị `cost_micro_vnd` của ledger: VND × 1.000.000,
làm tròn lên.

| Provider / model | Đơn vị | Giá công bố | Nguồn | micro-VND/đơn vị |
| --- | --- | --- | --- | --- |
| shopaikey `gpt-6-luna` | input token | $0,24 / 1M token | api.shopaikey.com/pricing | 6.200 |
| shopaikey `gpt-6-luna` | output token | $0,90 / 1M token | api.shopaikey.com/pricing | 23.251 |
| Google `gemini-3.5-flash-lite` | input token | $0,30 / 1M token | ai.google.dev/gemini-api/docs/pricing | 7.750 |
| Google `gemini-3.5-flash-lite` | output token | $2,50 / 1M token | ai.google.dev/gemini-api/docs/pricing | 64.585 |
| Deepgram `nova-3` | audio second | $0,0077 / phút | deepgram.com/pricing | 3.315.368 |
| Groq `whisper-large-v3-turbo` | audio second | $0,04 / giờ | console.groq.com docs | 287.045 |
| Deepgram `aura-2` (TTS en) | character | $0,030 / 1.000 ký tự | deepgram.com/pricing | 775.021 |
| Deepgram `flux` (TTS vi, dự phòng) | character | $0,045 / 1.000 ký tự | deepgram.com/pricing | 1.162.532 |
| VieNeu (TTS vi) | character | 965đ / 1.000 ký tự (Starter) | vieneu.io | 965.000 |

Lưu ý về cách tính giá:

- **shopaikey là reseller**, không phải giá gốc OpenAI. Cùng ngày, giá list OpenAI cho `gpt-6-luna`
  là $0,10/$0,50; reseller tính $0,24/$0,90. Báo cáo dùng giá reseller vì đó là hoá đơn thật.
  Nếu chuyển sang key OpenAI trực tiếp, chi phí text giảm khoảng 55% (một answer call p50 từ 17,72đ
  xuống 8,00đ).
- **Google là giá trực tiếp**, không qua reseller: `gemini-3.5-flash-lite` chạy bằng `GEMINI_API_KEY` trên
  Render nên hoá đơn là bảng giá công bố của Google. Bảng giá này được thêm cùng ngày 2026-10-30 sau khi
  ledger production cho thấy model thật của lượt Coach là `google/gemini-3.5-flash-lite`, không phải
  `gpt-6-luna` mà §3.1 giả định — xem hệ quả ở §4.1.
- **VieNeu tính theo token gói**, không theo ký tự. Trang giá quy đổi công bố: Starter 99.000đ /
  400.000 token / ~2 giờ audio = 965đ/1.000 ký tự; Creator 777đ; Pro 623đ; Studio 549đ; gói năm 487đ.
  Ledger của mình đếm `character`, nên dùng luôn đơn giá ký tự công bố thay vì tự quy đổi token.
  Gói có hạn 6–12 tháng: mua rồi không dùng hết thì đơn giá hiệu dụng tăng, đúng như cảnh báo §9.
- **Groq rẻ hơn Deepgram ~11,6 lần mỗi phút STT** (17,2đ so với 198,9đ). Chain hiện tại thử Deepgram
  trước, nên báo cáo tính theo Deepgram và coi Groq là biên an toàn.
- **SePay**: Free 0đ/50 giao dịch/tháng; Startup 120.000đ/tháng cho 180 giao dịch (~667đ/giao dịch,
  ~720đ nếu cộng VAT 8%). Các gói cao hơn giảm dần còn ~486đ/giao dịch ở mức 5.100 giao dịch.
  Dưới 50 đơn/tháng, phí payment thực tế bằng 0.

## 3. Chi phí đơn vị

### 3.1 Một lượt text

Số đo thật từ 65 lần gọi có usage: input p50 **2.138** token, p95 **3.187**; output p50 **192**,
p95 **1.958**. Tỷ lệ đo được là ~3,3 ký tự/token, khớp với system prompt 5,5–6,8 KB cộng evidence JSON.

| Khoản | Công thức | Chi phí |
| --- | --- | --- |
| Một answer call (p50) | 2.138 in + 192 out | **17,72đ** |
| Một answer call (p95) | 3.187 in + 1.958 out | **65,28đ** |
| Alias extraction mỗi turn | ~350 in + 60 out | **3,57đ** |
| Một turn, 1,2 call + extraction | giả định có tool planning/retry nhẹ | **24,8đ** |
| Một turn, 2,6 call + extraction | tỷ lệ đo được trên dev (745 call / 286 request) | **49,6đ** |
| Một turn ở p95 | 1,2 call p95 + extraction | **81,9đ** |

Quan trọng: **69% request dev không gọi model** (trả lời deterministic). Ở tỷ lệ đó, chi phí text
thực tế bình quân chỉ ~7,7đ/turn. Báo cáo vẫn dùng giả định 100% turn gọi model để tính offer.

### 3.2 STT

| Provider | Giá/phút | Ghi chú |
| --- | --- | --- |
| Deepgram `nova-3` | **198,9đ** | Provider đầu chuỗi |
| Groq `whisper-large-v3-turbo` | **17,2đ** | Fallback, rẻ hơn ~11,6× |

1.200 giây STT của Plus = 20 phút = **3.978đ** nếu tất cả đi Deepgram.

### 3.3 TTS (mỗi 1.000 ký tự)

| Engine | Locale | Chi phí/1.000 ký tự | 10.000 ký tự Plus |
| --- | --- | --- | --- |
| VieNeu Starter | vi | **965đ** | **9.650đ** |
| VieNeu Creator (gói 299K) | vi | 777đ | 7.770đ |
| Deepgram `aura-2` | en | **775đ** | **7.750đ** |
| Deepgram `flux` | vi (dự phòng) | **1.163đ** | **11.625đ** |

Kịch bản xấu nhất cho TTS là một user tiếng Việt rơi vào Flux: 11.625đ, gấp 1,2 lần VieNeu.

Engine chính của tiếng Việt là cấu hình, không phải hằng số: `render.yaml` đặt `TTS_PROVIDER=vieneu`
nên bảng §4 dùng VieNeu cho cột "cơ sở"; nếu biến này bỏ trống hoặc đặt `deepgram` (giá trị mặc định
trong code), mọi chunk tiếng Việt đi `flux-minh-vi` và cột cơ sở thành **23.772đ (24,0%)**, tức ngay
sát kịch bản xấu. Đổi engine là đổi biến môi trường, nên con số này phải đọc cùng cấu hình deploy.

### 3.4 Retry, failure và unknown

- Dev ghi 131 sự kiện lỗi trên 745 lần gọi (17,6%) và 2 retry tường minh. Nếu mỗi lần lỗi có thể
  đã bị tính tiền, cộng thêm ~3,2đ mỗi call (~4đ/turn). Con số này nằm trong kịch bản "2,6 call".
- Một call ở trạng thái `unknown` **không được coi là miễn phí** và không được dispatch lại; báo cáo
  giữ nó ở cột chi phí chứ không loại khỏi mẫu.
- Alias extraction chạy sau mỗi answer, kể cả khi câu trả lời là deterministic; nó tốn tiền nhưng
  không trừ thêm lượt của user. Đã tính 3,57đ/turn ở trên.
- Chưa có background extraction hay batch job nào khác gọi model.

## 4. Một user Plus dùng hết quota (30 ngày)

Quota sau khi nhân đôi: 300 chat, 1.200 giây STT, 10.000 ký tự TTS.

| Kịch bản | Chat (300) | STT (1.200 s) | TTS (10.000) | Payment | Tổng | % 99.000đ |
| --- | --- | --- | --- | --- | --- | --- |
| Cơ sở, vi, VieNeu | 7.449đ | 3.978đ | 9.650đ | 720đ | **21.797đ** | **22,0%** |
| Cơ sở, en, Aura-2 | 7.449đ | 3.978đ | 7.750đ | 720đ | **19.897đ** | **20,1%** |
| Xấu: 2,6 call/turn + Flux | 14.891đ | 3.978đ | 11.625đ | 720đ | **31.214đ** | **31,5%** |
| Đuôi p95, vi | 24.572đ | 3.978đ | 9.650đ | 720đ | **38.920đ** | **39,3%** |

So với bản trước khi nhân đôi (11,4% / 10,4% / 16,1% / 20,0%), tỷ lệ gần như gấp đôi vì giá bán
không đổi trong khi khối lượng tăng 2×. Hệ quả: **kịch bản cơ sở vẫn dưới ngưỡng 30%, nhưng kịch
bản xấu nhất và đuôi p95 đã vượt.** Đây là trade-off của ×2, không phải sai số.

Phần đóng góp trên mỗi kỳ Plus ở kịch bản cơ sở còn **77.203đ** trước hạ tầng cố định và support
(giảm từ 87.741đ).

Nếu user chỉ dùng text (không voice), biến phí là **7.449đ/kỳ (7,5%)** — vẫn an toàn ở mọi kịch bản.

Đường thoát cho kịch bản xấu: chuyển text sang key OpenAI trực tiếp (bảng giá §2 → §7). Khi đó kịch
bản xấu nhất còn **23.069đ (23,3%)**, cơ sở còn **17.733đ (17,9%)**.

### 4.1 Nếu text chạy Gemini 3.5 Flash-Lite (cấu hình production hiện tại)

Ledger production ngày 2026-10-30 cho thấy lượt Coach thật gọi `google/gemini-3.5-flash-lite`, không
phải `gpt-6-luna` mà §3.1 dùng. Với cùng khối lượng token đo được, đơn giá mới cao hơn ở cả hai chiều:

| Khoản | `gpt-6-luna` | `gemini-3.5-flash-lite` |
| --- | --- | --- |
| Answer call p50 (2.138 in + 192 out) | 17,72đ | **28,97đ** |
| Answer call p95 (3.187 in + 1.958 out) | 65,28đ | **151,16đ** |
| Alias extraction (~350 in + 60 out) | 3,57đ | **6,59đ** |
| Một turn, 1,2 call | 24,8đ | **41,4đ** |
| Một turn, 2,6 call | 49,6đ | **81,9đ** |
| Một turn ở p95 | 81,9đ | **188,0đ** |

| Kịch bản | Chat (300) | STT (1.200 s) | TTS (10.000) | Payment | Tổng | % 99.000đ |
| --- | --- | --- | --- | --- | --- | --- |
| Cơ sở, vi, VieNeu | 12.405đ | 3.978đ | 9.650đ | 720đ | **26.753đ** | **27,0%** |
| Xấu: 2,6 call/turn + Flux | 24.573đ | 3.978đ | 11.625đ | 720đ | **40.896đ** | **41,3%** |
| Đuôi p95, vi | 56.394đ | 3.978đ | 9.650đ | 720đ | **70.742đ** | **71,5%** |

Kết luận: với model đang chạy, cơ sở vẫn dưới 30% nhưng **kịch bản xấu nhất vượt (41,3%)** và đuôi
p95 vượt xa (71,5%). Hai lựa chọn, đều cần chủ project quyết: (a) đưa text về `gpt-6-luna` đã duyệt
(quay lại 22,0% / 31,5% / 39,3%), hoặc (b) giữ Gemini cho tốc độ và duyệt lại ngưỡng biên. Free cũng
tăng theo: 60 lượt × 41,4đ = **2.481đ/user/tháng** ở giả định mọi lượt gọi model.

Hai entry Gemini được thêm vào chính version `2026-10-30` chứ không tạo version mới: trước đó chưa có
attempt nào được tính giá (toàn bộ 27 dòng đều `NULL`), nên không có số lịch sử nào bị viết lại.

## 5. Free fleet

Free không có STT/TTS, chỉ 60 chat/tháng (12/ngày).

| Giả định | Chi phí mỗi user/tháng | 1.000 Free MAU |
| --- | --- | --- |
| Tất cả 60 lượt gọi model (cơ sở) | **1.490đ** | **1.490.000đ** |
| Tỷ lệ dev 31% lượt gọi model | 462đ | 462.000đ |
| 40% MAU hoạt động, dùng 50% quota | — | ~298.000đ |

Free fleet là khoản biến phí không có doanh thu tương ứng. Ở quy mô pilot vài trăm user, nó nằm
dưới 600.000đ/tháng; nó chỉ thành vấn đề nếu Free tăng lên hàng nghìn MAU trước khi có doanh thu.

## 6. Hạ tầng cố định và support

Không trộn vào biến phí ở trên. Hiện tại: Render API (blueprint `plan: starter`, Singapore), Vercel
cho web, Supabase cho Postgres. Báo cáo này **không** khẳng định giá tier đang trả vì chưa đọc hoá đơn;
#94 phải chốt con số thật.

Điểm hoà vốn theo biến phí cơ sở (77.203đ đóng góp/kỳ):

| Hạ tầng cố định/tháng | Số Plus cần để phủ |
| --- | --- |
| 300.000đ | 4 |
| 650.000đ | 9 |

Nếu pilot bán được 20 kỳ Plus/tháng, đóng góp ~1,54 triệu đồng trước hạ tầng và support.

## 7. Độ nhạy

| Thay đổi | Tác động lên kịch bản cơ sở vi | Tổng |
| --- | --- | --- |
| Tỷ giá 27.000 thay vì 25.834 (+4,5%) | Phần USD tăng 4,5%, VieNeu giữ nguyên | 22.313đ (22,5%) |
| Token/lượt ×1,5 | Chat 7.449 → 10.638 | 24.986đ (25,2%) |
| Tỷ giá +4,5% và token ×1,5 cùng lúc | — | 25.166đ (25,4%) |
| STT rơi hết sang Groq | STT 3.978 → 344 | 18.163đ (18,3%) |
| Bỏ alias extraction | Chat −1.070 | 20.727đ (20,9%) |
| Chuyển text sang key OpenAI trực tiếp | Chat 7.449 → 3.385 | 17.733đ (17,9%) |
| Text chạy `gemini-3.5-flash-lite` (production) | Chat 7.449 → 12.405 | 26.753đ (27,0%) |

Ở kịch bản xấu nhất (2,6 call/turn + Flux), chuyển text sang key OpenAI trực tiếp kéo tổng từ
31.214đ xuống **23.069đ (23,3%)** — tức dưới ngưỡng 30% mà không cần hạ quota.

Kết luận độ nhạy: cơ sở chỉ còn dư ~8 điểm phần trăm tới ngưỡng 30% (bản trước là ~19 điểm). Một
thay đổi lớn (token ×1,5 cộng tỷ giá) vẫn còn ~4,6 điểm, nhưng kịch bản xấu nhất cộng thêm biến động
giá reseller sẽ vượt ngưỡng nếu giữ nguyên key shopaikey.

## 8. Điều chưa biết

- Giá shopaikey có thể đổi không báo trước; đây là reseller.
- Chưa có hoá đơn Deepgram/Groq thật để xác nhận giá PAYG và mọi khoản tối thiểu/khuyến mại.
- Gói VieNeu mua theo bậc và có hạn 6–12 tháng; nếu mua Starter rồi hết hạn, đơn giá hiệu dụng tăng.
- Tỷ lệ 31% lượt gọi model là traffic dev, không phải user pilot; user thật có thể hỏi câu khó hơn.
- Chưa có số support/refund thực tế; refund trong 7 ngày chưa tiêu quota làm giảm doanh thu, không
  làm tăng biến phí.
- Payment mới có SePay; payOS chưa cấu hình nên phí payOS chưa được tính.

## 9. Khuyến nghị

Trạng thái: user **đã duyệt offer ×2 này ngày 2026-10-30** dù biết kịch bản xấu nhất vượt ngưỡng;
bảng giá §2 đã thành `approvedTariff` trong code. Phần dưới giữ lại phân tích để quyết định sau này
dựa trên ledger chứ không dựa vào trí nhớ.

1. **Offer đã chốt**: 99.000đ / 300 chat / 1.200 giây STT / 10.000 ký tự TTS, Free 60/tháng · 12/ngày.
   Biến phí kỳ vọng 22,0% (cơ sở vi, `TTS_PROVIDER=vieneu` như render.yaml), 20,1% bản en.
2. **Kịch bản xấu nhất 31,5% đã được biết và chấp nhận**, không phải số bị bỏ sót: 2,6 call/turn đo
   trên dev cộng TTS Flux. Đường thoát khi ledger pilot xác nhận vượt ngưỡng: chuyển text sang key
   OpenAI trực tiếp (kịch bản xấu còn 23,3%), rồi mới tới hạ quota voice. Không hạ chất lượng model.
3. **`TTS_PROVIDER` là một biến của cost gate.** Bỏ trống biến này ở production sẽ tự đẩy cơ sở lên
   24,0% mà không đổi một dòng code. #94 phải ghi nó vào runbook và checklist deploy.
4. **Theo dõi bằng ledger.** Đối chiếu `costLedger()` với §2 hàng tuần; `unexplained` và
   `costUnknownLines` phải bằng 0 trước khi kết luận. Tỷ lệ call/turn thật quyết định 22% hay 31%.
5. **Giá chỉ sống trong một chỗ.** `approvedTariff` là nguồn duy nhất; đổi giá phải tạo version mới,
   không sửa version `2026-10-30` đã dùng để tính các kỳ đã bán.

## 10. Duyệt

- [x] Offer ×2 (99.000đ / 300 chat / 1.200 giây STT / 10.000 ký tự TTS; Free 60/tháng, 12/ngày) — duyệt 2026-10-30.
- [x] Chấp nhận kịch bản xấu 31,5% > 30%, giữ shopaikey; điều kiện xem lại ghi ở §9.2.
- [x] Bảng tariff §2 và tỷ giá 25.834đ/USD — đã vào `apps/api/src/membership/tariff.ts` version `2026-10-30`.
- [x] Ngưỡng biến phí ≤30% doanh thu ròng và cách tách fixed infra ở §6.

Đã chuyển #92 sang hoàn thành và mở #93. Ngưỡng 30% vẫn là kim chỉ nam cho mọi lần đổi offer sau này,
kể cả khi admin chỉnh quota qua #98.
