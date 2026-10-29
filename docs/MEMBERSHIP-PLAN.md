# Plan triển khai hội viên MetaBoard

Ngày lập: 2026-10-29.
Trạng thái: đã chốt #79, hoàn thành payment provider layer #97, schema membership/usage #80, core quota reserve–settle #81, cost instrumentation #82, membership lifecycle + API đọc #86, Coach text #83, STT voice turn #84 và TTS #85; bốn route đọc membership/usage đã mount ở `/api`, text/STT/TTS đã resolve entitlement và trừ quota. Toàn bộ đường account/quota nằm sau cờ `MEMBERSHIP_ENFORCEMENT=enforce` (mặc định tắt, production vẫn chạy như trước #83); thanh toán thật (#87) chưa nối.

## 1. Mục tiêu và phạm vi

Hoàn thành một paid pilot Free + Plus: user đăng nhập, xem allowance, dùng Coach text/voice đúng quyền, mua trước một kỳ Plus, nhận quyền từ giao dịch đã xác minh và trở về Free khi hết hạn.

Giữ miễn phí comps, tier list, catalog, guides, builder, quiz, tier maker, economy và bảng tra cứu hiện có. Không đưa session hoặc payment vào các route public đang dùng ISR.

Không làm Pro, annual, lifetime, auto-recurring, credit top-up, coupon, prorating, marketplace, phân tích VOD, theo dõi trận trực tiếp hoặc lưu đội hình theo account trong đợt này. Không đổi model để phân biệt chất lượng gói. Không cam kết unlimited, tốc độ hoặc kết quả leo rank.

Không mở rộng quản lý account sang block/delete/reset password. Membership admin nằm riêng; `users.role` vẫn chỉ là `user/admin`.

## 2. Quyết định đã chốt và các gate còn lại

Task #79 đã được user chốt ngày 2026-10-29:

- Gateway mặc định: payOS. Theo yêu cầu tiếp theo của user, có layer provider riêng và adapter SePay để đổi provider cho đơn mới mà không thay business logic. Không tự failover thao tác tài chính.
- Free: 30 chat/tháng, tối đa 5/ngày, không STT/TTS.
- Plus dùng để triển khai thử nghiệm: 99.000đ/30 ngày, 150 chat, 600 giây STT, 5.000 ký tự TTS. Không auto-renew, không rollover. Giá/quota bán thật vẫn chờ cost gate #92.
- Lỗi hệ thống không có kết quả hoàn quota; user dừng sau dispatch vẫn tính quota.
- Refund toàn bộ trong 7 ngày nếu chưa dùng quota Plus; nhầm/trùng thanh toán xử lý thủ công có audit. Không tự chi tiền.

Các gate còn lại:

- Cờ triển khai: chỉ `MEMBERSHIP_ENFORCEMENT=enforce` (đặt ở **cả** API/Render và web/Vercel) mới bật session bắt buộc, entitlement, reserve/settle và cost ledger. Thiếu cờ, `off` hay gõ sai giữ nguyên hành vi trước #83: guest vẫn dùng Coach, không ghi ledger, `/api/voice/tts/plan` trả 404. Hai bên phải bật cùng lúc ở #95 — bật API trước sẽ khiến web chưa đổi nhận 401. Đây là lý do production vẫn chạy được Coach trong lúc hoàn thiện membership.
- Task #88: duyệt mock trước khi sửa UI thật.
- Task #92: xác nhận offer cuối cùng sau khi có tariff và báo cáo unit economics.
- Task #95: cho phép commit/push, migration/config production và phạm vi giao dịch kiểm thử thật, nếu có.
- Task #96: quy mô, ngân sách và thời gian theo dõi pilot.

Việc chốt #79 chỉ xác nhận chính sách để triển khai/test, không phải quyền tự chuyển tiền, sửa secrets, thay hạ tầng hoặc chạy hosted benchmark. Chưa xác nhận merchant account hoặc điều kiện phí/ngân hàng thực tế; payment thật chưa thể hoàn thành nếu thiếu merchant setup.

## 3. Offer dùng để thiết kế và test

User đã duyệt bộ số thử nghiệm ở #79; đây chưa phải giá bán đã được kiểm chứng chi phí. Không mở bán trước #92 và #95.

| Quyền lợi | Free | Plus |
| --- | --- | --- |
| Giá | 0đ | 99.000đ/30 ngày, chỉ để triển khai/test |
| Coach text | 30 lượt/tháng | 150 lượt/kỳ |
| STT | Không | 600 giây/kỳ |
| TTS | Không | 5.000 ký tự/kỳ |
| Lịch sử chat theo account | Có | Có |
| Tra cứu và công cụ public | Có | Có |

Guest chỉ browsing. Coach yêu cầu đăng nhập. Bật email verification và kiểm soát tạo account trước khi mở Free AI rộng; merchant pilot cần xác nhận cách vận hành email và hỗ trợ.

Đề xuất giới hạn phụ để chốt ở #79: Free 5 lượt/ngày và 3 request/phút; Plus 30 lượt/ngày và 6 request/phút; mỗi account một query đang chạy, một STT và tối đa hai TTS chunk đồng thời. Các số này là execution policy, không phải mặc định đang chạy.

Giữ burst/IP protection riêng với allowance. Cookie không còn là nguồn số dư tài khoản. Admin không tự có unlimited; test account được cấp kỳ hạn/quota hữu hạn có audit.

### Chu kỳ

- Free theo tháng lịch và daily cap theo `Asia/Ho_Chi_Minh`; lưu các mốc thời gian dưới dạng UTC.
- Plus là đúng 30 ngày, không gọi là calendar month. Interval `[starts_at, ends_at)`.
- Paid không cộng thêm allowance Free và không rollover.
- Hết Plus trở về phần Free còn lại của tháng hiện tại, không reset allowance Free đã dùng trước đó.
- Hết quota hoặc hết gói không xoá, không khoá quyền đọc lịch sử.
- Mua tiếp cùng gói: nếu còn coverage, kỳ mới bắt đầu sau kỳ cuối đã mua; nếu không, bắt đầu lúc xác minh thanh toán.
- Hai giao dịch mua tiếp đồng thời phải lock coverage theo account để không chồng kỳ.
- Request giữ chỗ hợp lệ trước lúc gói hết hạn được xử lý và settle trên bucket cũ; request mới dùng entitlement tại thời điểm reserve.
- Kết quả entitlement dựa trực tiếp trên thời gian và trạng thái đã xác minh, không phụ thuộc cron chạy đúng một giây để chuyển về Free.

## 4. Chính sách usage và lỗi

### Text

- Một turn do user gửi, kể cả deterministic answer, dùng một lượt chat khi hoàn tất.
- Tool planning, regeneration, retry và extraction không dùng thêm lượt user nhưng đều ghi chi phí nội bộ.
- Input không hợp lệ, hết quyền hoặc không dispatch: không trừ lượt.
- Lỗi hệ thống không có câu trả lời hoàn tất: hoàn lượt chat; vẫn giữ spend/unknown cost của provider.
- User tự dừng sau khi dispatch đã bắt đầu: tính một lượt theo chính sách công khai được chốt ở #79.
- Duplicate delivery của cùng request không tạo inference hoặc debit mới. Request ID cũ với payload khác trả conflict.

