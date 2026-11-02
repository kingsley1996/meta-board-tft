# Triển khai — bản đồ cho agent (TFTIQ / tft-comps)

Điểm nạp cho mọi thứ liên quan chạy stack ở đâu và bằng cái gì. Tài liệu này **không
quyết định gì mới** — nó gom đường đi của một bản từ repo tới host, rồi trỏ tới nơi có
thẩm quyền cho từng chi tiết:

| Nơi | Cái gì |
|---|---|
| `README.md` §Build and deploy separately | Lệnh deploy và nguyên tắc env của hai deployment |
| `PARITY.md` §Architecture / §Game data / §Backend API | Hành vi vận hành chi tiết (script, endpoint, auth) |
| `apps/api/.env.example` · `apps/web/.env.example` | Toàn bộ biến, mỗi biến có chú thích tại chỗ |
| `docs/ai-assistant/voice.md` §6 | Vận hành production STT/TTS: chọn provider, quy mô engine, chi phí |
| `apps/api/data/knowledge/README.md` | Corpus RAG — sinh lại, không sửa tay |

**Trạng thái (2026-10-26):** host đã chốt — **web trên Vercel, API trên Render,
Postgres trên Supabase**. `vercel.json`, `render.yaml` và `.node-version` carry cấu
hình đó; CI GitHub Actions (`.github/workflows/ci.yml`) chạy typecheck + unit test +
production web build + boot API không cần DB. Docker vẫn không có, và không cần: hai
platform kia build từ lệnh npm trong repo.

---

## 1. Tổ chức code quanh deploy

```
apps/web   Next.js 16 — build bằng `next build`, chạy bằng `next start` (port 4173)
apps/api   Express 5 + pg — KHÔNG build step: Node >=22 chạy thẳng .ts
           `npm run start` = `node src/index.ts` (port 4000, hoặc $PORT)
packages/shared  exports thẳng .ts nguồn — không dist, không build
           (web: transpilePackages; api: Node native type stripping)
capture/   tư liệu reverse-engineer reference site — không deploy
```

Bốn luật định hình mọi thứ còn lại:

- **Hai deployment, hai entry point, install từ gốc repo.** npm workspaces phải được
  install từ root thì `@tftiq/shared` mới resolve được; deploy riêng từng thư mục
  như hai project độc lập là dựng sai ngay từ bước `npm install`.
- **Web proxy `/api/*` sang API qua Next rewrites** (`next.config.ts`, đích =
  `BACKEND_URL`). Browser chỉ nói chuyện same-origin — không cần CORS, nhưng đổi lại
  `BACKEND_URL` phải đúng **cả lúc build lẫn lúc chạy** (server components gọi
  `backendJson()` trực tiếp). Trần proxy mặc định của Next là 30 s mà câu trả lời
  Coach AI có thể ~45 s — vì thế `experimental.proxyTimeout: 90_000` đã bật; đừng bỏ.
  Trên Vercel, mọi request đi rewrite ra ngoài đích có trần **120 s** bất kể con số
  đó — xem §3 "Bản đồ host".
- **Không có migration tool.** `apps/api/src/schema.sql` là nguồn schema (idempotent —
  `CREATE TABLE IF NOT EXISTS`), và `ensureAccountTables()` tạo bảng auth lazily lúc
  chạy. Hệ quả: DB cũ không sao, DB mới tinh phải chạy seed một lần (§4).
- **`.env` không bao giờ được commit** (`.gitignore`: `.env*`, ngoại lệ `.env.example`);
  env của hai deployment do hosting platform cấp.

## 2. Local dev (baseline của mọi hướng dẫn deploy)

```sh
npm install                                   # từ ROOT
# Postgres 17: brew services start postgresql@17, role/db `metaboard`
cp apps/api/.env.example apps/api/.env && cp apps/web/.env.example apps/web/.env.local
npm run seed --workspace @tftiq/api       # schema + data + comps (xem cạm bẫy §4)
npm run dev:api                               # :4000
npm run dev:web                               # :4173 (dev và prod cùng cổng)
```

Check trước khi ship: `npm run typecheck && npm run test:server && npm run test:e2e`
(Playwright tự dựng cả hai server qua `webServer` trong `playwright.config.ts`; set
`PLAYWRIGHT_BASE_URL` để test một deployment thật đang chạy).

## 3. Prod — hai process, không đối xứng

| Process | Build | Chạy | Env bắt buộc | Env tùy chọn nhưng quyết định tính năng |
|---|---|---|---|---|
| web | `npm run build --workspace @tftiq/web` | `npm run start --workspace @tftiq/web` | `BACKEND_URL` (build + run), `SITE_URL` | `WEB_REVALIDATE_TOKEN` |
| api | không | `npm run start --workspace @tftiq/api` | `DATABASE_URL`, `PORT`; `ADMIN_EMAIL` + `ADMIN_SEED_PASSWORD` chỉ lần đầu | `ASSISTANT_*`, `*_API_KEY`, `STT_*`, `VIENEU_TTS_*`, `TTS_*`, `AUTH_*`, `GOOGLE_OAUTH_*`, `WEB_REVALIDATE_TOKEN` |

