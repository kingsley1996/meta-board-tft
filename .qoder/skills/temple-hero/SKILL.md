---
name: temple-hero
description: Dựng một nhân vật mới trong chánh điện Đền Cầu May (apps/web/vendor/temple/js/avatar.js) từ một ý tưởng hoặc một ảnh tham khảo — đo màu từ ảnh, sơn một phiến mặt liền, thêm 3D chỉ phần sơn với tới không được, nối sang server (HERO_IDS), ô chọn nhân vật trong Hồ sơ và ảnh thumbnail 3D. Dùng khi người dùng xin "thêm nhân vật mới", "nhân vật thứ 13", "một tướng cho Đền", "làm mặt nạ kiểu này theo ảnh", vẽ lại một hình đã có, hoặc hỏi vì sao ô chọn nhân vật bị cắt đầu. Add a new procedural temple hero from an idea or reference image.
---

# Nhân vật mới cho Đền Cầu May

Một nhân vật ở đây **không phải file model và không phải ảnh asset**: nó là khối Three.js
procedural trong `avatar.js` (đầu + props) cộng một tấm canvas sơn mặt. Skill này rút gọn
từ ca làm hình thứ 13 (`yone_chibi`), nơi mỗi bước sai đều đã phải trả bằng một lượt
render 90 giây.

## Chọn đường nào

- **Chỉ có ý tưởng bằng lời** — hỏi lấy một ảnh tham khảo trước khi vẽ. Không có ảnh thì
  màu do đoán, mà đoán màu là "bypass" và sẽ bị bác kèm bằng chứng. Nếu user khăng khăng
  không có ảnh, lấy palette từ một hình đã có trong `HERO_LIST` và nói rõ là đang vay.
- **Có ảnh tham khảo** — đo, đừng tái tô: `scripts/measure.mjs` (median vùng no màu,
  không phải mean, vì nền mờ và chớp sáng trắng kéo mean đi). Ghi từng hex kèm phép đo
  vào comment ngay cạnh hằng số.
- **Sửa một hình đã có** — đọc comment trong nhánh `buildHeroHead3D` của id đó trước: nó
  chứa danh sách hướng đã thử và đã bị bác. Đừng đề xuất lại những gì đã bị gỡ.

## Chỗ ở của một nhân vật (touchpoints)

Sửa thiếu một chỗ là id rơi về hình ngẫu nhiên (`resolveHero`), nên làm đủ bộ:

| Tệp | Sửa gì |
|---|---|
| `apps/web/vendor/temple/js/avatar.js` | `HERO_LIST` (id, name, title, robeColor, sashColor, aura, skin, skillColor, pantsColor); `makeHeroFaceTex` (sơn mặt); `buildHeroHead3D` (3D đầu); `buildHeroProps3D` (vũ khí/vfx); `G` nếu cần tấm sơn kích thước mới |
| `apps/api/src/temple/heroes.ts` | `HERO_IDS` — thiếu thì server trả 404 `no_such_hero` |
| `apps/web/components/temple/engine.ts` | `HERO_SPRITE` **chỉ khi tấm sprite thật sự còn ô**; `Hero` type nếu thêm field |
| `apps/web/components/temple/hall.tsx` + `vendor/temple/css/app.css` | ô trong Hồ sơ (`HeroThumb`, `.hc-thumb-3d`) |
| `apps/web/vendor/temple/js/thumbs.js` | `heroScene` + `heroThumb` — khung máy ảnh của ô |
| `apps/api/src/temple/bots.ts` | bot mượn lại `HERO_LIST` (12/13 hình đang được dùng). Số trong comment đầu mảng `ROSTER` đếm **số bot** (20 = `BOT_MAX`), không đếm hình — đừng nhầm |

**Thứ tự làm**: (1) đăng ký id cho thông server + HUD trước, để nhân vật sống và xem được
ngay từ phút đầu; (2) sơn phiến mặt; (3) 3D chỉ cho phần sơn với không tới; (4) ô thumbnail
cuối cùng. Làm ngược là trả tiền render cho một hình chưa vào được sảnh.

## Hình học: ba bất biến

