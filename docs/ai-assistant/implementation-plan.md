# TFT Assistant — Implementation Plan (M0)

Trạng thái: **M0–M3 MVP đã triển khai — provider Ollama local + `qwen3.5:9b`, tools/ranking, endpoint/UI, mechanics Set 18, structured answers + comp cards, controlled read-only tool calling và `strategy_analysis` deterministic; 59 unit tests, 6 Playwright e2e, RAG eval 32 positive + 4 negative, coach eval 32/32, typecheck/build pass. Full 53-case accuracy baseline chưa chạy; selected smoke 11/11 pass.**
Spec gốc: `tft-assistant-feature-spec.md` (root repo).
Phạm vi MVP: read-only lookup + comp recommendation trên dữ liệu hiện có, text-first, tiếng Việt/tiếng Anh.

> Cập nhật cấu trúc: repo hiện dùng npm workspaces. Frontend nằm trong `apps/web`, API trong `apps/api`, và code/data dùng chung trong `packages/shared`. README ở root là hướng dẫn hiện hành; các path cũ dưới đây là ghi chú theo thời điểm triển khai từng milestone.

---

## 1. M0 — Repository discovery

### 1.1 Stack thực tế

| Lớp | Công nghệ | Ghi chú |
|---|---|---|
| Frontend | Next.js 16 App Router, React 19, Tailwind v4 | Routes dưới `app/[lang]/...`; i18n en/vi |
| Backend | Node.js 26 chạy `.ts` trực tiếp, Express 5, `pg` | `server/src/index.ts`, không build step |
| Database | PostgreSQL 17 | Schema `server/src/schema.sql`, seed `server/seed/` |
| Package manager | npm | `package-lock.json`, không monorepo/workspace |
| Auth | Một mật khẩu admin dùng chung | Cookie `mb_admin`; không có user account |
| Test | Chưa có test runner/CI | Playwright có trong devDependencies nhưng chỉ dùng cho capture |
| Deploy | Chưa có cấu hình | Dev :3001 (Next), API :4000, prod Next :4173 |

Không có `README.md`, `AGENTS.md`, `CLAUDE.md`. Tài liệu hiện có: `PARITY.md` (kiến trúc/behaviour) và `capture/plan.md` (plan của bản rebuild giao diện).

### 1.2 Data flow hiện tại

```text
Browser
  └── Next.js (app/[lang], components)
        ├── Server Components → lib/backend.ts → Express :4000
        └── Client fetch /api/* → Next rewrite → Express :4000
                                                   ├── PostgreSQL
                                                   ├── CommunityDragon (sync game data)
                                                   └── MetaTFT / TFT Academy (scripts, offline)
```

- `next.config.ts` rewrite `/api/:path*` sang `BACKEND_URL` (mặc định `http://127.0.0.1:4000`), nên browser same-origin, không CORS.
- Không có global search API; tìm comp ở `components/comps-explorer.tsx` là client-side.
- `server/src/index.ts` đã có: comps list/detail, vote/view, subscribe, guides, `/api/tft/set`, `/api/tft/refresh`, admin CRUD.
- `server/src/comps.ts` là domain service chính cho comp: validate, write, list và enrich unit/item/augment/trait/matchup.

### 1.3 Dữ liệu hiện có (kiểm tra trên DB đang chạy)

| Bảng / nguồn | Số lượng | Dùng được cho Assistant |
|---|---:|---|
| `champions` | 65 | Có tên, cost, traits, icon; **thiếu ability/mana/nameVi** |
| `traits` | 36 | Có description, thresholds, styles |
| `items` | 145 | Gồm cả artifact/emblem/radiant; có description, composition |
| `augments` | 592 | Có description, rarity; tên có thể trùng |
| `comps` | 40 | 40 có tips + stages; 29 comp có alt (47 alt unit rows); 33 comp có `augment_types` |
| `guides` | 27 | 27 bản có tiếng Việt; nội dung biên tập, chưa có metadata source/patch |
| `meta` | patch `18.4b`, set `18` | `synced_at` là thời điểm sync CommunityDragon; **không có metadata MetaTFT/TFT Academy** |

Nguồn tĩnh phía Next:

- `lib/tft.json`: 65 champions (có ability, mana, nameVi, descVi), 36 traits (có breakpoints), 67 items, 592 augments. Đây là nguồn giàu nhất cho giải thích entity.
- `lib/meta.json`: snapshot MetaTFT — 40 comps kèm `stats.avg/games/level`, 55 item tiers, 213 augment tiers, 65 unit stats.
- `lib/mechanics.ts`: bảng shop odds/XP/pool/income; server dùng qua `mechanics-knowledge.ts`, `/tables` vẫn dùng trực tiếp.
- `lib/mechanics-knowledge.json`: nội dung cơ chế dạng data-driven, tách `general` (rule ổn định) và từng `set` (patch, source, updated, topic keywords/rules). Thêm set mới bằng cách thêm object vào `sets`, không sửa matcher.
- `server/seed/comps.json`: có `stats` của MetaTFT nhưng `validateCompPayload` bỏ qua field này, nên **DB không lưu số liệu comp**.

### 1.4 UI entry points hiện có

- Nav: `components/nav.tsx` (dropdown Comps/Database/Tools + Guides, Media). Không có search toàn cục.
- Comp detail: `app/[lang]/tierlist/comps/[slug]/page.tsx` render `CompsExplorer` → `CompPanel`.
- Champion detail: `app/[lang]/champions/[slug]/page.tsx`.
- Items: `app/[lang]/items/page.tsx`; Augments: `app/[lang]/augments/page.tsx` (search server-side qua query params).
- Layout công khai: `app/[lang]/layout.tsx` (Nav, Footer, HoverCardLayer).
- i18n: `lib/messages.ts`, `vi` được type-check theo `en`; entity names lấy từ `lib/tips.ts`.

---

## 2. Gap analysis

