# Báo cáo pilot hội viên — #96

Ngày chốt số: **2026-10-30** (mọi mốc giờ là UTC). Cửa sổ pilot: **30/10 → 29/11/2026** (kỳ Plus dùng thử 30 ngày của chủ project).
Số liệu đọc trực tiếp từ Supabase production (`memberships`, `payment_orders`, `payment_events`, `membership_events`, `usage_requests`, `usage_attempts`, `usage_buckets`), read-only, không gọi provider nào.

## 1. Cấu hình đang chạy

| Hạng mục | Giá trị |
| --- | --- |
| Offer | `free v1` active (0đ, 60 lượt/tháng · 12/ngày, không STT/TTS); `plus v1` active (99.000đ/30 ngày, 300 lượt · 1.200 giây · 10.000 ký tự) |
| Enforcement | `MEMBERSHIP_ENFORCEMENT=enforce` ở cả Render API và Vercel web |
| Merchant | SePay, BIDV qua VA `96247LD0908`; webhook `MetaBoardTFT` = `In_only`, `HMAC_SHA256`, `only_va: true`, prefix `MTFT`, **`skip_if_no_code: false`** (đã tắt 2026-10-30, đọc qua `GET /v2/webhooks`, không in secret) |
| Model Coach | `google/gemini-3.5-flash-lite` (Google free tier), tariff `2026-10-30` |

## 2. Giao dịch

| Chỉ số | Số |
| --- | --- |
| Order tạo | 7 (`MB828453977555` + 6 `MTFT…`) |
| Order `paid` | 1 — `MTFT9312097918`, `paid_vnd` 99.000, settled 07:11:03 |
| Order `pending` quá hạn | 6 (5 lần chuyển không tới + 1 đơn lạ `MTFT3980637260` 07:12:16 → 07:27:16; không đơn nào có `paid_vnd`) |
| `payment_events` | 1 (`webhook`/`granted`) |
| `memberships` | 1 `plus`/`active`/`purchase`, 30/10 07:11:03 → 29/11 07:11:03 |
| `membership_events` | 1 `grant` (`purchase`), reason "payment confirmed for order MTFT9312097918" |
| Doanh thu | **99.000đ** |

Dòng thời gian đáng nhớ: 2 lần chuyển 99.000đ vào **số tài khoản gốc** BIDV (`8843275367`) không tới server vì BIDV cá nhân không có feed tài khoản chính; sau khi checkout phát VA `96247LD0908`, giao dịch đầu tiên tới webhook 07:11:02 và kích hoạt Plus trong 1 giây.

