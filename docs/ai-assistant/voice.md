# Voice: nhận dạng giọng nói (STT) và đọc câu trả lời (TTS) của Coach AI

> Cập nhật: 2026-10-26. Số liệu STT là số đo thực tế trên môi trường dev
> (macOS arm64, API Node 22). TTS chạy Deepgram Flux (chính) → VieNeu (dự phòng);
> không còn fallback Web Speech API.

## 1. Luồng tổng thể

```
┌─ Trình duyệt (assistant-chat.tsx) ──────────────────────────────────────┐
│  Mic → AudioWorklet (audio-capture-processor.js)                        │
│      → Float32 mono @ device rate, tối đa 60 giây                       │
│      → resample về 16 kHz (OfflineAudioContext)                         │
│      → POST /api/voice/transcribe  (octet-stream, X-Sample-Rate: 16000) │
│  Nhận { text } → ghép vào input → gửi câu hỏi cho Coach AI              │
│      → answer → spokenText() làm sạch + cắt 500 ký tự                   │
│      → GET  /api/voice/tts/status  (cache 60 s)                         │
│      → available: chunkForSpeech() → POST /api/voice/tts/speech (wav)   │
│                  → phát tuần tự, prefetch trước 1 chunk                 │
│      → không available / lỗi: hiện voiceSpeechError, không đọc          │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─ API (apps/api/src/voice.ts) ───────────────────────────────────────────┐
│  STT failover: deepgram → groq → elevenlabs → openai → gemini           │
│  TTS failover: Deepgram Flux (/v2/speak) → VieNeu (/v1/audio/speech)    │
│  slot dùng chung; audio trả về đúng Content-Type engine                 │
│  (wav/mp3/pcm/opus); lỗi/timeout → 429/502/503/504 cho client báo lỗi   │
└─────────────────────────────────────────────────────────────────────────┘
```

File liên quan:

| File | Vai trò |
| --- | --- |
| `apps/api/src/voice.ts` | Routes `/api/voice/*`, chọn provider STT, gọi API đám mây, TTS Deepgram → VieNeu |
| `apps/web/components/assistant/assistant-chat.tsx` | Ghi âm, resample, gọi transcribe, pipeline phát audio theo chunk (không còn Web Speech) |
| `apps/web/lib/speech.ts` | Làm sạch text và chia chunk cho TTS server |
| `apps/web/public/audio-capture-processor.js` | AudioWorklet thu PCM thô từ mic |
| `apps/web/components/admin/alias-manager.tsx` | Mic test trong Admin → Aliases (dùng chung `/transcribe`) |
| `apps/api/src/voice.test.ts` | Unit test WAV encoder + logic chọn provider STT |

Cấu hình STT qua biến môi trường trong `apps/api/.env` (mẫu đầy đủ ở
`apps/api/.env.example`).

---

## 2. STT — nhận dạng giọng nói tiếng Việt

### 2.1 Provider và chuỗi failover

Khi không đặt `STT_PROVIDER`, API dựng danh sách provider **có key** theo thứ tự
đã đo (xem `apps/api/scripts/stt-bench.mjs`) và đi hết danh sách đó cho mỗi lượt
nói, thay vì chỉ thử một provider:

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

- Body: Float32 little-endian mono 16 kHz, tối đa 60 giây (4 MB).
- Header bắt buộc: `X-Sample-Rate: 16000`.
- Gate RMS < 0.001 → `422 no_speech` **trước khi** gọi provider (chặn luôn hiện
  tượng hallucination trên audio im lặng của model cloud).
- Text rỗng hoặc không có chữ/số → `422 no_speech`.

### 2.3 Độ trễ đo thực tế

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

Chuỗi engine: **Deepgram Flux TTS** (chính) → **VieNeu** (dự phòng). Cả hai lỗi
thì client hiện `voiceSpeechError`; **không còn Web Speech API**. Mọi câu trả lời
đều có nút **Nghe lại**, kể cả câu trả lời gõ bằng text; chỉ câu hỏi nhập bằng
giọng nói mới tự động đọc ngay.

