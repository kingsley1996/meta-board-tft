---
name: temple-hero
description: Dựng một nhân vật mới trong chánh điện Đền Cầu May (apps/web/vendor/temple/js/avatar.js) từ một ý tưởng hoặc một ảnh tham khảo — đo màu từ ảnh, sơn một phiến mặt liền, thêm 3D chỉ phần sơn với tới không được, nối sang server (HERO_IDS), ô chọn nhân vật trong Hồ sơ và ảnh thumbnail 3D. Dùng khi người dùng xin "thêm nhân vật mới", "nhân vật thứ 13", "một tướng cho Đền", "một tướng theo hình này", "làm mặt nạ kiểu này theo ảnh", "tách hình này thành trang bị bán trong cửa hàng", vẽ lại một hình đã có, chỉnh tạo hình một prop đã có (đuôi, kiếm, áo choàng) cho to/dày/nhỏ hơn, hoặc hỏi vì sao ô chọn nhân vật bị cắt đầu, vì sao đuôi "dính" lên tóc, vì sao nhìn từ sau không đủ số đuôi. Add a new procedural temple hero from an idea or reference image, or split an existing hero into equippable gear.
---

# Nhân vật mới cho Đền Cầu May

Một nhân vật ở đây **không phải file model và không phải ảnh asset**: nó là khối Three.js
procedural trong `avatar.js` (đầu + props) cộng một tấm canvas sơn mặt. Skill này rút gọn
từ ca làm hình thứ 13 (`yone_chibi`), nơi mỗi bước sai đều đã phải trả bằng một lượt
render 90 giây.

## Bức chuẩn: `batman_chibi` (hình 15)

Cần biết "xong" trông như thế nào thì mở hình này ra đọc, nó đi qua cả bốn bước của skill:

1. **Không có ảnh đo vẫn không đoán màu.** Hai URL ảnh tham khảo trả về HTML (chặn client
   không phải trình duyệt) nên không có pixel nào để median; toàn bộ palette VAY từ các hình
   đã ship và mỗi hex ghi kèm nó đang mặc ai (`avatar.js:172-183`). Vay có dẫn xuất khác
   đoán — user đã bác "đoán mã màu mới" nhiều lần.
2. **Một cái nạ kín = MỘT phiến sơn quấn 2π**, không phải vài vỏ cầu áp vào nhau
   (`WRAP_FACE_IDS` `avatar.js:314`, nét sơn ở nhánh `makeHeroFaceTex` `avatar.js:870`).
   Lỗ mặt khoét bằng `globalCompositeOperation = 'destination-out'` nên da thật của khối đầu
   hiện xuống tới tận biên vải: không có chỗ nào hai mảnh áp biên vào nhau, tức là không có
   cái "rãnh nối" mà user đã ba lần gọi tên.
3. **3D đúng một nét**: hai tai nạ (`avatar.js:1280`), vì chúng NHÔ ra ngoài vỏ 0,463 chứ
   không nằm TRÊN vỏ. Cái gì nằm trên vỏ thì sơn lo.
4. **Hai thứ phiến sơn với tới không được thì dựng khối, và dựng ở `gear.js`**
   (`avatar.js:1528` gọi `batCape()`/`batEmblem()`) — xem §"Tách một hình thành trang bị".
5. **Mỗi con số đi kèm phép đo, không có số nào "thử thấy đẹp"**. Comment trong từng nhánh
   là một bài toán có ràng buộc (rim bao nhiêu, cao hơn đáy khối đầu bao nhiêu, vì sao chỗ
   đó không z-fighting); viết hình mới thì giữ đúng cái đuôi đó, nếu không thì lượt sau
   không biết con số nào được phép đổi.

Chuẩn cho **prop nhiều nhánh biết động** (đuôi, vòng kiếm, khói) thì đọc nhánh `ahri_chibi`:
nó là ca duy nhất đi hết vòng `silhouette.mjs` và là nơi cả bốn bất biến hình học đều có thật.

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
| `apps/api/src/temple/bots.ts` | bot mượn lại `HERO_LIST`. Số dòng `ROSTER` = số **bot** (= `BOT_MAX`), không phải số hình — nhiều bot dùng chung một id, nên hình mới KHÔNG bắt buộc phải vào ROSTER. Đừng viết con số hình nào vào comment ở đây (lỗi 7) |