1. **Thang bán kính**: khối đầu `G.head` 0.46, tấm sơn `G.facePatch` / `G.yoneMask` 0.463.
   Mọi mesh lớn hơn 0.463 đè lên lớp sơn; hai surface cùng bán kính chồng diện tích thì
   z-fighting; hai surface kề nhau ở hai bán kính thì để lại một cái gờ — chính là "rãnh
   nối" mà user đã ba lần gọi tên. **Một hình thù liền mạch = một tấm sơn, không phải N vỏ
   cầu ghép.** 3D chỉ dành cho thứ nhô ra khỏi vỏ (sừng, bờm, kiếm, lọn tóc).
2. **Đỉnh hình cầu**: `y = r*cos(theta)`, `x = -r*cos(phi)*sin(theta)`, `z = r*sin(phi)*sin(theta)`.
   Mặt trước là `-z`; `azimuth = deg(atan2(z, -x)) + 90`. Tấm `facePatch` phủ phương vị
   ±57,6°, polar 43,2°..140°.
3. **Canvas phải sinh ra đúng theo tấm sơn**: `x = (phi/π − phiStart)/phiLength * W`,
   `y = (theta/π − thetaStart)/thetaLength * H`. Muốn quấn kín 360° thì canvas phải rộng theo
   `phiLength = 2`, không phải vẽ tiếp trên tấm 512 cũ.
   Hai trục **không** đẳng hướng, và phải cố tình giữ lệch: `facePatch` 512×512 cho 0,64π×0,54π
   = 4,44 px/độ phương vị nhưng 5,27 px/độ cực (tỉ số 54/64 = 0,844). `yoneMask` 1600×763
   chính là tấm 512 cũ nhân lên theo từng trục (1600/2π = 512/0,64π; 763/0,805π = 512/0,54π)
   để nét đã sơn giữ nguyên kích thước. Hệ quả: một vòng tròn vẽ bằng px trên canvas nằm lên
   đầu sẽ **dẹt dọc 0,844×** — muốn tròn thật thì vẽ cao hơn rộng 1,185×. `fit.mjs px` in ra
   cả hai số px/độ; đừng giả sử chúng bằng nhau.

Đừng làm phép tính này bằng đầu: `scripts/fit.mjs` trả world y/z, theta, azimuth, và
`LOT/CẮT MIẾNG` cho khung máy ảnh. Cone trong three đặt **tâm** ở `pos`, mũi ở
`pos + axis*(h/2)` với `axis = Rx(Ry(Rz(+y)))`.

## Khung máy ảnh của ô thumbnail

`heroScene` không được mượn camera của `robeScene` — robeScene cắt đầu là chủ ý vì nó chỉ
lo thân áo. Tính từ hai điểm cùng `z` của chúng (đỉnh cao nhất và đáy thấp nhất **sau khi
thân đã xoay 0.45**, vì phần gần ống kính chiếu lớn hơn): một điểm ở độ sâu `d + z` lọt
khi `|y − cy| ≤ (d + z)·tan(fov/2)`, fov 32. Dùng `fit.mjs frame --need y,z`. Ô `.hc-thumb`
là 40×40 và ảnh render 144×144 nên `object-fit: cover` không cắt thêm — chỉ có khung là cắt.

## Vòng bằng chứng (rẻ → đắt)

```
node .qoder/skills/temple-hero/scripts/check-ids.mjs <id-moi>   # ~0s: id đã thông cả 4 chỗ chưa
node --check apps/web/vendor/temple/js/avatar.js   # MỖI LẦN CHỈ MỘT TỆP:
node --check apps/web/vendor/temple/js/thumbs.js   # node --check nhận đối số thứ hai rồi exit 0 mà không soi nó
cd apps/web && npm run typecheck          # + apps/api nếu đụng heroes.ts/bots.ts
node scripts/hero-thumb.mjs /tmp/out      # ~60s: ảnh 144px + thẻ thật trên nền tối
node scripts/hall-shot.mjs /tmp/hall.png  # ~90s: CHỈ khi user bấm
# hai script render đăng nhập bằng tài khoản dev mien phat: TEMPLE_PASS=.. mới chạy,
# khong co mac dinh vi mat khau khong duoc nam trong repo
```