Năm thứ hay dựng sai:

- **`WEB_REVALIDATE_TOKEN` phải giống nhau ở cả hai host** (Vercel + Render). Đây là
  đường duy nhất để một lần sửa comps/guides đến được trang đang cache: trang data đặt
  `revalidate = 86_400` vì mỗi lần Next regenerate là một ISR write của Vercel — 60 giây
  trên ~250 trang là ~360k write/ngày, vượt trần Hobby 200k/tháng là project bị pause.
  API `POST /api/revalidate` sau khi ghi (kể cả `seed:tiers`) chỉ đánh dấu stale; Next
  dựng lại ở lượt ghé kế tiếp. Thiếu token thì API im lặng, trang hết hạn theo lịch.

- **`/admin` là role của account, không phải mật khẩu thứ hai.** Không còn `ADMIN_PASSWORD`/`mb_admin`: đăng nhập ở `/en/login` bằng account có `role = admin`.
  DB trắng thì đặt `ADMIN_EMAIL` + `ADMIN_SEED_PASSWORD` một lần (seed hoặc lúc API
  boot tạo account đầu tiên); khi đã có admin, hai biến đó là no-op và nên xoá khỏi host.
- **Biến web chỉ web dùng, biến API chỉ API dùng** — đưa `DATABASE_URL`/keys vào env
  của web là mở rộng phạm vi rò rỉ vô ích. Web không cần key assistant/STT nào.
- **Trước launch production:** đặt `AUTH_REQUIRE_EMAIL_VERIFICATION=true` (mặc định
  false — đăng ký là tự xác minh, chủ ý cho giai đoạn dev) **và** cắm mailer thật trong
  `apps/api/src/mailer.ts` (mặc định là console mailer, in link ra log). Thiếu một
  trong hai là mở đăng ký không kiểm soát email cho người dùng thật.

- **Model/provider đổi được mà không redeploy.** Bảng `app_settings` (UI
  `/admin/settings`, code ở `apps/api/src/settings.ts`) được copy lên `process.env`
  lúc API boot và ngay sau mỗi lần lưu, vì assistant đọc env theo từng request.
  Row thắng env; xoá row là trả về giá trị env mà process nhận lúc khởi động.
  Danh sách key là allow-list và **không có credential**: `*_API_KEY` luôn nằm ở
  env của host, UI chỉ báo đã set hay chưa.
  Lưu ý `OPENAI_BASE_URL` dùng chung với STT (`voice.ts` fallback về nó).

### Bản đồ host (đã chốt)

| Chỗ | Cái gì | Cấu hình nằm ở |
|---|---|---|
| Vercel | `apps/web` — Next.js | `vercel.json` (install/build/output). **Root Directory phải là gốc repo**, và cái đó là setting trong dashboard, không đặt trong `vercel.json` được |
| Render | `apps/api` — Express, không build step | `render.yaml` (service + cron, env, health check) |
| Supabase | Postgres 15+ | chỉ một env: `DATABASE_URL` — xem mục Database dưới đây |

Node pin: `.node-version` = `22.22.2`, cùng file Vercel, Render và CI đọc. API chạy
native TypeScript nên **phiên bản Node là một phần của runtime**, không phải chi tiết
dựng image; CI cài đúng bản đó nên lệch Node-local không còn âm thầm.

Trần quan trọng của đường Vercel → Render (đã tra, không phải ước đoán):

- **Proxied request timeout = 120 s** cho mọi rewrite ra ngoài đích, mọi plan.
  `experimental.proxyTimeout: 90_000` chỉ có giá trị trong trần đó. Một lượt STT
  (`STT_CHAIN_BUDGET_MS=45000`) và một chunk TTS (`TTS_TIMEOUT_MS=45000`) đều nằm
  dưới, nhưng chuỗi TTS nhiều chunk của một câu dài thì cộng dồn — **phải đo thật
  trên deployment**, số local không có giá trị.
- Render **không đặt trần thời gian cho SSE/WebSocket**, nên luồng trả lời Coach AI
  chạy được; Zero Downtime Deploy chỉ bảo vệ handshake đầu, request đang streaming
  vẫn chết khi instance cũ tắt.
- Vercel Hobby **cấm dùng thương mại** (điều khoản riêng, platform có quyền suspend).
  Site có ads/newsletter/donate là phải Pro.

### Database: Supabase, và tại sao phải là pooler

| Đường | Host:port | Dùng được từ Render? |
|---|---|---|
| Direct | `db.<ref>.supabase.co:5432` | **Không** — IPv6-only (Render không có IPv6, trừ khi mua add-on IPv4) |
| Pooler, session mode | `aws-0-<region>.pooler.supabase.com:5432` | **Có — chọn đường này.** IPv4, semantics đầy đủ |
| Pooler, transaction mode | `…pooler.supabase.com:6543` | IPv4 nhưng **cắt** prepared statement, cursor, session state, query pipelining |

