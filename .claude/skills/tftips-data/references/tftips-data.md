# TFTips Public Data

Tài liệu tham khảo cho việc lấy dữ liệu public từ TFTips (tftips.app) để
phân tích. Nội dung được xác minh từ SSR HTML crawl và các response live,
không dùng tài khoản, không login.

- Snapshot kiểm tra: `2026-10-21`
- Set: `18` (SET18)
- Patch live: `18.4b` (PBE `18.5`)
- Locale đã crawl: `en`
- Sitemap: 727 URL

Số liệu, số lượng route và nội dung thay đổi theo patch; các con số trong tài
liệu này chỉ là mốc tham chiếu.

## 1. Phạm vi và nguyên tắc

- Chỉ dùng HTTP GET public. Không gọi endpoint refresh, upload, spectate
  hoặc Patreon.
- TFTips **không có public JSON API**. `/api/*` bị robots disallow và trả
  `Not Found` (ngoại lệ: `/api/augs` là rewrite sang trang augment locale
  `ja`, canonical `/augs/silver`; `/api/augs/{tier}` vẫn `Not Found`).
  Toàn bộ dữ liệu nằm trong SSR HTML.
- Ảnh nằm trên CDN riêng `img.tftips.app`. Chỉ index URL; không mirror
  binary vào repo nếu chưa có nhu cầu rõ ràng.
- Không crawl dồn dập: tối đa 8 workers, retry 3, skip file >5KB đã có,
  cache theo `lastmod` trong sitemap.
- Text comp guide ghi `by ZETA`; strategy tips là community knowledge.
  Trích nguồn khi reuse nội dung vào sản phẩm public.
- Python stdlib trên macOS có thể lỗi SSL (`CERTIFICATE_VERIFY_FAILED`) —
  dùng `curl` thay `urllib`.
- Ngày trong text (`Updated: 2026.9.21`) là JST.

## 2. Host, locale và CORS

| Host | Dùng cho | Ghi chú |
|---|---|---|
| `https://tftips.app` | toàn bộ route HTML | SSR, không có API JSON |
| `https://img.tftips.app` | ảnh champion/augment/item/site | CDN public, query `?v=2` cho cache bust |

- 8 locale: `ja` (mặc định, path `/`), `en`, `zh`, `zh-tw`, `vi`, `ko`, `es`,
  `pt` (prefix path).
- Mỗi page có canonical + hreflang đầy đủ. Crawl 1 locale (khuyến nghị
  `en`), không trộn text giữa các locale.
- CORS không quan trọng vì crawl server-side bằng `curl`.

## 3. Quick start

```bash
# 1. sitemap
curl -sSL https://tftips.app/sitemap.xml -o /tmp/sitemap.xml

# 2. một page
curl -sSL https://tftips.app/en/champs/18_ahri -o /tmp/ahri.html

# 3. text đã clean (SSR)
python3 - <<'PY'
import re, html
h = open('/tmp/ahri.html', encoding='utf-8').read()
h = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', h, flags=re.S)
t = re.sub(r'<[^>]+>', '\n', h)
t = html.unescape(t)
print('\n'.join(x.strip() for x in t.splitlines() if x.strip()))
PY
```

## 4. Route catalog

| Nhóm | Route | Số lượng (snapshot) |
|---|---|---|
| Home | `/en` | 1 |
| Champions | `/en/champs`, `/en/champs/{id}` | 1 + 68 |
| Traits | `/en/traits`, `/en/traits/{id}` | 1 + 37 |
| Augments | `/en/augs`, `/en/augs/{id}` | 1 + 246 |
| Items | `/en/items/{id}` | 157 |
| Comps | `/en/comps`, `/en/comps/{slug}` | 1 + 18 |
| Replays | `/en/replays`, `/en/replays/{id}` | 1 + 75 |
| Patches | `/en/patches`, `/en/patches/{v}` | 1 + 9 |
| Tables | `/en/tables`, `/en/tables/{slug}` | 1 + 26 |
| Tips | `/en/tips/strategy`, `/en/tips/strategy/{slug}` | 1 + 23 |
| Timeline | `/en/timeline`, `/en/timeline/{set}` | 1 + 19 |
| Tournaments | `/en/tournaments`, `/en/tournaments/{slug}` | 1 + 13 |
| Specs | `/en/specs/{slug}` | 8 |
| Tools | `/en/tools/{slug}` | 4 |
| Set hub | `/en/set18` | 1 |
| Wisps | `/en/wisps` | 1 |
| Equipment | `/en/equipment` | 1 |
| Encounters | `/en/encounters` | 1 |
| Tacticians | `/en/tacticians` | 1 |
| Mastery | `/en/mastery` | 1 |
| Quiz | `/en/daily-quiz` | 1 |
| Stream | `/en/stream` | 1 |
| Patreon | `/en/patreon` | 1 |