- `check-ids.mjs` đọc `apps/...` bằng đường dẫn tương đối nên phải chạy từ **gốc repo**; hai
  script render thì không kén cwd (tự trỏ `:4173` + API `:4000`, đổi bằng env `WEB`/`API`).
- `pageerror: 0` là sạch; bất kỳ chuỗi nào sau `pageerror:` là lỗi thật.

- `hero-thumb.mjs` chạy đúng hàng đợi `thumbs.js` của trang dev thật (:4173 + API :4000),
  chờ bằng `waitForFunction` trên số ô 3D — `setTimeout` cố định sẽ đọc ảnh của lần trước.
- Ảnh PNG thô có nền suốt: vành sáng dưới chân là additive nên trên nền trắng nó thành vệt
  đen; muốn biết người chơi thấy gì thì xem `card-<i>.png`, không phải `thumb-<i>.png`.
- swiftshader chạy ~3fps; đo nhịp chớp phải suy từ fps, đừng lấy giây tường thuật.
- Một lượt render sảnh ~90s: kiểm mọi số bằng Node trước, sửa một lần cho cả một nhóm lỗi.

## Copy

- Tên = 2–3 chữ tả **ngoại hình** (`Mặt Nạ Sừng`), title = một vế thơ (`Song Kiếm Dẫn Hồn`).
- exp luôn là "Điểm May Mắn"; cấm "Bia Công Đức", "Bảng Tinh Tấn", "tuỳ hỷ", Thiền→"Khởi động".
- Quét chữ CJK lọt vào comment tiếng Việt sau mỗi lượt sửa:
  `node -e "…test(/[\u3000-\u30ff\u3400-\u9fff\uac00-\ud7af\uff00-\uffef]/)…"` — hai hit
  tiếng Hàn trong `avatar.js` (승복, 가사) là hợp lệ, còn lại là typo.
- Grep tiếng Việt fail im lặng vì pattern NFD còn file NFC: normalize `'NFC'` trong script Node.

## Lỗi đã trả giá — đừng lặp lại

1. **Mượn khung `robeScene`** cho ô nhân vật → nửa trên đầu bị cắt. Học: khung phải tính, không vay.
2. **Chồng vỏ cầu ở các bán kính kề nhau** (vành trán + hai má che ở 0.484/0.487, mũ tóc 0.494)
   + tube 3D + texture mắt riêng → "các chi tiết chồng chéo lên nhau". Học: một tấm sơn, gỡ hết
   lớp bị thay thế. Ba con số đó giờ chỉ còn trong comment (`avatar.js:233, 515, 890`) — grep thấy
   nó sống trong code nghĩa là ai đó mới ghép vỏ trở lại.
3. **Đo theta/phương vị từ ảnh render** (tính 39°, đọc ảnh 59°) → đuổi số mãi. Học: dùng công thức.
4. **Nhầm `sin` thành `cos` cho trục y** của đỉnh cầu → mọi số hình học sai theo. Chỉ tin sau
   khi so vertex thật của `SphereGeometry`.
5. **Vẽ tiếp canvas 512 cho một tấm patch quấn 360°** → mép ảnh lòi giữa trán. Học: sinh canvas
   theo patch (bất biến 3), rồi **giữ nguyên px/độ của từng trục** chứ không chia đều hai trục.
6. **Mũ tóc 3D đồng tâm** (0.494) chôn kín trán; **lệch tâm 0.14 về sau** thì mép trước của vỏ
   tóc 0.470 rơi vào phương 79,2° — **trong** vùng sơn (tới 84,6°) và to hơn phiến 0,007, nên vẫn
   cắt một đường cong xuống tận gáy. Học: không đặt tóc 3D lên vùng sơn; đường chân tóc là nét
   biên trong ảnh.
