# Assistant LLM — bản đồ luồng trả lời cho agent (MetaBoard / tft-comps)

Tài liệu này **không quyết định gì mới** — nó ghi lại chính xác luồng xử lý đã được code của
Coach AI (Tomo), từng nhánh điều kiện và nơi xử lý, để agent đọc hiểu và phân tích mà không
phải đoán. Mọi mốc đều dẫn về hàm thật; khi code đổi, cập nhật doc này theo.

**Trạng thái (2026-10-27):** khớp commit sau `47fa3c8` (thêm: streaming gate, dataVersions, rule sample size, bộ regression cases `eval/regression-cases.jsonl`). Provider mặc định qua biến
`ASSISTANT_PROVIDER` (google | openai-compatible | ollama); tool loop 7 tool;
evidence tĩnh gồm build comp + build theo winrate thật + holder/usage của item.

## Mục lục

1. [Bản đồ tổng thể](#1-bản-đồ-tổng-thể)
2. [Điểm vào HTTP](#2-điểm-vào-http--assistantindexts)
3. [Tiền xử lý trong answerAssistant](#3-tiền-xử-lý--orchestratorts--answerassistant)
4. [Resolve mention & follow-up](#4-resolve-mention--follow-up)
5. [detectIntent — bảng nhánh](#5-detectintent--bảng-nhánh)
6. [Gates trước evidence](#6-gates-trước-evidence)
7. [Lắp evidence](#7-lắp-evidence)
8. [Tool loop](#8-tool-loop)
9. [Câu trả lời deterministic & canUseLlm](#9-câu-trả-lời-deterministic--canusellm)
10. [Lần gọi LLM cuối & validate](#10-lần-gọi-llm-cuối--validate)
11. [Provider layer](#11-provider-layer--providerts)
12. [Quan sát & trace](#12-quan-sát--trace)
13. [Biến cấu hình](#13-biến-cấu-hình)

---

## 1. Bản đồ tổng thể

```
POST /api/assistant/query  (index.ts)
  └─ rate limit → SSE hoặc JSON
  └─ answerAssistant(request, signal, {logReasoningStep, onAnswerDelta})
       ├─ 0. lọc prompt injection trong history
       ├─ 1. load dữ liệu: meta, catalog, comps, metaStats   (song song)
       ├─ 2. resolve context entities/compSlug  → AssistantContextError nếu sai
       ├─ 3. isPromptInjection(message)         → trả lời từ chối
       ├─ 4. tomoPersonaReply                   → chào hỏi/persona (deterministic)
       ├─ 5. resolve mention (entity/comp) + follow-up + carried comps
       ├─ 6. detectIntent (+ override wantsReferenceData)
       ├─ 7. gates: trùng tên → needs_clarification; unsupported → trả lời sốc
       ├─ 8. strategy_analysis → deterministic plan (nếu parse được)
       ├─ 9. chọn selectedEntities/selectedComps + needs_clarification nhiều entity
       ├─ 10. lắp evidence (entity, comps, builds, holders, usage, stats, mechanics)
       ├─ 11. tool loop (chỉ một số trigger) → toolResults + ghi đè intent
       ├─ 12. deterministicAnswer(intent) + canUseLlm check
       ├─ 13. LLM tổng hợp → parseGeneratedAnswer → ungroundedNumbers gate
       └─ 14. fallback deterministic ở mọi bước hỏng
```

File chính:

| File | Vai trò |
|---|---|
| `apps/api/src/assistant/index.ts` | Route HTTP, SSE, rate limit, persist, error mapping |
| `apps/api/src/assistant/orchestrator.ts` | Toàn bộ pipeline (hàm chính `answerAssistant`) |
| `apps/api/src/assistant/prompt.ts` | `buildSystemPrompt`, `buildUserPrompt`, `buildToolPlannerPrompt`, `buildToolAgentPrompt`, `evidenceBody`, `compactComp/compactEntity` |
| `apps/api/src/assistant/tool-registry.ts` | `ASSISTANT_TOOLS` + `executeAssistantTool` (7 tool) |
| `apps/api/src/assistant/tool-loop.ts` | `runToolLoop` — vòng gọi tool có giới hạn |
| `apps/api/src/assistant/provider.ts` | 3 provider (google / openai-compatible / ollama), retry, streaming |
| `apps/api/src/assistant/validate.ts` | `parseGeneratedAnswer` — validate JSON trả về |
| `apps/api/src/assistant/entities.ts` | Catalog, `findEntityMentions`, `localizedName`, `localizeEntityNames` |
| `apps/api/src/assistant/strategy.ts` | `isStrategyQuestion`, `analyzeStrategy`, `buildStrategyPlan` |
| `apps/api/src/assistant/mechanics-knowledge.ts` | `isMechanicsQuestion`, `mechanicsFor` (topics tĩnh) |
| `apps/api/src/assistant/meta-stats.ts` | Số liệu MetaBoard (`meta.json`) + `unitBuildStats`, `itemUsageStats` |
| `apps/api/src/assistant/reasoning` → `assistant-reasoning-store.ts` | Ghi trace `assistant_reasoning_logs` |

---

## 2. Điểm vào HTTP — `assistant/index.ts`

- Route nhận `AssistantQueryInput` (`message`, `lang`, `history`, `context{entityIds, compSlug}`),
  sinh `requestId` + `conversationId`, gắn `AbortController` (client ngắt connection → abort).
- **Rate limit** `checkRateLimit` (`rate-limit.ts`): theo `clientId(req)` (client/IP, không phải
  conversation), mặc định `ASSISTANT_RATE_LIMIT=12` request/phút và `ASSISTANT_DAILY_REQUESTS=200`
  /ngày; vượt → HTTP 429 kèm `Retry-After`.
- **Streaming**: nếu client yêu cầu SSE → header `text/event-stream`, sự kiện `delta` (text prose
  của trường `answer` khi đang sinh) rồi `final` (response đầy đủ); keepalive `: ping` mỗi 5s.
  Non-streaming → JSON một lần.
- `writeReasoningLog = createReasoningLogWriter(conversationId, requestId)` — mọi bước ghi vào
  `assistant_reasoning_logs` kiểu **fire-and-forget** (`void insert(...).catch(...)`,
  `assistant-reasoning-store.ts`), lỗi insert chỉ log, không bao giờ làm hỏng câu trả lời.
- Sau khi có response: `persistMessages` (lưu conversation) và `captureUnresolvedEntityMentions`
  (thu mention không resolve được) chạy nền, không chặn.
- **Error mapping** (`providerStatus`): `AssistantContextError` → 400 `invalid_context`;
  `ProviderError` code `aborted` → 499 `client_closed_request`, `timeout` → 504 `provider_timeout`,
  `unavailable` → 503 `assistant_unavailable`, còn lại → 502 `provider_error`;
  streaming mode gửi event `error` thay vì status code.

## 3. Tiền xử lý — `orchestrator.ts · answerAssistant()`

Thứ tự cứng, nhánh nào khớp dừng ngay:

1. **Deps**: `generate` (mặc định `generateAssistantAnswer`), `logReasoningStep` (mặc định noop), `onAnswerDelta`.
2. **Lọc history**: bỏ entry history khớp `isPromptInjection` — history do client gửi, không tin.
3. **Load dữ liệu song song**: `getActiveSetAndPatch` (meta DB), `loadCatalog` (tft.json + alias DB,
   cache), `listComps(undefined, lang)` (toàn bộ comp trong DB, localize theo lang, cache), `loadMetaStats` (meta.json).
4. **Context**: `request.context.entityIds` / `compSlug` resolve thành `contextEntities`/`contextComps`;
   id sai → throw `AssistantContextError`.
5. **Prompt injection trên message** (`isPromptInjection`): regex ignore/disregard/system prompt/
   jailbreak (en + vi) → trả câu từ chối cứng, intent `unsupported_or_unknown`, mode deterministic.
6. **Persona** (`tomoPersonaReply`): chào ngắn (≤5 từ), "bạn là ai", "làm được gì" → trả lời
   in-character deterministic, không gọi LLM, không đi tiếp pipeline.

## 4. Resolve mention & follow-up

- `findEntityMentions(catalog, text)` — khớp tên/alias (đã normalize bỏ dấu), gồm `nameVi`;
  `findCompMentions(comps, text, compAliases)` — alias comp: exact + subsequence ≥3 từ
  (`findCompMentions` trong orchestrator.ts).
- **Nếu không thấy mention nào** → `resolveFollowUpText(message, history)`:
  - `isFollowUpQuestion` khớp (regex: `what about|it|this|that|comp nay|cái này|con gì|thì sao|nếu không|...`)
    → **ghép với user message gần nhất** trong history.
  - Câu quyết định trần ("nên roll hay lên cấp" — `BARE_DECISION_QUESTION`) không chứa số
    → ghép với user message gần nhất **có chứa số** (state: vàng/HP/cấp).
  - Còn lại giữ nguyên message.
  Sau khi ghép, resolve lại mention trên văn bản mới.
- **`carryOverComps`**: follow-up không nêu comp → tìm comp trong **câu trả lời assistant gần nhất**
  (tối đa 2 comp) — "còn items?" hiểu là items của comp vừa nói.
- Dedupe: `entities` (theo type+name+rarity), `mentionedComps` (theo slug).

## 5. detectIntent — bảng nhánh

`detectIntent(text, entities, comps, setId)` — `text` đã `normalizeSpaced` (thường về không dấu).
Thứ tự if — nhánh đầu trúng thắng:

| # | Điều kiện | Intent |
|---|---|---|
| 1 | `isStrategyQuestion` (marker chiến thuật + dạng câu hỏi + có state level/gold/HP/streak hoặc board context) | `strategy_analysis` |
| 2 | `hasMeta` (winrate/top4/placement...) + hỏi **định nghĩa** chỉ số, không có entity/comp | `gameplay_knowledge` |
| 3 | `hasMeta` | `meta_query` |
| 4 | `hasPatchChange` (patch/notes/buff/nerf; "trang bị" và item "Blue Buff" được loại trừ) | `patch_change` |
| 5 | hỏi set/patch hiện tại, không entity/comp | `set_patch` |
| 6 | `hasCompare` (so sánh/vs/khác nhau) | `comp_comparison` |
| 7 | có comps, không entity | `comp_search` |
| 8 | có entity + `hasRecommendation` (`RECOMMEND_WORD`/`HAVE_WORD`/`COMP_WORD`) — **trừ** follow-up phủ định (`NEGATED_ENTITY_USAGE`: "không chơi/dùng X", "not playing X") | `comp_recommendation` |
| 9 | có comps | `comp_search` |
| 10 | có entity | `hasLookup` ? `entity_lookup` : `gameplay_knowledge` |
| 11 | COMP_WORD + RECOMMEND_WORD + (style/tier S-A-B/"mạnh nhất"/difficulty) | `comp_recommendation` |
| 12 | `isMechanicsQuestion` (khớp topic trong `mechanics-knowledge.json` — 19 topic Set 18 + topic chung) | `gameplay_knowledge` |
| 13 | còn lại | `unsupported_or_unknown` |

**Override sau detectIntent**: `wantsReferenceData` (`REFERENCE_DATA_QUESTION` — bảng kinh tế/shop
odds/XP/pool/loot/augment odds/cashout/milestone/reward, en+vi) và intent là
`strategy_analysis|unsupported_or_unknown` → ép thành `gameplay_knowledge`.

`SIMPLE_INTENTS = ['entity_lookup', 'comp_search', 'gameplay_knowledge']` — dùng ở bước fallback
(§10): intent ngoài nhóm này mà provider lỗi thì **ném lỗi lên HTTP** thay vì fallback.

## 6. Gates trước evidence

1. **Trùng tên, nhiều id** (`entity_lookup|gameplay_knowledge|meta_query`): một tên normalize khớp
   nhiều entity khác id (ví dụ augment trùng tên khác rarity) → `needs_clarification` liệt kê lựa chọn.
2. **`unsupported_or_unknown`** → câu trả lời giới hạn năng lực (deterministic), nhưng vẫn có thể
   đi tool loop trước (§8) vì trigger gồm intent này.
3. **`strategy_analysis`** (không muốn reference data): `analyzeStrategy` parse được state →
   `buildStrategyPlan` trả deterministic; parse không được → đi tiếp pipeline như thường.

## 7. Lắp evidence

`selectedEntities`/`selectedComps` tinh chỉnh rồi các trường evidence được tính **trước tool loop**:

| Trường | Trigger | Nguồn |
|---|---|---|
| `mechanics` | intent `entity_lookup/gameplay_knowledge` + ≤1 entity + `isMechanicsQuestion` | `mechanicsFor` — rules tĩnh theo topic (tối đa 14 rule) |
| Hint 1 entity | >1 entity: câu hỏi có từ trang bị/augment/trait → ưu tiên non-champion; ngược lại ưu tiên champion | |
| `needs_clarification` nhiều entity | còn ≠1 entity và `!mechanics && !wantsReferenceData && !isFollowUpQuestion` | follow-up có history thì bỏ qua gate, để LLM tự hiểu |
| `relatedEntities` | 2 intent lookup | `grantedTrait` — trait mà emblem/granted item cấp |
| `championBuilds` | có champion + `CHAMPION_ITEM_QUESTION` (`trang bi|item|len do|build|core`) | comp chứa tướng (`compsUsingChampion` — match theo `name`/`nameVi`) + items gắn đúng slot tướng đó (`isCarry` đánh dấu) |
| `unitBuilds` | như trên | `unitBuildStats(meta)` — top 4 build theo **winrate thật** (count/avg/pick) + itemStats từng item |
| `itemHolders` | có item entity | comp dùng item (`compsUsingItems`) → unit nào cầm item đó |
| `itemUsage` | như trên | `itemUsageStats(meta)` — top 6 tướng cầm item kèm avg/top4/win/delta (delta so với trung bình tướng, âm = tốt) + winRate theo stage hoàn thành |
| `dataVersions` | luôn có | `{activePatch, statsPatch, mechanicsPatch}` — patch nguồn từng loại dữ liệu; system prompt bắt buộc gắn nhãn patch khi lệch nhau |
| `traitRosters` | có trait entity (2 intent lookup) | catalog champion nào mang trait đó (tên + cost, tối đa 12) — cho câu hỏi "Quái Rừng gồm những con nào" |
| `relatedComps` | 2 intent lookup | hợp `compsUsingChampion` (khi `wantsChampionContext`) ∪ `compsUsingItems`, dedupe slug, tối đa 3 |
| `stats` | mọi intent trừ meta_query có comp | `entityStats` (champion/item/augment) + `compStats` từ `meta.json` |
| `candidates` | `comp_recommendation` | `rankComps` — chấm điểm trùng champion/item/augment/style/difficulty, top 5 |
| `comparison` | `comp_comparison` | `compareComps`; thiếu 2 comp → `needs_clarification` ngay từ đây |

**Lưu ý quan trọng về evidence JSON gửi cho LLM** (`prompt.ts · evidenceBody`):
- `entities`/`relatedEntities` ≤3, `comps` ≤2, `relatedComps` ≤2, `championBuilds`/`itemHolders`/`unitBuilds`/`itemUsage` ≤6/3.
- Tên entity/item được **localize theo lang** qua callback `localizedName(catalog, name, lang)`.
- Text thô chứa tên (comp `tips`, `stages[].text`) được `localizeEntityNames(text, catalog, lang)`
  thay tên canonical bằng `nameVi` (thay tên dài trước, cache theo catalog) — vì bản dịch tips
  thường giữ tên tiếng Anh ("Dark Ritual" → "Tà Thuật").
- `compactComp` chế độ đầy đủ kèm items từng unit trên sân chính + early + alt; chế độ brief
  (relatedComps) chỉ tên unit + carry + augments cấp comp.

## 8. Tool loop

**Trigger** (`shouldTryTools`) — chỉ 4 trường hợp được gọi tool:

1. `wantsReferenceData` (bảng kinh tế/shop odds/loot/cashout/milestone/reward...),
2. intent `unsupported_or_unknown`,
3. `comp_recommendation` có nhắc tier S/A/B/C/X,
4. `meta_query` mà chưa có stats tĩnh nào.

Intent `entity_lookup`/`gameplay_knowledge` thường **không** gọi tool — dữ liệu đã bơm tĩnh (§7).

**`runToolLoop`** (`tool-loop.ts`):
- Vòng 1 dùng `buildToolPlannerPrompt` (ra quyết định gọi tool); từ vòng 2 dùng
  `buildToolAgentPrompt` (agent + system prompt đầy đủ). `maxOutputTokens=300`, format `json` từ vòng 2.
- Messages tích lũy: history + user message + (assistant + tool_calls) + tool results.
- **Giới hạn** (env-tunable): `ASSISTANT_MAX_TOOL_ROUNDS=3`, `ASSISTANT_MAX_TOOL_CALLS=5`,
  `ASSISTANT_MAX_TOOL_CALLS_PER_ROUND=2`, `ASSISTANT_TOOL_TIMEOUT_MS=15000`.
- Guard mỗi call: `invalid_arguments` (schema sai), `unknown_tool`, `repeated_call` (dedupe signature
  `tool:args`), `timeout`; tool message truncate 12.000 ký tự (env `ASSISTANT_TOOL_RESULT_CHARS`) —
  cap cũ 8k từng cắt cụt payload 9 bảng Coven (12.5k) khiến JSON đứt và model từ chối trả lời.
- `finalizeModel=false` (đúng như orchestrator gọi): **sau vòng đầu có kết quả là dừng**
  (`stopped='finalized'`) — model tổng hợp nằm ở bước §10, không tốn thêm vòng.
- 7 tool (`ASSISTANT_TOOLS`): `find_comps`, `search_comps`, `get_comp`, `compare_comps`, `get_stats`,
  `get_game_mechanics` (income/shop_odds/leveling/champion_pool/loot_tables/augment_odds — loot page
  ≤12 bảng trả nguyên bảng, lớn hơn trả index), `get_economy_plan`. Kết quả payload đã localize
  theo lang; tool trả `unresolved`/`ambiguous` khi không resolve được tên.

**Sau loop** — ladder ghi đè intent theo loại kết quả (ưu tiên từ trên xuống):

| Kết quả | Ghi đè |
|---|---|
| `comparison` | `comp_comparison` (+ selectedComps) |
| `candidates` | `comp_recommendation` (+ selectedEntities từ matchedEntities nếu trống) |
| `stats` | `meta_query` |
| `comps` | `comp_search` (candidates sinh từ comps, score 0) |
| chỉ `find_comps` | `comp_recommendation` |
| chỉ `get_stats` | `meta_query` |

`toolAmbiguous` từ loop → `needs_clarification` liệt kê lựa chọn. Lỗi loop (không phải abort/timeout)
→ log `tool_call` error và đi tiếp không tool.

## 9. Câu trả lời deterministic & canUseLlm

`deterministicAnswer(lang, intent, ...)` trả `{answer, status}` cho từng intent:

| Intent | Hành vi khi deterministic |
|---|---|
| `gameplay_knowledge` + mechanics + không entity/comp | `mechanicsAnswer` — ghép rules topic |
| `meta_query` | ghép entity + comp + stats; không có gì → `insufficient_data` |
| `patch_change` | `unsupported` — không có patch notes trong DB |
| `set_patch` | boilerplate set/patch; nếu hỏi "cơ chế" không có trong knowledge → trả "không tìm thấy cơ chế" (không dùng boilerplate) |
| `comp_recommendation` | 0 candidates → `insufficient_data`; có → top-1 + lý do + caveat "score chỉ đo trùng khớp" |
| `comp_comparison` | không có comparison → `needs_clarification`; có → tóm tắt điểm chung/carry |
| `comp_search` | 0 comp → `needs_clarification`; 1 comp → mô tả + stats; nhiều → liệt kê |
| `entity_lookup/gameplay_knowledge` | 0 entity → `needs_clarification`; có → `deterministicEntity` (champion: cost/traits/mana/ability; item: description/recipe; augment...) + "Được dùng trong..." + stats + mechanics |
| còn lại | `unsupported` |

`referenceAnswer` = ghép `summary` từ tool results `get_game_mechanics`/`get_economy_plan` thành công.

**`canUseLlm`** — điều kiện để LLM viết câu trả lời cuối:

```
intent ∉ {patch_change, unsupported_or_unknown, set_patch} (trừ khi có referenceAnswer)
AND (deterministic.status === 'answered' OR referenceAnswer)
AND !toolHasData            // toolHasData = tool ok + (candidates|comps|stats|comparison)
AND !(comp_recommendation && (candidates.length === 1 || không có entity))
```

Không đạt → trả deterministic luôn (`mode: 'deterministic'`), hết pipeline. Lý do thiết kế: khi
deterministic đã `insufficient_data`/`unsupported` thì không ép LLM bịa; khi tool đã trả dữ liệu
cấu trúc thì dùng chính dữ liệu đó.

## 10. Lần gọi LLM cuối & validate

1. **Tái dùng tool answer**: nếu `toolFinal` parse được (`parseGeneratedAnswer`) → bỏ lần gọi mới.
2. **Gọi LLM** qua `tracedGenerate('answer')` + `withInferenceSlot` (giới hạn
   `ASSISTANT_MAX_CONCURRENCY=2` lần gọi model đồng thời/instance). **Streaming gate**
   (`shouldStreamAnswer`): các nhánh mà validation thường ghi đè câu trả lời (`meta_query`,
   `comp_comparison`, `strategy_analysis`, `gameplay_knowledge` khi có mechanics) **không stream
   delta** — buffer tới khi validate xong để user không thấy số sai rồi bị thay; lookup và comp
   list stream bình thường:
   - `system` = `buildSystemPrompt(lang, evidence)`: persona Tomo, "chỉ dùng evidence JSON + game
     rules", cấm bịa số, quy tắc ranking/tier/preflight, ưu tiên `unitBuilds`/`championBuilds`/`itemUsage`,
     cảnh báo mẫu nhỏ (count thấp hơn hẳn các build khác → nêu giới hạn tin cậy thay vì khẳng định
     tốt nhất), yêu cầu JSON đầu ra `{"answer","sections","followUpQuestions","limitations"}`.
   - `messages` = history (role user/assistant) + user message chứa `buildUserPrompt` (evidence JSON
     đã localize) + `toolMessages` (toàn bộ hội thoại tool loop).
   - `maxOutputTokens=800`; nếu có `onAnswerDelta` → `createAnswerFieldStreamer` stream dần giá trị
     chuỗi của trường `"answer"` từ JSON đang sinh (parser tay, xử lý escape) → SSE `delta`.
3. **`parseGeneratedAnswer`** (`validate.ts`): JSON thuần hoặc fenced ```json```; **từ chối** nếu có key
   cấm (`winRate/top4/stats/...` — chặn model nhét số liệu thô); `answer` 1..4000 ký tự;
   `sections` ≤3 × ≤8 points; `followUpQuestions` ≤3; `limitations` ≤5 (mỗi mục ≤300 ký tự).
   Fail → fallback deterministic + limitation "câu trả lời tự động không hợp lệ".
4. **`ungroundedNumbers` gate** — chỉ khi `intent === 'gameplay_knowledge'` và có mechanics evidence:
   số xuất hiện trong answer/sections mà **không** tồn tại trong evidence JSON → fallback deterministic
   + limitation (chống model bịa số cơ chế).
5. **Thành công** → response mode `llm` với `answer` + `sections` + `followUpQuestions` từ model;
   `limitations` chỉ giữ những mục trùng với evidence limitations (model không được tự bịa caveat).
6. **Catch**: `ProviderError` code `unavailable` hoặc intent ngoài `SIMPLE_INTENTS` → **throw lên
   HTTP**; còn lại (timeout/lỗi mạng với intent đơn giản) → fallback deterministic + limitation ghi mã lỗi.

## 11. Provider layer — `provider.ts`

Chọn theo `ASSISTANT_PROVIDER`; mỗi lần gọi ghi event `attempt`/`retry` vào trace:

| Provider | Endpoint | Retry | Ghi chú |
|---|---|---|---|
| `google` | `generativelanguage.googleapis.com/v1beta` (Gemini native) | tối đa 3 lần, backoff 1s→2.5s, chỉ khi chưa stream; 429/5xx/JSON lỗi | `GOOGLE_API_KEY`, `GOOGLE_MODEL`; streaming SSE `streamGenerateContent?alt=sse` |
| `openai` | **bất kỳ** OpenAI-compatible gateway: `OPENAI_BASE_URL` + `OPENAI_API_KEY` + `OPENAI_MODEL` (vd shopaikey `/v1`, model `gpt-6-luna`) | tối đa 3 lần khi chưa stream và code `error` | function calling chuẩn OpenAI; streaming SSE |
| `ollama` | local `ASSISTANT_BASE_URL` | 2 lần, backoff 400ms | `ASSISTANT_MODEL` (vd `qwen3.5:9b`) |

Deadline chung `ASSISTANT_REQUEST_TIMEOUT_MS` (mặc định 90s) → `AbortSignal.timeout`; client abort
luôn thắng. Kết quả chuẩn hóa `ProviderResult {text, toolCalls, usage, model}`; lỗi chuẩn hóa
`ProviderError {code}`.

## 12. Quan sát & trace

Mỗi request ghi dãy step vào `assistant_reasoning_logs` (JSONB `details`, retention 30 ngày, xem tại
`/admin/assistant-reasoning`):

| Step | Ý nghĩa |
|---|---|
| `intent_detection` | intent + wantsReferenceData + số entity/comp; flag `promptInjection`/`persona` |
| `entity_resolution` | entityIds, compSlugs, carriedComps |
| `tool_call` | mỗi lần gọi tool (args, ok/error code, duration) + tổng kết loop (`stopped/rounds/calls`) |
| `llm_generation` | `phase=request` (system fingerprint SHA-256 + preview 400 ký tự, messages truncate 8k), `attempt`/`retry`, `phase=response` (text truncate 20k + usage), `phase=error` |
| `validation` | pass/fail parse, `ungrounded_numbers` |
| `fallback` / `deterministic_answer` | nguồn câu trả lời cuối + lý do |

`assistantLog` (stdout JSON) song song: `query`, `tool_call`, `tool_loop`, `provider_usage`
(input/output tokens, duration), `provider_retry`, `invalid_answer`, `query_error`.

## 13. Biến cấu hình

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `ASSISTANT_PROVIDER` | `ollama` | google / openai / ollama |
| `ASSISTANT_MODEL`, `OPENAI_MODEL`, `GOOGLE_MODEL` | — | model theo provider |
| `OPENAI_BASE_URL`, `OPENAI_API_KEY` | — | gateway OpenAI-compatible |
| `ASSISTANT_RATE_LIMIT` | 12 | request/phút/conversation |
| `ASSISTANT_DAILY_REQUESTS` | 200 | cap ngày/conversation |
| `ASSISTANT_MAX_CONCURRENCY` | 2 | slot gọi model đồng thời/instance |
| `ASSISTANT_MAX_TOOL_ROUNDS` / `MAX_TOOL_CALLS` / `MAX_TOOL_CALLS_PER_ROUND` | 3 / 5 / 2 | trần tool loop |
| `ASSISTANT_TOOL_TIMEOUT_MS` | 15000 | timeout một tool |
| `ASSISTANT_TOOL_RESULT_CHARS` | 12000 | trần ký tự một tool message trong context |
| `ASSISTANT_REQUEST_TIMEOUT_MS` | 90000 | deadline provider |
| `TTS_*`, `STT_*` | — | voice pipeline — xem `docs/ai-assistant/voice.md` |

---

## Phụ lục — hai ví dụ trace

**"Akali nên lên trang bị gì"** (provider=openai/gpt-6-luna):
`intent_detection` (entity_lookup, entity `champion:...Akali`) → evidence: `championBuilds` (comp
Camille & Akali Mặt Trời, isCarry) + `unitBuilds` (build #1 3.557 trận avg 4,58) → **không tool loop**
→ LLM answer 1 message → validation pass → mode `llm`.

**"Coven nên nổ hũ mốc bao nhiêu, mốc đó có phần thưởng gì?"**:
`intent_detection` (gameplay_knowledge) → `wantsReferenceData=true` (khớp "nổ hũ") → **tool loop**:
planner gọi `get_game_mechanics{table:loot_tables, slug:coven}` (1 call, `finalized`) → toolResults
chứa 9 bảng Thu hoạch → canUseLlm → LLM answer (3 messages) → validation pass → mode `llm`,
intent giữ `gameplay_knowledge` (không bị ladder ghi đè vì không có candidates/stats/comps).