### 4.1 Path sai cần tránh

- `/en/team-builder` → 404; đúng là `/en/tools/team-builder`.
- `/en/tierlist-maker` → 404; đúng là `/en/tools/tierlist-maker`.
- `/en/tips/keywords` → 404 (chỉ có bản `ja`).
- `/api/*` → trả text `Not Found` (không phải JSON). `/api/augs` là ngoại lệ:
  rewrite sang trang augment bản `ja` (`canonical: /augs/silver`), các
  `/api/augs/{tier}` khác vẫn `Not Found`.


## 5. Identifier

| Loại | Dạng | Ví dụ |
|---|---|---|
| Champion / trait / augment / item | `18_{snake}` | `18_ahri`, `18_vanguard`, `18_ascension` |
| Item (không có set prefix) | `{snake}` | `archangelsstaff`, `artifact_aegisofdawn` |
| Comp | kebab-case | `morgana-ahri`, `elderdragon-draven-95` |
| Replay | `jp1-{digits}` | `jp1-599129776` |
| Patch | `{set}.{n}[b]` | `18.4b` |
| Table / tool / spec | kebab-case | `warpath`, `shoprob`, `shop` |

Item id giữ namespace prefix: `artifact_`, `emblem`, `abilitybooster18`,
`blastpotion18`, `sunfirecape`, `titansresolve`… Khi join theo tên, phải
normalize prefix, không so khớp tên hiển thị.

## 6. Schema theo nhóm

### 6.1 Champion (`/en/champs/{id}`)

```json
{
  "id": "18_ahri",
  "url": "/en/champs/18_ahri",
  "name": "Ahri",
  "svg_labels": ["Health", "Base AD", "Armor", "Range", "Magic Resist", "Attack Speed"],
  "images": ["https://img.tftips.app/champ/ability/18_ahri.avif", "..."],
  "text": "..."
}
```

- 68 champion SET18, gồm cả pseudo-unit: `18_brambleback`, `18_cinderling`,
  `18_gromp`, `18_krug`, `18_murkwolf`, `18_pebbles`, `18_scuttlecrab`,
  `18_elderwood_treesummon_lifeblossom`…
- **Stat số nằm trong SVG `<text>`** (6 node: Health, Base AD, Armor, Range,
  Magic Resist, Attack Speed) + `<polygon>`/`path` mô tả biểu đồ tương đối.
  Muốn lấy số phải parse `raw/*.html` trực tiếp; innerText đã clean mất vị
  trí (label và value bị trộn).
- Ảnh: `champ/sm|md|lg|ability/{id}.avif`, `champ/ogp-sm/{id}.png?v=2`.

### 6.2 Trait (`/en/traits/{id}`)

```json
{
  "id": "18_vanguard",
  "name": "Vanguard",
  "description": "Adaptor - Innate: ...",
  "images": ["..."],
  "text": "..."
}
```

- 37 trait SET18. `description` là text mô tả effect đầu tiên tìm được.
- Trait có 2 dạng: trait thật (Champion count) và trait đặc biệt
  (Adaptor, Attuned, Apex Predator, Monolith…) với effect riêng.

### 6.3 Augment (`/en/augs/{id}`)

