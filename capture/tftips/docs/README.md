# TFTips.app — Reverse Engineering & Data Docs

> Nguồn: https://tftips.app/en — snapshot cào ngày 2026-10-21 (727 URLs, locale `en`).
> Thư mục này: `capture/tftips/` — raw HTML + JSON đã trích + docs.

## 1. Tổng quan site

- **Tên:** TFTips — TFT Strategy & Guides (Teamfight Tactics, SET18).
- **Stack:** Next.js App Router (custom runtime **Vinext** — chunk `vinext-*.js`,
  header `x-vinext-cache`, `x-nextjs-cache`), SSR thuần, sau **Cloudflare**.
- **Render:** SSR HTML đầy đủ text; comp/replay có phần client-fetch thêm.
  Không có public JSON API — `/api/*` bị robots disallow và trả 404.
- **I18n:** 8 locale — `ja` (default, path `/`), `en /zh /zh-tw /vi /ko /es /pt`.
  Canonical + hreflang đầy đủ, header `x-next-locale`.
- **Images CDN:** `https://img.tftips.app/` — avif/webp/png, có `?v=2`.
- **SEO:** JSON-LD `WebSite / BreadcrumbList / WebPage`, OG + Twitter
  (`@tft_ips`, creator `@leskun_tft`), sitemap 727 URLs.
- **Ads:** Google Tag Manager + AdSense.
- **Disclaimer:** `© 2023-2026 TFTips.app — isn't endorsed by Riot Games...`

## 2. Điều hướng

Header: `Comp Tier List · SET18 · Tips · Tools · Team Builder · Replays`
Footer: **SET18** (Champions, Traits, Items, Augments, Wisps, Encounters,
Patch Notes, Tables, Overview) · **Tips** (Strategy, Glossary, Timeline) ·
**Game Info** (Player, Shop, Battle Stats, Roles, Items, Augments, Wisps) ·
**Esports** (Events, TPC, Players) · **Tools** (Shop Probability, Tier List,
Cashout Calculator).
Homepage: Schedule (patch + tournament APAC/AMER/EMEA/CN) · TFT News
(YouTube JP) · About TFT · Daily Quiz Topics.

## 3. Route map (canonical, bỏ prefix locale)

| Nhóm | Count | Pattern |
|---|---|---|
| Home | 1 | `/` |
| Champions | 69 | `/champs`, `/champs/18_{slug}` |
| Traits | 38 | `/traits`, `/traits/18_{slug}` |
| Augments | 249 | `/augs`, `/augs/18_{slug}` |
| Items | 157 | `/items/18_*` + base ids |
| Comps | 19 | `/comps`, `/comps/{slug}` |
| Replays | 76 | `/replays`, `/replays/jp1-{matchId}` |
| Patches | 10 | `/patches`, `/patches/18.x` |
| Tables | 27 | `/tables`, `/tables/{slug}` |
| Tips | 23 | `/tips/keywords`, `/tips/strategy[/{slug}]` |
| Timeline | 20 | `/timeline`, `/timeline/set{n}` |
| Tournaments | 14 | `/tournaments`, series + event |
| Specs | 8 | `/specs/{aug,battle,items,player,roles,...}` |
| Tools | 4 | `/tools/{coven-essence,shoprob,team-builder,tierlist-maker}` |
| Wisps/Encounters/Equipment/Tacticians/Mastery | 5 | `/wisps /encounters /equipment /tacticians /mastery` |
| Quiz | 2 | `/daily-quiz`, `/missed-connections-quiz` |
| Set hub | 1 | `/set18` |
| Legal/meta | 3 | `/terms /privacy /patreon`, `/stream-widgets` |

URL rule: `/en` + canonical. Champ/trait/aug/item id `18_{snake}`;
comp `{slug}` (`morgana-ahri`); replay `jp1-{numericId}`.
