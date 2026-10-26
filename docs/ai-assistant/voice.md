# Voice: nhận dạng giọng nói (STT) và đọc câu trả lời (TTS) của Coach AI

> Cập nhật: 2026-10-26. Số liệu STT và TTS là số đo thực tế trên môi trường dev
> (macOS arm64, API Node 22). Engine TTS là VieNeu — bản local (mặc định) hoặc
> cloud `api.vieneu.io`; trình duyệt chỉ đọc bằng Web Speech API khi engine không trả lời.

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
│      → không available: chunkForSpeech() → speechSynthesis.speak()      │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─ API (apps/api/src/voice.ts) ───────────────────────────────────────────┐
│  STT: elevenlabs → openai → groq → gemini → sherpa (auto theo key)      │
│  TTS: engine VieNeu — bản local port 8001 hoặc cloud api.vieneu.io      │
│  tối đa 2 request song song; audio trả về đúng Content-Type engine      │
│  (wav/mp3/pcm/opus); lỗi/timeout → 429/503 để client fallback           │
└─────────────────────────────────────────────────────────────────────────┘
```

File liên quan:

| File | Vai trò |
| --- | --- |
| `apps/api/src/voice.ts` | Routes `/api/voice/*`, chọn provider STT, gọi API đám mây, proxy TTS tới VieNeu |
| `apps/web/components/assistant/assistant-chat.tsx` | Ghi âm, resample, gọi transcribe, pipeline phát audio theo chunk + fallback Web Speech |
| `apps/web/lib/speech.ts` | Làm sạch text, chia chunk, chọn giọng Web Speech (engine dự phòng) |
| `apps/web/public/audio-capture-processor.js` | AudioWorklet thu PCM thô từ mic |
| `apps/web/components/admin/alias-manager.tsx` | Mic test trong Admin → Aliases (dùng chung `/transcribe`) |
| `apps/api/src/voice.test.ts` | Unit test WAV encoder + logic chọn provider STT |

Cấu hình STT qua biến môi trường trong `apps/api/.env` (mẫu đầy đủ ở
`apps/api/.env.example`).

---

## 2. STT — nhận dạng giọng nói tiếng Việt

### 2.1 Provider và thứ tự ưu tiên

Khi không đặt `STT_PROVIDER`, API tự chọn provider đầu tiên có key, theo thứ tự
chất lượng tiếng Việt:

| # | Provider | Key | Model mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| 1 | ElevenLabs Scribe | `ELEVENLABS_API_KEY` | `scribe_v2` | WER tiếng Việt tốt nhất (~3.1%), ~$0.40/giờ audio |
| 2 | OpenAI | `OPENAI_API_KEY` | `gpt-4o-transcribe` | Hỗ trợ `STT_OPENAI_BASE_URL` cho gateway khác |
| 3 | Groq | `GROQ_API_KEY` | `whisper-large-v3-turbo` | Nhanh nhất (<1 s), rẻ nhất (~$0.04/giờ) |
| 4 | Google Gemini | `GOOGLE_API_KEY` | `gemini-3.1-flash-lite` | Dùng lại key LLM sẵn có; latency 2–7 s, dao động |
| 5 | Sherpa-ONNX local | — (cần model) | Zipformer-30M int8 | Offline, audio không rời máy; **license CC-BY-NC-ND-4.0 — cấm deploy thương mại** |

Đặt `STT_PROVIDER=elevenlabs|openai|groq|gemini|sherpa` để ép chọn (ép provider
không có key → endpoint báo `stt_not_configured`).

### 2.2 Ràng buộc dữ liệu gửi lên `/api/voice/transcribe`

- Body: Float32 little-endian mono 16 kHz, tối đa 60 giây (4 MB).
- Header bắt buộc: `X-Sample-Rate: 16000`.
- Gate RMS < 0.001 → `422 no_speech` **trước khi** gọi provider (chặn luôn hiện
  tượng hallucination trên audio im lặng của model cloud).
- Text rỗng hoặc không có chữ/số → `422 no_speech`.

### 2.3 Độ trễ đo thực tế

| Provider | Latency (câu ~7 giây) | Ghi chú |
| --- | --- | --- |
| Gemini 3.1-flash-lite | 2.3–3.5 s, có lúc tới 30 s khi gọi dồn dập | Ổn định vừa; dùng được ngay không cần đăng ký |
| (khuyến nghị prod) Groq / ElevenLabs | < 1 s | Chỉ cần thêm key, không đổi code |

Chất lượng: câu tiếng Việt thông thường Gemini nhận gần đúng hoàn toàn; lỗi chỉ
xảy ra ở **tên riêng** ("Rengar" → "Gengar"). Hệ thống **Admin → Aliases** (có
mic test) sinh ra để map các lỗi này — thêm tên nhận sai làm alias của entity
đúng là cách xử lý chuẩn.

---

## 3. TTS — đọc câu trả lời

Engine chính là **VieNeu** (TTS tiếng Việt; bản local cổng 8001 hoặc cloud
`api.vieneu.io`) được API proxy lại; **Web Speech API** của trình duyệt chỉ còn là
engine dự phòng cho lúc VieNeu không trả lời. Mọi câu trả lời đều có nút **Nghe
lại**, kể cả câu trả lời gõ bằng text; chỉ câu hỏi nhập bằng giọng nói mới tự
động đọc ngay.

Lý do bỏ Web Speech làm engine chính: trên chính máy dev, `getVoices()` liệt kê
`Linh/vi-VN` (180–199 giọng) nhưng Chrome vẫn lặng lẽ đọc bằng giọng tiếng Anh —
engine không expose giọng nào đã phát nên không có cách sửa từ code. Edge TTS
(miễn phí, không key) bị Microsoft chặn handshake `wss://speech.platform.bing.com`
từ máy này (401/403 với mọi biến thể `Sec-MS-GEC`), còn key Gemini thì hết quota
429. VieNeu là lựa chọn duy nhất chạy ổn định và cho giọng Việt thật.

### 3.1 Pipe line phía server (VieNeu)

- `speakAnswer()` đọc `GET /api/voice/tts/status` (cache 60 s, và được gọi warm-up
  ngay khi mount để cú bấm không phải chờ thêm một round trip).
- `available: false` (VieNeu chưa bật) → chuyển thẳng sang Web Speech, không báo lỗi.
- `available: true` → `chunkForSpeech(spoken, min(status.maxChars, 180))`, mỗi chunk
  một request `POST /api/voice/tts/speech` trả `audio/wav` 48 kHz mono.
- **Prefetch đúng một chunk trước**: VieNeu chỉ nhận 2 request song song (request
  thứ ba nhận 429 `server busy: queue full`), nên gửi nhiều hơn là tự chuốc lỗi. Chunk kế tiếp đã sẵn audio khi chunk hiện tại
  kết thúc → tai nghe liền mạch.
- Audio mỗi chunk là `URL.createObjectURL(blob)` và được cache theo
  `voice + text` (tối đa 12 chunk, eviction revoke URL cũ). Bấm **Nghe lại** câu vừa
  nghe vì thế phát gần như tức thì, không tổng hợp lại.
- Request thất bại bị xoá khỏi cache để lần sau thử lại; khi người dùng bấm Dừng
  hoặc chuyển câu, `AbortController` huỷ fetch và API cũng huỷ job đang chạy trên
  VieNeu (giải phóng slot ngay thay vì giữ đủ timeout).

Độ trễ đo thực tế trên máy dev (VieNeu warm, answer 356 ký tự → 3 chunk):

| Cách gọi | Thời điểm có audio đầu tiên | Tổng thời gian |
| --- | --- | --- |
| 1 request cho cả 356 ký tự | ~12 s | 12.2 s |
| Chunk + pipeline (đang dùng) | ~1.5–2 s (chunk 150 ký tự) | 6 s audio, không có khoảng lặng giữa câu |

### 3.2 Engine dự phòng: Web Speech

- `pickVoice()` chọn giọng khớp ngôn ngữ của **câu trả lời**, không phải ngôn
  ngữ UI: `speechLanguageFor()` nhận diện dấu tiếng Việt trong text và trả
  `vi-VN`; text không có dấu thì theo UI (`vi-VN` hoặc `en-US`).
- Ưu tiên giọng có sẵn trên máy (`localService`), sau đó giọng mặc định.
- Danh sách giọng load bất đồng bộ (Chrome trả rỗng ở lần gọi đầu), nên
  `loadVoices()` vừa nghe `voiceschanged` vừa poll 150 ms, tối đa 2 s. Danh sách
  được đọc lại **mỗi lần phát**: sau khi cài thêm giọng, object giọng cũ có thể bị
  engine bỏ qua và nó lặng lẽ đọc lại bằng giọng mặc định (thường là tiếng Anh).
- Ở dev, mỗi lần phát in `[coach-voice]` gồm giọng được chọn, **tổng số giọng**
  và toàn bộ ứng viên của ngôn ngữ đích kèm `voiceURI` + `/local` hoặc `/net`.
- Máy không có giọng phù hợp → hiện `voiceSpeechUnsupported`; nội dung vẫn đọc
  được trên màn hình.

Chất lượng và sự tồn tại của giọng phụ thuộc hệ điều hành: macOS/Windows/iOS
thường có giọng tiếng Việt, một số bản Linux/Android thì không; giọng Việt của
trình duyệt cũng đọc sai thuật ngữ game tiếng Anh ("Bloodthirster", "Rengar").
Vì đây chỉ là engine dự phòng nên chất lượng không đồng nhất giữa các máy — muốn
giọng ổn định phải bật VieNeu.

### 3.3 Làm sạch text và chia chunk

- `spokenText()` strip code fence, link (giữ text), bold/italic, header, bullet,
  hàng phân cách bảng, emoji/★/→… rồi gộp khoảng trắng và **cắt ở ranh giới câu
  với cap 500 ký tự**. Phần còn lại vẫn hiển thị đầy đủ trong bubble chat.
- `chunkForSpeech()` chia text thành từng chunk, ưu tiên dấu câu rồi tới khoảng
  trắng. Giới hạn chunk là `min(TTS_CHUNK_CHARACTERS từ /tts/status, 180)` cho
  engine server và 180 ký tự cho Web Speech — một số engine cắt utterance dài
  (~15 s) nếu gửi nguyên khối.
- Chunk được phát nối tiếp (Audio element hoặc `speak()`); chỉ khi chunk cuối kết
  thúc mới tắt trạng thái "đang đọc".

### 3.4 Dừng và thay thế

- Bấm **Dừng đọc**, gửi câu hỏi mới, mở hội thoại khác hoặc unmount:
  `stopAnswerSpeech()` tăng sequence token, huỷ `AbortController` của các request
  TTS đang chạy, `pause()` audio element và chỉ gọi `speechSynthesis.cancel()` khi
  engine thực sự đang `speaking`/`pending`.
- `speechSeqRef` (sequence token) bảo đảm callback `onend`/`onerror`/`fetch` của
  lượt đọc cũ không ghi đè trạng thái của lượt mới; event `pause` ngoài ý muốn
  (do token đã đổi) được phân loại là `AbortError`.
- Unmount còn revoke toàn bộ blob URL đang cache.

### 3.5 Autoplay và iOS Safari

Server TTS phát bằng `<audio>`, nên quy tắc autoplay của trình duyệt áp dụng:
chrome desktop với `--autoplay-policy` mặc định cần một user gesture trước đó.
Bấm **Nghe lại** chính là gesture đó; câu trả lời tự động đọc (sau câu hỏi giọng
nói) nằm trong kế hoạch priming của click mic. `primeSpeechSynthesis()` phát một
utterance rỗng, volume 0 để mở khoá audio session trên **iOS/iPadOS**
(`needsSpeechPriming()`), vì Safari chỉ cho bắt đầu đọc trong gesture. Không prime
trên desktop: utterance câm đó xếp hàng trước câu trả lời và Chrome có thể đọc câu
xếp sau bằng giọng mặc định của utterance đầu. Nếu trình duyệt vẫn chặn
(`NotAllowedError`), client hiện `voiceSpeechBlocked` — *"Trình duyệt chặn tự
động phát âm thanh. Bấm 'Nghe lại' ở câu trả lời để nghe."*

---

## 4. API endpoints

| Endpoint | Method | Input | Output |
| --- | --- | --- | --- |
| `/api/voice/status` | GET | — | `{ available, provider }` — provider STT đang chọn |
| `/api/voice/transcribe` | POST | Float32 LE mono 16 kHz + `X-Sample-Rate: 16000` | `{ text }` |
| `/api/voice/tts/status` | GET | — | `{ available, provider: 'vieneu', voice, maxChars }` (+ `reason` ở chế độ dev) |
| `/api/voice/tts/speech` | POST | JSON `{ input, voice }`, `input` ≤ `maxChars` | Audio nguyên Content-Type từ engine (`audio/wav` 48 kHz mono mặc định), `Cache-Control: no-store` |

### Bảng lỗi `/transcribe` → thông báo client (vi)

| HTTP | `error` | Nguyên nhân | Thông báo |
| --- | --- | --- | --- |
| 400 | `invalid_audio` / `unsupported_sample_rate` | Body/rate sai | `voiceError` |
| 413 | `audio_too_long` | > 60 giây | `voiceTooLong` |
| 422 | `no_speech` | Im lặng / không nhận ra chữ | `voiceNoSpeech` |
| 429 | `transcription_busy` | Hết slot | `voiceBusy` |
| 503 | `stt_not_configured` | Không provider khả dụng | `voiceSttUnavailable` |
| 502 | `transcription_failed` | Provider lỗi/timeout | `voiceSttError` |

Lỗi phía đọc câu trả lời khi rớt sang Web Speech (không qua API): client hiện
`voiceSpeechUnsupported` (không có giọng/không hỗ trợ), `voiceSpeechError`
(engine lỗi) hoặc `voiceSpeechBlocked` (bị chặn autoplay).

### Bảng lỗi `/tts/speech`

| HTTP | `error` | Nguyên nhân | client |
| --- | --- | --- | --- |
| 400 | `invalid_speech_text` (+ `maxChars`) | `input` rỗng hoặc dài hơn giới hạn chunk | bug chia chunk — không xảy ra |
| 400 | `speech_text_rejected` | Engine từ chối text (cloud chặn >34% ký tự ngoài Latin, từ >30 ký tự không dấu cách) | rơi sang Web Speech |
| 429 | `speech_busy` | Hết slot sau khi đã chờ `TTS_QUEUE_WAIT_MS`, hoặc engine báo queue full sau 3 lần thử | rơi sang Web Speech |
| 502 | `speech_generation_failed` | Engine trả lỗi khác / audio trả về không hợp lệ | rơi sang Web Speech |
| 503 | `tts_unavailable` | VieNeu không trả lời (chưa bật container, 404, probe `/v1/voices` fail) | rơi sang Web Speech |
| 503 | `tts_credentials_rejected` | Cloud 401/403: key sai hoặc bị thu hồi. Không retry; lỗi được "ghim" 60 s nên `/tts/status` báo `available:false` kèm `reason` ngay | rơi sang Web Speech |
| 504 | `speech_generation_timeout` | Quá `TTS_TIMEOUT_MS` cho một chunk | rơi sang Web Speech |

Phản hồi `Retry-After` của cloud được API tôn trọng: chờ đúng thời lượng đó, tối đa
3 lần thử; nếu `Retry-After` ≥ 30 s (vd. `GRANT_DAILY_LIMIT` — phải sang ngày mới
reset) thì fault được ghim lại để mỗi lần bấm **Nghe lại** không đốt quota vô ích.

Nếu đã phát được ít nhất một chunk rồi lỗi giữa chừng, client **không** đọc tiếp
bằng Web Speech (tránh lẫn hai giọng trong một câu) mà hiện `voiceSpeechError`.

---

## 5. Biến môi trường

### 5.1 STT

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `STT_PROVIDER` | auto (`elevenlabs → openai → groq → gemini → sherpa`) | Ép chọn provider |
| `STT_LANGUAGE` | `vi` | Ngôn ngữ ghim cho provider cloud |
| `STT_MAX_CONCURRENCY` | `4` | Số request song song (sherpa luôn là 1) |
| `ELEVENLABS_API_KEY` / `GROQ_API_KEY` / `OPENAI_API_KEY` | — | Key provider tương ứng |
| `STT_ELEVENLABS_MODEL` | `scribe_v2` | |
| `STT_GROQ_MODEL` | `whisper-large-v3-turbo` | |
| `STT_OPENAI_MODEL` | `gpt-4o-transcribe` | |
| `STT_OPENAI_BASE_URL` | `OPENAI_BASE_URL` hoặc OpenAI API | Gateway khác |
| `STT_GEMINI_MODEL` | `gemini-3.1-flash-lite` | |
| `SHERPA_ASR_MODEL_DIR` | `apps/api/models/sherpa-vi` | Chỉ dùng khi fallback Sherpa |

### 5.2 TTS (VieNeu local hoặc cloud)

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `VIENEU_TTS_URL` | `http://127.0.0.1:8001` | Base URL engine. Cloud: `https://api.vieneu.io/api` |
| `VIENEU_TTS_MODEL` | `vieneu-v4` | Model gửi lên `/v1/audio/speech` (local chấp nhận mọi chuỗi) |
| `VIENEU_TTS_FORMAT` | `wav` | `wav` \| `mp3` \| `pcm` \| `opus` \| `ulaw`; local chỉ nhận `wav`/`pcm` |
| `VIENEU_TTS_API_KEY` | — | Gửi `Authorization: Bearer`; cloud bắt buộc (`vn_sk_…`), local bỏ trống |
| `VIENEU_TTS_VOICE` | `Hải Đăng` | Giọng mặc định; `/v1/voices` liệt kê lựa chọn (Trúc Ly, Thiện Minh, Mai Anh, …) |
| `VIENEU_TTS_PROBE_TIMEOUT_MS` | `4000` | Timeout thăm `/v1/voices` (clamp 500–15000); qua WAN nên đặt 6000 |
| `TTS_CHUNK_CHARACTERS` | `150` | Số ký tự tối đa mỗi request, clamp 40–400; client nhận qua `maxChars` |
| `TTS_MAX_CONCURRENCY` | `2` | Số request đồng thời tới engine (VieNeu local chỉ nhận ~2) |
| `TTS_QUEUE_WAIT_MS` | `5000` | Thời gian chờ slot trước khi trả 429 |
| `TTS_TIMEOUT_MS` | `45000` | Timeout một chunk |

Không đặt biến nào cũng chạy: `/tts/status` báo `available: false` khi engine
không trả lời và client tự đọc bằng Web Speech.

**Hai engine, một đường code.** `synthVieneuChunk()` nói chuyện với cùng API
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

1. **STT dùng key AI Studio free-tier có RPM rất thấp** (burst vài request đã
   thấy 429). Bật billing cho Google project hoặc dùng Groq/ElevenLabs.
2. **Muốn STT < 1 s và rẻ nhất:** thêm `GROQ_API_KEY` (~$0.04/giờ audio).
   Muốn WER tiếng Việt tốt nhất: `ELEVENLABS_API_KEY`. Không đổi code — chỉ
   thêm key theo đúng thứ tự ưu tiên.
3. **Quy mô:** STT cloud scale ngang theo phía nhà cung cấp; Sherpa local chỉ
   dành cho single-user dev.
4. **Quyền riêng tư:** audio được forward từ API tới provider STT cloud. Muốn
   giữ audio tại máy: `STT_PROVIDER=sherpa`. Nội dung câu trả lời khi đọc không
   rời trình duyệt (trừ khi hệ điều hành dùng giọng tổng hợp qua mạng, tùy máy).
5. **License:** model Sherpa là CC-BY-NC-ND-4.0 — không dùng thương mại.
6. **TTS cần một engine:** VieNeu chạy local (cổng 8001) hoặc VieNeu cloud
   (`VIENEU_TTS_URL=https://api.vieneu.io/api` + key). Không engine nào thì hệ
   thống vẫn hoạt động — `/tts/status` báo `available: false` và client đọc bằng
   Web Speech — nhưng chất lượng giọng lại phụ thuộc máy người dùng. Muốn giọng
   Việt đồng nhất trên mọi máy thì phải chỉ định `VIENEU_TTS_VOICE` thống nhất.
7. **Tải TTS — số đo thực tế trên CPU (Mac M2, ONNX fp32, RTF 2.75–2.93×):** một
   câu trả lời ~450 ký tự = 3 chunk ≈ 6.5–9.5 s thời gian engine ≈ **6–9 câu/phút
   cho một instance**, và chỉ ~2 người nghe cùng lúc (`TTS_MAX_CONCURRENCY=2` chỉ
   bảo vệ engine, không tăng thông lượng). Nhiều user thì cần thêm instance/GPU
   (VieNeu GPU mặc định 16 stream), không phải chỉnh biến môi trường.
8. **Chọn engine theo chi phí.** Cloud tính theo ký tự (~487 đ/1.000 ký tự với
   `vieneu-v4`; hệ số 1.3 toàn cục), tương đương **~$0.01 cho một câu trả lời**
   và không có chi phí cố định — rẻ nhất ở quy mô hiện tại (free tier
   10.000 token/ngày). Self-host GPU (A5000 ~$0.27/giờ ≈ $195/tháng) chỉ hòa vốn
   từ ~21.000 câu trả lời/tháng. Không deploy Cloud Run scale-to-zero cho VieNeu:
   cold start đo được ~9.6 s, buộc phải giữ min-instances ≈ $490/tháng.
9. **Quyền riêng tư TTS:** text câu trả lời đi từ trình duyệt → API → engine. Với
   VieNeu local nó không rời máy/cụm máy của mình; với cloud nó được gửi tới
   `api.vieneu.io`. Web Speech mới là đường có thể dùng giọng tổng hợp qua mạng,
   tùy hệ điều hành.

### 6.1 Deploy TTS: hai phương án

**A. VieNeu cloud (khuyên dùng khi bắt đầu — 0 chi phí cố định)**

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

**B. VieNeu local / self-host (khi cần privacy hoặc sản lượng lớn)**

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
`available: true` và đúng `voice`. Nếu `available: false`, xem `reason` (chỉ có ở
dev) — phân biệt được "engine chưa bật" (`tts_unavailable`) với "key sai"
(`tts_credentials_rejected`) mà không cần đọc log API.

## 7. Việc đã biết / hướng tiếp theo

- **STT Gemini latency dao động** (2–7 s, có lúc 30 s khi dồn dập): nếu thấy
  chậm, thêm `GROQ_API_KEY` — mọi thứ còn lại giữ nguyên.
- **Electron/embedded browser không có TTS backend** (vd trình duyệt trong app
  Qoder): engine server (wav + `<audio>`) vẫn chạy được, nhưng nếu VieNeu tắt thì
  `speechSynthesis` có API mà `speak()` không bao giờ bắn `start`/`end`, nên
  không có âm thanh. Client dùng watchdog 2,5 s để phát hiện, huỷ utterance và
  hiện `voiceSpeechUnsupported` ("mở bằng Chrome hoặc Safari").
- **Cancel rồi speak ngay** là lỗi đã biết của Chrome: có thể làm engine kẹt,
  utterance mới bị nuốt hoặc bị đọc bằng giọng mặc định. Vì vậy
  `stopAnswerSpeech()` chỉ gọi `cancel()` khi engine đang `speaking`/`pending`;
  nếu vừa cancel, client chờ 120 ms cho hàng đợi lắng rồi mới `speak()`, và sau
  mỗi `speak()` gọi thêm `resume()` (no-op nếu không pause).
- **Chrome liệt kê giọng nhưng lặng lẽ đọc bằng giọng tiếng Anh** (đã gặp trên
  macOS): `getVoices()` trả về `Linh`/`vi-VN` nhưng engine không thật sự dùng
  được voice đó; API của Web Speech không cho biết giọng nào đã phát nên không
  sửa được từ code. Log `[coach-voice]` giữ lại để chẩn đoán khi rơi sang engine
  dự phòng. Đây chính là lý do chuyển TTS về phía server.
- **Các engine từng thử và loại**: *Edge Read Aloud* (miễn phí, không key) bị
  Microsoft chặn handshake websocket từ máy này — 401/403 với mọi biến thể
  `Sec-MS-GEC`/`TrustedClientToken`, không ổn định để phụ thuộc. *Gemini TTS*
  (`gemini-3.8-flash-lite-tts`, voice `Charon`) cho chất lượng tốt nhưng key hiện
  hết quota (429) — còn bị giới hạn bởi key dùng cho STT. *VieNeu* là engine đang
  dùng và có hai cách chạy: **local** (không cần key, audio không rời máy) và
  **cloud** (`api.vieneu.io`, tính tiền theo ký tự nhưng không cần giữ máy chủ).
- **VieNeu là service ngoài**: phải có engine thì `/tts/status` mới báo
  `available: true`. Bản local phải tự chạy (cổng 8001); bản cloud chỉ cần
  `VIENEU_TTS_URL=https://api.vieneu.io/api` + `VIENEU_TTS_API_KEY` — smoke test
  thực tế qua API: `GET /v1/voices` 0.31 s, `POST /v1/audio/speech` một chunk 30
  ký tự trả 224 KB wav sau **1.19 s** (toàn trình, tính cả proxy API), key sai trả
  503 `tts_credentials_rejected` sau 0.08 s và được ghim 60 s. Đổi lại, text câu
  trả lời được gửi tới `api.vieneu.io` và mỗi ký tự đều tính tiền.
- **Đọc dài hơn 500 ký tự**: tăng cap trong `apps/web/lib/speech.ts`; chunking
  đã sẵn sàng cho cả hai engine nên không bị cắt giữa câu.
- **Tên riêng sai khi STT** ("Rengar" → "Gengar"): xử lý bằng Admin → Aliases,
  không sửa code.