| Khu vực | Đã có | Thiếu / rủi ro | Milestone |
|---|---|---|---|
| Domain tools | `listComps`, `getMeta`, DB game tables | Chưa có tool layer typed/read-only; chưa có entity resolver | M1 |
| Entity IDs | `api_name` cho champion/item/augment; comp slug | API trả display name làm key; chưa có catalog ID thống nhất | M1 |
| Champion knowledge | `lib/tft.json` có ability/mana/VI | DB `champions` không có các field này; backend đọc chéo `lib/` nếu dùng | M1 |
| Comp stats | `lib/meta.json` + `seed/comps.json` có `stats` | DB bỏ `stats`; không có bảng snapshot, sample size trong DB | M5 |
| Patch history | Chỉ snapshot hiện tại | Không thể trả lời “patch này thay đổi gì”; không có bảng lịch sử | M5 / unsupported |
| Knowledge corpus | 184 chunks từ 27 guides/tips + mechanics | Đã có chunk/source/version metadata + BM25 baseline; chưa wire retrieval vào assistant, chưa có per-rule citation | M4 |
| Provenance | `PARITY.md` ghi nguồn; `meta.synced_at` | Không có source per comp/field; không có MetaTFT/TA retrieved_at | M1 (meta keys) |
| Conversation | Chưa có | Không có schema/endpoint; MVP có thể stateless | M2 |
| AI provider | Ollama đã cài, chưa có model Qwen3.5 | Chưa pull model/context; chưa có adapter | M2 |
| Rate limit | Chỉ dedupe vote trong memory | Không có rate limit; `req.ip` sau proxy là loopback | M2 |
| Observability | `console.log/error` | Không có request ID, structured logs, token/cost metrics | M2 |
| Tests/eval | Playwright dep, không có test | Không có unit/integration/e2e/eval; root `tsc` exclude `server/` | M1–M2 |
| Deployment | Chưa có | Chưa rõ backend có tách rời `lib/` không; chưa có CI | M6 |

### 2.1 Các gap dữ liệu cần nói rõ trong câu trả lời

- Ability numbers của set 18 chỉ có một phần trong CommunityDragon (PARITY ghi 10/91); không được bịa giá trị thiếu.
- `items` DB 145 gồm artifact/emblem/radiant, trong khi `lib/tft.json` chỉ có 67 item catalog. Không link artifact tới `/items` như thể có trang riêng.
- Augment trùng display name; phải dedupe theo name + rarity giống `/augments`.
- `meta.set_name` đang là `Set10` trong khi `set_number = 18`; Assistant chỉ dùng `set_number` + `patch`, không dùng `set_name`.
- Comp tips/stages hiện là nội dung adapt từ TFT Academy; board/tier từ MetaTFT. Chưa có source per field → phải cite cấp provider + patch, và review quyền sử dụng trước khi public.

---

## 3. Quyết định kiến trúc (M0)

1. **Đặt orchestration trong Express backend hiện có** (`server/`), không tạo AI service mới, không dùng Next API routes. Lý do: backend đã có DB pool, domain service, auth, proxy và là nơi duy nhất giữ secret.
2. **Backend chọn tool deterministically cho câu hỏi đóng; LLM dùng bounded tool loop chỉ với read-only allowlist cho câu hỏi mở/không rõ.** Tối đa 3 vòng, 5 tool calls và 2 calls/vòng; tool args được validate/clamp, schema `additionalProperties:false`, unknown args bị từ chối. Không có SQL, write tool hoặc tool tự do. Điều này thỏa spec 5.3/5.4 và giảm prompt-injection/tool-abuse.
3. **Không thêm dependency cho MVP.** Dùng `fetch` toàn cục cho provider, validator thủ công theo pattern `comps.ts`/`guides.ts`, `node:test` cho unit test, Playwright đã có cho e2e. Không thêm Zod, SDK, vector DB, Redis.
4. **Conversation MVP là stateless.** Client giữ history trong `sessionStorage`, gửi tối đa 6 lượt gần nhất; server không lưu message. Chỉ thêm bảng conversation khi có yêu cầu lịch sử/feedback thực sự.
5. **Không RAG/vector DB trong MVP.** Corpus 27 guides chưa đủ metadata/quyền; M4 mới làm, ưu tiên Postgres full-text trước.
6. **Dùng statistic MetaTFT trực tiếp từ `lib/meta.json`.** Snapshot public có avg/top4/win/games và patch; assistant đưa các số này vào evidence và trả lời bình thường. Không cần DB snapshot/provenance cho dự án cá nhân.
7. **Champion ability/mana lấy từ `lib/tft.json` qua adapter read-only** (`static-game-data.ts`), không copy dữ liệu và không migration. Nếu sau này backend deploy tách khỏi repo, chuyển sang bảng `champion_details`.
8. **Entry point MVP nhỏ nhất:** nav link “Assistant” + nút “Ask about this comp” trong `CompPanel`. Chưa làm global search, champion/item detail buttons, Comp Finder form (M3).
9. **Provider: Ollama local, model Qwen3.5 open-source.** Dùng native `/api/chat` qua `fetch`, không SDK, không API key, không gọi Internet. Mặc định `qwen3.5:9b` (~6.6GB, Q4) trên M2 16GB; fallback `qwen3.5:4b` (~3.3GB) nếu latency cao. Context 8192, tắt thinking nếu runtime hỗ trợ.
10. **Feature flag `ASSISTANT_ENABLED`**, mặc định tắt. Bật ở staging/local trước, chỉ public sau khi eval đạt gate.

---

## 4. MVP scope

### Trong phạm vi

- Hỏi đáp entity: champion, item, trait, augment (tên, cost, traits, ability, description, composition, rarity).
- Hỏi đáp comp: tìm theo tên/slug, xem board/items/augments/tips/stages/alt, giải thích tại sao comp dùng unit/item đó.
- Tìm comp từ danh sách champion/item/augment user cung cấp; trả candidate có score breakdown, matched entities, limitations.
- So sánh 2 comp trong catalog.
- Trả lời Set/Patch hiện tại; từ chối set/patch khác.
- Source links nội bộ + provider label + patch; trạng thái `needs_clarification`, `insufficient_data`, `unsupported`, `error`.
- UI chat responsive, keyboard accessible, copy, feedback, retry.
- Rate limit, timeout, structured logs, cost cap.

