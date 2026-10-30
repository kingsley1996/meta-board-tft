# Riot API cho TFTIQ — khảo sát và phương án dùng dữ liệu

**Trạng thái (2026-10-30).** Key đã có trong `apps/api/.env` với tên `RIOT_API_KEY`.
Tài liệu này ghi lại những gì đã kiểm tra trực tiếp với key đó (VN2 + SEA), endpoint
nào trả thông số gì, ghép vào catalog TFTIQ ra sao, giới hạn pháp lý, và thứ tự
triển khai đề xuất. Mọi con số "đo" đều từ ngày 2026-10-30; Riot có thể đổi DTO.

## TL;DR

- **Key hiện tại là mức personal/development**, không phải production: header trả
  `100 request / 120 giây` và `20 request / 1 giây` cho mỗi region. Production bắt
  đầu ở `500 / 10 giây` + `30.000 / 10 phút`. Vì vậy **không được dùng key này cho
  site public** (kể cả open beta).
- **Lấy được:** rank/LP, profile icon/level, lịch sử trận, 8 người/trận, tướng -
  sao - item - trait, placement, level, gold còn lại, damage, thời điểm bị loại.
- **Không lấy được augment trong trận.** Match DTO của TFT không có field `augments`
  (đã kiểm tra 10 trận × 8 người = 80 participant, 0 field này). Mọi thống kê
  augment phải tiếp tục lấy từ nguồn khác.
- **Ghép catalog:** unit khớp 100% (`character_id` = `champions.api_name`), trait
  khớp 100% (`traits[].name` = `traits.api_name`), item khớp 99,8% sau khi đi qua
  bridge id → tên của Data Dragon (đo 499/500 slot).
- **Dùng ngay được:** audit static data bằng Data Dragon (không cần key), prototype
  "profile + 20 trận gần nhất" chạy admin-only, và research meta VN từ ladder.
- **Trước khi public:** xin production key, đăng ký product trên Developer Portal,
  dùng RSO nếu hiển thị stats của người chơi, và thêm đúng câu boilerplate của Riot.

## 1. Key hiện tại

### 1.1. Loại key và giới hạn đo được

Gọi `GET https://vn2.api.riotgames.com/tft/status/v1/platform-data` ngày 2026-10-30:

```text
HTTP/2 200
x-app-rate-limit: 100:120,20:1
x-app-rate-limit-count: 1:120,1:1
x-method-rate-limit: 20000:10,1200000:600
```

Ý nghĩa:

| Header | Giá trị | Cách đọc |
|---|---|---|
| `x-app-rate-limit` | `100:120,20:1` | 100 request / 120 giây, tối đa 20 request / 1 giây, **mỗi region** |
| `x-method-rate-limit` | `20000:10,1200000:600` | 20.000 / 10 giây và 1,2 triệu / 10 phút cho endpoint này |
| `x-app-rate-limit-count` | `1:120,1:1` | Số request đã dùng trong cửa sổ tương ứng |