**Thứ tự làm**: (1) đăng ký id cho thông server + HUD trước, để nhân vật sống và xem được
ngay từ phút đầu; (2) sơn phiến mặt; (3) 3D chỉ cho phần sơn với không tới; (4) ô thumbnail
cuối cùng. Làm ngược là trả tiền render cho một hình chưa vào được sảnh.

## Tách một hình thành trang bị bán được

User nói "cho tướng khác mặc được bộ đồ của hình này" nghĩa là mỗi phần phải có **MỘT hàm
dựng duy nhất** trong `gear.js`, và `avatar.js` gọi đúng hàm đó khi vẽ chủ nhân. Hai bản sao
lệch nhau một li là hai mặt cùng transform → z-fighting chớp cả lúc ngồi thiền; hai bản trùng
khít thì `ALREADY_WORN` (`gear.js:314`) phải ẩn bản mua, không tướng chủ mặc trùng đôi. Số học
và giá đã chốt ghi ở `docs/SHRINE-CONTENT-MAP.md` §4.7.

| Tệp | Sửa gì |
|---|---|
| `gear.js` | hàm dựng (`batCape` `:277`, `batEmblem` `:300`, `HATS.na_doi` `:125`) → đăng ký vào `CAPES`/`EMBLEMS` → thêm `kind:model` vào `ALREADY_WORN` của tướng chủ → `addGear()` nhận thêm loại mới |
| `vendor/temple/data/meta.json` | mục hàng hoá (`id`/`type`/`price_*`/`sort`); `data` là thông số render nên ấn ngực phải có chỗ ngồi riêng — nó là `data.emblem` của một món robe vì nó dán lên thân áo, không lên choàng |
| `apps/web/scripts/rename-meta.mjs` | thêm dòng copy cho từng id mới; thiếu là script chết ở `no copy map entry` |
| `catalog.ts` + `identity.ts` | loại mới thì thêm vào `WEARABLE` và `EQUIPPED_KEYS` |
| `world.js` `look()` | truyền `this.items[eq.<loại>]?.data` xuống `makeAvatar` — thiếu thì mua xong không mặc được |
| `hall.tsx` | `BAG_TABS` (tab trong túi) + `UNEQUIPPABLE` (tháo được thì thêm) |
| `thumbs.js` | `SCENES` + khung máy ảnh `gearScene` |

Ba bẫy đã trả giá:

1. `addGear()` nhân **mọi** chiếc mũ 1,15 quanh tâm đầu (dải 0,405 phải ló khỏi đầu 0,46), nên
   mẫu `HATS.*` viết theo số thế giới **chia 1,15**, không phải số nguyên trong `avatar.js`.
2. Giá một món Quý mới không phải số tuỳ hứng: `catalog.test.ts:84-86` chốt thang đổi duyên =
   median hàng Quý cùng type × 2,5, robe đang ở median 270 → 680 Sen. Thêm món robe Quý giá
   khác là kéo cả chiếu lão lệch theo và làm đỏ test — `ao_duc_anh` 270 là để bất biến đó đứng.
3. Món nằm SAU lưng thì ô thumbnail phải quay máy ảnh ra phía `+z`, và bắt buộc vẽ trên một
   hình KHÔNG mặc món đó sẵn: để đúng `appearance` của người đang chơi thì chủ nhân Hiệp Sĩ
   Dơi thấy một ô trống (`ALREADY_WORN` đã ẩn nó) — `gearScene` ép `hero: 'luffy_g5'`.

## Hình học: bốn bất biến

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
4. **Tóc không phải một khối, và prop nhiều nhánh không phải nhiều prop.** `ahri_chibi` có bốn
   vỏ tóc (R 0,494..0,524, nhân dọc 1,09) nên "bán kính tóc" không tồn tại — mọi phép thử va
   chạm phải hỏi mesh, không hỏi một hằng số. Một quạt chín đuôi là **một** `Group` được
   `root.add()` **một** lần, rồi `vfxGroup.userData.tailFan = fan` để cổng đo tìm đúng nó; mỗi
   nhánh mang `userData.wi` (số dòng trong bảng) và `userData.sg` (phải/trái) — hai khoá đó là
   thứ duy nhất khiến bảng số in ra sửa được từng dòng một. Gốc chung phải `khuat ≤ 0` (nằm
   NGOÀI bề mặt thân), và `be ngang goc` đo bằng vòng bán kính 0,06 quanh điểm tụ chứ không bằng
   lát cắt dải y (lát cắt báo 1,585 m — một con số vô nghĩa nhưng vẫn "in ra được").