### Ngoài phạm vi MVP

- Real-time coach, OCR/screen reading, live overlay, opponent scouting.
- Patch notes/RAG, meta win-rate analytics, patch-change answers.
- Voice input/output.
- Conversation persistence đa thiết bị, user accounts.
- Global search thay thế search hiện có.
- Comp Finder form đầy đủ (M3).
- Tự động tạo comp mới hoặc tự sinh ID.

---

## 5. Kiến trúc triển khai

### 5.1 Module layout

```text
server/src/assistant/
  contracts.ts       # types + manual validators
  entities.ts        # catalog, normalization, alias matching, stable IDs
  static-game-data.ts # read-only lib/tft.json adapter (ability/mana/VI/breakpoints)
  tools.ts           # read-only domain tools
  ranking.ts         # deterministic comp candidate scoring
  orchestrator.ts    # route intent, select tools, build evidence
  prompt.ts          # system prompt + evidence serialization
  provider.ts        # provider interface + Ollama /api/chat adapter
  validate.ts        # response schema/source/recommendation validation
  logger.ts          # structured logs, request ID, usage
  rate-limit.ts      # in-memory limiter + daily request cap
  index.ts           # Express router: POST /api/assistant/query, /feedback
```

Không tạo thư mục `apps/` hay service mới.

### 5.2 Luồng request

```text
POST /api/assistant/query
  1. Validate body + lang + context + history
  2. getMeta() → set/patch hiện tại
  3. Resolve entity/comp từ message + page context (deterministic)
  4. Nếu ambiguous → needs_clarification (không gọi LLM)
  5. Chọn tool theo intent + entity đã resolve
  6. Chạy tool; nếu comp recommendation → ranking engine
  7. Đóng gói evidence + sources + limitations
  8. Nếu provider bật → LLM synthesize JSON answer
     Nếu provider tắt/lỗi → deterministic answer từ evidence
  9. Validate output: status, source IDs, recommendation IDs; stats chỉ được lấy từ evidence
 10. Log metrics; trả response
```

### 5.3 Provider adapter

Interface tối thiểu:

```ts
type ProviderRequest = {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxOutputTokens: number;
  signal: AbortSignal;
};
type ProviderResult = {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
};
```

- Adapter gọi Ollama native `POST ${ASSISTANT_BASE_URL}/api/chat` bằng `fetch`:
  ```json
  {
    "model": "qwen3.5:9b",
    "messages": [{ "role": "system", "content": "..." }, { "role": "user", "content": "..." }],
    "stream": false,
    "format": "json",
    "think": false,
    "keep_alive": "30m",
    "options": { "num_ctx": 8192, "num_predict": 800, "temperature": 0.2 }
  }
  ```
- `ASSISTANT_BASE_URL` mặc định `http://127.0.0.1:11434`; kiểm tra host là loopback và từ chối URL ngoài loopback để bảo đảm offline.
- Đọc `message.content`, `prompt_eval_count`, `eval_count`, `total_duration` từ response; validate JSON sau khi parse.
- Timeout 60s cho lần load model đầu tiên; các request sau 90s (`ASSISTANT_LOAD_TIMEOUT_MS` / `ASSISTANT_REQUEST_TIMEOUT_MS`). Không retry vô hạn; tối đa 1 retry khi Ollama trả 5xx hoặc lỗi network.
- Model chưa pull/chưa chạy → 503 `assistant_unavailable`; UI hiện hướng dẫn `ollama pull qwen3.5:9b`.
- Tắt thinking (`think: false`) nếu runtime hỗ trợ; không trả reasoning/chain-of-thought.
- Không log prompt/response đầy đủ; chỉ log hash/độ dài/token.
- Nếu provider lỗi: trả deterministic answer cho lookup đơn giản; câu phức tạp → `error` với retry button.
- Không gọi model thật trong test mặc định; có smoke test opt-in `ASSISTANT_LIVE_EVAL=1`.

Cài đặt local (không chạy tự động trong repo):

```bash
ollama pull qwen3.5:9b          # ~6.6GB
ollama serve                    # nếu chưa chạy service
curl http://127.0.0.1:11434/api/tags
```

Nếu máy chậm hoặc RAM căng, đổi `ASSISTANT_MODEL=qwen3.5:4b` (~3.3GB). Không dùng model 27B/35B/122B trên máy 16GB.

### 5.4 Intent routing

Rule-based trước, LLM không quyết định nguồn sự thật:

| Intent | Trigger | Tool |
|---|---|---|
| `entity_lookup` | tên champion/item/trait/augment khớp catalog | `searchEntities`, `getEntity` |
| `comp_search` | “comp”, “đội hình”, tên comp/slug | `searchComps`, `getComp` |
| `comp_recommendation` | user đưa ≥1 champion/item/augment hoặc “tìm comp phù hợp” | `findCompsByEntities` |
| `comp_comparison` | “so sánh”, ≥2 comp | `compareComps` |
| `gameplay_knowledge` | câu hỏi cơ chế/ability/trait | `getEntity` + static data + mechanics JSON (semantic keyword scoring, current-set topics); M4 mới retrieval |
| `meta_query` | win rate/avg/top4/thống kê | `entityStats`/`compStats` từ `lib/meta.json` |
| `strategy_analysis` | câu hỏi roll/level/giữ vàng/pivot kèm state (level, vàng, HP, streak) hoặc hỏi độ mạnh board | deterministic `strategy.ts`; không gọi LLM, không tool mới |
| `patch_change` | “patch này đổi gì” | MVP: `unsupported`; M5 |
| `unsupported_or_unknown` | ngoài phạm vi/không resolve được | trả lời an toàn |

Không dùng LLM classifier trong MVP. Nếu rules không khớp nhưng có entity, fallback `entity_lookup`; nếu không, hỏi lại.

### 5.5 Entity resolution

