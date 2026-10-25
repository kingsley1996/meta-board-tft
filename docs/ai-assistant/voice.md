# Voice: nhận dạng giọng nói (STT) và đọc câu trả lời (TTS) của Coach AI

> Cập nhật: 2026-10-25. Toàn bộ số liệu trong tài liệu này là số đo thực tế trên
> môi trường dev (macOS arm64, API Node 22, VieNeu CPU ONNX).

## 1. Luồng tổng thể

```
┌─ Trình duyệt (assistant-chat.tsx) ──────────────────────────────────────┐
│  Mic → AudioWorklet (audio-capture-processor.js)                        │
│      → Float32 mono @ device rate, tối đa 60 giây                       │
│      → resample về 16 kHz (OfflineAudioContext)                         │
│      → POST /api/voice/transcribe  (octet-stream, X-Sample-Rate: 16000) │
│  Nhận { text } → ghép vào input → gửi câu hỏi cho Coach AI              │
│      → answer → spokenText() làm sạch + cắt 500 ký tự                   │
│      → POST /api/voice/tts/speech { input }                             │
│      → nhận audio/wav → new Audio(blobURL).play()                       │
└─────────────────────────────────────────────────────────────────────────┘
          │                                   ▲
          ▼                                   │
┌─ API (apps/api/src/voice.ts) ───────────────────────────────────────────┐
│  STT: elevenlabs → openai → groq → gemini → sherpa (auto theo key)      │
│  TTS: gemini (primary) → fallback vieneu local                          │
│  Slot/queue chung cho TTS, slot riêng cho STT                           │
└─────────────────────────────────────────────────────────────────────────┘
```

File liên quan:

| File | Vai trò |
| --- | --- |
| `apps/api/src/voice.ts` | Routes `/api/voice/*`, chọn provider, slot/queue, gọi API đám mây |
| `apps/web/components/assistant/assistant-chat.tsx` | Ghi âm, resample, gọi transcribe/tts, phát audio, `spokenText()` |
| `apps/web/public/audio-capture-processor.js` | AudioWorklet thu PCM thô từ mic |
| `apps/web/components/admin/alias-manager.tsx` | Mic test trong Admin → Aliases (dùng chung `/transcribe`) |
| `apps/api/src/voice.test.ts` | Unit test WAV encoder + logic chọn provider |