Deepgram Aura/Aura-2 chỉ có tiếng Anh; tiếng Việt nằm trên **Flux TTS** — batch
`POST /v2/speak` với `model=flux-hoa-vi` (nữ) hoặc `flux-minh-vi` (nam). Flux
tiếng Việt đang Early Access và chưa chuẩn hoá số/ngày, nên số được đọc như chữ.
VieNeu giữ vai trò dự phòng: bản local không gửi text ra ngoài, bản cloud rẻ và
đã đo độ trễ ổn định.

Lý do bỏ hẳn Web Speech: trên chính máy dev, `getVoices()` liệt kê
`Linh/vi-VN` nhưng Chrome vẫn lặng lẽ đọc bằng giọng tiếng Anh; engine không
expose giọng nào đã phát nên không có cách sửa từ code. Thay vì đoán, client báo
lỗi và để người dùng bấm **Nghe lại**.

### 3.1 Pipeline phía server (Deepgram → VieNeu)

- `speakAnswer()` đọc `GET /api/voice/tts/status` (cache 60 s, và được gọi warm-up
  ngay khi mount để cú bấm không phải chờ thêm một round trip).
- `available: false` (không engine nào dùng được) → hiện `voiceSpeechError`,
  không phát.
- `available: true` → `chunkForSpeech(spoken, min(status.maxChars, 180))`, mỗi chunk
  một request `POST /api/voice/tts/speech` trả audio đúng Content-Type của engine.
- Server thử **Deepgram** trước. Nếu Deepgram không có key, đang cooldown, trả
  429/401/403/4xx/5xx hoặc audio không hợp lệ thì **cùng chunk** đó chuyển sang
  **VieNeu**; header `X-TTS-Provider` cho biết engine đã trả lời. Timeout của
  Deepgram không fallback (đã chờ hết `TTS_TIMEOUT_MS`) mà trả 504.
- Deepgram 401/403 bị "ghim" 60 s; 429 ghim theo `Retry-After` (mặc định 30 s).
  Khi ghim, `/tts/status` tự chuyển sang VieNeu nếu VieNeu còn sống.
- **Prefetch đúng một chunk trước**: slot synthesis dùng chung cho cả hai engine,
  nên gửi nhiều hơn là tự chuốc 429. Chunk kế tiếp đã sẵn audio khi chunk hiện tại
  kết thúc → tai nghe liền mạch.
- Audio mỗi chunk là `URL.createObjectURL(blob)` và được cache theo **text** (tối
  đa 12 chunk, eviction revoke URL cũ). Bấm **Nghe lại** câu vừa nghe vì thế phát
  gần như tức thì, không tổng hợp lại.
- Request thất bại bị xoá khỏi cache để lần sau thử lại; khi người dùng bấm Dừng
  hoặc chuyển câu, `AbortController` huỷ fetch và API cũng huỷ job đang chạy trên
  engine (giải phóng slot ngay thay vì giữ đủ timeout).

Độ trễ VieNeu đo trên máy dev (VieNeu warm, answer 356 ký tự → 3 chunk): audio đầu
tiên ~1.5–2 s, tổng 6 s không khoảng lặng. Deepgram Flux batch chưa đo trên máy
dev; mỗi chunk vẫn đi qua cùng pipeline nên độ trễ do engine quyết định.

### 3.2 Dự phòng và lỗi

- Deepgram lỗi ở một chunk → VieNeu đọc chunk đó. Nếu Deepgram chết giữa câu, các
  chunk còn lại tiếp tục bằng VieNeu; giọng có thể đổi giữa câu nhưng nội dung
  không mất. Riêng timeout của Deepgram trả 504 luôn (không thử VieNeu sau khi đã
  chờ hết `TTS_TIMEOUT_MS`).
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
  trắng. Giới hạn chunk là `min(TTS_CHUNK_CHARACTERS từ /tts/status, 180)`.
- Chunk được phát nối tiếp qua Audio element; chỉ khi chunk cuối kết thúc mới tắt
  trạng thái "đang đọc".

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
| `/api/voice/transcribe` | POST | Float32 LE mono 16 kHz + `X-Sample-Rate: 16000` | `{ text }` + header `X-STT-Provider` (vendor đã trả lời) |
| `/api/voice/tts/status` | GET | — | `{ available, provider: 'deepgram' \| 'vieneu', maxChars }` (+ `reason` ở chế độ dev) |
| `/api/voice/tts/speech` | POST | JSON `{ input }`, `input` ≤ `maxChars` | Audio nguyên Content-Type từ engine, header `X-TTS-Provider` (engine đã trả lời), `Cache-Control: no-store` |

