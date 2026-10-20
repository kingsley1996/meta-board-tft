# TFTips API Docs (reverse-engineered)

> TFTips **không có public JSON API**. Mọi data nằm trong SSR HTML.
> Tài liệu này mô tả URL như API endpoints + schema JSON đã trích trong
> `capture/tftips/json/` để bạn consume như API local.

Base: `https://tftips.app` · Locale prefix: `/en` (hoặc `/`, `/zh`, `/vi`...)
Format trả về gốc: `text/html`. JSON trong repo là dữ liệu đã parse sẵn.

## Quy ước

- `{id}` champ/trait/aug/item: `18_{snake_case}` (vd `18_ahri`, `18_vanguard`).
- `{slug}` comp: kebab (vd `morgana-ahri`). `{matchId}`: `jp1-{digits}`.
- Mọi endpoint trả 200 + HTML; 404 nếu id sai (team-builder path cũ `/en/team-builder` → 404, path đúng `/en/tools/team-builder`).

## Endpoints (dạng URL)

### Champions

- `GET /{locale}/champs` — index 68 units.
- `GET /{locale}/champs/{id}` — detail 1 unit.
- Record (`json/champions.json`, per-page `json/champions/champs_{id}.json`):

```json
{
  "id": "18_ahri",
  "url": "/en/champs/18_ahri",
  "name": "Ahri",
  "svg_labels": ["Health", "Base AD", "Armor", "Range", "Magic Resist", "Attack Speed"],
  "images": ["https://img.tftips.app/champ/sm/18_ahri.avif"],
  "text": "Ahri Magic Caster Blossom Spellweaver ... Spirit Bomb Mana 20 / 100 ..."
}
```

- Text chứa: traits, skill name + mana + effect, Recommended Items
  (High adoption / High placement), Comps with this Champion, Patch History.
- Stat values nằm trong SVG `<text>` của `raw/champs_{id}.html` — parse thêm.

### Traits

- `GET /{locale}/traits`, `GET /{locale}/traits/{id}` → `json/traits.json`:

```json
{
  "id": "18_vanguard", "name": "Vanguard",
  "description": "Vanguard - At Combat Start ... (2) 18% max Health(4) 30% ...",
  "text": "Vanguard Emblem Item: ... Effect ... Comps Using This Trait ..."
}
```

### Augments

- `GET /{locale}/augs` (+ `/augs/silver|gold|prismatic`) — full list 246,
  filter tier client-side. `GET /{locale}/augs/{id}` render cùng list
  (scroll tới anchor) → `json/augs.json`:

```json
{
  "id": "18_ascension",
  "title": "TFTips - Ascension 【Teamfight Tactics】",
  "images": ["https://img.tftips.app/aug/18_ascension.avif?v=2"],
  "text": "Ascension 2-1 3-2 4-2 After 12 seconds of combat, your units gain 35% Damage Amp. ..."
}
```

- Parse effect: `{name} {rounds} {effect} Patch History` lặp lại trong text.
- Tier counts: Silver 69 / Gold 110 / Prismatic 67.

### Items

- `GET /{locale}/items/{id}` → `json/items.json`: recipe (`A + B`),
  stats (`+250 +15% +15`), effect (`holder gains X trait`),
  Recommended Champions, Related Trait.

### Comps

- `GET /{locale}/comps` — tier list S/A/B/C + filter BETA.
- `GET /{locale}/comps/{slug}` → `json/comps.json` (text ≤12k):

```
Final Board | Example Progression 1/2 | Team Code | Items (carry priority) |
Augments | Overview | Play Condition | Buildup | Positioning | updated + author
```

### Replays / Patches / Tables / Tips / Timeline / Tournaments / Specs / Tools

- `GET /{locale}/replays` — 74+ replays (rank, patch, augments, comps);
  `GET /{locale}/replays/{matchId}` — video fetch client-side.
- `GET /{locale}/patches[/{ver}]` — patch notes + history.
- `GET /{locale}/tables[/{slug}]`, `/tips[/strategy[/{slug}]]`,
  `/timeline[/set{n}]`, `/tournaments[/...]`, `/specs/{area}`,
  `/tools/{shoprob|team-builder|tierlist-maker|coven-essence}`,
  `/wisps /encounters /equipment /tacticians /mastery`,
  `/daily-quiz /missed-connections-quiz`, `/set18`
  → `json/pages.json` + per-page `json/pages/*.json`
  (`title/description/headings/images/links/text`).

## Dùng như API local

```bash
# 1 champ
cat capture/tftips/json/champions/champs_18_ahri.json
# search text toàn site
grep -l -i \"morgana\" capture/tftips/json/pages/*.json capture/tftips/json/comps/*.json
# index
cat capture/tftips/json/_index.json
```

## Errors & edge cases

- Sai id → Next 404 HTML (không phải JSON).
- `/api/*` → 404 (trừ `/api/augs` là page HTML locale ja, không phải JSON).
- Comp/replay có skeleton `Loading...` — text chính vẫn có, video thì không.
- Rate limit: chưa thấy block ở 8 workers; giữ `sleep` + retry khi crawl lại.
