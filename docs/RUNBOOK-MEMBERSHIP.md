# Runbook — paid membership pilot (task #94)

Trạng thái: soạn 2026-10-30. Code đã lên production cùng ngày với cờ **tắt** (commit `6f65f53`), nhưng **chưa bước nào trong runbook này được chạy trên production**: chưa áp schema, chưa seed, chưa bật offer, chưa đặt `MEMBERSHIP_ENFORCEMENT`. Vì vậy `GET /api/membership/catalog` trên production đang trả 503 và không có gì để bán. Phần đã kiểm chỉ là local (§7). Merchant account, webhook thật, chuyển/hoàn tiền thật, migration + seed prod và cờ enforce vẫn là các gate riêng của #95.

Nguyên tắc: không dán secret vào chat hay tài liệu (chỉ tên biến). Mọi thao tác ghi vào production cần chủ project cho phép rõ ràng. Ledger tài chính/usage là append-only — không DROP bảng, không sửa tay row đã ghi, không "xoá cho sạch" khi có sự cố.

Biến và bảng liên quan: `MEMBERSHIP_ENFORCEMENT`, `MEMBERSHIP_FREE_PLAN_CODE`, `TTS_PROVIDER`, `STT_PROVIDER`, `ASSISTANT_PROVIDER`/`ASSISTANT_MODEL`, `SEPAY_WEBHOOK_SECRET`, `SEPAY_*`, `PAYOS_*`, `VIENEU_TTS_URL`/`VIENEU_TTS_API_KEY`, `DEEPGRAM_API_KEY`, `GROQ_API_KEY`. Bảng: `plan_versions`, `memberships`, `membership_events`, `usage_buckets`, `usage_requests`, `usage_reservations`, `usage_attempts`, `payment_orders`, `payment_events`.

## 1. Trước khi bật cờ

### 1.1 Backup và phạm vi

- Snapshot/PITR Supabase trước mọi thay đổi; ghi lại id snapshot và commit đang deploy.
- Xác nhận đang trỏ đúng project production (đọc tên project, **không** in `DATABASE_URL`).
- Chưa bật `MEMBERSHIP_ENFORCEMENT` ở đâu cả: API là `off/unset`, web Vercel cũng vậy.

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

Shape: `{ offers: [{ planVersionId, code, version, label, price: { vnd, currency }, termDays, allowances: { chatPerPeriod, chatPerDay, sttSecondsPerPeriod, ttsCharactersPerPeriod }, buyable }] }`. Phải thấy `free` `price.vnd` 0, `allowances` 60 / 12 / 0 / 0, `buyable: false`; `plus` 99.000, `termDays` 30, `allowances` 300 / 60 / 1.200 / 10.000, `buyable: true`. Đối chiếu với [pilotPlans](../packages/shared/src/membership-plans.ts). Trang pricing đọc hằng số còn checkout/profile đọc catalog, nên hai bên lệch nhau là lỗi chặn bán (đã thấy trên dev vì row cũ đang được dùng — xem #93).

### 1.5 Cấu hình tốn tiền và merchant

- `TTS_PROVIDER=vieneu` giữ cơ sở 22,0% của #92; để trống/`deepgram` thì tiếng Việt qua Flux và chi phí thành 24,0%. Đây là biến của cost gate, không phải sở thích.
- `ASSISTANT_MODEL` đúng model đã duyệt (`gpt-6-luna`) và key gateway còn hạn — kiểm bằng một lượt Coach của account test, không cần benchmark.
- Merchant: `SEPAY_*` đủ bộ, webhook URL trỏ `/api/payments/webhook/sepay`, secret khớp dashboard. Không có bước nào ở đây tự tạo giao dịch.
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

Chưa kiểm: merchant account và webhook live, một giao dịch/hoàn tiền thật, migration + seed trên production, cờ enforce trên Render/Vercel, cost thật theo ledger của traffic thật. Các mục này thuộc #95 và cần chủ project cho phép; pass local không được ghi thành live verified.