Session mode là đường an toàn vì code này có transaction giữ client
(`comps.ts:254`, `tft.ts:139`, `assistant/entity-alias-store.ts:186`) và DDL lazy lúc
chạy (`accounts.ts:39 ensureAccountTables()`, gọi từ `auth-routes.ts:111`). Copy nguyên
"URI" từ dashboard — nó đã kèm `?sslmode=require`, và `pg-connection-string` dịch ra
`ssl` (đã kiểm bằng `node -e`), không cần sửa code. Tự gõ thì **URL-encode mật khẩu**:
key random của Supabase chứa `+ / %`.

Pool sizing (`db.ts`): `max` mặc định 8, chỉnh bằng `PG_POOL_MAX`; Render starter một
instance thì 6 là dư. Ngân sách server connection của pooler là hữu hạn và dùng chung
cho cả project — tăng `PG_POOL_MAX` là tăng phần mình chiếm.

### Mặc định an toàn đã bật sẵn trong code (đừng tắt)

| Cái | Mặc định | Vì sao tồn tại |
|---|---|---|
| `TRUST_PROXY` | `1` khi `NODE_ENV=production` | `req.ip` là khoá của dedupe vote/view và limiter đăng nhập; thiếu thì **cả site gộp thành một visitor** |
| `pg.Pool` timeouts | `connectionTimeoutMillis 10s`, `idleTimeoutMillis 30s`, `keepAlive` | DB ngủ/chết → 503 sau 10 s, chứ không treo tới khi web tier bỏ |
| `pool.on('error')` | có | Error trên idle client (pooler restart) không còn giết cả process |
| Graceful shutdown | `SIGTERM`/`SIGINT` → drain, đóng pool, trần 10 s | Render gửi SIGTERM mỗi deploy; request đang bay không bị cắt |
| `GET /api/health`, `/api/health/ready` | có | Render Health Check Path trỏ `/api/health` (không chạm DB); `/ready` là để nhìn DB |
| Cookie `Secure` | bật khi production (`AUTH_SECURE_COOKIES`) | `mb_session` và OAuth state chứa credential, phải chỉ đi qua HTTPS |
| `getMailer()` ở production | **throw** | console mailer in link xác minh ra log của host = credential lộ; và đăng ký "thành công" mà không có mail thì mất user im lặng |
| `withInferenceSlot` | `ASSISTANT_MAX_CONCURRENCY=2` | trước đây mutex 1 slot: một câu 45 s chặn mọi câu khác trên cùng instance |
| `ensureCatalogCurrent()` lúc boot | so `catalog_release` rồi mới ghi | catalog theo đúng commit đang chạy; cùng lô data thì không ghi gì |
| `backendJson()` (web) | timeout 8 s + retry 1 lần (chỉ network/5xx) | cold start của API không còn biến trang public thành 500 |

### Cloudflare Turnstile cho đăng nhập và đăng ký

Tạo widget **Managed**, cho phép hostname `tftiq.com`, `meta-board-tft.vercel.app`
(và `localhost` nếu dùng key đó ở local). Đặt **cả** `TURNSTILE_SITE_KEY` và `TURNSTILE_SECRET_KEY`
trong env của **API trên Render**, rồi redeploy API. Không đặt key ở Vercel, không
copy credential từ project khác. Web lấy public site key từ `GET /api/auth/turnstile`
lúc chạy: `200 {site_key}` khi bật, `204` khi cả hai biến trống; thiếu một biến thì
API từ chối boot. Vì vậy bật/tắt Turnstile không cần rebuild web.

Login/register gửi token một lần qua header `cf-turnstile-response`; retry lấy token
mới kể cả lần trước sai mật khẩu. Thiếu/token sai → `403 turnstile_rejected`. Lỗi
mạng, timeout hoặc phản hồi hỏng từ Cloudflare thì **fail-open**, giống ToeicPilot;
rate limit theo IP vẫn chạy **trước** khi gọi siteverify. Google OAuth không đổi và
không có QA bypass. Trang login cần tải script/iframe của Cloudflare khi tính năng bật.

Kiểm local không cần key thật: `node --test apps/api/src/turnstile.test.ts` và
`npx playwright test apps/web/tests/turnstile.spec.ts` (mock siteverify ở API,
mock widget và phản hồi auth trong browser).

### Account admin, phiên, và /admin/users

| Route | Quyền | Hành vi |
|---|---|---|
| `GET /api/admin/users` | admin | `listAccountUsers()` — id/email/name/role/createdAt, mới nhất trước, mặc định 200 dòng |
| `PATCH /api/admin/users/:id/role` | admin | chỉ đổi role. `400` role lạ · `404 no such user` · `409` bị guard chặn · `200 {ok,user}` |
| `/admin/users` (web) | admin | bảng + dropdown role; chính mình hiện chữ "you", không đổi được |