- Catalog xây từ DB (`api_name`, `name`) và `lib/tft.json` (`slug`, `nameVi`, `traitsVi`).
- Chuẩn hóa: lowercase, NFD bỏ dấu tiếng Việt, bỏ punctuation/khoảng trắng; giữ bản gốc để hiển thị.
- Alias nguồn:
  - slug (`ahri-spellweaver`), api_name đã bỏ prefix (`DA_`, `TFT_Item_`), display name EN/VI.
  - Item alias đã có trong script meta của repo crawler (`ITEM_ALIASES`, `EMBLEM_ALIASES`) — chuyển thành module dùng chung hoặc copy có kiểm soát.
  - Comp title/slug.
- Nếu match >1: trả `needs_clarification` + danh sách lựa chọn; không tự chọn.
- Stable ID trả về:
  - `champion:<api_name>`
  - `item:<api_name>`
  - `augment:<api_name>`
  - `trait:<api_name>`
  - `comp:<slug>`
- Không dùng display name làm khóa chính trong response/tool.

---

## 6. Read-only tools

Tool nội bộ chạy deterministic; LLM chỉ thấy schema read-only và chạy trong bounded loop (3 vòng, 5 calls, 2 calls/vòng). Mỗi tool call có timeout 15s; unknown/repeated/malformed calls trả structured error. Orchestrator dừng sau batch tool đầu nếu đã có dữ liệu và trả deterministic để tránh chờ thêm một lượt LLM. Không có tool ghi dữ liệu, SQL hoặc network ngoài Ollama.

| Tool | Nguồn | Output |
|---|---|---|
| `getActiveSetAndPatch()` | `getMeta()` | `{ setId, patch, setName? }` |
| `searchEntities(query, type?, limit)` | DB + `lib/tft.json` | entity summaries + score |
| `getEntity(id)` | DB + `lib/tft.json` | full entity + source IDs |
| `searchComps(query, filters?)` | `listComps()` | comp summaries |
| `getComp(slug)` | `listComps(slug)` | full comp |
| `findCompsByEntities({ championIds, itemIds, augmentIds, preferences })` | `listComps()` + `ranking.ts` | candidates + breakdown |
| `compareComps(slugs)` | `listComps()` | common/different fields; stats lấy riêng từ `lib/meta.json` |
| `getMechanics()` | `lib/mechanics.ts`, `lib/mechanics-knowledge.json` | đã có: general rules + set topics, source `mechanics:set<id>`, patch/updated từ JSON |

Không có tool ghi dữ liệu trong MVP. Không có raw SQL tool.

### 6.0 Cập nhật mechanics cho set/patch mới

1. Thêm object set vào `sets` trong `lib/mechanics-knowledge.json` với `id`, `name`, `patch`, `updated`, `source` và `topics`.
2. Mỗi topic có `keywords` (phrase/token có weight) và `rules.en`/`rules.vi`; chỉ dùng `generator` khi rule sinh từ bảng số.
3. Chỉ giữ rule ổn định trong `general.topics`; rule đổi theo set/patch phải nằm trong set topic.
4. Nếu bảng shop/XP/pool/income thay đổi, cập nhật `lib/mechanics.ts`; test kiểm tra `mechanicsPatch` khớp `patch` của set 18.
5. Thêm eval case cho set mới rồi chạy `npm run test:eval`.

### 6.1 Ranking engine (deterministic)

Ranking dùng dữ liệu có thật trong comp; stats MetaTFT được trả riêng, không trộn vào match score.

Features đề xuất:

- Champion match: board `+3`, carry `+2` extra, early `+1`, alt `+1`.
- Item exact match trong `comp.items` hoặc unit items: `+2`.
- Component compatibility: nếu user nhập component, comp item có `composition` phù hợp → `+2`; chỉ dùng item có composition.
- Augment exact match: `+2`.
- Preference style (`Reroll`/`Fast 8`/`Flex`/`Tempo`) hoặc difficulty (`1..3`) nếu user nói rõ: `+1`.
- Không dùng tier để cộng điểm; tier chỉ tie-break sau cùng.
- Tie-break: điểm → số matched entity → tier → title.
- Trả tối đa 5 candidate, mỗi candidate có:
  - `compId`, `title`, `score`, `matchedEntities`, `reasons`, `limitations`.
- Nếu không có match: `insufficient_data` + gợi ý nhập thêm champion/item.
- Nếu chỉ match 1 entity: ghi rõ “match sơ bộ”, không gọi là “tốt nhất”.

Ví dụ reason: “Khớp 2/3 tướng bạn có; 2 item trong comp dùng được từ component bạn nhập.”

### 6.2 Strategy analysis (M3 spec — deterministic, chưa có game-state integration)

- Chưa có tích hợp đọc trận đấu; user nhập state ngay trong câu hỏi (`level 7, 40 vàng, 30 HP, stage 4-2, 3 win streak`). Parser nhận level/XP/gold/HP/stage/streak/mục tiêu.
- Intent `strategy_analysis` chỉ bật khi có marker hành động (roll/level/giữ vàng/pivot/board/frontline/streak/econ) và có state hoặc ngữ cảnh board; câu hỏi comp thuần vẫn đi đường comp.
- `strategy.ts` tính từ dữ liệu đã xác minh: `lib/mechanics.ts` `xpTable` (1 vàng = 1 XP) và `shopOdds`; không tạo xác suất thắng.
- Heuristic chọn hành động chính theo khả năng lên cấp + HP (thấp → ưu tiên ổn định), kèm nhánh điều kiện, đánh đổi và giả định. Thiếu level/vàng/HP → `needs_clarification`, không đoán.
- Output 5 section: Khuyến nghị, Căn cứ, Đánh đổi, Giả định, Còn thiếu; source `mechanics:set<id>`, nêu rõ patch.
- Không thêm tool LLM mới vì luồng deterministic đã đủ; `get_level_cost`/`compare_strategy_options` chỉ làm khi có nguồn state tự động hoặc nhu cầu multi-step.
- `strategy.test.ts` phủ parse, routing, chi phí lên cấp, clarify và output không lộ `null`.

---

## 7. API contract

### 7.1 `POST /api/assistant/query`

Request:

```json
{
  "message": "Tôi có Ahri và Blue Buff, tìm comp phù hợp.",
  "lang": "vi",
  "conversationId": "optional-uuid",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "context": {
    "pageType": "comp",
    "compSlug": "ahri-spellweaver",
    "entityIds": ["champion:DA_18_Ahri"]
  }
}
```

Giới hạn:

- `message`: 1–2000 ký tự.
- `history`: tối đa 6 message, mỗi message ≤2000 ký tự; chỉ role `user`/`assistant`.
- `context.pageType`: whitelist `comp`, `champion`, `item`, `augment`, `assistant`.
- `compSlug`: regex slug + phải tồn tại.
- `entityIds`: tối đa 10, phải resolve được.
- Không nhận HTML; React tự escape.

Response:

```json
{
  "requestId": "uuid",
  "conversationId": "uuid",
  "answer": "Câu trả lời dựa trên evidence.",
  "intent": "comp_recommendation",
  "mode": "llm",
  "resolvedContext": {
    "setId": "18",
    "patchId": "18.4b",
    "lang": "vi",
    "entities": [{ "type": "champion", "id": "champion:DA_18_Ahri", "name": "Ahri" }]
  },
  "recommendations": [
    {
      "compId": "comp:ahri-spellweaver",
      "title": "Ahri Spellweaver",
      "score": 9,
      "reasons": ["..."],
      "matchedEntities": ["champion:DA_18_Ahri"],
      "limitations": ["Điểm khớp chỉ phản ánh độ trùng khớp."]
    }
  ],
  "sources": [
    {
      "id": "comp:ahri-spellweaver",
      "title": "Ahri Spellweaver",
      "url": "/vi/tierlist/comps/ahri-spellweaver",
      "sourceType": "structured_data",
      "version": "set18-patch18.4b"
    }
  ],
  "limitations": ["Xếp hạng theo độ trùng khớp."],
  "followUpQuestions": ["Bạn muốn xem item priority của comp này không?"],
  "status": "answered"
}
```

`status`: `answered | needs_clarification | insufficient_data | unsupported | error`.
`mode`: `llm | deterministic`.

### 7.2 `POST /api/assistant/feedback`

```json
{ "requestId": "uuid", "conversationId": "uuid", "helpful": true }
```

- 204; chỉ structured log, không lưu DB ở MVP.
- Không log nội dung câu hỏi.

### 7.3 Lỗi

| HTTP | Khi nào | Body |
|---|---|---|
| 400 | payload sai | `{ error, requestId, code: "invalid_request" }` |
| 429 | rate limit/request cap | `{ error, requestId, code: "rate_limited", retryAfter }` |
| 503 | feature tắt/Ollama chưa chạy hoặc model chưa pull | `{ error, requestId, code: "assistant_unavailable" }` |
| 504 | Ollama timeout | `{ error, requestId, code: "provider_timeout" }` |
| 502 | Ollama lỗi | `{ error, requestId, code: "provider_error" }` |
| 500 | lỗi nội bộ | `{ error: "internal error", requestId }` |

Không trả stack trace, prompt, secret.

---

## 8. UI

### 8.1 Route và component

- `app/[lang]/assistant/page.tsx`: metadata, đọc `searchParams` (`comp`, `pageType`), render chat.
- `components/assistant/assistant-chat.tsx`: client component.
- `components/assistant/message.tsx` (nếu cần tách): render answer/sources/recommendations.
- `components/nav.tsx`: thêm “Assistant” vào dropdown Tools.
- `components/comp-panel.tsx`: thêm link “Ask about this comp” → `/[lang]/assistant?comp=<slug>&pageType=comp`.
- `lib/messages.ts`: block `assistant` cho en/vi (empty state, placeholders, status labels, errors).
- `lib/api.ts`: types `AssistantRequest/Response` (client-side).
- `app/sitemap.ts`: thêm route assistant (nếu public).

Không thay đổi layout/nav hiện có ngoài link mới. Không dựng global search.

### 8.2 Trạng thái UI

- Empty state + 4 câu hỏi mẫu (theo ngôn ngữ).
- Đang gửi / đang tra dữ liệu / đang tạo câu trả lời.
- Answer + sources + Set/Patch chip + limitations + follow-up buttons.
- Recommendations: title, score breakdown, matched entity chips, link tới comp detail.
- `needs_clarification`: danh sách lựa chọn click được.
- `insufficient_data` / `unsupported`: giải thích ngắn, gợi ý dữ liệu đang có.
- Lỗi 429/503/504/network: retry button; giữ message để gửi lại.
- Copy answer; feedback hữu ích/không hữu ích.
- Multi-turn: gửi 6 lượt gần nhất; clear conversation; lưu `sessionStorage`.
- Mobile: input sticky, max height, không tràn ngang; keyboard: Enter gửi, Shift+Enter xuống dòng; `aria-live="polite"` cho message mới; focus vào input sau khi gửi.

### 8.3 Ngôn ngữ

- `lang` lấy từ route; gửi kèm request.
- UI copy qua `messages[lang]`.
- Answer theo ngôn ngữ user; entity name dùng `nameVi` nếu có, kèm tên EN trong ngoặc khi cần; ID/source vẫn canonical.
- Prompt yêu cầu giữ đúng tên game, không dịch sai tên item/augment.

---

## 9. Data, source và provenance

### 9.1 Source registry (code-level, MVP)

| Source ID | Provider | Dùng cho | URL |
|---|---|---|---|
| `communitydragon` | Riot CommunityDragon | entity, ability, trait, item, augment | `https://raw.communitydragon.org/` |
| `metatft` | MetaTFT | comp board/tier/items, unit/item/comp stats | `https://www.metatft.com/` |
| `tftacademy` | TFT Academy | comp tips/stages/augments/priority/alt | `https://tftacademy.com/` |
| `metaboard` | MetaBoard | guides, mechanics tables | internal |

- Mỗi source trả về kèm `version` dạng `set18-patch18.4b`.
- `retrievedAt` chỉ xuất hiện nếu có timestamp thật; không bịa.
- Link nội bộ cho entity/comp là link thật trong site; không dùng `example.com`.
- Không đưa raw prompt/evidence vào response.