```json
{
  "id": "18_ascension",
  "url": "/en/augs/18_ascension",

### 6.5 Comp (`/en/comps/{slug}`)

```json
{
  "slug": "morgana-ahri",
  "title": "TFTips - Morgana Ahri Comp Guide by ZETA title 【Teamfight Tactics】",
  "text": "..."
}
```

- 18 comp, toàn bộ do **ZETA** viết. Không có comp nào của tác giả khác.
- Cấu trúc mỗi comp: Final Board + Progression 1/2, Team Code, Items,
  Augments, Overview, Play Condition, Buildup, Positioning, updated-date,
  link Replay.
- Có bảng tier list ở `/en/comps`; text chính nằm ở trang detail.

### 6.6 Strategy tips (`/en/tips/strategy/{slug}`)

- 23 trang (1 index + 21 bài + 1 trang phụ) — nhóm theo: leveling, economy,
  positioning, items, decision making.
- Nội dung là community knowledge, không có bảng machine-readable.
- Khi tái sử dụng cho sản phẩm public: **viết lại**, không copy verbatim,
  và ghi credit "Adapted from TFTips" + link nguồn.

### 6.7 Replay / Patch / Table / Timeline / Tournament

- Replay: `/en/replays/{id}` — video fetch client-side, không crawl được;
  chỉ lấy metadata text.
- Patch: `/en/patches/{v}` — changelog theo version.
- Table: `/en/tables/{slug}` — 26 bảng tra cứu (shop odds, tier list, trait
  ladder, warpath, orb, golden egg…). Ảnh chính là bảng scan, phần text
  chỉ là caption.
- Timeline: `/en/timeline/{set}` — lịch sử set 1..18 + prerelease.
- Tournament: `/en/tournaments/{slug}` — giải đấu (Kimi Meet, Katsuobushi
  Cup, Ankoku, Yucchaku Cup, team series).

### 6.8 Specs và Tools

- Specs (8): `shop`, `items`, `player`, `roles`, `battle`, `stats`, `aug`,
  `wisp` — mô tả luật game (shop odds, damage, cấp độ role…).
- Tools (4): `shoprob`, `team-builder`, `tierlist-maker`, `coven_essence`.

## 7. Công thức và join

| Việc | Cách làm |
|---|---|
| Item → champion đề xuất | parse mục "Recommended Champions" trong text item, khớp `18_{id}` |
| Trait → champion | list champion trong trang trait, khớp `18_{id}` |
| Augment tier | từ `/en/augs` index (Silver/Gold/Prismatic), không có field tier trong JSON phẳng |
| Replay → comp | text trang replay chứa tên comp + `jp1-{id}` |
| Comp unit cost | parse Team Code / Final Board trong text comp, map sang `18_{id}` |

Quy tắc chung: JSON đã flatten, mọi thông tin có cấu trúc nằm trong `text`
hoặc `svg_labels`; phải parse `text` theo heading của site.

## 8. Caveats

- Trang comp/replay chứa skeleton `Loading...` nhưng text chính vẫn đầy đủ
  trong HTML.
- Entity HTML giữ nguyên (`Kha&#x27;Zix`) — decode khi consume.
- Text đã clean là innerText nên **mất vị trí số stat trong SVG**; không
  dùng để suy ra chỉ số champion.
- Ảnh thuộc Riot/CDN tftips — kiểm tra policy trước khi public mirror.
- Title có hậu tố cố địn `【Teamfight Tactics】` và tiền tố `TFTips - ` —
  strip khi hiển thị.
- Ngày trong text là JST, không phải UTC.

## 9. Recipe: crawl + extract

```bash
curl -sSL https://tftips.app/sitemap.xml -o /tmp/sitemap.xml
# filter URL locale + route, 8 workers, retry 3, skip file >5KB đã có
# -> capture/tftips/raw/{route}_{slug}.html
python3 /tmp/extract-tftips.py   # -> json/{per-page}.json + _index.json
python3 /tmp/build-structured.py # -> champions/traits/augs/items/comps/pages.json
```

Kết quả tham chiếu (repo `tft-comps`):
`capture/tftips/raw/` 727 HTML (~209MB), `capture/tftips/json/` các file
đã flatten, `capture/tftips/docs/` bộ docs (README/DATA/API).

## 10. Khi kiểm tra một claim

- Fetch trực tiếp page bằng `curl`, đặt timeout, rồi assert shape/field
  quan trọng. Không đoán tên field.
- Ghi lại locale, patch, `lastmod` sitemap và thời điểm lấy.
- Nếu docs khác live: ghi rõ giá trị live, cập nhật reference nếu cần,
  không âm thầm dùng số cũ.
- Khi user hỏi "dữ liệu hiện tại", trả kèm patch và thời điểm lấy.

  "title": "TFTips - Advanced Loan 【Teamfight Tactics】",
  "images": ["https://img.tftips.app/aug/18_ascension.avif?v=2"],
  "text": "..."
}
```

- 246 augment SET18: Silver 69 / Gold 110 / Prismatic 67.
- Mỗi entry: effect text, **offered rounds** (2-1 / 3-2 / 4-2), Patch History.
- Ảnh theo id, query `?v=2`.

### 6.4 Item (`/en/items/{id}`)

```json
{
  "id": "18_emblemblackthorn",
  "url": "/en/items/18_emblemblackthorn",
  "title": "TFTips - Blackthorn Emblem - Item Details 【Teamfight Tactics】",
  "images": ["..."],
  "text": "..."
}
```

- 157 item. Phân nhóm: Completed / Non-craftable / Emblems / Radiant /
  Artifact / Consumable / Wisp Items / Other.
- Mỗi item có: recipe, effect, **Recommended Champions**, **Related Trait**.
- Radiant variant có suffix `_radiant` trong id (`adaptivehelm_radiant`).