### STT

- Server tính số giây từ sample count và sample rate hợp lệ; không tin duration client khai.
- Giữ cap mono Float32 16kHz, tối đa 60 giây và các validation đang có.
- Một voice turn reserve trước cả một lượt chat và số giây STT.
- Transcript sang query dùng reservation của cùng turn, không trừ chat lần hai; token tham chiếu scoped user, payload và thời hạn.
- Transcribe xong nhưng user không gửi query: settle STT theo kết quả, release lượt chat chưa dispatch khi reservation hết hạn.
- Silent/invalid audio bị loại trước provider không tiêu STT. Provider failure, empty transcript và user cancellation tuân theo chính sách lỗi đã chốt; ghi riêng cost thực tế/unknown.
- Đã implement ở #84 với hai dòng ledger thay vì một: `stt_transcribe` settle ngay theo kết quả của clip, `coach_turn` giữ chỗ 5 phút (rút còn 60 giây khi transcript về) và bị claim bởi query kế tiếp (`reserved → dispatched`), nên lượt chat chưa dùng không bao giờ bị tính tiền theo clip và cũng không thể bị hai client cùng tiêu. Tham chiếu là `turnId` scoped theo account + hạn dùng; ràng buộc payload nằm ở dòng STT (fingerprint của clip, cùng `X-Request-Key` là replay), còn query trong cùng account không cần khớp lại transcript vì hold đã thuộc chính account đó. Hold bỏ quên được release ở request kế tiếp và bởi sweeper `reconcileStale` mỗi 60 giây.

### TTS

- Chỉ tổng hợp phần đọc từ assistant message thuộc account; không cung cấp endpoint đọc arbitrary text.
- Client gửi message ID, response version, locale và chunk index. Server tự kiểm quyền, chuẩn hoá văn bản và tính số ký tự.
- Chốt một định nghĩa đếm ký tự, normalization và chunking dùng chung cho server/UI; không dùng đơn vị provider billing như thể đó là quota hiển thị.
- Cached blob replay trên client không tạo synthesis mới, không debit mới.
- Reload/cache eviction có thể cần synthesis mới và tính quota lại; không hứa replay miễn phí xuyên phiên.
- Prefetch chỉ giữ chỗ chunk kế tiếp trong allowance còn lại. Chunk đã tổng hợp nhưng chưa nghe có thể đã tiêu quota.
- Hết TTS vẫn trả text, dừng auto-read/prefetch và hiển thị thông báo rõ.
- Retry transport giữ cùng request ID; chủ động synthesis mới là request mới. Không tự tổng hợp lại request có kết quả dispatch chưa rõ chỉ để giả lập exactly-once.

## 5. Data model và nguyên tắc transaction

Additive schema và migration có kiểm tra. Đồng bộ schema cho DB mới và upgrade DB hiện có; không tạo migration framework tổng quát cho riêng tính năng này.

Đã triển khai ở #80 và #86 trong [schema.sql](../apps/api/src/schema.sql) và kiểm bằng [membership-schema.test.ts](../apps/api/src/membership-schema.test.ts) trên PostgreSQL dev (13 case): apply mới, apply lại lần hai không lỗi, và các invariant dưới đây do DB chứ không do code giữ.

| Entity đã có | Dữ liệu và invariant |
| --- | --- |
| `plan_versions` | code/version, integer VND, term, allowances, execution limits; một `active` mỗi code; trigger `plan_versions_keep_history` chặn đổi giá/quota hoặc xoá một offer đã có order/membership/bucket |
| `memberships` | User, plan version, nguồn order/grant, `[starts_at, ends_at)`, `active/revoked`; riêng với `role`; `memberships_order_idx` để một order không mint hai kỳ |
| `membership_events` | Audit append-only cho mỗi `grant/renew/revoke/credit`: reason 3-500 ký tự, `admin_has_actor` buộc action của admin nêu tên người làm, `grant_has_period` buộc một kỳ được cấp nêu snapshot `[period_start, period_end]`, `UNIQUE (user_id, idempotency_key)` scope theo account để một fulfilment chạy hai lần không mint hai kỳ |
| `payment_orders` | Owner, unique reference, amount/currency, snapshot, deadline, trạng thái; pin provider/account ID và external checkout ID từ lúc tạo |
| `payment_events` | Pin provider/account, gateway transaction id (text, không parse), bank `transaction_reference`, sha256 digest, result; unique theo bank reference chống cấp đôi giữa webhook và reconciliation; `payment_events_granted_is_reconcilable`/`granted_has_order` buộc thiếu reference ở lại `review` |
| `usage_buckets` | User, metric, period kind, allowance/consumed/reserved integer; `usage_buckets_balance_never_negative` nên số dư không bao giờ âm kể cả khi settle sai |
| `usage_requests` | Idempotency key unique theo user, payload sha256, linked turn, outcome, deadline recovery; `completed_is_settled` và `dispatched_has_time` buộc trạng thái có bằng chứng thời gian |
| `usage_reservations` | Mỗi request giữ chỗ trên từng bucket một lần; request xoá thì reservation mất, bucket còn lại |
| `usage_attempts` | Request/provider/model, dispatch state, retry số, units/cost micro-VND/tariff version. Một provider call owns một `attempt` number và N billing lines dưới nó, unique theo functional index `(request_id, attempt, COALESCE(billed_unit,''))` — nên một câu trả lời LLM giữ được cả `input_token` lẫn `output_token`; call row là dòng duy nhất không có unit. `billed_unit` và `billed_quantity` bắt buộc đi đôi cả hai chiều (`quantity_has_unit`), `cost_has_tariff` giữ nguyên tắc "không có số nào mà không rõ bảng giá", và `cost_needs_line` cấm tiền nằm trên call row: cost chỉ sống trên billing line. NULL là unknown chứ không phải 0 |

Ledger tham chiếu `users` bằng NO ACTION: không xoá được tài khoản còn order/quota, và xoá lịch sử chat không chạm tới ledger (đã kiểm). Price/quota pilot là data, seed bằng `npm run seed:membership`; cả hai row để `draft` — bật `active` là gate #92/#95, code phải fail closed khi chưa có offer active.

Financial/quota ledger không phụ thuộc reasoning traces, conversation FK cascade hoặc retention 30 ngày của traces. Xoá chat không hoàn quota hoặc xoá payment events. Ledger không cần raw prompt, raw audio hay secrets.

### Reserve–execute–settle

1. Authenticate, validate và resolve entitlement.
2. Transaction ngắn: dedupe request, lock bucket theo thứ tự cố định, kiểm các allowance, reserve và commit.
3. Ghi dispatch intent bền vững trước từng external call. Nếu không ghi được, không gọi provider.
4. Thực hiện work với token/tool/retry/time limits đã cấu hình; không giữ SQL transaction qua network wait.
5. Ghi result và settle consumed/released atomically, đúng một lần. Persist answer trước khi phát final result/message reference cho TTS.
6. Recovery xử lý pending request theo dispatch/result state. Worker claim phải tránh hai worker đồng thời settlement hoặc dispatch lại.

