# Review chức năng "Chùa Cầu May"

- **Ngày:** 2026-11-05
- **Phạm vi:** `apps/web/components/temple/*`, `apps/api/src/temple/*`
- **Mốc code:** `d8f440f` (mới nhất trong nhóm commit temple)
- **Tính chất:** review read-only, không sửa code, không chạy test DB-backed, không mở UI thật.

---

## Nghiêm trọng

### 1. Múi giờ: "Hôm nay", BXH tuần và nhật ký 28 ngày bị lệch 7 tiếng

`apps/api/src/temple/practice.ts:118-119`, `apps/api/src/temple/merit.ts:236`

```sql
p.day = (CURRENT_DATE + INTERVAL '7 hours')::date
```

`CURRENT_DATE` là `date`, cộng interval ra `timestamp 00:00 UTC`, rồi cast `::date` lại **đúng ngày UTC cũ**. Đã kiểm tra DB: timezone `Etc/UTC`, biểu thức này trả về cùng ngày. Hệ quả: từ 00:00–07:00 giờ Việt Nam, "Hôm nay" và "Tuần" hiển thị số của hôm qua; nhật ký 28 ngày cũng lệch. Nghiêm trọng hơn: `vnDay()` bên JS ghi đúng ngày Hà Nội, nên **đọc và ghi lệch nhau** — người tu lúc 6h sáng thấy công đức vừa làm biến mất khỏi "hôm nay".

**Sửa:** dùng `(now() + INTERVAL '7 hours')::date` ở cả 3 chỗ, hoặc `(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`.

### 2. Stored XSS qua tên người chơi

`apps/web/components/temple/people.tsx:74-89` + `apps/web/components/temple/ui.tsx:67`

Tên người chơi được tự đổi, tối đa 28 ký tự (`identity.ts:268-271`) — vừa đủ `<svg/onload=alert(1)>` (21 ký tự). Chuỗi này được nội suy thẳng vào `s.toast(...)`, mà `Toast` render bằng `dangerouslySetInnerHTML`. Người chơi khác chỉ cần mở thẻ, bấm "Kết bạn" hoặc gửi lời chúc là kích hoạt. Đây là XSS lưu trữ, không phải reflected: kẻ tấn công đổi tên một lần, nạn nhân nào chạm vào cũng dính.

**Sửa:** bọc `esc(p.name)` ở cả hai toast (helper đã có sẵn ở `ui.tsx:53`, `temple-app.tsx:363` đang dùng đúng). Tốt hơn: đổi `toast()` sang nhận `ReactNode` và bỏ `dangerouslySetInnerHTML` cho các chuỗi có dữ liệu người dùng.

### 3. Thiền bị cộng công đức hai lần

`apps/web/components/temple/practice.tsx:270-283`, `apps/api/src/temple/practice.ts:212-225`

Client: effect tự dừng chạy mỗi 250ms, `stop()` không có cờ chống gọi trùng, nên khi chạm mốc nó bắn `meditate_end` liên tục cho tới khi `setStart(null)` kịp render. Bấm "Xả thiền" tay cũng gọi được lần hai.

Server: `endMeditation` làm `SELECT meditate_start` → `UPDATE ... SET NULL` không nguyên tử. Hai request đồng thời đều đọc được `meditate_start`, đều qua cửa, đều được cộng công đức.

**Sửa hai lớp:**

- Client: `const stopping = useRef(false)` chặn trong `stop()`, reset khi bắt đầu thiền mới.
- Server: một câu `UPDATE temple_profiles SET meditate_start = NULL WHERE user_id = $1 AND meditate_start IS NOT NULL RETURNING meditate_start`, rồi mới tính phút từ giá trị trả về; không có hàng nào trả về thì 400.

---

## Cao

### 4. Join trùng trên cùng socket tạo avatar ma

`apps/api/src/temple/ws.ts:99-147`, `apps/api/src/temple/rooms.ts:26-50`