### Bảng lỗi `/transcribe` → thông báo client (vi)

| HTTP | `error` | Nguyên nhân | Thông báo |
| --- | --- | --- | --- |
| 400 | `invalid_audio` / `unsupported_sample_rate` | Body/rate sai | `voiceError` |
| 413 | `audio_too_long` | > 60 giây | `voiceTooLong` |
| 422 | `no_speech` | Im lặng / không nhận ra chữ | `voiceNoSpeech` |
| 429 | `transcription_busy` | Hết slot, hoặc **mọi** provider đang trong thời gian chờ sau khi trả 429 | `voiceBusy` |
| 503 | `stt_not_configured` | Không provider khả dụng | `voiceSttUnavailable` |
| 502 | `transcription_failed` | Mọi provider trong chain đều lỗi/timeout ở lượt đó | `voiceSttError` |

Lỗi phía đọc câu trả lời: client hiện `voiceSpeechError` khi không engine nào
dùng được hoặc engine lỗi giữa chừng, và `voiceSpeechBlocked` khi trình duyệt
chặn autoplay.

### Bảng lỗi `/tts/speech`

| HTTP | `error` | Nguyên nhân | client |
| --- | --- | --- | --- |
| 400 | `invalid_speech_text` (+ `maxChars`) | `input` rỗng hoặc dài hơn giới hạn chunk | bug chia chunk — không xảy ra |
| 400 | `speech_text_rejected` | Cả hai engine từ chối text (VieNeu cloud chặn >34% ký tự ngoài Latin, từ >30 ký tự không dấu cách) | `voiceSpeechError` |
| 429 | `speech_busy` | Hết slot sau khi đã chờ `TTS_QUEUE_WAIT_MS`, hoặc VieNeu báo queue full sau 3 lần thử | `voiceSpeechError` |
| 502 | `speech_generation_failed` | Engine trả lỗi khác / audio trả về không hợp lệ | `voiceSpeechError` |
| 503 | `tts_unavailable` | Cả Deepgram và VieNeu không trả lời (chưa bật container, 404, probe `/v1/voices` fail) | `voiceSpeechError` |
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
| `STT_LANGUAGE` | `vi` | Ngôn ngữ ghim cho provider cloud |
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

### 5.2 TTS (Deepgram Flux → VieNeu)

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `DEEPGRAM_API_KEY` | — | Key cho engine chính; dùng chung với STT. Không có key thì bỏ qua Deepgram, đi thẳng VieNeu |
| `DEEPGRAM_TTS_MODEL` | `flux-hoa-vi` | Model Flux; `flux-minh-vi` cho giọng nam. Aura/Aura-2 không có tiếng Việt |
| `VIENEU_TTS_URL` | `http://127.0.0.1:8001` | Base URL engine dự phòng. Cloud: `https://api.vieneu.io/api` |
| `VIENEU_TTS_MODEL` | `vieneu-v4` | Model gửi lên `/v1/audio/speech` (local chấp nhận mọi chuỗi) |
| `VIENEU_TTS_FORMAT` | `wav` | `wav` \| `mp3` \| `pcm` \| `opus` \| `ulaw`; local chỉ nhận `wav`/`pcm` |
| `VIENEU_TTS_API_KEY` | — | Gửi `Authorization: Bearer`; cloud bắt buộc (`vn_sk_…`), local bỏ trống |
| `VIENEU_TTS_VOICE` | `Hải Đăng` | Giọng dự phòng; `/v1/voices` liệt kê lựa chọn (Trúc Ly, Thiện Minh, Mai Anh, …) |
| `VIENEU_TTS_PROBE_TIMEOUT_MS` | `4000` | Timeout thăm `/v1/voices` (clamp 500–15000); qua WAN nên đặt 6000 |
| `TTS_CHUNK_CHARACTERS` | `150` | Số ký tự tối đa mỗi request, clamp 40–400; client nhận qua `maxChars` |
| `TTS_MAX_CONCURRENCY` | `2` | Số request đồng thời tới engine (VieNeu local chỉ nhận ~2) |
| `TTS_QUEUE_WAIT_MS` | `5000` | Thời gian chờ slot trước khi trả 429 |
| `TTS_TIMEOUT_MS` | `45000` | Timeout một chunk |

