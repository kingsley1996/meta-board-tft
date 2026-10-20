## 4. Dữ liệu đã cào (`capture/tftips/`)

```
capture/tftips/
  raw/                  727 *.html (locale en, ~209MB)
    champs_18_*.html    68      augs_18_*.html      246
    traits_18_*.html    37      items_*.html        157
    comps*.html         19      replays*.html       76
    patches*.html       10      + tables/tips/timeline/tournaments/...
  json/
    champions.json      68 records (id, name, url, svg_labels, images, text)
    traits.json         37 records (id, name, description, images, text)
    augs.json           246 records
    items.json          157 records
    comps.json          18 records (slug, title, text ≤12k chars)
    pages.json          198 records (text ≤8k chars)
    _index.json         727 rows (file/title/description/text_len)
    champions|traits|augs|items|comps|pages/  per-page JSON
  docs/                 bộ docs này
```

Sitemap gốc: `/tmp/sitemap.xml` (753KB). URL list EN: `/tmp/tftips-urls.txt`.

## 5. Danh mục nội dung (snapshot 2026-10-21)

**Champions (68):** Ahri, Akali, Alistar, Alune, Amumu, Aphelios, Ashe, Azir,
Brambleback, Caitlyn, Camille, Cassiopeia, Cinderling, Diana, Draven,
Elder Dragon, Deepwood Protector, Lifebloom, Stonebark Tree, Elise, Ezreal,
Fiddlesticks, Gnar, Gromp, Hecarim, Ivern, Karma, Kayle, Kennen, Kha'Zix,
Kobuko, Kog'Maw, Krug, LeBlanc, Leona, Lillia, Lux, Malphite, Mama Beak,
Maokai, Master Yi, Morgana, Murkwolf, Nidalee, Ornn, Pebbles, Rakan, Rammus,
Rek'Sai, Rengar, Scuttlecrab, Sejuani, Sentinel, Sett, Shen, Sivir, Soraka,
Taric, Teemo, Tristana, Varus, Veigar, Vi, Warwick, Xayah, Yorick, Yunara, Zyra.

**Traits (37):** Adaptor, Attuned, Apex Predator, Monolith, Blackthorn,
Blossom, Brawler, Caustic, Coven, Defender, Bounty Seeker, Eclipse,
Elderwood, Emerald Aspect, Executioner, Fae, Flora Fatalis, Greenfather,
Hunter, Inferno, Invoker, Juggernaut, Lunar, Avatar, Old Growth, Primal,
Rapidfire, Riftbeast, Rival, Evolution, Ravager, Solar, Spellweaver, Sprykin,
Summoner, Vanguard, Thornmaiden.

**Comps (18, by ZETA):** akali-camille (reroll), aphelios-nidalee,
azir-rammus, caitlyn-bahr, defender-cassiopeia, elderdragon-draven-95
(fast 9), kayle-reroll, kha-zix-hecarim, masteryi-kogmaw, morgana-ahri,
primal-malphite, riftbeast, soraka-zyra, tristana-rammus, veigar (reroll),
warwick-murkwolf, yunara-sejuani, zyra-amumu (juggernaut).
Mỗi comp: Final Board + Progression 1/2, Team Code, Items, Augments,
Overview, Play Condition, Buildup, Positioning, updated-date, link Replay.

**Augments (246):** Silver(69)/Gold(110)/Prismatic(67); mỗi entry có offered
rounds (2-1/3-2/4-2), effect text, Patch History.

**Items (157):** Completed / Non-craftable / Emblems / Radiant / Artifact /
Consumable / Wisp Items / Other. Có recipe, Recommended Champions,
Related Trait.

**Patches:** 18.1 → 18.5 (+b). Current 18.4b (2026-10-08), PBE 18.5 (10-21),
18.6 (11-04), SET19 (12-01).

## 6. Assets (images — chỉ index URL, không download binary)

```
https://img.tftips.app/champ/sm/{id}.avif       68 (thumb)
https://img.tftips.app/champ/md/{id}.avif       68
https://img.tftips.app/champ/lg/{id}.avif       68
https://img.tftips.app/champ/ability/{id}.avif  68
https://img.tftips.app/champ/ogp-sm/{id}.png?v=2 (OGP)
https://img.tftips.app/aug/{id}.avif?v=2        246
https://img.tftips.app/item/...                 (theo item id)
https://img.tftips.app/site/{logo.webp,set18kv.avif,...}
```

Mirror: `curl https://img.tftips.app/<path> -o assets-index/<path>`.

## 7. Crawler — reproduce

```bash
curl -sSL https://tftips.app/sitemap.xml -o /tmp/sitemap.xml
# crawl 8 workers, retry 3, skip file >5KB đã có (xem /tmp/crawl-full.sh)
# extract  -> capture/tftips/json (title/desc/headings/images/links/text)
python3 /tmp/extract-tftips.py
# structured -> champions/traits/augs/items/comps/pages.json
python3 /tmp/build-structured.py
```

Lưu ý: Python stdlib trên máy lỗi SSL (`CERTIFICATE_VERIFY_FAILED`) —
dùng `curl`. Data nằm trong SSR HTML + SVG `<text>` (stat labels);
stat values là text node trong SVG, cần parse `raw/*.html` trực tiếp
nếu muốn số chi tiết. Trang comp/replay có skeleton `Loading...` nhưng
text chính vẫn đầy đủ trong HTML; video replay fetch client-side.

## 8. Giới hạn & pháp lý

- Text trích là innerText đã clean (mất vị trí số stat trong SVG).
- Entity (`Kha&#x27;Zix`) giữ nguyên — decode khi consume.
- Ảnh thuộc Riot/CDN tftips — check policy trước khi public mirror.
- Text comp guide ghi `by ZETA title` — trích nguồn khi reuse.
- Ngày trong text (`Updated: 2026.9.21`) là JST.
