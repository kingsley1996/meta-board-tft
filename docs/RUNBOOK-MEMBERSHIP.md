# Runbook — paid membership pilot (task #94)

Trạng thái (2026-10-30): code đã lên production với cờ **tắt** (commit `6f65f53`); trên Supabase đã chạy **§1.2, §1.3 và §1.4** — schema, seed hai lần, hai offer đã `active` (một transaction), catalog trả 200 với `free` 0đ/60-12/không bán và `plus` 99.000đ/30 ngày/300-60-1.200-10.000/bán được. Merchant SePay đã nạp **đủ 8 biến** trên Render — probe webhook rỗng trả `400 invalid_webhook` thay vì `503 payments_unavailable`, tức registry dựng được. Còn lại: webhook live trên SePay, một giao dịch thật (chứng minh `gateway`/`accountNumber` khớp), cờ enforce — mỗi thứ là gate riêng của #95, cần chủ project cho phép.

Nguyên tắc: không dán secret vào chat hay tài liệu (chỉ tên biến). Mọi thao tác ghi vào production cần chủ project cho phép rõ ràng. Ledger tài chính/usage là append-only — không DROP bảng, không sửa tay row đã ghi, không "xoá cho sạch" khi có sự cố.

Biến và bảng liên quan: `MEMBERSHIP_ENFORCEMENT`, `MEMBERSHIP_FREE_PLAN_CODE`, `TTS_PROVIDER`, `STT_PROVIDER`, `ASSISTANT_PROVIDER`/`ASSISTANT_MODEL`, `SEPAY_WEBHOOK_SECRET`, `SEPAY_*`, `PAYOS_*`, `VIENEU_TTS_URL`/`VIENEU_TTS_API_KEY`, `DEEPGRAM_API_KEY`, `GROQ_API_KEY`. Bảng: `plan_versions`, `memberships`, `membership_events`, `usage_buckets`, `usage_requests`, `usage_reservations`, `usage_attempts`, `payment_orders`, `payment_events`.

## 1. Trước khi bật cờ

### 1.1 Backup và phạm vi

- Snapshot/PITR Supabase trước mọi thay đổi; ghi lại id snapshot và commit đang deploy.
- Xác nhận đang trỏ đúng project production (đọc tên project, **không** in `DATABASE_URL`).
- `MEMBERSHIP_ENFORCEMENT` phải **bật ở cả hai bên** (Render API và Vercel web) — xem §3. Giá trị trên
  Render đọc từ [`render.yaml`](../render.yaml), nên file đó phải ghi cùng giá trị với dashboard; nếu lệch,
  blueprint sync sau có thể kéo service về giá trị trong file. Probe sau mỗi lần deploy là
  **`GET /api/voice/tts/plan`** (401 = enforce, 404 + body `tts_plan_unavailable` = off).

### 1.2 Schema (additive, idempotent)

```sh
psql "$DATABASE_URL" -f apps/api/src/schema.sql
psql "$DATABASE_URL" -f apps/api/src/schema.sql   # chạy hai lần phải không đổi gì
```

Kiểm nhanh: các bảng ở đầu tài liệu tồn tại; trigger `plan_versions_keep_history` và unique index `plan_versions_one_active_per_code_idx` có mặt.

### 1.3 Seed và bật offer

```sh
npm run seed:membership --workspace @metaboard/api
```

Seed ghi `free` và `plus` ở trạng thái **`draft`** và chỉ refresh row chưa từng có order/membership/bucket. Đọc trạng thái trước khi bật:

```sql
SELECT code, version, status, price_vnd, chat_per_period FROM plan_versions ORDER BY code, version;
```

Nếu `free`/`plus` đã có version khác `1` đang `active` (hoặc row mang quota cũ), **dừng**: đó là version đã từng bán, seed không ghi đè và câu UPDATE dưới đây không đụng tới nó — tạo version mới qua #98, không sửa tay.