Tất cả cấu hình qua biến môi trường trong `apps/api/.env` (mẫu đầy đủ ở
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

### 3.1 Provider

| Provider | Chọn khi | Đặc điểm đo thực tế |
| --- | --- | --- |
| **Gemini TTS** (`gemini-3.8-flash-lite-tts`, voice `Charon`) | Có `GOOGLE_API_KEY` (mặc định `auto`) | ~3 s / câu ngắn, **chạy đồng thời song song** (3 request cùng lúc đều ~2.5 s tổng), tổng hợp trên hạ tầng Google |
| **VieNeu-TTS v3 Turbo** (local `127.0.0.1:8001`) | Không có key, hoặc fallback, hoặc `TTS_PROVIDER=vieneu` | CPU ONNX, không streaming: 300 ký tự ≈ 16 s, 700 ≈ 21 s, 1240 ≈ **48 s**; single-slot; giữ slot suốt quá trình tổng hợp |

`TTS_PROVIDER=auto` (mặc định): gemini nếu có key, không thì vieneu. Khi gemini
bị 429 quota hoặc lỗi, **tự fallback sang vieneu** (chỉ trong chế độ auto — ép
`TTS_PROVIDER=gemini` sẽ không fallback).

Chất lượng tiếng Việt đã xác minh bằng round-trip (tổng hợp → STT đọc lại): đúng
nguyên văn, kể cả từ tiếng Anh ("Bloodthirster").

### 3.2 Slot và hàng đợi (`/api/voice/tts/speech`)

- Slot tối đa: `TTS_MAX_CONCURRENCY` (mặc định 4; vieneu luôn là 1).
- Request dư được **xếp hàng chờ tối đa `TTS_QUEUE_WAIT_MS`** (mặc định 5000 ms)
  thay vì báo lỗi ngay — chớp nhoáng nhiều user không gây lỗi.
- Hết thời gian chờ chưa có slot → `429 speech_busy` (client hiển thị
  "Dịch vụ giọng nói đang xử lý bản ghi khác…").
- Client ngắt kết nối giữa chừng (hỏi câu mới, bấm dừng) → abort upstream ngay
  để trả slot, không chờ tổng hợp xong.

### 3.3 Làm sạch văn bản trước khi đọc (`spokenText`)

Câu trả lời của Coach AI viết để **đọc**, không để đọc thành tiếng: markdown,
emoji, ★, →, bảng… nếu gửi thẳng sẽ bị đọc thành ký hiệu hoặc rơi lỗi. Vì vậy
client:

1. Strip code fence, link (giữ text), bold/italic, header, bullet, hàng phân
   cách bảng, ký tự trang trí (emoji/★/→/✓…).
2. Gộp khoảng trắng, **cắt ở ranh giới câu** với cap `maxSpokenCharacters = 500`.

Con số 500 đến từ đo thực tế: VieNeu tổng hợp 1240 ký tự mất 48 giây và tạo
~70 giây audio — quá dài cho voice. Toàn bộ nội dung vẫn hiển thị trong bubble
chat; voice chỉ đọc phần mở đầu. Nếu muốn đọc dài hơn: tăng hằng số này và chấp
nhận thời gian chờ tăng super-linear, hoặc làm chunked/streaming synthesis
(xem §7).

> Bài học từ bug đã sửa: trước khi có bước này, câu trả lời > 2000 ký tự khiến
> API trả `400 invalid_speech_text` và client hiển thị lỗi chung "Không thể phát
> câu trả lời của Coach AI." — lỗi 400 vẫn giữ ở server như rào chắn cuối.

### 3.4 Tự động phát và policy của trình duyệt

`audio.play()` sau chuỗi await dài (chờ answer + tổng hợp) có thể bị Chromium từ
chối vì hết transient activation của cú click ban đầu (`NotAllowedError`).
Client bắt riêng lỗi này và hiển thị: *"Trình duyệt chặn tự động phát âm thanh.
Bấm 'Nghe lại' ở câu trả lời để nghe."* — nút **Nghe lại** là cú click thật nên
luôn phát được.

---

## 4. API endpoints

| Endpoint | Method | Input | Output |
| --- | --- | --- | --- |
| `/api/voice/status` | GET | — | `{ available, provider }` — provider STT đang chọn |
| `/api/voice/tts/status` | GET | — | `{ available, provider }` — provider TTS đang chọn |
| `/api/voice/transcribe` | POST | Float32 LE mono 16 kHz + `X-Sample-Rate: 16000` | `{ text }` |
| `/api/voice/tts/speech` | POST | JSON `{ input }` (≤ 2000 ký tự) | `audio/wav` |

### Bảng lỗi `/transcribe` → thông báo client (vi)

| HTTP | `error` | Nguyên nhân | Thông báo |
| --- | --- | --- | --- |
| 400 | `invalid_audio` / `unsupported_sample_rate` | Body/rate sai | `voiceError` |
| 413 | `audio_too_long` | > 60 giây | `voiceTooLong` |
| 422 | `no_speech` | Im lặng / không nhận ra chữ | `voiceNoSpeech` |
| 429 | `transcription_busy` | Hết slot | `voiceBusy` |
| 503 | `stt_not_configured` | Không provider khả dụng | `voiceSttUnavailable` |
| 502 | `transcription_failed` | Provider lỗi/timeout | `voiceSttError` |

### Bảng lỗi `/tts/speech` → thông báo client (vi)

| HTTP | `error` | Nguyên nhân | Thông báo |
| --- | --- | --- | --- |
| 400 | `invalid_speech_text` | Input rỗng / > 2000 ký tự | `voiceSpeechError` |
| 429 | `speech_busy` | Hết slot sau khi hết hàng đợi | `voiceBusy` |
| 503 | `vieneu_unavailable` / `tts_not_configured` | VieNeu không chạy / không provider | `voiceTtsUnavailable` |
| 502 | `speech_generation_failed` | Provider trả lỗi | `voiceSpeechError` |
| 504 | `speech_generation_timeout` | Quá 120 s (vieneu) / 30 s (gemini) | `voiceSpeechError` |

---

## 5. Biến môi trường

### STT

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

### TTS

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `TTS_PROVIDER` | auto (`gemini` nếu có key, không thì `vieneu`) | Ép chọn engine |
| `TTS_MAX_CONCURRENCY` | `4` | Số synthesis song song (vieneu luôn 1) |
| `TTS_QUEUE_WAIT_MS` | `5000` | Chờ slot tối đa trước khi 429 |
| `TTS_GEMINI_MODEL` | `gemini-3.8-flash-lite-tts` | |
| `TTS_GEMINI_VOICE` | `Charon` | Voice dựng sẵn của Gemini (vd `Kore`, `Aoede`) |
| `VIENEU_TTS_URL` | `http://127.0.0.1:8001` | Service VieNeu local |
| `VIENEU_TTS_API_KEY` / `VIENEU_TTS_VOICE` | — / `Hải Đăng` | |

---

## 6. Vận hành production

1. **Bật billing cho Google project.** Key AI Studio free-tier có RPM rất thấp
   với model TTS/STT (burst vài request đã thấy 429). Chi phí cloud dạng này
   không đáng kể với lưu lượng chat.
2. **Muốn STT < 1 s và rẻ nhất:** thêm `GROQ_API_KEY` (~$0.04/giờ audio).
   Muốn WER tiếng Việt tốt nhất: `ELEVENLABS_API_KEY`. Không đổi code — chỉ
   thêm key theo đúng thứ tự ưu tiên.
3. **Quy mô:** STT/TTS cloud scale ngang theo phía nhà cung cấp; phần local
   (sherpa/vieneu) chỉ dành cho single-user dev.
4. **Quyền riêng tư:** khi dùng provider cloud, audio được forward từ API tới
   nhà cung cấp đó. Muốn giữ audio tại máy: `STT_PROVIDER=sherpa` +
   `TTS_PROVIDER=vieneu`.
5. **License:** model Sherpa là CC-BY-NC-ND-4.0 — không dùng thương mại.
   VieNeu: Apache-2.0.

## 7. Việc đã biết / hướng tiếp theo

- **STT Gemini latency dao động** (2–7 s, có lúc 30 s khi dồn dập): nếu thấy
  chậm, thêm `GROQ_API_KEY` — mọi thứ còn lại giữ nguyên.
- **TTS đọc dài hơn**: hiện cap 500 ký tự vì VieNeu/gemini trả audio sau khi
  tổng hợp xong toàn bộ. Hướng đúng: chia câu trả lời thành từng câu, tổng hợp
  và phát tuần tự (cần server cho phép nhiều job VieNeu song song hoặc dùng
  hoàn toàn cloud).
- **Tên riêng sai** ("Rengar" → "Gengar"): xử lý bằng Admin → Aliases, không sửa
  code.
- TTS stream từng chunk để giảm first-audio latency dưới ~1 s.