`adminGuard` (`index.ts`) chạy cho toàn bộ prefix `/api/admin`: cookie `mb_session`
hợp lệ nhưng role thường → `403 admin_only`; không có cookie / cookie rác → `401
unauthenticated`. Trang web không phải biên an toàn — layout redirect là tiện nghi,
kẻ gọi thẳng endpoint vẫn bị API chặn.

Hai guard trong `setUserRole()` (`accounts.ts`) sinh ra `409`:
**không tự hạ chính mình** và **không hạ admin cuối cùng** — hai đường duy nhất
làm DB còn 0 admin và đá mọi người khỏi `/admin`.

Đường cứu khi không còn cách nào vào `/admin` là SQL (dev: `psql "$DATABASE_URL"`
trong `apps/api/.env`; prod: Supabase SQL editor):

```sql
update users set role = 'admin' where email = 'owner@example.com';  -- mở khoá /admin cho một account đã có
select id, email, role from users order by created_at desc limit 20;
```

Quên mật khẩu của account admin *duy nhất* thì chưa có đường nào khác: schema có
purpose `password_reset` nhưng **chưa có endpoint** nào dùng nó, và
`ADMIN_EMAIL`/`ADMIN_SEED_PASSWORD` chỉ còn tác dụng khi DB chưa có admin nào.

Test tự động (không cần credential, không ghi dòng nào vào DB):
`npm run test:server` → `src/accounts.test.ts`; `npx playwright test
apps/web/tests/admin.spec.ts` → gate trang, `401` cho cả đọc và ghi, cookie giả.

### Voice không phải tính năng miễn phí

- STT: **chỉ cloud**, hết đường local. Một lượt nói đi hết chuỗi provider có key theo
  thứ tự đã đo — `deepgram > groq > elevenlabs > openai > gemini` (`openrouter` chỉ bật
  khi đặt `STT_PROVIDER=openrouter`, vì endpoint audio cần số dư riêng) — và cho nghỉ
  tạm vendor vừa trả 429 (`STT_BUSY_COOLDOWN_MS`), nên một free tier hết quota không còn
  làm hỏng lượt nói. Deepgram tính theo phút audio; Groq free tier 20 request/phút,
  2000 request/ngày. Không có key nào ⇒ `POST /api/voice/transcribe` trả
  `503 stt_not_configured` và `GET /api/voice/status` báo `available: false` — đó là
  trạng thái cấu hình thiếu, không phải lỗi runtime. Sherpa đã gỡ khỏi repo (`package.json`,
  script tải model, source): model ~29 MB không có chỗ trên disk ephemeral của Render,
  và license CC-BY-NC-ND-4.0 vốn cấm deploy thương mại.
- TTS: VieNeu cloud (khuyên dùng — 0 chi phí cố định, không container). Engine
  VieNeu local đã bị bỏ khỏi luồng chạy; code vẫn giữ nhưng chỉ cloud URL được
  cấu hình mới bật. Số đo, quota, chi phí: `voice.md` §6.

## 4. Dữ liệu: một nguồn, một số lô

`packages/shared/data/tft.json` (kèm ảnh trong `apps/web/public/tft/**`) là **nguồn duy
nhất** cho game catalog. Postgres chỉ giữ một **projection** của nó: API đọc snapshot từ
deployment của chính mình — không gọi CommunityDragon — tính `catalog_release` (sha256 của
các dòng sắp ghi), so với `meta('catalog_release')` trong DB, và chỉ ghi lại 4 bảng khi
hai số khác nhau. Việc đó chạy **lúc boot** (`index.ts` → `applyCatalog()`), nên:

- Không còn `POST /api/tft/refresh`, không còn cron `metaboard-tft-refresh`, không còn
  `REFRESH_TOKEN`. Deploy chính là bước sync.
- Web và API đọc **cùng một commit**, nên không thể lệch nhau vì người ta bấm thiếu.
- Lệch vẫn thấy được: `GET /api/tft/set` trả `catalog_release`, log boot in
  `game catalog: applied|already current release <12 hex> (…)`.

