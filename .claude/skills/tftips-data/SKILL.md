---
name: tftips-data
description: Use when working with TFTips public data — TFT SET18 comps by ZETA, champions, traits, augments, items, strategy tips, replays, patches, tables, timeline, tournaments, specs, tools — or when building/validating a TFTips scraper or site-data integration.
metadata:
  version: "1"
---

# TFTips Data

Dùng skill này khi cần lấy, kiểm tra hoặc phân tích dữ liệu public của TFTips.
Không dùng cho việc reverse-engineer bundle/UI; đó là việc của REA.

## Đọc trước

Đọc reference đầy đủ trước khi viết code hoặc trả lời về schema:

- `references/tftips-data.md` — route catalog, schema, join keys,
  công thức, caveats, recipe scrape và snapshot tham chiếu.

Reference là snapshot `2026-10-21`, set `18`, patch `18.4b`. Live response
luôn thắng reference nếu có khác biệt; khi trả lời số liệu hiện tại, fetch
live và ghi `lastmod`/patch/thời điểm lấy.

## Quy tắc

- Chỉ dùng HTTP GET public. Không gọi login, POST, upload, refresh hoặc
  endpoint làm thay đổi dữ liệu.
- TFTips **không có public JSON API**: `/api/*` bị robots disallow và trả
  `Not Found` (ngoại lệ: `/api/augs` rewrite sang trang augment locale `ja`).
  Mọi data nằm trong SSR HTML — crawl page, đừng đoán endpoint JSON.
- 8 locale: `ja` (default, path `/`), `en /zh /zh-tw /vi /ko /es /pt`
  (prefix path). Canonical + hreflang đầy đủ. Luôn crawl 1 locale
  (khuyến nghị `en`), không trộn text giữa các locale.
- Champ/trait/aug/item id dạng `18_{snake}`; comp slug kebab
  (`morgana-ahri`); replay `jp1-{digits}`.
- Trang comp/replay có skeleton `Loading...` nhưng text chính vẫn đầy đủ
  trong HTML; video replay fetch client-side, không crawl được.
- Stat số của champ nằm trong SVG `<text>` — parse `raw/*.html` trực tiếp,
  không suy từ innerText đã clean.
- Ảnh nằm trên CDN riêng `img.tftips.app`, chỉ index URL, không download
  binary vào repo nếu chưa có nhu cầu (giữ query `?v=2` khi có).
- Python stdlib trên macOS có thể lỗi SSL (`CERTIFICATE_VERIFY_FAILED`) —
  dùng `curl` thay `urllib`.
- Text comp guide ghi `by ZETA title`, tips là community knowledge —
  trích nguồn khi reuse vào sản phẩm public.
- Không crawl dồn dập: tối đa 8 workers, retry 3, skip file >5KB đã có,
  cache theo sitemap `lastmod`.

## Luồng nhanh

1. Lấy sitemap: `GET https://tftips.app/sitemap.xml` (727 URLs), lọc
   prefix locale cần crawl.
2. Crawl HTML: `GET https://tftips.app/en/<canonical>` (8 workers, curl,
   retry 3) → `raw/*.html`.
3. Extract: title/description/headings/images/links/text → per-page JSON.
4. Structured: gom `champions.json` (68) / `traits.json` (37) /
   `augs.json` (246) / `items.json` (157) / `comps.json` (18) /
   `pages.json` (replays, patches, tables, tips, timeline, tournaments,
   specs, tools, quiz...).
5. Join theo id/slug; kiểm tra shape rồi mới tính toán.

## Route map

| Việc cần làm | Route |
|---|---|
| Home | `/en` |
| Champion list/detail | `/en/champs`, `/en/champs/18_ahri` |
| Trait list/detail | `/en/traits`, `/en/traits/18_vanguard` |
| Augment list/detail | `/en/augs`, `/en/augs/18_ascension` |
| Item detail | `/en/items/18_emblemblackthorn` |
| Comp tier list/detail | `/en/comps`, `/en/comps/morgana-ahri` |
| Replay list/detail | `/en/replays`, `/en/replays/jp1-599129776` |
| Patch list/detail | `/en/patches`, `/en/patches/18.1` |
| Table list/detail | `/en/tables`, `/en/tables/warpath` |
| Tips | `/en/tips/strategy`, `/en/tips/strategy/scout-next-opponent` |
| Timeline | `/en/timeline`, `/en/timeline/set18` |
| Tournament | `/en/tournaments`, `/en/tournaments/ankoku` |
| Specs (game info) | `/en/specs/shop` |
| Tools | `/en/tools/shoprob` |
| Wisps/encounters/equipment/tacticians/mastery | `/en/wisps` |
| Quiz | `/en/daily-quiz` |
| Set hub | `/en/set18` |

Path `/en/team-builder` và `/en/tierlist-maker` cũ trả 404; path đúng là
`/en/tools/team-builder` và `/en/tools/tierlist-maker`. `/en/tips/keywords`
trả 404 (không có bản EN).

## Khi kiểm tra một claim

- Fetch trực tiếp page bằng `curl`, đặt timeout, rồi assert shape/field
  quan trọng. Không đoán tên field.
- Ghi lại locale, patch, sitemap `lastmod` và thời điểm lấy.
- Nếu docs khác live: ghi rõ giá trị live, cập nhật reference nếu cần,
  không âm thầm dùng số cũ.
- Khi user hỏi "dữ liệu hiện tại", trả kèm patch và thời điểm lấy.