Đừng làm phép tính này bằng đầu: `scripts/fit.mjs` trả world y/z, theta, azimuth, và
`LOT/CẮT MIẾNG` cho khung máy ảnh. Cone trong three đặt **tâm** ở `pos`, mũi ở
`pos + axis*(h/2)` với `axis = Rx(Ry(Rz(+y)))`.

## Cổng bóng đè: đo từ mesh thật

`scripts/silhouette.mjs <id> [flags]` — chạy trên **scene của harness**, không có công thức
tải liệu nào trong nó. Đây là cổng trả lời ba câu mà mắt không trả lời nổi trước một lượt
render:

```
node .qoder/skills/temple-hero/scripts/silhouette.mjs ahri_chibi \
     --occ head --view rear,q3,thumb --walk --sweep 6 --shots /tmp/gate
```

| Cờ | Ý nghĩa |
|---|---|
| `--group` | nhánh prop cần đo: tên cột của `av` **hoặc** khoá `userData` (`tailFan` là `vfxGroup.userData.tailFan`) |
| `--occ` | nhánh bị che: `head` = chỉ tóc+mặt, mặc định = cả thân |
| `--view` | `rear` `q3` `thumb` `front`, hoặc số nguyên van `az,el,dist,ty`; lặp lại được |
| `--walk --sweep N` | **bắt buộc với prop động** — xem dưới |
| `--min-gap 12` | hai đầu ngọn sát nhau hơn 12° trên vòng tròn chiếu là mắt gộp thành một |

Bốn số in ra, mỗi số ứng với một lỗi đã bị gọi tên bằng lời:

- `DE LEN` = số đỉnh của prop nằm **trước** bề mặt vật che trong hình chiếu máy ảnh. Đây là
  định nghĩa đúng của "đuôi đè lên tóc": không phải gần nhau trong 3D, mà **chắn nhau trên
  màn hình**. Must be 0.
- `bi an` = đỉnh nằm sau vật che. Ở `rear` phải bằng 0 (đủ 9 ngọn); ở `q3`/`thumb` nó
  ~1400 và **đó là chuyện thường** — thân che đuôi khi đứng nghiêng.
- `goc dinh` in theo **từng nhánh** (`wi3R 49.8°`), vì comment trong `avatar.js` ghi
  "bốn đôi bên phải đặt …" mà không có nhãn thì không biết đổi đường nào.
- `goc: … khuat -0,03` = gốc prop phải **ngoài** bề mặt thân (`khuat ≤ 0`). Gốc chôn trong
  thân thì mỗi ngọn chỉ ló ra chỗ nó xuyên qua áo, thành "chín đuôi moc từ chín điểm".

Bốn ràng buộc khi đọc số:

1. **Prop động thì phải lấy frame xấu nhất.** Quạt đuôi nghiêng ±0,075 rad theo nhịp đi, nên
   một frame báo 36 trong khi đỉnh chu kỳ báo 192. `--walk --sweep 6` lặp lại 6 lần cách
   nhau 600 ms và giữ frame có `over` lớn nhất; cổng một frame là cổng nói dối.
2. **Khoảng cách góc chỉ đo được ở máy thẳng sau.** Nghiêng 3/4 thì chín ngọn chen nhau trên
   một vòng tròn (he nhat 2,7°) — đó là thiếu không gian của phối cảnh chứ không phải lỗi,
   ép gate ở đây sẽ xoe đuôi vô ích. Script tự tắt cổng này khi `|az| > 20°` và in
   `KHONG gate` để không ai đọc nhầm.