Mỗi lần nhận `join`, server tạo `RoomMember` mới rồi `rooms.add(member)`. `add` gọi `remove(member)` — nhưng `remove` xoá theo **identity object**, không theo `profile.id`, nên object cũ không bị xoá. Kết quả: một người nằm hai lần trong set, online tăng sai, avatar ma đứng mãi; `forget()` khi đóng socket chỉ xoá member mới nhất. Nếu client tự gửi `join` hai lần (hiện tại chưa, nhưng API không chặn) là dính ngay.

**Sửa:** đầu handler `if (ws.member) return;`, hoặc cho `rooms.add` xoá theo `profile.id` trước khi thêm.

### 5. Reconnect xong avatar đứng ở toạ độ 0,0 trên máy người khác

`apps/web/components/temple/room.ts:125-136`, `apps/api/src/temple/ws.ts:131`

Khi mất mạng, client giữ nguyên `lastSent`. Sau reconnect, vị trí không đổi nên không gửi lại; server dựng state từ message `join` (không có x/z) → `(0,0)`. Người khác thấy avatar nhảy về gốc toạ độ cho tới khi có 5% random resend hoặc người đó di chuyển.

**Sửa:** trong `onopen`/sau `connect()` đặt `this.lastSent = ''`, hoặc gửi ngay một frame `s` sau khi nhận `joined`.

### 6. Đèn hoa đăng của khách rơi vào ngõ cụt

`apps/api/src/temple/hall.ts:89-104`

Khách (mặc định, chưa xác minh email) luôn được ghi `status='pending'`. Nhưng **không có route duyệt nào** trong toàn bộ module. Đèn bị trừ khỏi túi, công đức vẫn cộng, không broadcast, mà UI vẫn báo "Đã thả đèn nguyện". Người chơi mất vật phẩm và không bao giờ thấy đèn mình.

**Sửa:** hoặc cho khách `live` luôn (bỏ nhánh pending), hoặc thêm route duyệt cho admin + thông báo "đèn đang chờ duyệt" ở client. Nếu giữ pending thì đừng trừ túi/cộng công đức trước khi duyệt.

Kèm theo, cùng file:

- `hall.ts:113-128`: `rejoice` INSERT trước khi kiểm tra đèn tồn tại → đèn không tồn tại thì FK ném 500 thay vì 404; và đang cho phép "hoan hỷ" đèn `pending`/`rejected`. Sửa: `SELECT ... WHERE id=$1 AND status='live'` trước, rồi mới INSERT.
- `hall.ts:172-194`: harvest đọc `ripe` rồi UPDATE vô điều kiện → hai người bấm cùng lúc đều hái được. Sửa: `UPDATE ... WHERE id=$1 AND ripe AND (next_pick_at IS NULL OR next_pick_at <= now()) RETURNING per_pick`; không có hàng thì 409.

---

## Trung bình

### 7. Farm công đức không giới hạn

`apps/api/src/temple/practice.ts` (các route `/practice`, `/greetings`)

Không rate limit, không cooldown. `POST /greetings` cộng 10 exp mỗi lần, gọi bao nhiêu cũng được; `bow`, `bell`, `chant_done` cũng vậy. Điều này đi ngược chính nguyên tắc "server owns the numbers" mà module đang theo đuổi: con số đúng, nhưng tần suất do client quyết.

**Sửa tối thiểu:** cooldown theo user + loại hành động trong bộ nhớ (như `attemptAllowed` sẵn có), hoặc chặn theo `updated_at`/`day` trong DB. Không cần làm phức tạp hơn.

### 8. Không dọn dẹp khi unmount, rò rỉ bộ nhớ

`apps/web/components/temple/temple-app.tsx:379` (không có cleanup gọi `engine.dispose()` / `room.close()`), `apps/web/components/temple/room.ts:44` (`profs` không bao giờ xoá id đã rời)

Rời trang rồi quay lại: `startedRef` vẫn `true` nên không khởi tạo lại; WebGL context và interval vẫn sống. `profs` chỉ `clear()` khi nhận `joined`, nên trong một phiên dài nó tích mọi người từng thấy. Tab ẩn vẫn đẩy vị trí 200ms/lần.

