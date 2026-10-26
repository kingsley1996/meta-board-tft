# Triển khai — bản đồ cho agent (MetaBoard / tft-comps)

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
  install từ root thì `@metaboard/shared` mới resolve được; deploy riêng từng thư mục
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
npm run seed --workspace @metaboard/api       # schema + data + comps (xem cạm bẫy §4)
npm run dev:api                               # :4000
npm run dev:web                               # :4173 (dev và prod cùng cổng)
```

Check trước khi ship: `npm run typecheck && npm run test:server && npm run test:e2e`
(Playwright tự dựng cả hai server qua `webServer` trong `playwright.config.ts`; set
`PLAYWRIGHT_BASE_URL` để test một deployment thật đang chạy).

## 3. Prod — hai process, không đối xứng

| Process | Build | Chạy | Env bắt buộc | Env tùy chọn nhưng quyết định tính năng |
|---|---|---|---|---|
| web | `npm run build --workspace @metaboard/web` | `npm run start --workspace @metaboard/web` | `BACKEND_URL` (build + run), `SITE_URL` | — |
| api | không | `npm run start --workspace @metaboard/api` | `DATABASE_URL`, `REFRESH_TOKEN`, `PORT`; `ADMIN_EMAIL` + `ADMIN_SEED_PASSWORD` chỉ lần đầu | `ASSISTANT_*`, `*_API_KEY`, `STT_*`, `VIENEU_TTS_*`, `TTS_*`, `AUTH_*`, `GOOGLE_OAUTH_*` |

Ba thứ hay dựng sai:

- **`/admin` là role của account, không phải mật khẩu thứ hai.** Không còn
  `ADMIN_PASSWORD`/`mb_admin`: đăng nhập ở `/en/login` bằng account có `role = admin`.
  DB trắng thì đặt `ADMIN_EMAIL` + `ADMIN_SEED_PASSWORD` một lần (seed hoặc lúc API
  boot tạo account đầu tiên); khi đã có admin, hai biến đó là no-op và nên xoá khỏi host.
- **Biến web chỉ web dùng, biến API chỉ API dùng** — đưa `DATABASE_URL`/keys vào env
  của web là mở rộng phạm vi rò rỉ vô ích. Web không cần key assistant/STT nào.
- **Trước launch production:** đặt `AUTH_REQUIRE_EMAIL_VERIFICATION=true` (mặc định
  false — đăng ký là tự xác minh, chủ ý cho giai đoạn dev) **và** cắm mailer thật trong
  `apps/api/src/mailer.ts` (mặc định là console mailer, in link ra log). Thiếu một
  trong hai là mở đăng ký không kiểm soát email cho người dùng thật.

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
| `POST /api/tft/refresh` | 409 khi đang có refresh | hai lần ghi đè comps/guides/game data chồng nhau |
| `backendJson()` (web) | timeout 8 s + retry 1 lần (chỉ network/5xx) | cold start của API không còn biến trang public thành 500 |

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

## 4. Dữ liệu: hai bản copy, một nguồn — và seed thì xoá

| Bản copy | Ai dùng | Ai sinh | Cập nhật bằng |
|---|---|---|---|
| Postgres (API) | responses động, admin, validation | `seed.ts` / `syncTft()` | patch day: `POST /api/tft/refresh` (Bearer `$REFRESH_TOKEN`) — **không đụng comps** |
| `packages/shared/data/tft.json` + `apps/web/public/tft/**` (commit trong git) | trang static (champions/items grid, hover cards) | `npm run fetch-data` / `fetch-metatft` / `fetch-comp-tips` / `fetch-loot` | chạy script rồi **rebuild web** (icon path trong DB trỏ vào `public/tft` của web — thiếu file là sync null chúng đi) |

Quy tắc chọn đường, theo trạng thái DB đích:

- **DB trắng (mới deploy):** `npm run seed --workspace @metaboard/api` — apply schema,
  sync CommunityDragon, nạp comps/guides/tips từ `apps/api/seed/`.
- **DB đã có nội dung admin tạo: ĐỪNG seed.** Dòng đầu của `seed.ts` ghi rõ: nó
  *replaces* comps và guides — mọi thứ soạn qua `/admin` bị xoá, log vẫn báo thành
  công. Patch day thì gọi `/api/tft/refresh`; nội dung comps/guides sửa qua admin UI.
  Muốn nạp thêm economy comps: `seed:economy` (bổ sung, không wipe).
- **RAG corpus:** sửa nguồn (`mechanics-knowledge.json`, `seed/guides.ts`, `seed/tips.ts`)
  rồi `npm run build:knowledge`; `chunks.jsonl` là output đã commit — không sửa tay.

## 5. Patch day (runbook rút gọn)

```sh
npm run fetch-data && npm run fetch-wisps && npm run fetch-loot   # web workspace
npm run fetch-comp-tips                                          # gộp tips TFT Academy
git add packages/shared/data apps/web/public/tft                 # data là tài sản commit
npm run build:knowledge --workspace @metaboard/api               # nếu sửa nguồn guide/tip
# push → Vercel rebuild web → RỒI API lấy game data mới:
curl -X POST -H "Authorization: Bearer $REFRESH_TOKEN" https://<api-host>/api/tft/refresh
```

Thứ tự là bắt buộc: dữ liệu static phải nằm trên web **trước hoặc cùng lượt** với
refresh API, vì icon path trong Postgres trỏ vào asset của web — refresh trước là trang
render ảnh 404 cho tới lượt deploy web kế tiếp.

`render.yaml` đã khai báo cron `metaboard-tft-refresh` chạy chính câu curl đó lúc 12:00
UTC (= 19:00 giờ Việt Nam) mỗi ngày, nên bản thân refresh không cần ai nhớ bấm. Nó cần
hai env riêng: `API_ORIGIN` (origin thật của service API) và `REFRESH_TOKEN`. Ba hệ quả
cần biết:

- Cron **không** chờ web deploy. Nó an toàn là vì `syncTft()` thay toàn bộ 4 bảng game
  data trong **một transaction** (`tft.ts:141-181` — DELETE rồi INSERT, ROLLBACK khi lỗi)
  và không đụng comps/guides; chưa có lần nào nó để DB ở trạng thái nửa vời. Đường tự do
  của bạn là tắt cron và bấm tay sau khi web lên, nếu muốn đúng thứ tự §5.
- Trùng giờ với một refresh khác ⇒ API trả **409 `a refresh is already running`** thay
  vì ghi đè song song.
- `curl` chỉ in `tft-refresh:<mã>` ra log, không `--fail`, nên 401/409/503 **không** làm
  Render đánh dấu job đỏ. Đọc log cron định kỳ, hoặc thêm `--fail` nếu muốn platform
  báo thay — quyết định đó thuộc về chủ project, đừng tự đổi một mình.

## 6. Sau khi deploy — cổng kiểm

| Kiểm | Kỳ vọng |
|---|---|
| `GET <api>/api/health` | 200 — process sống, **không chạm DB** (đây là endpoint Render Health Check dùng) |
| `GET <api>/api/health/ready` | 200 kèm số comp; 503 = API sống mà DB không tới được (sai `DATABASE_URL`, pooler chưa bật, IPv4/IPv6) |
| `GET <api>/api/comps` | 200, comps của patch hiện tại |
| `GET <web>/en` và `/vi` | 200, console sạch, **zero request ra ngoài** (rule của lane reference-build: không hotlink tài sản third-party) |
| `GET <api>/api/voice/tts/status` | `available: true` + `provider` = `deepgram` (Flux) hoặc `vieneu`; nếu false, `reason` phân biệt engine tắt (`tts_unavailable`) vs key sai (`tts_credentials_rejected`) |
| `GET <api>/api/voice/status` | `available: true` + `providers` list đúng chuỗi key đã cấu hình; `available: false` = thiếu hết `DEEPGRAM_API_KEY`/`GROQ_API_KEY`/… (không còn đường local nào để rơi) |
| `POST /api/tft/refresh` thiếu/sai token | 401 (503 nếu `REFRESH_TOKEN` chưa cấu hình — nghĩa là endpoint đang chết im lặng) |
| Một request `/api/*` xuyên qua Vercel | header `Set-Cookie` còn nguyên `Secure` và cookie được gửi lại ở request kế — đây là test thật cho `AUTH_SECURE_COOKIES` + proxy |
| `X-Forwarded-For` hai IP khác nhau (vote 2 lần) | hai `counted: true` — xác nhận `TRUST_PROXY` đang bật; hai lần cùng IP trả `counted: false` lần thứ hai |
| `/en/login` → `/admin` | đăng nhập bằng account `role = admin` **và** vào được `/admin`; user thường bị đá lại login |
| `GET <web>/sitemap.xml` | URL là domain thật — quên `SITE_URL` là nó trả `http://localhost:4173` |
| `npm run test:e2e` với `PLAYWRIGHT_BASE_URL=https://<web>` | xanh trên deployment thật |

## 7. Cạm bẫy hỏng im lặng

| Cái | Triệu chứng | nơi chốt |
|---|---|---|
| Không có account `role = admin` | `/admin` luôn redirect về `/en/login` dù đăng nhập đúng | bootstrap `ADMIN_EMAIL`/`ADMIN_SEED_PASSWORD` (`accounts.ts`) |
| Chạy `seed` trên DB đã có nội dung | **mọi comp/guide soạn qua admin biến mất**, không lỗi nào | đầu `seed.ts` |
| Quên rebuild web sau `fetch-data` | trang static hiện data set cũ, API thì mới — hai nửa lệch nhau | README §Game data |
| `proxyTimeout` bị bỏ | câu trả lời Coach AI dài chết 502 đúng 30 s | `next.config.ts` |
| Vote/view dedupe **in-memory** | restart là từng visitor bump lại được — chấp nhận được, nhưng đừng tưởng nó là rate limit | PARITY §Backend API |
| `DATABASE_URL` bản **Direct** của Supabase | API Render treo 10 s rồi 503 ở mọi route chạm DB: direct host IPv6-only, Render không có IPv6. Không có message nào ngoài `connection timeout` | §3 Database |
| `DATABASE_URL` bản **transaction mode** (`:6543`) | chạy được lúc đầu, rồi lỗi random ở transaction giữ client và DDL lazy (`prepared statement ... already exists`, `portal ... does not exist`) — pgbouncer mode này cắt hai thứ đó | `comps.ts:254` · `tft.ts:139` · `accounts.ts:39` |
| Mật khẩu Supabase chưa URL-encode | `SASL: password authentication failed` dù đúng key — key random chứa `+ / %`, `pg-connection-string` cắt mất | §3 Database |
| Thiếu `NODE_ENV=production` | `/voice/status` lộ `reason` của provider, cookie `Secure` không bật, `TRUST_PROXY` không mặc định — mọi thứ vẫn "chạy" | `index.ts` trust proxy · `auth.ts secureCookieSuffix()` |
| `AUTH_REQUIRE_EMAIL_VERIFICATION=false` khi đã public | ai cũng vào được với email không thật | `src/mailer.ts` |
| Deploy từng workspace riêng | `@metaboard/shared` không resolve | README §Build and deploy |

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
- **Cron của Render chưa có ai đọc log.** `tft-refresh:<mã>` chỉ hiện trong log; 401 vì
  `REFRESH_TOKEN` lệch sẽ im lặng tới ngày ai đó thắc mắc sao data cũ. Bật alert của
  Render service, hoặc bỏ.
- **Google sign-in:** redirect `<site>/api/auth/google/callback`, `AUTH_WEB_ORIGIN`
  phải khớp origin web thật — cấu hình sau khi có domain, không phải trước.
- Newsletter gửi thủ công (export từ `/admin/subscribers`); PWA service worker là
  passthrough — **không** bật offline cache cho data comp, data cũ còn hại hơn một
  request phụ.
- Trước public launch: ảnh Riot (CommunityDragon) cần đối chiếu third-party policy —
  ghi trong PARITY §Owner to do.