3. **Cái gì nằm TRÊN một vỏ cầu thì không dùng hình học giải tích để quyết.** Bài học đắt
   nhất: cổng giải tích (bán kính mũ tóc 0,485) báo `0 đỉnh đè` cho một cấu hình mà mesh
   báo 138–192. Lý do: tóc Ahri **không phải một khối cầu** mà là bốn vỏ 0,494..0,524 nhân
   dọc 1,09 cộng u to, bán kính hiệu dụng 0,607 — rộng hơn công thức ~15%. Từ đó: **cổng
   quyết định phải rasterise mesh thật** (depth map N×N trong `__api.silhouette`), công thức
   chỉ còn dùng để đoán *hướng* sửa.

## Khung máy ảnh của ô thumbnail

`heroScene` không được mượn camera của `robeScene` — robeScene cắt đầu là chủ ý vì nó chỉ
lo thân áo. Tính từ hai điểm cùng `z` của chúng (đỉnh cao nhất và đáy thấp nhất **sau khi
thân đã xoay 0.45**, vì phần gần ống kính chiếu lớn hơn): một điểm ở độ sâu `d + z` lọt
khi `|y − cy| ≤ (d + z)·tan(fov/2)`, fov 32. Dùng `fit.mjs frame --need y,z`. Ô `.hc-thumb`
là 40×40 và ảnh render 144×144 nên `object-fit: cover` không cắt thêm — chỉ có khung là cắt.
Đỉnh thật của nhân vật lấy bằng `__api.vertexFrame()` (quét **từng đỉnh**), không bằng `Box3`:
Box3 trục-ngang ghép x lớn nhất của một điểm với z gần nhất của điểm **khác**, nên nó từng báo
0,995 khi đỉnh thật là 0,846 — đủ để quyết định sai rằng đầu đã lọt khung.

## Tab xem trực tiếp (mở trước khi sửa bất kỳ số nào)

```
node .qoder/skills/temple-hero/scripts/preview.mjs <id> [--port 8899]
```

Phục `harness.html` của chính skill và map `/js` + `/three` thẳng vào repo, nên **không cần
`npm run dev`, không cần API :4000, không cần `TEMPLE_PASS`, không cần symlink**. Bản cũ dựng
`~/ai-projects/temple-preview/{js,three}` trỏ vào repo — tập lệnh nằm ngoài repo thì mất theo
thư mục tạm, và ảnh trên tab đó là ảnh của một `index.html` copy đã bắt đầu cũ từ phút thứ hai.
`Cache-Control: no-store` nên sửa `avatar.js` xong chỉ việc F5. Harness dựng đúng lighting/fog/
orbit của sảnh (đọc màu ở đây là đọc màu người chơi thấy) và mở thêm `window.__api` cho các
cổng dưới:

- `__api.setPose(true|false)` — ngồi thiền. **Đừng bấm nút theo index trong DOM**: thêm một nút
  là lệnh bấm lệch sang chế độ khác mà phép đo vẫn báo "thành công".
- `__api.setView(az, el, dist, ty)` — `az = 0` là SAU, `az = Math.PI` là MẶT (vì `sph()` trả
  `z = -r·cos(az)·sinθ`). Bốn preset `rear/q3/thumb/front` chép nguyên số ở đầu
  `scripts/silhouette.mjs`; đó cũng là preset thật của `hall.tsx`.
- `__api.silhouette({group, occ, grid, near})`, `__api.rootProbe({group})`,
  `__api.vertexFrame()` — xem §"Cổng bóng đè" và §"Khung máy ảnh".

## Vòng bằng chứng (rẻ → đắt)