| Bản | Ai dùng | Ai sinh | Cập nhật bằng |
|---|---|---|---|
| `tft.json` + `apps/web/public/tft/**` (commit) | trang static (champions/items grid, hover cards) **và** API | repo crawler riêng (private) | chạy crawl ở repo đó, commit vào đây, push |
| 4 bảng catalog trong Postgres | responses động, admin, validation | `syncTft()` / `ensureCatalogCurrent()` từ snapshot | **không có bước thủ công** — API tự nạp khi boot |
| `comps`, `guides` trong Postgres | nội dung biên tập | `seed.ts` (DB trắng) / admin UI; `seed/comps.json` do repo crawler sinh qua engine `lib/select.mjs` — **bốn site guide** định nghĩa board (TFT Academy, tftflow, tftips, coachingtft), còn datatft/tftcodex/MetaTFT chỉ là nguồn **đo** (stats, điểm, cứu solo) | admin UI; `seed:economy` để nạp thêm economy comps; comp không đạt cửa ship (<2 nguồn guide, hoặc 1 nguồn mà số trận chưa đủ cứu) nằm ở `seed/comp-candidates.json` và chỉ vào DB khi approve ở `/admin/comps/candidates` |
| `tier`, `trend` của `comps` | bảng tier list và bản đồ comp | snapshot `apps/api/seed/comps.json` | `npm run seed:tiers` — chỉ UPDATE hai cột theo slug, không xoá gì |
| nội dung của `comps` (board, items, augments, copy, tier) | trang comp detail — bản đồ/homepage link theo `meta.json`, mà detail đọc DB; slug lệch nhau là 404, board lệch nhau là hiện sai đội hình | snapshot `apps/api/seed/comps.json` | `npm run seed:comps` ([seed/upsert-comps.ts](../apps/api/seed/upsert-comps.ts)) — INSERT slug chưa có và viết lại theo snapshot những hàng đã lệch, qua đúng `validateCompPayload` + `writeComp` như editor; giữ `cover` (lấy ở `comp-extras.json`, không có thì giữ của DB), không đụng votes/views, không xoá gì; chạy lại lần hai báo 0 thay đổi |
| `plan_versions` trong Postgres | [quota.ts](../apps/api/src/membership/quota.ts) chỉ đọc khi có membership resolution (#86); chưa có route nào gọi — bán hàng là gate #92/#95 | `seed/membership-plans.ts` | `npm run seed:membership` — idempotent, tạo hai offer `draft`; bật `active` là quyết định thương mại, không phải bước deploy |

Quy tắc chọn đường, theo trạng thái DB đích:

- **DB trắng (mới deploy):** `npm run seed --workspace @tftiq/api` — apply schema,
  ghi catalog từ snapshot, nạp comps/guides/tips từ `apps/api/seed/`.
- **DB đã có nội dung admin tạo: ĐỪNG seed.** Dòng đầu của `seed.ts` ghi rõ: nó
  *replaces* comps và guides — mọi thứ soạn qua `/admin` bị xoá, log vẫn báo thành
  công. Catalog thì không cần seed: API tự nạp. Nội dung comps/guides sửa qua admin UI.
- **DB đã có nội dung, chỉ tier/trend theo sau nguồn:** `npm run seed:tiers`
  ([seed/sync-tiers.ts](../apps/api/seed/sync-tiers.ts)). So theo `slug`, chỉ `UPDATE tier, trend`
  trong một transaction, in bảng before→after, chạy lại lần hai thì báo 0 thay đổi. Không thêm
  comp mới (một comp cần board/items/augments, hai cột kia không mang được), không đụng
  `cover`, tips, votes, views và các comp economy chỉ có trong DB. Xem trước bằng `-- --dry-run`.
- **DB đã có nội dung, snapshot đi trước (slug mới, board/copy cũ):** `npm run seed:comps`
  ([seed/upsert-comps.ts](../apps/api/seed/upsert-comps.ts)). Đây là lỗi người dùng thấy được:
  bản đồ comp và homepage vẽ link từ `meta.json` (commit), còn trang detail tra `comps` trong
  DB — thiếu slug là 404, còn hàng tồn giữ board cũ là đội hình sai. Script so từng comp theo
  snapshot theo từng section (board, early, alt, items, augments, stages, copy, tier, matchups),
  in ra hàng nào lệch và lệch chỗ nào, rồi ghi đúng một đường mà editor dùng:
  `validateCompPayload` + `writeComp` (một transaction mỗi comp, tên unit/item/augment phải có
  trong catalog, comp lỗi bị bỏ qua và in tên). Vì vậy nó không đụng `votes`/`views`, giữ `cover`
  (lấy ở `comp-extras.json`, file im lặng thì giữ badge đang có trong DB) và giữ `text_vi` của
  stage — cùng ba điều editor làm. Chạy lại lần hai báo `0 rewritten`. Đổi lại, snapshot là
  nguồn thật cho các cột nó publish: sửa tay board/tips trong DB sẽ bị lần sync sau ghi đè —
  muốn nội dung nằm ngoài snapshot thì soạn ở `/admin`, còn comp chưa đủ cửa ship thì vẫn là
  `seed/comp-candidates.json` + approve. Economy comps vẫn là việc của `seed:economy`.
  Trỏ vào DB prod bằng biến đang có trong `apps/api/.env` (Node ưu tiên env của shell hơn file):

  ```sh
  cd apps/api
  set -a; . ./.env; set +a
  DATABASE_URL="$PROD_DATABASE_URL" npm run seed:comps -- --dry-run
  DATABASE_URL="$PROD_DATABASE_URL" npm run seed:comps
  DATABASE_URL="$PROD_DATABASE_URL" npm run seed:tiers -- --dry-run
  DATABASE_URL="$PROD_DATABASE_URL" npm run seed:tiers
  ```
  Hai dòng `seed:comps` là bước ghi đè có chủ đích: đọc hết danh sách `rewrite … · board, copy`
  dry-run in ra, đối chiếu với nội dung admin soạn gần đây, rồi mới bỏ `--dry-run`.
  Sau khi ghi thật còn hai việc script không tự làm được:

  - **Purge cache trang.** `notifyRevalidate` gọi `AUTH_WEB_ORIGIN || http://localhost:4173`
    ([src/revalidate.ts](../apps/api/src/revalidate.ts)) — chạy script từ máy cá nhân thì dòng
    `web revalidate "comps": 503` trong log là cửa dev web, prod chưa được gõ lần nào. Prod có
    `WEB_REVALIDATE_TOKEN` (probe không token trả 401, không phải 503) nhưng không có
    `AUTH_WEB_ORIGIN`, nên purge tay một câu:
    `curl -X POST https://www.tftiq.com/api/revalidate -H "x-revalidate-token: $WEB_REVALIDATE_TOKEN" -H 'content-type: application/json' -d '{"kind":"comps"}'`
    → `{"ok":true,"invalidated":8}`, list/map/home sạch ngay.
  - **Build lại khi có slug mới.** `apps/web/app/[lang]/layout.tsx` đặt `dynamicParams = false`
    cho cả subtree locale, nên slug chưa có trong route manifest của bản deploy đang chạy trả 404
    mặc định của Next ("This page could not be found") dù DB đã có row và hàm không kịp gọi
    `notFound()`. Một lần build (push tiếp theo, hoặc Redeploy cùng commit trên dashboard) là hết.

  Backup trước khi ghi dùng `pg_dump "$PROD_DATABASE_URL"` sau khi **bỏ tham số `sslmode` khỏi
  URL** — libpq của Homebrew từ chối `no-verify` mà node `pg` thì nhận, nên thêm `PGSSLMODE=prefer`.

  **Trạng thái prod DB (đo 2026-11-02, sau lần sync đầu tiên):** `comps` = 54 row đúng snapshot —
  449 board unit, 162 item, 424 augment, 162 stage, 14 cover, 9 `situational`, 0 hàng mồ côi.
  Đường ghi mở lại được là nhờ hai ALTER chạy trước: thêm cột `situational` và dựng lại
  `comps_style_check` có `Fast 9` (thiếu thì `writeComp` chết ở INSERT, còn đọc vẫn an toàn vì
  `SELECT *` + `?? false`). 35 row ngoài snapshot đã xoá, `ON DELETE CASCADE` kéo theo 421 unit,
  105 item, 243 augment, 105 stage của chúng; nhóm đó chỉ tích luỹ 1 vote và 431 view.
  Backup: `/tmp/prod-comps-backup-20261102.sql` (58 comps + 694 units, `--data-only --column-inserts`).
- **RAG corpus:** sửa nguồn (`mechanics-knowledge.json`, `seed/guides.ts`, `seed/tips.ts`)
  rồi `npm run build:knowledge`; `chunks.jsonl` là output đã commit — không sửa tay.

## 5. Patch day (runbook rút gọn)

Bản agent dùng được (kể cả script kiểm data): skill `tft-data-refresh` trong **repo crawler**
— repo đó đứng cạnh repo app và ghi trực tiếp vào checkout này, không có npm script crawl nào
sống ở đây nữa.

```sh
cd ../tft-comps-crawler
npm run data:pull        # catalog → stats/wisps/loot/economy (MetaTFT chỉ còn số đo)
npm run comps            # seed/comps.json + comp-candidates.json qua engine lib/select.mjs (4 nguồn định nghĩa + nguồn đo; cần data:pull trước)
npm run verify           # lô data trong app checkout là gì

cd ../tft-comps          # repo app
npm run build:knowledge  # corpus RAG từ guides.ts + tips.ts
npm run test:server      # test đọc snapshot, không đọc mạng
npm run seed:tiers --workspace @tftiq/api -- --dry-run   # tier/trend DB lệch snapshot ở đâu
npm run seed:comps --workspace @tftiq/api -- --dry-run   # hàng DB lệch snapshot (slug thiếu + board/copy cũ)
git add packages/shared/data apps/web/public/tft apps/web/lib/wisps.json apps/api/seed
git commit -m "chore(data): set <N> patch <P>"
git push                 # Vercel rebuild web; Render redeploy API và tự nạp catalog
```

Hết. Không có câu curl nào ở bước cuối. `seed/comps.json` refreshed không tự vào DB prod
(DB đã có nội dung thì không seed): `seed:comps` ghi những hàng lệch snapshot (kèm slug mới) ngay sau khi push,
tier/trend cũ thì `seed:tiers`, comp chưa đủ 2 nguồn vẫn chờ approve ở
`/admin/comps/candidates`. Hai việc còn lại của một patch có **slug mới** nằm ở mục 4:
purge cache prod bằng `POST /api/revalidate` (script local không tự gõ cửa prod) và chờ một lần
build nữa vì `dynamicParams = false`.

Bản đầy đủ (vì sao đúng thứ tự, kiểm chứng trước khi commit, `catalog_release` vào Postgres thế
nào, set rotation, bảng lỗi): `docs/runbook.md` trong repo crawler.

Còn một điểm nối giữa hai halves: DB lưu đường dẫn icon trỏ vào asset của web. Nếu Render
kéo API lên trước khi Vercel xong, vày phút đầu các view động có thể 404 ảnh — không ai
bấm nhầm được nữa, chỉ còn thứ tự của platform. Muốn chắc thì publish Vercel trước khi
push cho Render, hoặc đơn giản là nhìn `catalog_release` và ảnh thật trên staging.

Boot mà DB chưa tới thì `applyCatalog` thử lại **một** lần sau 30 s; thất bại cả hai lần
nghĩa là catalog vẫn giữ lô cũ cho tới lần khởi động kế tiếp — kiểm bằng
`GET /api/tft/set` (`catalog_release`) hoặc log process.

## 6. Sau khi deploy — cổng kiểm

| Kiểm | Kỳ vọng |
|---|---|
| `GET <api>/api/health` | 200 — process sống, **không chạm DB** (đây là endpoint Render Health Check dùng) |
| `GET <api>/api/health/ready` | 200 kèm số comp; 503 = API sống mà DB không tới được (sai `DATABASE_URL`, pooler chưa bật, IPv4/IPv6) |
| `GET <api>/api/comps` | 200, comps của patch hiện tại |
| `GET <web>/en` và `/vi` | 200, console sạch, **zero request ra ngoài** (rule của lane reference-build: không hotlink tài sản third-party) |
| `GET <api>/api/voice/tts/status` | `available: true` + `provider` = `deepgram` (Flux) hoặc `vieneu`; nếu false, `reason` phân biệt engine tắt (`tts_unavailable`) vs key sai (`tts_credentials_rejected`) |
| `GET <api>/api/voice/status` | `available: true` + `providers` list đúng chuỗi key đã cấu hình; `available: false` = thiếu hết `DEEPGRAM_API_KEY`/`GROQ_API_KEY`/… (không còn đường local nào để rơi) |
| `GET <api>/api/tft/set` | `catalog_release` khớp lô data vừa commit; số champion/item/augment bằng đúng snapshot | hai nửa web/API lệch nhau |
| Một request `/api/*` xuyên qua Vercel | header `Set-Cookie` còn nguyên `Secure` và cookie được gửi lại ở request kế — đây là test thật cho `AUTH_SECURE_COOKIES` + proxy |
| `X-Forwarded-For` hai IP khác nhau (vote 2 lần) | hai `counted: true` — xác nhận `TRUST_PROXY` đang bật; hai lần cùng IP trả `counted: false` lần thứ hai |
| `/en/login` → `/admin` | đăng nhập bằng account `role = admin` **và** vào được `/admin`; user thường bị đá lại login. Mọi deep link `/admin/…` đều về `/en/login?next=/admin` (layout giữ trang tổng quan, không giữ trang đích) |
| `/admin/users` với cookie của admin | trang render được danh sách email + dropdown role; đổi role một account thử và thấy `router.refresh` cập nhật ngay. `401`/`403`/redirect đã có test tự động, nên ở đây chỉ cần kiểm phần *thật* |
| `GET <web>/sitemap.xml` | URL là domain thật — quên `SITE_URL` là nó trả `http://localhost:4173` |
| `npm run test:e2e` với `PLAYWRIGHT_BASE_URL=https://<web>` | xanh trên deployment thật |

## 7. Cạm bẫy hỏng im lặng

| Cái | Triệu chứng | nơi chốt |
|---|---|---|
| Không có account `role = admin` | `/admin` luôn redirect về `/en/login` dù đăng nhập đúng | bootstrap `ADMIN_EMAIL`/`ADMIN_SEED_PASSWORD` (`accounts.ts`) |
| Phiên `mb_session` không thu hồi được từ admin | role đọc theo từng request nên hạ quyền có tác dụng ngay, nhưng **không có cách đăng xuất hộ người khác**: cookie đánh cắp vẫn sống đủ 30 ngày. Còn đường cuối là xoá dòng `user_sessions` của user đó bằng SQL | `accounts.ts` `sessionUser`/`deleteSession` |
| Chạy `seed` trên DB đã có nội dung | **mọi comp/guide soạn qua admin biến mất**, không lỗi nào | đầu `seed.ts` |
| API boot lúc DB chưa tới | catalog giữ lô cũ tới lần khởi động kế tiếp; log in `game catalog sync failed` | `index.ts` `applyCatalog()` · `/api/tft/set` → `catalog_release` |
| Thêm field vào payload `/api/comps` | `next build` prerender 116 trang comp-detail bằng API **đang sống**, mà Render boot theo clock riêng sau mỗi push → có cửa sổ payload chưa có field, web đọc `.length` là chết build (`Cannot read properties of undefined`) | web phải default hoá field mới: `comp-panel.tsx` `const flex = comp.flex ?? []` |
| `proxyTimeout` bị bỏ | câu trả lời Coach AI dài chết 502 đúng 30 s | `next.config.ts` |
| Vote/view dedupe **in-memory** | restart là từng visitor bump lại được — chấp nhận được, nhưng đừng tưởng nó là rate limit | PARITY §Backend API |
| `DATABASE_URL` bản **Direct** của Supabase | API Render treo 10 s rồi 503 ở mọi route chạm DB: direct host IPv6-only, Render không có IPv6. Không có message nào ngoài `connection timeout` | §3 Database |
| `DATABASE_URL` bản **transaction mode** (`:6543`) | chạy được lúc đầu, rồi lỗi random ở transaction giữ client và DDL lazy (`prepared statement ... already exists`, `portal ... does not exist`) — pgbouncer mode này cắt hai thứ đó | `comps.ts:254` · `tft.ts:139` · `accounts.ts:39` |
| Mật khẩu Supabase chưa URL-encode | `SASL: password authentication failed` dù đúng key — key random chứa `+ / %`, `pg-connection-string` cắt mất | §3 Database |
| Thiếu `NODE_ENV=production` | `/voice/status` lộ `reason` của provider, cookie `Secure` không bật, `TRUST_PROXY` không mặc định — mọi thứ vẫn "chạy" | `index.ts` trust proxy · `auth.ts secureCookieSuffix()` |
| `AUTH_REQUIRE_EMAIL_VERIFICATION=false` khi đã public | ai cũng vào được với email không thật | `src/mailer.ts` |
| Deploy từng workspace riêng | `@tftiq/shared` không resolve | README §Build and deploy |

## 8. Việc còn mở (đừng đoán, đừng tự dựng thêm)

Host và CI **đã có** (§3, `.github/workflows/ci.yml`); những thứ dưới là việc thật còn
treo, không phải chỗ trống của tài liệu:

- **Đo trần 120 s của Vercel trên deployment thật.** TTS theo chunk có thể vượt nếu câu
  dài; số local vô nghĩa vì nó không đi qua proxy. Nếu vượt: rút ngắn chunk, hoặc cho
  web gọi thẳng API-origin (quyết định này đụng tới cookie same-origin — phải cân nhắc
  lại §1, không được làm một mình).
- **Chọn mailer.** `getMailer()` throw khi production và chưa có mailer nào được cắm,
  nên bật `AUTH_REQUIRE_EMAIL_VERIFICATION` trước khi chọn là làm site mất đăng ký.
  Resend/Postmark/SMTP tự có — việc này chờ chủ project quyết, kèm chi phí.
- **Vercel Hobby vs Pro.** Site có ads/newsletter/donate là vi phạm điều khoản Hobby
  (platform có quyền suspend), nên trước khi public phải chốt gói — đây là quyết định
  chi phí, không phải kỹ thuật.
- **Việc prod (khi site lên).** Cron `metaboard-tft-refresh` đã bị gỡ cùng
  `/api/tft/refresh` — nếu dashboard Render vẫn còn service cron đó thì xoá thủ công,
  blueprint `sync: false` không tự xoá resource đã tạo.
- **Bật bán membership (paid pilot).** Không phải bước deploy thường: schema/seed offer,
  bật `MEMBERSHIP_ENFORCEMENT=enforce` đồng thời ở Render và Vercel, xác minh sau bật,
  rollback — theo [RUNBOOK-MEMBERSHIP.md](RUNBOOK-MEMBERSHIP.md). Runbook mới được viết
  và đối chiếu mã nguồn. Code đã lên production với cờ tắt, và schema + seed hai offer
  `draft` đã chạy trên Supabase (2026-10-30): `/api/membership/catalog` trả 200
  `{"offers":[]}` vì chưa offer nào `active`. Merchant/live webhook, giao dịch và hoàn
  tiền thật, activate offer, bật cờ và chi phí đo bằng ledger thật còn trống (runbook §7).
  Cờ tắt thì §6 dưới đây vẫn đúng nguyên trạng.
- **Google sign-in:** redirect `https://tftiq.com/api/auth/google/callback`, và
  `AUTH_WEB_ORIGIN` phải khớp origin web thật. Domain đã có (`tftiq.com`); đặt hai
  giá trị này lúc trỏ DNS sang Vercel, trước khi bật đăng nhập Google trên domain mới.
- **Quản lý user mới chỉ có đổi role.** `/admin/users` không chặn, không xoá, không
  thu hồi phiên hộ, không đặt lại mật khẩu; quên mật khẩu cũng chưa có endpoint
  `password_reset` dù schema đã chừa purpose đó. Tất cả đang là việc SQL
  (§3 "Account admin, phiên, và /admin/users") — thêm hay không là quyết định của
  chủ project, đừng tự dựng.
- Newsletter gửi thủ công (export từ `/admin/subscribers`); PWA service worker là
  passthrough — **không** bật offline cache cho data comp, data cũ còn hại hơn một
  request phụ.
- Trước public launch: ảnh Riot (CommunityDragon) cần đối chiếu third-party policy —
  ghi trong PARITY §Owner to do.