Bật offer là một bước riêng, làm trong **một transaction** (unique index chỉ cho một `active` mỗi code):

```sql
BEGIN;
UPDATE plan_versions SET status = 'retired' WHERE code = 'plus' AND status = 'active' AND version <> 1;
UPDATE plan_versions SET status = 'active' WHERE code = 'plus' AND version = 1 AND status = 'draft';
UPDATE plan_versions SET status = 'active' WHERE code = 'free' AND version = 1 AND status = 'draft';
COMMIT;
```

Cả hai phải `active`: `free` là tier fallback mà entitlement đọc mỗi request. Quên `free` thì mọi account nhận `503 membership_unavailable`.

Không sửa giá/quota tại chỗ: trigger chặn khi row đã có history. Đổi offer = version mới + activate (task #98).

### 1.4 Pre-flight đọc lại catalog

```sh
curl -s "https://<api>/api/membership/catalog"
```

Shape: `{ offers: [{ planVersionId, code, version, label, price: { vnd, currency }, termDays, allowances: { chatPerPeriod, chatPerDay, sttSecondsPerPeriod, ttsCharactersPerPeriod }, buyable }] }`. Trước khi activate, `offers` rỗng là trạng thái đúng — chỉ sau §1.3 mới kiểm được: phải thấy `free` `price.vnd` 0, `allowances` 60 / 12 / 0 / 0, `buyable: false`; `plus` 99.000, `termDays` 30, `allowances` 300 / 60 / 1.200 / 10.000, `buyable: true`. Đối chiếu với [pilotPlans](../packages/shared/src/membership-plans.ts). Trang pricing đọc hằng số còn checkout/profile đọc catalog, nên hai bên lệch nhau là lỗi chặn bán (đã thấy trên dev vì row cũ đang được dùng — xem #93).

### 1.5 Cấu hình tốn tiền và merchant

- `TTS_PROVIDER=vieneu` giữ cơ sở 22,0% của #92; để trống/`deepgram` thì tiếng Việt qua Flux và chi phí thành 24,0%. Đây là biến của cost gate, không phải sở thích.
- `ASSISTANT_MODEL` đúng model đã duyệt (`gpt-6-luna`) và key gateway còn hạn — kiểm bằng một lượt Coach của account test, không cần benchmark.
- Merchant SePay (đối chiếu [payments/index.ts](../apps/api/src/payments/index.ts) `readPaymentProviders`): đặt **đủ 8 biến** trên Render — thiếu hoặc chỉ đặt một nửa thì registry trả `null`/throw và mọi route payment trả **503 `payments_unavailable`**, API không crash nhưng cũng không bán được:
  | Biến | Lấy từ đâu / ràng buộc trong code |
  | --- | --- |
  | `PAYMENT_PROVIDER=sepay` | bộ chọn; trống ⇒ không có registry |
  | `SEPAY_ACCOUNT_ID` | id nội bộ của binding, `[A-Za-z0-9_-]{1,64}`, ví dụ `sepay-main`; không phải credential, đừng đổi sau khi đã có order |
  | `SEPAY_API_KEY` | token đọc giao dịch; code gọi `GET https://userapi.sepay.vn/v2/transactions` với `Authorization: Bearer` |
  | `SEPAY_WEBHOOK_SECRET` | khớp secret đặt cho webhook bên SePay |
  | `SEPAY_BANK_ACCOUNT_ID` | **UUID** (code validate đúng format) — id tài khoản ngân hàng bên SePay, dùng làm filter `bank_account_id` khi đối soát |
  | `SEPAY_BANK_ACCOUNT_NUMBER` | số tài khoản nhận tiền; **phải trùng** `accountNumber` trong payload webhook; cũng là `acc` của ảnh VietQR |
  | `SEPAY_BANK_CODE` | mã ngân hàng cho vietqr.app (`?bank=…`), phải là mã vietqr.app chấp nhận |
  | `SEPAY_BANK_NAME` | tên hiển thị; **phải trùng** trường `gateway` của webhook (so sánh không phân biệt hoa thường) |
  - **Cấu trúc mã thanh toán** (SePay → Cấu hình chung → Cấu trúc mã thanh toán): tiền tố 2–5 chữ cái, hậu tố 3–10 ký tự kiểu số nguyên. Code sinh reference `MTFT` + **10 chữ số** từ `order_code` ([orders.ts](../apps/api/src/membership/orders.ts) `orderCodeFor`/`referenceFor`), nên cấu hình đúng phải là tiền tố `MTFT`, hậu tố 3–10, "Số nguyên" — đổi tiền tố ở dashboard thì phải đổi `referenceFor` và deploy, không thì webhook trả `code` rỗng và chỉ còn đường đoán reference từ nội dung chuyển khoản.
  - Ví dụ BIDV: `SEPAY_BANK_NAME=BIDV` (SePay dùng tên ngân hàng trong `gateway`, không phải mã), `SEPAY_BANK_CODE=970418` — đã thử `https://vietqr.app/img?bank=970418` và `bank=bidv` đều trả PNG; mã sai trả ảnh lỗi 75 byte, nên có thể kiểm nhanh bằng một request ảnh trước khi bật.
  - Webhook trên SePay: URL `https://<api>/api/payments/webhook/sepay`, chỉ sự kiện tiền **vào**, và **phải bật chữ ký** — code đòi `X-SePay-Timestamp` (epoch giây, lệch ≤ 300 s) và `X-SePay-Signature: sha256=<hex>` là HMAC-SHA256 của `` `${timestamp}.` + raw body `` với `SEPAY_WEBHOOK_SECRET`; thiếu header nào là 401 `invalid_webhook`.
  - Không có bước nào ở đây tự tạo giao dịch, và không có API hoàn tiền phía merchant: refund là thao tác tay ở admin + chuyển khoản, đã ghi audit.
  - Sau khi đặt biến: redeploy Render, rồi mới activate offer (§1.3) và thử tạo một order bằng account test — `POST /api/orders` lúc chưa có offer active trả 409 `offer_not_sellable`, nên thứ tự là biến → activate → order.
- Lịch chạy: `scheduleQuotaRecovery()` tự chạy mỗi 60 giây **khi cờ bật**. `markStuckAttempts` **không có cron** — row `dispatching` quá hạn là việc của người trực (mục 4). Reconciliation order dùng nút refresh có throttle, không có job nền.

## 2. Bật pilot

Đặt `MEMBERSHIP_ENFORCEMENT=enforce` ở **cả** Render API và Vercel web trong cùng một cửa sổ deploy, rồi xác minh ngay (§3). Không bật lệch: API bật trước thì web cũ vẫn gửi request không session và người dùng thấy 401; web bật trước thì UI hiện quota trong khi API vẫn cho dùng không ghi ledger.

Thứ tự trong cửa sổ: deploy web đã đọc cờ (trang checkout đóng cho tới khi bật) → đặt biến ở Render → đặt biến ở Vercel → redeploy cả hai → chạy §3.

## 3. Xác minh sau bật

| Kiểm | Kỳ vọng |
| --- | --- |
| Guest `POST /api/assistant/query` | 401 `unauthenticated`, không có row `usage_requests` |
| Guest `GET /api/voice/tts/plan` | 401 `unauthenticated` (404 `tts_plan_unavailable` chỉ còn khi cờ tắt) |
| `POST /api/voice/tts/speech` với `{ input }` | 400 `invalid_request`: chỉ nhận `requestId` + `version` + `chunk` khớp plan server dựng |
| Account Free đăng nhập, hỏi Coach | 200, `usage_requests` + `usage_attempts` có row, `cost_micro_vnd` khác NULL với `tariff_version = '2026-10-30'` |
| Account test vượt hạn mức | 402 `quota_exhausted`; ngày → 429 `daily_cap` |
| `/vi/profile` và `/en/membership` | hiện đúng quota ×2, không lỗi 500 |
| `/checkout?plan=plus` khi đã đăng nhập | tạo order, QR/amount 99.000, reference khớp |
| Webhook thử (sandbox hoặc chuyển thật đã được duyệt) | order `paid`, một kỳ `active`, `payment_events` có `granted` |
| `/admin/membership` | chỉ admin; grant tay có reason + request key, audit `RENEW`; refund kỳ chưa dùng hoạt động |
| Hai tab cùng account tranh lượt cuối | một bên 200, bên kia 402; không âm bucket |
| Ngắt SSE giữa câu trả lời | lượt vẫn bị tính (`completed`), không hoàn |

## 4. Theo dõi trong pilot (hằng ngày)

```sql
-- reservation mồ côi: quá hạn TTL mà chưa được sweep (sweep chạy 60 giây/lần khi cờ bật)
SELECT status, count(*) FROM usage_requests
 WHERE status IN ('reserved','dispatched','needs_recovery') AND reserve_expires_at < now()
 GROUP BY status;

-- spend chưa giải thích: tiền có thể đã mất, không được dispatch lại
SELECT provider, model, count(*) FROM usage_attempts
 WHERE billed_unit IS NULL AND dispatch_state IN ('dispatching','unknown')
 GROUP BY provider, model;

-- đơn cần người xử lý
SELECT status, count(*) FROM payment_orders WHERE status IN ('review','paid') GROUP BY status;

-- tỷ lệ chạm trần, để so với giả định 22,0% / 31,5%
SELECT plan_version_id, count(*) FILTER (WHERE consumed_units >= allowance_units) AS maxed,
       count(*) AS buckets
  FROM usage_buckets WHERE metric = 'chat' GROUP BY plan_version_id;
```

- Mỗi row ở query thứ hai phải được trả lời trong ngày: provider nào, request nào, vì sao dừng. Không xoá, không re-dispatch cùng request key.
- Mỗi tuần so `costLedger()` với giá đã duyệt. Lệch đáng kể so với báo cáo unit economics là điều kiện xem lại ngưỡng 30% đã chấp nhận ở #92.
- Đơn `review` phải xử lý tay: chuyển đúng số tiền thì hoàn phần thừa; chuyển thiếu thì nhắc khách, không "nâng" kỳ.

## 5. Sự cố

| Sự cố | Làm | Không làm |
| --- | --- | --- |
| Webhook mất / đến muộn | SePay retry; mở order và bấm refresh (lookup có throttle), hoặc đối soát tay rồi để webhook đến sau ghi nhận (idempotent theo event id) | Không grant tay không reason/actor |
| Hai lần chuyển, một đơn | Order thứ hai vào `review`; hoàn phần thừa thủ công ở ngân hàng, ghi audit | Không mint thêm kỳ |
| Muốn hoàn tiền | Chỉ kỳ chưa tiêu quota, trong 7 ngày; admin refund ghi `membership_events` + `payment_events` | Không hoàn cho kỳ đã dùng |
| Row `dispatching` quá hạn | Đánh dấu bằng SQL (hoặc `markStuckAttempts` trong `cost.ts` nếu có chỗ chạy — hiện không có route/cron), ghi vào báo cáo unexplained | Không cho user hỏi lại cùng request key miễn phí |
| DB không tới được | Entitlement trả 503 và fail closed; chờ hạ tầng | **Không** tắt cờ để "chữa" — tắt cờ mở lại AI miễn phí |
| Provider AI/TTS/STT lỗi | Request trả lỗi và hoàn lượt/giây theo chính sách; cost attempt vẫn nằm trong ledger | Không tự đổi provider trả tiền khác mà không đo |
| Chi phí vượt dự kiến | Kiểm `TTS_PROVIDER`, model id, các dòng `unexplained`; tạm ẩn CTA Plus | Không sửa giá/quota tại chỗ |

## 6. Rollback

Thứ tự: ngừng bán → giữ dữ liệu → chỉ rollback code khi tương thích schema additive.

1. Ngừng bán: `UPDATE plan_versions SET status = 'retired' WHERE code = 'plus' AND status = 'active';`. Catalog hết `buyable`, order mới bị `offer_not_sellable`; kỳ đã bán vẫn được honour.
2. Trang pricing đọc hằng số nên vẫn hiện nút mua sau bước 1; bấm vào checkout sẽ thấy "đóng". Chấp nhận được trong emergency, hoặc vá copy và deploy web.
3. Giữ nguyên `payment_orders`, `payment_events`, `usage_*`, `memberships`, `membership_events`. Không DROP, không xoá row để "sạch".
4. Rollback code: chỉ deploy bản cũ nếu schema hiện tại vẫn là superset và bản cũ không mở lại đường AI thiếu quota. Nếu không chắc, tạm dừng assistant/voice (tra cứu vẫn chạy) thay vì rollback.
5. Tắt `MEMBERSHIP_ENFORCEMENT` là biện pháp cuối, có ghi nhận: nó mở lại AI không quota, không ghi ledger — chỉ dùng khi đã chấp nhận rủi ro đó, không dùng để "thử lại deploy".
6. Khôi phục từ backup chỉ khi có phép; sau khôi phục phải chạy lại reconciliation và so `payment_events` với sao kê trước khi bật lại.

## 7. Trạng thái bằng chứng

Đã kiểm (local, 2026-10-30 — chi tiết ở `docs/MEMBERSHIP-PLAN.md` §11): schema idempotent, seed, catalog/offer, quota và cost ledger trên PostgreSQL thật, API suite 474 case, 67 Playwright case, production build.

Đã chạy trên production (2026-10-30, có phép): **§1.2 + §1.3 một phần** — `seed/membership-plans.ts` hai lần trên Supabase, ra đúng hai offer `draft` ×2 quota, idempotent; catalog 200 `{offers:[]}`; cờ vẫn tắt, `/api/voice/tts/plan` 404. Chưa activate offer nào, nên §1.4 "buyable" và mọi mục từ §2 trở đi vẫn chưa chạy.

Pre-flight đọc-only 2026-10-30: `plan_versions` = `free v1 draft 0đ 60/12/0/0` + `plus v1 draft 99.000đ/30 ngày 300/60/1.200/10.000`, `active_offers 0`, ledger `memberships/orders/buckets/requests = 0/0/0/0`; catalog 200 `{offers:[]}`; `POST /api/payments/webhook/sepay` body rỗng → 400 `invalid_webhook` (không phải 503 ⇒ 8 biến merchant dựng được registry); guest `/api/me/membership` 401; guest `/api/voice/tts/plan` 404; `/vi/membership` 200 và có 99.000. Đối chiếu tài liệu SePay: header `x-sepay-signature` / `x-sepay-timestamp`, prefix `sha256=`, HMAC của `` `${timestamp}.${body}` ``, lệch ≤ 5 phút, `transactionDate` dạng `YYYY-MM-DD HH:mm:ss` — khớp code và test có sẵn.

Activate 2026-10-30 (được phép): transaction §1.3 → `UPDATE 1` cho `plus`, `UPDATE 1` cho `free` (không có `plus` active cũ để retire), `COMMIT`. Catalog đọc lại trả 200 với `free` `price.vnd 0`, `allowances 60/12/0/0`, `buyable false` và `plus` `99.000`, `termDays 30`, `allowances 300/60/1.200/10.000`, `buyable true` — khớp `pilotPlans` và kỳ vọng §1.4. Cờ vẫn tắt nên chưa tạo order nào.

Chưa kiểm: một giao dịch/hoàn tiền thật, giá trị `gateway` thật trong payload BIDV (tài khoản BIDV chưa có giao dịch nào; chỉ chứng minh được bằng webhook ký thật), `SEPAY_BANK_ACCOUNT_NUMBER` có trùng `accountNumber` hay không (cùng lý do), và `TTS_PROVIDER` trên Render (không đọc được từ ngoài). Các mục này thuộc #95 và cần chủ project cho phép; pass local không được ghi thành live verified.

Runtime thật trên production (2026-10-30, tài khoản admin `linhdn0908@gmail.com`, cờ `enforce` bật ở cả Render và Vercel): `/vi/profile` hiện Free `60/60`, "hôm nay còn 12", STT và TTS đều "Không có trong gói này"; một lượt Coach thật trả lời được và chip tụt `60 → 59`; `usage_buckets` có `chat/calendar_month 60 consumed 1` và `chat/calendar_day 12 consumed 1`, tức trừ đúng một lượt; `usage_requests`/`usage_attempts` có dòng cho lượt đó. Checkout Plus tạo order `pending` reference `MTFT3852775403` @ 99.000₫, QR BIDV `8843275367`, `payment_events` = 0 — **chưa chuyển tiền**. Bốn lượt Coach của account `linhdang.dev96@gmail.com` lúc 04:26–04:27 cùng ngày cũng đi qua quota theo cùng đường.

Phát hiện khi đọc ledger: mọi `usage_attempts` có `cost_micro_vnd` và `tariff_version` NULL, vì production trả lời bằng `google/gemini-3.5-flash-lite` còn `approvedTariff` chỉ có `openai/gpt-6-luna`. Đã thêm giá list Google ($0,30 / $2,50 per 1M token → 7.750 / 64.585 micro-VND) vào tariff version `2026-10-30` kèm test, commit `cc71928`. Sau khi Vercel success và Render nhận bản mới, một lượt Coach thật lúc 04:46 UTC ghi `cost_micro_vnd` = 21.250.500 (2.742 input) + 24.671.470 (382 output) + 1.387.250 (179 input) + 2.389.645 (37 output) = **49,70đ** cho lượt, `tariff_version = '2026-10-30'`, quota `calendar_month`/`calendar_day` cùng `consumed 2`. Đọc kèm: project Google đang ở **free tier** nên 49,70đ là giá list tương đương, **không phải tiền đã trả**; ràng buộc thật là hạn mức request/ngày của Google, và kịch bản 41,3% ở §4.1 chỉ áp dụng khi bật billing. Gateway shopaikey hiện chạy `deepseek-v4-flash`; giá đọc trên shopaikey.com/models cùng ngày ($3,60 / $10,80 per 1M) đã vào tariff với hai dòng `openai/deepseek-v4-flash` (93.003 / 279.008 micro-VND) — 252,41đ mỗi answer call, gấp 14 lần luna, nên chuyển text về gateway là phương án đắt chứ không phải đường thoát.

Sự cố chẩn đoán sai (2026-10-30, cùng ngày — ghi lại để không lặp): sau khi push `926de6a` (chỉ đổi tariff
+ docs) tôi thấy guest `/api/voice/tts/plan` trả **404** và kết luận Render đã kéo `MEMBERSHIP_ENFORCEMENT`
về `off`. Sai: probe gửi **POST**, còn route là **GET**, nên 404 đó chỉ là Express "không có route"
(`{"error":"not found"}`), không phải nhánh `tts_plan_unavailable`. Probe đúng (**GET**) trả **401
`unauthenticated`** → enforcement vẫn bật suốt. Đã sửa `render.yaml` → `"enforce"` (commit `5051532`) để
file khớp giá trị đang chạy, nhưng lý do ban đầu là sai. Bài học: `tts/plan` phải probe bằng **GET**; 404
chỉ có nghĩa "cờ tắt" khi body là `{"error":"speech plan is unavailable","code":"tts_plan_unavailable"}` —
kiểm body chứ đừng chỉ nhìn status.
