# Parity report — TFTIQ (reference build of tftacademy.com)

Lane: **reference build**. The source site belongs to a third party with no authorization to copy, so nothing of its brand was reproduced: name, logo, palette, typefaces, copy and imagery are TFTIQ's own. The capture in `capture/` is the pattern record; the rebuild is in `apps/web/`.

Current workspace layout and deployment commands are documented in [`README.md`](./README.md). Some file paths in this historical parity report predate the move to `apps/web`, `apps/api`, and `packages/shared`.

Acceptance test for this lane: user review + side-by-side confirming brand difference. No pixel-diff target was set. Screenshots: `capture/source/<page>/page-*.png` vs `capture/rebuild/<page>/page-*.png` at 390/768/1440.

## Template coverage

| Template | Source capture | Rebuild route | Notes |
|---|---|---|---|
| Home | `capture/source/home` | `/` | nav → hero → 6 feature cards → promo → footer; source hero art (Riot champions) replaced by CSS hex art |
| Tier list (comps) | `capture/source/comps` | `/tierlist/comps` | patch bar, display title, tabs, search + style filter (working), S/A/B/C/X rows; each entry shows the carry as its avatar plus title, style, unit count and a trend arrow (`trend` column: up ▲ / down ▼, authored like tiers); clicking expands the full comp panel in place |
| Tier list (items) | `capture/source/items` | `/tierlist/items` | same shell, 12 items |
| Tier list (augments) | `capture/source/augments` | `/tierlist/augments` | same shell, 12 augments |
| Comp detail | `capture/source/comp-detail` | `/tierlist/comps/ahri-spellweaver` | expanded-in-place panel: sidebar (active trait badges — icon + count on the active tier's colour: bronze/silver/unique/gold/prismatic, inactive traits hidden; augments; priority) + final board, early units, item priority, positioning grid, alt builds, tips, stage 2/3/4 |
| Guides index | `capture/source/guides` | `/guides` | featured hero card + category chips (static) + guide cards; content comes from Postgres via `/admin/guides` |
| Guide article | `capture/source/guide-article` | `/guides/economy-first-stage-2` | prose column + related row; six authored guides (economy, slams, rolling, positioning, tier-reading, augments) with vi translations |
| Champions grid | `capture/source/learn-champions` | `/champions` | grid → per-champion pages (`/champions/<slug>`: traits, mana, ability + keyword definitions, item frequency counted from comps, comps list); `/learn/champions` redirects here |
| Items database | (extended build) | `/items` | every item, including emblems, radiant and Ornn (artifact) gear, with build path + description; search + completed/component/emblem/radiant/Ornn tabs, server-side via query params (linkable) |
| Augments database | (extended build) | `/augments` | search + rarity filter (rarity = highest decoded tier per display name) |
| Mechanics tables | (own addition) | `/tables/gold-income` | gold income (base per round, interest, streak bonus) from `lib/mechanics.ts`, hand-checked; shop odds, pool sizes and XP now live in the mirrored tftflow table page `/tables/shop-odds-pool-size-xp-table` (same numbers, XP 7→8 corrected to 56) |
| Loot & drop tables | (own addition) | `/tables`, `/tables/<slug>` | 30 Set 18 loot tables mirrored from tftflow.com (`lib/loot-tables.json`, rebuilt by the private crawler repo); index mirrors the tftflow hub layout (System / Traits / Augments / Items / Champions / Encounters, trait splash cards), every table has its own page with weighted outcomes, stage groups, trait boards and augment odds; all art is copied into `public/tft/loot` so nothing hotlinks the source site |
| Economy strategies | (own addition) | `/economy` | the eight Set 18 economy strategies with their round-by-round plan (`lib/economy.json`, rebuilt by the private crawler repo); every comp shows its strategy chip and level curve, comps that only exist on tftflow are added with `npm run seed:economy` |
| Team builder | (own addition) | `/builder` | public board builder reusing the hex board: palette with search + trait filter, drag/click placement, stars/items/carry, 12-unit cap; share via `?b=` (base64url) |
| Tier list maker | (own addition) | `/tier-maker` | rank champions into S/A/B/C/X by drag or click, share via `?t=` |
| Comp quiz | (own addition) | `/quiz` | pick ≤3 starting units + ≤2 items; comps scored (early ×3, board ×2, items ×2), top 3 with links |
| Newsletter signup | (own addition) | footer form | `POST /api/subscribe` → `subscribers` table; list + delete at `/admin/subscribers` (sending is manual) |
| Media page | `capture/source/studyhall` | `/media` | layout pattern only; no YouTube/Spotify embeds (third-party) — placeholder player panel |
| Legal prose | `capture/source/legal` | `/legal/privacy`, `/legal/terms` | plus `/about` |
| 404 | (source 404 seen on dead `/guides/scholars`) | `/not-found` | own copy |

Site nav: dropdowns **Comps** (comp/item/augment rankings), **Database** (champions, items, augments, tables), **Tools** (builder, tier maker, quiz), plus Guides and Media links.

## Architecture

Three pieces, one repo:

| Piece | Tech | Runs on | Owns |
|---|---|---|---|
| Frontend | Next.js 16 | :3001 dev / :4173 prod | pages, admin UI; proxies `/api/*` to the backend (rewrites) so the browser stays same-origin |
| Backend | Node.js (v26 runs `.ts` directly, no build step) + Express 5 + pg | :4000 | all API routes, auth, validation, CommunityDragon sync |
| Database | PostgreSQL 17 (Homebrew) | :5432 | game data + comps + meta |

## Database

`brew install postgresql@17 && brew services start postgresql@17`, then role/db `metaboard`. Schema: `apps/api/src/schema.sql`, applied by the seed. Tables: `champions`, `traits`, `items`, `augments`, `meta` (patch/set), `comps` + `comp_units`/`comp_items`/`comp_augments`/`comp_stages` (normalized child rows, CHECK constraints on tier/style/difficulty/role, FK cascade), `subscribers` (newsletter). `comps` carries `votes`/`views` counters, `matchups` (jsonb `[{slug, kind}]`) and `augment_types` (ordered `ITEMS`/`ECON`/`COMBAT`/`EMBLEM`).

Stats: `psql -U metaboard -h localhost -d metaboard -c "SELECT (SELECT count(*) FROM champions) champs, (SELECT count(*) FROM comps) comps"`.

## Game data

All set entities are real, from CommunityDragon (Riot's public game-data mirror). Two consumers, one source:

- Postgres (backend's copy — used for API responses + validation): a projection of `packages/shared/data/tft.json`, written by `syncTft()` (seed) and by `ensureCatalogCurrent()` at every API boot. The API never contacts CommunityDragon itself.
- `packages/shared/data/tft.json` + `apps/web/public/tft/**` (the source — used by statically generated pages: champions grid, item/augment boards, admin form datalists — and by the client-side hover detail cards): refreshed by the private crawler repo, which writes into this checkout; commit the data paths here.

- Set 18 / patch 16.21.1: 65 champions (PVE monsters and placeholder units filtered, Lux trait variants collapsed), 36 traits, 41 completed items + 10 components + 21 emblems + 37 radiant + 43 Ornn artifacts, 595 augments. Augment rarity decoded from tag GUIDs (silver/gold/prismatic), noted as a heuristic. Items keep the richest duplicate api entry (DA_* variants carry no text) and their descriptions are cleaned (placeholders substituted, multipliers resolved, floats rounded, keyword refs stripped); emblem and artifact effect text — which CommunityDragon leaves blank on its `DA_` stubs — comes from MetaTFT's lookups, with `<TFTCurveTable row=…>` numbers resolved from `curveValues` (percent rows are stored as fractions). Champions carry ability name/description/keywords/mana; traits carry activation thresholds/styles plus resolved per-breakpoint tooltip rows.
- Extra sources merged into `lib/tft.json` on top of the cdragon tft dump: **trait tooltips** from the LCU export (`plugins/.../v1/tfttraits.json` — resolved `<row>` text with constants, tier names bronze/silver/gold/prismatic/unique, flavour line) and **ability icons** matched by ability name against the LCU champion spells/passives (28/65 units; remixed/monster abilities have no LoL counterpart). Keyword **definitions** ("Wound: Reduces healing received.") are harvested from Riot's own item/ability text into a `keywords` map (7 entries).
- Upstream gaps left in place (nothing invented): set-18 ability numbers exist for only 10/91 units in cdragon (Unreal migration), so most ability texts render without their `@Var@` values; `role` is null for real champions, so the source's role tag has no data source; per-champion recommended items are authored by the source site and have no public dataset.
- Icon paths in the catalog (`/tft/<folder>/<slug>.png`) point into the Next app's `public/tft`; both halves ship from the same commit, so the paths and the files move together.
- Meta snapshot: comps/boards, comp style/trend, item and augment tiers, and per-champion stats/items come from MetaTFT (`lib/meta.json` + `apps/api/seed/comps.json`). Comp tips, stage texts, augment lists, augment priority and alt builds are merged from TFT Academy guides. Both come from the private crawler repo, which writes those files into this checkout. Ratings are live averages, not hand-authored. The snapshot is static until the crawler runs again. Radiant and artifact items are added to the catalog from MetaTFT's live tags, icons included.

## Backend API (`apps/api/`, :4000)

- `GET /api/comps` — all comps read from Postgres, enriched with unit cost + icon and item/augment icons, plus computed **active traits** (counts from board unit traits; activation thresholds/styles from the `traits` table, populated from CommunityDragon effects: 1 bronze / 3 silver / 4 unique / 5 gold / 6 prismatic) and resolved matchups (slug → title/tier; dangling references dropped). `?sort=popular` orders by votes. `GET /api/comps/:slug` — one comp, 404 if absent.
- `POST /api/comps/:slug/vote` / `POST /api/comps/:slug/view` — community counters; one bump per visitor per comp, deduped **in memory** (resets with the process — move to a table if it ever matters).
- `POST /api/subscribe` — `{email, lang}` from the footer form; regex-validated, 400 on bad email, inserts into `subscribers` (duplicates ignored).
- `GET /api/tft/set` — full set payload from Postgres, including `catalog_release`, the id of the data snapshot the database is holding.
- The game catalog is re-projected from the committed snapshot when the API boots (`ensureCatalogCurrent()`), which rewrites the four tables in one transaction only when `catalog_release` differs. There is no refresh endpoint, no cron and no `REFRESH_TOKEN`; comps are never touched by it.
- `GET /api/guides` / `GET /api/guides/:slug` — guides from Postgres (same `?lang=` rule as comps; the response also carries the raw English `titleEn` / `excerptEn` / `sectionsEn` for the admin editor prefill).
- Admin: `POST /api/admin/comps` (201/400/409), `PUT|DELETE /api/admin/comps/:slug` (404 on unknown), `POST /api/admin/guides` (201/400/409), `PUT|DELETE /api/admin/guides/:slug`, `GET /api/admin/subscribers` + `DELETE /api/admin/subscribers/:email`, `GET /api/admin/users` + `PATCH /api/admin/users/:id/role` (404 unknown, 409 blocked demotion). `comps.trend` (`up`/`down`/null) is editable in the form and returned by the API. Guide validation: slug format (immutable on PUT), ISO `publishedOn` (`YYYY-MM-DD`), non-empty title/excerpt/author, sections with heading + body (bullets optional); `featured` flips the index hero.
- Auth: sign-in sets an httpOnly `mb_session` cookie (30 days). `/api/admin/*` requires an account whose `role` is `admin` (401 unauthenticated, 403 `admin_only`); the admin shell layout asks `/api/auth/me` and redirects everyone else to `/en/login?next=/admin`. The first admin comes from `ADMIN_EMAIL`/`ADMIN_SEED_PASSWORD` at seed time or API boot; once any admin exists the bootstrap is a no-op.
- Server-side validation on writes (queries game tables): slug format (immutable on PUT), tier/style/difficulty enums, 3-12 units that exist, at least one early unit / item / augment, carry among units, existing items/augments. Units accept plain names or `{name, row, col, stars, items}` — coords must be on the 4x7 board (row 0-3, col 0-6), one unit per hex, up to 3 existing items, stars 1-3. Alt builds accept names or `{name, stars, items}`; names-only admin saves keep the stored items, and alt item names allow artifacts. `augmentTypes` is an ordered subset of `ITEMS`/`ECON`/`COMBAT`/`EMBLEM`. Tips and stage texts are optional: empty stage slots are dropped on save (their DB rows deleted) but stage numbers keep their slot (index 0 → stage 2). Matchups: up to 6 `{slug, kind: 'good'|'bad'}`, slug must be an existing *other* comp, duplicates rejected.
- `comp_units` stores `row`/`col`/`stars` + `items text[]`; responses enrich units (cost, icon, item icons) and legacy null positions render via a fallback layout.
- The Next server components call `backendJson()` (`lib/backend.ts`, `BACKEND_URL`, default `http://127.0.0.1:4000`) for the admin lists, edit forms, comp detail and guide pages. The comps explorer (client) fetches `/api/comps` through the proxy.

## Admin dashboard

- Shell: `app/admin/layout.tsx` is the bare html/body root; the `app/admin/(shell)` route group adds the sidebar chrome (Overview / Comps / Guides / Aliases / Users / Assistant reasoning / Subscribers, signed-in email, View site, Log out) and redirects non-admins via `/api/auth/me`. Sign-in happens on the public `/en/login` page; there is no separate admin login. Shared kit in `components/admin/ui.tsx` (`AdminPageHeader`, `AdminTable`, `AdminStat`, button/input classes).
- `/admin` — overview: comp/guide/patch stat cards plus the six newest comps and four newest guides (Edit links). `/admin/comps` — full comps table (tier, style, carry, units, votes, views, playstyle) with Edit / View / Delete and New comp. `/admin/guides` — guides table (tags, author, date, featured) with the same actions. `/admin/users` — account list with role switch (cannot demote your own account or the last admin). `/admin/subscribers` — newsletter emails with lang + date and Remove. Admin pages that hit guarded endpoints forward the `mb_session` cookie by hand (`cookies()` → `backendJson` headers) because server-side fetches bypass the browser.
- Comp editor inputs: early units, item priority, augments and alt builds are search-and-click pick lists (`EntityList` in `components/admin/comp-form.tsx`) with icon chips and ✕ removal — type to filter, Enter or click to add; augments are deduped by display name. Carry is a select of the board units. A **Matchups** panel adds strong/weak counters (comp picker loaded client-side, colour-coded chips, up to 6). Tips/stages sit in a "Plan (optional)" panel; labels mark the fields the server requires (early/item/augment at least one). The **board editor** places units on a 4x7 hex board: pick a champion (palette searchable + trait filter), click a hex (or drag), click a unit to set stars (1-3), attach up to 3 items, mark the carry, remove; drag to move or swap. Unit lists without coordinates are auto-laid out on load. Alt builds are edited as champion names only; saving keeps the item builds already stored for those names.
- Guide editor (`components/admin/guide-form.tsx`): title/slug (auto-slug from title until touched), author, ISO date, excerpt, comma-separated tag keys, featured flag, and a repeatable sections editor (heading/body/bullets — one paragraph or bullet per line — with vi counterparts per section, plus move/remove/add). `publishedOn` defaults to the local calendar date.
- Comp and guide forms both carry an optional **Vietnamese** block; prefill on edit comes from a second `?lang=vi` fetch and only values that differ from English are shown (empty field = fall back to English / keep existing vi on save).
- Board visuals (`components/hex-board.tsx` + `.hex-board-*` in `app/globals.css`): flat borderless grey hexes (`#202122`) on a near-black frame (`#0A0D0E`), regular pointy-top hexagons (2/√3 aspect), staggered rows, cell size scales with the container width. Shared by the admin editor and the public "Positioning example" panel.
- Item and augment avatars are rounded squares, not hexes: `ItemTile` (frame colored by the item's tier from the authored item tier list; grey when unranked) and `AugmentTile` (bare rounded image, no frame) in `components/ui.tsx`. Used by the comp panel, admin editor (palette/slots/unit minis), and the items/augments tier list pages. Champion hexes (`UnitHex`) use a scaled inner hexagon so the cost frame keeps an even width over the pointed top.
- Hover detail cards (`components/hover-card.tsx` + `lib/tips.ts`): a single delegated layer (mounted in the root layout) reads `data-tip="kind:name"` on any tile and shows a floating card — champion (traits, cost dots, ability icon + mana + keyword definitions), item (description + build path with component icons), augment (rarity badge + description), trait (resolved per-breakpoint rows on tier colours + flavour text). Because it keys off the attribute, it covers server- and client-rendered tiles alike (tier lists, comp panel, champions grid). Card data comes from `lib/tft.json`; unknown names simply show nothing.
- Comp context on champion cards: `UnitTile` wraps the hex in an element carrying `data-tip-traits` (this unit's trait counts in the comp) and `data-tip-items` (the comp's item priority); the hover layer reads them via `closest()` and the champion card shows the counts on the trait rows plus an "Item priority" block. Applies on the comp detail page (final board + positioning), not on context-free tier-list tiles.
- Writes go to Postgres through the backend. Changes appear immediately: the comp detail page is `force-dynamic` (fetches the backend per request) and the tier list fetches `/api/comps` client-side. No rebuild needed; static pages are unaffected.
- Single-admin by design (one shared password, no users/roles). Swap in an auth library before exposing this beyond localhost or adding a second editor.
- `npm run seed` (in `apps/api/`) resets comps to `apps/api/seed/comps.json` and guides to `apps/api/seed/guides.ts` — it wipes comps and guides created via the admin UI.

## Behaviour checks (rebuild)

- Console: clean on all 13 tested routes. Only 404 response is the intentional `/nope-404` test.
- Network: no request to tftacademy.com; zero external requests (fonts are self-hosted by `next/font`).
- Keyboard: tab order reaches nav → content; visible focus ring (2px brand-soft outline, offset 2).
- Contrast fixes vs source pattern: accent button text moved to `#6a45ff` (white on it ≈ 5.4:1, AA); source's own yellow-on-dark pattern not reused.
- Build: `npm run build` → clean (no `/api` routes in Next anymore; middleware + rewrites present), production server checked at :4173 with the backend up.
- Board editor end-to-end (`node capture/board-e2e.mjs`, needs both servers): login → place 3 champions on the hex board → stars/items/carry → save → create fetched from the API with positions intact → public board renders 28 cells → delete. The run also covers: vote button self-disables after one click; matchup PUT resolves title/tier, self-matchup rejected (400), public panel shows "Strong against" linking the other comp; champion index → detail (name + ability); item search/type filter and augment search; tables render 11 shop-odds rows; builder `?b=` share link restores the board; tier maker click-to-rank; quiz returns a scored comp; newsletter validation/signup/admin list/cleanup; guides tag filter; sitemap/robots/manifest/service worker served. All checks pass; test comp and signup are removed afterwards (leftovers from an interrupted run are cleared at login).
- Comp click on the tier list is scroll-stable: the explorer caches `/api/comps` per language and the cluster link uses `scroll={false}`, so the tier-list ⇄ comp-detail hop keeps the page position and the expanded panel scrolls into view under the sticky nav (checked in the e2e).
- Hover cards screenshot-verified (`node capture/tip-shot.mjs`): champion card on the comps tier list, item card (description + build path) on the items tier list, augment card on the augments tier list, trait card (resolved breakpoint rows) and comp-panel item card on the comp detail page, champion card in comp context (trait counts + item priority + ability icon, `Sett` on the Ahri Spellweaver page), champion card with keyword definitions (`Cinderling` on the Sentinel Riftbeast page).

## Languages (en / vi)

- Public pages live under `/<locale>` (`/en/...`, `/vi/...`); bare `/` redirects via `Accept-Language` (middleware), unknown prefixes redirect to `/en`. Admin stays unprefixed and English-only.
- UI copy: `lib/messages.ts` (`vi` is typed against `en`, a missing key fails the build). Language switcher keeps the current path.
- Game data: vi names/descriptions come from CommunityDragon `tft/vi_vn.json` + LCU `global/vi_vn/v1/tfttraits.json` → `lib/tft.json` (`nameVi`/`descVi`/`keywordsVi`/`breakpointsVi`), resolved by `lib/tips.ts`. Lookup keys stay English everywhere (`data-tip`, DB rows).
- Authored content: guides live in Postgres (edited at `/admin/guides`, seeded from `apps/api/seed/guides.ts`; `title_vi` / `excerpt_vi` / `sections_vi` columns, EN fallback per field). The public guides pages are `force-dynamic` and render `guideTag`-localized chips (`lib/data.ts` keeps the tag label map). Legal bodies in `lib/messages.ts` (`legal.privacy` / `legal.terms`); item/augment tier notes are per-locale on each `TierItem`.
- The database pages and tools (champions, items, augments, tables, builder, tier maker, quiz, newsletter form) are localized through `lib/messages.ts`, with game names resolved by `unitName` / `itemName` / `augmentName` / `traitName` from `lib/tips.ts`.
- Comp and guide vi text: each field falls back to English when empty; comp stage labels render "Giai đoạn N". vi lives in dedicated columns (`comps.playstyle_vi`, `comps.tips_vi`, `comp_stages.text_vi`; guide `*_vi`), is seeded from `apps/api/seed/` and is editable in the admin forms — an English-only save from an older flow keeps existing vi (upserts, never delete+insert).
- Check: `node capture/board-e2e.mjs` covers the admin sidebar, comp create via board editor, guide create/edit/delete (incl. vi surviving an English edit), the vi redirect, vi tier list chrome and vi guides index; `capture/tip-shot.mjs` shoots en + vi hover cards; `capture/vi-shots.mjs` shoots vi comp detail, guides and legal.

## Known deviations (deliberate)

- All imagery is CSS placeholder art; Riot Games assets are not used or hotlinked. Owner supplies licensed art.
- Nav dropdown opens on hover **and** focus-within (source: hover only) — accessibility improvement, logged here.
- Source "Log in" replaced by a patch-status chip; no account surfaces were built (decline rule).
- Academy+ paywall and licensed meta reads stay out of scope per `capture/plan.md` (builder, tier maker and the comp quiz were built this round as own additions). PWA: manifest + icons + a **passthrough** service worker make the site installable; deliberately **no offline cache** — stale comp data would be worse than an extra request.
- Search + style filter actually filter the board (source behaviour confirmed as a filter UI, implemented client-side).

## Owner to do

- Refresh the data with the private crawler repo (comps/tiers/stats + tips/stages/augments/priority/alt builds), commit the data paths here, push; on an empty database follow it with `npm run seed --workspace @tftiq/api`.
- Replace placeholder emails in `legal/*` and `about`.
- Wire real YouTube/Spotify embeds on `/media` if desired.
- Add real social links in `lib/data.ts` (`socials`). The brand mark is `app/icon.svg` (also drawn inline in `components/nav.tsx`); PWA icons in `public/icons/` are rendered from it by `scripts/make-icons.mjs`.
- Set `SITE_URL` (e.g. `https://tftiq.example`) before deploying — `sitemap.xml` / `robots.txt` fall back to `http://localhost:4173`.
- Newsletter sending is manual: export/copy the list from `/admin/subscribers` into your mail tool until a provider is wired.
- Champion/item imagery is Riot game data (CommunityDragon); confirm it fits your Riot Games third-party policy before public launch.
- vi copy for comps and guides is editable in the admin forms (optional "Vietnamese" block); a fresh `npm run seed` replaces all comps and guides — including vi — from `apps/api/seed/`.

## Run

```
# one-time: Postgres
brew install postgresql@17 && brew services start postgresql@17
psql -d postgres -c "CREATE ROLE metaboard WITH LOGIN PASSWORD 'metaboard';" -c "CREATE DATABASE metaboard OWNER metaboard;"

# backend (:4000) — first run applies the schema and seeds the data
npm install
npm run seed --workspace @tftiq/api
npm run dev:api
npm run dev:web

# Each workspace can be built and started independently.
npm run build --workspace @tftiq/web
npm run start --workspace @tftiq/web
npm run start --workspace @tftiq/api

curl http://localhost:4173/en/tierlist/comps                  # public site (vi at /vi/...)
curl http://localhost:4173/api/comps                          # through the Next proxy
curl http://localhost:4000/api/comps                          # direct to the backend
curl http://localhost:4000/api/tft/set | jq '.catalog_release'   # which data snapshot the DB holds

# admin: open http://localhost:4173/en/login and sign in with an admin account (bootstrap from ADMIN_EMAIL/ADMIN_SEED_PASSWORD in apps/api/.env)
# full set update: run the private crawler repo → commit data → push (web rebuilds, API self-applies on boot)
# empty database: commit fresh data → npm run seed --workspace @tftiq/api
node capture/shots.mjs capture/sources-rebuild.json capture/sections-rebuild.json capture/rebuild http://localhost:4173   # recapture rebuild
node capture/check-rebuild.mjs http://localhost:4173   # console/network/focus sanity check
```