### 9.2 Provenance tối thiểu cần bổ sung ở M1

Không cần migration; thêm meta keys khi seed/refresh:

- MetaTFT: `lib/meta.json.source` đã có `updated`, `fetchedAt`, `clusterId`, `queue`; `server/seed/seed.ts` ghi thành `metatft_updated`, `metatft_fetched_at`, `metatft_cluster_id`, `metatft_queue`.
- TFT Academy: script tips của repo crawler ghi sidecar `server/seed/tftacademy-source.json` với `retrievedAt`; seed ghi `tftacademy_retrieved_at`.
- CommunityDragon: `synced_at` đã có trong `meta`.

Assistant đọc các key này để hiển thị version/freshness. Không có timestamp thật thì bỏ `retrievedAt`, không bịa.

Nếu cần provenance per comp (tips từ TA vs comp không match), thêm `comps.provenance jsonb` ở M4 khi làm citation chi tiết. Không thêm bây giờ.

### 9.3 Quyền sử dụng dữ liệu — đã được chủ dự án cho phép

- Chủ dự án xác nhận được phép dùng TFT Academy/MetaTFT public cho Assistant (2026-10-21); blocker nội dung trước M2 đã được gỡ.
- Vẫn giữ attribution cấp provider (MetaTFT cho board/tier; TFT Academy cho tips/stages) và không trình bày dữ liệu bên thứ ba như nội bộ/official.
- Không scrape thêm nguồn mới cho Assistant.
- Riot: chỉ dùng static data/CommunityDragon; không đọc game state, không OCR, không live overlay. Nếu public, vẫn cần đăng ký sản phẩm trên Riot Developer Portal theo spec 9.1.

---

## 10. Security, reliability, cost

- Không có API key/secret cho LLM: Ollama chạy local; `server/.env` chỉ chứa `ASSISTANT_BASE_URL`, `ASSISTANT_MODEL`, `ASSISTANT_ENABLED`. Không đưa cấu hình provider vào root `.env.local` hay client bundle.
- `ASSISTANT_ENABLED=false` mặc định; endpoint trả 503 khi tắt hoặc Ollama không chạy.
- Rate limit in-memory theo anonymous cookie `mb_assistant` + global daily request cap. **Lưu ý:** Next rewrite làm `req.ip` của Express thành loopback; implementation dùng cookie UUID thay vì `req.ip`. Giới hạn 1 request inference đồng thời để tránh tranh GPU/RAM với Postgres/Next.
- Timeout 60s cho request đầu (load model), 90s các request sau (Qwen 9B thực tế 34–39s cho câu trả lời dài); `AbortController` từ client; server abort Ollama khi client đóng. Next rewrite proxy đặt `experimental.proxyTimeout: 90_000` vì mặc định 30s sẽ cắt request trước backend.
- Max 6 history messages, 3 tool-loop rounds / 5 tool calls, 5 candidate comps, 800 output tokens.
- Tool messages dùng native Ollama `tool_calls` + `{ role: 'tool', tool_name, content }`; tool payload có provenance `setId`/`patch`. Entity trùng tên/rarity được dedupe; nếu vẫn khác lựa chọn thì trả `needs_clarification` thay vì chọn đại.
- Không log message content, prompt, provider response; chỉ log requestId, intent, tool names, duration, token count, status, error code.
- Không render HTML từ LLM; chỉ text + link nội bộ đã validate.
- Prompt injection: user text là untrusted; evidence từ DB là trusted trong MVP; M4 retrieval content phải đánh dấu untrusted và test injection.
- Chi phí: không có phí API/token; “cost” là RAM/CPU/GPU, điện và latency. Đo `prompt_eval_count`/`eval_count`, `total_duration`, p50/p95; đặt `ASSISTANT_DAILY_REQUESTS` và `ASSISTANT_MAX_CONCURRENCY=1`. Không bịa cost USD.

---

## 11. Testing và evaluation

### 11.1 Unit tests (`node:test`)

- `entities.test.ts`: chuẩn hóa tiếng Việt, slug/api_name, alias, ambiguous, unknown.
- `ranking.test.ts`: champion/item/component/augment scoring, tie-break, no-match, missing data.
- `validate.test.ts`: response schema, source IDs, recommendation IDs; stats text allowed.
- `contracts.test.ts`: message/history/context limits, invalid lang/status, stable IDs.
- `orchestrator.test.ts`: intent routing cho lookup/recommendation/comparison/statistics/patch/mechanics/strategy; guard số liệu mechanics không có trong evidence.
- `strategy.test.ts`: parse game state, routing strategy, chi phí XP/vàng từ bảng đã xác minh, clarify khi thiếu dữ kiện, output có căn cứ/đánh đổi/giả định.
- `mechanics-knowledge.test.ts`: semantic matching (Wisp/economy/paraphrase), version/source metadata, prompt primer chỉ khi có mechanics, evidence serialization.
- `retrieval.test.ts`: corpus integrity, BM25 top hit, language filter và negative query.
- `rate-limit.test.ts`: window cap và inference slot.
- `tools.test.ts`: tool results chỉ chứa ID thật; comp không tồn tại → empty/404.
- `static-game-data.test.ts`: ability/mana/VI lookup, unknown → null, không bịa.

### 11.2 Integration tests

- Endpoint với DB test (`TEST_DATABASE_URL`), skip nếu chưa cấu hình.
- Tool calls đọc DB thật; provider mock; timeout/error paths.
- Rate limit + feature flag.
- Không gọi provider thật mặc định.

### 11.3 E2E (Playwright — đã có dependency)

- Mở Assistant từ nav.
- Hỏi entity → mở đúng champion/item page.
- Hỏi comp từ champion → mở đúng comp detail.
- Câu hỏi thiếu entity → clarification.
- Hỏi win rate → trả stats MetaTFT từ `lib/meta.json`.
- Lỗi 429/503 → retry UI.
- Mobile 390px + keyboard navigation.
- Vi + En copy.

### 11.4 Eval dataset