Recovery phân biệt chưa dispatch, có result và outcome chưa rõ. Không dispatch lại outcome chưa rõ. Reservation không treo vô hạn: có deadline và quy tắc release/credit theo policy. Không có deliverable do lỗi hệ thống thì không giữ debit user chỉ vì chưa biết provider đã tính tiền bao nhiêu; provider liability vẫn là unknown để đối soát.

Module [quota.ts](../apps/api/src/membership/quota.ts) là bản implement đầu tiên của trình tự trên (task #81) và [quota.test.ts](../apps/api/src/membership/quota.test.ts) kiểm 17 case trên PostgreSQL dev: một turn chat giữ chỗ trên cả bucket kỳ hạn lẫn bucket ngày Asia/Ho_Chi_Minh; hai request tranh lượt cuối chỉ một bên thắng; retry cùng idempotency key trả `in_progress`/`duplicate` kèm request ID và result reference cũ, payload khác hash trả `conflict`; `locked` (feature không có trong gói) tách khỏi `exhausted` và `daily_cap`; `rate_limited`/`too_many_in_flight`/`too_long` là policy chứ không phải số dư; settle consume `min(reserved, wanted)` rồi release phần thừa và chỉ một lần, nên một lượt giữ hai window vẫn tính là một lượt tiêu; recovery phân loại chưa-dispatch → release, có result → consume, không giải thích được sau 24h → release, còn lại → `needs_recovery` với backoff, và `FOR UPDATE SKIP LOCKED` khiến hai worker không cùng settle một request. `markDispatched` phải trả `ok` trước khi gọi provider, và không hàm nào giữ SQL transaction qua network wait.

Fail closed là mặc định của mọi hàm: plan draft/thiếu/malformed, tài khoản không tồn tại, connection lỗi hay write bị CHECK chặn đều trả `unavailable` chứ không cho request đi mà không đếm. `0` trong cột execution limit nghĩa là "đóng cửa", SQL `NULL` mới là "không giới hạn"; một giá trị vô lý (âm, thiếu cột) làm hỏng cả offer chứ không đọc thành uncapped. Feature không có trong gói trả `locked` trước mọi check chính sách, nên UI không bao giờ nói "thử lại sau một phút" với thứ gói đó không bao giờ có. Reason codes: `locked`, `exhausted`, `daily_cap`, `too_long`, `rate_limited`, `too_many_in_flight`, `expired`, `conflict`, `in_progress`, `duplicate`, `unavailable`. Thứ tự lock bucket là hằng số theo period kind (dài nhất trước) chứ không phụ thuộc window suy ra từ thời điểm, vì một reserve và một settle trên cùng hai bucket phải lấy lock theo đúng trình tự đó mới không deadlock.

Chỉ bảo đảm idempotency của hệ thống nội bộ, không tuyên bố exactly-once execution ở API bên ngoài.

Quyền/quota không đọc được thì trả lỗi tạm thời trước spend, không fail-open. UI phân biệt không đăng nhập, feature locked, quota exhausted, service unavailable và request đang xử lý.

### Cost ledger

Module [cost.ts](../apps/api/src/membership/cost.ts) là bản implement đầu tiên của việc đếm tiền (task #82) và [cost.test.ts](../apps/api/src/membership/cost.test.ts) kiểm 11 case — 7 case trên PostgreSQL dev về cơ chế ledger, 4 case về phủ đường spend. `openAttempt` ghi call row (`dispatch_state='dispatching'`, không unit, không tiền) trước khi caller chạm mạng, nên trạng thái sống sót khi process chết giữa call; attempt number do ledger cấp (`FOR UPDATE` trên request + `MAX(attempt)+1`) chứ không tin retry index của caller. `closeAttempt` đóng đúng một lần: lần hai trả `firstTime:false` và không thêm line, nên một turn được giao hai lần không thành hai lần tiền. Không mở được meter thì không gọi provider — STT/TTS trả `cost_ledger_unavailable`, adapter LLM trả `ProviderError('unavailable')`.

Tiền chỉ sống trên billing line và luôn tự giải thích được: `cost_needs_line`, `cost_has_tariff` và `quantity_has_unit` (hai chiều) là CHECK của DB, không phải quy ước code. Một provider call là một attempt number với N line mang đơn vị riêng, nên câu trả lời LLM có `input_token` lẫn `output_token`. Chi phí suy ra từ bảng giá đã duyệt (`usableTariff` từ chối sheet malformed, `costOf` làm tròn lên); repo chưa có sheet giá nào được duyệt nên các line hiện ghi số lượng và để `cost_micro_vnd` NULL — đối soát lại sau bằng `tariff_version`, không giả định 0.

Nguyên tắc bảo thủ: unknown không phải free. `chargeForFailure` chỉ cho là chưa tốn tiền khi vendor trả về bằng HTTP status (cờ `refused` do từng throw site đặt, vì 502 của vendor và 502 tự dựng không phân biệt được); từ socket hang-up, timeout hay "200 nhưng audio hỏng" trở đi đều `dispatch_state='unknown'` và line thừa kế sự không chắc chắn đó — tiền không bao giờ chắc hơn call đã sinh ra nó. Một refusal không để lại billing line; một bước có thể đã bill ghi nhận trọn độ dài clip, là cận trên chi phí cho #92. `markStuckAttempts` lật call chưa đóng thành `unknown`/`stuck_dispatch` và cấm dispatch lại; `0/0` token không tạo line nào mà hiện trong bucket `withoutUsage` của `costLedger`, report giữ `unexplained` và cost-unknown ở cột riêng chứ không cộng vào chi phí.

Phủ đường spend được kiểm bằng chính đường gọi: mọi LLM spend đi qua `generateAssistantAnswer` (ba adapter), mọi voice spend đi qua vòng failover của `transcribeWithFailover` và `synthSpeechChunk`, nên test lặp qua 3 adapter + 6 provider STT + cả hai engine TTS (vi: Flux với VieNeu dự phòng, en: Deepgram Aura-2) và xác nhận mỗi bước mở line trước fetch, đóng với `audio_second`/`character`/token tương ứng; Tool loop và background extraction được phủ theo vì chúng gọi lại đúng mấy hàm đó. Chain Deepgram 429 → Groq thành công để lại đúng hai attempt: bước bị từ chối mang `charged:false` và không để lại charge nào, bước giao hàng bill clip một lần.

#82 chưa mount vào route nào: tích hợp #83/#84/#85 chỉ tạo `createSpendMeter(requestId, { tariff })` và truyền vào tham số `meter` tùy chọn đã có sẵn. Thay đổi schema chỉ là additive/idempotent, dev đã re-apply `schema.sql`; production migration vẫn chưa được phép.

### Membership lifecycle

Module [lifecycle.ts](../apps/api/src/membership/lifecycle.ts) là bản implement đầu tiên của quyền và kỳ hạn (task #86); [lifecycle.test.ts](../apps/api/src/membership/lifecycle.test.ts) kiểm 17 case trên PostgreSQL dev, ba case trong số đó gọi HTTP thật qua router.

Trạng thái kỳ hạn suy ra từ đồng hồ, không từ cron: `resolveEntitlement(userId, now)` đọc `[starts_at, ends_at)` của mọi kỳ và tự dẫn `scheduled`/`expired`, nên một kỳ đã kết thúc ngừng cấp quyền ngay trong request nhận ra nó — không có bước nào phải "chuyển về Free" và cũng không có giây nào cron chạy muộn làm đổi kết quả. `active` và `revoked` là hai giá trị duy nhất được ghi. Quyền chỉ tồn tại khi `planQuotaFromRow` đọc được gói của chính kỳ đó: gói draft hoặc malformed trả `unavailable` (HTTP 503) chứ không giáng user xuống Free, vì số tiền đã trả trở nên không giải thích được; gói `retired` thì ngược lại, vẫn honour kỳ nó đã bán (`acceptRetired`) trong khi `grantPeriod` từ chối mint thêm kỳ mới trên đó. Một kỳ chưa tới hạn vẫn không cho tiêu gì, và `nextPeriodStartsAt` cho UI nói "Plus bắt đầu sau 4 ngày".

Free fallback là một dòng `plan_versions` `active` tra theo code cấu hình được (`MEMBERSHIP_FREE_PLAN_CODE`, mặc định `free`) với window là tháng lịch Asia/Ho_Chi_Minh tính bằng `calendarMonthWindow`; không có dòng active nào nghĩa là chưa có gói để bán, và câu trả lời là 503 chứ không phải một allowance bịa ra. Vì `usage_buckets` unique theo `(user_id, metric, period_kind, period_start)`, bucket tháng lịch dùng chung giữa các plan version: thời gian paid không cộng thêm và không reset phần Free đã dùng trong cùng tháng (đã kiểm bằng một lượt Free tiêu trước khi mua rồi refund).

`grantPeriod` chạy trong một transaction khoá row `users` của account (`FOR UPDATE`), nên hai webhook xác minh cùng giây xếp hàng chứ không cùng nối đuôi sau một `MAX(ends_at)` cũ. Kỳ mới bắt đầu sau kỳ cuối còn hiệu lực; nếu không còn coverage thì bắt đầu lúc xác minh — mua sớm không bao giờ biến hai lần mua thành hai allowance 150 lượt chạy song song, và `action` ghi `grant` hay `renew` đúng theo khoảng nối đó. Order phải `paid`, đúng account, đúng plan và chỉ mint tối đa một kỳ (hoạt động cả khi caller không mang idempotency key, nhờ `memberships_order_idx`). `revokePeriod` kết thúc đúng một kỳ và không dịch các kỳ mua sau: tự động trừ lại thời gian của những gì user đã tiêu là quyết định #6 để cho manual review, không phải việc của refund.

Audit sống ở `membership_events`: mỗi grant/renew/revoke/credit một row append-only, reason tối thiểu 3 ký tự, actor bắt buộc với mọi action `admin`, snapshot `[period_start, period_end]` cho action `grant`, và key unique theo account chứ không toàn bàn — hai người có quyền nghĩ ra cùng một chuỗi. `memberships.source` trả lời "kỳ này mua hay được cấp", `membership_events.source` trả lời "ai cho phép": `purchase` / `admin` / `system`. Lifecycle không chạm `users.role` và không xoá `assistant_conversations` (đã kiểm), nên hết hạn hoặc refund không làm mất lịch sử đọc.

Bốn route đọc trong [routes.ts](../apps/api/src/membership/routes.ts) mount tại `/api`: `membership/catalog` là bảng giá public (`public, max-age=60, must-revalidate`, không một byte dữ liệu account, offer `term_days NULL` hiển thị nhưng `buyable: false` vì fallback tier không có kỳ để mua); `me/membership`, `me/usage`, `me/membership/history` là `no-store` + `Vary: Cookie` vì một số dư đọc từ cache là một bug quota. `me/usage` trả theo đúng tên metric của ledger (`chat`, `stt_seconds`, `tts_characters`) kèm `chatToday`, `limits` và `requestsInFlight`; `remaining = allowance - consumed - reserved` vì lượt đang bay không còn để tiêu. `me/membership/history` đọc bảng của chính account nên không cần entitlement: entitlement không đọc được là 503 ở hai route kia, còn history vẫn trả 200 danh sách rỗng — che một kỳ đã trả tiền để phản ánh lỗi của service là sai theo hướng ngược lại. #87 là bên gọi `grantPeriod` sau khi webhook được xác minh; #83-#85 là bên gọi `resolveEntitlement` rồi `quota.reserve`.

### Ownership lịch sử

Signed-in access dùng account ownership. Không tiếp tục cho user khác đọc history chỉ vì cùng cookie trình duyệt. Chỉ có thể adopt guest conversation chưa gắn account; không transfer conversation đã có owner. Guest data cũ được bảo toàn, không xoá hàng loạt để giải quyết migration.

## 6. Payment và membership lifecycle

Một provider mặc định tạo đơn mới tại một thời điểm; layer riêng hỗ trợ payOS và SePay Bank Webhooks theo yêu cầu user ở #97. Không giả định mọi vendor hỗ trợ cùng checkout, remote cancellation, recurring hoặc refund API. Logic membership, quota, pricing và fulfillment không import SDK/vendor payload.

### Payment provider boundary — task #97

User yêu cầu tách layer provider để switch payOS/SePay hoặc thêm vendor khác mà không đổi order/membership logic. Đã có [contract](../apps/api/src/payments/provider.ts), [registry/config loader](../apps/api/src/payments/index.ts) và adapter [payOS](../apps/api/src/payments/payos.ts), [SePay](../apps/api/src/payments/sepay.ts). Chưa mount HTTP payment routes hoặc cấp membership; đó là #87. Đã qua 142 provider tests, 350 API tests trên PostgreSQL local và typecheck với Node 22.22.2; không gọi merchant/payment API thật.

- `PaymentProvider`: create checkout, lookup, cancel và verify webhook; trả checkout/receipt/status chuẩn hoá, không trả SDK payload ra business logic.
- `PAYMENT_PROVIDER=payos|sepay`: chỉ chọn provider cho đơn mới. Để trống thì payment layer disabled. Chưa thay giá trị trong `.env` thật.
- Khi tạo đơn, lưu `provider`, internal `accountId`, external checkout ID và reference. Sau đó luôn resolve `registry.forOrder(binding)` đã lưu, kể cả webhook, cancel và đối soát sau khi default đổi.
- Giữ cấu hình provider cũ đến khi hết pending orders và nhu cầu đối soát. Thiếu binding cũ là configuration error, không tự chuyển sang default mới. Không tái sử dụng account ID cho merchant khác.
- Env loader chuẩn hỗ trợ một account mỗi provider. Registry nhận danh sách adapter explicit, có thể giữ nhiều account của cùng vendor khi rotate; phần cấu hình phải đăng ký đủ account cũ/mới, không giả định chỉ đổi key là giữ được historical account.
- Provider mới implement contract và đăng ký trong config/registry; schema và fulfillment không phụ thuộc vendor enum cố định. Merchant setup, keys và webhook provider mới vẫn phải cấu hình/kiểm trước khi bật.
- payOS dùng `@payos/node` 2.0.5, checksum canonicalization của SDK và constant-time webhook comparison. SDK logs off, HTTP redirects bị chặn, không tự retry write hoặc failover khi outcome chưa rõ.
- SePay dùng Bank Webhooks/API v2, không giả làm Payment Gateway hosted checkout. QR local; HMAC trên timestamp + raw bytes, freshness ±300 giây; lookup account-scoped có pagination, partial/overpayment/ambiguous reference vào trạng thái phù hợp.
- Reference chung gồm chữ in hoa và số, 6–25 ký tự; không dùng câu ghi chú tự do làm order reference. Memo ngân hàng được nhận diện case-insensitive; thiếu/conflict reference không tự fulfill.
- SePay webhook numeric event ID và API v2 UUID transaction ID có thể khác. Giữ cả provider event/transaction ID và bank transaction reference; #80/#87 cần unique dedupe theo provider/account/bank reference để một giao dịch không cấp hai lần qua webhook và reconciliation. Thiếu bank reference đưa review, không tự thay bằng UUID/numeric ID.
- Capability checkout phân biệt `hosted` và `bank_qr`. SePay QR không có remote cancellation trong adapter này; `cancel` báo unsupported, business chỉ hủy local và xử lý late transfer bằng review. Automated refund vẫn tắt ở cả hai adapter theo policy pilot.
- [Refund API SePay v2](https://developer.sepay.vn/vi/sepay-api/v2/hoan-tien) áp dụng cho một số VietinBank doanh nghiệp; không triển khai trong pilot và không tự gọi payout/refund. Eligibility và identity compatibility chưa kiểm live.
- #87 mount raw webhook body trước global JSON middleware, maximum 64KB; verify trước parse/fulfill. HTTP ack/retry/durable event store vẫn là trách nhiệm integration, không coi unit test adapter là merchant/live verified.
- SePay API giới hạn 3 request/giây/IP; #87 cần shared scheduling/bounded reconciliation refresh. Thay provider phải kiểm fee/rate/capability, không chỉ sửa selector rồi giả định miễn phí hoặc sandbox tương đương.

### Khảo sát gateway cho task #79 — 2026-10-29

Trạng thái: đã khảo sát tài liệu public và user chọn payOS ở #79; chưa đăng ký/kiểm merchant, chưa xác nhận điều kiện phí của account thực tế, chưa gọi payment API hoặc chuyển tiền.

- payOS: [trang chính thức](https://payos.vn/) công bố miễn phí và hỗ trợ cá nhân/doanh nghiệp. Merchant cần xác minh danh tính và liên kết ngân hàng; user làm trên dashboard provider, không gửi CCCD hoặc secrets vào chat.
- [Node SDK payOS](https://payos.vn/docs/sdks/back-end/node) tài liệu hoá tạo payment link và xác minh webhook. [Signature](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature) dùng checksum key/HMAC-SHA256 với canonicalization của payOS; ưu tiên SDK chính thức, không áp dụng thuật toán raw-body của vendor khác.
- [Môi trường test payOS](https://payos.vn/docs/moi-truong-test) không có sandbox giả lập tiền: hướng dẫn thử trực tiếp bằng tài khoản/ngân hàng thật. Local dùng mock và signature fixtures; một webhook test payload không thay cho kiểm chứng payment end-to-end. Thử giao dịch thật chỉ ở #95 sau khi user cho phép.
- SePay Bank Webhooks là dịch vụ thông báo giao dịch ngân hàng, không mặc định là SePay Payment Gateway checkout. [Giá tiêu chuẩn](https://sepay.vn/bang-gia.html) niêm yết Free 50 giao dịch/tháng, Startup từ 120.000đ/tháng; ưu đãi ngân hàng có điều kiện riêng và không dùng làm giả định ngân sách chung.
- [SePay authentication](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc) có HMAC-SHA256 cho timestamp và raw body, kiểm timestamp để chống replay. [Integration](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook) cung cấp transaction id, chiều tiền, amount và reference; phải kiểm giao dịch vào, số tiền và mã order nội bộ.
- [SePay Test mode](https://developer.sepay.vn/vi/sepay-webhooks/test-mode/bat-dau-nhanh) mô phỏng giao dịch, cách ly live và không cần kết nối ngân hàng thật cho các account giả lập. Test mode chấp nhận HTTP/chứng chỉ tự ký; đó không phải lý do bỏ HMAC trên production.
- Khảo sát ban đầu #79 chưa xác minh API merchant refund. #97 tìm thấy refund API SePay v2 có giới hạn tài khoản như ghi ở phần provider boundary; không coi đó là quyền refund tự động cho mọi account. [Chính sách hoàn tiền dịch vụ SePay](https://sepay.vn/hoan-tien.html) là vấn đề riêng, không phải API merchant refund. Pilot vẫn refund thủ công có audit và user xác nhận chi tiền.
- User chọn payOS làm mặc định và sau đó yêu cầu layer switchable (#97). SePay có adapter riêng, không tự dùng như fallback khi payOS lỗi. Đơn cũ vẫn đi qua provider/account đã pin; đổi default chỉ ảnh hưởng đơn mới.

Gate #87 trước code payment: đọc đủ API/SDK version đã chọn về create/status/cancel, webhook test/retry, transaction identity và đối soát. Kiểm lại phí/limits/eligibility trong account thực tế; không tự giả định giới hạn miễn phí, refund hoặc recurring.

### Order

- Backend lấy giá từ approved plan version; không tin price, plan permission hay user ID client gửi.
- Dedupe create-order retry, giới hạn số pending orders và sinh unique transfer reference.
- Nếu webhook cần raw body, register parser/verification trước global JSON parser theo tài liệu gateway.
- Kiểm authenticity, amount, currency, reference và trạng thái giao dịch.
- Transaction ghi verified event + cập nhật order + tạo đúng một membership.
- Redirect/return URL/browser notification không kích hoạt gói.
- Event sai signature bị từ chối; late/mismatch đưa `review`, không tự kích hoạt.
- Out-of-order event không khôi phục order đã refund hoặc revoke quyền sai nguồn.
- Webhook mất: server đối soát qua gateway; client chỉ refresh trạng thái thuộc account, không gọi API provider trực tiếp.

State dự kiến: `pending`, `paid`, `expired`, `review`, `refund_pending`, `refunded`, `refund_failed`; chỉ cho phép transition hợp lệ.

### Membership và refund

- Membership: `scheduled`, `active`, `expired`, `revoked`; audit mọi admin adjustment.
- User đã chọn chính sách chuẩn pilot ở #79: refund toàn bộ khi yêu cầu trong 7 ngày từ lúc payment được xác nhận và chưa dùng quota của kỳ Plus liên quan. Kiểm đủ consumed chat/STT/TTS và reconcile reservation đang chạy trước khi xác nhận chưa dùng.
- Lỗi hệ thống không có kết quả hoàn quota; user chủ động dừng sau dispatch vẫn tính quota. Không coi mọi mất kết nối không rõ nguyên nhân là bằng chứng user chủ động dừng; recovery phải phân biệt known cancellation và unknown outcome.
- Nhầm/trùng thanh toán và partial refund đưa review/manual có audit, không tự prorate. Soát policy, quyền lợi bắt buộc và kênh hỗ trợ ở #94 trước mở bán.
- Refund tiền thực hiện thủ công và phải có xác nhận chi tiền riêng. Refund chưa xác nhận không được tự tạo tiền/quota trả lại. Confirmed refund thu hồi đúng term liên quan; không làm mất term khác đã mua.
- Grant/revoke/credit nội bộ có actor, lý do, nguồn và idempotency; không sửa một order thành paid chỉ để cấp gói.
- Tắt bán gói mới là trạng thái của offer; không tự thu hồi quyền user đã mua hợp lệ. Emergency ngừng inference là thao tác vận hành riêng có thông báo và policy bồi hoàn.

## 7. Điểm tích hợp trong repo

Các vị trí hiện có đã khảo sát; module mới chỉ tạo khi bước tương ứng cần.

- [Schema](../apps/api/src/schema.sql): membership/payment/usage tables và constraints đã có từ #80, thêm `membership_events` ở #86; [seed offer](../apps/api/seed/membership-plans.ts) tạo hai plan_versions draft. [quota.ts](../apps/api/src/membership/quota.ts) (#81) và [cost.ts](../apps/api/src/membership/cost.ts) (#82) là hai module đọc/ghi ledger; [lifecycle.ts](../apps/api/src/membership/lifecycle.ts) (#86) resolve entitlement, cấp và thu hồi kỳ hạn; [routes.ts](../apps/api/src/membership/routes.ts) (#86) là API đọc. #87 vẫn chưa có code.
- [Role account](../apps/api/src/accounts.ts#L10): giữ nguyên user/admin, bổ sung membership riêng. `grantPeriod`/`revokePeriod` không kiểm role — gate admin thuộc route #91, không thuộc module kỳ hạn.
- [API mounting](../apps/api/src/index.ts#L348): `app.use('/api', membershipRouter)` cho catalog và `/api/me/*`; auth/entitlement boundary của assistant đã nối ở #83, của `/api/voice/transcribe` ở #84 và của `/api/voice/tts/plan|speech` ở #85 (cùng một `resolveSessionUser` mount trước cả hai router); payment/webhook/admin routes chờ #87/#90/#91. `scheduleQuotaRecovery()` chỉ chạy khi cờ enforcement bật.
- [Assistant query](../apps/api/src/assistant/index.ts#L174): #83 — `requireUser` → 401, burst theo `clientId` (cookie `mb_assistant`, chỉ chống flood chứ không phải số dư), `resolveEntitlement`, `reserve` theo `requestKey`, `markDispatched` trước khi mở SSE, persist → `markResultReference` → `settle` trước `final`. Denial map ở `quotaDenial` (402/403/429/503).
- [Rate limit](../apps/api/src/assistant/rate-limit.ts#L16): quota ngày theo cookie đã bỏ cùng #83; chỉ còn burst execution, không giữ hai hệ thống số dư. Biến `ASSISTANT_DAILY_REQUESTS` đã xoá khỏi `.env.example` và registry `/admin/settings`.
- [Inference trace](../apps/api/src/assistant/orchestrator.ts#L1110) và [provider boundary](../apps/api/src/assistant/provider.ts): durable spend instrumentation tách khỏi best-effort tracing đã có ở #82 — ba adapter nhận `meter` tùy chọn; #83 tạo `usage_requests` và truyền meter từ route.
- [Background extraction](../apps/api/src/assistant/unresolved-entity-detection.ts#L59): chạy dưới cùng ledger request và meter của turn (#83), không phát sinh một lượt user mới.
- [STT](../apps/api/src/voice.ts#L529): #84 — session → `resolveEntitlement` → reserve giây từ sample count → reserve `chat:1` (TTL 5 phút) → `markDispatched` → vendor; `settle` ngay khi có transcript, `extendTurn` còn 60 giây cho query. `voiceTurnId` đi qua [contracts](../apps/api/src/assistant/contracts.ts#L263) và [claimTurn](../apps/api/src/membership/quota.ts#L435).
- [TTS](../apps/api/src/voice.ts#L1160): #85 — `GET /tts/plan?requestId` chỉ trả `{ version: sha256(spokenText(answer)), chunks }`; text lấy từ `usage_requests.result_reference → assistant_messages` và chỉ khi conversation thuộc account (join `c.user_id`). `POST /tts/speech` enforced nhận `{ requestId, version, chunk, lang }`, tự chunk theo `TTS_CHUNK_CHARACTERS`, reserve `tts_characters` bằng số ký tự server đếm, `X-Request-Key + chunk` làm idempotency; chunk đã synthesize (hoặc client dừng sau dispatch) là `completed`, lỗi engine là `released`. Chưa bật cờ: route giữ `{ input, lang }` cũ, `/tts/plan` 404.
- [Shared speech text](../packages/shared/src/speech-text.ts): #85 — một định nghĩa `spokenText()`/`chunkForSpeech()` cho API và web, nên version và ranh giới chunk không lệch giữa hai bên.
- [Conversation ownership](../apps/api/src/assistant/conversation-store.ts#L111): account-only access đã nối ở #83 (đọc/xoá theo `user_id`, guest conversation được claim bởi account đầu tiên list nó); dữ liệu lịch sử cũ giữ nguyên.
- [Chat voice client](../apps/web/components/assistant/assistant-chat.tsx#L300): #83 có `requestKey` mỗi turn (dùng lại khi retry) và copy EN/VI cho mọi denial code; #84 gửi `X-Request-Key` khi transcribe và chuyển `turnId` thành `voiceTurnId` của query (giữ lại khi retry); #85 có hai đường phát — enforced đi `plan` + `{ requestId, version, chunk }` (một `X-Request-Key` cho cả lượt, suffix chunk), chưa enforced đi `{ input }`; cache blob theo request/version/chunk, prefetch đúng một chunk, 402/403 dừng đọc nhưng giữ câu trả lời. Browser verification để #89.
- [Profile](../apps/web/app/[lang]/profile/page.tsx#L18) và web API/messages: membership/usage/order display, EN/VI.

API đã có từ #86: `GET /api/membership/catalog`, `GET /api/me/membership`, `GET /api/me/usage`, `GET /api/me/membership/history`. Còn dự kiến: create/read orders, request status và admin membership/payment review. Chốt contracts ở các task backend, không coi các route này đã tồn tại.

Đọc guide Next.js cài trong repo trước sửa routes/components. Không thay CI/CD hoặc shared infra như một bước ngầm của feature.

## 8. UX cần duyệt và triển khai

Mock cùng token/font/assets thật trước code UI, EN/VI desktop/mobile 320px. Baseline + hướng gọn + hướng mạnh trong một preview.

- Pricing: chỉ Free/Plus, ba đơn vị quota, 30 ngày, no rollover/no auto-renew, cách tính lỗi và link policy.
- Profile: plan, expiry, available/used/reserved balances, kỳ tiếp theo, order history.
- Coach: login gate, feature lock, gần hết/hết, reservation pending, stop/retry, text còn dùng được khi voice hết.
- Checkout: QR, đúng số tiền/reference/deadline, pending/paid/expired/review/refund, bounded refresh và manual refresh.
- Admin: term grants, adjustments, payment review, known/unknown cost, stale requests và audit; không mở rộng account role screen.

Personal APIs/pages không cache public — `/api/me/*` đã là `no-store` + `Vary: Cookie` từ #86; pricing public có thể cache theo catalog approved không chứa dữ liệu account (catalog hiện cache 60 giây và chỉ liệt kê plan đang `active`). Giữ keyboard/focus/mobile và không phá caching phần tra cứu.

## 9. Unit economics gate

Giá và quota chỉ approved khi có báo cáo: average/p95 text, STT/phút, TTS/1.000 ký tự từng locale/provider, extraction/retry/failure/unknown costs, full-quota user và Free fleet budget.

Nguồn tariff phải có ngày, provider/model, đơn vị và currency. Nếu dùng key theo gói, tính chi phí hiệu dụng và quota mua thực tế; không mặc định mọi vendor tính theo token. Cost estimate khác actual billing phải thể hiện rõ.

Báo cáo #92 đọc từ rollup `costLedger` (group theo provider/model/locale-independent unit, có `unexplained`, `withoutUsage` và cost-unknown riêng), không từ log ad hoc; nhưng ledger hiện chỉ có số lượng vì chưa có sheet giá nào được duyệt, nên giá phải nhập ở bước này chứ không suy ra từ code.

Mục tiêu thử nghiệm: biến phí không quá 30% doanh thu ròng. Tính cả payment fees, AI/voice và chi phí biến đổi phân bổ; báo riêng fixed infrastructure/support để không gọi gross margin là lợi nhuận ròng.

Dùng fixtures/replay logs để tính trước. Mọi phép đo hosted có spend cần user chốt budget riêng. Không lấy con số offline cũ làm giá hiện tại, không coi usage thiếu là miễn phí. Không giảm chất lượng model âm thầm để đạt margin.

## 10. Todo và dependencies

Task list trong phiên là trạng thái triển khai động. Checklist này ghi phạm vi và thứ tự ban đầu; cập nhật sau từng mốc đã nghiệm thu, không tick khi chỉ viết code.

| Task | Công việc | Phụ thuộc |
| --- | --- | --- |
| #78 | Ghi plan và todo | Không |
| #79 | Chốt chính sách thử nghiệm và gateway | #78; user |
| #80 | Schema membership/payment/usage | #78 |
| #81 | Core quota reserve–settle/recovery | #80 |
| #82 | Meter mọi AI/voice attempt | #80 |
| #97 | Layer provider, payOS/SePay adapters và switch tests | #79; yêu cầu bổ sung của user |
| #86 | Membership lifecycle và usage API | #79, #80 |
| #83 | Coach text, auth, SSE, ownership | #81, #82, #86 |
| #84 | STT linked voice turn | #83 |
| #85 | TTS authoritative chunks/quota | #83 |
| #87 | Orders/webhook/reconciliation/refund qua provider layer | #79, #81, #86, #97 |
| #88 | Mock UI và duyệt | #78; user |
| #89 | Pricing/profile/Coach UI | #83, #84, #85, #86, #88 |
| #90 | Checkout/order history UI | #87, #88 |
| #91 | Admin membership/payment/audit UI | #81, #86, #87, #88 |
| #92 | Unit economics và offer cuối | #79, #82, #83, #84, #85; user |
| #93 | E2E, security, faults và regression | #87, #89, #90, #91, #92 |
| #94 | Runbook, readiness và rollback | #83, #84, #85, #86, #87, #92 |
| #95 | Deploy và xác minh paid pilot | #93, #94; user approval |
| #96 | Theo dõi pilot và đóng nghiệm thu | #95; pilot thực tế được phép |

Thứ tự thực tế: foundation/metering trước; policy và UI mock có thể làm độc lập; text sau lifecycle; STT/TTS làm song song; payment không cản việc xây metering; release chờ tất cả gate.

### Checklist bàn giao

- [x] #79 Chính sách, gateway và phạm vi thử nghiệm được chốt; merchant/live offer vẫn chờ các gate sau.
- [x] #80 Schema và local migration được kiểm (fresh apply + re-apply + 12 invariant case trên PostgreSQL dev; offer để draft, chưa chạy prod migration).
- [x] #81 Quota concurrent/idempotent/recovery được kiểm (17 case trên PostgreSQL dev: lượt cuối tranh nhau, replay/conflict/duplicate, locked khác exhausted, ngày rolled theo Asia/Ho_Chi_Minh, settle đúng một lần, hai recovery worker không cùng claim, mọi đường lỗi trả `unavailable` thay vì cho qua; chưa mount vào route nào).
- [x] #82 Cost instrumentation không bỏ sót đường spend (11 case trong `cost.test.ts`: 7 case ledger trên PostgreSQL dev + 4 case phủ đường gọi — 3 adapter LLM, 6 provider STT, cả hai engine TTS, chain failover và fail-closed khi ledger không ghi được; typecheck và 393 API test pass; chưa route nào tạo meter, schema mới cần re-apply `schema.sql`, chưa chạy prod migration).
- [x] #97 Contract/registry/payOS/SePay adapters và switch/signature tests qua; HTTP integration còn #87.
- [x] #86 Membership và kỳ hạn được kiểm (17 case trong `lifecycle.test.ts` trên PostgreSQL dev, 3 case trong số đó gọi HTTP thật: entitlement đọc theo đồng hồ nên kỳ hết hạn ngừng cấp quyền mà không cần cron, gói không đọc được là 503 chứ không phải Free, retired vẫn honour kỳ đã bán nhưng không bán thêm, renewal nối sau `MAX(ends_at)` chứ không chồng allowance, hai webhook cùng giây vẫn xếp hàng, một order chỉ mint một kỳ, refund thu hồi đúng một kỳ và không đụng `users.role`/lịch sử, `/api/me/*` là `no-store` còn catalog cache được; typecheck và 411 API test pass. Bảng mới `membership_events` cần re-apply `schema.sql` ở dev, chưa chạy prod migration; #87/#83-#85 là bên gọi `grantPeriod` và `resolveEntitlement`.)
- [x] #83 Coach text đi qua account được kiểm (13 case trong `coach-quota.test.ts` trên PostgreSQL dev + fetch stub: 401 khi chưa đăng nhập và không ghi ledger; budget theo account chứ không theo cookie — hai browser khác cookie dùng chung số dư; `plan`/`entitlement` client khai bị bỏ qua; kỳ lapsed rơi về Free theo clock; `requestKey` replay trả câu trả lời đã lưu với một debit, cùng key khác payload là 409; provider refusal hoàn lượt nhưng giữ `usage_attempts`; SSE disconnect sau dispatch vẫn tính lượt; `too_many_in_flight` + Retry-After không đặt chỗ; plan code hỏng là 503 chứ không Free; burst `rate_limited`; đọc/xoá lịch sử chéo account bị chặn và guest conversation được claim đúng một lần. 424 API test, 17 web test, typecheck sạch. Web gửi `requestKey` mỗi turn, map đủ denial code EN/VI và `/assistant` chặn khi chưa đăng nhập; chưa verify browser vì không tự bật dev server — để #89.)
- [x] #84 Voice turn được kiểm (12 case trong `voice-quota.test.ts` trên PostgreSQL dev, gọi HTTP thật qua router voice + assistant: 401 khi thiếu session và vendor không bị gọi; Free trả 403 `feature_locked` còn Coach text vẫn chạy; Plus reserve 2 dòng trước khi clip rời máy, `turnId` được query claim nên chỉ một lượt chat bị trừ, số giây = ceil(samples/16000) và clip 1,5 s tính 2 s; im lặng và clip vượt `max_stt_seconds_per_request` bị loại trước ledger; vendor lỗi và transcript rỗng release cả hai dòng nhưng giữ `usage_attempts`; replay cùng `X-Request-Key` chỉ gọi vendor một lần; `turnId` của account khác không claim được; hold bỏ quên hết hạn được release và không chiếm slot; hai client tranh một turn chỉ một bên thắng claim. Sweeper `reconcileStale` có caller định kỳ 60 giây từ boot. Typecheck API + web sạch, 437 API test pass liên tiếp 3 lần; browser verification để #89.)
- [x] #85 TTS/chunk/cache/prefetch được kiểm (8 case mới trong `voice-quota.test.ts` trên PostgreSQL dev + HTTP router thật: `GET /tts/plan` chỉ trả `version = sha256(spokenText(answer))` và **số** chunk của answer đã lưu; `input` browser gửi kèm bị bỏ qua, engine nhận đúng chunk server dựng và `tts_characters` trừ theo số ký tự server đếm; guest 401, Free 403 `feature_locked` không mở bucket, account khác 404 và không bị trừ; version cũ 409 `speech_version_mismatch`, chunk vượt plan 400 trước khi gọi engine; retry cùng `X-Request-Key` 409 `already_answered` không trừ thêm, bấm **Nghe lại** là lượt mới và tính lại; hết ký tự 402 `quota_exhausted` trước vendor, câu trả lời vẫn đọc được; tắt cờ thì `/tts/plan` 404, đường `{ input }` cũ chạy và không ghi ledger. `spokenText`/`chunkForSpeech` chuyển sang `packages/shared/src/speech-text.ts` dùng chung API + web để version không lệch. 20 case trong file, 445 API test, 17 web test, typecheck sạch. Browser verification để #89.)
- [ ] #87 Payment/refund/reconciliation được kiểm.
- [ ] #88 UI mock được duyệt.
- [ ] #89 Pricing/profile/Coach UI được kiểm browser.
- [ ] #90 Checkout/history UI được kiểm browser.
- [ ] #91 Admin/audit UI được kiểm browser.
- [ ] #92 Offer qua cost gate và được user duyệt.
- [ ] #93 Full validation có bằng chứng.
- [ ] #94 Runbook/readiness/rollback hoàn chỉnh.
- [ ] #95 Production được triển khai và xác minh có phép (gồm bật `MEMBERSHIP_ENFORCEMENT=enforce` đồng thời ở API/Render và web/Vercel, rồi xác minh guest bị chặn đúng và đường `{ input }` không còn mở).
- [ ] #96 Pilot report và nghiệm thu kết thúc.

## 11. Test matrix và bằng chứng

Unit/API mock không gọi provider hosted. Transaction integration phải chạy PostgreSQL dev thật; kiểm destination là local trước thao tác, không đọc/log raw connection secrets. Các test bị skip vì DB giả không thay thế integration pass.

- Quota: tranh lượt cuối, hai tab/thiết bị, daily/month/term boundary, paid expiry giữa request, không âm/cộng đôi allowance.
- Idempotency: duplicate key cùng payload, conflict khác payload, retry transport, completed replay, stale/unknown dispatch.
- Faults: crash trước/sau dispatch, sau provider result trước settlement, DB mất kết nối, queue cancellation, SSE disconnect trước/sau inference.
- Ownership: đổi cookie không reset quota; cùng browser đổi account không đọc chat/order/voice của nhau; spoof user/plan/message/chunk.
- Voice: invalid/silent/too-long audio, hết chat trước STT, không trừ text hai lần, bỏ query sau transcript, fallback attempts, local replay, eviction/reload, prefetch và stop.
- Payment: invalid authenticity, sai amount/currency/reference, duplicate/out-of-order, late transfer, webhook mất, renew đồng thời, confirmed refund không resurrect.
- UI: EN/VI, 320px/desktop, keyboard/focus, login next, expired/locked/error states, public navigation và ISR không regression.
- Gates: typecheck, web/API unit suites, local DB integration, production build và Playwright golden/edge.

Sandbox theo gateway thật sau khi được phép. Giao dịch thật/hoàn tiền không nằm trong quyền tự động của test suite.

## 12. Release, rollback và định nghĩa hoàn thành

### Trước production

User approve offer, merchant configuration, privacy/terms/support, commit/push và prod mutation scope. Backup và additive migration; không xoá dữ liệu để giải quyết lỗi migration. Secrets nằm trên provider dashboard, tài liệu chỉ ghi tên biến. Cấu hình lịch reconciliation/recovery theo hạ tầng đã chọn với xác nhận riêng.

Không tự đo throughput hosted hoặc dùng payment live để chữa một test sandbox thất bại.

### Rollback

Tắt offer mới trước, giữ financial/usage ledger. Không rollback bằng DROP bảng đã có giao dịch. Nếu cần ngừng inference, có thông báo và refund/credit policy. Code rollback phải được kiểm tương thích schema additive và không mở lại đường AI thiếu quota; nếu không thể giữ invariant thì tạm dừng assistant/voice, phần tra cứu vẫn hoạt động. Cờ `MEMBERSHIP_ENFORCEMENT` không phải rollback miễn phí: tắt cờ (hoặc quay về code trước #83) sẽ mở lại đường AI không quota, nên chỉ dùng như emergency có ghi nhận, không dùng để "thử lại" deploy.

### Done kỹ thuật

Schema, backend, payment integration, UI, local DB tests, browser tests và build đều qua; có recovery, idempotency, security và runbook. Không còn fake payment success hoặc bypass quota.

### Sẵn sàng bán

Offer qua cost gate, merchant setup và policy/support hoàn tất; production grant/expiry/payment/reconciliation được xác minh với phạm vi user cho phép. Sandbox hoặc local pass không được ghi thành live verified.

### Hoàn thành pilot

Có kết quả theo dõi cost/account và Free fleet, payment errors, stale reservations, refunds/support, tỷ lệ dùng hết quota và nhu cầu gia hạn trong phạm vi pilot được chốt. Chốt giữ/đổi offer bằng bằng chứng. Không tự mở Pro hoặc các gói ngoài scope.

Nếu thiếu merchant account, credentials, approval hoặc traffic đủ để đo thì giữ task liên quan pending và nêu blocker; không đánh dấu toàn bộ đã hoàn thành.
