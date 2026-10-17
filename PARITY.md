# Parity report — MetaBoard (reference build of tftacademy.com)

Lane: **reference build**. The source site belongs to a third party with no authorization to copy, so nothing of its brand was reproduced: name, logo, palette, typefaces, copy and imagery are MetaBoard's own. The capture in `capture/` is the pattern record; the rebuild is in the repo root.

Acceptance test for this lane: user review + side-by-side confirming brand difference. No pixel-diff target was set. Screenshots: `capture/source/<page>/page-*.png` vs `capture/rebuild/<page>/page-*.png` at 390/768/1440.

## Template coverage

| Template | Source capture | Rebuild route | Notes |
|---|---|---|---|
| Home | `capture/source/home` | `/` | nav → hero → 6 feature cards → promo → footer; source hero art (Riot champions) replaced by CSS hex art |
| Tier list (comps) | `capture/source/comps` | `/tierlist/comps` | patch bar, display title, tabs, search + style filter (working), S/A/B/C/X rows; each entry shows the carry as its avatar plus title, style, unit count and a trend arrow (`trend` column: up ▲ / down ▼, authored like tiers); clicking expands the full comp panel in place |
| Tier list (items) | `capture/source/items` | `/tierlist/items` | same shell, 12 items |
| Tier list (augments) | `capture/source/augments` | `/tierlist/augments` | same shell, 12 augments |
| Comp detail | `capture/source/comp-detail` | `/tierlist/comps/ahri-spellweaver` | expanded-in-place panel: sidebar (active trait badges — icon + count on the active tier's colour: bronze/silver/unique/gold/prismatic, inactive traits hidden; augments; priority) + final board, early units, item priority, positioning grid, alt builds, tips, stage 2/3/4 |
| Guides index | `capture/source/guides` | `/guides` | featured hero card + category chips (static) + guide cards |
| Guide article | `capture/source/guide-article` | `/guides/economy-first-stage-2` | prose column + related row; placeholder article text for the owner to replace |
| Champions grid | `capture/source/learn-champions` | `/learn/champions` | filter chips (static) + auto-fill grid |
| Media page | `capture/source/studyhall` | `/media` | layout pattern only; no YouTube/Spotify embeds (third-party) — placeholder player panel |
| Legal prose | `capture/source/legal` | `/legal/privacy`, `/legal/terms` | plus `/about` |
| 404 | (source 404 seen on dead `/guides/scholars`) | `/not-found` | own copy |

## Architecture

Three pieces, one repo:

| Piece | Tech | Runs on | Owns |
|---|---|---|---|
| Frontend | Next.js 16 | :3001 dev / :4173 prod | pages, admin UI; proxies `/api/*` to the backend (rewrites) so the browser stays same-origin |
| Backend | Node.js (v26 runs `.ts` directly, no build step) + Express 5 + pg | :4000 | all API routes, auth, validation, CommunityDragon sync |
| Database | PostgreSQL 17 (Homebrew) | :5432 | game data + comps + meta |

## Database

`brew install postgresql@17 && brew services start postgresql@17`, then role/db `metaboard`. Schema: `server/src/schema.sql`, applied by the seed. Tables: `champions`, `traits`, `items`, `augments`, `meta` (patch/set), `comps` + `comp_units`/`comp_items`/`comp_augments`/`comp_stages` (normalized child rows, CHECK constraints on tier/style/difficulty/role, FK cascade).

Stats: `psql -U metaboard -h localhost -d metaboard -c "SELECT (SELECT count(*) FROM champions) champs, (SELECT count(*) FROM comps) comps"`.

## Game data

All set entities are real, from CommunityDragon (Riot's public game-data mirror). Two consumers, one source:

- Postgres (backend's copy — used for API responses + validation): `cd server && npm run seed` syncs game tables; `POST /api/tft/refresh` re-syncs later.
- `lib/tft.json` + `public/tft/**` (Next's copy — used by statically generated pages: champions grid, item/augment boards, admin form datalists — and by the client-side hover detail cards): `npm run fetch-data` in the repo root. Run it after a set update, then rebuild Next.

- Set 18 / patch 16.20.1: 65 champions (PVE monsters and placeholder units filtered, Lux trait variants collapsed), 36 traits, 57 completed items + 10 components, 592 augments. Augment rarity decoded from tag GUIDs (silver/gold/prismatic), noted as a heuristic. Items keep the richest duplicate api entry (DA_* variants carry no text) and their descriptions are cleaned (placeholders substituted, multipliers resolved, floats rounded, keyword refs stripped); champions also carry ability name/description/mana (ability *icons* only exist for a handful of units in the source CDragon dump, the rest fall back to no icon); traits carry their activation thresholds/styles.
- Icon paths in Postgres (`/tft/<folder>/<slug>.png`) point into the Next app's `public/tft`; the sync nulls them out if the file is missing (run `npm run fetch-data` to download).
- Still authored (no public meta API exists): tier assignments, comp build orders, tips and stage text. Structure is real; ratings are placeholders until a meta source is licensed or a match-data pipeline is built.

## Backend API (`server/`, :4000)

- `GET /api/comps` — all comps read from Postgres, enriched with unit cost + icon and item/augment icons, plus computed **active traits** (counts from board unit traits; activation thresholds/styles from the `traits` table, populated from CommunityDragon effects: 1 bronze / 3 silver / 4 unique / 5 gold / 6 prismatic). `GET /api/comps/:slug` — one comp, 404 if absent.
- `GET /api/tft/set` — full set payload from Postgres.
- `POST /api/tft/refresh` — `Authorization: Bearer $REFRESH_TOKEN` (`server/.env`; 503 if unset, 401 on mismatch). Re-fetches CommunityDragon and replaces the game tables in one transaction; comps are untouched.
- Admin: `POST /api/admin/comps` (201/400/409), `PUT|DELETE /api/admin/comps/:slug` (404 on unknown), `POST|DELETE /api/admin/login`. `comps.trend` (`up`/`down`/null) is editable in the form and returned by the API.
- Auth: login sets an httpOnly `mb_admin` cookie (sha256 of `metaboard:<password>`, 12h). Every `/api/admin/*` route is guarded by the backend itself; the Next `middleware.ts` additionally checks the same cookie formula so admin pages redirect to login before rendering. **Keep `ADMIN_PASSWORD` identical in `.env.local` and `server/.env`.**
- Server-side validation on writes (queries game tables): slug format (immutable on PUT), tier/style/difficulty enums, 3-12 units that exist, carry among units, existing items/augments, exactly 3 stage texts. Units accept plain names or `{name, row, col, stars, items}` — coords must be on the 4x7 board (row 0-3, col 0-6), one unit per hex, up to 3 existing items, stars 1-3.
- `comp_units` stores `row`/`col`/`stars` + `items text[]`; responses enrich units (cost, icon, item icons) and legacy null positions render via a fallback layout.
- The Next server components call `backendJson()` (`lib/backend.ts`, `BACKEND_URL`, default `http://127.0.0.1:4000`) for the admin list, edit form and comp detail page. The comps explorer (client) fetches `/api/comps` through the proxy.

## Admin dashboard

- `/admin` — list comps with tier counts; create, edit and delete. `/admin/login` asks for `ADMIN_PASSWORD`. The edit form's **board editor** places units on a 4x7 hex board: pick a champion, click a hex (or drag), click a unit to set stars (1-3), attach up to 3 items, mark the carry, remove; drag to move or swap. Unit lists without coordinates are auto-laid out on load.
- Board visuals (`components/hex-board.tsx` + `.hex-board-*` in `app/globals.css`): flat borderless grey hexes (`#202122`) on a near-black frame (`#0A0D0E`), regular pointy-top hexagons (2/√3 aspect), staggered rows, cell size scales with the container width. Shared by the admin editor and the public "Positioning example" panel.
- Item and augment avatars are rounded squares, not hexes: `ItemTile` (frame colored by the item's tier from the authored item tier list; grey when unranked) and `AugmentTile` (bare rounded image, no frame) in `components/ui.tsx`. Used by the comp panel, admin editor (palette/slots/unit minis), and the items/augments tier list pages. Champion hexes (`UnitHex`) use a scaled inner hexagon so the cost frame keeps an even width over the pointed top.
- Hover detail cards (`components/hover-card.tsx` + `lib/tips.ts`): a single delegated layer (mounted in the root layout) reads `data-tip="kind:name"` on any tile and shows a floating card — champion (traits, cost dots, ability + mana), item (description + build path with component icons), augment (rarity badge + description), trait (breakpoint chips on tier colours + flavour text). Because it keys off the attribute, it covers server- and client-rendered tiles alike (tier lists, comp panel, champions grid). Card data comes from `lib/tft.json`; unknown names simply show nothing.
- Writes go to Postgres through the backend. Changes appear immediately: the comp detail page is `force-dynamic` (fetches the backend per request) and the tier list fetches `/api/comps` client-side. No rebuild needed; static pages are unaffected.
- Single-admin by design (one shared password, no users/roles). Swap in an auth library before exposing this beyond localhost or adding a second editor.
- `npm run seed` (in `server/`) resets comps to `server/seed/comps.json` — it wipes comps created via the admin UI.

## Behaviour checks (rebuild)

- Console: clean on all 13 tested routes. Only 404 response is the intentional `/nope-404` test.
- Network: no request to tftacademy.com; zero external requests (fonts are self-hosted by `next/font`).
- Keyboard: tab order reaches nav → content; visible focus ring (2px brand-soft outline, offset 2).
- Contrast fixes vs source pattern: accent button text moved to `#6a45ff` (white on it ≈ 5.4:1, AA); source's own yellow-on-dark pattern not reused.
- Build: `npm run build` → clean (no `/api` routes in Next anymore; middleware + rewrites present), production server checked at :4173 with the backend up.
- Board editor end-to-end (`node capture/board-e2e.mjs`, needs both servers; reads `ADMIN_PASSWORD` from the gitignored `server/.env`): login → place 3 champions on the hex board → stars/items/carry → save → create fetched from the API with positions intact → public board renders 28 cells → delete. All checks pass; test comp is removed afterwards.
- Hover cards screenshot-verified (`node capture/tip-shot.mjs`): champion card on the comps tier list, item card (description + build path) on the items tier list, augment card on the augments tier list, trait card and comp-panel item card on the comp detail page.

## Known deviations (deliberate)

- All imagery is CSS placeholder art; Riot Games assets are not used or hotlinked. Owner supplies licensed art.
- Nav dropdown opens on hover **and** focus-within (source: hover only) — accessibility improvement, logged here.
- Source "Log in" replaced by a patch-status chip; no account surfaces were built (decline rule).
- Tools (builder, tierlist maker), Academy+ paywall and meta reads are out of scope per `capture/plan.md`.
- Search + style filter actually filter the board (source behaviour confirmed as a filter UI, implemented client-side).

## Owner to do

- Source real meta tiers (win-rate/placement data) to replace the authored ratings; check next set rotation by re-running `npm run fetch-data` (the script picks the highest set number automatically).
- Replace placeholder emails in `legal/*` and `about`.
- Wire real YouTube/Spotify embeds on `/media` if desired.
- Add real social links in `lib/data.ts` (`socials`) and a real favicon if `app/icon.svg` is not wanted.
- Champion/item imagery is Riot game data (CommunityDragon); confirm it fits your Riot Games third-party policy before public launch.

## Run

```
# one-time: Postgres
brew install postgresql@17 && brew services start postgresql@17
psql -d postgres -c "CREATE ROLE metaboard WITH LOGIN PASSWORD 'metaboard';" -c "CREATE DATABASE metaboard OWNER metaboard;"

# backend (:4000) — first run applies the schema and seeds the data
cd server && npm install && npm run seed && npm run dev

# frontend (:3001 dev / :4173 prod) — separate terminal
npm install && npm run dev
npm run build && npm run start   # production preview on :4173

curl http://localhost:4173/api/comps                          # through the Next proxy
curl http://localhost:4000/api/comps                          # direct to the backend
curl -X POST -H "Authorization: Bearer $REFRESH_TOKEN" http://localhost:4000/api/tft/refresh   # REFRESH_TOKEN in server/.env

# admin: open http://localhost:4173/admin and sign in with ADMIN_PASSWORD (server/.env, mirrored in .env.local)
# full set update: npm run fetch-data (repo root, downloads icons + lib/tft.json) → rebuild Next → POST /api/tft/refresh
node capture/shots.mjs capture/sources-rebuild.json capture/sections-rebuild.json capture/rebuild http://localhost:4173   # recapture rebuild
node capture/check-rebuild.mjs http://localhost:4173   # console/network/focus sanity check
```
