# MetaBoard

MetaBoard is an npm-workspaces monorepo. The web app and API have separate
packages and deployment entry points; `@metaboard/shared` contains only code
and data used by both.

## Structure

- `apps/web` — Next.js frontend, browser assets, and frontend data scripts.
- `apps/api` — Express API, database schema/seeds, assistant, and API-owned
  knowledge data.
- `packages/shared` — shared game data, mechanics helpers, translation catalog,
  and translation worklists.

## Local development

Install dependencies once from the repository root:

```sh
npm install
```

Use Node.js 22.18 or newer (the API runs TypeScript directly with Node).

Run the services in separate terminals:

```sh
npm run dev:api
npm run dev:web
```

The API loads `apps/api/.env` when present. The web app proxies `/api/*` to
`BACKEND_URL` (default `http://127.0.0.1:4000`), keeping browser requests
same-origin.

### Vietnamese speech input (cloud STT with local fallback)

Full voice reference — providers, env vars, error codes, measured latencies,
and production notes: [docs/ai-assistant/voice.md](docs/ai-assistant/voice.md).

Coach AI transcribes Vietnamese voice questions server-side. The API picks the
first speech-to-text provider whose key is configured, in Vietnamese accuracy
order:

1. ElevenLabs Scribe — `ELEVENLABS_API_KEY` (model `scribe_v2`); best published
   Vietnamese WER (~3%).
2. OpenAI — `OPENAI_API_KEY` (model `gpt-4o-transcribe`).
3. Groq — `GROQ_API_KEY` (model `whisper-large-v3-turbo`); cheapest (~$0.04 per
   hour of audio) and fastest.
4. Google Gemini — `GOOGLE_API_KEY`, reused from the assistant LLM provider, so
   no extra signup.
5. The local Sherpa-ONNX model as an offline fallback when no key is set:

```sh
npm run download:sherpa-model --workspace @metaboard/api
```

Set `STT_PROVIDER` to force one provider, `STT_LANGUAGE` to change the pinned
language (default `vi`), and `STT_MAX_CONCURRENCY` to cap parallel cloud
requests (default 4). The remaining tunables (`STT_*_MODEL`, `STT_OPENAI_BASE_URL`)
are listed in `apps/api/.env.example`. English speech input continues to use the
browser's speech-recognition service. Finishing a voice question submits it
automatically; the corresponding Coach AI reply is then read aloud by the
server-side Vietnamese TTS engine (VieNeu), falling back to the browser's Web
Speech API when that engine is not running.

With a cloud provider, recordings are forwarded from the API to that provider;
with `STT_PROVIDER=sherpa` audio stays on the API machine. The downloadable
Sherpa model is licensed CC-BY-NC-ND-4.0 and is for local non-commercial
evaluation only; commercial deployments should use a cloud provider.

Curated legacy item names, trait synonyms, and shortened comp names live in
`apps/api/src/assistant/entity-aliases.ts`. Add aliases there against canonical
current-set names or comp slugs; localized names in the shared TFT catalog are
included automatically.

Custom Coach AI aliases can be managed from **Admin → Aliases**. Select an
entity, add an alternate name, and remove outdated aliases from the same page.
These aliases are stored in PostgreSQL and loaded by the Coach AI catalog;
the required tables are created automatically when needed and are also included in
`apps/api/src/schema.sql`. The page also provides a microphone test using the configured Vietnamese
speech-to-text provider; review or edit its
transcript and select **Use transcript as alias** to prefill the alias form.
After each non-injection Coach AI query, a background entity-extraction pass
checks for explicitly mentioned champion, item, trait, augment, and comp names
that do not exactly resolve in the active catalog. The extracted name and
expected type are added to **Unresolved names** regardless of which answer
path returned, including deterministic early answers. Reviewers must select
the canonical entity and approve it before it becomes an active alias; the
original user question is not stored. This background pass uses the configured
local assistant model and does not delay the response; capture failures are
logged by the API.

### Coach AI speech output (VieNeu TTS + browser fallback)