Đây là mức của **development hoặc personal key**. Production key mặc định là
`500 request / 10 giây` + `30.000 request / 10 phút` mỗi region (theo
[Developer Portal docs](https://developer.riotgames.com/docs/portal)).

- **Development key** tự deactivate sau 24 giờ; phải vào portal reset.
- **Personal key** không hết hạn 24 giờ nhưng **không được dùng cho public
  consumption**, kể cả open alpha/beta.
- **Production key** mới được chạy cho người dùng công khai; thường phải có
  prototype chạy được trước khi được duyệt.

Nếu key trong `.env` ngừng chạy sau 24 giờ thì đó là development key; nếu vẫn chạy
thì nhiều khả năng là personal key. Cả hai đều **không đủ** cho TFTIQ public.

### 1.2. Rate limit theo region

Rate limit được tính riêng cho từng region/routing value. Với dữ liệu VN:

| Việc | Host | Bucket |
|---|---|---|
| Account (Riot ID, PUUID) | `asia.api.riotgames.com` | ASIA |
| Summoner, league, status | `vn2.api.riotgames.com` | VN2 |
| Match history, match detail | `sea.api.riotgames.com` | SEA |

Vì vậy có thể chạy song song 3 bucket, nhưng **match-v1 chỉ có một bucket SEA cho
VN**, nên crawl match vẫn bị chặn ở 50 request/phút trên thực tế (100/120 giây).

### 1.3. Quy tắc vận hành key

- Chỉ gọi từ server (`apps/api`), không bao giờ từ browser hay bundle web.
- Không log key, không đưa key vào query string khi có thể dùng header
  `X-Riot-Token`.
- `.env` đã nằm trong `.gitignore` (`.env*`); chỉ commit `.env.example`.
- Khi nhận `429`: đọc `Retry-After`, dừng bucket đó, retry sau đúng thời gian.
  Không retry dồn.
- Khi nhận `401/403`: key sai/hết hạn/bị thu hồi — không retry.
- Khi nhận `5xx`: exponential backoff, tối đa 2-3 lần.
- Nếu key lộ: reset ngay trên Developer Portal; key cũ chết, không cần xoá code.

## 2. Routing cho VN

Riot dùng hai loại routing:

| Loại | Host | Dùng cho |
|---|---|---|
| Platform | `vn2.api.riotgames.com` | summoner, league, status |
| Regional | `sea.api.riotgames.com` | match-v1 của VN2 |
| Regional | `asia.api.riotgames.com` | account-v1 |
| Static | `ddragon.leagueoflegends.com` | Data Dragon, không cần key |

Bảng routing đầy đủ (trích docs TFT):

| Platform | Host |
|---|---|
| BR1 | `br1.api.riotgames.com` |
| EUN1 | `eun1.api.riotgames.com` |
| EUW1 | `euw1.api.riotgames.com` |
| JP1 | `jp1.api.riotgames.com` |
| KR | `kr.api.riotgames.com` |
| LA1 | `la1.api.riotgames.com` |
| LA2 | `la2.api.riotgames.com` |
| NA1 | `na1.api.riotgames.com` |
| OC1 | `oc1.api.riotgames.com` |
| TR1 | `tr1.api.riotgames.com` |
| RU | `ru.api.riotgames.com` |
| PH2 | `ph2.api.riotgames.com` |
| SG2 | `sg2.api.riotgames.com` |
| TH2 | `th2.api.riotgames.com` |
| TW2 | `tw2.api.riotgames.com` |
| VN2 | `vn2.api.riotgames.com` |
| ME1 | `me1.api.riotgames.com` |

Regional:

| Region | Host | Phục vụ |
|---|---|---|
| AMERICAS | `americas.api.riotgames.com` | NA, BR, LAN, LAS |
| ASIA | `asia.api.riotgames.com` | KR, JP |
| EUROPE | `europe.api.riotgames.com` | EUNE, EUW, TR, ME1, RU |
| SEA | `sea.api.riotgames.com` | OCE, SG2, TW2, VN2 |

Lưu ý: **account-v1 chỉ có 3 cluster** (AMERICAS, ASIA, EUROPE), không có SEA.
Nhưng account-v1 trả cùng dữ liệu từ cả 3 cluster; đã thử một account VN2 từ
`asia`, `americas`, `europe` đều trả 200 và cùng PUUID. Dùng `asia` cho VN.

## 3. Endpoint TFT có thể dùng

Tất cả endpoint dưới đây đều là `GET`, auth bằng header `X-Riot-Token`.

### 3.1. Account — `account-v1`

| Endpoint | Host | Trả về |
|---|---|---|
| `/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` | ASIA | `puuid`, `gameName`, `tagLine` |
| `/riot/account/v1/accounts/by-puuid/{puuid}` | ASIA | `puuid`, `gameName`, `tagLine` |
| `/riot/account/v1/accounts/me` | ASIA | account của RSO access token (chỉ production + RSO) |

Đây là nguồn **duy nhất** để đổi Riot ID ↔ PUUID. Không dùng endpoint summoner
by-name (đã deprecated từ 2023).

Ví dụ:

```sh
curl -s -H "X-Riot-Token: $RIOT_API_KEY" \
  "https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/GameName/TagLine"
```

`gameName` có thể có dấu cách; URL-encode cả `gameName` và `tagLine`. Không truyền
dấu `#`.

### 3.2. Summoner — `tft-summoner-v1`

| Endpoint | Host | Trả về |
|---|---|---|
| `/tft/summoner/v1/summoners/by-puuid/{puuid}` | VN2 | `puuid`, `profileIconId`, `revisionDate`, `summonerLevel` |
| `/tft/summoner/v1/summoners/me` | VN2 | như trên, cần RSO Bearer token |

DTO hiện tại **không còn** `name`, `summonerId`, `accountId`. Tên lấy từ
account-v1; summoner chỉ để lấy icon và level.

### 3.3. League — `tft-league-v1`

| Endpoint | Host | Trả về |
|---|---|---|
| `/tft/league/v1/by-puuid/{puuid}` | VN2 | mảng entry cho mọi queue của người chơi |
| `/tft/league/v1/entries/{tier}/{division}?queue=&page=` | VN2 | entry theo tier/division, phân trang |
| `/tft/league/v1/challenger?queue=` | VN2 | league list của Challenger |
| `/tft/league/v1/grandmaster?queue=` | VN2 | league list của Grandmaster |
| `/tft/league/v1/master?queue=` | VN2 | league list của Master |
| `/tft/league/v1/rated-ladders/RANKED_TFT_TURBO/top` | VN2 | top Hyper Roll |

`queue` nhận `RANKED_TFT` (mặc định) hoặc `RANKED_TFT_DOUBLE_UP`.

Entry thường có:

```json
{
  "puuid": "…",
  "queueType": "RANKED_TFT",
  "tier": "CHALLENGER",
  "rank": "I",
  "leaguePoints": 1691,
  "wins": 181,
  "losses": 61,
  "veteran": true,
  "inactive": false,
  "freshBlood": false,
  "hotStreak": true
}
```

Lưu ý:

- `wins` = số lần **nhất**; `losses` = số lần **2-8** (theo docs Riot), không phải
  "thua" theo nghĩa thông thường.
- Queue `RANKED_TFT_TURBO` (Hyper Roll) không có `tier/rank/leaguePoints`; thay
  bằng `ratedTier` (ORANGE/PURPLE/BLUE/GREEN/GRAY) và `ratedRating`.
- **Không có tên người chơi** trong entry; chỉ có PUUID. Muốn hiện tên phải gọi
  account-v1 cho từng PUUID.
- Đo ngày 2026-10-30: VN2 Challenger trả 600 entry, Grandmaster 1.200 entry.
  `rated-ladders/RANKED_TFT_TURBO/top` trả **404** trên VN2 — có thể Hyper Roll
  không mở hoặc endpoint không phục vụ region này; phải xử lý trường hợp thiếu.

### 3.4. Match — `tft-match-v1`

| Endpoint | Host | Trả về |
|---|---|---|
| `/tft/match/v1/matches/by-puuid/{puuid}/ids?start=&count=&startTime=&endTime=` | SEA | mảng `matchId` |
| `/tft/match/v1/matches/{matchId}` | SEA | `MatchDto` đầy đủ |

Tham số:

| Tên | Ý nghĩa |
|---|---|
| `start` | Bắt đầu từ index nào; mặc định 0 |
| `count` | Số ID trả về; mặc định 20, đã thử 100 thành công |
| `startTime` | Epoch **giây**; chỉ lọc được từ 2021-06-16 trở đi |
| `endTime` | Epoch **giây** |

Đã thử `start=900&count=20` vẫn trả 20 ID, nên có thể backfill xa hơn 900 trận
của một người. Match ID có dạng `VN2_1619511378`; fetch detail bằng host SEA.

**Không có tham số lọc queue.** Muốn chỉ lấy Ranked phải fetch detail rồi lọc
`info.queue_id` — rất tốn call. Vì vậy crawl nên lấy mẫu có chủ đích, không lấy
toàn bộ lịch sử của mọi người.

### 3.5. Status — `tft-status-v1`

| Endpoint | Host | Trả về |
|---|---|---|
| `/tft/status/v1/platform-data` | VN2 | `id`, `name`, `locales`, `maintenances`, `incidents` |

Dùng để hiện banner bảo trì/sự cố, hoặc health check key. Không cần cho tính năng
chính.

### 3.6. Không nên dùng

| Endpoint | Lý do |
|---|---|
| `/lol/spectator/tft/v5/active-games/by-puuid/{puuid}` | DTO trả về theo kiểu LoL (championId, perks…), không có board TFT; là dữ liệu real-time, bị policy cấm dùng trong game |
| `/lol/*` (summoner, league, match-v5) | Không phải TFT; dễ lẫn dữ liệu |
| League Client API / Live Client Data API | Chỉ chạy local, không chính thức cho third-party; không dùng cho web |

### 3.7. Data Dragon — static data, không cần key

Data Dragon là nguồn static data chính thức, được phép dùng theo policy.

| File | Nội dung |
|---|---|
| `https://ddragon.leagueoflegends.com/api/versions.json` | danh sách version |
| `/cdn/{version}/data/{locale}/tft-augments.json` | augment: `id`, `name`, `description`, `image` |
| `/cdn/{version}/data/{locale}/tft-champion.json` | champion: `id`, `name`, `tier`, `cost`, `image` |
| `/cdn/{version}/data/{locale}/tft-trait.json` | trait: `id`, `name`, `image` |
| `/cdn/{version}/data/{locale}/tft-item.json` | item: `id`, `name`, `image` |
| `/cdn/{version}/data/{locale}/tft-queues.json` | queue id → tên/queueType |
| `/cdn/{version}/data/{locale}/tft-regalia.json` | icon rank |
| `/cdn/{version}/data/{locale}/tft-tactician.json` | Little Legend |
| `/cdn/{version}/data/{locale}/tft-arena.json` | arena |

Đo ngày 2026-10-30: version mới nhất là `16.21.1`; `tft-augments.json` có **761**
entry, **tất cả** đều có `description`; bản `vi_VN` có tên và mô tả tiếng Việt
(ví dụ `TFT_Augment_Coronation` → "Lên Ngôi Vương").

Ảnh:

```text
https://ddragon.leagueoflegends.com/cdn/16.21.1/img/tft-augment/Coronation_III.png
https://ddragon.leagueoflegends.com/cdn/16.21.1/img/tft-champion/DA_18_Sentry.TFT_Set18.png
https://ddragon.leagueoflegends.com/cdn/16.21.1/img/tft-item/TFT_Item_GuinsoosRageblade.png
https://ddragon.leagueoflegends.com/cdn/16.21.1/img/tft-trait/Trait_Icon_18_Fae.TFT_Set18.png
```

Giới hạn của Data Dragon:

- Item/trait **không có description, recipe hay breakpoint**; chỉ có tên + icon.
- Champion **không có traits, ability, mana**; chỉ có cost/tier/icon.
- Tên id không thuần nhất: có `DA_18_*`, `DA_*18`, `TFT_*`; đừng đoán prefix,
  hãy join bằng id chính xác hoặc tên.
- Version Data Dragon là **patch LoL** (`16.21.1`), không phải patch TFT
  (`18.5b` trong `meta.json`). Không so sánh chuỗi trực tiếp; map theo set + ngày.

## 4. Dữ liệu thật: shape và cách ghép catalog

### 4.1. Match DTO

Một match detail đo được ~20 KB JSON. Các field có thật trong set 18:

```json
{
  "metadata": {
    "data_version": "…",
    "match_id": "VN2_…",
    "participants": ["…8 puuid…"]
  },
  "info": {
    "endOfGameResult": "GameComplete",
    "game_datetime": 1793188890732,
    "game_length": 2250.38,
    "game_version": "TFT Unreal Version ?.?.?.?",
    "mapId": 22,
    "product_id": "teamfighttactics",
    "queue_id": 1100,
    "tft_game_type": "standard",
    "tft_set_core_name": "TFTSet18",
    "tft_set_number": 18,
    "participants": [
      {
        "puuid": "…",
        "riotIdGameName": "…",
        "riotIdTagline": "…",
        "placement": 1,
        "level": 10,
        "last_round": 37,
        "players_eliminated": 0,
        "time_eliminated": 2317,
        "gold_left": 1,
        "total_damage_to_players": 0,
        "win": true,
        "companion": { "content_ID": "…", "item_ID": 0, "skin_ID": 0, "species": "…" },
        "missions": { "PlayerScore2": 228 },
        "units": [
          {
            "character_id": "DA_18_Rakan",
            "itemNames": ["DA_TacticiansCape"],
            "name": "",
            "rarity": 0,
            "tier": 2
          }
        ],
        "traits": [
          {
            "name": "DA_18_Fae",
            "num_units": 1,
            "style": 0,
            "tier_current": 0,
            "tier_total": 2
          }
        ]
      }
    ]
  }
}
```

Các điểm phải nhớ:

| Field | Ghi chú |
|---|---|
| `game_datetime` | Unix **milli-giây** |
| `game_length` | giây, có phần lẻ |
| `time_eliminated` | giây kể từ đầu trận |
| `queue_id` | dùng field này; `queueId` là bản deprecated |
| `tft_game_type` | `standard` cho Ranked; Double Up có giá trị khác |
| `game_version` | **hỏng ở set 18**: `TFT Unreal Version ?.?.?.?` — không dùng để lọc patch |
| `tft_set_number` | 18 — dùng để lọc set |
| `units[].character_id` | id tướng, khớp `champions.api_name` |
| `units[].tier` | cấp sao (1/2/3) |
| `units[].rarity` | **không phải cost**; không dùng để suy ra giá tướng |
| `units[].itemNames` | danh sách id item; `items` (số) có thể vắng |
| `traits[].style` | 0 = chưa kích hoạt; 1-4 = bậc |
| `traits[].tier_current` | bậc hiện tại; dùng để lọc trait đang bật |
| `total_damage_to_players` | có thể là 0 (mẫu đo được 0); coi là không đáng tin, đừng dùng làm chỉ số chính |
| `missions` | field mới, không cần cho thống kê |
| `companion` | Little Legend; có thể dùng cho cosmetic, đừng dùng để đánh giá sức mạnh |

### 4.2. Ghép unit và trait

Đo 5 trận × 8 người = 40 participant:

| Loại | Slot | Khớp catalog | Tỷ lệ |
|---|---:|---:|---:|
| Unit (`character_id` → `champions.api_name`) | 318 | 318 | **100%** |
| Trait (`traits[].name` → `traits.api_name`) | 400 | 400 | **100%** |
| Item (`itemNames[]` → `items.api_name`) | 501 | 35 | 7% |
| Item sau bridge Data Dragon | 500 | 499 | **99,8%** |

Item thô dùng prefix `DA_*` (`DA_InfinityEdge`, `DA_SpiritVisage`,
`DA_Component_ChainVest`), còn catalog TFTIQ dùng `TFT_Item_*`
(`TFT_Item_InfinityEdge`, `TFT_Item_Redemption` cho Spirit Visage…). Không thể
map máy móc bằng prefix. Cách đúng:

1. Tải `tft-item.json` của Data Dragon.
2. Tạo map `itemId → itemName` (ví dụ `DA_SpiritVisage → "Spirit Visage"`).
3. Tạo map `items.name.toLowerCase() → items.api_name` từ catalog.
4. Join qua tên.

```ts
const nameById = new Map(Object.values(ddragon.data).map((item) => [item.id, item.name]));
const catalogByName = new Map(items.map((item) => [item.name.toLowerCase(), item.api_name]));

const catalogItemId = catalogByName.get(nameById.get(matchItemId)?.toLowerCase() ?? '');
```

Trường hợp không khớp còn lại là consumable (`DA_BlastPotion18` → "Blast Potion"),
không có trong catalog item — bỏ qua.

### 4.3. Những gì match data **không** có

Đã kiểm tra 10 trận:

- **Không có `augments`** ở participant. Không thể biết người chơi chọn augment
  gì, nên **không thể tính pick rate / win rate / avg placement theo augment**
  từ Riot API.
- Không có timeline theo stage; chỉ có snapshot cuối trận.
- Không có shop, roll, gold income, streak, HP theo vòng.
- Không có board của đối thủ, vị trí hex, hay đội hình giữa trận.
- Không có MMR; chỉ có rank/LP hiển thị.
- `game_version` không dùng được để lọc patch (xem trên).

## 5. Thông số có thể dùng cho dự án

### 5.1. Bảng tổng hợp

| Thông số | Nguồn | Công thức / cách lấy | Dùng cho |
|---|---|---|---|
| Rank, tier, LP, W/L | league by-puuid | nguyên DTO | Profile, leaderboard |
| Profile icon, summoner level | tft-summoner | nguyên DTO | Profile |
| 20-100 trận gần nhất | match list | `by-puuid/ids` | Match history |
| Placement, level, last round | match detail | participant | Avg placement, top4%, win% |
| Gold còn lại, damage | match detail | participant | Chỉ số phụ, không đại diện kinh tế |
| Tướng + sao + item | match detail | `units[]` | Unit/item stats |
| Trait active | match detail | `traits[]` với `style > 0` | Comp detection |
| Comp đã chơi | suy ra | so khớp unit với comp curate | Personal stats, meta |
| Queue/set | match detail | `queue_id`, `tft_set_number` | Lọc Ranked/Double Up |
| Lịch sử theo thời gian | match list | `startTime/endTime` | Filter tuần/tháng |
| Leaderboard | league apex | challenger/gm/master | Bảng xếp hạng |
| Trạng thái server | status | platform-data | Banner bảo trì |

### 5.2. Audit static data (làm được ngay, không cần key)

Data Dragon có thể dùng để:

- Đối chiếu `api_name`, tên tiếng Anh, tên tiếng Việt, icon của champion/item/
  trait/augment với `packages/shared/data/tft.json`.
- Bổ sung `description` / `descriptionVi` cho augment (DDragon có, 761/761 entry).
- Phát hiện id thiếu icon hoặc tên lệch.
- Không dùng để lấy trait breakpoint, item recipe, ability — những thứ đó phải
  giữ nguồn hiện tại.

Đây là việc ít rủi ro nhất và không cần key, nên làm trước.

### 5.3. Profile + match history (cần RSO nếu public)

Luồng:

```text
Riot ID → account-v1 (PUUID)
        → tft-summoner-v1 (icon, level)
        → tft-league-v1/by-puuid (rank, LP, W/L)
        → match-v1/ids (20 trận)
        → match-v1/matches/{id} (chi tiết)
```

Hiển thị được:

- Rank/LP hiện tại, W/L (theo định nghĩa Riot).
- 20 trận gần nhất: placement, level, comp, units/items, thời lượng, queue.
- Aggregate cá nhân: avg placement, top4%, win%, avg level, unit/item hay chơi.

**Điều kiện policy:** production key + RSO mới được hiển thị stats của người
chơi cho người đó. Không dùng Riot ID người khác để dựng profile công khai khi
chưa có RSO/đồng ý. Với key hiện tại, chỉ nên chạy admin-only để test trên
account của chính bạn.

### 5.4. Post-game comp detection

Không có nhãn comp trong match data, phải suy ra từ board cuối trận.

Cách đơn giản, đã thử trên 40 board Challenger VN:

```text
với mỗi comp curate:
  overlap = |units(board) ∩ units(comp)| / |units(comp)|
  score = overlap
chọn comp có score cao nhất
nếu score < 0.5 → "unknown"
```

Kết quả đo trên 5 trận (40 người), **chưa lọc theo carry** (đây là bản thô):

| Ngưỡng | Số board | Tỷ lệ |
|---|---:|---:|
| ≥ 0,8 | 20 | 50% |
| ≥ 0,6 | 36 | 90% |
| ≥ 0,5 | 39 | 97,5% |
| < 0,5 | 1 | 2,5% |

Đây là mẫu nhỏ, toàn Challenger, chỉ để chứng minh khả thi — chưa phải accuracy
thật. Ở rank thấp hơn, board lệch comp nhiều hơn, tỷ lệ sẽ giảm. Con số trên là
overlap thô, chưa loại board thiếu carry của comp, nên khả năng thực tế sẽ thấp hơn.

Sau khi detect, có thể tính:

- Avg placement / top4% / win% theo comp.
- Comp nào được chơi nhiều ở VN.
- So sánh tier curate (`S/A/B`) với placement thật.
- Unit/item đi kèm comp.

Hạn chế: người chơi pivot, nhiều comp dùng chung unit, board cuối trận không
phản ánh board giữa trận, và không có augment.

### 5.5. Meta VN từ ladder (research trước, public sau)

Có thể crawl PUUID từ Challenger/GM/Master của VN2, lấy match gần nhất, dedupe
theo `match_id`, rồi tính:

- Số trận, avg placement, top4%, win% theo comp detect được.
- Unit pick rate, item pick rate, trait activation rate.
- Level trung bình khi bị loại, thời lượng trận.
- So sánh VN với meta toàn cầu đang dùng (MetaTFT) — điểm khác biệt của dự án.

Nhưng:

- Sample bias: Challenger/GM không đại diện toàn server.
- Match list không lọc queue; phải fetch detail rồi lọc `queue_id`.
- Không có augment → không thể làm "augment meta VN".
- Với key hiện tại, chỉ nên chạy như research nội bộ, không public.
- Muốn public phải có production key + đăng ký product (use case "Aggregate
  player stats, no specific players" được duyệt không cần RSO).

### 5.6. Leaderboard

- Challenger/GM/Master trả entry có PUUID, LP, W/L.
- Muốn hiện tên: gọi account-v1 cho từng PUUID; 600 + 1.200 + Master = vài
  nghìn call. Với 50 call/phút, enrich toàn bộ mất khoảng 1-2 giờ.
- Cách tiết kiệm: chỉ enrich top 50-100, hoặc lazy-load tên khi người dùng mở
  rộng một row; cache 6-24 giờ.
- Hyper Roll top endpoint trả 404 trên VN2 ngày đo; phải ẩn tab nếu không có data.

### 5.7. Augment: không làm được từ Riot API

- Match participant không có augment.
- Không có endpoint nào trả augment đã chọn trong trận.
- Data Dragon chỉ có metadata/description, không có thống kê.
- Policy TFT cấm hiển thị win rate cho Legends và Legend-based Augments; mọi
  thống kê augment nếu có cũng phải review pháp lý trước khi public.

Vì vậy: giữ nguyên nguồn augment hiện tại (MetaTFT/tftflow), **không hứa** thêm
"augment win rate" từ Riot.

### 5.8. Live game: không làm

- Spectator TFT trả DTO kiểu LoL, không có board TFT.
- Policy cấm app/overlay dùng dữ liệu real-time trong game, theo dõi đối thủ,
  hoặc đưa ra gợi ý dựa trên trạng thái hiện tại.
- TFTIQ là pre-game + post-game; giữ nguyên định hướng đó.

## 6. Nếu triển khai: thiết kế tối thiểu

### 6.1. Client

Đặt trong `apps/api/src/riot/`:

```ts
type Region = 'vn2' | 'sea' | 'asia';

const HOSTS: Record<Region, string> = {
  vn2: 'https://vn2.api.riotgames.com',
  sea: 'https://sea.api.riotgames.com',
  asia: 'https://asia.api.riotgames.com',
};

async function riotGet<T>(region: Region, path: string): Promise<T> {
  const response = await fetch(HOSTS[region] + path, {
    headers: { 'X-Riot-Token': process.env.RIOT_API_KEY! },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After') ?? 1);
    throw new RiotRateLimited(retryAfter);
  }
  if (!response.ok) throw new RiotError(response.status, path);
  return response.json() as Promise<T>;
}
```

Không log URL có PUUID ở mức info nếu không cần; không log header.

### 6.2. Rate limiter

- Token bucket theo region: 100/120s và 20/1s, giữ headroom ~20% (80/120s).
- Hàng đợi tuần tự cho match-v1; không bắn song song 8 request match detail.
- Khi 429: dừng bucket, chờ `Retry-After`, rồi tiếp tục; không retry ngay.
- Single-flight cho cùng một key (match_id, puuid) để tránh gọi trùng.

### 6.3. Cache / schema tối thiểu

Có thể bắt đầu bằng bảng cache thay vì schema đầy đủ:

```sql
CREATE TABLE riot_cache (
  key text PRIMARY KEY,
  body jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
```

TTL đề xuất:

| Dữ liệu | TTL |
|---|---|
| Match detail | vĩnh viễn (immutable) |
| Match ID list | 5 phút |
| Account / summoner | 24 giờ |
| League entry | 30 phút |
| Leaderboard | 6-24 giờ |
| Data Dragon | theo patch |

Nếu làm tính năng lâu dài, tách bảng:

```sql
CREATE TABLE riot_matches (
  match_id text PRIMARY KEY,
  queue_id int NOT NULL,
  set_number int,
  game_datetime timestamptz NOT NULL,
  game_length int,
  raw jsonb
);

CREATE TABLE riot_participants (
  match_id text REFERENCES riot_matches ON DELETE CASCADE,
  puuid text NOT NULL,
  placement int NOT NULL,
  level int,
  last_round int,
  gold_left int,
  win boolean,
  PRIMARY KEY (match_id, puuid)
);

CREATE TABLE riot_participant_units (
  match_id text,
  puuid text,
  position int,
  character_id text,
  tier int,
  item_ids text[],
  PRIMARY KEY (match_id, puuid, position)
);
```

Lưu `raw jsonb` để có thể reprocess khi classifier đổi; JSONB của Postgres tự nén
và 20 KB/trận không quá lớn.

### 6.4. Ngân sách crawl

Với 100 request / 120 giây / region (50 request/phút):

| Việc | Call | Thời gian lý thuyết | Thời gian thực tế (80%) |
|---|---:|---:|---:|
| 1 người, 100 trận | 1 + 100 | ~2 phút | ~2,5 phút |
| 1.000 match detail | 1.000 | ~20 phút | ~25 phút |
| 10.000 match detail | 10.000 | ~3,3 giờ | ~4,2 giờ |
| 600 tên Challenger | 600 | ~12 phút | ~15 phút |
| 1.200 tên GM | 1.200 | ~24 phút | ~30 phút |

Dung lượng: 1 match ~20 KB JSON → 10.000 trận ~200 MB raw. Nếu chỉ lưu
participant/unit đã chuẩn hoá thì nhỏ hơn nhiều.

Mẹo:

- Lấy ID của nhiều người trước, dedupe `match_id`, rồi mới fetch detail. Một trận
  có 8 người nên tỷ lệ trùng rất cao.
- Ưu tiên trận mới; đừng backfill set cũ (dữ liệu cũ có thể bị Riot dọn).
- Nếu key là development, crawl dài có thể chết giữa chừng sau 24 giờ; lưu
  checkpoint và resume.

### 6.5. Comp classifier

Pseudo-code:

```ts
// Comp thật trong seed/comps.json: units[].name, carry là string (tên tướng)
function classify(board: Set<string>, comps: Comp[]): { comp: Comp; score: number } | null {
  let best: { comp: Comp; score: number } | null = null;
  for (const comp of comps) {
    const units = new Set(comp.units.map((unit) => unit.name));
    let overlap = 0;
    for (const unit of board) if (units.has(unit)) overlap++;
    const score = overlap / units.size;
    if (!best || score > best.score) best = { comp, score };
  }
  return best && best.score >= 0.5 ? best : null;
}
```

Ghi chú:

- `board` lấy từ `units[].character_id` → `champions.name`.
- Bản đo ở §5.4 chưa lọc carry. Thêm `if (!board.has(comp.carry)) continue;` để
  giảm nhầm lẫn (chưa đo lại với điều kiện này).
- Có thể cộng trọng số trait đang bật (`style > 0`) để giảm nhầm lẫn.
- Ngưỡng 0,5-0,6 là điểm bắt đầu; phải đo lại trên mẫu lớn và từng rank.
- Lưu `classifier_version` cùng kết quả để so sánh khi đổi thuật toán.

### 6.6. Job / cron

- `riot:refresh-league` mỗi 30 phút: lấy Challenger/GM/Master, upsert entry.
- `riot:refresh-matches` mỗi 10-15 phút: lấy ID mới của một tập PUUID, dedupe,
  fetch detail, classify.
- `riot:refresh-names` mỗi 24 giờ: enrich tên cho top leaderboard.
- Tất cả job chạy server-side, có lock (advisory lock) để không chạy trùng.
- Không đặt job trong request path của web.

## 7. Policy và pháp lý

Nguồn: [TFT docs](https://developer.riotgames.com/docs/tft),
[General policies](https://developer.riotgames.com/policies/general),
[Developer Portal](https://developer.riotgames.com/docs/portal).

### 7.1. Những điều cấm / hạn chế

Trích nguyên văn các điểm liên quan:

> Products cannot display win rates for Legends and Legend-based Augments.

> Products may not provide information that was not available prior to the game.
> For example, an app can provide metadata on augment statistics as this
> information is available prior to the game and is not based on in-game
> activity. An app cannot make suggestions based on the player's current game
> state as that information is dynamic and not readily available prior to the
> game start.

> Apps and Overlays during gameplay (including the loading screen) may not track
> your opponent's champions/plays or predict their next plays.

> Products cannot create alternatives for official skill ranking systems such as
> the ranked ladder. Prohibited alternatives include MMR or ELO calculators.

> You may not run your application for public consumption using a personal key,
> regardless of how long the approval process for your production key takes.
> Note that public consumption includes open alpha/beta tests.

> They [development keys] also deactivate every 24 hours. You'll need to
> regularly reset yours to keep it live.

Hệ quả cho TFTIQ:

- **Không** thêm augment win rate / Legend win rate.
- **Không** làm live overlay, theo dõi đối thủ, hay gợi ý theo trạng thái trận.
- **Không** tính MMR/ELO; chỉ hiện rank/LP có sẵn.
- **Không** dùng key hiện tại cho site public; chỉ admin/internal.
- **Không** hiện match history của người khác khi chưa có RSO/đồng ý.

### 7.2. Điều kiện để public

1. Đăng ký product trên Developer Portal; mô tả đúng use case.
2. Xin production key; nếu hiển thị stats của người chơi thì xin RSO.
3. Có free tier (TFTIQ đã có).
4. Nội dung trả phí phải "transformative" — không chỉ bán lại dữ liệu Riot.
5. Thêm boilerplate chính xác (câu bên dưới), hiển thị rõ.

Use case nào Riot đã duyệt (trích docs TFT):

| Use case | Cần RSO? | Ví dụ trong dự án |
|---|---|---|
| Showing (self) player stats | **Có** | Trang profile của chính người đăng nhập |
| Training tools xem match history + aggregate stats của mình | **Có** | Lịch sử trận cá nhân |
| Aggregate player stats (no specific players) | Không | "Meta VN": pick rate/avg placement theo comp |
| Official Ladder Leaderboards | Không | Bảng Challenger/GM/Master VN2 |

Use case **không** được duyệt: scouting (xem board đối thủ), app real-time, app
quyết định thay người chơi, hay bất kỳ thứ gì chỉ dùng được trong trận.

Boilerplate bắt buộc:

> TFTIQ isn't endorsed by Riot Games and doesn't reflect the views or
> opinions of Riot Games or anyone officially involved in producing or managing
> Riot Games properties. Riot Games, and all associated properties are
> trademarks or registered trademarks of Riot Games, Inc.

Hiện footer có câu gần nghĩa nhưng **không đúng nguyên văn**; nếu dùng Riot API
công khai thì nên thay bằng câu trên (hoặc thêm đúng câu này).

### 7.3. Dữ liệu cá nhân

- PUUID và Riot ID là dữ liệu người chơi. Chỉ lưu thứ cần cho tính năng.
- Có cơ chế xoá khi người dùng yêu cầu.
- Không công khai lịch sử của người khác.
- Không dùng dữ liệu Riot để suy ra thông tin không hiển thị trong game (MMR,
  win rate ẩn, thông tin của người chơi ẩn danh).

## 8. Thứ tự đề xuất

### Bước 0 — không cần key (1 buổi)

- Viết script so sánh `tft.json` với Data Dragon `16.21.1`:
  - id/tên/icon thiếu;
  - augment có descriptionVi chưa;
  - item/trait name lệch.
- Chỉ sửa những khác biệt thật; không thay toàn bộ nguồn.

### Bước 1 — prototype admin-only (1-2 ngày)

- Trang admin nhập Riot ID của chính bạn.
- Gọi account → summoner → league → 5 match gần nhất.
- Hiện rank, 5 trận, unit/item, placement.
- Không public, không lưu lâu, không gọi từ web browser.

### Bước 2 — research meta VN (2-3 ngày)

- Crawl thử 2.000-5.000 trận từ Challenger/GM VN.
- Chạy classifier, so sánh avg placement theo comp với tier curate.
- Đo sample size, bias, tỷ lệ "unknown".
- Quyết định có đáng làm "Meta VN" không.

### Bước 3 — quyết định sản phẩm

- Nếu chỉ muốn profile cá nhân: xin production + RSO.
- Nếu muốn meta VN công khai: xin production key + đăng ký product (use case
  aggregate stats), không cần RSO.
- Nếu cả hai: làm RSO trước, rồi mở profile; meta aggregate có thể làm sau.

### Không nên làm ngay

- Không thêm endpoint public nào gọi Riot bằng key hiện tại.
- Không crawl toàn bộ ladder ngay (vài nghìn entry × account lookup rất tốn).
- Không hứa "augment stats" từ Riot.
- Không đưa Riot ID lookup vào assistant khi chưa có RSO.

## 9. Smoke test

Đặt key trong `apps/api/.env` (đã có). Chạy từ root:

```sh
export RIOT_API_KEY="$(grep '^RIOT_API_KEY=' apps/api/.env | cut -d= -f2-)"

# 1. Key sống, routing đúng
curl -s -D - -o /dev/null \
  -H "X-Riot-Token: $RIOT_API_KEY" \
  "https://vn2.api.riotgames.com/tft/status/v1/platform-data"

# 2. Riot ID → PUUID (thay GameName/TagLine)
curl -s -H "X-Riot-Token: $RIOT_API_KEY" \
  "https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/GameName/TagLine"
# → copy puuid trong response vào biến:
PUUID=...

# 3. Rank
curl -s -H "X-Riot-Token: $RIOT_API_KEY" \
  "https://vn2.api.riotgames.com/tft/league/v1/by-puuid/$PUUID"

# 4. 20 trận gần nhất
curl -s -H "X-Riot-Token: $RIOT_API_KEY" \
  "https://sea.api.riotgames.com/tft/match/v1/matches/by-puuid/$PUUID/ids?count=20"

# 5. Một trận
curl -s -H "X-Riot-Token: $RIOT_API_KEY" \
  "https://sea.api.riotgames.com/tft/match/v1/matches/VN2_1234567890"
```

Kết quả đo ngày 2026-10-30:

| Test | Kết quả |
|---|---|
| Status VN2 | 200, `id: VN2` |
| Challenger VN2 | 200, 600 entry |
| Grandmaster VN2 | 200, 1.200 entry |
| Match list `count=100` | 200, 100 ID |
| Match list `start=900` | 200, 20 ID |
| Match detail | 200, ~20 KB, set 18, queue 1100 |
| Account by Riot ID | 200 trên cả ASIA/AMERICAS/EUROPE |
| Summoner by PUUID | 200, icon + level |
| Hyper Roll top | 404 trên VN2 |
| `augments` trong 80 participant | 0 |

## 10. Câu hỏi mở

- Key hiện tại là development hay personal? Nếu sau 24 giờ vẫn chạy thì là
  personal; nếu chết thì là development.
- Có muốn mở profile người chơi không? Nếu có, RSO là bắt buộc và thời gian xin
  production key có thể lâu.
- Có muốn "meta VN" không? Cần đo sample size và chi phí crawl trước.
- Có chấp nhận dữ liệu không có augment không? Nếu không, Riot API không giải
  quyết được bài toán augment.
- Patch nào đang live? `game_version` hỏng, nên cần bảng map ngày → patch từ
  nguồn ngoài (MetaTFT/tftflow hoặc patch notes).