`server/src/assistant/eval/coach-cases.jsonl`, 32 case coach (strategy/comp/mechanics/meta/entity/safety, VI+EN):

- `expect` hỗ trợ thêm `intent` và `mode` (deterministic/llm), kiểm tra cùng status/contains/matches/forbidden/sources.
- Runner nhận `--file=./coach-cases.jsonl`, `--only=id1,id2`, `--limit=N`.
- Baseline lần chạy gần nhất: **32/32 pass**, deterministic 26/26, LLM 6/6, avg ~12.9s trên M2 16GB (memory pressure).
- Vòng tự kiểm thử đã tìm và sửa: EN “best S-tier reroll comps” bị route mechanics; câu strategy thiếu state bị trả unsupported thay vì hỏi lại; “strongest/easiest comp” không route comp; goal “top 4” bị meta_query cướp intent; XP 7→8 cập nhật 56 theo bảng tftflow.

`server/src/assistant/eval/accuracy-cases.jsonl`, 53 case (gồm Wisp và kinh tế VI):

- Entity lookup EN/VI, alias, sai dấu, viết tắt.
- Comp lookup theo tên/slug.
- Recommendation theo champion/item/component/augment.
- So sánh comp.
- Ambiguous entity.
- Set/patch khác.
- Statistic không tồn tại.
- Câu hỏi ngoài phạm vi.
- Prompt injection trong user message.
- Nguồn/ID không tồn tại.

Runner `eval/run.ts` dùng deterministic mock provider + kiểm tra:

- tool/entity accuracy
- recommendation validity (comp ID tồn tại, đúng set/patch)
- source validity (chỉ source có trong evidence)
- status correctness
- unsupported claim rate (rule-based cho các pattern số liệu)
- latency/token usage (live mode)

RAG retrieval eval: `server/src/assistant/eval/rag-cases.jsonl`, 32 positive + 4 negative, labels là chunk ID. Runner `eval/rag.ts` kiểm tra label tồn tại/đúng ngôn ngữ, hit@1/3/5, MRR@10 và negative accuracy. Baseline hiện tại: hit@1 84.4%, hit@3 100%, hit@5 100%, MRR 0.917, negative 100%.

### 11.5 Release gates

- Không trả entity/comp ID không tồn tại.
- Không trả win rate/avg/top4 khi không có stats trong evidence.
- Không trả source ngoài evidence.
- Không lộ secret/prompt/stack trace.
- Unit test + e2e pass; eval baseline được ghi lại.
- Manual review 10 câu TFT tiêu biểu (EN + VI) trước public.

---

## 12. Milestones

### M1 — Domain tools + entity resolution (đã xong)

- Thêm `entities.ts`, `static-game-data.ts`, `tools.ts`, `ranking.ts`, `contracts.ts`.
- Thêm meta provenance keys vào pipeline/seed.
- Unit tests cho tools/ranking/entities.
- Không endpoint, không UI, không dependency.

**Acceptance:** tools trả dữ liệu thật; stable IDs; entity ambiguous xử lý đúng; ranking deterministic; tests pass; `npx tsc --noEmit` (root) pass.

**Trạng thái:** đã thêm catalog/alias/normalization, static `lib/tft.json` adapter, read-only tools, ranking, provenance keys; 13 `node:test` pass; `npm run typecheck` pass. `findCompsByEntities` đã chạy thật với DB (Ahri → 2 comp).

### M2 — Assistant MVP (ước tính 2–4 ngày, phụ thuộc tốc độ Qwen3.5 local)

- Endpoint `POST /api/assistant/query`, `POST /api/assistant/feedback`.
- Ollama/Qwen3.5 adapter + prompt + validator + fallback deterministic.
- Rate limit, timeout, structured logs.
- Trang `/[lang]/assistant` + nav link + comp panel button + messages.
- E2E + eval baseline.
- Feature flag.

**Acceptance:** user hỏi entity/comp nhận câu trả lời từ tool thật; mở được trang chi tiết; thiếu dữ liệu → nói rõ; không có stats bịa; lỗi Ollama/model có fallback/retry.

**Trạng thái:** endpoint `/api/assistant/query` + `/feedback`, orchestrator, Ollama adapter, validator, structured logs, rate limit, feature flag, trang `/[lang]/assistant`, nav/comp-panel entry points và sitemap đã xong. 33 unit tests pass; `npm run typecheck`, `npm run build`, `npm run test:e2e` (3 spec) và `npm run test:eval` (33/33 case) pass. Item/emblem lookup now derives the granted trait, includes trait breakpoints and comps using the item. Generic mechanics questions use semantic topic matching from `lib/mechanics-knowledge.json`; general stable rules are localized and only added when mechanics evidence exists, while set-specific rules come from the matched set/patch and cite `mechanics:set<id>`. Đã test Playwright thủ công EN/VI desktop + mobile, comp context và feedback.

### M3 — Comp Finder (ước tính 2–3 ngày)

- Form chọn champion/item/augment + preference.
- Gọi `findCompsByEntities`; hiển thị score breakdown, matched entities, limitations.
- Thêm entry point ở champion/item/augment detail.
- E2E cho recommendation.

### M4 — Knowledge retrieval (đang chuẩn bị)

- Đã build `knowledge/chunks.jsonl` (184 chunks/29 sources) + manifest với stable ID, source, set/patch, language, checksum.
- Đã có BM25 baseline `server/src/assistant/retrieval.ts` và RAG eval 32 positive + 4 negative; hit@5 100%, MRR 0.917.
- Chưa wire retrieval vào orchestrator; chưa thêm vector DB.
- Còn: xác nhận quyền dùng guides/tips, per-rule citation, prompt-injection tests cho retrieved text, source conflict handling. Chỉ thêm pgvector nếu BM25 eval không đủ.

### M5 — Meta analytics (tùy chọn)

- Lưu snapshot MetaTFT vào DB (`comp_stats`, `meta_snapshots`) với sample size, queue, cluster, patch, source.
- Stats MetaTFT đang đọc trực tiếp từ `lib/meta.json`; có thể chuyển sang DB snapshot sau nếu cần lịch sử.