Coach AI answers are read aloud by **VieNeu**, which the API proxies on
`/api/voice/tts/speech`. Two engines, one code path: a local service (default
`http://127.0.0.1:8001`, free, audio never leaves your machine, serves two
concurrent requests) or the hosted `https://api.vieneu.io/api` (set
`VIENEU_TTS_URL` + `VIENEU_TTS_API_KEY`; billed per character, no server to run,
300 requests/min per key). The browser requests one chunk at a time and prefetches
exactly one chunk ahead — beyond two concurrent requests VieNeu answers `429` — so
the next sentence is already decoded when the current one finishes: a 356-character
answer starts sounding after ~1.5 s and plays in 6 s with no gap, versus 12.2 s for a
single request. Chunk audio is cached as blob URLs keyed by voice + text, so
**Listen again** replays instantly without re-synthesizing.

If no engine answers, `GET /api/voice/tts/status` reports
`available: false` and the client switches to `window.speechSynthesis` with no
error message. A cloud key that is wrong or revoked is remembered for 60 s instead of
being retried on every chunk. That fallback strips markdown and emoji, caps the answer at 500
characters on a sentence boundary, and splits it into ≤180-character chunks; the
voice follows the language of the answer (Vietnamese diacritics force `vi-VN`
even on the English UI) and prefers locally installed voices. The browser engine
is only a fallback: Chrome on this machine lists `Linh/vi-VN` yet still speaks
Vietnamese text with an English voice, which is what moved TTS server-side. Edge
Read Aloud was tested and is unusable here (Microsoft rejects the websocket
handshake with 401/403), and the Gemini key is quota-limited.

Every answer — typed or spoken — has a **Listen again** button; replies to voice
questions start playing automatically. Clicking the mic primes the audio session
so iOS Safari allows playback later; if a browser blocks autoplay or has no
matching voice, the assistant shows a message and the full answer stays in the
chat bubble. Configure the engine with `VIENEU_TTS_*` and `TTS_*` (see
`apps/api/.env.example`). Full voice reference:
[docs/ai-assistant/voice.md](docs/ai-assistant/voice.md).

### Accounts: email + Google sign-in

Users can register with email + password or continue with Google. Email
verification is currently skipped (`AUTH_REQUIRE_EMAIL_VERIFICATION`, default
false): new registrations are auto-verified and signed in immediately. Set it to
`true` at production launch to require the emailed verification link (sent via
the mailer seam below). The API owns `users`, `user_sessions`, and `email_tokens`
in Postgres; sessions are opaque tokens in an `mb_session` HttpOnly cookie
(30 days). Verification links are sent through the mailer seam in
`src/mailer.ts` — the default console mailer prints them to the API log, wire a
real provider (Resend/SMTP) there for production. Google sign-in needs
`GOOGLE_OAUTH_CLIENT_ID`/`SECRET` (redirect
`<site>/api/auth/google/callback`); it links to an existing account when the
Google email matches. Conversations created while signed in attach to the
account, so Coach AI history follows the user across devices. See
`apps/api/.env.example` for `AUTH_*` variables.

### Coach AI decision traces

Admin users can inspect recent Coach AI events at **Admin → Assistant
reasoning**. Traces are grouped per request and show each step in the order the
assistant ran it (intent, entity resolution, tool calls with arguments,
generation, validation, fallback, final answer); filter by request or
conversation ID. Traces store short input/output summaries rather than
private model chain-of-thought. Access is protected by the admin session.
Deleting a conversation also deletes its traces, and rows older than
`ASSISTANT_REASONING_RETENTION_DAYS` (default 30) are pruned daily.
The `assistant_reasoning_logs` table is defined in `apps/api/src/schema.sql`.

## Build and deploy separately

Deploy both workspaces from the repository root so npm can resolve the local
shared package:

```sh
npm run build --workspace @metaboard/web
npm run start --workspace @metaboard/web

npm run typecheck --workspace @metaboard/api
npm run start --workspace @metaboard/api
```

Configure `BACKEND_URL` on the web deployment, at build and runtime, to the deployed API origin. The
API deployment needs its own `DATABASE_URL`, `ADMIN_PASSWORD`, `REFRESH_TOKEN`,
and optional assistant settings; the web deployment should receive only the
settings it uses. Both environments are supplied by the hosting platform, not
committed `.env` files.

Run checks from the repository root with `npm run typecheck`,
`npm run test:server`, and `npm run test:e2e`.
