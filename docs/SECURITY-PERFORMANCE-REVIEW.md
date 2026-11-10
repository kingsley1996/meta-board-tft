# Review bảo mật và hiệu năng TFTIQ

- **Ngày review:** 2026-11-10.
- **Phạm vi:** mã hiện tại trong working tree, bao gồm các thay đổi set-rotation chưa commit; không chỉ riêng Đền Cầu May.
- **Trạng thái:** SEC-01 đã sửa và kiểm chứng local; chưa deploy. Các phát hiện khác chưa sửa.
- **Phương pháp:** đọc đường thực thi và đối chiếu các lớp bảo vệ; kiểm chứng một số lỗi bằng tiến trình, database và provider giả lập.
- **Không thực hiện:** thay đổi production, gọi provider thật, load-test, build production mới, đo GPU trong browser hoặc đối chiếu CVE dependency.

Đây là review có ưu tiên theo rủi ro, không phải chứng nhận toàn bộ dự án an toàn. Vị trí dòng tương ứng với mã tại thời điểm review và có thể dịch chuyển khi sửa.

## Tổng hợp

| ID | Mức | Phát hiện | Kiểm chứng |
| --- | --- | --- | --- |
| SEC-01 | P1 | Thông điệp WebSocket sai kiểu có thể làm dừng API — đã sửa local | Regression qua socket thật với DB giả lập |
| SEC-02 | P1 | Ghép Google login giữ thông tin đăng nhập chưa xác minh | Handler thật với DB/provider giả lập |
| REL-01 | P1 | Webhook báo thành công khi transaction thanh toán thất bại | Hàm thật với transaction lỗi giả lập |
| PERF-01 | P1 | Cộng điểm giữ connection trong khi xin thêm connection | Hàm thật với pool giả lập |
| SEC-03 | P2 | Cập nhật hồ sơ cho phép mặc trang bị chưa sở hữu | Đối chiếu route, validator, SQL và render |
| SEC-04 | P2 | Thiền rất ngắn vẫn được thưởng một phút | Đối chiếu phép tính và đường cộng thưởng |
| SEC-05 | P2 | Lỗi đọc hội thoại có thể bỏ qua kiểm tra quyền ghi | Đối chiếu fallback và SQL ghi tin nhắn |
| PERF-02 | P2 | Cache không dọn khóa hết TTL, không có trần dung lượng | Kiểm chứng với đồng hồ giả lập |
| PERF-03 | P2 | Thay avatar không giải phóng đủ tài nguyên GPU riêng | Đối chiếu khởi tạo và disposal |
| PERF-04 | P2 | Hàng đợi inference không giới hạn và không huỷ được khi chờ | Đối chiếu admission, queue và tác vụ nền |
| PERF-05 | P2 | Giới hạn concurrency của STT có race | Đối chiếu vị trí kiểm tra, await và tăng bộ đếm |
| OBS-01 | Cần đo | Breadcrumbs đưa module dữ liệu lớn vào client graph toàn site | Đối chiếu import; chưa đo bundle thực tế |

**P1:** xử lý trước vì ảnh hưởng tài khoản, thanh toán hoặc khả năng phục vụ chung. **P2:** lỗi có bằng chứng trong mã nhưng phạm vi tác động hẹp hơn hoặc cần điều kiện cụ thể.

## 1. SEC-01 — WebSocket có thể làm dừng toàn bộ API

**Mức:** P1 — bảo mật/availability.

