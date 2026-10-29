# Voice: nhận dạng giọng nói (STT) và đọc câu trả lời (TTS) của Coach AI

> Cập nhật: 2026-10-29. Số liệu STT là số đo thực tế trên môi trường dev
> (macOS arm64, API Node 22). **Ngôn ngữ nói/thống được lấy từ request** (`lang`),
> không phải từ cấu hình deployment: tiếng Việt dùng `STT_LANGUAGE` cho STT và
> engine chọn bằng `TTS_PROVIDER` (`deepgram` mặc định hoặc `vieneu`) cho TTS;
> tiếng Anh dùng `language=en` cho STT và Deepgram Aura-2 `/v1/speak` cho TTS
> (không có engine thứ hai vì VieNeu chỉ nói tiếng Việt). Không còn fallback Web
> Speech API cho cả hai ngôn ngữ.

## 1. Luồng tổng thể

```
┌─ Trình duyệt (assistant-chat.tsx) ──────────────────────────────────────┐
│  Mic → AudioWorklet (audio-capture-processor.js)                        │
│      → Float32 mono @ device rate, tối đa 60 giây                       │
│      → resample về 16 kHz (OfflineAudioContext)                         │
│      → POST /api/voice/transcribe  (octet-stream, X-Sample-Rate: 16000, │
│              X-Language: en | vi, X-Request-Key, cookie mb_session)     │
│  Nhận { text, turnId } → ghép vào input → POST /api/assistant/query     │
│              kèm voiceTurnId=turnId (dùng lại lượt chat đã giữ chỗ)     │
│      → answer → GET /api/voice/tts/status?lang=…  (cache 60 s theo lang)  │
│      → enforced: GET /tts/plan?requestId → { version, chunks }           │
│                  → POST /tts/speech { requestId, version, chunk, lang }  │
│                    kèm X-Request-Key của lượt phát                       │
│      → chưa enforced: spokenText()/chunkForSpeech() → { input, lang }    │
│      → phát tuần tự, prefetch trước 1 chunk                              │
│      → không available / lỗi: hiện voiceSpeechError, không đọc           │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─ API (apps/api/src/voice.ts) ───────────────────────────────────────────┐
│  /transcribe: session → entitlement → reserve STT seconds + 1 chat unit │
│  STT language: X-Language: en → language=en; còn lại → STT_LANGUAGE (vi)│
│  STT failover: deepgram → groq → elevenlabs → openai → gemini           │
│  /tts/plan: session → entitlement (TTS > 0) → answer đã lưu của         │
│             requestId thuộc account → { version: sha256, chunks }       │
│  /tts/speech enforced: reserve tts_characters của chunk server tự chia  │
│  /tts/speech chưa enforced: nhận { input } như trước, không ghi ledger  │
│  TTS vi: engine theo TTS_PROVIDER (deepgram | vieneu) → engine còn lại  │
│  TTS en: Deepgram Aura-2 trên /v1/speak, không có engine thứ hai        │
│  slot dùng chung; audio trả về đúng Content-Type engine                 │
│  (wav/mp3/pcm/opus); lỗi/timeout → 429/502/503/504 cho client báo lỗi   │
└─────────────────────────────────────────────────────────────────────────┘
```

File liên quan:

| File | Vai trò |
| --- | --- |
| `apps/api/src/voice.ts` | Routes `/api/voice/*`, chọn provider STT, gọi API đám mây, TTS theo `TTS_PROVIDER` + engine dự phòng |
| `apps/web/components/assistant/assistant-chat.tsx` | Ghi âm, resample, gọi transcribe, pipeline phát audio theo chunk (không còn Web Speech) |
| `packages/shared/src/speech-text.ts` | Một định nghĩa `spokenText()`/`chunkForSpeech()` dùng chung cho API và web (task #85) |
| `apps/web/lib/speech.ts` | Re-export hai hàm trên cho client |
| `apps/web/public/audio-capture-processor.js` | AudioWorklet thu PCM thô từ mic |
| `apps/web/components/admin/alias-manager.tsx` | Mic test trong Admin → Aliases (dùng chung `/transcribe`) |
| `apps/api/src/voice.test.ts` | Unit test WAV encoder + logic chọn provider STT |
| `apps/api/src/voice-quota.test.ts` | Auth, entitlement, voice turn và TTS plan/speech trên PostgreSQL thật (task #84-#85) |

Cấu hình STT qua biến môi trường trong `apps/api/.env` (mẫu đầy đủ ở
`apps/api/.env.example`).

---

## 2. STT — nhận dạng giọng nói (vi và en)

### 2.1 Provider và chuỗi failover

Khi không đặt `STT_PROVIDER`, API dựng danh sách provider **có key** theo thứ tự
đã đo (xem `apps/api/scripts/stt-bench.mjs`) và đi hết danh sách đó cho mỗi lượt
nói, thay vì chỉ thử một provider:

Ngôn ngữ gửi lên provider lấy từ request, không phải từ deployment: header
`X-Language: en` → `language=en` trên mọi provider trong chain, mọi giá trị khác
→ `STT_LANGUAGE` (mặc định `vi`). Trước đây chuỗi ghim `STT_LANGUAGE` cho tất cả
lượt nên người dùng tiếng Anh phải dựa vào Web Speech API của trình duyệt; giờ
một đường server duy nhất phục vụ cả hai locale. Ngoại lệ: Gemini không nhận tham
số ngôn ngữ (nó được prompt "transcribe in its original language").

| # | Provider | Key | Model mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| 1 | Deepgram | `DEEPGRAM_API_KEY` | `nova-3` | WER tiếng Việt tốt nhất (0.063 trên clip 14 s), không thấy trần quota khi đo; tính tiền theo phút audio |
| 2 | Groq | `GROQ_API_KEY` | `whisper-large-v3-turbo` | Fast tier miễn phí, trả lời nhanh nhất; free tier 20 request/phút |
| 3 | ElevenLabs Scribe | `ELEVENLABS_API_KEY` | `scribe_v2` | WER tốt nhưng ~$0.40/giờ audio |
| 4 | OpenAI | `OPENAI_API_KEY` | `gpt-4o-transcribe` | Hỗ trợ `STT_OPENAI_BASE_URL` cho gateway khác |
| 5 | Google Gemini | `GOOGLE_API_KEY` | `gemini-3.1-flash-lite` | Dùng lại key LLM; free tier RPM thấp và **tự sửa lời nói** (đổi đại từ) — để cuối |
| — | OpenRouter | `OPENROUTER_API_KEY` | `openai/whisper-large-v3-turbo` | **Không tự vào chain**: cùng key với LLM nhưng endpoint audio cần số dư riêng ($0.50) → luôn 402. Đặt `STT_PROVIDER=openrouter` khi đã nạp tiền |

Cơ chế failover (`transcribeWithFailover` trong `apps/api/src/voice.ts`):

- Provider trả **429** → được cho vào thời gian chờ `STT_BUSY_COOLDOWN_MS` (mặc
  định 30 s, tôn trọng header `Retry-After` nếu ngắn hơn trần đó) rồi chuyển
  sang provider kế tiếp ngay trong cùng lượt nói.
- Provider trả **401/402/403** (key sai, hết tiền, bị chặn) → chờ cố định 60 s;
  lỗi kiểu này không tự hết nên không thử lại mỗi lượt.
- Toàn bộ provider đang chờ → `429 transcription_busy` cho client, và client
  hint người dùng thử lại sau. Không còn đường offline nào: hết key cloud là hết STT.
- Đặt `STT_PROVIDER=deepgram|groq|elevenlabs|openai|gemini|openrouter`
  để ép một provider (ép provider không có key → `stt_not_configured`).
- `GET /api/voice/status` trả `providers: [{ provider, coolingDown }]` để nhìn
  thấy cả chain và vendor nào đang chờ; `provider` là đầu chain.
- Response của `/transcribe` kèm header `X-STT-Provider` cho biết vendor nào
  thực sự trả lời lượt đó.

### 2.2 Ràng buộc dữ liệu gửi lên `/api/voice/transcribe`

- Phải có session (`mb_session`): route tự resolve user, nên gọi thẳng từ script
  cũng không mượn được quota của ai (401 `unauthenticated`). Voice là quyền của
  Plus: Free trả 403 `feature_locked` trước khi provider được gọi. Khi
  `MEMBERSHIP_ENFORCEMENT` chưa bật (production hiện tại), các gate này không chạy
  và clip được transcribe như trước #84 — không có ledger để trừ.
- Body: Float32 little-endian mono 16 kHz, tối đa 60 giây (4 MB).
- Header bắt buộc: `X-Sample-Rate: 16000`. Tuỳ chọn: `X-Language: en|vi` (khác
  `en` đều được hiểu là `vi`), `X-Request-Key` (8-64 ký tự `[A-Za-z0-9_-]`, client
  mint mỗi lần ghi âm; thiếu thì server tự sinh UUID).
- Gate RMS < 0.001 → `422 no_speech` **trước khi** gọi provider (chặn luôn hiện
  tượng hallucination trên audio im lặng của model cloud).
- Text rỗng hoặc không có chữ/số → `422 no_speech`; lượt chat và số giây đã giữ
  chỗ được trả lại.
- Số giây tính từ `sampleCount / 16000` làm tròn lên; không có header duration để
  client khai. Vượt `max_stt_seconds_per_request` của gói → 413 `audio_too_long`
  trước khi ghi ledger.

### 2.3 Voice turn — một lần nói, một lượt chat

Một voice turn là một lượt chat có thêm bước transcribe, nên nó ghi hai dòng
`usage_requests` trong cùng transaction-reserve (task #84):

1. `stt_transcribe`, reserve `stt_seconds`, `markDispatched` rồi mới gọi vendor;
   settle ngay sau khi vendor trả lời — số giây đứng kể cả khi câu hỏi sau đó thất bại.
2. `coach_turn`, reserve `chat: 1` với TTL 5 phút. Response trả `turnId`; query
   kế tiếp gửi `voiceTurnId` và route claim đúng dòng đó (`reserved → dispatched`),
   nên không có lượt chat thứ hai. Khi transcript về, TTL được rút còn 60 giây:
   người dùng không gửi câu hỏi thì lượt được trả lại nhanh.

Hệ quả đã kiểm trong `voice-quota.test.ts`:

- Hai client cùng gửi `voiceTurnId` chỉ một bên thắng claim; bên kia nhận 409
  `request_in_progress` và không ghi dòng nào.
- `voiceTurnId` của account khác không claim được (route lọc theo `user_id`), bên
  kia tự trả bằng lượt của mình.
- Cùng `X-Request-Key` + cùng clip → 409 `already_answered`, vendor chỉ bị gọi
  một lần; cùng key nhưng clip khác → `request_conflict`.
- Vendor lỗi/hết giờ → cả hai dòng `released`, attempt vẫn nằm trong
  `usage_attempts`; transcript rỗng → trả cả hai, 422 `no_speech`.
- Lượt bị bỏ quên được release ngay ở request kế tiếp của account
  (`releaseExpiredTurns`) và bởi sweeper `reconcileStale` mỗi 60 giây, nên không
  chiếm slot `max_concurrent_requests`.

### 2.4 Độ trễ đo thực tế

Qua `POST /api/voice/transcribe` trên máy dev, audio 3.0 s tổng hợp bằng VieNeu
local (26-10-2026):

| Provider | Latency | Kết quả |
| --- | --- | --- |
| Deepgram nova-3 | 1.32 s | Đúng nội dung, chỉ sai một âm do chính TTS phát ("bản" → "bàn") |
| Groq whisper-large-v3-turbo | 0.61 s | Được kích hoạt bằng cách giả lập Deepgram trả 429 — xác nhận failover chạy thật |
| Gemini 3.1-flash-lite | 2.3–3.5 s, có lúc tới 30 s khi gọi dồn dập | 429 ở ~17 request/phút và tự sửa đại từ; chỉ còn là lựa chọn cuối |

Chất lượng: câu tiếng Việt thông thường các provider nhận gần đúng hoàn toàn; lỗi
chỉ xảy ra ở **tên riêng** ("Rengar" → "Gengar"). Hệ thống **Admin → Aliases** (có
mic test) sinh ra để map các lỗi này — thêm tên nhận sai làm alias của entity
đúng là cách xử lý chuẩn.

Đo lại bất kỳ lúc nào bằng:

```bash
cd apps/api && node --env-file-if-exists=.env scripts/stt-bench.mjs        # 12 request/provider
cd apps/api && node --env-file-if-exists=.env scripts/stt-bench.mjs --load # burst tìm trần 429
```

---

## 3. TTS — đọc câu trả lời

Có hai chế độ, chọn bởi `MEMBERSHIP_ENFORCEMENT` (phải bật **cùng lúc** ở API và web):

- **`enforce`** — server sở hữu văn bản đọc (task #85). Client gửi `requestId` của
  câu trả lời, `version` và `chunk` index; server đọc lại answer đã lưu của chính
  account đó, tự làm sạch/chia chunk và trừ `tts_characters` theo số ký tự nó
  tổng hợp. Guest 401, Free 403, hết ký tự 402 — câu trả lời vẫn nằm trong bubble
  để đọc.
- **chưa bật cờ** — production hiện tại. `/tts/plan` trả 404 và `/tts/speech` vẫn
  nhận `{ input, lang }` do browser gửi như trước, không ghi ledger.

Ngôn ngữ trong body (`lang`) quyết định engine:

- **vi** — engine chính chọn bằng `TTS_PROVIDER` (`deepgram` mặc định, hoặc
  `vieneu`); engine còn lại tự động đọc thay từng chunk khi engine chính lỗi.
- **en** — Deepgram **Aura-2** trên batch `POST /v1/speak`
  (`model=aura-2-thalia-en`, đổi bằng `DEEPGRAM_TTS_MODEL_EN`). VieNeu là engine
  tiếng Việt nên English **không có engine thứ hai**: Deepgram lỗi là client hiện
  `voiceSpeechError`, chứ không đọc câu tiếng Anh bằng giọng tiếng Việt.

Cả hai engine lỗi thì client hiện `voiceSpeechError`; **không còn Web Speech API**.
Mọi câu trả lời đều có nút **Nghe lại**, kể cả câu trả lời gõ bằng text; chỉ câu
hỏi nhập bằng giọng nói mới tự động đọc ngay.

Deepgram không trộn hai model family trên cùng endpoint: `/v2/speak` chỉ nhận Flux
(trả `V1_MODEL_ON_V2_SPEAK_ENDPOINT` với model Aura) và `/v1/speak` từ chối Flux
(`V2_MODEL_ON_V1_SPEAK_ENDPOINT`) — đã xác nhận bằng request thật với key của
account. Tiếng Việt vì thế nằm trên **Flux TTS** — `POST /v2/speak` với
`model=flux-minh-vi` (nam, mặc định) hoặc `flux-hoa-vi` (nữ). Flux tiếng Việt đang
Early Access và chưa chuẩn hoá số/ngày, nên số được đọc như chữ.
VieNeu nói cùng contract OpenAI-compatible nhưng chỉ còn bản cloud.
Đo trên máy dev: Deepgram Flux batch ~4 s cho 60 ký tự và ~5–6 s cho 130–150 ký tự;
VieNeu (bản local, trước khi bị loại khỏi runtime) warm ~2–4 s/chunk. Vì vậy khi
cần phản hồi nhanh, đặt `TTS_PROVIDER=vieneu` — không cần sửa code.

Lý do bỏ hẳn Web Speech: trên chính máy dev, `getVoices()` liệt kê
`Linh/vi-VN` nhưng Chrome vẫn lặng lẽ đọc bằng giọng tiếng Anh; engine không
expose giọng nào đã phát nên không có cách sửa từ code. Thay vì đoán, client báo
lỗi và để người dùng bấm **Nghe lại**.

### 3.1 Pipeline phía server (engine chính → engine dự phòng)

- `speakAnswer()` đọc `GET /api/voice/tts/status?lang=…` (cache 60 s, và được gọi
  warm-up ngay khi mount để cú bấm không phải chờ thêm một round trip). Status trả
  `provider` (engine sẽ trả lời), `primary` (`deepgram` với English; với tiếng Việt
  thì theo `TTS_PROVIDER`) và `maxChars`.
- `available: false` (không engine nào dùng được) → hiện `voiceSpeechError`,
  không phát.
- **Enforced:** `GET /api/voice/tts/plan?requestId=…` trả `{ version, chunks }`;
  `version` là `sha256(spokenText(answer))` và `chunks` chỉ là số chunk, không
  phải văn bản. Mỗi chunk là một `POST /api/voice/tts/speech`
  (`{ requestId, version, chunk, lang }`) kèm `X-Request-Key` mint một lần cho
  lượt phát; server ghép khoá idempotency `tts:<key>:<chunk>`, nên retry transport
  là replay (409 `already_answered`, không trừ thêm), còn bấm **Nghe lại** là lượt
  mới.
- **Chưa enforced:** `chunkForSpeech(spoken, min(status.maxChars, 180))`, mỗi chunk
  một request `POST /api/voice/tts/speech` (`{ input, lang }`) trả audio đúng
  Content-Type của engine.
- Server thử engine **chính** trước (mặc định Deepgram; English chỉ có Deepgram).
  Nếu engine chính không có
  key, đang cooldown, trả 429/401/403/4xx/5xx hoặc audio không hợp lệ thì **cùng chunk**
  đó chuyển sang engine còn lại; header `X-TTS-Provider` cho biết engine đã trả lời.
  Timeout của engine chính không fallback (đã chờ hết `TTS_TIMEOUT_MS`) mà trả 504.
- 401/403 bị "ghim" 60 s; 429 ghim theo `Retry-After` (mặc định 30 s). Khi ghim,
  `/tts/status` tự chuyển sang engine còn lại nếu engine đó còn sống.
- **Prefetch đúng một chunk trước**: slot synthesis dùng chung cho cả hai engine,
  nên gửi nhiều hơn là tự chuốc 429. Chunk kế tiếp đã sẵn audio khi chunk hiện tại
  kết thúc → tai nghe liền mạch.
- Audio mỗi chunk là `URL.createObjectURL(blob)` và được cache theo **lang + nội
  dung chunk** (khi enforced: `lang + requestId + version + chunk`; tối đa 12
  chunk, eviction revoke URL cũ). Bấm **Nghe lại** câu vừa nghe vì thế phát gần
  như tức thì, không tổng hợp lại — và cache replay không đi qua ledger.
- Request thất bại bị xoá khỏi cache để lần sau thử lại; khi người dùng bấm Dừng
  hoặc chuyển câu, `AbortController` huỷ fetch và API cũng huỷ job đang chạy trên
  engine (giải phóng slot ngay thay vì giữ đủ timeout). Chunk đã dispatch mà
  người dùng dừng vẫn được tính (policy: audio có thể đã được engine tính tiền);
  lỗi engine chưa có audio thì release.

Độ trễ đo trên máy dev (VieNeu local warm — engine này không còn trong luồng chạy,
số chỉ để tham khảo, answer 356 ký tự → 3 chunk): audio đầu tiên ~1.5–2 s, tổng 6 s
không khoảng lặng. Deepgram Flux batch cùng máy: ~4 s cho chunk 60 ký tự, ~4.8 s
cho 90 ký tự và ~5.3–6.2 s cho 130–150 ký tự. Vì vậy `TTS_PROVIDER=vieneu` là lựa
chọn khi ưu tiên độ trễ; chunk nhỏ hơn (`TTS_CHUNK_CHARACTERS`) cũng giúp audio
đầu tiên lên sớm hơn.

### 3.2 Dự phòng và lỗi

- Engine chính lỗi ở một chunk → engine còn lại đọc chunk đó. Nếu engine chính
  chết giữa câu, các chunk còn lại tiếp tục bằng engine kia; giọng có thể đổi
  giữa câu nhưng nội dung không mất. Riêng timeout trả 504 luôn (không thử engine
  còn lại sau khi đã chờ hết ngân sách thời gian).
- Cả hai engine lỗi → route trả lỗi của VieNeu (`speech_busy`,
  `speech_text_rejected`, `tts_unavailable`, `tts_credentials_rejected`,
  `speech_generation_timeout`) và client hiện `voiceSpeechError`.
- Không còn `loadVoices()`/`pickVoice()`/watchdog 2,5 s: không có engine trình
  duyệt nào để chờ.


### 3.3 Làm sạch text và chia chunk

- `spokenText()` strip code fence, link (giữ text), bold/italic, header, bullet,
  hàng phân cách bảng, emoji/★/→… rồi gộp khoảng trắng và **cắt ở ranh giới câu
  với cap 500 ký tự**. Phần còn lại vẫn hiển thị đầy đủ trong bubble chat.
- `chunkForSpeech()` chia text thành từng chunk, ưu tiên dấu câu rồi tới khoảng
  trắng. Cả hai hàm nằm trong `packages/shared/src/speech-text.ts` để API và web
  không thể lệch định nghĩa (task #85).
- Khi enforced, API tự chia theo `TTS_CHUNK_CHARACTERS` và client chỉ gửi index;
  khi chưa enforced, client chia theo `min(TTS_CHUNK_CHARACTERS từ /tts/status,
  180)`. `version` chỉ phụ thuộc text nên hai phía luôn khớp; ranh giới chunk khớp
  khi cùng giới hạn.
- Chunk được phát nối tiếp qua Audio element; chỉ khi chunk cuối kết thúc mới tắt
  trạng thái "đang đọc".
- Chỉ câu trả lời **tiếng Việt** được đặt `playbackRate = 1.15` để bù tốc độ đọc
  chậm của Flux (Deepgram nhận tham số `speed` nhưng hiện bỏ qua với `vi`);
  Aura-2 tiếng Anh phát ở rate 1.

### 3.4 Dừng và thay thế

- Bấm **Dừng đọc**, gửi câu hỏi mới, mở hội thoại khác hoặc unmount:
  `stopAnswerSpeech()` tăng sequence token, huỷ `AbortController` của các request
  TTS đang chạy và `pause()` audio element.
- `speechSeqRef` (sequence token) bảo đảm callback `onended`/`fetch` của lượt đọc
  cũ không ghi đè trạng thái của lượt mới; event `pause` ngoài ý muốn (do token
  đã đổi) được phân loại là `AbortError`.
- Unmount còn revoke toàn bộ blob URL đang cache.

### 3.5 Autoplay

Server TTS phát bằng `<audio>`, nên quy tắc autoplay của trình duyệt áp dụng.
Bấm **Nghe lại** là user gesture; câu trả lời tự động đọc (sau câu hỏi giọng nói)
có thể bị chặn trên Safari/iOS vì không còn priming bằng `speechSynthesis`. Khi
đó audio element trả `NotAllowedError`, client hiện `voiceSpeechBlocked` —
*"Trình duyệt chặn tự động phát âm thanh. Bấm 'Nghe lại' ở câu trả lời để nghe."*
Đây là hành vi có chủ ý: thà báo lỗi rõ ràng còn hơn đọc bằng giọng tiếng Anh
của trình duyệt.

---

## 4. API endpoints

| Endpoint | Method | Input | Output |
| --- | --- | --- | --- |
| `/api/voice/status` | GET | — | `{ available, provider, providers: [{ provider, coolingDown }] }` — chain STT và vendor nào đang chờ |
| `/api/voice/transcribe` | POST | Session cookie + Float32 LE mono 16 kHz + `X-Sample-Rate: 16000` (+ `X-Language: en\|vi`, `X-Request-Key`) | `{ text, turnId }` + header `X-STT-Provider` (vendor đã trả lời); `turnId` là lượt chat đã giữ chỗ cho `/api/assistant/query` |
| `/api/voice/tts/status` | GET | `?lang=en\|vi` (mặc định `vi`) | `{ available, provider: 'deepgram' \| 'vieneu', primary, maxChars }` (+ `reason` ở chế độ dev) |
| `/api/voice/tts/plan` | GET | Session cookie + `?requestId=<uuid>` | `{ version, chunks }` — `version = sha256(spokenText(answer))`, `chunks` là **số** chunk. 404 khi chưa bật `MEMBERSHIP_ENFORCEMENT` hoặc requestId không thuộc account |
| `/api/voice/tts/speech` | POST | Enforced: `{ requestId, version, chunk, lang }` + `X-Request-Key`; chưa enforced: `{ input, lang }`, `input` ≤ `maxChars` | Audio nguyên Content-Type từ engine, header `X-TTS-Provider` (engine đã trả lời), `Cache-Control: no-store` |

### Bảng lỗi `/transcribe` → thông báo client (vi)

| HTTP | `error` | Nguyên nhân | Thông báo |
| --- | --- | --- | --- |
| 400 | `invalid_audio` / `unsupported_sample_rate` | Body/rate sai | `voiceError` |
| 401 | `unauthenticated` | Không có session | `voiceSignIn` |
| 402 | `quota_exhausted` | Hết số giây STT của kỳ | `quota` |
| 403 | `feature_locked` / `period_expired` | Gói không có STT (Free), hoặc kỳ đã kết thúc | `voicePlanRequired` / `expired` |
| 409 | `already_answered` / `request_in_progress` / `request_conflict` | Replay cùng `X-Request-Key`, đang chạy, hoặc cùng key khác clip | `voiceSttError` |
| 413 | `audio_too_long` | > 60 giây, hoặc dài hơn `max_stt_seconds_per_request` của gói | `voiceTooLong` |
| 422 | `no_speech` | Im lặng / không nhận ra chữ | `voiceNoSpeech` |
| 429 | `transcription_busy` / `daily_cap` / `rate_limited` / `too_many_in_flight` | Hết slot transcription, **mọi** provider đang chờ sau 429, hoặc quota chat của account | `voiceBusy` / `dailyCap` / `rate` |
| 503 | `stt_not_configured` / `membership_unavailable` | Không provider khả dụng, hoặc không đọc được entitlement | `voiceSttUnavailable` / `membership` |
| 502 | `transcription_failed` | Mọi provider trong chain đều lỗi/timeout ở lượt đó | `voiceSttError` |

Lỗi phía đọc câu trả lời: client hiện `voiceSpeechError` khi không engine nào
dùng được hoặc engine lỗi giữa chừng, và `voiceSpeechBlocked` khi trình duyệt
chặn autoplay.

### Bảng lỗi `/tts/speech`

| HTTP | `error` | Nguyên nhân | client |
| --- | --- | --- | --- |
| 400 | `invalid_request` | Enforced: `requestId`/`version`/`chunk` sai định dạng, hoặc `chunk` vượt số chunk của plan | bug client — hiện `voiceSpeechError` |
| 400 | `invalid_speech_text` (+ `maxChars`) | Chưa enforced: `input` rỗng hoặc dài hơn giới hạn chunk | bug chia chunk — không xảy ra |
| 401 | `unauthenticated` | Enforced: không có session | `voiceSignIn` |
| 402 | `quota_exhausted` | Hết `tts_characters` của kỳ; engine không bị gọi | `voiceReadQuota` — câu trả lời vẫn đọc được bằng mắt |
| 403 | `feature_locked` | Gói không có TTS (Free) | `voicePlanRequired` |
| 404 | `not_found` | `requestId` không phải câu trả lời đã lưu của account này | `voiceSpeechError` |
| 409 | `speech_version_mismatch` | Answer đã đổi so với `version` client giữ; client xin plan lại | tự xin lại plan |
| 409 | `already_answered` / `request_in_progress` / `request_conflict` | Retry cùng `X-Request-Key`, đang chạy, hoặc cùng key khác payload | retry transport, không phải lỗi user |
| 400 | `speech_text_rejected` | Cả hai engine từ chối text (VieNeu cloud chặn >34% ký tự ngoài Latin, từ >30 ký tự không dấu cách) | `voiceSpeechError` |
| 429 | `speech_busy` | Hết slot sau khi đã chờ `TTS_QUEUE_WAIT_MS`, hoặc VieNeu báo queue full sau 3 lần thử | `voiceSpeechError` |
| 502 | `speech_generation_failed` | Engine trả lỗi khác / audio trả về không hợp lệ | `voiceSpeechError` |
| 503 | `tts_unavailable` | Cả Deepgram và VieNeu không trả lời (chưa bật container, 404, probe `/v1/voices` fail) | `voiceSpeechError` |
| 503 | `membership_unavailable` | Enforced: không đọc được entitlement/plan — fail closed, không đoán Free | `membership` |
| 503 | `tts_credentials_rejected` | Deepgram hoặc VieNeu trả 401/403: key sai hoặc bị thu hồi. Không retry; lỗi được "ghim" 60 s | `voiceSpeechError` |
| 504 | `speech_generation_timeout` | Quá `TTS_TIMEOUT_MS` cho một chunk | `voiceSpeechError` |

`Retry-After` của VieNeu được API tôn trọng: chờ đúng thời lượng đó, tối đa 3 lần
thử; nếu ≥ 30 s (vd. `GRANT_DAILY_LIMIT`) thì fault được ghim lại. Deepgram 429
ghim theo `Retry-After` hoặc 30 s mặc định, nên mỗi lần bấm **Nghe lại** không
đốt quota vô ích.

Nếu đã phát được ít nhất một chunk rồi lỗi giữa chừng, client dừng và hiện
`voiceSpeechError`; chunk còn lại không được đọc bằng engine khác trong cùng lượt
để tránh lẫn hai giọng. Lần bấm **Nghe lại** sau đó sẽ thử lại từ đầu.

---

## 5. Biến môi trường

### 5.1 STT

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `STT_PROVIDER` | auto (`deepgram → groq → elevenlabs → openai → gemini`) | Ép một provider; ép provider không có key → `stt_not_configured` |
| `STT_LANGUAGE` | `vi` | Code ngôn ngữ gửi lên provider cho request không phải `X-Language: en` (en luôn là `en`, không biến này không ảnh hưởng) |
| `STT_MAX_CONCURRENCY` | `4` | Số request song song lên cloud |
| `STT_BUSY_COOLDOWN_MS` | `30000` | Thời gian bỏ qua một provider vừa trả 429; `Retry-After` được tôn trọng trong trần 1 s – 10 phút |
| `STT_CHAIN_BUDGET_MS` | `45000` | Tổng thời gian cho một lượt đi hết chain; hết ngân sách thì dừng ở provider đang gọi và trả `transcription_failed` |
| `DEEPGRAM_API_KEY` / `GROQ_API_KEY` / `ELEVENLABS_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` | — | Key provider tương ứng |
| `STT_DEEPGRAM_MODEL` | `nova-3` | |
| `STT_GROQ_MODEL` | `whisper-large-v3-turbo` | |
| `STT_ELEVENLABS_MODEL` | `scribe_v2` | |
| `STT_OPENAI_MODEL` | `gpt-4o-transcribe` | |
| `STT_OPENAI_BASE_URL` | `OPENAI_BASE_URL` hoặc OpenAI API | Gateway khác |
| `STT_OPENROUTER_MODEL` | `openai/whisper-large-v3-turbo` | |
| `STT_GEMINI_MODEL` | `gemini-3.1-flash-lite` | |

### 5.2 TTS (engine theo ngôn ngữ; với tiếng Việt, engine chính chọn bằng `TTS_PROVIDER`)

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `TTS_PROVIDER` | `deepgram` | `deepgram` hoặc `vieneu`: engine trả lời trước cho **tiếng Việt**. Engine còn lại tự động đọc thay từng chunk khi engine chính lỗi. English luôn dùng Deepgram, bỏ qua biến này |
| `DEEPGRAM_API_KEY` | — | Key cho Deepgram (dùng chung với STT). Không có key thì bỏ qua Deepgram, đi thẳng VieNeu; English vì thế không đọc được |
| `DEEPGRAM_TTS_MODEL` | `flux-minh-vi` | Model Flux cho tiếng Việt (`/v2/speak`); `flux-hoa-vi` cho giọng nữ. Aura/Aura-2 không có tiếng Việt |
| `DEEPGRAM_TTS_MODEL_EN` | `aura-2-thalia-en` | Giọng Aura-2 tiếng Anh cho câu trả lời `lang=en` (`/v1/speak`); nhận mọi `aura-2-*-en`, vd. `aura-2-helena-en` |
| `VIENEU_TTS_URL` | — (tắt VieNeu) | Base URL engine VieNeu cloud: `https://api.vieneu.io/api`. Không đặt thì VieNeu bị bỏ qua hoàn toàn |
| `VIENEU_TTS_MODEL` | `vieneu-v4` | Model gửi lên `/v1/audio/speech` |
| `VIENEU_TTS_FORMAT` | `wav` | `wav` \| `mp3` \| `pcm` \| `opus` \| `ulaw` |
| `VIENEU_TTS_API_KEY` | — | Gửi `Authorization: Bearer`; cloud bắt buộc (`vn_sk_…`) |
| `VIENEU_TTS_VOICE` | `Hải Đăng` | Giọng dự phòng; `/v1/voices` liệt kê lựa chọn (Trúc Ly, Thiện Minh, Mai Anh, …) |
| `VIENEU_TTS_PROBE_TIMEOUT_MS` | `4000` | Timeout thăm `/v1/voices` (clamp 500–15000); qua WAN nên đặt 6000 |
| `TTS_CHUNK_CHARACTERS` | `150` | Số ký tự tối đa mỗi request, clamp 40–400; client nhận qua `maxChars` |
| `TTS_MAX_CONCURRENCY` | `2` | Số request đồng thời tới engine; tăng khi engine cho phép nhiều stream hơn |
| `TTS_QUEUE_WAIT_MS` | `5000` | Thời gian chờ slot trước khi trả 429 |
| `TTS_TIMEOUT_MS` | `45000` | Timeout một chunk |

Không có key Deepgram và không cấu hình `VIENEU_TTS_URL`: `/tts/status` báo
`available: false` (kèm `reason` ở dev) và client hiện `voiceSpeechError`; không
còn engine trình duyệt để tự đọc.

**VieNeu chỉ còn bản cloud.** Engine local (`127.0.0.1:8001`) đã bị loại khỏi luồng
chạy — code `synthVieneuChunk()` vẫn giữ nhưng `vieneuConfigured()` đòi
`VIENEU_TTS_URL`; không có URL thì mọi request VieNeu bị bỏ qua, không có default
nào trỏ về localhost. Những gì cloud xử lý:

| | VieNeu cloud (`api.vieneu.io`) |
| --- | --- |
| Chi phí | tính theo ký tự (tối thiểu 50/call), `vieneu-v4` hệ số 3× |
| Thông lượng | 300 req/phút mỗi key, 300 stream đồng thời mỗi IP |
| Lỗi 401/403 | key sai/bị thu hồi → đánh dấu "engine hỏng" 60 s, không retry, `/tts/status` giải thích trong `reason` |
| Lỗi 429 | `GRANT_DAILY_LIMIT` / `QUEUE_FULL` / `CONCURRENT_CONFLICT`; API tuân theo `Retry-After` |
| Text | bị chặn nếu >34% ký tự ngoài Latin hoặc từ >30 ký tự không dấu cách → 400 `speech_text_rejected` |

---

## 6. Vận hành production

1. **STT mặc định là Deepgram nova-3, Groq đứng sau.** Trước đây chuỗi chỉ có
   key AI Studio free-tier (RPM ~10–17) nên người dùng gặp 429 rất thường. Bây giờ
   429 không còn là lỗi hiển thị với user: provider bị cho nghỉ tạm rồi chuyển
   provider kế tiếp trong cùng lượt nói. Muốn không đốt phí: xoá `DEEPGRAM_API_KEY`
   thì Groq (free tier) trở thành provider chính.
2. **Chi phí/nhân rộng STT.** Groq free tier: 20 request/phút, 2.000 request/ngày,
   7.200 s audio/giờ — đủ cho giai đoạn đầu, vượt ngưỡng thì failover tự động
   sang Deepgram (và ngược lại). Thêm key vào `.env` là đủ, không đổi code.
   `GET /api/voice/status` cho biết chain hiện có những vendor nào và ai đang
   `coolingDown`.
3. **STT chỉ còn đường cloud.** Bản Sherpa local đã rời stack: model ~29 MB
   không sống nổi trên disk ephemeral của host API, và license CC-BY-NC-ND-4.0
   của nó cấm deploy thương mại. Không có key STT nào thì `/transcribe` trả 503
   `stt_not_configured`, client biết sớm nhờ `GET /api/voice/status`
   (`available: false`) và ẩn nút mic thay vì để người dùng nói xong mới hỏng.
4. **Quyền riêng tư STT:** audio luôn được forward từ API tới một provider STT cloud.
5. **TTS cần ít nhất một engine:** Deepgram Flux (key dùng chung với STT) hoặc
   VieNeu cloud (`VIENEU_TTS_URL` + key). Không engine nào thì hệ thống vẫn hoạt
   động — `/tts/status` báo `available: false` và client hiện `voiceSpeechError` —
   nhưng không còn đường đọc bằng trình duyệt. Câu trả lời **tiếng Anh** cần
   riêng Deepgram: VieNeu không nói tiếng Anh nên không có engine dự phòng cho `en`.
6. **Tải TTS:** engine mặc định là dịch vụ ngoài nên API không giữ slot CPU; các
   con số cũ về số câu/phút trên một instance chỉ còn đúng nếu tự dựng engine local
   (không nằm trong luồng chạy). `TTS_MAX_CONCURRENCY=2` bảo vệ quota
   engine chứ không phản ánh năng lực của nó.
7. **Chọn engine theo chi phí.** Deepgram Flux tính theo ký tự — xem bảng giá
   Deepgram, không có chi phí cố định. VieNeu cloud tính theo ký tự (~487 đ/1.000
   ký tự với `vieneu-v4`; hệ số 1.3 toàn cục), tương đương **~$0.01 cho một câu
   trả lời**.
8. **Quyền riêng tư TTS:** text câu trả lời đi từ trình duyệt → API → engine chính
   (Deepgram `api.deepgram.com`, hoặc VieNeu cloud `api.vieneu.io`). Khi engine
   chính lỗi, cùng text đó được gửi tới engine còn lại. Không còn đường Web Speech
   để engine của hệ điều hành tự gửi text đi.

### 6.1 Deploy TTS

**A. Deepgram Flux**

```
TTS_PROVIDER=deepgram
DEEPGRAM_API_KEY=…                    # dùng chung với STT
DEEPGRAM_TTS_MODEL=flux-minh-vi        # mặc định; flux-hoa-vi cho giọng nữ
```

Không cần probe: `/tts/status` coi Deepgram là available khi có key và không bị
ghim fault. Key sai lộ ra ở chunk đầu tiên (`503 tts_credentials_rejected`), được
ghim 60 s rồi chuyển sang VieNeu. Flux tiếng Việt đang Early Access — kiểm tra
chất lượng bằng một câu có số/ngày trước khi mở cho người dùng.

**B. VieNeu cloud (engine chính thay thế)**

Đặt `TTS_PROVIDER=vieneu` để VieNeu trả lời trước; Deepgram (nếu có key) chỉ còn
là dự phòng từng chunk. Đây là cách né độ trễ ~4–6 s/chunk của Flux batch.

```
TTS_PROVIDER=vieneu
VIENEU_TTS_URL=https://api.vieneu.io/api
VIENEU_TTS_API_KEY=vn_sk_…            # key bán chính thức; vn_test_ bị giới hạn 100 từ + 30 call/ngày
VIENEU_TTS_MODEL=vieneu-v4            # model mới nhất = đắt nhất (hệ số 3×); v3 turbo rẻ hơn nếu cần
VIENEU_TTS_VOICE=Hải Đăng
VIENEU_TTS_PROBE_TIMEOUT_MS=6000      # probe qua WAN
```

Không có gì phải vận hành thêm: không container, không GPU, không autoscale. Giới
hạn của key là 300 request/phút và 300 stream đồng thời mỗi IP — cao hơn nhiều
`TTS_MAX_CONCURRENCY=2` của API, nên muốn phục vụ nhiều user cùng lúc thì tăng
`TTS_MAX_CONCURRENCY`/`TTS_QUEUE_WAIT_MS` cho đúng với quota, không phải thêm máy.
Độ trễ đo qua API ở môi trường dev: audio đầu tiên ~1.2 s cho một chunk ngắn.

**C. English (Aura-2, không cần cấu hình thêm)**

`lang=en` luôn dùng Deepgram `/v1/speak` với `aura-2-thalia-en`; `TTS_PROVIDER` và
toàn bộ block VieNeu ở trên không ảnh hưởng đường này. Chỉ cần `DEEPGRAM_API_KEY`.

```
DEEPGRAM_TTS_MODEL_EN=aura-2-thalia-en   # đổi sang giọng khác: aura-2-helena-en, aura-2-juno-en, …
```

Không có key Deepgram thì `GET /api/voice/tts/status?lang=en` trả
`available: false` và client hiện `voiceSpeechError` cho câu trả lời tiếng Anh.

Engine local (`VIENEU_TTS_URL=http://127.0.0.1:8001`) **không còn được dùng**: code
vẫn còn nhưng runtime bỏ qua mọi URL rỗng, và không có default trỏ về localhost.

**Kiểm tra sau khi deploy:** `GET /api/voice/tts/status` phải trả
`available: true`; `provider` cho biết engine chính đang dùng. Nếu `available:
false`, xem `reason` (chỉ có ở dev) — phân biệt được "engine chưa bật"
(`tts_unavailable`) với "key sai" (`tts_credentials_rejected`) mà không cần đọc
log API.

## 7. Việc đã biết / hướng tiếp theo

- **Gemini không còn đứng đầu chain STT** vì hai lý do đo được: free tier 429 ở
  ~17 request/phút và model "sửa lời nói" (đổi đại từ nó cho là hợp lý). Nó nằm
  cuối chain, dùng lại `GOOGLE_API_KEY` của LLM; muốn loại hẳn thì xoá key hoặc
  pin `STT_PROVIDER`.
- **Benchmark STT** (`apps/api/scripts/stt-bench.mjs`) tự tổng hợp audio bằng một
  engine VieNeu local chạy riêng (script gọi thẳng `STT_BENCH_TTS_URL`, mặc định
  `http://127.0.0.1:8001`; API không dùng engine này nữa) nên không tốn phí TTS,
  nhưng **mặc định nó bắn ~12 request/provider
  vào cloud** (Deepgram tính tiền, Groq/Gemini ăn quota free). Chạy nó chỉ khi có
  mục đích đo lại; muốn thử một provider thì pin `STT_PROVIDER` và giới hạn corpus.
- **Không còn Web Speech API**: `stopAnswerSpeech()` chỉ huỷ fetch và pause audio
  element; không còn `speechSynthesis`, `loadVoices()`, `pickVoice()` hay watchdog.
  Đổi lại, máy nào không phát được `<audio>` (autoplay bị chặn) sẽ thấy
  `voiceSpeechBlocked` thay vì một giọng đọc sai.
- **Deepgram Flux tiếng Việt là Early Access**: chưa chuẩn hoá số/ngày, chưa có
  catalog giọng dày như Aura. Giọng có sẵn: `flux-minh-vi` (nam, mặc định),
  `flux-hoa-vi` (nữ). Đổi bằng `DEEPGRAM_TTS_MODEL`; không cần đổi code.
- **Các engine từng thử và loại**: *Edge Read Aloud* (miễn phí, không key) bị
  Microsoft chặn handshake websocket từ máy này — 401/403 với mọi biến thể
  `Sec-MS-GEC`/`TrustedClientToken`. *Gemini TTS* (`gemini-3.8-flash-lite-tts`,
  voice `Charon`) cho chất lượng tốt nhưng key hiện hết quota (429). *Web Speech*
  bị loại vì đọc tiếng Việt bằng giọng tiếng Anh trên máy dev. Hiện tại:
  **Deepgram Flux** (chính hoặc dự phòng) và **VieNeu cloud** (dự phòng). Engine
  VieNeu local đã bị loại khỏi luồng chạy; code vẫn giữ.
- **VieNeu là service ngoài**: chỉ cần
  `VIENEU_TTS_URL=https://api.vieneu.io/api` + `VIENEU_TTS_API_KEY` — smoke
  test thực tế qua API: `GET /v1/voices` 0.31 s, `POST /v1/audio/speech` một chunk
  30 ký tự trả 224 KB wav sau **1.19 s** (toàn trình, tính cả proxy API), key sai
  trả 503 `tts_credentials_rejected` sau 0.08 s và được ghim 60 s. Đổi lại, text
  câu trả lời được gửi tới `api.vieneu.io` và mỗi ký tự đều tính tiền.
- **Đọc dài hơn 500 ký tự**: tăng cap trong `apps/web/lib/speech.ts`; chunking
  đã sẵn sàng cho cả hai engine nên không bị cắt giữa câu.
- **Tên riêng sai khi STT** ("Rengar" → "Gengar"): xử lý bằng Admin → Aliases,
  không sửa code.