Không có key Deepgram và không có VieNeu nào chạy: `/tts/status` báo
`available: false` (kèm `reason` ở dev) và client hiện `voiceSpeechError`; không
còn engine trình duyệt để tự đọc.

**VieNeu: hai cách chạy, một đường code.** `synthVieneuChunk()` nói chuyện với cùng API
OpenAI-compatible `/v1/audio/speech`; chuyển local ↔ cloud chỉ là đổi
`VIENEU_TTS_URL` + thêm `VIENEU_TTS_API_KEY`. Khác biệt được xử lý ở tầng config:

| | VieNeu local | VieNeu cloud (`api.vieneu.io`) |
| --- | --- | --- |
| Chi phí | miễn phí, tốn máy chủ/GPU | tính theo ký tự (tối thiểu 50/call), `vieneu-v4` hệ số 3× |
| Thông lượng | ~2 stream/instance CPU, 16 stream GPU | 300 req/phút mỗi key, 300 stream đồng thời mỗi IP |
| Lỗi 401/403 | không có | key sai/bị thu hồi → đánh dấu "engine hỏng" 60 s, không retry, `/tts/status` giải thích trong `reason` |
| Lỗi 429 | queue đầy | `GRANT_DAILY_LIMIT` / `QUEUE_FULL` / `CONCURRENT_CONFLICT`; API tuân theo `Retry-After` |
| Text | mọi chuỗi | bị chặn nếu >34% ký tự ngoài Latin hoặc từ >30 ký tự không dấu cách → 400 `speech_text_rejected` |

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
   VieNeu local/cloud (dự phòng). Không engine nào thì hệ thống vẫn hoạt động —
   `/tts/status` báo `available: false` và client hiện `voiceSpeechError` — nhưng
   không còn đường đọc bằng trình duyệt.
6. **Tải TTS — số đo VieNeu trên CPU (Mac M2, ONNX fp32, RTF 2.75–2.93×):** một
   câu trả lời ~450 ký tự = 3 chunk ≈ 6.5–9.5 s thời gian engine ≈ **6–9 câu/phút
   cho một instance**, và chỉ ~2 người nghe cùng lúc (`TTS_MAX_CONCURRENCY=2` chỉ
   bảo vệ engine, không tăng thông lượng). Khi Deepgram trả lời, API không chạm
   tới VieNeu; các con số này chỉ áp dụng cho lúc fallback.
7. **Chọn engine theo chi phí.** Deepgram Flux tính theo ký tự — xem bảng giá
   Deepgram, không có chi phí cố định. VieNeu cloud tính theo ký tự (~487 đ/1.000
   ký tự với `vieneu-v4`; hệ số 1.3 toàn cục), tương đương **~$0.01 cho một câu
   trả lời**; VieNeu local miễn phí nhưng tốn máy chủ. Self-host GPU (A5000
   ~$0.27/giờ ≈ $195/tháng) chỉ hòa vốn từ ~21.000 câu trả lời/tháng.
8. **Quyền riêng tư TTS:** text câu trả lời đi từ trình duyệt → API → Deepgram
   (`api.deepgram.com`). Khi Deepgram lỗi, cùng text đó được gửi tới VieNeu —
   local thì không rời máy, cloud thì tới `api.vieneu.io`. Không còn đường Web
   Speech để engine của hệ điều hành tự gửi text đi.

### 6.1 Deploy TTS

**A. Deepgram Flux (engine chính)**

```
DEEPGRAM_API_KEY=…                    # dùng chung với STT
DEEPGRAM_TTS_MODEL=flux-hoa-vi        # hoặc flux-minh-vi cho giọng nam
```

Không cần probe: `/tts/status` coi Deepgram là available khi có key và không bị
ghim fault. Key sai lộ ra ở chunk đầu tiên (`503 tts_credentials_rejected`), được
ghim 60 s rồi chuyển sang VieNeu. Flux tiếng Việt đang Early Access — kiểm tra
chất lượng bằng một câu có số/ngày trước khi mở cho người dùng.