7. **Hard-code số lượng vào copy và comment** — thêm hình là sai số ngay. Dry-run 2026-11-09 bắt
   và sửa một chỗ thật (`avatar.js:resolveHero` viết "cả 12 tướng" khi đã 13) và một chỗ **báo
   động giả**: `bots.ts` "Hai mươi nhân vật" đếm số *bot* (ROSTER 20 = `BOT_MAX`), không phải số
   hình, nên con số ấy đúng. Học: dẫn xuất `HERO_IDS.length` hoặc bỏ con số, nhưng **đếm cái mà
   câu ấy nói tới trước khi sử nó** — số sai và số đúng ngữ cảnh trông giống hệt nhau.
   Chuẩn để so: `HERO_LIST` và `HERO_IDS` phải khớp từng id theo đúng thứ tự.
8. **`require('three')` trong Node** → MODULE_NOT_FOUND vì avatar.js dùng bare specifier.
   Học: tự quay vector bằng tay (như `fit.mjs`) hoặc chạy trong browser.
9. **Khoá cache của `thumbs.js`** dùng `it.id` trần → ô nhân vật đụng ảnh món đồ cùng tên.
   Học: prefix `hero:`.
10. **Cho rằng tấm sprite 4×3 còn ô cho hình mới** → không còn, và cắt ghép ảnh khác là bypass.
    Học: đếm ô trước, rồi vẽ 3D qua hàng đợi có sẵn.
11. **Nhấc sáng palette +14** vì "sảnh tối hơn ảnh" → ra "hồng kẹo cao su". Học: median vùng
    no màu, giữ nguyên số đo.
12. **Sửa tệp sắp bị xoá cả tệp** → công vứt đi. Học: nêu ra và đổi thứ tự việc.
13. **Coi dòng `pageerror: khong loi` là lỗi** — đó là nhánh "không có lỗi" tự in ra, giờ đã đổi
    thành `pageerror: 0` (bất kỳ số nào khác 0 mới là lỗi thật). Pageerror lạ (ví dụ `isReady`)
    không có trong repo: báo một câu, đừng tự đào.

14. **Truyền toạ độ px vào `measure.mjs --region/--crop`** — script nhận tỉ lệ 0..1, số lớn biến
    vòng lặp thành hàng trăm triệu lượt và **crash OOM 4 GB** chứ không báo lỗi. Học: script giờ
    chặn và in ra cách đổi đơn vị; vẫn phải nhớ `0.3,0.1,0.7,0.5` chứ không phải `324,108,756,540`.

## Gate và git

- Mỗi lần user cho phép là **một phạm vi**: commit + push ≠ deploy. Prod web/Render phải xin riêng.
- Không bao giờ stage: `app/[lang]/page.tsx`, `app/[lang]/patches/**`, `app/[lang]/tables/**`,
  `components/nav.tsx`, `lib/data.ts`, `lib/messages.ts`, `lib/season-window.*`,
  `tests/*.spec.ts`, `tests/season.ts`, `docs/SET-ROTATION-PLAN.md`, `packages/shared/data/set.json`.
  Stage từng đường dẫn, không `git add -A`.
- Message theo `feat(temple): <mệnh đề lowercase>`; body tiếng Anh giải thích **vì sao**,
  ghi cả phép đo — các bài `130fd6b`, `8fc7641` là mẫu.

## Resources

- `scripts/check-ids.mjs` — chạy từ gốc repo: đối chiếu `HERO_LIST` / `HERO_IDS` / `HERO_SPRITE`
  / ROSTER và báo cho từng id mới. Cổng của bước (1); exit 1 khi client và server lệch nhau.
- `scripts/measure.mjs` — palette / median vùng / lưới toạ độ / crop phóng từ ảnh tham khảo.
  Toạ độ `--region` và `--crop` là **tỉ lệ 0..1**, không phải px.
- `scripts/fit.mjs` — point, cone, khung máy ảnh, `uv`/`px` cho canvas↔(phi,theta). Không cần
  three. Mặc định là `facePatch`; sơn `yoneMask` thì phải truyền đủ `--w --h --phiStart
  --phiLength --thetaStart --thetaLength` (xem header).
- `scripts/hero-thumb.mjs` — ảnh ô chọn nhân vật + thẻ trong DOM, qua hàng đợi thumbs.js thật.
- `scripts/hall-shot.mjs` — dựng sảnh, kéo camera (`--yaw --pitch --zoom`), chụp. Đắt.