**Sửa:** thêm `useEffect` cleanup gọi `roomRef.current?.close()` và `engRef.current?.dispose()`; xoá `profs` khi nhận danh sách `gone`, hoặc xoá theo `states`.

### 9. Đổi đồ không được phát cho người khác

`apps/web/components/temple/hall.tsx:404-405` (comment nói "để người khác trong phòng cũng thấy"), `apps/api/src/temple/identity.ts` (PUT `/profile` không `publishToTemple`)

Thực tế không có broadcast nào. Người khác chỉ thấy avatar mới khi reconnect hoặc khi họ tự đổi gì đó. **Sửa:** sau `updateTempleProfile`, gọi `publishToTemple` với profile mới (hoặc thêm `pushLook` như comment mô tả).

### 10. `ensureTempleTables()` cache lỗi vĩnh viễn

`apps/api/src/temple/schema.ts:12-19`

`tablesReady ??= ...` — nếu promise reject (DB chập chờn đúng lúc khởi động), mọi request chùa sau đó fail cho tới khi restart process. **Sửa:** `.catch((e) => { tablesReady = undefined; throw e; })`.

### 11. Loader không có đường thoát

`apps/web/components/temple/temple-app.tsx:425-452`

Nếu `/guest` bị 429 (10 request/phút/IP) hoặc `/state` lỗi, màn hình đứng ở loader với thông báo lỗi, không nút thử lại. Nhánh WebGL có retry, nhánh này thì không. **Sửa:** dùng chung nút "Thử lại" gọi lại hàm boot.

---

## Thấp / vặt

- `temple-app.tsx:228`: sau vòng 10, `ROUND_NAMES[...]` ra `undefined` → nhãn quay về "Vòng thứ nhất". Dùng modulo hoặc số thứ tự.
- `temple-app.tsx`: badge quẻ ẩn khi đóng modal mà chưa gieo; badge vòng quay cũ khi modal đang mở.
- `room.ts:186,201`: `room3` / `roomFull` là code chết — server không bao giờ gửi.
- `social.ts`: `/dms` trả `MAX(at)::text`, không phải ISO, client parse bằng `Date` có thể lệch múi giờ.
- `social.ts`: `gift_sen` nhận `NaN`/số lẻ → 500 thay vì 400. Dùng `num()` như các route khác.
- `identity.ts`: PUT `/profile` thay nguyên object `appearance`/`equipped` thay vì merge — client gửi thiếu key là mất đồ.
- `schema.sql`: thiếu index `temple_friends.friend_id`, `temple_dms.from_user`; không có retention cho `temple_lanterns`/`temple_greetings`.
- `hall.ts`: thưởng vòng quay và donate nằm ngoài transaction — lỗi giữa chừng là mất vật phẩm hoặc cộng tiền mà không trừ.
- `practice.ts:198-208`: `startMeditation` cũng đọc-rồi-ghi, hai request đồng thời có thể cùng start.
- `practice.ts` route `visit`: kiểm tra `visits === 0` phía client, server không chặn → gọi lại được.

---

## Điểm tốt nên giữ

- Luồng boot session → state đã đúng thứ tự sau `d8f440f`; vé WS một lần, hết hạn ngắn.
- Danh tính và con số nằm ở server, client không tự khai level/Sen.
- Toast đèn và effects đã escape đúng chỗ (`temple-app.tsx:363`), chỉ còn lỗ hổng ở `people.tsx`.
- Test hợp đồng HTTP/WS khá tốt: `endpoints.test.ts`, `tickets.test.ts`, `rooms.test.ts`, `lantern-broadcast.test.ts`.

---

## Ghi chú phạm vi

Không chạy test DB-backed và không mở UI thật; các kết luận dựa trên đọc code + một truy vấn xác nhận timezone DB. Rủi ro lớn nhất nếu chỉ sửa một chỗ: XSS tên người chơi (cần sửa ngay), và timezone (sửa đọc mà quên `vnDay` ghi thì vẫn lệch).