**B. VieNeu (dự phòng — cloud hoặc local)**

Cloud, 0 chi phí cố định:

```
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

Local / self-host (khi cần privacy hoặc sản lượng lớn):

```
# chạy cạnh API (Docker hoặc tiến trình trần)
VIENEU_BACKEND=onnx VIENEU_PRECISION=int8   # CPU: int8 cho 2 stream, fp32 cho 1
VIENEU_DEVICE=auto                          # có GPU thì tự nhận cuda
VIENEU_MAX_STREAMS=16                       # GPU; CPU bỏ qua
VIENEU_QUEUE=16 VIENEU_QUEUE_TIMEOUT=10     # phần vượt sẽ nhận 429
VIENEU_API_KEY=…                            # BẮT BUỘC nếu HOST không phải loopback
VIENEU_TTS_URL=http://127.0.0.1:8001
```

Quy tắc quy mô: 1 instance CPU ≈ 2 người nghe cùng lúc (6–9 câu/phút), 1 instance
GPU ≈ 16. Mỗi khi thêm user đồng thời thì thêm một instance, không phải chỉnh
`TTS_MAX_CONCURRENCY` — biến đó chỉ bảo vệ engine mà engine đang có. Không dùng
scale-to-zero cho engine này (cold start ~9.6 s); nếu bắt buộc thì đặt
min-instances = 1.

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
- **Benchmark STT** (`apps/api/scripts/stt-bench.mjs`) tự tổng hợp audio bằng
  VieNeu local nên không tốn phí TTS, nhưng **mặc định nó bắn ~12 request/provider
  vào cloud** (Deepgram tính tiền, Groq/Gemini ăn quota free). Chạy nó chỉ khi có
  mục đích đo lại; muốn thử một provider thì pin `STT_PROVIDER` và giới hạn corpus.
- **Không còn Web Speech API**: `stopAnswerSpeech()` chỉ huỷ fetch và pause audio
  element; không còn `speechSynthesis`, `loadVoices()`, `pickVoice()` hay watchdog.
  Đổi lại, máy nào không phát được `<audio>` (autoplay bị chặn) sẽ thấy
  `voiceSpeechBlocked` thay vì một giọng đọc sai.
- **Deepgram Flux tiếng Việt là Early Access**: chưa chuẩn hoá số/ngày, chưa có
  catalog giọng dày như Aura. Giọng có sẵn: `flux-hoa-vi` (nữ), `flux-minh-vi`
  (nam). Đổi bằng `DEEPGRAM_TTS_MODEL`; không cần đổi code.
- **Các engine từng thử và loại**: *Edge Read Aloud* (miễn phí, không key) bị
  Microsoft chặn handshake websocket từ máy này — 401/403 với mọi biến thể
  `Sec-MS-GEC`/`TrustedClientToken`. *Gemini TTS* (`gemini-3.8-flash-lite-tts`,
  voice `Charon`) cho chất lượng tốt nhưng key hiện hết quota (429). *Web Speech*
  bị loại vì đọc tiếng Việt bằng giọng tiếng Anh trên máy dev. Hiện tại:
  **Deepgram Flux** (chính) và **VieNeu** (dự phòng, local hoặc cloud).
- **VieNeu là service ngoài**: bản local phải tự chạy (cổng 8001); bản cloud chỉ
  cần `VIENEU_TTS_URL=https://api.vieneu.io/api` + `VIENEU_TTS_API_KEY` — smoke
  test thực tế qua API: `GET /v1/voices` 0.31 s, `POST /v1/audio/speech` một chunk
  30 ký tự trả 224 KB wav sau **1.19 s** (toàn trình, tính cả proxy API), key sai
  trả 503 `tts_credentials_rejected` sau 0.08 s và được ghim 60 s. Đổi lại, text
  câu trả lời được gửi tới `api.vieneu.io` và mỗi ký tự đều tính tiền.
- **Đọc dài hơn 500 ký tự**: tăng cap trong `apps/web/lib/speech.ts`; chunking
  đã sẵn sàng cho cả hai engine nên không bị cắt giữa câu.
- **Tên riêng sai khi STT** ("Rengar" → "Gengar"): xử lý bằng Admin → Aliases,
  không sửa code.