### M6 — Hardening/release

- Load test rate limit; cost review; a11y; responsive.
- Runbook Ollama outage/model load failure/data failure/rollback.
- Riot policy + third-party license review.
- Feedback dashboard tối thiểu (log-based) và post-release monitoring.

---

## 13. Files dự kiến thay đổi

### Thêm mới

| File | Mục đích | Milestone |
|---|---|---|
| `server/src/assistant/contracts.ts` | types + validate request/response | M1 |
| `server/src/assistant/entities.ts` | catalog/alias/normalization/stable IDs | M1 |
| `server/src/assistant/static-game-data.ts` | đọc `lib/tft.json` read-only | M1 |
| `server/src/assistant/tools.ts` | read-only domain tools | M1 |
| `server/src/assistant/ranking.ts` | scoring deterministic | M1 |
| `server/tsconfig.json` | typecheck server độc lập | M1 |
| `server/src/assistant/orchestrator.ts` | intent/tool/evidence | M2 |
| `server/src/assistant/prompt.ts` | system prompt/evidence format | M2 |
| `server/src/assistant/mechanics-knowledge.ts` | semantic matcher + localized general primer | M2 |
| `lib/mechanics-knowledge.json` | versioned general/set mechanics corpus | M2 |
| `server/src/assistant/provider.ts` | Ollama Qwen3.5 adapter | M2 |
| `server/src/assistant/validate.ts` | output/source/recommendation validation | M2 |
| `server/src/assistant/logger.ts` | structured logs/requestId | M2 |
| `server/src/assistant/rate-limit.ts` | rate limit/request cap | M2 |
| `server/src/assistant/index.ts` | Express router | M2 |
| `server/src/assistant/*.test.ts` | unit tests | M1–M2 |
| `server/src/assistant/eval/cases.jsonl` | eval dataset | M2 |
| `server/src/assistant/eval/run.ts` | eval runner | M2 |
| `server/src/assistant/eval/build-knowledge.ts` | build chunks/manifest từ seeds + mechanics JSON | M4 |
| `server/src/assistant/eval/rag-cases.jsonl` | RAG retrieval eval dataset | M4 |
| `server/src/assistant/eval/rag.ts` | RAG retrieval eval runner | M4 |
| `knowledge/chunks.jsonl`, `knowledge/manifest.json` | generated corpus + provenance | M4 |
| `server/src/assistant/retrieval.ts` | BM25 retrieval baseline | M4 |
| `knowledge/README.md` | corpus schema/build/eval workflow | M4 |
| `components/assistant/assistant-chat.tsx` | chat UI | M2 |
| `app/[lang]/assistant/page.tsx` | assistant route | M2 |
| `tests/assistant.spec.ts` | Playwright e2e | M2 |
| `playwright.config.ts` | e2e config (nếu chưa có) | M2 |
| `.env.example` (root/server) | documented env names, no secrets | M2 |

### Sửa

| File | Thay đổi | Milestone |
|---|---|---|
| `server/src/index.ts` | mount `/api/assistant` router | M2 |
| `server/package.json` | scripts `test`, `typecheck`, `eval`, `build:knowledge`, `test:rag` | M1–M4 |
| `package.json` | scripts `typecheck`, `test:e2e` | M2 |
| `components/nav.tsx` | link Assistant | M2 |
| `components/comp-panel.tsx` | nút Ask about this comp | M2 |
| `lib/messages.ts` | copy assistant en/vi | M2 |
| `lib/api.ts` | assistant request/response types | M2 |
| `app/sitemap.ts` | route assistant | M2 |
| `server/seed/seed.ts` | ghi meta provenance keys | M1 |
| `server/seed/tftacademy-source.json` | sidecar `retrievedAt` do script tạo | M1 |
| script tips (repo crawler) | ghi sidecar timestamp | M1 |

### Không thay đổi trong MVP

- `server/src/schema.sql` (không migration).
- Các trang comp/champion/item hiện có (chỉ thêm link/button).
- Search hiện có, builder, tier-maker, quiz.
- `lib/meta.json` / `lib/tft.json` format.

---

## 14. Open decisions cần chốt trước M2

1. **Model size/quantization**: đã chốt `qwen3.5:9b` (~6.6GB). Smoke test: load 15.1s, sinh 2 token trong 0.08s. Chỉ đổi `9b-mlx`/`4b` nếu latency thực tế của endpoint cao. Context mặc định 8192.
2. **Quyền sử dụng TFT Academy/MetaTFT content**: đã chốt — chủ dự án cho phép dùng nội dung public (2026-10-21). Vẫn cần attribution và Riot product registration trước public release.
3. **Public hay beta nội bộ**: feature flag + admin cookie beta, hay mở nav cho tất cả.
4. **Conversation persistence**: MVP stateless (đề xuất). Nếu cần lịch sử, phải thêm bảng + owner token + retention.
5. **Ngôn ngữ trả lời**: tiếng Việt/Anh theo UI; entity name giữ EN hoặc nameVi + EN trong ngoặc. Đề xuất nameVi + EN khi có.
6. **Có cần `getMechanics` trong MVP không**: đề xuất không; để M4 cùng RAG.

---

## 15. M0 acceptance checklist

- [x] Đọc spec, package manifests, routes, schema, data pipelines, test setup.
- [x] Vẽ data flow thực tế (Next → rewrite → Express → Postgres; scripts → seed → DB).
- [x] Liệt kê domain models/API tái sử dụng (`listComps`, `getMeta`, `lib/tft.json`, `lib/tips.ts`).
- [x] Kiểm tra độ đầy đủ dữ liệu comp/champion/item/trait/augment/patch.
- [x] Xác nhận không có AI/backend stack sẵn có, không có test/CI.
- [x] Ghi quyết định orchestration: Express hiện có; backend-controlled tools; không service mới.
- [x] Gap analysis data/backend/UI/evals/sources.
- [x] Kế hoạch thay đổi nhỏ nhất, không thêm dependency/migration “chuẩn bị trước”.
- [x] Liệt kê files, test plan, risks, milestones.
