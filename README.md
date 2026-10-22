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