**Vị trí:**
- [apps/api/src/temple/ws.ts:100–114](../apps/api/src/temple/ws.ts#L100): parse và dispatch thông điệp.
- [apps/api/src/temple/ws.ts:178–188](../apps/api/src/temple/ws.ts#L178): xử lý `look` có thao tác async với database.

### Điều kiện và nguyên nhân

Kết nối cần vé WebSocket hợp lệ; khách cũng có thể được cấp vé. Không cần hoàn tất join phòng để chạm đường parse.

`JSON.parse` chấp nhận `null`, nhưng code ép kiểu TypeScript thành `Record<string, unknown>` rồi đọc `msg.t` mà không kiểm tra giá trị runtime. `try/catch` chỉ bao quanh phép parse, không bao quanh bước dispatch.

Listener của sự kiện `message` là hàm async. EventEmitter không tự xử lý promise bị reject; với cấu hình Node mặc định của dự án, rejection không được bắt có thể làm tiến trình thoát. Lỗi database trong nhánh `onMemberMessage` cũng có thể đi qua cùng khoảng trống xử lý lỗi.

### Tác động và bằng chứng

HTTP API và các phòng realtime chạy chung tiến trình, nên lỗi không chỉ ảnh hưởng người gửi. Đã trích listener thật và chạy trong tiến trình cô lập: đầu vào `null` gây `TypeError`, tiến trình thoát mã `1`. Không mở socket, gọi database hoặc tác động server đang chạy.

### Hướng sửa và gate

- Sau parse, chỉ nhận object khác null và không phải array; kiểm tra loại thông điệp trước dispatch.
- Bắt lỗi toàn bộ tác vụ async, đóng hoặc từ chối riêng kết nối lỗi thay vì để rejection thoát ra process.
- Regression test cho JSON lỗi, null, array, scalar và lỗi database trong nhánh `look`; server phải tiếp tục phục vụ kết nối khác.

### Đã sửa local — 2026-11-10

- Chỉ dispatch object khác null, không phải array, có `t` là string; payload không hợp lệ bị bỏ qua.
- Bao toàn bộ dispatch trong `try/catch`, bắt cả lỗi async của `join`/`look` và lỗi ép kiểu state; chỉ đóng socket lỗi bằng code `1011`, không gửi chi tiết database ra client.
- [ws.test.ts](../apps/api/src/temple/ws.test.ts) dùng WebSocket/HTTP thật trên loopback và mock truy vấn DB; xác nhận luồng join, cập nhật hồ sơ, di chuyển, emote và kết nối khác vẫn hoạt động.
- `node --test apps/api/src/temple/ws.test.ts apps/api/src/temple/rooms.test.ts`: 13/13 pass. `npm run typecheck --workspace @tftiq/api`: pass.
- Chưa commit, push hoặc deploy; không chạm database dev/production.

## 2. SEC-02 — Ghép Google login có nguy cơ giữ quyền truy cập của người đăng ký trước

**Mức:** P1 — bảo mật tài khoản.

**Vị trí:**
- [apps/api/src/auth-routes.ts:315–338](../apps/api/src/auth-routes.ts#L315): tìm và ghép tài khoản theo email.
- [apps/api/src/accounts.ts:204–210](../apps/api/src/accounts.ts#L204): cập nhật Google ID và trạng thái xác minh.
- [apps/api/src/auth-routes.ts:219–235](../apps/api/src/auth-routes.ts#L219): đăng nhập bằng mật khẩu.

### Điều kiện và nguyên nhân

Callback lấy `email_verified` từ Google nhưng không kiểm tra trường đó trước khi liên kết. Khi tìm thấy tài khoản local cùng email, server tự ghép danh tính và đánh dấu email đã xác minh.

Nếu người khác đã đăng ký email đó trước chủ thật, tài khoản local có thể chứa mật khẩu do người đăng ký trước đặt. Khi chủ email dùng Google, code vẫn giữ mật khẩu này và không thu hồi các session cũ.

### Tác động và bằng chứng

Người đăng ký trước có thể tiếp tục truy cập tài khoản sau khi chủ thật dùng Google. Kiểm chứng bằng handler thật và dữ liệu giả lập cho thấy:

- Profile Google có `email_verified: false` vẫn đi tới nhánh đăng nhập thành công.
- Mật khẩu của tài khoản local chưa xác minh vẫn đăng nhập được sau khi ghép Google, kể cả khi bật yêu cầu xác minh email.
- Luồng ghép không thu hồi session cũ.

Đây là kiểm chứng logic ứng dụng, không phải thử chiếm tài khoản Google hoặc tài khoản production.

### Hướng sửa và gate

- Bắt buộc kiểm tra email Google đã được xác minh.
- Không coi trùng email là đủ bằng chứng để giữ nguyên mọi thông tin đăng nhập local.
- Với tài khoản local chưa chứng minh quyền sở hữu, thiết kế luồng xác thực/khôi phục an toàn; xử lý mật khẩu, session và token liên quan trong cùng chính sách liên kết.
- Chỉ thêm kiểm tra `email_verified` là chưa đủ để xử lý trường hợp mật khẩu local được đăng ký trước.
- Regression test phải bao phủ cả Google email chưa xác minh và tài khoản local chưa xác minh có mật khẩu cũ.

## 3. REL-01 — Webhook báo thành công dù ghi nhận thanh toán thất bại

**Mức:** P1 — độ tin cậy thanh toán.

**Vị trí:**
- [apps/api/src/membership/orders.ts:666–690](../apps/api/src/membership/orders.ts#L666): commit thanh toán, cấp quyền lợi và xử lý lỗi.
- [apps/api/src/membership/orders.ts:730–742](../apps/api/src/membership/orders.ts#L730): `handleWebhook` trả `ok: true` sau khi thu outcomes.
- [apps/api/src/payments/routes.ts:61–68](../apps/api/src/payments/routes.ts#L61): chuyển kết quả thành HTTP 200.
- [apps/api/src/membership/orders.ts:435–439](../apps/api/src/membership/orders.ts#L435): reconciliation bỏ qua đơn đã `paid`.

### Điều kiện và nguyên nhân

Webhook đã qua xác minh chữ ký nhưng transaction database gặp lỗi tạm thời. `recordReceipt` bắt lỗi, rollback và trả kết quả `review` với `detail: unavailable`; `handleWebhook` vẫn trả `ok: true`, khiến route xác nhận HTTP 200.

Một cửa sổ khác là thanh toán đã commit nhưng bước cấp hội viên thất bại. Replay webhook có thể cấp lại bằng cơ chế idempotent hiện có, nhưng phản hồi 200 đã khiến provider không còn lý do retry. Luồng refresh phía khách bỏ qua đơn `paid` nên không tự khôi phục trường hợp này.

### Tác động và bằng chứng

Có thể mất lần ghi nhận sự kiện hoặc để đơn đã thanh toán nhưng chưa được cấp quyền lợi. Đã kiểm chứng `handleWebhook` thật với lỗi transaction giả lập: transaction rollback nhưng kết quả vẫn là `ok: true`, outcome `review/unavailable`.

Không phát hiện từ lỗi này rằng chữ ký webhook có thể bị giả mạo; vấn đề nằm ở cách xác nhận kết quả xử lý.

### Hướng sửa và gate

- Phân biệt review nghiệp vụ đã được lưu bền vững với lỗi hạ tầng chưa xử lý xong.
- Trả lỗi retryable, chẳng hạn 503, cho lỗi ghi nhận hoặc cấp quyền lợi tạm thời.
- Bổ sung đường retry idempotent cho đơn `paid` nhưng chưa `fulfilled`.
- Test lỗi trước commit, sau commit và trong bước grant; retry phải cấp đúng một lần, không cấp trùng.

## 4. PERF-01 — Cộng điểm có thể làm nghẽn connection pool

**Mức:** P1 — hiệu năng/availability và tính nhất quán phản hồi.

**Vị trí:**
- [apps/api/src/temple/merit.ts:76–114](../apps/api/src/temple/merit.ts#L76): vòng đời connection của `addMerit`.
- [apps/api/src/temple/identity.ts:227–229](../apps/api/src/temple/identity.ts#L227): `templeProfile` dùng `pool.query`.
- [apps/api/src/db.ts:12–20](../apps/api/src/db.ts#L12): pool hữu hạn và timeout lấy connection.

### Điều kiện và nguyên nhân

`addMerit` checkout một client và commit phần cộng điểm. Trước khi tới `finally` để release client này, hàm gọi `templeProfile`, vốn cần lấy connection từ pool lần nữa.

Nếu nhiều request đồng thời giữ hết pool ở bước đó, mỗi request chờ một connection khác trong khi vẫn giữ connection của mình. Các request khác dùng chung pool cũng bị ảnh hưởng, tới khi timeout giải phóng tình trạng chờ.

### Tác động và bằng chứng

API phụ thuộc database có thể chậm hoặc lỗi. Phần thưởng đã commit nhưng phản hồi thất bại khiến người chơi tưởng hành động chưa được ghi nhận.

Kiểm chứng bằng pool giả lập xác nhận việc đọc hồ sơ yêu cầu connection thứ hai khi connection đầu chưa release, và lỗi đọc xảy ra sau commit. Chưa load-test để đo ngưỡng concurrency thực tế.

### Hướng sửa và gate

- Đọc hồ sơ bằng client đang giữ, hoặc release client trước khi thực hiện pool-level read.
- Không đưa lỗi dựng phản hồi sau commit vào cùng nhánh rollback của transaction đã hoàn tất.
- Test với pool nhỏ và các lượt cộng điểm đồng thời; mỗi request phải hoàn tất mà không cần giữ hai slot cùng lúc.

## 5. SEC-03 — Cập nhật hồ sơ cho phép mặc trang bị chưa sở hữu

**Mức:** P2 — kiểm soát quyền và tính toàn vẹn economy.

**Vị trí:**
- [apps/api/src/temple/routes.ts:101–114](../apps/api/src/temple/routes.ts#L101).
- [apps/api/src/temple/identity.ts:316–355](../apps/api/src/temple/identity.ts#L316).
- [apps/web/vendor/temple/js/world.js:388–400](../apps/web/vendor/temple/js/world.js#L388).

`PUT /profile` chỉ lọc tên slot và cú pháp ID rồi merge `equipped` vào database. Không đối chiếu inventory, loại món đồ có phù hợp slot hay điều kiện mở khoá. Render lấy món đồ trực tiếp từ catalog theo ID đã lưu.

Bất kỳ người dùng có hồ sơ hợp lệ, kể cả khách, có thể lưu trang bị chưa mua. Kiểm tra kho đồ ở UI không bảo vệ được route này.

**Hướng sửa:** kiểm tra từng lựa chọn khác null với catalog và quyền sở hữu authoritative trước khi ghi. Giữ các món mặc định bằng entitlement rõ ràng hoặc backfill inventory, không tạo ngoại lệ bỏ qua kiểm tra toàn bộ.

**Gate:** món chưa sở hữu và sai slot phải bị từ chối; món đã sở hữu, starter hợp lệ và thao tác tháo đồ vẫn hoạt động.

## 6. SEC-04 — Thiền rất ngắn vẫn được thưởng một phút

**Mức:** P2 — tính toàn vẹn phần thưởng/BXH.

**Vị trí:**
- [apps/api/src/temple/practice.ts:39–49](../apps/api/src/temple/practice.ts#L39): cooldown chỉ áp dụng cho `bow`.
- [apps/api/src/temple/practice.ts:68–83](../apps/api/src/temple/practice.ts#L68): bắt đầu, kết thúc và cộng thưởng.
- [apps/api/src/temple/practice.ts:200–219](../apps/api/src/temple/practice.ts#L200): tính phút thiền.

Session được claim một lần là đúng, nhưng phép tính `Math.max(1, raw)` cho tối thiểu một phút ngay cả khi thời gian thực chỉ vài mili-giây. Nhiều session riêng biệt rất ngắn vì thế vẫn tạo phần thưởng theo phút.

Trần 240 phút/ngày vẫn giới hạn các request tuần tự; đây không phải kết luận cộng điểm vô hạn. Tuy nhiên, trần đó có thể được nhận mà không trải qua thời lượng tương ứng.

**Hướng sửa:** tính theo thời gian server thực, trả thưởng bằng không dưới thời lượng tối thiểu hoặc cộng dồn giây giữa các session thay vì làm tròn lên mỗi lần.

**Gate:** session tức thời không sinh một phút thưởng; thời lượng hợp lệ và trần ngày vẫn được tính đúng.

## 7. SEC-05 — Lỗi đọc hội thoại có thể bỏ qua kiểm tra quyền ghi

**Mức:** P2 — bảo mật dữ liệu, có điều kiện.

**Vị trí:**
- [apps/api/src/assistant/index.ts:253–266](../apps/api/src/assistant/index.ts#L253): fallback khi tải hội thoại thất bại.
- [apps/api/src/assistant/index.ts:354–361](../apps/api/src/assistant/index.ts#L354): lưu tin nhắn sau khi có câu trả lời.
- [apps/api/src/assistant/conversation-store.ts:35–71](../apps/api/src/assistant/conversation-store.ts#L35): kiểm tra ownership khi lấy/tạo hội thoại.
- [apps/api/src/assistant/conversation-store.ts:77–105](../apps/api/src/assistant/conversation-store.ts#L77): SQL ghi tin nhắn không có predicate ownership.

Đường thành công có kiểm tra quyền sở hữu. Nhưng khi việc tải hội thoại/history throw, route tiếp tục với `conversationId` gốc do client gửi. Bước persist sau đó không kiểm tra quyền sở hữu lần nữa.

Nếu người gọi biết UUID hội thoại của tài khoản khác, đồng thời việc tải bị lỗi tạm thời nhưng database hồi phục trước bước ghi, nội dung có thể bị chèn vào hội thoại đó. Không kết luận rằng mọi request đọc thành công đều bị IDOR, hoặc người gọi có thể đọc lịch sử của người khác qua lỗi này.

**Hướng sửa:** không persist với ID chưa được xác minh; trả 503 và xử lý reservation tương ứng, hoặc tiếp tục không lưu. Bổ sung kiểm tra ownership tại chính thao tác ghi.

**Gate:** giả lập lỗi đọc rồi database hồi phục; không được ghi tin nhắn hay đổi tiêu đề hội thoại không thuộc người gọi.

## 8. PERF-02 — Cache không dọn khóa hết TTL

**Mức:** P2 — bộ nhớ và độ bền dưới lưu lượng nhiều khóa khác nhau.

**Vị trí:**
- [apps/api/src/cache.ts:4–21](../apps/api/src/cache.ts#L4).
- [apps/api/src/comps.ts:381–394](../apps/api/src/comps.ts#L381).
- [apps/api/src/index.ts:90–94](../apps/api/src/index.ts#L90).

TTL chỉ quyết định có dùng lại entry hay không. Cache không có quét hết hạn hoặc giới hạn số khóa. Slug từ API public trở thành một phần của cache key; kết quả không tìm thấy comp cũng được cache.

Các slug khác nhau có thể khiến Map tăng liên tục giữa những lần invalidation, dù giá trị đã hết hạn. Đây không phải cache được giới hạn bộ nhớ chỉ nhờ TTL.

**Bằng chứng:** đưa ba khóa vào cache, tiến đồng hồ giả lập vượt TTL, rồi truy cập khóa thứ tư; cả bốn khóa vẫn còn trong Map.

**Hướng sửa:** thêm giới hạn dung lượng/eviction và dọn entry hết hạn; cân nhắc không giữ negative cache cho khóa tùy ý hoặc giới hạn nó riêng.

**Gate:** nhiều khóa khác nhau, kể cả kết quả rỗng, không vượt trần; entry hết hạn được thu hồi và lỗi loader không bị giữ lại.

## 9. PERF-03 — Thay avatar không giải phóng đủ tài nguyên GPU riêng

**Mức:** P2 — hiệu năng client và bộ nhớ GPU.

**Vị trí:**
- [apps/web/vendor/temple/js/world.js:396–414](../apps/web/vendor/temple/js/world.js#L396): dựng avatar mới và bỏ avatar cũ.
- [apps/web/vendor/temple/js/avatar.js:1657](../apps/web/vendor/temple/js/avatar.js#L1657): ví dụ geometry riêng được tạo mỗi lần.
- [apps/web/vendor/temple/js/avatar.js:1724](../apps/web/vendor/temple/js/avatar.js#L1724): material mặt riêng.
- [apps/web/vendor/temple/js/avatar.js:1929–1934](../apps/web/vendor/temple/js/avatar.js#L1929): `disposeAvatar`.

Đổi trang bị/nhân vật tạo avatar mới. Disposer gỡ root, dọn pet, ghost materials, aura material và sprite, nhưng không dọn geometry/material riêng của mesh thông thường. Người chơi khác đổi ngoại hình hoặc rời phòng cũng đi qua disposer này.

Các lượt thay avatar trong cùng một sảnh có thể tích tụ tài nguyên GPU. Kết luận dựa trên vòng đời tài nguyên trong mã; chưa đo số MB hoặc FPS giảm bằng browser.

**Hướng sửa:** phân biệt tài nguyên avatar sở hữu với geometry/material/texture dùng chung rồi dispose đúng tài nguyên riêng. Không traverse và dispose tất cả một cách mù quáng vì sẽ ảnh hưởng avatar khác.

**Gate:** render nhiều lượt thay đồ và thêm/bớt người chơi; theo dõi `renderer.info.memory` sau warm-up, đồng thời kiểm tra avatar còn lại không mất geometry hoặc texture.

## 10. PERF-04 — Hàng đợi inference không giới hạn và không huỷ được khi chờ

**Mức:** P2 — hiệu năng, bộ nhớ và chi phí provider.

**Vị trí:**
- [apps/api/src/assistant/rate-limit.ts:47–64](../apps/api/src/assistant/rate-limit.ts#L47).
- [apps/api/src/assistant/index.ts:70–75](../apps/api/src/assistant/index.ts#L70): nhận client ID từ cookie.
- [apps/api/src/assistant/index.ts:365–370](../apps/api/src/assistant/index.ts#L365): tác vụ trích xuất entity nền.
- [apps/api/src/assistant/unresolved-entity-detection.ts:64–75](../apps/api/src/assistant/unresolved-entity-detection.ts#L64): xếp hàng tác vụ nền với signal độc lập.

Giới hạn concurrency chỉ chặn số tác vụ đang chạy. Mảng `waiting` không có trần, deadline hoặc cơ chế loại bỏ tác vụ đã bị huỷ. Timeout của provider không giới hạn thời gian nằm chờ trước khi có slot.

Tác vụ trích xuất entity còn được xếp hàng sau câu trả lời, kể cả câu trả lời deterministic không bị nhận diện là prompt injection. Vì thế request đã kết thúc vẫn có thể để lại backlog công việc model.

Nếu tắt membership enforcement, client có thể tự thay UUID cookie để vượt burst counter theo cookie. Không kết luận production hiện đang mở đường anonymous này: cấu hình triển khai thực tế chưa được kiểm tra trong lượt review.

**Hướng sửa:** giới hạn hàng đợi và trả backpressure khi đầy; hỗ trợ abort/deadline lúc chờ; đặt admission limit theo account hoặc IP đã xác minh proxy. Tác vụ nền cần có giới hạn riêng hoặc được phép bỏ qua khi quá tải.

**Gate:** hàng đợi có trần; request bị huỷ không giữ vị trí; tác vụ nền không làm request tương tác chờ vô hạn.

## 11. PERF-05 — Giới hạn concurrency của STT có race

**Mức:** P2 — hiệu năng và số request đồng thời tới provider.

**Vị trí:**
- [apps/api/src/voice.ts:555–559](../apps/api/src/voice.ts#L555): kiểm tra `activeTranscriptions`.
- [apps/api/src/voice.ts:578–644](../apps/api/src/voice.ts#L578): nhiều thao tác async trước khi tăng bộ đếm.
- [apps/api/src/voice.ts:645–687](../apps/api/src/voice.ts#L645): gọi provider và giảm bộ đếm.

Khi bật membership enforcement, request kiểm tra còn slot rồi await entitlement, reservation và dispatch trước khi tăng `activeTranscriptions`. Nhiều tài khoản hợp lệ có thể đồng thời thấy còn chỗ và cùng đi tiếp, vượt trần STT của process. Giới hạn theo từng account không thay thế được trần toàn process này.

**Hướng sửa:** giữ slot đồng bộ trước await đầu tiên trong đường xử lý được bảo vệ, rồi release bằng `finally` ngoài cùng cho mọi nhánh return/error.

**Gate:** cho nhiều account hợp lệ tới đồng thời và trì hoãn bước entitlement; số lời gọi provider đang chạy không được vượt cấu hình.

## 12. OBS-01 — Breadcrumbs có nguy cơ kéo dữ liệu lớn vào client graph toàn site

**Mức:** cần đo thêm, chưa định lượng bundle production.

**Vị trí:**
- [apps/web/app/[lang]/layout.tsx:49](../apps/web/app/[lang]/layout.tsx#L49): mount Breadcrumbs trong layout chung.
- [apps/web/components/breadcrumbs.tsx:1–6](../apps/web/components/breadcrumbs.tsx#L1): client component nhập `nameBySlug`.
- [apps/web/lib/data.ts:1–25](../apps/web/lib/data.ts#L1): nhập snapshot và kiểm tra mùa ở module scope.
- [apps/web/lib/data.ts:109–117](../apps/web/lib/data.ts#L109): dựng tên breadcrumb từ catalog/comp rows.

Navigation chỉ cần một bảng slug → tên, nhưng lấy bảng đó từ module chứa nhiều snapshot và phép dựng lookup khác. Việc component trả `null` ở trang cấp cao không loại bỏ import hoặc phần khởi tạo module.

Đây là bằng chứng về dependency và xử lý ở cấp module, chưa phải bằng chứng toàn bộ dung lượng JSON nguồn đều được gửi xuống browser. Tree-shaking, chia chunk và nén phải được kiểm tra bằng build hiện tại trước khi công bố số MB hoặc mức ảnh hưởng tới tốc độ tải.

**Hướng xử lý:** tách projection tên nhỏ cho navigation hoặc truyền dữ liệu cần thiết từ server; giữ stats chi tiết trong dependency của route thực sự dùng chúng.

**Gate:** phân tích client chunks của một trang không có comp board trước/sau; đo transfer size, parse/evaluation và tải ban đầu trên cùng cấu hình thiết bị.

## Bằng chứng và giới hạn chung

### Đã kiểm chứng cô lập

1. **WebSocket:** listener thật nhận giá trị JSON sai kiểu làm tiến trình Node con thoát mã 1.
2. **OAuth:** callback chấp nhận email Google chưa xác minh; mật khẩu local chưa xác minh còn đăng nhập được sau liên kết.
3. **Webhook:** transaction rollback nhưng `handleWebhook` vẫn trả `ok: true`.
4. **Pool:** `addMerit` cần đọc qua pool khi client cũ chưa release, sau khi điểm đã commit.
5. **Cache:** khóa hết TTL vẫn được giữ khi truy cập khóa mới.

Các phép kiểm chứng trên không thay thế integration test với hệ thống thật và chưa được thêm thành regression test trong repository.

### Các giới hạn khác

- Không xác nhận mã đang deploy hoặc cấu hình production hiện tại trùng working tree.
- Không chạy load-test, full test suite hay render sảnh 3D cho lượt review này.
- Chưa đo heap/GPU tăng thực tế hoặc bundle production mới.
- Chưa đối chiếu advisory/CVE trực tuyến cho dependency.
- Quét mẫu credential phổ biến trên 471 tệp văn bản tracked không thấy hit; phép quét không bao gồm git history, env untracked, mọi định dạng secret hoặc asset lớn. Không dùng kết quả này để kết luận repository không thể chứa secret.
- Không tìm thấy chuỗi XSS do người dùng kiểm soát trong các đường hiển thị social/tên đã đọc; đây không phải bảo đảm mọi UI đều an toàn.
- Không thay đổi code ứng dụng, cấu hình, database hay production trong lượt review.

## Thứ tự xử lý đề xuất

1. SEC-01: chặn lỗi đầu vào WebSocket làm dừng API.
2. SEC-02: sửa chính sách liên kết tài khoản Google.
3. REL-01: bảo đảm ghi nhận và cấp quyền lợi thanh toán có retry đúng.
4. PERF-01: loại bỏ việc giữ connection trong khi chờ connection thứ hai.
5. SEC-03, SEC-04, SEC-05: siết quyền trang bị, thời gian thưởng và quyền ghi hội thoại.
6. PERF-02 đến PERF-05: giới hạn tài nguyên và sửa vòng đời/concurrency.
7. OBS-01: đo bundle rồi tối ưu dependency của navigation.

Mỗi lỗi nên có regression test hẹp tương ứng trước khi coi là hoàn tất. Việc commit, push hoặc deploy bản sửa là các phạm vi riêng, chưa được thực hiện bởi báo cáo này.
