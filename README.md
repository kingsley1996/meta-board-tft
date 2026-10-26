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

Coach AI transcribes Vietnamese voice questions server-side. The API walks a
failover chain of every speech-to-text provider whose key is configured, in the
order measured on this project's corpus (`apps/api/scripts/stt-bench.mjs`):

1. Deepgram — `DEEPGRAM_API_KEY` (model `nova-3`); lowest Vietnamese WER
   (0.063 on a 14 s clip) and the highest rate limit of the group.
2. Groq — `GROQ_API_KEY` (model `whisper-large-v3-turbo`); fastest (~0.6 s) and
   free up to 20 requests/minute.
3. ElevenLabs Scribe — `ELEVENLABS_API_KEY` (model `scribe_v2`).
4. OpenAI — `OPENAI_API_KEY` (model `gpt-4o-transcribe`).
5. Google Gemini — `GOOGLE_API_KEY`, reused from the assistant LLM provider; last
   because its free tier 429s at ~17 requests/minute and rewrites pronouns.

A provider that answers 429 is skipped for `STT_BUSY_COOLDOWN_MS` (default 30 s,
`Retry-After` aware) and the turn continues with the next one, so a quota wall
costs one doomed request per window instead of one per user question. 401/402/403
credentials failures are skipped for 60 s. `GET /api/voice/status` lists the chain
and who is cooling down; every `/api/voice/transcribe` response carries
`X-STT-Provider`.

Set `STT_PROVIDER` to force one provider (OpenRouter is only reachable this way —
its audio endpoint needs a separate prepaid balance), `STT_LANGUAGE` to change the
pinned language (default `vi`), and `STT_MAX_CONCURRENCY` to cap parallel cloud
requests (default 4). The remaining tunables (`STT_*_MODEL`, `STT_OPENAI_BASE_URL`)
are listed in `apps/api/.env.example`. English speech input continues to use the
browser's speech-recognition service. Finishing a voice question submits it
automatically; the corresponding Coach AI reply is then read aloud by the
server-side TTS (engine chosen by `TTS_PROVIDER`); when both engines fail the
client shows an error instead of switching to the browser's Web Speech API.

Vietnamese speech input is cloud-only: recordings are forwarded from the API to
the provider that answers. Without any STT key the voice button reports
`stt_not_configured` and text questions keep working. The reply a user hears is
read server-side by the engine set in `TTS_PROVIDER` (`deepgram` by default, or
`vieneu`); if the primary engine has no key, is cooling down after a rate limit,
or fails on a chunk, the API retries that chunk on the other engine. When both
engines fail the assistant shows an error; there is no browser speech fallback.

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

### Coach AI speech output (Deepgram Flux / VieNeu, switchable)

`TTS_PROVIDER` picks the engine that speaks first: `deepgram` (default) or
`vieneu`. The other engine remains the per-chunk fallback, so switching does not
need a code change. On this dev machine the Flux batch endpoint measured ~4 s for
a 60-character chunk and ~5–6 s for 130–150 characters, while warm VieNeu
measured ~2–4 s per chunk — set `TTS_PROVIDER=vieneu` when latency matters more
than the Flux voice.

Coach AI answers are proxied on `/api/voice/tts/speech`. Vietnamese is not on
Aura/Aura-2 (English-only), so the API uses Flux's batch endpoint
`POST https://api.deepgram.com/v2/speak` with `model=flux-minh-vi` (or
`flux-hoa-vi` via `DEEPGRAM_TTS_MODEL`) and the same `DEEPGRAM_API_KEY` as
speech-to-text. Flux Vietnamese is Early Access without text normalization, so
numbers and dates are read as written.

When the primary engine has no key, answers `429`, rejects its key, or fails a
chunk, the API retries that same chunk on the other engine. VieNeu is the hosted
`https://api.vieneu.io/api` (set `VIENEU_TTS_URL` + `VIENEU_TTS_API_KEY`; billed
per character). The local VieNeu engine is no longer part of the runtime: without
`VIENEU_TTS_URL` the engine is skipped. The successful engine is named in the
`X-TTS-Provider` response header, and a rejected key is remembered for 60 s
instead of being retried on every chunk.

The browser requests one chunk at a time and prefetches exactly one chunk ahead,
so the next sentence is already decoded when the current one finishes. Chunk
audio is cached as blob URLs keyed by text, so **Listen again** replays instantly
without re-synthesizing. The answer is stripped of markdown/emoji, capped at 500
characters on a sentence boundary and split into ≤180-character chunks.

If neither engine answers, `GET /api/voice/tts/status` reports `available: false`
(or playback fails) and the assistant shows an error; the full answer stays in
the chat bubble. There is no `window.speechSynthesis` fallback: it silently read
Vietnamese with an English voice on this machine, which is what moved TTS
server-side.

Every answer — typed or spoken — has a **Listen again** button; replies to voice
questions start playing automatically, and a browser that blocks autoplay shows a
"select Listen again" message instead. Configure the engines with
`DEEPGRAM_TTS_*`, `VIENEU_TTS_*` and `TTS_*` (see `apps/api/.env.example`). Full
voice reference: [docs/ai-assistant/voice.md](docs/ai-assistant/voice.md).

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
assistant ran it (intent, entity resolution, tool calls with arguments, every
model call, validation, fallback, final answer); filter by request or
conversation ID. Each model call records the provider, model, messages sent,
raw response, token usage, latency, every attempt/retry and the failure that
triggered a fallback, so answer quality can be audited end to end. The
near-constant system prompt is stored as a SHA-256 prefix, character count and
short preview (the per-request evidence is in the messages, so nothing request
specific is lost); messages are truncated at 8k characters and responses at
20k, never summarized away. No hidden chain-of-thought is stored. Access is
protected by the admin session. Deleting a conversation also deletes its
traces, and rows older than `ASSISTANT_REASONING_RETENTION_DAYS` (default 30)
are pruned daily.
The `assistant_reasoning_logs` table is defined in `apps/api/src/schema.sql`.

## Build and deploy separately

Target layout: **web on Vercel**, **API on Render**, **Postgres on Supabase**.
`vercel.json`, `render.yaml` and `.node-version` carry the settings, so the two
platforms build the same commands this section lists.

Deploy both workspaces from the repository root so npm can resolve the local
shared package:

```sh
npm run build --workspace @metaboard/web
npm run start --workspace @metaboard/web

npm run typecheck --workspace @metaboard/api
npm run start --workspace @metaboard/api
```

Configure `BACKEND_URL` on the web deployment, at build and runtime, to the deployed API origin. The
API deployment needs its own `DATABASE_URL`, `REFRESH_TOKEN`, and a one-time
`ADMIN_EMAIL`/`ADMIN_SEED_PASSWORD` pair to bootstrap the first admin account,
plus optional assistant settings; the web deployment should receive only the
settings it uses. Both environments are supplied by the hosting platform, not
committed `.env` files.

`DATABASE_URL` must be the Supabase **pooler** string, not the direct one: the
direct host is IPv6-only and Render has no IPv6. Session mode (`…pooler.supabase.com:5432`)
is the mode this API needs — see `apps/api/.env.example`.

`GET /api/health` (no database) is Render's health-check path; `GET
/api/health/ready` additionally proves the pool can reach Postgres.

Run checks from the repository root with `npm run typecheck`,
`npm run test:server`, and `npm run test:e2e`. GitHub Actions runs the first two
plus the production web build and a database-less API boot on the pinned
`.node-version`; Playwright stays a local gate.