```
node .qoder/skills/temple-hero/scripts/check-ids.mjs <id-moi>   # ~0s: id đã thông cả 4 chỗ chưa
node --check apps/web/vendor/temple/js/avatar.js   # MỖI LẦN CHỈ MỘT TỆP:
node --check apps/web/vendor/temple/js/thumbs.js   # node --check nhận đối số thứ hai rồi exit 0 mà không soi nó
node .qoder/skills/temple-hero/scripts/preview.mjs <id>   # ~1s: tab xem trực tiếp, giữ mở suốt ca làm
node .qoder/skills/temple-hero/scripts/silhouette.mjs <id> --occ head --view rear,q3,thumb --walk --sweep 6 --port 8901 --shots /tmp/g
                                                           # ~70s: cổng bóng đè + goc + bien + frame
node apps/web/scripts/rename-meta.mjs              # thêm món vào meta.json: chạy hai lần, lần hai phải in "0 mục"
node --test apps/api/src/temple/catalog.test.ts    # ~0s: cửa nào bán gì + thang giá đổi duyên còn thẳng hàng
cd apps/web && npm run typecheck          # + apps/api nếu đụng heroes.ts/bots.ts
node scripts/hero-thumb.mjs /tmp/out      # ~60s: ảnh 144px + thẻ thật trên nền tối
node scripts/hall-shot.mjs /tmp/hall.png  # ~90s: CHỈ khi user bấm
# hai script render đăng nhập bằng tài khoản dev mien phat: TEMPLE_PASS=.. mới chạy,
# khong co mac dinh vi mat khau khong duoc nam trong repo
```

- `check-ids.mjs` đọc `apps/...` bằng đường dẫn tương đối nên phải chạy từ **gốc repo**; bốn
  script còn lại tự suy đường dẫn từ chỗ nó nằm nên không kén cwd (`:4173` + API `:4000`,
  đổi bằng env `WEB`/`API`).
- `silhouette.mjs` **từ chối chạy nếu cổng đang bị chiếm** thay vì âm thầm đo server khác.
  Tab của user thường đang giữ 8899 → gate chạy `--port 8901`.
- `pageerror: 0` là sạch; bất kỳ chuỗi nào sau `pageerror:` là lỗi thật. 404 `/favicon.ico`
  trong console thì không: harness không có favicon, đó là nhiễu của trình duyệt.
- `avatar.js` không load được (thường là syntax error do một vòng lặp shell sửa tệp) biểu hiện
  thành `window.__api` undefined và một lỗi ở chỗ khác; script giờ in
  `harness khong load duoc avatar.js` rồi exit 2.
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

15. **Tin một cổng tính bằng công thức thay vì đo từ mesh.** Cổng giải tích của quạt đuôi Ahri
    (một khối cầu tóc R 0,485) báo `0 đỉnh đè lên tóc` cho đúng cấu hình mà cổng mesh báo
    138–192, và đã kịp **được commit**. Lý do thật: tóc là bốn vỏ 0,494..0,524 nhân dọc 1,09
    cộng u to → 0,607, rộng hơn công thức ~15%; hai ngọn cao nhất phủ lên viền tóc 0,64–0,72 m
    chiều sâu. Học: cái gì nằm TRÊN một vỏ cầu thì đừng quyết bằng bán kính tưởng tượng của nó —
    `silhouette.mjs` rasterise mesh thật.
16. **Chụp một frame của một prop động rồi coi là số đo.** Quạt đuôi nghiêng ±0,075 rad theo nhịp
    đi; cùng một cấu hình, frame may mắn báo 36, frame đỉnh chu kỳ báo 192. Học: `--walk --sweep 6`
    và lấy MAX, không lấy frame đầu.
17. **Ép cổng khoảng-cách-góc ở máy nghiêng.** Ở 3/4 chín ngọn chen trên một vòng tròn (he nhat
    2,7°) và `bi an` ~1400 vì thân che đuôi — đó là phối cảnh, không phải lỗi. Sửa theo số đó sẽ
    xoe đuôi vô ích. Học: gate góc chỉ ở `rear` (script tự tắt khi |az| > 20°).
18. **`part('tailFan')` trả cái chứa chứ không trả cái được chứa.** Prop nằm ở
    `vfxGroup.userData.tailFan`, nên quét cả `vfxGroup` cho ra `|x| 0,575 · 4 nhanh · khuat 0,787`
    — một bảng số hoàn toàn sai mà trông vẫn hợp lý. Học: `userData` là Object3D thì phải trả
    **giá trị** đó.
19. **Dùng `Box3` làm khung quyết định.** Nó báo 0,995 khi đỉnh thật 0,846 (trục-ngang, ghép
    điểm khác nhau). Học: `vertexFrame()` quét từng đỉnh.