**Cập nhật 07:35 UTC cùng ngày — bảng trên là snapshot trước đó:** có thêm một đơn thật thứ hai `MTFT3111910586` (99.000đ, account `linhdang.dev96@gmail.com`) trả qua VA lúc 07:34:51 và grant Plus đúng hạn, nhưng vì nó đi qua **đường lookup** (`POST /api/me/orders/:id/refresh`) nên landed `paid` với `paid_vnd`/`settled_at` NULL — lỗi đã tìm ra và sửa trong [orders.ts](../apps/api/src/membership/orders.ts) (§#95 của plan). Tổng ledger lúc này: 8 order (2 `paid`), 2 `payment_events`, 2 `memberships` `plus`/`active`; doanh thu thật **198.000đ**. Dòng thiếu đã được backfill (`paid_vnd` 99.000, `settled_at` 07:34:58.911Z, event → `granted`) nên đơn thứ hai hoàn tiền được trong cửa sổ 7 ngày.

## 3. Dùng thật

| Chỉ số | Số |
| --- | --- |
| Account | 2 (1 admin, 1 khách thử) |
| Hội thoại Coach | 11 |
| `usage_requests` | 11, tất cả `coach_turn`/`completed` (04:26:04 → 07:15:23) |
| `usage_attempts` | 63 dòng = 21 lượt dispatch × (input, output, dòng không billed unit) |
| Dòng có giá | 24 (12 lượt sau mốc tariff 04:46:12) |
| Dòng thiếu giá | 18 dòng input/output trước mốc tariff + 21 dòng không có `billed_unit` (không tính tiền) |
| Biến phí (giá list) | **237,10đ** cho 12 lượt ≈ 19,8đ/lượt |
| Chi phí tiền mặt | **0đ** (Google free tier; ledger ghi giá list làm trần) |
| Bucket chat | Free: 8/60 tháng, 8/12 ngày; Plus: 1/300 kỳ, 3/60 ngày (2 lượt Free trước khi mua + 1 lượt Plus) |

Biên gộp theo giá list: `(99.000 − 237,10) / 99.000` ≈ **99,76%**. Con số này chỉ có nghĩa ở mức "chi phí còn rất nhỏ so với doanh thu một kỳ"; nó **không** thay cho kịch bản xấu nhất trong [MEMBERSHIP-UNIT-ECONOMICS.md](MEMBERSHIP-UNIT-ECONOMICS.md) (41,3% doanh thu nếu bật billing Google ở p95).

## 4. Quyết định cần chốt (đóng các gate treo của #95)

1. **Giữ model `gemini-3.5-flash-lite` cho pilot.** Đây là model đang trả lời thật, đang ở free tier nên tiền mặt bằng 0; đổi sang `gpt-6-luna` chỉ để hạ trần lý thuyết 41,3% → 31,5% nhưng phải trả tiền cho mọi lượt ngay. Điều kiện xem lại: khi bật billing Google, hoặc khi p95 biến phí vượt 40% doanh thu kỳ. Đổi model **không cần deploy** — `ASSISTANT_PROVIDER` + `GOOGLE_MODEL`/`OPENAI_MODEL` trong `/admin/settings`.
2. **`skip_if_no_code` đã tắt** (2026-10-30). Khoản chuyển không mã giờ tới server; app trả `review`/`order_not_found` chứ không tự cấp quyền.
3. **Hoàn tiền: chưa chạy với tiền thật.** Đơn duy nhất đã trả được user quyết giữ làm gói thử nên không có order nào để thu hồi. Đường app đã có bằng chứng end-to-end trên bản ghi thật ở môi trường dev (`#87`/`#91`: webhook ký thật → order `paid` → admin refund → kỳ `revoked` + audit, lần hai 409). Phần **chuyển tiền hoàn** là thao tác thủ công của người giữ tiền, không nằm trong code. Muốn có bằng chứng tiền thật cần một giao dịch mới 99.000đ rồi hoàn — chưa làm.
4. **Không mở đăng ký công khai** cho tới khi có kênh hỗ trợ + điều khoản hoàn tiền do chủ project duyệt (§12 của plan).

## 5. Điều kiện đóng pilot

Pilot đóng khi một trong hai điều xảy ra, và ghi lại lý do:

- Hết 29/11/2026: kỳ Plus thử kết thúc, account về Free đúng hạn, không có gia hạn tự động.
- Hoặc chủ project quyết dừng sớm: `retire` offer (không xoá ledger), giữ lịch sử đọc; rollback theo [RUNBOOK-MEMBERSHIP.md](RUNBOOK-MEMBERSHIP.md) §5.

Tiêu chí "pilot đạt": không có giao dịch nào bị cấp quyền sai, không có lượt nào vượt quota, không có dòng chi phí không giải thích được, và không có order `review` tồn đọng quá 24 giờ.

## 6. Việc còn treo (không chặn đóng #96)

- Refund tiền thật (mục 4.3) — cần một giao dịch mới.
- Chưa có traffic ngoài chủ project: mọi số liệu dùng là của 2 account nội bộ, nên chưa nói gì về hành vi khách thật.
- `TTS_PROVIDER` trên Render vẫn không đọc được từ ngoài (ledger text đã đủ để biết model).
- Admin plan editor (#98) chỉ để đổi offer không cần deploy; pilot hiện tại chạy bằng seed.
