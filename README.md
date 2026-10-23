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

### Experimental Vietnamese speech input

Coach AI can use the local Sherpa-ONNX Vietnamese model instead of browser
speech recognition. Download its model files before starting the API:

```sh
npm run download:sherpa-model --workspace @metaboard/api
```

The API runs inference on its own machine; recorded speech is sent to that API
and is not sent to a speech-recognition provider. Keep the API local if audio
must remain on your device. The downloadable model is licensed
CC-BY-NC-ND-4.0 and is for local non-commercial evaluation only; do not deploy
it commercially without permission. English speech input continues to use the
browser's speech-recognition service. Finishing a voice question submits it
automatically; the corresponding Coach AI reply is then read aloud by the
local VieNeu-TTS service when it is running.

Curated legacy item names, trait synonyms, and shortened comp names live in
`apps/api/src/assistant/entity-aliases.ts`. Add aliases there against canonical
current-set names or comp slugs; localized names in the shared TFT catalog are
included automatically.

Custom Coach AI aliases can be managed from **Admin → Aliases**. Select an
entity, add an alternate name, and remove outdated aliases from the same page.
These aliases are stored in PostgreSQL and loaded by the Coach AI catalog;
the required tables are created automatically when needed and are also included in
`apps/api/src/schema.sql`. The page also provides a microphone test using the
configured Sherpa Vietnamese speech-recognition model; review or edit its
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

### Experimental Coach AI speech output (VieNeu-TTS v3 Turbo)

VieNeu runs as a separate local service; the API proxies speech requests to
`http://127.0.0.1:8001` by default. Start it from a separate checkout of the
[VieNeu-TTS repository](https://github.com/pnnbao97/VieNeu-TTS):

```sh
git clone https://github.com/pnnbao97/VieNeu-TTS.git
cd VieNeu-TTS
uv sync
PORT=8001 uv run python -m apps.openai_speech
```

The first start downloads and loads the model. VieNeu v3 Turbo runs on CPU via
ONNX on macOS; it does not require a GPU. The API uses the built-in `Hải Đăng`
voice by default, and the API connects to `http://127.0.0.1:8001` by default.
Set `VIENEU_TTS_URL`, `VIENEU_TTS_API_KEY`, or `VIENEU_TTS_VOICE` in
`apps/api/.env` only when you need to override those defaults, then restart the
API. Voice replies from Coach AI are generated and played through VieNeu;
Sherpa remains the speech-recognition engine. VieNeu model and preset voice
licensing is declared Apache-2.0 by its authors. Generated audio is requested
only for voice-triggered assistant replies.

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