20. **Để tool đo và bằng chứng trong `/tmp` / thư mục tạm ngoài repo.** `avatar.js` hiện vẫn còn
    ~30 comment dẫn `/tmp/ahri-*.mjs`, `/tmp/ll3d/...`, `/tmp/ahr-shot16` — không ai chạy lại được
    những lệnh đó nữa, nên mỗi con số ấy thành một khẳng định không kiểm chứng. Học: gate thì đã
    vào `scripts/`; **số nào còn dùng để quyết định thì do lại bằng gate trong repo** và ghi chính
    lệnh đó vào comment (xem nhánh `ahri_chibi`: `silhouette.mjs <hero> --occ head --walk --sweep 6`).
21. **Quét tham số bằng vòng lặp shell.** zsh không word-split `set -- $pair`, nên một lượt dò
    `turn` ghi xuống `avatar.js` dòng `[1.58, 2, , 0.00, 0.90]` → syntax error → `__api` mất →
    phép đo báo lỗi ở một chỗ rất xa nguyên nhân. Học: `echo … | while read a b`; và mọi vòng quét
    số phải kèm một lần `node --check` trên đúng tệp vừa bị ghi.
22. **Bấm nút UI theo index để đổi tư thế** (`buttons[4].click()`). Thêm một nút vào harness là
    lệnh đổi sang một chế độ khác, phép đo vẫn "chạy xong". Học: API gọi theo tên (`setPose`).

## Gate và git

- Mỗi lần user cho phép là **một phạm vi**: commit + push ≠ deploy. Prod web/Render phải xin riêng.
- Không bao giờ stage: `app/[lang]/page.tsx`, `app/[lang]/patches/**`, `app/[lang]/tables/**`,
  `components/nav.tsx`, `lib/data.ts`, `lib/messages.ts`, `lib/season-window.*`,
  `tests/*.spec.ts`, `tests/season.ts`, `docs/SET-ROTATION-PLAN.md`, `packages/shared/data/set.json`.
  Stage từng đường dẫn, không `git add -A`.
- Message theo `feat(temple): <mệnh đề lowercase>`; body tiếng Anh giải thích **vì sao**,
  ghi cả phép đo — các bài `130fd6b`, `8fc7641` là mẫu.

## Resources

- `harness.html` + `scripts/preview.mjs` — tab xem trực tiếp một avatar, không cần dev server.
  `preview.mjs` phục harness và map `/js` + `/three` vào repo; harness mở `window.__api`
  (`silhouette`, `rootProbe`, `vertexFrame`, `setPose`, `setView`, `part`, `surf`).
- `scripts/silhouette.mjs` — cổng bóng đè đo từ **mesh thật** trên chính scene đó: `DE LEN` /
  `bi an` / góc từng nhánh / biên bao / gốc-tụ-một-điểm. `--occ <nhánh>` để đổi vật che,
  `--walk --sweep N` cho prop động, `--shots DIR` để lại PNG. Exit 1 khi có đỉnh đè, gốc khuất,
  hoặc (ở máy sau) hai ngọn sát nhau dưới `--min-gap`.
- `scripts/check-ids.mjs` — chạy từ gốc repo: đối chiếu `HERO_LIST` / `HERO_IDS` / `HERO_SPRITE`
  / ROSTER và báo cho từng id mới. Cổng của bước (1); exit 1 khi client và server lệch nhau.
- `scripts/measure.mjs` — palette / median vùng / lưới toạ độ / crop phóng từ ảnh tham khảo.
  Toạ độ `--region` và `--crop` là **tỉ lệ 0..1**, không phải px.
- `scripts/fit.mjs` — point, cone, khung máy ảnh, `uv`/`px` cho canvas↔(phi,theta). Không cần
  three. Mặc định là `facePatch`; sơn `yoneMask` thì phải truyền đủ `--w --h --phiStart
  --phiLength --thetaStart --thetaLength` (xem header). **Chỉ dùng để đoán hướng**, không dùng
  để quyết định đè/nối — việc đó của `silhouette.mjs` (lỗi 15).
- `scripts/hero-thumb.mjs` — ảnh ô chọn nhân vật + thẻ trong DOM, qua hàng đợi thumbs.js thật.
- `scripts/hall-shot.mjs` — dựng sảnh, kéo camera (`--yaw --pitch --zoom`), chụp. Đắt.
