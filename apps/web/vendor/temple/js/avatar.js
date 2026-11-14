// Hệ thống Nhân vật 3D Chibi Anime (12 Nhân vật từ ảnh tham khảo characters-naruto-onpine.jpg)
// Tư thế hỗ trợ: đứng, đi, ngồi thiền, lạy Phật và tung tuyệt chiêu (fight / ultimate).
import * as THREE from 'three';
import { addGear, batCape, batEmblem } from './gear.js';
import { auraOf } from './ladder.js';

export const HERO_LIST = [
  {
    id: 'luffy_g5',
    name: 'Mây Bồng',
    title: 'Nhịp Trống Tự Do',
    skillColor: '#f8fafc',
    robeColor: '#ffffff',
    pantsColor: '#f1f5f9',
    sashColor: '#7e22ce',
    skin: '#f3c6a5',
    aura: '#e2e8f0',
  },
  {
    id: 'naruto_sage',
    name: 'Gai Vàng',
    title: 'Tiên Nhân Áo Cam',
    skillColor: '#facc15',
    robeColor: '#f59e0b',
    pantsColor: '#1e1b18',
    sashColor: '#fef08a',
    skin: '#f5cba7',
    aura: '#fde047',
  },
  {
    id: 'zoro',
    name: 'Ba Kiếm',
    title: 'Đao Khách Xanh Rêu',
    skillColor: '#22c55e',
    robeColor: '#14532d',
    pantsColor: '#111827',
    sashColor: '#dc2626',
    skin: '#e8b892',
    aura: '#4ade80',
  },
  {
    id: 'sasuke',
    name: 'Én Đêm',
    title: 'Kiếm Ánh Xanh',
    skillColor: '#38bdf8',
    robeColor: '#64748b',
    pantsColor: '#0f172a',
    sashColor: '#6b21a8',
    skin: '#f8dcc4',
    aura: '#60a5fa',
  },
  {
    id: 'sanji',
    name: 'Mái Che',
    title: 'Chủ Bếp Chân Hỏa',
    skillColor: '#f97316',
    robeColor: '#18181b',
    pantsColor: '#09090b',
    sashColor: '#eab308',
    skin: '#f5cba7',
    aura: '#fb923c',
  },
  {
    id: 'kakashi',
    name: 'Sương Bạc',
    title: 'Người Che Một Mắt',
    skillColor: '#38bdf8',
    robeColor: '#3f6212',
    pantsColor: '#1e293b',
    sashColor: '#334155',
    skin: '#f5d0b5',
    aura: '#7dd3fc',
  },
  {
    id: 'law',
    name: 'Mũ Đốm',
    title: 'Bác Sĩ Áo Vàng',
    skillColor: '#2dd4bf',
    robeColor: '#facc15',
    pantsColor: '#1d4ed8',
    sashColor: '#18181b',
    skin: '#ecc19c',
    aura: '#5eead4',
  },
  {
    id: 'itachi',
    name: 'Tóc Dài',
    title: 'Ảo Thuật Áo Đen',
    skillColor: '#ef4444',
    robeColor: '#18181b',
    pantsColor: '#0f172a',
    sashColor: '#dc2626',
    skin: '#f3d1b8',
    aura: '#f87171',
  },
  {
    id: 'ace',
    name: 'Mũ Cam',
    title: 'Hỏa Quyền Tuổi Trẻ',
    skillColor: '#ff5722',
    robeColor: '#d97706',
    pantsColor: '#18181b',
    sashColor: '#f97316',
    skin: '#e5b085',
    aura: '#fb923c',
  },
  {
    id: 'shanks',
    name: 'Tóc Đỏ',
    title: 'Bá Vương Gác Việc',
    skillColor: '#dc2626',
    robeColor: '#f8fafc',
    pantsColor: '#573b26',
    sashColor: '#b91c1c',
    skin: '#e6b48e',
    aura: '#f87171',
  },
  {
    id: 'minato',
    name: 'Chớp Vàng',
    title: 'Áo Trắng Nhanh Nhất',
    skillColor: '#fde047',
    robeColor: '#f8fafc',
    pantsColor: '#1e293b',
    sashColor: '#ef4444',
    skin: '#f8d8be',
    aura: '#facc15',
  },
  {
    id: 'kaido',
    name: 'Sừng Trâu',
    title: 'Sinh Vật Mạnh Nhất',
    skillColor: '#a855f7',
    robeColor: '#581c87',
    pantsColor: '#1e293b',
    sashColor: '#e2e8f0',
    skin: '#c68b65',
    aura: '#c084fc',
  },
  {
    // Hình thứ 13, lấy ý tưởng từ linh thú tí nị đội nạ trong TFT (ảnh yone-ti-ni.jpg).
    id: 'yone_chibi',
    name: 'Mặt Nạ Sừng',
    title: 'Song Kiếm Dẫn Hồn',
    skillColor: '#a2c1dd',
    robeColor: '#329fb7',
    pantsColor: '#282c41',
    sashColor: '#b1255e',
    skin: '#f3c6a5',
    aura: '#4dbdec',
  },
  {
    // Lấy ý tưởng từ linh thú tí nị Lee Sin (ảnh leesin-long-cuoc-ti-ni.jpg, 980x980).
    // Moi hex duoi day la median cua vung no mau trong anh do, khong phai doan:
    //   skillColor #349ee2 = giap tay phat sang (0.34,0.52,0.50,0.70 hue 190-215 sat 90 -> hue 203 sat 174)
    //   robeColor  #342b5e = ao cham            (0.40,0.62,0.60,0.72 hue 230-270 sat 30 -> hue 251 sat 51)
    //   pantsColor #34345d = quan                (0.58,0.62,0.76,0.74 hue 230-280 sat 30 -> hue 240 sat 41)
    //   sashColor  #aa855f = vien vang dong     (0.40,0.38,0.72,0.56 hue 25-55 sat 50 -> hue 30 sat 75)
    //   skin       #d5a49e = da (cằm + má)      (0.51,0.51,0.65,0.58 hue 5-40 sat 25 -> hue 7 sat 55)
    //   aura       #75a2ec = quang xanh linh luc (0.15,0.05,0.85,0.28 hue 200-230 sat 90 -> hue 217 sat 119)
    id: 'leesin_chibi',
    name: 'Võ Sư Mù',
    title: 'Nhất Quyền Dẫn Long',
    skillColor: '#349ee2',
    robeColor: '#342b5e',
    pantsColor: '#34345d',
    sashColor: '#aa855f',
    skin: '#d5a49e',
    aura: '#75a2ec',
  },
  {
    // Hình thứ 15: Batman. ĐÂY LÀ HÌNH ĐẦU TIÊN KHÔNG CÓ ẢNH ĐO. Hai URL ảnh tham khảo
    // tìm được trả về HTML (chặn client không phải trình duyệt) nên không có pixel nào để
    // median - thay vì đoán mã màu mới, toàn bộ palette VAY từ 14 hình đã ship ở trên, mỗi
    // hex dưới đây đã sống thật trong chánh điện:
    //   robeColor  #18181b = đen của Mái Che/Tóc Dài   (bộ vest + vải nạ)
    //   pantsColor #09090b = đen sâu nhất của Mái Che   (quần + áo choàng)
    //   sashColor  #facc15 = vàng của Gai Vàng          (đai lưng + phù hiệu, tự vào vì sashM)
    //   skin       #e8b892 = da của Ba Kiếm             (hàm + cằm lộ ra ngoài nạ)
    //   skillColor #e2e8f0 = bạc của Sừng Trâu         (chỉ quả cầu chiêu; hình này
    //     không có nét bạc nào trên người - tròng mắt sơn là #f8fafc, một hex khác)
    //   aura       #60a5fa = lam của Én Đêm            (quầng đêm)
    // Nạ = MỘT phiến sơn quấn 2π (WRAP_FACE_IDS) như hai hình 13-14: nửa trên đầu là vải,
    // lỗ mặt khoét bằng destination-out nên da thật hiện ra đúng chỗ mũi-miệng-cằm.
    id: 'batman_chibi',
    name: 'Hiệp Sĩ Dơi',
    title: 'Dực Ảnh Nhập Đêm',
    costumeLocked: true,
    skillColor: '#e2e8f0',
    robeColor: '#18181b',
    pantsColor: '#09090b',
    sashColor: '#facc15',
    skin: '#e8b892',
    aura: '#60a5fa',
  },
  {
    // Hình thứ 16: Zed tí nị (ảnh zed-ti-ni.jpg, 980x980). Mỗi hex dưới đây là median của
    // một vùng đo thẳng trong ảnh (script quét dải hue), không phải màu đoán:
    //   robeColor  #6b6a6c = giáp xám (BỎ XANH)        (0.33,0.50,0.67,0.88, sat<=30 v>=90 —
    //     median 901 px sat 18 v 119. Ảnh Zed là XÁM + ĐỎ pha nhau: bản #4f5893 hue 232 là
    //     màu NỀN lavender-đen sau lưng tướng, không phải màu áo, nên bỏ hẳn xanh tím.
    //     Hex đo #666577 vẫn còn hue 250 sat 12 (ambient tím ngấm vào cả bóng lẫn sáng);
    //     giữ nguyên v 107 và ép sat về 1 -> #6b6a6c, đúng "áo pha đỏ-xám, bỏ xanh".)
    //   pantsColor #4b4a4d = ống chân xám tối          (0.33,0.78,0.67,0.98 sat<=30 — median
    //     2.159 px sat 20 v 87, tối hơn áo một bậc đúng vì chân ở dưới vạt áo; cùng phép ép
    //     sat->1 ở v 76 từ hex đo #434557)
    //   sashColor  #721a26 = vải đỏ + đai              (0.30,0.40,0.70,0.62 dải hue 340-360
    //     sat>=60 — median 724 px; dải hue 0-18 chỉ 256 px và lệch sang cam #861a14)
    //   skin       #2e2d30 = giáp tay; hình này KHÔNG lộ da, nạ sắt phủ kín đầu, nên skin
    //     chỉ còn là màu khối đầu dưới phiến sơn + hai bàn tay (median xám tối toàn ảnh:
    //     sat 19 v 57, 1.616 px; hex đo #2a2639 hue 250 nên cũng ép sat về 2 ở v 48)
    //   skillColor #cd222d = đỏ mắt phát sáng         (dải hue 345-12, sat>=130, v>=120, 2.995 px)
    //   aura       #4b376b = tím của bóng             (bucket palette sat 94 quanh hue 285,
    //     đúng sắc vùng bóng đen ở góc trên trái ảnh)
    // Hoá phục là NẠ + GIÁP nên costumeLocked như Hiệp Sĩ Dơi: ô chọn nhân vật truyền vào
    // một tấm áo trung hoà '#8f6a3e', không khoá thì hình này ra màu áo đó chứ không ra sắt.
    // Hai ảnh sculpt mới (images 7/8) là ZBrush ĐƠN SẮC xám nên không đo được màu nào từ
    // chúng — chúng chỉ trả lời hình khối: mũ sắt + vải đỏ phủ xuống, lưỡi dọc cánh tay.
    id: 'zed_chibi',
    name: 'Người Đeo Bóng',
    title: 'Một Kiếm Ngàn Bóng',
    costumeLocked: true,
    skillColor: '#cd222d',
    robeColor: '#6b6a6c',
    pantsColor: '#4b4a4d',
    sashColor: '#721a26',
    skin: '#2e2d30',
    aura: '#4b376b',
    // faceMetal: phiến sơn KHÔNG phải vải. Sảnh có scene.environment (world.js:77,
    // RoomEnvironment PMREM intensity 0,35; thumbnail 0,55 ở thumbs.js:140) nên metalness
    // có phản xạ để nhân — 0,55/0,26 là bạc đánh bóng; hai hình kia giữ mặc định 0/0,45.
    faceMetal: { metalness: 0.45, roughness: 0.24 },
    // armPose 'down': hai tay BUÔNG DỌC THÂN khi đứng, không chắp trước ngực như mọi hình
    // khác, vì hai lưỡi kiếm đi dọc cẳng tay — chắp thì hai mũi chĩa vào nhau trước bụng.
    // Khi ngồi vào bệ và cầu may (k = meditate -> 1) tay vẫn về lòng như mọi người.
    armPose: 'down',
  },
  {
    // Hình thứ 17: Irelia tí nị — linh thú là BẢN CHIBI CỦA MỘT TƯỚNG LOL (theo đúng
    // phạm vi user chốt: chỉ lấy dòng Chibi, bỏ các linh thú thú). Ảnh đo là splash gốc
    // Riot "Chibi Irelia Base Tier 1.png" 512px, lấy từ Fandom bằng Chrome thật
    // (/tmp/ll-fetch3.mjs) vì Cloudflare chặn curl — file /tmp/llref/Chibi_Irelia.png.
    // Mỗi hex là median của một vùng đo (tỷ lệ 0..1 của ảnh), bằng measure.mjs và
    // /tmp/irelia-low.mjs. Splash này NGỦ TRONG AMBIENT TÍM-HỒNG nên kim loại nhiễm hue
    // 250: với thép và da, lấy median của 20% pixel ÍT NO MÀU nhất để tách màu vật lý
    // khỏi màu ánh sáng (quartile kia là màu ảnh sáng, không phải màu vật liệu).
    //   robeColor  #a14977 = áo bodice hồng đậm  (0.44,0.56,0.54,0.62 — median 540 px sat 88;
    //     20% no nhất #cd4977 sat 132. Đây là VẢI ÁO, không phải khăn.)
    //   pantsColor #64617f = quần tím-xám        (0.55,0.70,0.66,0.80 — median #706598 sat 51,
    //     quartile ít màu #64617f sat 30; giữ quartile ít màu vì vùng này có cả bóng tím.)
    //   sashColor  #e48bcb = khăn lụa hồng       (0.62,0.26,0.78,0.34 — median 1.152 px sat 89;
    //     20% no nhất #f06baf sat 133 là đoạn khăn được nắng xuyên qua.)
    //   skin       #f6d8d5 = da mặt              (0.35,0.44,0.46,0.49 — quartile ít màu sat 33,
    //     median #e7bebf. Da Irelia HỒNG NHẠT, không cam như 12 hình anime phía trên; ép về
    //     cam là quên phép đo.)
    //   skillColor #7ec3ff = toả xanh dưới lưỡi  (0.44,0.80,0.56,0.88 — điểm sáng nhất #7ec3ff,
    //     20% no nhất #5f71bc sat 93. Vùng 0.10,0.63,0.20,0.68 cùng phép đo ra #626eaf.)
    //   aura       #626eaf = tím-xanh của kiếm   (0.10,0.63,0.20,0.68 — 20% no nhất sat 77,
    //     đúng sắc viền năng lượng trên sáu lưỡi, không phải màu nền trời.)
    // Ba màu KHÔNG có trong HERO_LIST vì hình này dùng trực tiếp trong nhánh vẽ:
    //   tóc   #2e1d5f (median 0.33,0.22,0.45,0.30 sat 66) — tối #221549, sáng #524e98,
    //         rim #dac8ff (điểm sáng nhất cùng vùng)
    //   thép  #837499 (median 0.20,0.62,0.34,0.68 sat 37) — tối #575454
    //         (0.64,0.63,0.86,0.78 quartile ít màu sat 3), sáng #c8bbe5 (điểm sáng nhất)
    //   ngọc  #c0b2d4 (0.395,0.375,0.425,0.40 median 63 px sat 34) — viên giữa vòng trán
    //   mắt   viền tím #644db1 (0.42,0.42,0.50,0.47 20% no nhất sat 100) + toả xanh #98e4ff
    //         (0.48,0.72,0.58,0.84 điểm sáng nhất) => hai lớp màu, không phải một.
    // KHÔNG CÓ VÀNG: quét hue 35..70 sat>=50 trên toàn ảnh chỉ ra #ab9c6b, và bốn vùng trên
    // người tướng (tóc-ngắn 0.28,0.20,0.40,0.34 / áo 0.40,0.52,0.62,0.70 / đai-lưng
    // 0.38,0.56,0.58,0.66 / bàn-chan 0.42,0.66,0.58,0.78) trả 0 pixel — #ab9c6b là CHÙA và
    // CÁNH SAKURA ở nền. Vậy nên hình này không được gắn chi tiết vàng như Zed; trang sức
    // của Irelia là THÉP + NGỌC TÍM.
    // Hoá phục là GIÁP + VUÔNG NGỌC nên costumeLocked như hai hình 15-16: ô chọn nhân vật
    // truyền vào tấm áo trung hoà '#8f6a3e', không khoá thì thân ra màu nâu áo đó.
    id: 'irelia_chibi',
    name: 'Kiếm Cài Tóc',
    title: 'Kiếm Vũ Thành Vòng',
    costumeLocked: true,
    skillColor: '#7ec3ff',
    robeColor: '#a14977',
    pantsColor: '#64617f',
    sashColor: '#e48bcb',
    skin: '#f6d8d5',
    aura: '#626eaf',
  },
  {
    // Hình thứ 18: Ahri tí nị — vẫn trong phạm vi user chốt: bản chibi của một tướng LOL.
    // Ảnh đo là splash gốc Riot "Chibi Ahri Base Tier 1" (/tmp/llref/Chibi_Ahri.png, 720px).
    // Toạ độ dưới đây là tỷ lệ 0..1 của CHÍNH ảnh đó (không phải ảnh crop), đo bằng
    // /tmp/ahri-meas.mjs + /tmp/ahri-meas2.mjs: median của các pixel lọt dải hue, kèm số px
    // và quintile no màu nhất để biết vùng nào lẫn nền.
    //   robeColor  #8e2b40 = kimono đỏ      (0.40,0.45,0.60,0.62 hue 330-15 sat>=50 — median
    //     5.935 px sat 99 hue 347; 20% no nhất #cf3853 là đoạn vai được nắng rọi. Đây là màu
    //     VẢI THẬT của áo, nền phong hồng nằm ngoài vùng đo nên không nhiễm hue 320.)
    //   pantsColor #ae495b = tất đỏ hồng     (0.42,0.59,0.48,0.65 hue 330-15 sat>=40 — median
    //     1.641 px sat 101; sáng hơn áo một bậc đúng vì ống tất quay về phía đèn. Vùng dưới
    //     0.44,0.68,0.50,0.74 trả #954a41 hue 6 vì lẫn nền đá, không dùng.)
    //   sashColor  #694d92 = đai obi tím    (0.46,0.555,0.53,0.585 hue 250-300 sat>=30 — median
    //     497 px sat 69; dải rộng 0.42,0.54,0.58,0.62 ra #8173a0 sat 45 vì ăn cả dây buộc trắng.)
    //   skin       #f2cebc = da má          (0.44,0.355,0.50,0.41 không lọc hue — median 1.596 px
    //     sat 54 hue 20. Trán KHÔNG đo được: 0.40,0.245,0.47,0.29 trả #3c3250 vì tóc mái rũ
    //     ngang trán che kín, đó là tóc chứ không phải da.)
    //   skillColor #72c9f9 = quả cầu hồ ly  (0.13,0.30,0.26,0.43 hue 175-215 sat>=90 — median
    //     5.163 px sat 135 hue 201; 20% no nhất #4ba8f9 sat 174 là lõi cầu.)
    //   aura       #4a4f7f = chàm của tóc   (0.30,0.12,0.52,0.28 hue 220-265 sat>=20 — median
    //     13.140 px sat 53 hue 234, màu chiếm nhiều nhất trên tướng nên làm quầng.)
    // Các màu KHÔNG có trong HERO_LIST, dùng thẳng trong nhánh vẽ:
    //   tóc-sáng #444b81 (0.36,0.14,0.46,0.20 median 2.940 px) · tóc-chìm #373b69
    //   (0.31,0.20,0.42,0.30 median 5.326 px, quartile ít màu #231c37) · mái-trước-mắt #2f2b50
    //   (0.36,0.26,0.46,0.34 median 2.493 px) · sam-cuốn #28213d (0.595,0.32,0.635,0.48 median
    //   2.756 px — lọn sam tết rũ xuống vai phải, TỐI hơn mái vì nó quay ra xa đèn)
    //   trong-tai #e0e0ee (0.581,0.095,0.618,0.161 quartile ÍT no màu nhất; median vùng này là
    //   #81789a sat 34 vì nó ăn cả viền sẫm — lấy quartile ít màu mới là ngà thật)
    //   đuôi-trang #a79ab5 (0.62,0.45,0.80,0.62 median 14.994 px sat 27 hue 269 — đuôi KHÔNG
    //   trắng tinh: nó là lavender bóng, cùng hue với nền trời nên phải đo chứ không đoán)
    //   mat-vang #ebb14e (0.50,0.28,0.56,0.35 hue 25-62 sat>=90 — median 425 px sat 157 hue 38;
    //   20% no #f3bc4a) · long-den #3a283a (0.49,0.27,0.56,0.30 median 1.029 px)
    //   vang-vien #ccb085 (0.50,0.515,0.545,0.545 hue 20-60 sat>=60 — CHỈ 72 px: viền vàng trên
    //   kimono mỏng thật, nên hình này không được vẽ dải vàng bản to như Zed.)
    // PHAN QUYET 2026-11-13: "Ao la trang phuc hanbok, tong chinh la trang va hong".
    // Anh goc mac kimono DO-TIM, nen khong the median ca bo ao theo phan quyet duoc;
    // lay mau TU PHAN DA LA TRANG/HONG cua chinh splash do (cung ky thuat median +
    // dai do sang, /tmp/ahri-hanbok.mjs + /tmp/ahri-hanbok2.mjs):
    //   robeColor  #e9e3ea = VOI TRANG. Median 2.501 px sang nhat (L 195..255, sat 7,
    //     hue 291) cua khoi vai trang bao than duoi 0.30,0.56,0.44,0.72. Dai do sang
    //     BUOC PHAI co: median ca vung tron la #b09fb5 (sat 22) vi nep vai va bong chim
    //     keo di, va #b09fb5 tren nen go duong ra mau xam tim, khong phai trang.
    //     Dai L 165..195 cua cung vung do ra #b9a9bc = mau cua CHAN bong vai, dung cho
    //     nhat hong chu khong dung cho ao.
    //   chimaColor #d991c0 = HONG, MOT MAU DUY NHAT cho vay + dai boc + chan.
    //     MUC TIEU do tu anh goc: median 213 px sang nhat (L 150..255, hue 320..360,
    //     sat >=40) cua vung eo 0.34,0.46,0.66,0.72 = #dc91a3 (/tmp/ahri-pink.mjs).
    //     Hai dai duoi cua cung vung do, #cc4966 (L 110..150, 726 px) va #8b2640
    //     (L 60..110, 1.455 px), la CHINH MAU HONG DO bi bong che, khong phai mau vai.
    //     vong 24 lay #cf4e6b/#b5526a (tuc dai trung) va render ra #b63d49 L 105 o
    //     nguc - do la DO, khong phai hong (/tmp/ahr-hist.mjs do truc tren anh chieu
    //     cua model, khong do lai albedo). Den tiep buoc: lay #dc91a3 lam albedo thi
    //     anh chieu ra #d08c88, hue 0, B 136 < G 140 = SALMON, vi den san chua MAU
    //     XANH cua hong di nhieu nhat (ty le R/G/B mat duoc tu hai phep do
    //     #cf4e6b->#b63d49 va #dc91a3->#d08c88: 0,88/0,78/0,68 va 0,95/0,97/0,83).
    //     Albedo vi the phai DU XANH hon muc tieu: #d991c0 (B 192 so voi 163 cua
    //     #dc91a3) de sau khi chieu cho ra hong that, B > G. Gate: do lai render,
    //     vung nguc phai hue 330..360 VA B > G va L >= 140.
    //     Ba truong cung mot gia tri vi phan quyet noi "hong TONG CHINH", khong phai
    //     "hong dam o eo + hong nhat o no"; va theo mot-mau-nhan, hai sac hong tren
    //     cung mot tam ao 144 px chi ra hai mau do.
    // Vi sao KHÓA hoá phục (costumeLocked) — dao nguoc so voi ly do da ghi o vong 18:
    // khi bo đồ là MỘT TẤM HANBOK có thiết kế riêng (áo ngắn trắng + váy hồng + dải
    // buộc) thì nó là HOÁ PHỤC như giáp Irelia, không phải áo khoác; mà ô chọn nhân
    // vật trong thumbs.js:93 trung hoà mọi hình chưa khoá bằng robe #8f6a3e NÂU, nên
    // không khoá thì người chơi thấy một cô cáo mặc áo nâu trong chính cái ô chọn cô
    // ta. Cái giá phải trả: mua áo chùa không mặc lên Ahri được nữa — đúng như ba hình
    // 15/16/17 đã chấp nhận.
    id: 'ahri_chibi',
    name: 'Cáo Đuôi Trắng',
    title: 'Chín Đuôi Quấn Sương',
    skillColor: '#72c9f9',
    costumeLocked: true,
    hanbokRobe: true,
    robeColor: '#e9e3ea',
    chimaColor: '#d991c0',
    pantsColor: '#d991c0',
    sashColor: '#d991c0',
    skin: '#f2cebc',
    aura: '#4a4f7f',
  },
];

export const HERO_MAP = Object.fromEntries(HERO_LIST.map((h) => [h.id, h]));

// Bộ Sưu Tập Đồ Trang Phục 3D (Tham khảo Pháp Phục Sansa Temple Hàn Quốc ?room=maru & Đồ Lễ Hội Sân Chùa)
export const OUTFIT_LIST = [
  {
    id: 'default',
    name: 'Nguyên Bản Anime',
    swatch: '#f59e0b',
  },
  {
    id: 'sansa_sage',
    name: 'Áo Choàng Lá Thông',
    swatch: '#bdc5ad',
    robeColor: '#bdc5ad',
    pantsColor: '#8f9b8c',
    sashColor: '#e8dfcc',
    sansaRobe: true,
    wideSleeves: true,
    malaColor: '#78350f',
  },
  {
    id: 'sansa_lotus',
    name: 'Áo Choàng Hồng Phấn',
    swatch: '#e5b0aa',
    robeColor: '#e5b0aa',
    pantsColor: '#cbbdab',
    sashColor: '#fff1e6',
    sansaRobe: true,
    wideSleeves: true,
    malaColor: '#9d3e37',
  },
  {
    id: 'sansa_celadon',
    name: 'Áo Choàng Lam Ngọc',
    swatch: '#b9c8c2',
    robeColor: '#b9c8c2',
    pantsColor: '#7c8179',
    sashColor: '#e8f3f0',
    sansaRobe: true,
    wideSleeves: true,
    malaColor: '#3e5449',
  },
  {
    id: 'sansa_kasa',
    name: 'Áo Choàng Đỏ Vàng',
    swatch: '#b94048',
    robeColor: '#dfc890',
    pantsColor: '#a69b84',
    sashColor: '#b94048',
    sansaRobe: true,
    wideSleeves: true,
    kasaColor: '#b94048',
    malaColor: '#b45309',
  },
  {
    id: 'hanbok_maru',
    name: 'Áo Hai Tầng Lam Khói',
    swatch: '#adbcdb',
    robeColor: '#adbcdb',
    pantsColor: '#343a50',
    sashColor: '#9d3e37',
    sansaRobe: true,
    wideSleeves: true,
    hanbokRibbon: '#9d3e37',
  },
];

export const OUTFIT_MAP = Object.fromEntries(OUTFIT_LIST.map((o) => [o.id, o]));

const ROBE_PROFILE = [[0, 0], [0.36, 0], [0.42, 0.08], [0.40, 0.25], [0.35, 0.45], [0.26, 0.62], [0.14, 0.72], [0, 0.74]].map(([x, y]) => new THREE.Vector2(x, y));
const SKIRT_PROFILE = [[0.41, 0.05], [0.39, 0.16], [0.37, 0.3], [0.35, 0.42], [0.34, 0.5]].map(([x, y]) => new THREE.Vector2(x, y));

const G = {
  // Tỷ lệ Chibi 2.5 đầu chuẩn theo ảnh tham khảo characters-naruto-onpine.jpg: đầu to biểu cảm, thân gọn khỏe
  head: new THREE.SphereGeometry(0.46, 36, 28),
  facePatch: new THREE.SphereGeometry(0.463, 32, 24, -Math.PI * 0.82, Math.PI * 0.64, Math.PI * 0.24, Math.PI * 0.54),
  // Phiến nạ Yone: MỘT tấm sơn liền QUẤN KÍN 360° quanh đầu, mang cả tóc, nạ lẫn da trần,
  // bán kính đúng bằng facePatch nên không có mép nào đứng cạnh mép nào. Ba bản trước đều
  // bị chê lộ rãnh nối vì mỗi bản để hai KHỐI gặp nhau trên mặt tiền: vành + má đính ở
  // 0.484/0.487 (lồi hơn phiến sơn 0,024 -> gờ sáng), mũ tóc 0.494 lệch sau 0,14 (chôn
  // kín trán), rồi vỏ tóc 0.470 cung sau - mép trước của nó ở phương 79,2° nằm TRONG phiến
  // sơn (tới 84,6°) và to hơn phiến 0,007 nên vẫn cắt một đường cong xuống tận gáy. Giờ
  // gáy và hai bên thái dương là SƠN trên cùng tấm: đường chân tóc chỉ còn là nét biên
  // TRONG ẢNH. Rộng 2π, cao theta 0..0,805π = đỉnh đầu xuống dưới hàm.
  wrapMask: new THREE.SphereGeometry(0.463, 72, 40, -Math.PI * 1.5, Math.PI * 2, 0, Math.PI * 0.805),
  torso: new THREE.LatheGeometry(ROBE_PROFILE, 32),
  arm: new THREE.CapsuleGeometry(0.105, 0.28, 6, 12),
  hand: new THREE.SphereGeometry(0.095, 14, 12),
  lap: new THREE.SphereGeometry(1, 24, 16),
  leg: new THREE.CylinderGeometry(0.105, 0.095, 0.38, 12),
  ear: new THREE.SphereGeometry(0.085, 10, 8),
  eye: new THREE.SphereGeometry(0.02, 8, 6),
  skirt: new THREE.LatheGeometry(SKIRT_PROFILE, 32),
  foot: new THREE.SphereGeometry(0.085, 12, 8),
  spike: new THREE.ConeGeometry(0.15, 0.42, 7),
  cloudPuff: new THREE.SphereGeometry(0.16, 14, 12),
  orb: new THREE.SphereGeometry(0.075, 14, 12),
};

const mats = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...opts }));
  return mats.get(key);
}

export function beadMaterial(b) {
  const base = new THREE.Color(b?.c1 || '#d97706');
  return new THREE.MeshPhysicalMaterial({ color: base, roughness: 0.25, metalness: b?.metal || 0.2, clearcoat: 1 });
}

const FACE_TEX_CACHE = new Map();
// Những hình mà MỘT phiến sơn phủ trọn vòng đầu (nạ kín như yone_chibi, tóc bạc phủ kín
// mặt như leesin_chibi, vải nạ phủ nửa trên đầu như batman_chibi) phải vẽ trên tấm quấn
// 2π. Hình khác chỉ cần facePatch ±57,6°.
// Danh sách này là nguồn duy nhất: makeHeroFaceTex chọn kích thước canvas theo nó và
// buildHeroAvatar chọn geometry (G.wrapMask hay G.facePatch) theo nó.
const WRAP_FACE_IDS = new Set(['yone_chibi', 'leesin_chibi', 'batman_chibi', 'zed_chibi']);
function makeHeroFaceTex(heroId) {
  if (FACE_TEX_CACHE.has(heroId)) return FACE_TEX_CACHE.get(heroId);
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  // Các hình trong WRAP_FACE_IDS vẽ trên tấm to hơn vì phiến sơn của chúng quấn kín
  // đầu và cao tới đỉnh đầu. Giữ nguyên độ lớn góc của mỗi px như bản 512
  // (0,225°/px ngang, 0,19°/px dọc) thì tấm
  // 2π x 0,805π là 1600 x 763, và gốc (0,0) của canvas cũ rơi ở (544, 227,6) của canvas
  // mới - nên chỉ cần translate một lần, mọi tọa độ vẽ giữ nguyên như đã canh chỉnh.
  // Kinh tuyến trước (phương 0°) ở đúng giữa canvas x=800, tức local x=256 như cũ; hai
  // mép canvas x=0 và x=1600 gặp nhau ở sau gáy, cả hai đều là tóc nên không để lại
  // khe nào tại đường nối ảnh.
  const isWrap = WRAP_FACE_IDS.has(heroId);
  const CW = isWrap ? 1600 : 512, CH = isWrap ? 763 : 512;
  c.width = CW; c.height = CH;
  const g = c.getContext('2d');
  const hero = HERO_MAP[heroId] || HERO_LIST[0];

  // Nền da mặt mịn màng
  g.clearRect(0, 0, CW, CH);
  if (isWrap) g.translate(544, 227.6);

  // Vẽ lông mày, mắt, sẹo, râu và biểu cảm từng nhân vật đúng theo ảnh characters-naruto-onpine.jpg
  const drawAnimeEye = (cx, cy, irisColor, type = 'normal', isLeft = true) => {
    g.save();
    g.translate(cx, cy);
    if (type === 'wink') {
      // Mắt nhắm có vết sẹo dọc (Ba Kiếm, mắt trái)
      g.strokeStyle = '#3b2314'; g.lineWidth = 8; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-36, 4); g.quadraticCurveTo(0, 14, 36, 2); g.stroke();
      g.strokeStyle = '#7c2d12'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(4, -54); g.lineTo(-6, 52); g.stroke();
      g.restore();
      return;
    }
    // Khung tròng trắng mắt anime lớn
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(0, 0, 42, 34, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 7; g.strokeStyle = '#1e140e';
    g.stroke();

    // Tròng mắt theo hệ (mây trắng, mắt đỏ, mắt vòng, tiên nhân, chuẩn)
    if (type === 'rinnegan') {
      g.fillStyle = '#a855f7';
      g.beginPath(); g.ellipse(0, 0, 38, 30, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#3b0764'; g.lineWidth = 3;
      for (const r of [10, 20, 30]) { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = '#1e1b4b'; g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill();
    } else if (type === 'sharingan') {
      g.fillStyle = '#dc2626';
      g.beginPath(); g.arc(0, 0, 27, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#450a0a'; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#09090b'; g.beginPath(); g.arc(0, 0, 7, 0, Math.PI * 2); g.fill();
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        g.beginPath(); g.arc(Math.cos(a) * 16, Math.sin(a) * 16, 4.5, 0, Math.PI * 2); g.fill();
      }
    } else if (type === 'nika') {
      g.fillStyle = '#ef4444';
      g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#7f1d1d'; g.lineWidth = 4;
      g.beginPath(); g.arc(0, 0, 17, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#111827'; g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
    } else if (type === 'sage') {
      // Mắt Lục Đạo vàng cam chữ thập
      g.fillStyle = '#f59e0b';
      g.beginPath(); g.arc(0, 0, 27, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1c1917';
      g.fillRect(-3, -22, 6, 44);
      g.fillRect(-18, -4, 36, 8);
    } else {
      const gr = g.createRadialGradient(0, -6, 4, 0, 0, 28);
      gr.addColorStop(0, irisColor);
      gr.addColorStop(1, '#111827');
      g.fillStyle = gr;
      g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#09090b';
      g.beginPath(); g.arc(0, 0, 11, 0, Math.PI * 2); g.fill();
    }

    // Đốm sáng mắt anime long lanh
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(-10, -10, 8, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(9, 8, 4, 0, Math.PI * 2); g.fill();

    // Mi mắt trên dày sắc nét
    g.strokeStyle = '#111827'; g.lineWidth = 10; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-44, -8); g.quadraticCurveTo(0, -38, 44, -8); g.stroke();
    g.restore();
  };

  // Lông mày
  const drawBrow = (cx, cy, color = '#1e1b18', angle = 0.12, curly = false) => {
    g.save();
    g.translate(cx, cy);
    g.rotate(angle);
    g.strokeStyle = color; g.lineWidth = 10; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-38, 0);
    g.quadraticCurveTo(0, -10, 38, 0);
    if (curly) g.arc(28, -12, 12, Math.PI * 0.5, Math.PI * 2.3);
    g.stroke();
    g.restore();
  };

  const L_X = 166, R_X = 346, EYE_Y = 235;

  if (hero.id === 'luffy_g5') {
    drawAnimeEye(L_X, EYE_Y, '#ef4444', 'nika', true);
    drawAnimeEye(R_X, EYE_Y, '#ef4444', 'nika', false);
    drawBrow(L_X, 178, '#f8fafc', 0.05, true);
    drawBrow(R_X, 178, '#f8fafc', -0.05, true);
    // Sẹo dưới mắt trái của Mây Bồng
    g.strokeStyle = '#7c2d12'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(L_X - 24, EYE_Y + 46); g.quadraticCurveTo(L_X, EYE_Y + 54, L_X + 22, EYE_Y + 46); g.stroke();
    g.beginPath(); g.moveTo(L_X - 10, EYE_Y + 42); g.lineTo(L_X - 12, EYE_Y + 56); g.moveTo(L_X + 8, EYE_Y + 42); g.lineTo(L_X + 10, EYE_Y + 56); g.stroke();
    // Nụ cười rộng rạng rỡ của Mây Bồng
    g.fillStyle = '#ffffff'; g.strokeStyle = '#1e1b18'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(175, 325); g.quadraticCurveTo(256, 340, 337, 325); g.quadraticCurveTo(256, 405, 175, 325); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(190, 352); g.quadraticCurveTo(256, 362, 322, 352); g.stroke();
  } else if (hero.id === 'naruto_sage') {
    // Quầng mắt cam Tiên Nhân
    g.fillStyle = 'rgba(234,88,12,0.45)';
    g.beginPath(); g.ellipse(L_X, EYE_Y, 50, 38, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(R_X, EYE_Y, 50, 38, 0, 0, Math.PI * 2); g.fill();
    drawAnimeEye(L_X, EYE_Y, '#f59e0b', 'sage');
    drawAnimeEye(R_X, EYE_Y, '#f59e0b', 'sage');
    drawBrow(L_X, 182, '#d97706', 0.16);
    drawBrow(R_X, 182, '#d97706', -0.16);
    // 6 vết râu mèo Cửu Vĩ
    g.strokeStyle = '#451a03'; g.lineWidth = 5; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const y = 290 + i * 20;
      g.beginPath(); g.moveTo(88, y - 4); g.lineTo(148, y); g.stroke();
      g.beginPath(); g.moveTo(364, y); g.lineTo(424, y - 4); g.stroke();
    }
    // Miệng mỉm cười tự tin
    g.strokeStyle = '#451a03'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(212, 345); g.quadraticCurveTo(256, 368, 304, 342); g.stroke();
  } else if (hero.id === 'zoro') {
    drawAnimeEye(L_X, EYE_Y, '#1e293b', 'normal');
    drawAnimeEye(R_X, EYE_Y, '#1e293b', 'wink'); // Mắt trái nhắm có sẹo
    drawBrow(L_X, 180, '#15803d', 0.22);
    drawBrow(R_X, 180, '#15803d', -0.22);
    g.strokeStyle = '#3b2314'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(215, 348); g.quadraticCurveTo(256, 342, 302, 334); g.stroke();
  } else if (hero.id === 'sasuke') {
    drawAnimeEye(L_X, EYE_Y, '#dc2626', 'sharingan');
    drawAnimeEye(R_X, EYE_Y, '#a855f7', 'rinnegan');
    drawBrow(L_X, 180, '#0f172a', 0.22);
    drawBrow(R_X, 180, '#0f172a', -0.22);
    g.strokeStyle = '#3b2314'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(222, 350); g.lineTo(290, 346); g.stroke();
  } else if (hero.id === 'sanji') {
    drawAnimeEye(L_X, EYE_Y, '#1d4ed8', 'normal');
    drawAnimeEye(R_X, EYE_Y, '#1d4ed8', 'normal');
    drawBrow(L_X, 178, '#ca8a04', 0.1, true);
    drawBrow(R_X, 178, '#ca8a04', -0.1, true);
    // Râu dê Mái Che & nụ cười lịch lãm
    g.strokeStyle = '#451a03'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(210, 340); g.quadraticCurveTo(256, 362, 304, 336); g.stroke();
    g.fillStyle = '#ca8a04';
    g.beginPath(); g.moveTo(242, 382); g.lineTo(270, 382); g.lineTo(256, 412); g.closePath(); g.fill();
  } else if (hero.id === 'kakashi') {
    drawAnimeEye(L_X, EYE_Y, '#1e293b', 'normal');
    drawAnimeEye(R_X, EYE_Y, '#dc2626', 'wink');
    drawBrow(L_X, 182, '#cbd5e1', 0.05);
    // Khẩu trang ninja che nửa dưới khuôn mặt
    g.fillStyle = '#1e293b';
    g.beginPath(); g.moveTo(60, 275); g.quadraticCurveTo(256, 250, 452, 275); g.lineTo(452, 490); g.lineTo(60, 490); g.closePath(); g.fill();
    g.strokeStyle = '#334155'; g.lineWidth = 5; g.stroke();
  } else if (hero.id === 'law') {
    // Quầng mắt đặc trưng của Bác sĩ Law
    g.fillStyle = 'rgba(30,41,59,0.28)';
    g.beginPath(); g.ellipse(L_X, EYE_Y + 6, 46, 36, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(R_X, EYE_Y + 6, 46, 36, 0, 0, Math.PI * 2); g.fill();
    drawAnimeEye(L_X, EYE_Y, '#eab308', 'normal');
    drawAnimeEye(R_X, EYE_Y, '#eab308', 'normal');
    drawBrow(L_X, 182, '#0f172a', 0.16);
    drawBrow(R_X, 182, '#0f172a', -0.16);
    g.strokeStyle = '#1e1b18'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(216, 344); g.quadraticCurveTo(256, 354, 300, 336); g.stroke();
    // Râu cằm Law
    g.fillStyle = '#0f172a';
    g.fillRect(236, 385, 40, 18);
  } else if (hero.id === 'itachi') {
    drawAnimeEye(L_X, EYE_Y, '#dc2626', 'sharingan');
    drawAnimeEye(R_X, EYE_Y, '#dc2626', 'sharingan');
    drawBrow(L_X, 182, '#0f172a', 0.14);
    drawBrow(R_X, 182, '#0f172a', -0.14);
    // Hai đường nếp đặc trưng dưới mắt Tóc Dài
    g.strokeStyle = '#451a03'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(L_X + 26, EYE_Y + 28); g.lineTo(L_X + 42, EYE_Y + 75); g.stroke();
    g.beginPath(); g.moveTo(R_X - 26, EYE_Y + 28); g.lineTo(R_X - 42, EYE_Y + 75); g.stroke();
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(224, 352); g.lineTo(288, 352); g.stroke();
  } else if (hero.id === 'ace') {
    drawAnimeEye(L_X, EYE_Y, '#1e293b', 'normal');
    drawAnimeEye(R_X, EYE_Y, '#1e293b', 'normal');
    drawBrow(L_X, 180, '#0f172a', 0.18);
    drawBrow(R_X, 180, '#0f172a', -0.18);
    // Tàn nhang trên má Ace & nụ cười rạng rỡ
    g.fillStyle = '#7c2d12';
    for (const [dx, dy] of [[-12, 0], [0, 6], [12, -2], [-6, 12], [8, 10]]) {
      g.beginPath(); g.arc(L_X - 18 + dx, EYE_Y + 46 + dy, 3, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(R_X + 18 + dx, EYE_Y + 46 + dy, 3, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#ffffff'; g.strokeStyle = '#1e1b18'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(192, 334); g.quadraticCurveTo(256, 344, 320, 334); g.quadraticCurveTo(256, 386, 192, 334); g.fill(); g.stroke();
  } else if (hero.id === 'shanks') {
    drawAnimeEye(L_X, EYE_Y, '#1e293b', 'normal');
    drawAnimeEye(R_X, EYE_Y, '#1e293b', 'normal');
    drawBrow(L_X, 180, '#7f1d1d', 0.18);
    drawBrow(R_X, 180, '#7f1d1d', -0.18);
    // 3 vết sẹo dài qua mắt trái của Tóc Đỏ
    g.strokeStyle = '#991b1b'; g.lineWidth = 4.5;
    for (const dx of [-12, 0, 12]) {
      g.beginPath(); g.moveTo(L_X + dx + 8, EYE_Y - 58); g.lineTo(L_X + dx - 10, EYE_Y + 58); g.stroke();
    }
    // Râu lún phún quanh cằm
    g.strokeStyle = '#451a03'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(212, 344); g.quadraticCurveTo(256, 356, 300, 340); g.stroke();
  } else if (hero.id === 'minato') {
    drawAnimeEye(L_X, EYE_Y, '#0284c7', 'normal');
    drawAnimeEye(R_X, EYE_Y, '#0284c7', 'normal');
    drawBrow(L_X, 182, '#ca8a04', 0.1);
    drawBrow(R_X, 182, '#ca8a04', -0.1);
    g.strokeStyle = '#451a03'; g.lineWidth = 5.5;
    g.beginPath(); g.moveTo(214, 344); g.quadraticCurveTo(256, 366, 298, 344); g.stroke();
  } else if (hero.id === 'kaido') {
    drawAnimeEye(L_X, EYE_Y, '#dc2626', 'normal');
    drawAnimeEye(R_X, EYE_Y, '#dc2626', 'normal');
    drawBrow(L_X, 174, '#09090b', 0.32);
    drawBrow(R_X, 174, '#09090b', -0.32);
    // Râu rồng & miệng gầm dữ dội của Sừng Trâu
    g.fillStyle = '#ffffff'; g.strokeStyle = '#09090b'; g.lineWidth = 6;
    g.beginPath(); g.roundRect(190, 332, 132, 42, 12); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(190, 353); g.lineTo(322, 353); g.stroke();
    g.strokeStyle = '#09090b'; g.lineWidth = 10; g.lineCap = 'round';
    g.beginPath(); g.moveTo(190, 330); g.quadraticCurveTo(120, 350, 95, 425); g.stroke();
    g.beginPath(); g.moveTo(322, 330); g.quadraticCurveTo(392, 350, 417, 425); g.stroke();
  } else if (hero.id === 'yone_chibi') {
    // Nạ lấy từ ảnh gốc yone-ti-ni.jpg: MỘT phiến liền, không ghép nhiều mảnh. Ba màu
    // đo bằng median vùng no màu - nền nạ #b52353, chỗ bắt sáng #dd3b82, khe rãnh
    // #970d48; lửa xanh #5dd5f5 non -> đáy hốc #143255.
    // Hình thù nạ (chóp V giữa hai mắt, cầu mày ôm mắt hồng, tab má ngoài, hốc mắt lửa,
    // gợn sóng cyan) và CẢ ĐƯỜNG CHÂN TÓC nữa đều vẽ bằng 2D trên cùng một tấm. Hai bản
    // trước để tóc là khối 3D: vành + má đính ở 0.484/0.487 thì mỗi chỗ giáp lồi hơn phiến
    // sơn 0,024 thành một gờ sáng, mũ tóc đồng tâm 0.470 cắt xuống trán ở theta 38,4° thì
    // để lại một cái gờ ngang trán - cả hai đều bị chê là lộ rãnh nối. Giờ trên mặt tiền
    // không còn chỗ nào hai khối gặp nhau: đỏ sơn kín tới đỉnh đầu, tóc phủ lại lên trên,
    // biên tóc là một nét trong ảnh.
    const maskRed = '#b52353', maskDeep = '#970d48';
    // Đỏ chạy vượt mép trên của tấm (y cũ -227,6 = theta 0°): vẽ thừa ra ngoài để chắc
    // chắn không hở một dải nào, canvas tự cắt.
    g.fillStyle = maskRed;
    g.beginPath();
    g.moveTo(-120, 330);                                // mép trái ngoài, sát tai
    g.lineTo(-120, -240);
    g.lineTo(632, -240);
    g.lineTo(632, 330);                                 // mép phải ngoài, đối xứng
    g.quadraticCurveTo(548, 352, 462, 348);             // vòng vào chóp tab trên má
    g.quadraticCurveTo(438, 274, 402, 208);             // rồi vòng lên hốc ngoài mắt hồng
    g.quadraticCurveTo(344, 186, 286, 214);             // cầu mày chạy sát mí trên
    g.lineTo(256, 268);                                 // ...xuống chóp V giữa hai mắt
    g.quadraticCurveTo(206, 306, 140, 332);             // cạnh trái V sa xuống gò má,
    g.quadraticCurveTo(66, 360, 0, 402);                // hốc mắt lửa nằm TRONG phiến
    g.quadraticCurveTo(-58, 384, -120, 330);            // kéo tiếp ra sát tai trái
    g.closePath();
    g.fill();
    // Viền thẫm theo đúng đường vừa tô: nạ trong ảnh có bóng đậm ở mép nên chỉ cần nét
    // này là phiến tách khỏi da, không phải vẽ thêm rãnh nọ.
    g.strokeStyle = maskDeep; g.lineWidth = 6; g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(632, 330);
    g.quadraticCurveTo(548, 352, 462, 348);
    g.quadraticCurveTo(438, 274, 402, 208);
    g.quadraticCurveTo(344, 186, 286, 214);
    g.lineTo(256, 268);
    g.quadraticCurveTo(206, 306, 140, 332);
    g.quadraticCurveTo(66, 360, 0, 402);
    g.quadraticCurveTo(-58, 384, -120, 330);
    g.stroke();
    // Sống giữa trán: một rãnh duy nhất, dọc theo đúng tim phiến (x 256..258) từ chóp
    // V lên tới sát đỉnh crest. Vẽ xéo ra là nó tràn ra khỏi mép nạ và thành nét đen trên da.
    g.beginPath(); g.moveTo(256, 262); g.lineTo(258, -138); g.stroke();
    // Óng sơn mài: hai dải dọc mép trên + một vệt má trái. Trước đây mép trên của phiến
    // là y=0 nên dải óng nằm ở y 92; nay trán cao thêm 227 px nữa nên nhấc lên theo, nếu
    // không thì nửa trên trán chết màu. Vẽ TRƯỚC khi tô tóc, phần tóc phủ lên sẽ cắt gọn.
    g.fillStyle = 'rgba(221,59,130,0.45)';
    g.beginPath(); g.ellipse(150, 6, 108, 26, -0.14, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(392, 10, 96, 24, 0.14, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(78, 316, 24, 34, 0.22, 0, Math.PI * 2); g.fill();
    // Tóc trên nóc đầu, đúng màu hairM #2b3047 nên khối này liền với hai cột tóc bên và
    // gáy thành MỘT vùng sơn, không phải một mảnh áp vào mảnh khác.
    // Biên dưới là đường RĂNG CƯA ba chóp, lấy theo chính nạ trong ảnh: chóp giữa ở tim
    // đầu (x 256, y -160 => theta 12,8°) và HAI CHÓP CẠNH ở x 43/469 = phương vị ±48°,
    // cũng theta 12,8° - đúng chỗ gốc sừng mọc. Giữa các chóp là khe tóc sa xuống theta
    // 48,8° (x 149/363, y 30). Hai bản trước chỉ có một cung trơn nên chỗ sừng lại rơi
    // vào tóc: user gọi là "khoảng đen ở giữa, 2 phần phải khớp với nhau".
    g.fillStyle = '#2b3047';
    g.beginPath();
    g.moveTo(-120, -240);
    g.lineTo(632, -240);
    g.lineTo(632, -70);
    g.lineTo(556, -150);
    g.lineTo(469, -165);
    g.lineTo(410, -40);
    g.lineTo(363, 30);
    g.lineTo(300, -110);
    g.lineTo(256, -160);
    g.lineTo(212, -110);
    g.lineTo(149, 30);
    g.lineTo(102, -40);
    g.lineTo(43, -165);
    g.lineTo(-44, -150);
    g.lineTo(-120, -70);
    g.closePath();
    g.fill();
    // Óng tóc: hai dải sáng nằm TRONG vùng tóc, mỗi dải một bên chóp cạnh, để nóc đầu
    // không thành vệt đen phẳng.
    g.fillStyle = 'rgba(126,140,178,0.30)';
    g.beginPath(); g.ellipse(96, -196, 74, 20, -0.10, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(420, -196, 74, 20, 0.10, 0, Math.PI * 2); g.fill();
    // Tóc hai bên thái dương + sau gáy, cũng SƠN trên tấm này. Vẽ sau lớp đỏ nên mép
    // trong lượn vào tới local x -96 (phương 81°) ở ngang thái dương rồi vòng ra -150
    // dưới gò má: đường tóc - nạ không thành một kinh tuyến thẳng như kẻ, và vì tấm giờ
    // quấn tới phương 180° nên không còn khối 3D nào phải giáp mép với nó nữa.
    for (const s of [-1, 1]) {
      g.save(); g.translate(256, 0); g.scale(s, 1);
      g.fillStyle = '#2b3047';
      g.beginPath();
      g.moveTo(-800, -240);
      g.lineTo(-376, -240);
      g.quadraticCurveTo(-352, 60, -406, 330);
      g.lineTo(-376, 540);
      g.lineTo(-800, 540);
      g.closePath();
      g.fill();
      g.restore();
    }
    // Gợn sóng cyan trên phiến trái, đúng nét MẢNH trong ảnh. Bản tube 3D đội lên vỏ
    // nạ làm nó nổi khối và cắt ngang các phiến khác, ở đây nó chỉ là một nét sơn.
    g.strokeStyle = '#7fe3f7'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(104, 148); g.quadraticCurveTo(142, 166, 120, 184);
    g.quadraticCurveTo(104, 198, 132, 208); g.stroke();
    // Con mắt lửa: hốc mắt CẮT MỞ trong nạ, cả con mắt là lửa xanh, không lòng trắng
    // và không con ngươi (đúng ảnh). Vẽ thẳng lên facePatch nên không còn patch nào
    // đính ngoài vỏ nạ nữa.
    const drawFlameEye = (cx, cy) => {
      g.save();
      g.translate(cx, cy);
      g.rotate(0.22); // khóe ngoài (phía x nhỏ = phía tai) chếch LÊN, đúng mắt nạ trong ảnh
      // Hốc: trũng xanh đêm để lửa cháy lên từ trong hố, không dán trên mặt nạ
      g.fillStyle = '#0d2b4c';
      g.beginPath(); g.ellipse(0, 0, 66, 42, 0, 0, Math.PI * 2); g.fill();
      // Lưỡi lửa vẽ TRƯỚC thân mắt: gốc chìm trong thân, chỉ ngọn liếm lên trên là thấy.
      // Ảnh gốc có lửa tạt lên - ra ngoài, nên dx âm và ngọn cao 44..64 px.
      const lick = (x, w, dx, h) => {
        const y0 = -14;
        const gr = g.createLinearGradient(x, y0, x + dx, y0 - h);
        gr.addColorStop(0, 'rgba(232,250,255,0.95)');
        gr.addColorStop(0.45, 'rgba(120,208,246,0.75)');
        gr.addColorStop(1, 'rgba(39,83,178,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(x - w, y0);
        g.quadraticCurveTo(x - w * 0.4 + dx * 0.25, y0 - h * 0.5, x + dx, y0 - h);
        g.quadraticCurveTo(x + w * 0.5 + dx * 0.15, y0 - h * 0.45, x + w, y0);
        g.closePath();
        g.fill();
      };
      lick(-46, 13, -20, 44);
      lick(-16, 18, -14, 62);
      lick(14, 17, 4, 50);
      lick(42, 11, 16, 30);
      // Thân mắt: hạnh nhân ĐẦY lửa, không lòng trắng, không con ngươi (đúng ảnh).
      // Lõi sáng đặt lệch xuống khóe trong vì ảnh cháy mạnh nhất ở đáy hốc.
      const body = g.createRadialGradient(-10, 10, 5, 0, 0, 62);
      body.addColorStop(0, '#f6feff');
      body.addColorStop(0.28, '#b8ecfd');
      body.addColorStop(0.55, '#4fb2e8');
      body.addColorStop(0.8, '#2a6fc0');
      body.addColorStop(1, '#1b3f8f');
      g.fillStyle = body;
      g.beginPath(); g.ellipse(0, 0, 58, 36, 0, 0, Math.PI * 2); g.fill();
      // Vảy lửa trong thân: lưỡi cong sáng hơn vẽ chồng, cắt theo hình mắt nên không
      // tràn ra nạ. Đủ để thân mắt không thành một vệt tô phẳng.
      g.save();
      g.beginPath(); g.ellipse(0, 0, 58, 36, 0, 0, Math.PI * 2); g.clip();
      g.lineCap = 'round';
      for (const [sx, sy, ex, ey, lw] of [[-40, 24, -14, -22, 12], [-2, 28, 22, -16, 10], [26, 24, 44, -6, 7]]) {
        g.strokeStyle = 'rgba(236,252,255,0.55)'; g.lineWidth = lw;
        g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + (ex - sx) * 0.2, (sy + ey) / 2, ex, ey); g.stroke();
      }
      g.restore();
      // Mí trên: cung hạnh nhân như drawAnimeEye nhưng bằng xanh thẫm của hốc nạ, nét
      // MỎNG (4px) thôi - bản 6px viền đậm quanh hốc làm mắt bầm như một vết thương.
      g.strokeStyle = '#0d2b4c'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-60, -4); g.quadraticCurveTo(0, -40, 60, -4); g.stroke();
      g.restore();
    };
    drawFlameEye(L_X, EYE_Y);
    drawAnimeEye(R_X, EYE_Y, '#de3d91', 'normal');
    drawBrow(R_X, 178, '#2b3047', -0.2);
    // Miệng nằm trên da trần (262..332): mép nạ bên trái dừng ở x 92 nên vẽ lệch trái
    // là đầu mút chìm trong đỏ son, mất luôn nét mếu của ảnh.
    g.strokeStyle = '#5b2a3a'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(262, 352); g.quadraticCurveTo(298, 342, 332, 352); g.stroke();
  } else if (hero.id === 'leesin_chibi') {
    // Lấy từ leesin-long-cuoc-ti-ni.jpg (980x980). Kiến trúc NHƯ yone_chibi: MỘT phiến
    // sơn lo lớn, không ghép mảnh. Đầu hình này chỉ có ba thứ - tóc bạc - dải bịt mắt tía
    // - viền vàng - nên vẽ hết bằng 2D trên tấm quấn 2π; 3D chỉ cho phần NHÔ RA ngoài vỏ:
    // giáp tay và cụm gai tóc. Mọi tọa độ dưới đây đã đổi qua `fit.mjs px` ra theta/phương vị,
    // không đoán:
    //   y 140 -> theta 69,9°    y 260 -> 93,0°     y 300 -> 100,6°
    //   y 350 -> 110,1°         y 470 -> 132,9°    y -260 -> -2,3° (vượt ngon đầu, vẽ thừa)
    //   x 0/512 -> phương vị -57,6°/+57,6°   x -144/656 -> -90°/+90° (mặt bên)
    //   x -544/1056 -> hai mép canvas, gặp nhau ở sau gáy; cả hai bên đều là tóc nên
    //   đường nối ảnh không để lại khe nào.
    // Màu: MỌI hex là median vùng no màu đo bằng measure.mjs --sat 0 (mặc định lọc sat 70
    // trả về xanh của hậu quang, vì tóc bạc gần như achromatic):
    //   #4a4069 MẶT TRƯỚC dải bịt   (0.47,0.45,0.57,0.50 hue 255 sat 41) - chỗ người xem thấy
    //   #2c1756 median TRỌN dải     (0.45,0.42,0.69,0.50) - tính cả đỉnh khuất dưới tóc
    //   #2d1941 bóng thái dương      (0.60,0.41,0.66,0.45)
    //   #463357 dải ngả tím nóng     (0.52,0.45,0.58,0.49 hue 272 sat 36)
    //   #aa855f viền vàng   (0.40,0.38,0.72,0.56 hue 25-55)
    //   #987556 vàng bóng   (0.40,0.38,0.72,0.56 cửa sổ rộng)  #b28562 vàng được chiếu
    //   #ccdae9 tóc sáng    (0.52,0.27,0.58,0.31 hue 211 sat 29) - phần ăn sáng
    //   #959ec3 tóc thân    (0.54,0.20,0.60,0.24)
    //   #8290b5 tóc tối     (0.47,0.23,0.53,0.27) - rim dưới
    //   #8f95c1 gốc tóc     (0.63,0.33,0.69,0.37) - bên phải ảnh
    //   #9eb5e3 đầu lọn     (0.44,0.35,0.50,0.39) - lọn tóc đè lên mặt nạ
    //   #eabab7 má sáng / #885f53 nét cười (0.49,0.475,0.57,0.51)

    // (1) MẶT NẠ. Biên trên nằm giấu dưới chân tóc; biên dưới là hai lobe cong quanh
    // mắt và chém xuống điểm giữa ở sống mũi (y 260) để tam mũi chung (y 268..296, vẽ
    // SAU nhánh này) vẫn rơi trên da trần.
    const band = '#2c1756', bandLit = '#4a4069', bandShade = '#2d1941', bandWarm = '#463357';
    const gold = '#aa855f', goldDeep = '#987556', goldLit = '#b28562';
    const bandPath = () => {
      g.beginPath();
      g.moveTo(256, 138);
      g.quadraticCurveTo(152, 150, 62, 172);
      g.quadraticCurveTo(20, 192, 4, 224);
      g.quadraticCurveTo(38, 314, 118, 332);
      g.quadraticCurveTo(198, 330, 256, 260);
      g.quadraticCurveTo(314, 330, 394, 332);
      g.quadraticCurveTo(474, 314, 508, 224);
      g.quadraticCurveTo(492, 192, 450, 172);
      g.quadraticCurveTo(360, 150, 256, 138);
      g.closePath();
    };
    g.fillStyle = band;
    bandPath(); g.fill();
    // Dải bịt trong ảnh KHÔNG một màu: median trọn dải #2c1756 (sat 61) là màu thật nhưng
    // nó tính cả phần đỉnh khuất dưới tóc, nên sơn phẳng một mình thì dưới đèn ấm của chánh
    // điện nó đọc ra ĐEN. Ảnh tự tách hai giá trị: #2c1756 ở ngọn/hai thái dương và
    // #4a4069 ở mặt trước - chỗ người xem thực sự nhìn thấy. Vì vậy nền là một gradient DỌC
    // giữa đúng hai số đo đó (không tự nâng palette), cắt trong band nên không tràn ra da.
    g.save();
    bandPath(); g.clip();
    const bandGrad = g.createLinearGradient(0, 138, 0, 332);
    bandGrad.addColorStop(0, band);
    bandGrad.addColorStop(0.55, bandLit);
    bandGrad.addColorStop(1, bandLit);
    g.fillStyle = bandGrad;
    g.fillRect(-544, -260, 1600, 796);
    // Hai thái dương tối dần ra sau gáy: #2d1941 đo ở góc trên phải của dải trong ảnh.
    g.fillStyle = bandShade;
    g.beginPath(); g.ellipse(24, 232, 44, 66, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(490, 232, 44, 66, 0, 0, Math.PI * 2); g.fill();
    // #463357 hue 272 - cùng dải nhưng ngả tím nóng phía phải mũi; giữ nguyên chỗ nó được đo
    // (canvas x 185..292, y 207..262) để hai hue của ảnh cùng xuất hiện trên hình.
    g.fillStyle = bandWarm;
    g.beginPath(); g.ellipse(238, 234, 55, 28, 0.05, 0, Math.PI * 2); g.fill();
    // #373e8a (0.485,0.462,0.512,0.488 hue 235 sat 83) là điểm SÁNG NHẤT của dải trong ảnh -
    // chỗ vải phồng lên đón đèn. Gradient một mình dừng ở #4a4069 (median mặt trước, sat 41)
    // vẫn thấp hơn nó hai bậc, và sat 41 là median nên nó đã bị hai thái dương tối kéo xuống.
    // Ảnh = canvas x 121..170, y 238..280 theo phép đổi ở trên -> êlip bán trục 34x26.
    g.fillStyle = '#373e8a';
    g.beginPath(); g.ellipse(146, 259, 34, 26, -0.1, 0, Math.PI * 2); g.fill();
    g.restore();
    // Viền vàng: MỘT nét dọc theo trọn viền mặt nạ, không phải đè thêm mảnh rời nào.
    // Bề ngang đổi từ 16 sang 24 vì phép đo cũ lấy sai một số: nó so 9px viền với 274px
    // BỀ NGANG band, nhưng nét viền đo ở biên dưới là một bề dọc, hai trục của tấm quấn
    // không đẳng hướng (4,44 px/độ ngang, 5,27 px/độ cực). Đo lại trọn: viền dày ~13px ảnh
    // (các hàng dọc 12-15px ở y 0.48..0.51, vùng không bị lửa của kiếm che), band rộng
    // 240px ảnh -> 2R*sin(az) với az 56,7° -> R ~145px ảnh -> 13px = 5,1° cực ->
    // 5,1 * 5,27 = 27px canvas. Tỉ số checks: 13/240 = 5,4% và 27/504 = 5,4%. Ban 24.
    g.strokeStyle = gold; g.lineWidth = 24; g.lineJoin = 'round';
    bandPath(); g.stroke();
    // Bóng trong của viền, le theo lòng dưới - đo vùng hẹp hơn của cùng viền đó.
    g.strokeStyle = goldDeep; g.lineWidth = 8;
    g.beginPath();
    g.moveTo(20, 224); g.quadraticCurveTo(48, 296, 122, 338);
    g.moveTo(492, 224); g.quadraticCurveTo(464, 296, 390, 338);
    g.stroke();
    // Chém xuống giữa mặt: điểm vàng ở sống mũi + hai nét mảnh chụm lên. Trong ảnh đó là
    // một chữ V nhỏ nằm trên da, viền mặt nạ từ nó tỏa ra hai bên. Nét chính 18 để cùng
    // tỉ số dày/rộng với viền 24 vừa đo ở trên.
    g.strokeStyle = gold; g.lineWidth = 18; g.lineCap = 'round';
    g.beginPath(); g.moveTo(230, 222); g.lineTo(256, 252); g.lineTo(282, 222); g.stroke();
    // Nét ăn sáng của chữ V: #b28562 là vàng cùng chi tiết nhưng ở chỗ được chiếu sáng.
    g.strokeStyle = goldLit; g.lineWidth = 8;
    g.beginPath(); g.moveTo(232, 218); g.lineTo(256, 246); g.lineTo(280, 218); g.stroke();
    g.lineWidth = 12; g.strokeStyle = gold;
    g.beginPath();
    g.moveTo(196, 214); g.quadraticCurveTo(214, 240, 230, 218);
    g.moveTo(316, 214); g.quadraticCurveTo(298, 240, 282, 218);
    g.stroke();
    // Mặt nạ trong ảnh KHÔNG có mắt: dải bịt kín nên không vẽ drawAnimeEye ở đây.

    // (2) TÓC. MỘT khối liền mạch từ gáy bên này sang gáy bên kia, phủ trọn nóc đầu và
    // hai bên; biên dưới của nó là đường chân tóc - một nét BIÊN TRONG ẢNH, không phải
    // vỏ cầu 3D (bài học của yone: mỗi vỏ 3D chồng lên vùng sơn để lại một cái gờ ngang
    // trán). Biên đi từ mặt bên phải (x 656 = phương +90°) lên, sa xuống thành lọn tóc đè
    // lên mặt nạ ở (398, 302), rồi vòng qua trán và xuống mặt bên trái.
    const hairPath = () => {
      g.beginPath();
      g.moveTo(-544, 536);
      g.lineTo(-544, -260);
      g.lineTo(1056, -260);
      g.lineTo(1056, 536);
      g.lineTo(656, 536);
      g.quadraticCurveTo(600, 470, 552, 384);
      g.quadraticCurveTo(512, 302, 470, 248);
      g.lineTo(444, 202);
      g.quadraticCurveTo(420, 268, 398, 302);
      g.quadraticCurveTo(374, 250, 350, 194);
      g.quadraticCurveTo(302, 156, 256, 148);
      g.quadraticCurveTo(196, 120, 140, 134);
      g.quadraticCurveTo(92, 148, 44, 186);
      g.quadraticCurveTo(16, 214, -4, 250);
      g.quadraticCurveTo(-58, 330, -144, 536);
      g.closePath();
    };
    // MỘT MÀU BẠC DUY NHẤT. Ảnh đo được năm giá trị bạc (#ccdae9 đỉnh ăn sáng, #959ec3
    // thân, #8290b5 rim, #8f95c1 ngọn, #9eb5e3 đầu lọn) và bản trước sơn cả năm, rồi 3D lại
    // dùng #e2e8f0 của Sương Bạc: thành RA HAI MÀU TÓC - phiến thì xám lavender, khối thì
    // bạch kim. User bác, nên toàn bộ tóc - sơn lẫn 3D - chạy trên đúng #e2e8f0. Bỏ luôn
    // lớp shading và nét ngọn: ở 144px chúng chỉ là hai tầng xám đè lên nhau, còn lọn tóc
    // thật thì đã có 17 gai + 6 dải lụa 3D gánh.
    g.fillStyle = '#e2e8f0';
    hairPath(); g.fill();

    // (3) MÁNG SÁNG + MIỆNG CƯỜI. #eabab7 đo ở vùng dưới mặt nạ bên phải; miệng là nét
    // mờ ngắn nằm dưới tam mũi chung, lệch về bên phải như trong ảnh.
    g.fillStyle = 'rgba(234,186,183,0.5)';
    g.beginPath(); g.ellipse(322, 330, 54, 26, 0.1, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#885f53'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(266, 356); g.quadraticCurveTo(300, 372, 334, 354); g.stroke();
  } else if (hero.id === 'batman_chibi') {
    // NẠ DƠI = MỘT phiến sơn liền trên G.wrapMask (quấn 2π, tới theta 144,9°), đúng kiến
    // trúc nạ sừng và dải bịt: vải phủ hết tấm, còn lỗ mặt thì KHOÉT bằng
    // globalCompositeOperation 'destination-out' - da thật của khối đầu 0,46 hiện xuống
    // tới tận biên vải, không có mảnh vỏ nào áp biên vào mảnh nào nên không sinh cái rãnh
    // mà user đã ba lần gọi tên.
    // Lưới toạ độ vẫn là 512 cũ (canvas đã translate 544, 227,6). Đổi ra góc bằng
    //   theta = (y + 227,6) / 763 * 144,9°      phương vị = (x / 256 − 1) * 57,6°
    //   y 218..274 -> 85,0..95,6° (hai lỗ mắt, nằm TRÊN vải)
    //   y 268 -> 94,5° (mỏm vải giữa hai lông mày)  y 292 -> 99,0° (nách vải dưới mắt)
    //   y 356 -> 111,1° (hai góc lỗ mặt)  y 476 -> 133,6° (chân cằm, da còn lại 11°)
    //   x 122/390 -> phương vị ∓30,2° (biên lỗ mặt, vẫn trong phiến sơn ±57,6°)
    // Sáu hex dưới đây đều VAY từ HERO_LIST - xem entry batman_chibi: ảnh tham khảo không
    // tải được nên không có pixel để median, và tự đoán mã mới là bypass.
    const cowl = '#18181b', cowlDeep = '#09090b', cowlLit = '#334155';
    const lens = '#f8fafc', lensShade = '#64748b';
    const facePath = () => {
      g.beginPath();
      g.moveTo(122, 356);
      g.quadraticCurveTo(150, 296, 202, 292);
      g.quadraticCurveTo(240, 288, 256, 268);
      g.quadraticCurveTo(272, 288, 310, 292);
      g.quadraticCurveTo(362, 296, 390, 356);
      g.quadraticCurveTo(366, 450, 256, 476);
      g.quadraticCurveTo(146, 450, 122, 356);
      g.closePath();
    };

    // (1) VẢI phủ trọn tấm, kể cả sau gáy: một surface duy nhất không có biên nào khớp
    // với biên nào.
    g.fillStyle = cowl;
    g.fillRect(-544, -260, 1600, 800);
    // (2) KHỐI. Hai ellipse '#09090b' ở phương vị ∓119° (x = 256*(1 ± 119/57,6) =
    // -273 / 785, bán trục ngang 214px = 48°) tối dần ra sau gáy vì ở đó vải không đón
    // đèn; hai nét '#334155' là gờ trán (theta 76,7°) và crown (theta 54,4°) bắt sáng.
    g.fillStyle = cowlDeep;
    g.beginPath(); g.ellipse(-273, 190, 214, 330, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(785, 190, 214, 330, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = cowlLit; g.lineCap = 'round'; g.lineWidth = 14;
    g.beginPath(); g.moveTo(30, 176); g.quadraticCurveTo(256, 96, 482, 176); g.stroke();
    g.lineWidth = 10;
    g.beginPath(); g.moveTo(120, 60); g.quadraticCurveTo(256, 8, 392, 60); g.stroke();

    // (3) KHOÉT LỖ MẶT rồi viền lại bằng chính nét sáng của vải: nửa nét 6px (1,1° cực)
    // chồng lên da, đọc là mép vải đè lên má chứ không phải đường viền vẽ thêm.
    g.save();
    g.globalCompositeOperation = 'destination-out';
    facePath(); g.fill();
    g.restore();
    g.strokeStyle = cowlLit; g.lineWidth = 6; g.lineJoin = 'round';
    facePath(); g.stroke();

    // (4) HAI LỖ MẮT TRẮNG trên vải, không con ngươi - đây là tròng của hoá phục chứ
    // không phải mắt người. Bao đúng vùng drawAnimeEye vẫn vẽ cho các hình khác (ellipse
    // 42x34 quanh (166,235) và (346,235)) nên hình này không lệch hệ mắt của cả bộ.
    // Khóe TRONG ở thấp hơn khóe NGOÀI (218 -> 252) = nét chúc xuống đặc trưng của nạ.
    for (const s of [-1, 1]) {
      const cx = 256 + s * 90;   // 166 / 346 = đúng L_X và R_X
      g.beginPath();
      g.moveTo(cx + s * 44, 218);
      g.quadraticCurveTo(cx + s * 6, 234, cx - s * 40, 252);
      g.lineTo(cx - s * 36, 274);
      g.quadraticCurveTo(cx + s * 2, 258, cx + s * 42, 244);
      g.closePath();
      g.fillStyle = lens; g.fill();
      g.strokeStyle = cowlDeep; g.lineWidth = 7; g.stroke();
      g.strokeStyle = lensShade; g.lineWidth = 4;
      g.beginPath(); g.moveTo(cx + s * 40, 246); g.quadraticCurveTo(cx + s * 2, 262, cx - s * 34, 268); g.stroke();
    }

    // (5) MIỆNG + CẰM. Nét ngang 7px chúc nhẹ hai đầu ('#3b2314' là nét miệng cả bộ đã
    // dùng, giữ nguyên để không phải màu môi mới); bóng cằm cùng họ rgba(120,53,15) với
    // tam giác mũi chung vẽ sau nhánh này.
    g.strokeStyle = '#3b2314'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(216, 344); g.quadraticCurveTo(256, 352, 296, 344); g.stroke();
    g.fillStyle = 'rgba(120,53,15,0.16)';
    g.beginPath(); g.ellipse(256, 404, 60, 24, 0, 0, Math.PI * 2); g.fill();
  } else if (hero.id === 'zed_chibi') {
    // NẠ SẮT ZED = MỘT phiến sơn liền trên G.wrapMask (quấn 2π, tới theta 144,9°): SẮT
    // phủ trọn mặt (vòm + hai má + quai hàm), khăn đỏ chỉ còn ở hai bên và sau gáy, mũ
    // vàng là dải khép quanh trán chứ không sa xuống cằm.
    // ẢNH THAM KHẢO NGHIÊNG 3/4 nên không đổi ảnh -> mặt cầu bằng phép chia tuyến tính
    // (bản trước lấy theta = (y + 227,6) / 763 * 144,9° nên mọi lớp bị kéo tụt xuống
    // cằm và mặt nạ tưởng như chỉ che nửa mặt). Ảnh là phép chiếu vuông góc của khối
    // cầu đã xoay, nên toạ độ ảnh là sin/cos của góc, không phải tỉ lệ dài cung:
    //   screen_x = CX - R * x_local,   screen_y = CY - R * cos(theta)
    // với đĩa đầu đo trong ảnh 980px: CX 0,556 / CY 0,449 / R 0,168 (đỉnh vòm ở ảnh-y
    // 0,281) và tư thế yaw psi = -6,75°, roll rho = +8° (rho giải từ yêu cầu hai mắt đối
    // xứng: đường mắt nghiêng 8,1° trong ảnh). Quay ngược hai góc đó rồi đọc chuỗi màu
    // dọc từng kinh tuyến cho ra mọi biên dưới đây, không có số nào mắt ước.
    // P(phương vị, theta) -> px trên lưới 512 cũ (canvas đã translate 544, 227,6):
    //   1° phương vị = 800/180 = 4,4444 px,  1° cực = 763/144,9 = 5,2657 px
    // hai trục KHÔNG đẳng hướng nên một vòng tròn vẽ bằng px ở đây sẽ dẹt dọc 0,844x.
    // SẮT có hai bậc và cả hai phải LÀM XÁM, không làm xanh. VÒNG NÀY NÂNG SÁNG cả hệ vì
    // user: "mũ đang có màu xám hơi tối, chuyển qua màu bạc sáng hơn". Số mới không phải
    // nhấc cảm tính: median vùng vòm sắt thật trong ảnh (0,45,0,28 -> 0,65,0,36 = đúng nửa
    // trên khối đầu, 1.440 px no màu) ra #6377a4, v 164; hai ô kiểm chứng kề nhau cho mean
    // #697c99 (v 153) và #687eb0 (v 176). Bậc cũ #737175 lấy v 117 từ vùng má ĐÃ quay khỏi
    // đèn nên cả nạ tối hơn ảnh một bậc rõ. Hue 222 vẫn là ambient xanh-tím của CẢNH chứ
    // không phải màu nạ (user đã bác "xanh hay đen" hai lần) nên giữ nguyên CẤU TRÚC kênh
    // của bậc cũ và chỉ nhân giá trị: r 115->161, g 113->158, b 117->164.
    // steelDeep = steel x 0,846 (giữ đúng tỉ số 99/117 đã đo), steelLit = steel x 1,33.
    const steel = '#a19ea4', steelDeep = '#88868b', steelLit = '#d6d2da';
    const gold = '#cf9561', goldShade = '#6a5247', cloth = '#5e1319';
    // slit = lòng khe tối (hố thì vẫn đen thật, chỉ không được NGÃ XANH): #2b2a30 sat 5.
    const slit = '#2b2a30', eye = '#cd222d', eyeCore = '#f03050';
    const D2PX = 4.4444, T2PX = 5.2657;
    const P = (az, th) => [256 + az * D2PX, th * T2PX - 227.6];
    const poly = (pts) => {
      g.beginPath();
      pts.forEach(([a, t], i) => { const [x, y] = P(a, t); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.closePath();
    };

    // (1) SẮT phủ trọn tấm, kể cả sau gáy: một surface duy nhất, không biên nào khớp
    // biên nào. Hai khoảng tối đầu/cuối gradient là từ kinh tuyến |az| = 88° trở ra
    // (canvas x 0..448 và 1152..1600) - đúng chỗ khối đầu quay khỏi đèn.
    const body = g.createLinearGradient(0, 0, 1600, 0);
    body.addColorStop(0, steelDeep); body.addColorStop(0.28, steel);
    body.addColorStop(0.72, steel); body.addColorStop(1, steelDeep);
    g.fillStyle = body; g.fillRect(-544, -260, 1600, 800);

    // (2) QUAI HÀM tối dần, tối VỪA PHẢI: bản alpha 0,9 đổ steelDeep kín từ theta 96 xuống
    // đáy nên nửa dưới mặt nạ thành một mảng ĐEN (user: "vẫn còn một nửa mũ chưa tô màu
    // xám"). 0,35: phiến giờ là kim loại (faceMetal, metalness 0,45) nên diffuse đã mất
    // sẵn 45%, một gradient 0,55 chồng lên nữa là nửa dưới thành than không đọc ra xám.
    const jaw = g.createLinearGradient(0, P(0, 96)[1], 0, P(0, 145)[1]);
    jaw.addColorStop(0, 'rgba(136,134,139,0)'); jaw.addColorStop(1, 'rgba(136,134,139,0.35)');
    g.fillStyle = jaw; g.fillRect(-544, P(0, 96)[1], 1600, P(0, 145)[1] - P(0, 96)[1]);

    // (3) KHĂN ĐỎ chỉ ở hai bên + sau gáy. Mép trên đọc từ chuỗi DO: theta 100 ở phương
    // vị 50° -> 87 ở 60 -> 80 ở 70 -> 76 ở 80 -> 73 ở 90 rồi vòng ra sau; mép dưới là
    // 128/126/118/120 - dưới nó ảnh trả lại SẮT, tức gờ sau của chính chiếc nạ.
    const hoodTop = [[50, 100], [60, 87], [70, 80], [80, 76], [90, 73], [120, 70], [180, 68]];
    const hoodBot = [[180, 150], [120, 150], [90, 120], [80, 118], [70, 126], [60, 128], [50, 126]];
    g.fillStyle = cloth;
    for (const s of [1, -1]) { poly(s > 0 ? hoodTop.concat(hoodBot) : mir(hoodTop).concat(mir(hoodBot))); g.fill(); }

    // (4) MŨ VÀNG: MỘT miền khép, không chạm đáy phiến. Vách dưới là chuỗi VANG đo được:
    // chóp sa xuống thấp nhất rơi đúng theta 123 ở phương vị 0 (phần giữa hai mắt), eo ở
    // 12°, rồi cánh lượn ra tới ngọn ngoài cùng ở 42°. Vách trên cất từ 89° giữa trán lên
    // 57° ở 16° (đỉnh cánh) rồi hạ 61/67/74/76 ra phía thái dương.
    // NGỌN CẠNH DỪNG Ở ±68°, không còn quét ra 92°: ảnh cho thấy sau ngọn cánh là KHĂN ĐỎ
    // (bước 3), còn bản cũ kéo một dải vàng vòng qua thái dương ra tận gáy nên nhìn từ
    // sau/sau-bên là cả nửa đầu vàng khè thay vì sắt xám.
    // Biên nằm ở ZED_CROWN module scope vì phiến NÔ 3D của đúng dải này vẽ từ toạ độ đó.
    const crown = ZED_CROWN;
    g.fillStyle = gold; poly(crown.concat(mir(crown))); g.fill();
    g.strokeStyle = goldShade; g.lineWidth = 8; g.lineJoin = 'round'; poly(crown.concat(mir(crown))); g.stroke();
    // Điểm sáng nhất của cả khối đo ở (phương vị -58°, theta 52°) ra #d5ffff — ở THÉP chứ
    // không ở vàng (bản trước ghi nhầm "trên dải vàng" rồi vẽ một ellipse đặc 26x12: trên
    // cầu nó thành một vết xước trắng nổi giữa vòm). Highlight trên mặt cầu là MỘT VÙNG
    // TAN DẦN, nên vẽ bằng radialGradient bo nét, dẹt dọc 2:1 theo hướng cong của vòm.
    {
      const [sx, sy] = P(-58, 52);
      g.save(); g.translate(sx, sy); g.scale(1, 0.5);
      const glint = g.createRadialGradient(0, 0, 3, 0, 0, 54);
      glint.addColorStop(0, 'rgba(213,255,255,0.55)');
      glint.addColorStop(0.55, 'rgba(213,255,255,0.22)');
      glint.addColorStop(1, 'rgba(213,255,255,0)');
      g.fillStyle = glint; g.beginPath(); g.arc(0, 0, 54, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    // (5) CHỮ V TRÁN: hai dải, hai vai trò khác nhau. Dải DƯỚI (vB, theta 46..84) là VÀNG
    // — đó là càng mày liền mạch với phiến mặt bước 4, đúng nét user chốt "đổi màu V thành
    // màu gold". Dải TRÊN (vA, theta 14..59) nằm trên VÒM SỌ, và vòm trong ảnh là sắt xám
    // với một phù hiệu KHẮC TỐI ở giữa (đo #3f4363, hue do ambient tím của cảnh nên đã bỏ
    // bão hoà, xem bước 2). Bản cũ tô vàng cả hai dải nên nửa trên đầu thành vàng, không
    // còn là "mũ sắt xám bạc".
    const vA = [[0, 38], [16, 24], [32, 14], [34, 26], [18, 40], [0, 59]];
    const vB = ZED_VB;
    g.fillStyle = steelDeep; poly(vA.concat(mir(vA))); g.fill();
    g.strokeStyle = slit; g.lineWidth = 6; g.lineJoin = 'round'; poly(vA.concat(mir(vA))); g.stroke();
    g.fillStyle = gold; poly(vB.concat(mir(vB))); g.fill();
    g.strokeStyle = goldShade; g.lineWidth = 7; poly(vB.concat(mir(vB))); g.stroke();

    // (5b) ĐƯỜNG KHẮC ĐỈNH VÒM: rãnh hẹp phương vị 0 chạy theta 2..36, rộng 8px (=1,8°),
    // chính hex sắt tối. Trong ảnh chibi nó là nét chia hai nửa mũ, và nó cắt qua phù hiệu
    // khắc ở vòm (bước 5, dải vA) nên phải là HEX RÃNH (slit) chứ không phải steelDeep —
    // steelDeep giờ gần bằng steel nên vẽ lên vA thành một đường vô hình.
    g.fillStyle = slit;
    g.fillRect(256 - 4, P(0, 2)[1], 8, 34 * T2PX);

    // (5c) LƯỚI MIỆNG = PHIẾN SẮC BẠC SÁNG HƠN MẶT NẠ, không phải một chóp tam giác. Trong
    // ảnh, từ dưới mũi xuống cằm là một phiến SÁNG hơn mặt nạ xung quanh (đo #58494e ở grill
    // trái, v 88, trong khi quai hàm bóng v 53) và nó mang các khe thở. Bản trước chỉ vẽ tam
    // giác cằm alpha 0,55 nên vùng miệng tối bằng đúng nền -> bước 6 tô khe lên đó thành
    // "không thấy rãnh miệng đâu".
    // steelLit = steel x 1,33 (v 164 -> 218), giữ nguyên cấu trúc kênh đã ép bão hoà.
    // Lý do phải nhấc hex chứ không nhấc đèn: phiến giờ là kim loại (faceMetal 0,45) và nó
    // ở theta 116..144, tức pháp tuyến chúi xuống dưới - cao hơn đèn key (2,4,-3) nên diffuse
    // gần bằng 0; đo lại thumb.png thì cả vùng này ra #1a1a1c dù đã sơn steel. Không có đèn
    // nào trong sảnh rọi từ dưới lên, nên độ sáng phải nằm trong SƠN.
    // Cạnh trên ở theta 116: hốc mắt vẽ sau (bước 7) có đáy ở 106,7 + 52px = 116,5, nên phiến
    // bắt đầu ngay dưới mắt chứ không chui vào mắt. Đáy 144 là trần: phiến quấn dừng ở
    // 144,9° (0,805π), bản vẽ tới 148 bị cắt mất chóp ngay mép.
    const grill = [[0, 116], [20, 118], [36, 122], [44, 128], [34, 140], [14, 144], [0, 144]];
    g.fillStyle = steelLit; poly(grill.concat(mir(grill))); g.fill();
    g.strokeStyle = steel; g.lineWidth = 7; g.lineJoin = 'round';
    poly(grill.concat(mir(grill))); g.stroke();
    // Sống mũi bằng vàng có khe tối chính giữa (ảnh: DO ở theta 105..110, phương vị 0).
    g.fillStyle = 'rgba(43,42,48,0.5)';
    g.fillRect(250, P(0, 104)[1], 12, 10 * T2PX);

    // (6) LƯỚI THỞ: BA khe mỗi bên, nằm TRONG phiến bước 5c (không được vượt biên nó).
    // Rộng 24px = 5,4° phương vị; bản 20px trên nền tối bằng nhau nên thumbnail 144px
    // không còn thấy rãnh nào. Khe vẫn là đường constant-az (thẳng đứng trên canvas) vì
    // trên mặt cầu nó TỰ nghiêng theo má — nghiêng trong ảnh là phối cảnh, không phải nét vẽ.
    g.fillStyle = slit;
    for (const s of [-1, 1]) {
      for (const [az, t0, t1] of [[12, 122, 141], [24, 124, 139], [36, 127, 134]]) {
        const [x, y] = P(az * s, t0);
        g.beginPath(); g.roundRect(x - 12, y, 24, (t1 - t0) * T2PX, 11); g.fill();
      }
    }

    // (7) HAI MẮT ĐỎ trong hốc. Tâm phương vị ±24°, theta 106,7° (centroid vùng đỏ đo
    // riêng từng bên: +25,3/106,8 và -23,9/106,7). Trục dài nghiêng 37° để khóe NGOÀI
    // cao hơn khóe TRONG - góc trục hiệp phương sai của vùng đỏ phía gần. Lõi 46x24 nằm
    // trong bbox lõi đo được (91x60 px), hốc tối 78x52 bao quanh.
    for (const s of [-1, 1]) {
      const [ex, ey] = P(24 * s, 106.7);
      // Quầng: ảnh loè thật (vùng đỏ v>=120 gấp 1,7 vùng lõi v>=190) nên vẽ rộng hơn
      // bằng chính hex đó ở alpha thấp, không phải một màu thứ hai.
      g.save(); g.translate(ex, ey); g.rotate(s * -0.65);
      g.globalAlpha = 0.3; g.fillStyle = eye;
      g.beginPath(); g.ellipse(0, 0, 88, 58, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      // Hốc mắt phải TỐI: steelDeep giờ là xám bạc (bậc shadow của sắt) nên để nó ở đây
      // thì quầng quanh mắt tan vào mặt nạ; lòng khe (slit) mới là hex rãnh thật.
      g.fillStyle = slit;
      g.beginPath(); g.ellipse(0, 0, 78, 52, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = eye;
      g.beginPath(); g.ellipse(0, 0, 68, 40, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = eyeCore;
      g.beginPath(); g.ellipse(0, 0, 46, 24, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  } else if (hero.id === 'irelia_chibi') {
    // KIEM CAI TOC - son mat tren TAM SON 512 (facePatch, khong phai phiến quấn: WRAP_FACE_IDS
    // :405 không có id này). Nguồn duy nhất là splash Riot `Chibi_Irelia.png` 512px
    // (/tmp/llref), do bang /tmp/irelia-pts.mjs (median 5x5) va /tmp/irelia-centre.mjs (bbox).
    //
    // ANH LA GOC 3/4 nen KHONG chep bat doi xung cua anh: mat trong anh o (186,227) va
    // (250,231) lech nhau 64px va lech tam dau ~40px, nghia la ca hai mat du ve mot phia.
    // Son lech nhu vay thi khi dau xoay ve truoc (camera sảnh) mat se dan nhau. Nen giu
    // QUY UC DA SHIP cua 12 hinh dau: tam mat az +/-20,25 do = x 166/346, EYE_Y 235
    // (theta 88 do). Cai ta lay tu anh la TI LE, khong phai vi tri tuyet doi.
    //
    // Ti le do duoc (anh px): hong mat mo 50, mat cach nhau 64 -> 0,78. Tren tam:
    //   0,78 x 180 (cach hai tam mat) = 140 px ngang -> rx 70.
    //   Hong mat trong gan TRON (bbox 45x47) nen khong duoc ve tron bang px: tam san
    //   4,4444 px/do phuong vi nhung 5,2657 px/do cuc (ty so 1,185 - bat bien 3 cua skill),
    //   muon tron THAT thi ry = rx x 1,185 -> ry 82.
    // Mieng: do tu tam mat xuong 26px, bang 0,59 chieu cao hong mat -> 0,59 x 164 = 97px
    //   duoi EYE_Y -> y 332. (Cua chung 12 hinh dau ve mieng o y 340: lech 8px, giu 332.)
    // Mui: giu tam giac chung :1204 (theta 94..99,5) - no nam giua mat 317 va mieng 323.
    const D2PX = 4.4444, T2PX = 5.2657;
    const P = (az, th) => [256 + az * D2PX, th * T2PX - 227.6];
    // TOI = long mat ve day, do diem trong bbox mat (#2f0b43 sat 56), diem toi nhat ca hốc
    // mat la #140624 -> long den dung #2f0b43, hoc sinh dung #1c0530 (do #140624/#24035c).
    const lash = '#2f0b43', pupil = '#1c0530';
    // BONG MAT HONG: do #92465e sat 76 (giua hai long may, ngay tren song mũi), diem sang
    // nhat cua vung do #fbd4d5. Day la lop trang diem, khong phai mau da.
    const shadow = '#92465e';
    // LONG MAY: median 467px cua dai may tren anh goc (#5f3460, xem (7b)). La mau plum
    // nong, khong phai den - nen dung alpha 0,95 chu khong 1 de no chim dan voi tran.
    const browM = '#5f3460';
    // LONG TRANG MAT: khong phai trang tuyet doi - median vung trang do #cebfcb sat 15,
    // sang nhat #e4ccd2, nen #d9ccd8 (nham xam tim cua ambient, khong nhac len trang rong).
    const sclera = '#d9ccd8';
    // IRIS HAI BAC: tren tim tham #331e75 (do diem), than #532b98 (median vung iris sat 109),
    // DUOI LUU QUANG XANH do #8cd6eb sat 95, diem sang nhat #98eaff va #7ee5ff.
    const irisDeep = '#331e75', irisMid = '#532b98', irisCyan = '#8cd6eb', irisCyanLit = '#98eaff';
    const glint = '#fbe1ff';   // diem sang thu hai trong mat (sang nhat cua vung iris trai)
    const blush = '#e09ea8';   // vong hong DUOI mat, sat 66
    const mouth = '#b26b7c', mouthLit = '#d297a2';  // median / sang nhat vung mieng
    const CX = 90, CY = 235, RX = 70, RY = 82;      // az 20,25 do; rx/ry da do o tren
    for (const s of [-1, 1]) {
      const cx = 256 + s * CX;
      const outer = (v) => cx + s * v;   // + v la phia TAI (ngoai), - v la phia mũi (trong)

      // (1) BONG MI: dai hong NAM GIUA long may va mi, khong phai de chan tren hong mat.
      // Ban cu tam o CY-RY+18 ry 34 -> chay xuong tan y 199, che nua hong mat, render ra
      // hai "dai" mau ngoi rieng tren tran. Do anh: vung mi hong nhat (#d9c2e6) tu y 175
      // den 215 tren tong hong mat 50px, tuc cai dai day bang 0,8 lan ban kinh hong mat
      // va tam o NGAY MIEN TREN cua mi. Tren tam: tam y 140 (13 duoi long may, 13 tren
      // dinh hong mat), ry 26, rx 0,95 RX de no ton trong lech ve phia tai nhu anh.
      g.save(); g.globalAlpha = 0.4; g.fillStyle = shadow;
      g.beginPath(); g.ellipse(cx + s * 6, CY - RY - 13, RX * 0.95, 26, 0, 0, Math.PI * 2); g.fill();
      g.restore();

      // (2) LONG TRANG: vien mat mo. Khong vien den: o Irelia vien mat la LONG (bước 5).
      g.fillStyle = sclera;
      g.beginPath(); g.ellipse(cx, CY, RX, RY, 0, 0, Math.PI * 2); g.fill();

      // (3) IRIS: chiem gan het hong mat (chibi), rx 62 = 0,88 x RX do tu anh (44/50).
      // Gradient DOC ba bac, khong phai radial: trong anh sac doi tu tim dau xuong xanh
      // duoi day, va do la hai do diem khac nhau chu khong phai mot tam tron tam thoi.
      const ir = g.createLinearGradient(0, CY - 73, 0, CY + 73);
      ir.addColorStop(0, irisDeep); ir.addColorStop(0.46, irisMid);
      ir.addColorStop(0.82, irisCyan); ir.addColorStop(1, irisCyanLit);
      g.fillStyle = ir;
      g.beginPath(); g.ellipse(cx, CY, 62, 73, 0, 0, Math.PI * 2); g.fill();
      // Day iris sang HON phia tren (do #98eaff o diem duoi, #331e75 o diem tren) nen ve
      // them mot cung mong: gradient doc da ket o #98eaff nhung no phai hue lien tuc.
      g.strokeStyle = irisCyanLit; g.lineWidth = 7; g.globalAlpha = 0.8;
      g.beginPath(); g.ellipse(cx, CY, 62, 73, 0, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
      g.globalAlpha = 1;

      // (4) HOC SINH: to, chiem 0,45 ngang va 0,52 doc iris (do bang cach tim diem toi
      // nhat trong bbox mat roi do dien tich cua no).
      g.fillStyle = pupil;
      g.beginPath(); g.ellipse(cx, CY - 4, 28, 38, 0, 0, Math.PI * 2); g.fill();

      // (5) DIEM SANG: mat chibi co MOT hat lon goc TAI-TRONG + mot hat nho. Hat lon do
      // #ffffff (diem sang nhat ca vung mat), hat nho #fbe1ff. Hat lon dat phia trong vi
      // hai mat cung nhin ve phia camera cua anh.
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(cx - s * 26, CY - 34, 17, 21, s * 0.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = glint;
      g.beginPath(); g.ellipse(cx + s * 20, CY + 30, 10, 12, 0, 0, Math.PI * 2); g.fill();

      // (6) LONG MAT TREN: net day 12px DI SAT MI TREN cua hong mat, khong phai ngoi
      // tren tran. Ban cu qua dinh o CY-RY-16 (y 137) = lech mi 16px va cong ngoai cu
      // tui xuong 44px -> mat dua thanh MAY DANG (gian du), do la ly do render vong
      // truoc co "hai lop long mat". Cach an toan: ve chinh cung ellipse cua mi tren
      // (goc 1,04pi..1,96pi) nen duong mi KHONG THE lech mi, roi them cai canh cuon len
      // tham o goc ngoai (anh: goc ngoai bao bay len, do bbox mi tren anh dinh 185 so
      // voi tam mi 220 = 0,7 lan duong kinh hong mat).
      g.strokeStyle = lash; g.lineWidth = 12; g.lineCap = 'round';
      g.beginPath(); g.ellipse(cx, CY, RX - 3, RY - 3, 0, Math.PI * 1.04, Math.PI * 1.96); g.stroke();
      g.lineWidth = 11;
      g.beginPath();
      g.moveTo(outer(RX - 14), CY - RY * 0.34);
      g.quadraticCurveTo(outer(RX + 8), CY - RY * 0.8, outer(RX + 22), CY - RY - 16);
      g.stroke();
      // MI DUOI: mong 5px, alpha 0,5 - do cung #310b4b nhu long tren, chi la mong hon.
      g.save(); g.globalAlpha = 0.5; g.strokeStyle = lash; g.lineWidth = 5;
      g.beginPath(); g.moveTo(outer(-RX + 12), CY + RY - 24);
      g.quadraticCurveTo(cx, CY + RY + 6, outer(RX - 16), CY + RY - 20); g.stroke();
      g.restore();

      // (7) VONG HONG DUOI MAT: do #e09ea8 nam SAT ngay duoi mi duoi (trong anh chi lech
      // tam mat 15px = 0,18 chieu cao hong mat). Ban dat o CY+RY*0,72 (y 294) nam BEN
      // TRONG hong mat (mat chay toi y 317) nen no tron voi long trang #d9ccd8 thanh
      // mau xam-luc = "tui mat". Dat duoi day mat mot cai (RY*0,95 = y 313) va mong hon.
      g.save(); g.globalAlpha = 0.3; g.fillStyle = blush;
      g.beginPath(); g.ellipse(cx + s * 8, CY + RY * 0.95, RX * 0.7, 16, 0, 0, Math.PI * 2); g.fill();
      g.restore();

      // (7b) LONG MAY: BAN DAU TRO VE "KHONG VE" vi lay ly do vom toc 0,47 an xuong
      // theta 71,2 va che kin - do la hinh hoc CUA VOM CU, vom moi cat o 47..58 va tran
      // lo 25 do. Do lai tren anh goc: dai long may mau #5f3460 (median 467px, vung
      // x195..271 y170..188) nam CACH 5..8px tren duong mi, tam lech hong mat 0,64..1,0
      // lan duong kinh. Tren tam (1 lan duong kinh hong mat = 164px): tam y 124, lech
      // dinh mi 14px. Day 10px, khong phai net che: long may Irelia mong hon mi.
      g.strokeStyle = browM; g.lineWidth = 8; g.lineCap = 'round'; g.globalAlpha = 0.9;
      g.beginPath();
      g.moveTo(outer(-RX + 16), CY - RY - 14);
      g.quadraticCurveTo(cx + s * 4, CY - RY - 32, outer(RX + 8), CY - RY - 24);
      g.stroke();
      g.globalAlpha = 1;
    }

    // (8) MIENG nho 20px rong (do bbox vung hong #b26b7c nam duoi mũi), dat lech tam 2px
    // ve phia tai trai cua nhan vat. Trong anh mieng la mot tam nho tron, khong phai nuoi
    // cuoi: Irelia chibi mang ve nghieng.
    g.fillStyle = mouth;
    g.beginPath(); g.ellipse(258, 334, 15, 9, 0.06, 0, Math.PI * 2); g.fill();
    g.strokeStyle = mouthLit; g.lineWidth = 4; g.globalAlpha = 0.7;
    g.beginPath(); g.moveTo(246, 329); g.quadraticCurveTo(258, 324, 271, 328); g.stroke();
    g.globalAlpha = 1;

    // (9) MUI: anh khong co tam giac mui - chi mot bong nhat ngay duoi hai hoc mat,
    // ngang tam hong mat. Tam giac chung (256,268)-(246,296)-(264,296) render ra mot
    // vet nau ro tren mat, nen Irelia di theo net cua no: ellipse 11x7 alpha 0,2.
    g.fillStyle = 'rgba(150,72,58,0.2)';
    g.beginPath(); g.ellipse(254, 288, 11, 7, 0, 0, Math.PI * 2); g.fill();
    // (10) KHONG son vong dau hay bang tron trang: do la hai mesh THAT (reliefShell +
    // ribbon) o buoc 3, son len phiến se de lai mot vung phang ngay duoi mép khối cầu.
  } else if (hero.id === 'ahri_chibi') {
    // CAO DUOI TRANG - son mat tren TAM SON 512 (facePatch, khong phai phiến quấn:
    // WRAP_FACE_IDS :452 không có id này vì nửa trên đầu của cô là TÓC 3D, không phải vải).
    // Nguồn: splash Riot /tmp/llref/Chibi_Ahri.png, đo bằng /tmp/ahri-eyes2.mjs (bbox) và
    // /tmp/ahri-face.mjs + /tmp/ahri-face2.mjs (median/quartile).
    //
    // ANH LA GOC 3/4 NEN KHONG CHEP KHOANG CACH GIUA HAI MAT cua no: bbox mat mo
    // (0.4900..0.5786) va mat nham (0.4100..0.4886) SAT nhau tren anh - hai tam lech
    // 61,2px trong khi mot hong mat rong 63,8px, tuc trong anh hai mat deo chong len nhau
    // do phoi canh. Nen giu QUY UC DA SHIP cua 17 hinh dau: tam mat az +/-20,25 do
    // (x 166/346), EYE_Y 235 = theta 88 do. Cai lay tu anh la TI LE, khong phai vi tri.
    //
    // Kich thuoc do tu LONG DEN (vung duy nhat tach sach duoc bang hue: 27,8 x 26,7 px):
    //   iris / khoang cach hai tam mat = 27,8 / 61,2 = 0,454 -> tren tam: 0,454 x 180 =
    //   81,8 px NGANG -> IRX 41. Chieu cao: ti le anh 26,7/27,8 = 0,96 va hai truc
    //   KHONG dang huong (4,4444 px/do phuong vi vs 5,2657 px/do cuc, ti so 1,185 - bat
    //   bien 3 cua skill) nen IRY = 41 x 0,96 x 1,185 = 46,5 -> 46.
    //   Hong mat (bbox mi-vang 63,8 x 56,6 px, gap 1,3 lan long den): ERX 53, ERY 60.
    // Mieng: anh 3/4 nen khoang cach doc phong dai len (bbox mieng 0.42..0.5186 x
    // 0.3814..0.4586 con an ca bong co). Giu y 338 nhu 12 hinh dau (340) va Irelia (332).
    // MUC SON: tat ca ca hex duoi la median / quartile do tren anh, khong phai doan.
    const lash = '#2f2337';   // median 1.568 px dai long mi tren (0.50,0.27,0.58,0.31)
    const brow = '#2e2541';   // median 965 px dai long may (0.492,0.252,0.564,0.278)
    const sclera = '#f8decd'; // quartile sang nhat vung rang tren (0.435,0.388,0.495,0.405)
    // IRIS BA BAC DOC: duoi day duoc nang sang hon dinh (trong anh: #fde17c o 0.520,0.335
    // ..0.552,0.348 vs #975f24 o 0.520,0.300..0.552,0.312) - do la hai do diem khac nhau,
    // khong phai mot radial tam thoi. Median ca hong mat #e3b655 sat 142 hue 41.
    const irisTop = '#975f24', irisMid = '#e3b655', irisLit = '#fde17c';
    const pupil = '#391c14';  // quartile toi nhat trong bbox hong mat (0.515,0.305,0.555,0.345)
    const mouth = '#721428';  // bucket hue340-no-sang-trung vung mieng = 217 px (ahri-bucket.mjs)
    const mouthEdge = '#8e4f58'; // p75 cua dai mi tren (235,200,50,12) hue320-360 sat>=20;
                                 // median cung dai la #77242e gan bang long mieng nen net
                                 // ay phai la hong nau, khong phai do toi hon.
    const tongue = '#cf575f'; // bucket hue340-no-sang = 72 px, nam duoi day mieng
    const tooth = '#f5d6c3';  // bucket hue20-lo-sang = 177 px: mot cai nanh, khong phai dai rang
    const cheek = '#e4a8b2';  // LOI net vuot, khong phai median ca vung: median #d1afb5
                              // bi da xung quanh pha loang nen render thanh vet tham xam.
                              // Loc hue 320..360 + sat>=25 trong hop 172..214 x 212..252
                              // (CAT hot mieng ra khoi vung) -> ba diem sang nhat cua net
                              // la #e6abb4 #e6abb4 #e4a6b4, median #e4a8b2.
                              // Ben mat mo anh chi do ra #fbdbc4 gan bang da - do la ben
                              // duoc nang, khong phai net khac mau; tam son la mat TRUC
                              // DIEN nen hai ben cung mot hex (bat dang xe: cung kich
                              // thuoc, chi khac huong).
    const nose = '#d8a495';   // median 367 px hue 0..30 sat>=15 tai (245,205,25,20) = bong
                              // duoi mui, h13 s31. Mau cung ho voi da nen alpha 0,55 du.
    const CX = 90, CY = 235;
    const ERX = 53, ERY = 60, IRX = 41, IRY = 46;

    // (1) MAT MO - phia az + (x 346). Trong anh con mat ay nhin ve phia qua cau, nen
    // long den dat lech 6px ve phia trong (phia mũi), khong nam giua hong mat.
    {
      const cx = 256 + CX;
      g.fillStyle = sclera;
      g.beginPath(); g.ellipse(cx, CY, ERX, ERY, 0, 0, Math.PI * 2); g.fill();
      const ir = g.createLinearGradient(0, CY - IRY, 0, CY + IRY);
      ir.addColorStop(0, irisTop); ir.addColorStop(0.5, irisMid); ir.addColorStop(1, irisLit);
      g.fillStyle = ir;
      g.beginPath(); g.ellipse(cx - 6, CY, IRX, IRY, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = pupil;
      g.beginPath(); g.ellipse(cx - 6, CY - 2, 17, 24, 0, 0, Math.PI * 2); g.fill();
      // HAT SANG: hat lon goc tren-ngoai (phia tai), hat nho duoi-trong - do la hai diem
      // sang nhat trong bbox hong mat (#fff798 va #fae490, xem iris-vang/long-trang).
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(cx + 14, CY - 26, 12, 15, 0.2, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(cx - 20, CY + 20, 7, 9, 0, 0, Math.PI * 2); g.fill();
      // LONG MI TREN: net day 15 DI SAT mi hong mat (khong ngoi tren tran - bai hoc cua
      // Irelia buoc 6) va CUON LEN RA NGOAI o goc tai, do la cai "mat cau" cua ho ly.
      g.strokeStyle = lash; g.lineWidth = 15; g.lineCap = 'round';
      g.beginPath(); g.ellipse(cx, CY, ERX - 3, ERY - 3, 0, Math.PI * 1.03, Math.PI * 1.97); g.stroke();
      // Ngon mi NOI LIEN voi cung tren (diem dau = diem cuoi cua cung, khong phai mot que
      // roi): cung 1,97pi ket thuc o (cx + 0,994ERX, CY - 0,093ERY), dat ngon tu do.
      g.lineWidth = 13;
      g.beginPath();
      g.moveTo(cx + (ERX - 3) * Math.cos(Math.PI * 1.97), CY + (ERY - 3) * Math.sin(Math.PI * 1.97));
      g.quadraticCurveTo(cx + ERX + 10, CY - ERY * 0.78, cx + ERX + 26, CY - ERY - 14);
      g.stroke();
      // MI DUOI mong 6px, cung muc: anh co duong mi duoi ro, khong phai chi bong.
      g.lineWidth = 6;
      g.beginPath(); g.moveTo(cx - ERX + 14, CY + ERY - 20);
      g.quadraticCurveTo(cx, CY + ERY + 4, cx + ERX - 12, CY + ERY - 16); g.stroke();
    }

    // (2) MAT NHAM (wink) - phia az - (x 166). Do bbox mi-wink 56,6 x 35,0 px: ca con
    // mat CHI CAO bang 0,58 mat mo, tuc mi nham van dang RONG bang, chi xep lai.
    // HUONG CONG DA DO LAI, KHONG PHAI DOAN: /tmp/ahri-wink.mjs di qua tung cot x cua
    // vung (172..244, 178..222) va lay y trung binh cua pixel toi -> yTB 188 (cot 0)
    // tang den 211 (cot 19) roi GIAM ve 195 (cot 44). Ba diem ay la mot thung LUONG:
    // hai dau o tren, day o duoi. Do sau that = 211 - 193 = 18px tren be ngang 36px.
    // Be ngang bi phoi canh 3/4 nen con 36 trong khi mat mo 64 (he so 0,56); chieu doc
    // KHONG bi phoi canh, nen khi mo rong net ra bang hong mat mo (106px) van GIU 18px
    // do sau - khong nhan theo ti le, neu nhan thi net thanh cai luoi ca sau buon.
    {
      const cx = 256 - CX;
      g.strokeStyle = lash; g.lineWidth = 16; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx - ERX + 8, CY - 12);
      g.quadraticCurveTo(cx, CY + ERY * 0.30, cx + ERX - 6, CY - 10);
      g.stroke();
      // NGOAI LECH: do trong anh tu (178,205) len (172,178) = NGANG -6, DOC -27, tuc
      // ngon mi di LEN gan thang chu khong xeo ngang. Net truoc cua hinh nay dat
      // (-22,-49) nen no nam ngang nhu cai ria, khong phai mi. Ngon noi lien diem dau
      // cung (cx-ERX+8, CY-12) va ngon thu hai ngan hon tu giua cung - anh co 2 goc toi
      // o goc ngoai, khong phai 1.
      g.lineWidth = 12;
      g.beginPath();
      g.moveTo(cx - ERX + 8, CY - 12);
      g.quadraticCurveTo(cx - ERX + 1, CY - 30, cx - ERX - 4, CY - 46);
      g.stroke();
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(cx - ERX + 24, CY - 16);
      g.quadraticCurveTo(cx - ERX + 16, CY - 30, cx - ERX + 12, CY - 40);
      g.stroke();
      // KHONG con "bong duoi mi" nua: do bbox net chi cao 18px nen duong 7px nam duoi
      // 30px render thanh MI DUOI cua mot con mat mo dang nhin xuong, khong phai bong.
      // Duoi mat nham trong anh la VAI VUOT hong (xem (3)), khong phai net mi.
    }

    // (3) HAI LONG MAY - do lech dinh hong mat 1,0 lan duong kinh (anh: dai may
    // 0.492,0.252..0.564,0.278 nam tren mi 0.2900 tren tong hong mat 0.2900..0.3786).
    // HAI BEN NHU HET NHAU ve be dai: duong may ben mat nham cung dai bang ben mat mo,
    // chi khac do cong (may ben nham hang hon vi mi cung dang len).
    for (const s of [-1, 1]) {
      const cx = 256 + s * CX;
      g.strokeStyle = brow; g.lineWidth = 9; g.lineCap = 'round'; g.globalAlpha = 0.95;
      g.beginPath();
      g.moveTo(cx - s * (ERX - 6), CY - ERY - 40);
      g.quadraticCurveTo(cx, CY - ERY - 58 - (s < 0 ? 6 : 0), cx + s * (ERX + 16), CY - ERY - 44);
      g.stroke();
      g.globalAlpha = 1;
      // VAI VUOT MA (thay cho vong hong oval): oval #d9a593 hue 15 render thanh vet tham
      // xam, con anh khong co hong oval nao ca - do la ba net vuot cua ho cao. Do tu
      // vung duoi mat nham: net dai ~22px tren be ngang hong mat 36px = 0,61 lan, day
      // ~5px, cach nhau ~9px; mo rong theo hong mat tam (106px) -> dai 64px, cach 13px
      // (13 chu khong 9 vi 9 gan 5 day thi hai net dinh thanh mot khoi khi render 144px).
      // HAI BEN CUNG #d1afb5: ben mat mo do ra #fbdbc4 gan bang da, do la ben duoc nang,
      // khong phai net khac mau - tam son la mat TRUC DIEN nen hai ben phai nhu nhau
      // (bat dang xe: cung kich thuoc, chi khac huong).
      for (let i = 0; i < 3; i++) {
        const y0 = CY + ERY + 2 + i * 13;
        g.strokeStyle = cheek; g.lineWidth = 6 - i; g.lineCap = 'round';
        g.globalAlpha = 0.9 - i * 0.12;
        g.beginPath();
        g.moveTo(cx + s * (ERX * 0.30), y0);
        g.quadraticCurveTo(cx + s * (ERX * 0.72), y0 + 4, cx + s * (ERX + 11), y0 + 12);
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    // (4) MIENG nu cuoi mo: bbox do duong ngang 0.42..0.5186 nhung phan do den that
    // (sum<250 va lech do) chi 220 px, tu 0.44 den 0.48 doc - tuc mieng RONG ~0,5 lan
    // khoang cach hai tam mat = 90px tren tam, cao 0,36 lan be = 32px. Ve bon lop:
    // hong den, mot nanh trang tren, luoi hong duoi, viem mieng hong nau.
    g.fillStyle = mouth;
    g.beginPath(); g.ellipse(256, 338, 45, 26, 0, 0, Math.PI); g.fill();
    g.beginPath(); g.ellipse(256, 338, 45, 12, 0, Math.PI, Math.PI * 2); g.fill();
    g.strokeStyle = mouthEdge; g.lineWidth = 4; g.lineCap = 'round'; g.globalAlpha = 0.7;
    g.beginPath(); g.moveTo(213, 336); g.quadraticCurveTo(256, 322, 299, 336); g.stroke();
    g.globalAlpha = 1;
    // MOT CAI NANH, khong phai dai rang: #ffeafb chi xuat hien 12 px tai (274,244) tuc
    // MỘT goc ben phai cua khe mieng (mieng rong 50px tren anh, tam 257 -> nanh o +21%
    // be ngang), trong khi dai 36px render thanh mot tam kem che nua tren mieng - do la
    // cai gia nua cuoi cua ho cao, khong phai ham rang. Nanh rac tu day mi tren (326)
    // xuong 13px, be 13px, dau duoi tron.
    g.fillStyle = tooth;
    g.beginPath(); g.moveTo(270, 326); g.lineTo(283, 326);
    g.quadraticCurveTo(281, 338, 276, 340); g.quadraticCurveTo(271, 338, 270, 326); g.fill();
    // LUOI: #cf575f (bucket hue340-no-sang, 72 px) - mau do hong thuc, khong phai #d29386
    // hue 8 nhu truoc day (do la bong da chung quanh, khong phai luoi). Lech tam 4px ve
    // trai theo anh, rx 20 van chim trong long mieng 211..364.
    g.globalAlpha = 0.9; g.fillStyle = tongue;
    g.beginPath(); g.ellipse(252, 352, 20, 9, 0, 0, Math.PI); g.fill();
    g.globalAlpha = 1;

    // (5) MUI: anh chi co mot bong nhat 15 x 8 px (bbox 0.4771,0.3400..0.4986,0.3514),
    // quy ra 24 x 15 px tren tam. Tam giac chung (256,268)-(246,296)-(264,296) render ra
    // mot CAI MUI TEN ro nen Ahri bo nhu Irelia/Zed. Lop truoc dung rgba(150,72,58,.22)
    // ra vet xam vi 150-72-58 la do toi, khong phai mau do; #d8a495 la median 367 px
    // dung cua bong mui (h13 s31) nen de 0,55 thi composite len #f2cebc van ra #e0bcae.
    g.fillStyle = nose; g.globalAlpha = 0.55;
    g.beginPath(); g.ellipse(256, 284, 12, 7, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }

  // Mũi 3D shading nhẹ ở giữa. Riêng Zed bỏ: tam giác này rơi đúng theta 94..99, phương
  // vị -2..+2 tức ngay sống mũi VÀNG của nạ, nên nó thành một vệt nâu trên kim loại.
  // Irelia cũng bỏ: net mui cua rieng no o (9) o tren, de ca tam giac chung thi hai net
  // chong nhau thanh mot khoi nau. Ahri bo: mui trong anh chi la mot bong nhat 15x8 px,
  // net cua rieng no o (5).
  if (hero.id !== 'zed_chibi' && hero.id !== 'irelia_chibi' && hero.id !== 'ahri_chibi') {
    g.fillStyle = 'rgba(120,53,15,0.22)';
    g.beginPath(); g.moveTo(256, 268); g.lineTo(246, 296); g.lineTo(264, 296); g.closePath(); g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  FACE_TEX_CACHE.set(heroId, tex);
  return tex;
}

function m(geo, material, x = 0, y = 0, z = 0, o = {}) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  if (o.scale) mesh.scale.set(...o.scale);
  if (o.rot) mesh.rotation.set(...o.rot);
  mesh.castShadow = o.cast ?? true;
  return mesh;
}

// Dải lụa thuôn dần theo một đường cong: lọn tóc rũ, tua năng lượng. Port từ `lock()`
// trong pets.js (thanh_long đã ship) - ở đây nó là primitive DUY NHẤT dựng nét
// cong có bề dày, vì TubeGeometry bán kính không đổi luôn ra một cái ống: đúng thứ bị
// bác cho lọn tóc. flat < 1 ép tiết diện thành dải, r0 -> r1 cho phép ngọn nhọn hoắt.
// `rs` là bảng bán kính THEO TỪNG ĐỐT (độ dài seg+1) thay vì nội suy r0->r1: một lưỡi
// gươm thật thì SONG SONG suốt thân và chỉ thuôn ở đoạn cuối, còn nội suy tuyến tính
// luôn ra tam giác = cái móng vuốt.
function ribbon(points, r0, r1, { seg = 12, rad = 6, flat = 1, rs = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const fr = curve.computeFrenetFrames(seg, false);
  const prof = rs ?? Array.from({ length: seg + 1 }, (_, i) => r0 + (r1 - r0) * (i / seg));
  const pos = [], nor = [], idx = [], p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, r = prof[i];
    curve.getPointAt(t, p);
    for (let j = 0; j < rad; j++) {
      const q = (j / rad) * Math.PI * 2;
      n.copy(fr.normals[i]).multiplyScalar(Math.cos(q) * flat).addScaledVector(fr.binormals[i], Math.sin(q));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      n.normalize(); nor.push(n.x, n.y, n.z);
      const k = j === rad - 1 ? 1 - rad : 1;
      if (i < seg) { const v = i * rad + j; idx.push(v, v + k, v + rad, v + k, v + rad + k, v + rad); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g.toNonIndexed();
}

// PHÙ HIỆU NÔ TRÊN MẶT CẦU: sơn chỉ tô được ĐÚNG vỏ, còn "nổi khối" thì phải có bán kính
// riêng. Cách làm: một lưới (phương vị, theta) phủ vùng bbox của các đa giác, mỗi đỉnh đặt
// trên bán kính r + h*mask, mask = 1 ở sâu trong đa giác và trườn 0->1 trong vành bevel
// NGAY BÊN TRONG biên của hợp. Vì mọi đỉnh sinh ra từ cùng một tham số hoá với G.wrapMask,
// phiến NÔ nằm ĐÚNG chỗ nét sơn và biên của nó khớp nét sơn tới từng độ — không phải một
// khối dán áp lên vỏ (hai surface đồng tâm thì z-fight) mà là chính vỏ được thổi lên.
// Khoảng cách đo trong toạ độ "độ-theta" đã nhân sin(theta) cho phương vị, tức một đơn vị
// xấp xỉ một cung dài bằng nhau trên hai trục; bevel vì thế là một bề rộng thật, không
// phải một số độ bị méo theo vĩ độ.
const reliefCache = new Map();
// BIÊN VÀNG CỦA NẠ ZED, MỘT NGUỒN DUY NHẤT: nét sơn ở makeHeroFaceTex và phiến NÔ ở
// buildHeroHead3D phải là cùng một bảng toạ độ. Hai bản chép tay là hai biên lệch nhau
// ngay vòng chỉnh đầu tiên, mà lệch thì render ra một gờ vàng đứng cạnh một vệt sơn.
// mir: ảnh tham khảo đối xứng qua mặt phẳng giữa, nên nửa kia chỉ là đổi dấu phương vị.
const mir = (pts) => pts.map(([a, t]) => [-a, t]).reverse();
// MŨ VÀNG (bước 4): vách dưới là chuỗi VANG đo được, chóp sa tới theta 123 ở phương vị 0,
// cánh dừng ở ±68° vì sau ngọn cánh là khăn đỏ.
const ZED_CROWN = [
  [0, 123], [8, 119], [12, 101], [16, 92], [22, 89], [30, 86], [38, 83], [46, 72],
  [54, 66], [68, 58], [62, 52], [54, 53], [46, 55], [38, 76], [30, 68], [22, 61],
  [16, 57], [12, 60], [11, 84], [8, 88], [0, 89],
];
// CHỮ V TRÁN (bước 5, dải dưới) = càng mày vàng liền mạch với mũ.
const ZED_VB = [[0, 70], [16, 56], [30, 46], [32, 58], [18, 68], [0, 84]];
function reliefShell(polys, { r = 0.463, h = 0.03, bevel = 4, step = 1.6 } = {}) {
  const key = JSON.stringify([polys, r, h, bevel, step]);
  const done = reliefCache.get(key);
  if (done) return done;
  const D2R = Math.PI / 180;
  const flat = polys.map((p) => p.map(([a, t]) => [a * Math.sin(t * D2R), t]));
  const near = (px, py, poly) => {
    let d = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j], [bx, by] = poly[i];
      const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy;
      const k = L ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L)) : 0;
      d = Math.min(d, Math.hypot(ax + k * vx - px, ay + k * vy - py));
    }
    return d;
  };
  const inPoly = (px, py, poly) => {
    let v = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j], [bx, by] = poly[i];
      if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) v = !v;
    }
    return v;
  };
  const maskAt = (a, t) => {
    const px = a * Math.sin(t * D2R);
    let best = 0;
    for (const poly of flat) {
      // Khoảng cách CÓ DẤU: âm ở ngoài đa giác. Vành bevel vì thế nằm TOÀN BỘ bên trong
      // biên - ngay trên nét sơn mask vẫn 0, và vỏ vàng chỉ cao dần khi đi sâu vào trong.
      // Bevel đối xứng (0 ở ngoài bevel, 1 ở trong bevel) thì phiến vàng LOE ra ngoài nét
      // sơn đúng bevel độ và vì lưới dày đặc nên không có gì bị cắt bỏ: kết quả là một
      // nửa đầu vàng nguyên khối, render ra quả bóng vàng úp lên mặt nạ (đã thấy).
      const s = (inPoly(px, t, poly) ? 1 : -1) * near(px, t, poly);
      const m = Math.max(0, Math.min(1, s / bevel));
      best = Math.max(best, m * m * (3 - 2 * m));
    }
    return best;
  };
  let a0 = Infinity, a1 = -Infinity, t0 = Infinity, t1 = -Infinity;
  for (const p of polys) for (const [a, t] of p) {
    a0 = Math.min(a0, a); a1 = Math.max(a1, a); t0 = Math.min(t0, t); t1 = Math.max(t1, t);
  }
  const na = Math.round((a1 - a0) / step) + 1, nt = Math.round((t1 - t0) / step) + 1;
  const pos = [], ms = [], idx = [];
  for (let i = 0; i < na; i++) {
    const a = a0 + ((a1 - a0) * i) / (na - 1);
    for (let j = 0; j < nt; j++) {
      const t = t0 + ((t1 - t0) * j) / (nt - 1), k = maskAt(a, t);
      const rr = r + h * k;
      ms.push(k);
      pos.push(-rr * Math.sin(a * D2R) * Math.sin(t * D2R), rr * Math.cos(t * D2R), -rr * Math.cos(a * D2R) * Math.sin(t * D2R));
    }
  }
  // Ô nào cả bốn góc đều mask = 0 thì KHÔNG được dựng thành tam giác: để lại thì nó là
  // một mảnh vỏ vàng phẳng ngay trên nét sơn thép và che mất nét. Culling này là lý do
  // bevel nằm trong biên - không có mảnh thừa nào để phải cắt.
  for (let i = 0; i < na - 1; i++) for (let j = 0; j < nt - 1; j++) {
    const v = i * nt + j;
    if (ms[v] + ms[v + 1] + ms[v + nt] + ms[v + nt + 1] === 0) continue;
    idx.push(v, v + 1, v + nt, v + 1, v + nt + 1, v + nt);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  reliefCache.set(key, g);
  return g;
}

// LUOI PHANG (fin) - MOT ham duy nhat cho hai noi dung: dai vong tren dau va vong kiem
// duoi chan. Day la ly do no khong nam trong ribbon(): ribbon ep tiet dien doc theo phap
// tuyen Frenet, ma duong cong cua luoi vuot QUA MAT CAU nen phap tuyen nghieng sang y/z
// va huong NGANG ra thay vi vao may quay - probe Box3 do duoc x-span 0,155 vs z-span
// 0,186, ba lan doi rs/flat van ra cai SOI. Fin ty le trong mat phang cua chinh no:
// A = T x z (RONG, luon nam trong mat phang ngang cua may quay), N = T x A (DAY).
// Non-indexed => phap tuyen tung tam giac phang, khong bi trung binh mem giua mat truoc
// va canh ben. Goi y DoubleSide khi dat: luoi la mat phang khong day, cat mat truoc thi
// sau lung tro nen vo hinh - do la loi cua vo cau dong tam.
// points la toa do THEU GIOI [x,y,z] (ai goi tu (az,theta,r) thi tu doi truoc khi goi).
function finPlate(points, ws, thick = 0.010, crown = 0) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const UP = new THREE.Vector3(0, 0, 1);
  const P = new THREE.Vector3(), T = new THREE.Vector3(), A = new THREE.Vector3(), N = new THREE.Vector3();
  const st = ws.map((w, i) => {
    const f = i / (ws.length - 1);
    curve.getPointAt(f, P); curve.getTangentAt(f, T);
    A.crossVectors(T, UP);
    if (A.lengthSq() < 1e-8) A.set(1, 0, 0);
    A.normalize().multiplyScalar(w);
    // Day = do day cua dai vong bac (h 0,020 -> nua 0,010) va THUON dan ve ngon: goc
    // cam nang, ngon khong nhu mot tam thep cat ngang.
    N.crossVectors(T, A).normalize().multiplyScalar(thick * (1 - 0.65 * f));
    const Lb = P.clone().sub(A).sub(N), Rb = P.clone().add(A).sub(N);
    const Lf = P.clone().sub(A).add(N), Rf = P.clone().add(A).add(N);
    // LUOI CO LUONG (crown): mat phang thuan khong co cho duoi mau doi - do la ly do
    // ban 0,28 metalness render ra giay trang. Nung phan giua ca hai mat ra theo N mot
    // luong `crown` (cung thuon dan ve ngon nhu day) thi hai nữa mat nghiet nhau mot goc
    // atan(crown/w) va moi nua co phap tuyen rieng -> kim loai co sang toi doc ngang.
    // crown = 0 tra ve dung hinh cu (hai diem giua thang phang voi bon goc), nen quat tren
    // dau khong doi giua.
    const C = N.clone().normalize().multiplyScalar(crown * (1 - 0.65 * f));
    return [Lb, Rb, Lf, Rf, P.clone().add(N).add(C), P.clone().sub(N).sub(C)];
  });
  const pos = [];
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i], b = st[i + 1];
    const [Lb0, Rb0, Lf0, Rf0, F0, B0] = a, [Lb1, Rb1, Lf1, Rf1, F1, B1] = b;
    quad(Lb0, Lf0, Lf1, Lb1);
    quad(Rb0, Rf0, Rf1, Rb1);
    // mat truoc va mat sau cat doi qua duong luong: van theo chay trai->phai nhu ban
    // khong luong, chi them nua diem giua, nen khong dao huong phap tuyen o dau het.
    // KHONG ve them tam day Lf-Rf: no trung tuyen voi hai nua duoi va se z-fight.
    quad(Lf0, F0, F1, Lf1); quad(F0, Rf0, Rf1, F1);
    quad(Lb0, B0, B1, Lb1); quad(B0, Rb0, Rb1, B1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Vẽ tóc, mũ, băng trán, sừng 3D đặc trưng cho từng nhân vật
function buildHeroHead3D(head, hero) {
  const id = hero.id;

  // Băng trán vải vũ công 3D (Gai Vàng, Sương Bạc, Tóc Dài, Chớp Vàng)
  const addHeadband = (bandColor = '#1e293b', plateColor = '#cbd5e1', slanted = false, crossed = false) => {
    const hb = new THREE.Group();
    hb.add(m(new THREE.CylinderGeometry(0.468, 0.468, 0.14, 32, 1, true), mat(bandColor, { roughness: 0.5, side: THREE.DoubleSide }), 0, 0.16, 0));
    const plate = m(new THREE.BoxGeometry(0.34, 0.11, 0.04), mat(plateColor, { metalness: 0.85, roughness: 0.25 }), 0, 0.16, -0.46);
    if (crossed) {
      plate.add(m(new THREE.BoxGeometry(0.30, 0.018, 0.05), mat('#09090b'), 0, 0, 0.01));
    }
    hb.add(plate);
    if (slanted) hb.rotation.z = -0.24;
    head.add(hb);
  };

  if (id === 'luffy_g5') {
    // Tóc mây trắng xoăn bồng bềnh 3D + Mũ rơm đeo lưng
    const cloudM = mat('#f8fafc', { emissive: '#e2e8f0', emissiveIntensity: 0.25, roughness: 0.35 });
    head.add(m(new THREE.SphereGeometry(0.47, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), cloudM, 0, 0.04, 0.02));
    const puffs = [
      [0, 0.48, -0.12, 1.3], [-0.26, 0.42, -0.08, 1.15], [0.26, 0.42, -0.08, 1.15],
      [-0.42, 0.24, 0.05, 1.05], [0.42, 0.24, 0.05, 1.05], [0, 0.56, 0.08, 1.25],
      [-0.2, 0.36, 0.32, 1.1], [0.2, 0.36, 0.32, 1.1], [0, 0.18, 0.42, 1.1],
    ];
    for (const [px, py, pz, sc] of puffs) {
      head.add(m(G.cloudPuff, cloudM, px, py, pz, { scale: [sc, sc, sc] }));
    }
    // Ngọn mây uốn cong trên đỉnh
    head.add(m(G.spike, cloudM, 0.05, 0.66, -0.1, { rot: [-0.3, 0, -0.25], scale: [1.1, 1.1, 1.1] }));
  } else if (id === 'naruto_sage') {
    // Tóc vàng phát sáng Lục Đạo với 2 sừng Chakra + Băng trán vàng
    const hairM = mat('#facc15', { emissive: '#f59e0b', emissiveIntensity: 0.45, roughness: 0.3 });
    head.add(m(new THREE.SphereGeometry(0.47, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 0.03, 0.02));
    addHeadband('#f59e0b', '#fef08a');
    // Hai sừng tóc Kurama Lục Đạo
    for (const s of [-1, 1]) {
      head.add(m(G.spike, hairM, s * 0.26, 0.54, -0.08, { rot: [-0.15, 0, -s * 0.35], scale: [1.15, 1.35, 1.1] }));
      head.add(m(G.spike, hairM, s * 0.40, 0.36, 0.06, { rot: [0.1, 0, -s * 0.75], scale: [0.95, 1.05, 0.95] }));
      head.add(m(G.spike, hairM, s * 0.16, 0.14, -0.42, { rot: [2.4, 0, s * 0.2], scale: [0.45, 0.65, 0.45] }));
    }
    head.add(m(G.spike, hairM, 0, 0.55, 0.12, { rot: [0.25, 0, 0], scale: [1.1, 1.1, 1.1] }));
  } else if (id === 'zoro') {
    // Tóc xanh rêu gai nhọn + 3 khuyên tai vàng bên trái
    const hairM = mat('#22c55e', { roughness: 0.55 });
    head.add(m(new THREE.SphereGeometry(0.47, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 0.04, 0.02));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      head.add(m(G.spike, hairM, Math.sin(a) * 0.28, 0.44, Math.cos(a) * 0.24, { rot: [Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45], scale: [0.9, 0.85, 0.9] }));
    }
    // 3 khuyên tai vàng Haramaki bên tai trái (+x)
    const goldM = mat('#facc15', { metalness: 0.85, roughness: 0.2 });
    for (let k = 0; k < 3; k++) {
      head.add(m(new THREE.CylinderGeometry(0.015, 0.015, 0.09, 8), goldM, 0.44 + k * 0.022, -0.11, -0.02));
    }
  } else if (id === 'sasuke') {
    // Tóc đen ánh xanh gai xòe hai bên và ôm má
    const hairM = mat('#0f172a', { roughness: 0.45 });
    head.add(m(new THREE.SphereGeometry(0.475, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), hairM, 0, 0.03, 0.03));
    for (const s of [-1, 1]) {
      head.add(m(G.spike, hairM, s * 0.36, 0.08, -0.26, { rot: [2.5, 0, -s * 0.25], scale: [0.85, 1.35, 0.65] }));
      head.add(m(G.spike, hairM, s * 0.44, 0.32, 0.14, { rot: [0.3, 0, -s * 0.95], scale: [1.1, 1.3, 1.0] }));
      head.add(m(G.spike, hairM, s * 0.38, 0.12, 0.26, { rot: [0.6, 0, -s * 1.1], scale: [1.0, 1.2, 0.9] }));
    }
    head.add(m(G.spike, hairM, 0, 0.18, -0.43, { rot: [2.7, 0, 0], scale: [0.55, 0.95, 0.45] }));
  } else if (id === 'sanji') {
    // Tóc vàng rẽ ngôi che một bên mắt
    const hairM = mat('#facc15', { roughness: 0.45 });
    head.add(m(new THREE.SphereGeometry(0.478, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.56), hairM, 0, 0.04, 0.01));
    // Mái tóc vàng che bên mắt trái (-x)
    head.add(m(G.spike, hairM, -0.18, 0.12, -0.39, { rot: [2.85, 0, 0.22], scale: [1.45, 1.45, 0.55] }));
    head.add(m(G.spike, hairM, 0.28, 0.18, -0.34, { rot: [2.75, 0, -0.35], scale: [0.95, 1.15, 0.5] }));
  } else if (id === 'kakashi') {
    // Tóc bạch kim dựng nghiêng + băng trán che mắt trái
    const hairM = mat('#e2e8f0', { roughness: 0.45 });
    head.add(m(new THREE.SphereGeometry(0.47, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 0.04, 0.02));
    addHeadband('#1e293b', '#cbd5e1', true);
    for (let i = 0; i < 6; i++) {
      head.add(m(G.spike, hairM, -0.08 + i * 0.07, 0.52 - i * 0.03, -0.05 + (i % 2) * 0.12, { rot: [-0.2, 0, 0.48], scale: [1.1, 1.35, 1.0] }));
    }
  } else if (id === 'law') {
    // Mũ lông vòm trắng chấm đen đặc trưng của Mũ Đốm
    const hatTex = (() => {
      if (typeof document === 'undefined') return null;
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#f8fafc'; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#1e1b18';
      for (const [x, y, r] of [[45, 180, 18], [110, 170, 22], [180, 185, 19], [230, 175, 16], [75, 130, 15], [150, 125, 17], [210, 135, 14]]) {
        g.beginPath(); g.ellipse(x, y, r * 1.2, r * 0.85, 0.2, 0, Math.PI * 2); g.fill();
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const hatM = new THREE.MeshStandardMaterial({ map: hatTex, roughness: 0.8 });
    head.add(m(new THREE.SphereGeometry(0.50, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.54), hatM, 0, 0.08, -0.01));
    head.add(m(new THREE.TorusGeometry(0.46, 0.065, 12, 32), hatM, 0, 0.10, -0.01, { rot: [Math.PI / 2 - 0.08, 0, 0] }));
  } else if (id === 'itachi') {
    // Tóc đen dài hai bên má + băng trán gạch ngang
    const hairM = mat('#09090b', { roughness: 0.45 });
    head.add(m(new THREE.SphereGeometry(0.475, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), hairM, 0, 0.04, 0.02));
    addHeadband('#1e293b', '#cbd5e1', false, true);
    for (const s of [-1, 1]) {
      head.add(m(new THREE.CapsuleGeometry(0.085, 0.42, 6, 10), hairM, s * 0.38, -0.08, -0.22, { rot: [0.1, 0, s * 0.12] }));
    }
  } else if (id === 'ace') {
    // Tóc đen xoăn + Mũ cao bồi cam gắn 2 huy hiệu xanh & dây hạt đỏ
    const hairM = mat('#18181b', { roughness: 0.5 });
    head.add(m(new THREE.SphereGeometry(0.47, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 0.03, 0.02));
    const hatM = mat('#ea580c', { roughness: 0.6 });
    const brim = m(new THREE.CylinderGeometry(0.74, 0.74, 0.045, 32), hatM, 0, 0.24, 0);
    brim.scale.set(1.05, 1, 0.92);
    const crown = m(new THREE.CylinderGeometry(0.36, 0.44, 0.30, 24), hatM, 0, 0.38, 0);
    // Dây hạt đỏ + 2 huy hiệu mặt cười xanh trên mũ Ace
    const redBeadM = mat('#dc2626', { roughness: 0.3 });
    const blueBadgeM = mat('#38bdf8', { roughness: 0.3 });
    head.add(brim, crown);
    head.add(m(new THREE.TorusGeometry(0.42, 0.032, 10, 24), redBeadM, 0, 0.27, 0, { rot: [Math.PI / 2, 0, 0] }));
    for (const s of [-1, 1]) {
      head.add(m(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 16), blueBadgeM, s * 0.14, 0.35, -0.41, { rot: [Math.PI / 2, 0, 0] }));
    }
  } else if (id === 'shanks') {
    // Tóc đỏ rực rẽ ngôi lãng tử
    const hairM = mat('#b91c1c', { roughness: 0.48 });
    head.add(m(new THREE.SphereGeometry(0.48, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.58), hairM, 0, 0.04, 0.01));
    for (const s of [-1, 1]) {
      head.add(m(G.spike, hairM, s * 0.34, 0.06, -0.28, { rot: [2.6, 0, -s * 0.22], scale: [0.85, 1.25, 0.55] }));
    }
  } else if (id === 'minato') {
    // Tóc vàng Tia Chớp Vàng với 2 lọn dài hai bên má + băng trán
    const hairM = mat('#fde047', { roughness: 0.4 });
    head.add(m(new THREE.SphereGeometry(0.475, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 0.04, 0.02));
    addHeadband('#1e3a8a', '#cbd5e1');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      head.add(m(G.spike, hairM, Math.sin(a) * 0.30, 0.46, Math.cos(a) * 0.26, { rot: [Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4], scale: [1.05, 1.15, 1.0] }));
    }
    for (const s of [-1, 1]) {
      head.add(m(G.spike, hairM, s * 0.38, -0.08, -0.25, { rot: [3.0, 0, s * 0.08], scale: [0.75, 1.45, 0.55] }));
    }
  } else if (id === 'kaido') {
    // Bờm tóc đen dữ dội + Cặp sừng trâu khổng lồ cong vút
    const hairM = mat('#18181b', { roughness: 0.65 });
    const hornM = mat('#d6d3d1', { roughness: 0.35, metalness: 0.15 });
    head.add(m(new THREE.SphereGeometry(0.50, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.65), hairM, 0, 0.05, 0.06));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 1.4 - Math.PI * 0.7;
      head.add(m(G.spike, hairM, Math.sin(a) * 0.42, 0.25 + (i % 3) * 0.12, 0.18 + Math.cos(a) * 0.22, { rot: [0.6, 0, -Math.sin(a) * 0.8], scale: [1.2, 1.35, 1.2] }));
    }
    // Cặp sừng trâu uốn cong 3D
    for (const s of [-1, 1]) {
      const pts = [
        new THREE.Vector3(s * 0.28, 0.28, -0.05),
        new THREE.Vector3(s * 0.62, 0.24, -0.08),
        new THREE.Vector3(s * 0.78, 0.46, -0.04),
        new THREE.Vector3(s * 0.72, 0.74, 0.02),
      ];
      const curve = new THREE.CatmullRomCurve3(pts);
      head.add(m(new THREE.TubeGeometry(curve, 20, 0.095, 12, false), hornM));
      head.add(m(new THREE.ConeGeometry(0.095, 0.22, 12), hornM, s * 0.70, 0.82, 0.03, { rot: [0, 0, s * 0.25] }));
    }
  } else if (id === 'yone_chibi') {
    // Mặt nạ sừng: màu đo từ ảnh tham khảo yone-ti-ni.jpg bằng median vùng no màu (nạ
    // #b52353, sừng #93204c) rồi nhấc nhẹ vì sảnh tối hơn ánh chính của ảnh; bản nhấc
    // +14 độ sáng render ra hồng kẹo cao su, lạc hẳn đỏ son của ảnh.
    // Hình thù nạ nằm ở makeHeroFaceTex: MỘT phiến sơn liền QUẤN KÍN đầu trên G.wrapMask,
    // bán kính đúng bằng facePatch nên không có mép nào đứng cạnh mép nào. 3D ở đây chỉ
    // còn bờm, hai lọn tóc và sừng - tất cả đều ở ngoài khối đầu.
    const hairM = mat('#2b3047', { roughness: 0.5 });
    const hornM = mat('#93204c', { roughness: 0.3, metalness: 0.18 });
    // Vỏ tóc 3D đã GỠ HẾT. Bản 0.470 cung sau (mép trước ở phương 79,2°) trông như một
    // khối liền nhưng vẫn để lại một đường cong chạy xuống gáy: nó LỒI hơn phiến sơn
    // 0,007 và mép trước nằm TRONG phiến (phiến tới 84,6°), nên nhìn xiên là thấy ngay
    // cái rãnh. Gáy giờ là sơn đen trên đúng tấm wrapMask, không còn surface nào áp vào
    // surface nào. Mũ tóc 0.494 lệch sau 0,14 trước đó còn tệ hơn: mặt trước tụt vào
    // trong khối đầu tới theta 25,7° giữa trán nên đỏ lòi kín nóc thành mũ bảo hiểm.
    // Mái vuốt sang một bên + bờm sau gáy. Bờm phải nằm phía SAU đầu (z dương) và
    // ngả ra sau: đặt ở z -0.10 là mũi spike (dài 0.42, bán kính đầu 0.46) vọt ra
    // ngoài vỏ nạ và cắt ngang trán thành những răng cưa đen.
    for (let i = 0; i < 5; i++) {
      head.add(m(G.spike, hairM, -0.30 + i * 0.16, 0.34 - i * 0.02, 0.12 + (i % 2) * 0.14, { rot: [0.5, 0, 0.62 - i * 0.1], scale: [0.8, 1.15, 0.8] }));
    }
    // Hai lọn tóc dài rủ xuống hai bên vai, đúng chỗ ảnh để tóc: sát thái dương, hơi
    // nghiêng ra ngoài. Bắt đầu dưới y 0,06 để gốc chìm trong khối đầu, không lơ lửng.
    for (const s of [-1, 1]) {
      head.add(m(new THREE.CapsuleGeometry(0.072, 0.52, 6, 10), hairM, s * 0.34, -0.20, 0.02, { rot: [0.06, 0, s * 0.16] }));
    }
    // Ngọn tóc hồng: chấm magenta ở đuôi hai lọn, không phải một que rời nổi lên giữa lưng
    const tipM = mat('#de3d91', { roughness: 0.45, emissive: '#92235d', emissiveIntensity: 0.35 });
    for (const s of [-1, 1]) {
      head.add(m(new THREE.ConeGeometry(0.072, 0.20, 8), tipM, s * 0.38, -0.60, 0.04, { rot: [Math.PI + 0.06, 0, s * 0.16] }));
    }
    // Vành trán + hai má che 3D đã GỠ. Đó là ba mảnh vỏ cầu đính ở 0.487/0.484, tức
    // LỒI hơn phiến sơn 0.463 tới 0,024: mỗi chỗ giáp để lại một gờ sáng nhìn rõ như
    // mặt nạ ghép từ nhiều tấm, và khi hai mảnh cùng bán kính áp biên vào nhau thì vỏ
    // cầu không có độ dày nên nhìn xiên qua khe thấy thẳng khối da 0.46 - cái rãnh mà
    // user gọi là "không liền mạch". Nạ giờ là một tấm sơn duy nhất (G.wrapMask), còn
    // 3D chỉ việc đội tóc và cắm sừng.
    // Sừng: ảnh có HAI chiếc to mọc từ thái dương vút LÊN, chỉ chếch ra ngoài ~32° chứ
    // không xoè ngang (bản rot z -s*0.84 = 48° bị chê là đưa ra hai bên quá nhiều), kèm
    // hai chóp phụ ngắn trong khe tóc giữa trán. Cone mũi +y; với rot [-0.30, 0, -s*0.55]
    // thì trục sừng = (±0.523, 0.814, -0.252) - đã quay vector thật bằng three để kiểm.
    // GỐC bám đúng vào phần nạ ĐỎ, không vào tóc: gốc ở theta 25°, phương vị 48° - tức
    // ngay chóp cánh nạ (biên tóc ở đó là theta 11,9°) - |p| = 0,450 nên lẹm vào trong
    // khối đầu 0,46. Bản trước gốc ở theta 35,6° nhưng phương vị 61,3°, rơi trọn vào vùng
    // tóc nên sừng bị một dải đen chia cắt khỏi nạ. Chóp phụ ở theta 36°/phương 38°, biên tóc
    // chỗ đó theta 29,6° nên cũng nằm trên đỏ. To đã giảm 0,15x0,80 -> 0,125x0,66 theo
    // yêu cầu "nhỏ lại một tí"; scale z ép thành lưỡi dẹt để chính diện thấy bề ngang như ảnh.
    for (const s of [-1, 1]) {
      head.add(m(new THREE.ConeGeometry(0.125, 0.66, 5), hornM, s * 0.3139, 0.6765, -0.2104, { rot: [-0.30, 0, -s * 0.55], scale: [1, 1, 0.45] }));
      head.add(m(new THREE.ConeGeometry(0.08, 0.30, 5), hornM, s * 0.2072, 0.5033, -0.2425, { rot: [-0.24, 0, -s * 0.30], scale: [1, 1, 0.42] }));
    }
  } else if (id === 'leesin_chibi') {
    // TÓC BẠC 3D - vay CÁCH LÀM của Sương Bạc (nhánh `kakashi` trong chính hàm này): một vỏ cầu đội
    // trên đầu rồi găm G.spike lên nó. Mấu chốt của cách ấy là vỏ bị LÙI về sau (z dương):
    // ở cao độ ngang mặt nó nằm SAU phiến sơn 0,463 nên không che dải bịt, còn trên đỉnh
    // và hai bên thì nó nhô ra ngoài thành khối.
    //
    // Bản trước đội vỏ R 0,520 và ảnh ra một cái MŨ BẢO HIỂM trơn: bán kính to hơn đầu
    // 13% nên chính diện thấy đúng một vòm liền, 16 gai găm trên đó bị chìm thành một cái
    // lược nhỏ. Bài học: ở kích thước 144px, THỨ tạo silhouette phải là GAI, không phải vỏ.
    // Vì vậy vỏ rút về 0,480 (chỉ hơn đầu 0,020 - đủ để không lộ da trần giữa các gốc gai,
    // và lùi tâm 0,055 về sau để mặt trước của nó ở cao độ dải bịt vẫn sau phiến sơn:
    // tại y 0,163 vỏ cho z = -sqrt(0,480² - 0,163²) + 0,055 = -0,405, phiến ở -0,433, sơn
    // thắng 0,028). Silhouette giờ do 17 gai + 6 lọn dải lụa quyết định.
    //
    // "To lên" = DÀY chứ không phải DÀI: G.spike có đáy 0,15, nhân lên 1,1..1,65 thành
    // 0,165..0,248 - mỗi chiếc rộng gần bằng một phần tư bề ngang đầu nên đọc thành từng
    // KHỐI tóc, không phải từng que. Chiều dài giữ 0,28..0,46 để ngọn ra tới bán kính
    // 0,74..0,87, tức cụm tóc gấp ~1,8 lần khối đầu - đúng tỉ lệ bờm trong ảnh.
    // MỘT MÀU BẠC DUY NHẤT: bản cũ chia hai - thân gai #e2e8f0 và gốc/lọn #959ec3 - nên ở
    // 144px mái tóc ra hai tầng sáng, phần gốc đọc như một chiếc mũ len xám phủ lên. #959ec3
    // là median vùng gốc đo được, nhưng nó là tóc TRONG BÓNG (phần phiến sơn lo tối), còn
    // khối 3D thì đèn chánh điện chiếu thẳng. Vì vậy 3D chỉ dùng #e2e8f0 = đúng chất liệu bờm
    // Sương Bạc, và để phần đậm nhạt do đèn tự làm.
    const hairM = mat('#e2e8f0', { roughness: 0.45 });
    head.add(m(new THREE.SphereGeometry(0.480, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.52), hairM, 0, 0.03, 0.055));
    // 17 gai, mỗi chiếc đặt bằng số chứ không đoán: gốc nằm trên vỏ 0,46 theo (theta,
    // phương vị), trục = pháp tuyến tại đó TRỘN với hướng −x (phải khung nhìn) theo hệ số
    // sweep - đó chính là nét vuốt của bờm. rot = [rx, 0, rz] giải từ trục ấy bằng
    // dx = -sin rz, dy = cos rz cos rx, dz = cos rz sin rx (Euler XYZ của three là
    // Rx(Ry(Rz(v)))). Script sinh + bộ kiểm "gai nào rơi vào cửa sổ dải bịt (theta 68..112,
    // |az| < 56) mà lồi hơn phiến 0,463" chạy trước khi render; kết quả: 0 vi phạm.
    // (a) TÁN ĐỈNH 7 chiếc quét trái->phải, (b) MÁ PHẢI khung nhìn 3, (c) MÁ TRÁI 3,
    // (d) GÁY 4. Nhóm (b)(c) ở |az| 78..104 - ngoài phiến sơn nên xuống thấp cũng không che.
    const SPIKES = [
      // x, y, z,      rx,     rz,     sx,   sy,   sz
      [-0.094, 0.636, -0.088, -0.138, 0.425, 1.55, 0.952, 1.40],
      [-0.212, 0.606, -0.135, -0.219, 0.721, 1.65, 1.048, 1.49],
      [-0.322, 0.563, -0.121, -0.211, 0.936, 1.55, 1.095, 1.40],
      [-0.387, 0.509, -0.063, -0.123, 1.076, 1.40, 1.000, 1.26],
      [-0.012, 0.629, -0.140, -0.218, 0.217, 1.45, 0.905, 1.31],
      [0.057, 0.605, -0.160, -0.258, 0.221, 1.35, 0.857, 1.22],
      [0.138, 0.574, -0.132, -0.225, 0.240, 1.30, 0.810, 1.17],
      [-0.495, 0.417, -0.070, -0.166, 1.119, 1.40, 0.952, 1.26],
      [-0.560, 0.303, 0.017, 0.056, 1.234, 1.25, 0.857, 1.13],
      [-0.583, 0.175, 0.112, 0.569, 1.326, 1.15, 0.762, 1.04],
      [0.421, 0.468, -0.101, -0.212, -0.568, 1.30, 0.857, 1.17],
      [0.536, 0.330, 0.020, 0.060, -0.942, 1.20, 0.810, 1.08],
      [0.566, 0.174, 0.147, 0.701, -1.146, 1.10, 0.714, 0.99],
      [-0.432, 0.262, 0.373, 0.959, 0.909, 1.25, 0.810, 1.13],
      [-0.270, 0.123, 0.530, 1.342, 0.615, 1.15, 0.714, 1.04],
      [0.384, 0.272, 0.388, 0.959, -0.612, 1.15, 0.714, 1.04],
      [0.228, 0.126, 0.540, 1.342, -0.327, 1.05, 0.667, 0.95],
    ];
    SPIKES.forEach((s) => {
      head.add(m(G.spike, hairM, s[0], s[1], s[2], { rot: [s[3], 0, s[4]], scale: [s[5], s[6], s[7]] }));
    });
    // LỌN RŨ HAI BÊN: bản cũ dùng TubeGeometry nên nó là một cái ống tròn thò ra từ thái
    // dương - user bác. tóc rủ là DẢI: ribbon() ép tiết diện dẹt (flat 0,34) và thuôn
    // nhọn về ngọn (0,062 -> 0,008), đúng cách pets.js vẽ bờm thanh_long. Mỗi lọn là một
    // CUNG trên mặt cầu (theta 34->104, bán kính 0,470->0,600) rồi treo tự do: ngọn nằm
    // trọn trong silhouette ở |x| 0,58, phía SAU biên phương vị 57,6° của phiến sơn, nên
    // không lồi lên lớp sơn nào và không để lại gờ bán kính.
    const lockM = mat('#e2e8f0', { roughness: 0.45, side: THREE.DoubleSide });
    for (const pts of [
      [[-0.240, 0.390, -0.107], [-0.320, 0.328, -0.127], [-0.396, 0.254, -0.138], [-0.468, 0.167, -0.141], [-0.532, 0.062, -0.137], [-0.584, -0.063, -0.124]],
      [[-0.314, 0.338, -0.090], [-0.383, 0.265, -0.090], [-0.445, 0.183, -0.082], [-0.497, 0.088, -0.066], [-0.538, -0.019, -0.045], [-0.562, -0.140, -0.020]],
      [[0.240, 0.390, -0.107], [0.320, 0.328, -0.127], [0.396, 0.254, -0.138], [0.468, 0.167, -0.141], [0.532, 0.062, -0.137], [0.584, -0.063, -0.124]],
      [[0.314, 0.338, -0.090], [0.383, 0.265, -0.090], [0.445, 0.183, -0.082], [0.497, 0.088, -0.066], [0.538, -0.019, -0.045], [0.562, -0.140, -0.020]],
      [[-0.205, 0.422, 0.022], [-0.293, 0.370, 0.060], [-0.371, 0.303, 0.113], [-0.436, 0.220, 0.181], [-0.484, 0.116, 0.257]],
      [[0.205, 0.422, 0.022], [0.293, 0.370, 0.060], [0.371, 0.303, 0.113], [0.436, 0.220, 0.181], [0.484, 0.116, 0.257]],
    ]) {
      head.add(m(ribbon(pts, 0.062, 0.008, { seg: 14, rad: 5, flat: 0.34 }), lockM, 0, 0, 0, { cast: false }));
    }
  } else if (id === 'batman_chibi') {
    // TAI NẠ - phần 3D DUY NHẤT trên đầu hình này, vì nó NHÔ ra ngoài vỏ 0,463 chứ không
    // nằm trên vỏ (sơn đã lo hết vải, thêm một vỏ cầu nào ở đây là lại ra cái gờ).
    // Gốc ghim ở |p| = 0,4500 (lẹm vào trong khối đầu 0,46 nên không hở cổ trục):
    //   (0,191; 0,403; -0,060) -> sqrt(0,0365 + 0,1624 + 0,0036) = 0,4500
    //   tức theta 27,1° và lệch trục 24,9° - đúng chỗ cặp tai nhọn trong hoá phục.
    // Trục muốn (±0,26; 0,96; -0,10) (đứng, vểnh ra ngoài 15°, ngả ra sau 6°) giải từ
    // dx = -sin(rz), dy = cos(rz)cos(rx), dz = cos(rz)sin(rx) (Euler XYZ của three là
    // Rx(Ry(Rz(v)))) -> rz = 0,2635, rx = -0,1081.
    // MỘT MÀU VẢI DUY NHẤT: cowlM là đúng '#18181b' mà phiến sơn đang dùng - chia hai
    // mã như bài học tóc bạc của Võ Sư Mù thì ở 144px tai ra một cái mũ khác đầu.
    // Chóp ở local y 0,403 + 0,96*0,20 = 0,595 -> thế giới 2,045, vẫn DƯỚI đỉnh tóc của
    // Võ Sư Mù (2,266) nên khung heroScene cũ lọt nguyên, không phải tính lại.
    const cowlM = mat('#18181b', { roughness: 0.55, metalness: 0.15 });
    for (const s of [-1, 1]) {
      head.add(m(new THREE.ConeGeometry(0.115, 0.40, 5), cowlM, s * 0.191, 0.403, -0.060, { rot: [-0.1081, 0, -s * 0.2635], scale: [1, 1, 0.5] }));
    }
  } else if (id === 'zed_chibi') {
    // KHĂN ĐỎ RỦ XUỐNG = MỘT LAYER 3D RIÊNG (user: "phần vải đỏ rủ xuống ở mũ không phải
    // flat mà là 1 layer riêng"). Sơn chỉ làm được phần NẰM TRÊN vỏ cầu; thứ RỦ xuống dưới
    // biên khối đầu thì phải là mesh.
    // HÌNH DÁNG: một chóp cụt mở 189° quanh LƯNG (CylinderGeometry: theta 0 là +z = sau gáy,
    // x = r sin, z = r cos) — chừa 171° phía mặt nên mép vải dừng sát hai bên tai; nhìn
    // thẳng ra trước chỉ thấy một viền đỏ mảnh ló khỏi silhouette đầu, không thấy bản vải.
    // VÌ SAO KHÔNG CÓ ĐƯỜNG RÃNH NỐI: miệng trên bán kính 0,42 ở head-local y +0,10 nằm
    // TRONG khối đầu 0,46 (bán kính lát cắt ở cao độ đó là sqrt(0,46² - 0,10²) = 0,449),
    // nên viền trên bị chính khối đầu che kín — không có mép nào áp vào vỏ 0,463 của phiến
    // sơn. Vải chỉ LỘ ra khi nó vượt vỏ: giải 0,4314 - 0,11429y = sqrt(0,2116 - y²) ra
    // y = -0,12, tức đúng chỗ khăn rời khỏi gáy - cũng là nơi phiến sơn bắt đầu đỏ.
    // VÌ SAO KHÔNG PHẢI CÁI CHỤP ĐÈN: bản 0,44->0,56 cao 0,80 (rủ tới head-local -0,70,
    // |x| 0,56) render từ sau ra một cái loè rộng hơn cả vai và cao hơn cả đầu, còn năm chóp
    // cone dán trên rim thì thành gai lơ lửng, vì cone 4 cạnh nằm NGANG rim chứ không rủ
    // DỌC theo vải. Gấu lượn phải là chính rim đó dao động, không phải vật thứ hai gắn lên
    // rim: mỗi đỉnh ring dưới dịch y theo 0,07*cos(5a), a là góc tính từ sau gáy, chu kỳ 72°
    // nên dải 189° có năm thùy. Đỉnh thấp nhất -0,67, cao nhất -0,53 head-local, đáy khối
    // đầu -0,46: chỗ khum lên vẫn được cằm che nên không có miếng vải lửng lơ.
    // computeVertexNormals sau khi dịch là bắt buộc: rim lượn mà pháp tuyến cũ chỉ ngang thì
    // dải vải nhận sáng đều khắp và render ra một khối nhựa đỏ, không còn nếp.
    // CÙNG MỘT HEX VẢI với phiến sơn (#5e1319 = median khăn đo trong ảnh, sat 75 hue 355,
    // 180 px; bước 3 makeHeroFaceTex) và với giáp cầu vai: chia hai mã là ở 144px khăn ra
    // một màu khác áo. DoubleSide vì chóp cụt mở — nhìn từ sau xuống sẽ thấy
    // mặt trong của khăn, một vỏ cụt phía trong thì thành hai surface sát nhau.
    const clothM = mat('#5e1319', { roughness: 0.85, side: THREE.DoubleSide });
    const skirt = new THREE.CylinderGeometry(0.42, 0.50, 0.70, 24, 1, true,
      -Math.PI * 0.525, Math.PI * 1.05);
    const rim = skirt.attributes.position;
    for (let i = 0; i < rim.count; i++) {
      if (rim.getY(i) > 0) continue;                     // chỉ ring dưới; ring trên bị đầu ẩn
      rim.setY(i, rim.getY(i) + 0.07 * Math.cos(5 * Math.atan2(rim.getX(i), rim.getZ(i))));
    }
    rim.needsUpdate = true;
    skirt.computeVertexNormals();
    head.add(m(skirt, clothM, 0, -0.25, 0, { cast: false }));
    // GIÁP VÀNG NỔI KHỐI (user: "phần giáp V (gold) trên mũ cho nổi khối lên thay vì flat").
    // Đây KHÔNG phải cái gai giữa trán mà vòng này đã bác: bác là đúng, vì nó nói về một
    // KHỐI RỜI (cone/box) dán áp lên vỏ ở đỉnh cánh theta 57. Ở đây không có khối nào cả -
    // chính vỏ cầu được thổi lên 0,032 theo đúng biên ZED_CROWN + ZED_VB, nên đỉnh cánh nằm
    // trọn trong khối đầu vẫn chỉ là một chỗ phồng của cái mũ, không có mặt nào áp mặt nào.
    // r 0,4645 chứ không 0,463: vành bevel giờ nằm trong biên, nên hàng ĐỈNH NGOÀI CÙNG của
    // lưới có mask = 0 và đặt đúng ngay trên nét sơn. Hai surface đồng tâm thì z-fight thành
    // vân rắn. 0,0015 trên bán kính 0,463 = 0,3% lớp vỏ, mắt không đọc được bậc, nhưng đủ để
    // phiến vàng LUÔN ở trên nét sơn.
    // step 1,0 độ (10.686 đỉnh, 33 ms MỘT LẦN vì reliefCache giữ theo toạ độ, mọi avatar
    // trong sảnh dùng chung lưới): biên của phiến là thứ duy nhất người xem thấy, và lưới
    // 1,5 độ dựng nó thành bậc cấp ngay trên nét sơn mượt.
    // Cùng hex/cùng thông số với cuffM của lưỡi kiếm (mat cache theo color+opts nên thật ra
    // là MỘT instance): vàng của hình này chỉ có một bậc kim loại.
    const goldM = mat('#cf9561', { metalness: 0.85, roughness: 0.3 });
    const plate = reliefShell([ZED_CROWN.concat(mir(ZED_CROWN)), ZED_VB.concat(mir(ZED_VB))],
      { r: 0.4645, h: 0.032, bevel: 3.5, step: 1.0 });
    head.add(m(plate, goldM, 0, 0, 0, { cast: false }));
  } else if (id === 'irelia_chibi') {
    // KIEM CAI TOC - 3D chi dung cho ba thu SON KHONG VOI TOI: khoi toc, hai luoi ngan
    // cam len dau, va vong bac tren tran. Thu nam TRONG bong dau (long may, bong mat,
    // hong, mieng) da o buoc son, ve lai thanh mesh la hai surface dong tam.
    //
    // QUY UOC TOA DO (nguon: reliefShell :1458, dung voi G.facePatch):
    //   x = -r*sin(az)*sin(th),  y = r*cos(th),  z = -r*cos(az)*sin(th)
    // az 0 = mat truoc (-z), th 0 = dinh dau. Moi diem duoi day sinh tu (az, th, r) chu
    // khong phai ba toa do do mat, nen doi ban kinh la doi ca ba truc cung luc.
    const D2R = Math.PI / 180;
    const sph = (az, th, r) => [
      -r * Math.sin(az * D2R) * Math.sin(th * D2R),
      r * Math.cos(th * D2R),
      -r * Math.cos(az * D2R) * Math.sin(th * D2R),
    ];
    // TOC - VOM CAU KHONG PHAI BAN IN KHOI DAU. Ca 12 hinh da ship dung vom 0,47 tam
    // (0,04,0,02) vi o ho toc la nhung lot ribbon DE LEN vom, nen mép vom an sau trong
    // toc va khong ai nhin thay no. Irelia la hinh dau tien co toc tron: mép vom CHINH
    // LA duong chan toc. Giai |P(az,th,0,463) - (0,04,0,02)| = 0,47 cho theta 69,8 o az 0
    // va 71,2 o az 20,25 trong khi dinh hong mat da o 72,4 -> vom an SACH tran. Render
    // vong 1 la mot doi may den bo ngang mat: khong phai do mau, do do chieu CAO.
    //
    // Hai mat cau cat nhau theo MOT VONG TRON nam trong mat phang vuong goc noi tam:
    //   cy*cos(th) - cz*cos(az)*sin(th) = k,  k = (|C|^2 + 0,463^2 - R^2) / (2*0,463)
    // Muon duong cat DANG CAO o tran thi vom phai NHO hon va DICH LEN, khong phai to hon
    // (vom 0,47 lech 0,04 chi cat o 69,8 va khong the nao cao hon ~70). Chon
    // C = (0, 0,074, 0,06), R = 0,4662 -> k = 0,006591 va:
    //   az  0 -> th 47,0    az 20 -> 48,7    az 36 -> 52,5    az 46 -> 56,2
    //   az 57,6 (mep phiến) -> 61,9   az 90 -> 84,9   az 180 (gay) -> 125,0
    // Lech tam +z 0,06 la thu lam mép TUI XUONG dan khi ra khoi kinh tuyen giua: tran lo
    // 25 do (47 -> hong mat 72,2 = dung ti le anh, tran 0,8 lan chieu cao hong mat), con
    // sau gay toc che den tan theta 125 - mot chiec bob, khong phai mot cai mu.
    // Dinh vom y = 0,074 + 0,4662 = 0,5402 = cao hon dinh dau 0,077 (17% ban kinh dau).
    // thetaLength 140 do: vong rim cua vom o local 140 nam tai y = -0,283 voi ban kinh
    // ngang 0,2998, nho hon dau 0,3662 cung do cao -> rim an hoan toan trong dau.
    const HC = [0, 0.074, 0.06], HR = 0.4662, HTH = 140;
    // Net toc LA SON, khong phai lot 3D (bon lot r 0,480-0,496 cua ban truoc render ra
    // nam con giun bo qua mat). Son tren chinh vom => khong them surface nao.
    // UV cua SphereGeometry: x = -R*cos(phi)*sin(th_l), y = R*cos(th_l), z = R*sin(phi)*
    // sin(th_l); phi = az - 90 khi tam trung voi tam dau, con o day tam lech nen PHAI
    // quy doi qua tia: tim diem vom cat tia (az,th), doi ra goc cuc bo cua chinh no.
    const hairTex = (() => {
      if (typeof document === 'undefined') return null;
      const W = 1024, H = 512;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      const T = (az, th) => {
        const a = az * D2R, t = th * D2R;
        const dx = -Math.sin(a) * Math.sin(t), dy = Math.cos(t), dz = -Math.cos(a) * Math.sin(t);
        const b = HC[1] * dy + HC[2] * dz;
        const rho = b + Math.sqrt(b * b + HR * HR - HC[1] * HC[1] - HC[2] * HC[2]);
        const tl = Math.acos((rho * dy - HC[1]) / HR) / D2R;
        let pl = Math.atan2(rho * dz - HC[2], -rho * dx) / D2R;
        if (pl < 0) pl += 360;
        return [pl / 360 * W, tl / HTH * H];
      };
      g.fillStyle = '#2c1957'; g.fillRect(0, 0, W, H);            // median 378px toc toi
      // Nguoi toi ngay duoi dinh: vom o dinh nam doc theo truc Y nen it huong ve den key
      // nhat - do la cho den toi nhat trong anh (#221549).
      const cap = g.createLinearGradient(0, 0, 0, 0.22 * H);
      cap.addColorStop(0, '#221549'); cap.addColorStop(1, 'rgba(34,21,73,0)');
      g.fillStyle = cap; g.fillRect(0, 0, W, 0.22 * H);
      // NET: 13 soi moi ben, xoe ra tu ngoi gia o az 0 den sau gay (az 167).
      const strand = (az0, th0, az1, th1, w, color, alpha) => {
        g.strokeStyle = color; g.lineWidth = w; g.globalAlpha = alpha; g.lineCap = 'round';
        g.beginPath();
        let prev = null;
        for (let i = 0; i <= 16; i++) {
          const t = i / 16, e = t * t * (3 - 2 * t);              // smoothstep: cham o goc
          const p = T(az0 + (az1 - az0) * e, th0 + (th1 - th0) * t);
          let x = p[0];
          if (prev !== null) { while (x - prev > W / 2) x -= W; while (prev - x > W / 2) x += W; }
          if (i === 0) g.moveTo(x, p[1]); else g.lineTo(x, p[1]);
          prev = p[0];
        }
        g.stroke();
      };
      for (const s of [-1, 1]) for (let k = 0; k < 13; k++) {
        const a1 = s * (5 + k * 13.5);
        // Xuat phat cua soi dat o VONG theta 11 chu khong tai dinh (theta 3): UV cua
        // SphereGeometry ep ca mot kinh tuyen lai thanh MOT DIEM o dinh nen moi net
        // tu quy ve do render ra qua bong banh beo. Dich goc ra az 8-14 va theta 11 thi
        // vong goc rong ~0,03 va cac soi van chuyen tu ra nhu anh.
        strand(s * (8 + (k % 3) * 3), 11, a1, 95, 5 + (k % 3) * 2, '#422f6a', 0.5);
        if (k % 2 === 0) strand(s * (10 + (k % 3) * 3), 12, a1 + s * 4, 90, 3, '#533c8c', 0.4);
      }
      strand(0, 10, 0, 46, 8, '#221549', 0.7);                     // khe ngoi gia
      // MEP TOC CHU KHONG PHAI MEP VOM: vom cat mat o mot vong tron deu, con anh co
      // duong chan toc CHU M - chóp giua (widow's peak) thap nhat, hai khe nang len o
      // az 16-26, roi hai thuy toc lai tui xuong ben mang tai. Khe la phan CAT DI bang
      // alpha; phan them vao khong the nao lam duoc vivom da o trong dau duoi duong cat.
      const FRINGE = [[0, 47], [8, 44], [16, 42], [26, 40], [36, 46], [46, 58], [58, 100], [70, 180]];
      const FR = (a) => {
        const x = Math.min(70, Math.abs(a));
        for (let i = 1; i < FRINGE.length; i++) {
          if (x <= FRINGE[i][0]) {
            const [x0, y0] = FRINGE[i - 1], [x1, y1] = FRINGE[i];
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
          }
        }
        return 180;
      };
      // VIEM TIM SANG ngay tren mép (do #dac8ff o day trong anh): ve TRUOC khi cat de no
      // bi chinh duong cat cat gon - mot duong sang nam SAT mép toc, khong phai dai.
      g.globalAlpha = 0.5; g.strokeStyle = '#8f76c9'; g.lineWidth = 11; g.lineJoin = 'round';
      g.beginPath();
      for (let az = -70; az <= 70; az += 2) { const p = T(az, FR(az) - 5); if (az === -70) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]); }
      g.stroke();
      g.globalAlpha = 1; g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
      g.beginPath();
      g.moveTo(T(-70, 178)[0], H);
      for (let az = -70; az <= 70; az += 1) { const p = T(az, FR(az)); g.lineTo(p[0], p[1]); }
      g.lineTo(T(70, 178)[0], H); g.closePath(); g.fill();
      g.globalCompositeOperation = 'source-over';
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    head.add(m(new THREE.SphereGeometry(HR, 48, 30, 0, Math.PI * 2, 0, HTH * D2R),
      new THREE.MeshStandardMaterial({ map: hairTex, roughness: 0.52, transparent: true }), 0, HC[1], HC[2]));
    // HAI LON TOC OM MA: vom chi an den theta 58 o az 50, trong anh toc con di xuong
    // tan ham ben do - do la thu RỦ duoi duong cat nen phai la mesh. Lot bat dau o
    // DUNG mép (az 50, th 58 nam tren vong cat: k = 0,074cos58 - 0,06cos50 sin58
    // = 0,00659 ✓) va luon theo mat ngoai cua vom, nen goc lot an vao toc chu khong
    // noi loi thanh khop. Az 50 -> 62: ngoai vuong cua phiến (57,6) nen tu mat thuong
    // chi con thay chiec lua xuong duoi, khong thay dau lot.
    const lock = (pts, w, seg = 16) => ribbon(pts.map(([a, t, r]) => sph(a, t, r)), w, 0.006,
      { seg, rad: 7, flat: 1.8 });
    const hairM = mat('#2c1957', { roughness: 0.52 });
    // LON MAT = STRAND CHU KHONG PHAI MEDIAN: vom son #2c1957 (median 378px) la phan
    // TOI cua toc, con hai lon truoc nam o duoi den key va trong anh do la phan sang
    // nhat (#422f6a = median net toc sang, xem strand() o tren). Ban #2c1957 render hai
    // lon thanh hai vet NUA mat o ham (/tmp/ill-shot9/front.png), khong phai toc.
    const lockM = mat('#422f6a', { roughness: 0.45 });
    for (const s of [-1, 1]) {
      // DAI den tan ham (theta 130 thay vi 120) va MON (0,042 thay vi 0,052): anh co hai
      // lot toc mong chui xuong ben ham, khong phai hai khoi tron nam ngang tam mat.
      head.add(m(lock([[s * 50, 58, 0.466], [s * 60, 80, 0.492], [s * 64, 104, 0.505], [s * 60, 130, 0.480]], 0.042), lockM, 0, 0, 0));
      // DUOI TOC quat ra sau-ben (az 74 -> 174): tu truoc chi thay hai khoi tron hai ben
      // dau, tu ben thay duoi phia sau - do la bob trong anh, khong phai hai lot roi rac.
      head.add(m(lock([[s * 74, 92, 0.500], [s * 112, 96, 0.560], [s * 146, 106, 0.600], [s * 174, 120, 0.566]], 0.062, 20), hairM, 0, 0, 0));
    }
    // VONG KIEM TREN TRAN = reliefShell: cung mot tham so hoa (az,th) voi phiến nen no
    // la VO DUOC THOI LEN, khong phai mat thu hai song song voi vo (bat bien 1 cua skill).
    // Anh: vong la mot dai BAC V - hai canh duoi quy ve ngon giua tram ngay tren song
    // mũi, va dai luon mong dan khi ra gan kinh tuyen. Do tren anh goc: ngon khien roi
    // den y 232 trong khi tam hong mat 220 (tuc NGANG TAM MAT, nua duoi cua dai nam
    // giua hai mat), canh ben tan x 200 va 290 (rong bang 0,9 lan cach hai tam mat).
    // Quy ra tam: ngon (0, 74) = dung mi tren hong mat 72,4; canh duoi (46, 54); dai
    // 10 do doc suot (canh tren song song canh duoi, khong phai mot tam khien day).
    // r 0,487: diem het suc cua vom SAU khi cat mép la (az 26, th 40) cach tam dau
    // 0,4790 (quet toan bo bien bang Node) => thoat 0,008, du cho khong z-fight va van
    // ngoi tren ca phan toc che cho tran. Day nang len 0,487 + 0,020 = 0,507.
    const IR_BAND = [
      [0, 74], [12, 71], [26, 66], [38, 60], [46, 54],
      [46, 44], [38, 50], [26, 56], [12, 61], [0, 62],
    ];
    // THEP: #b8a6cb la median cua 188 px IT NO MAU NHAT o mui khiên (anh goc, toa do
    // 215..245 x 180..200) - tach mau vat ly khoi ambient tim cua splash. metalness 0,55
    // chu khong 0,85: ban 0,85 render ra mot khoi DEN vi kim loai khong co diffuse, ma
    // vong nam o theta 42..62 tuc ngửa len tren, ngoai huong den key (2,4,-3).
    const steelM = mat('#b8a6cb', { metalness: 0.55, roughness: 0.36 });
    head.add(m(reliefShell([IR_BAND.concat(mir(IR_BAND))], { r: 0.487, h: 0.020, bevel: 3.0, step: 1.0 }),
      steelM, 0, 0, 0, { cast: false }));
    // NGOC GIUA KHIEN: anh co mot mieng tim SAM o dinh khiên (vung 205..250 x 150..175
    // khong con px nao thoa dieu kien "bac sang" - no tim, khong phai bac). Dat giua
    // dai theo phuong doc cua dai o az 0 la theta 62..74 -> tam 68, r 0,512 (day phiến
    // 0,507 + 0,005 de no nho len thanh mot hat that, khong chim vao bac).
    head.add(m(new THREE.SphereGeometry(0.026, 14, 12), mat('#c0b2d4', { metalness: 0.2, roughness: 0.15, emissive: '#644db1', emissiveIntensity: 0.45 }),
      ...sph(0, 68, 0.512), { scale: [1.3, 0.9, 0.5], cast: false }));
    // HAI CANH BAC cua vong kiem: trong anh chung KHONG phai hai cai trâm cam thang len
    // troi. Chung la hai dai moc ra TU GOC NGOAI cua vong bac (az 46..48, theta 44..54 -
    // cung toa do voi IR_BAND nen no noi lien vong, khong noi loi), roi CONG VAO TRONG
    // va LECH LEN PHIA TRUOC: ngon ben cao o (az 30, theta 20) cach mat phang doi xung
    // 0,147 va phia truoc 0,255, tuc ngon nam TREN TRAN chu khong phai tren gay. Do tren
    // anh: ngon cao hon dinh toc 1,57 lan ban kinh dau va lech trong 0,33 lan - hai
    // ngon gom thanh chu V, do la dau an nhan vat.
    // GOC nam o r 0,50 = dung day cua vong bac (0,487+0,020) nen no moc ra tu kim loai,
    // khong phai mot khop noi tren toc.
    // PHIEN PHANG, khong phai ribbon: probe in Box3 theu luoi qua BA lan doi rs/flat cho
    // thay x-span 0,155 vs z-span 0,186 - truc RONG cua ribbon nam doc theo phap tuyen
    // Frenet, ma duong cong nay vuot QUA MAT CAU nen phap tuyen nghieng sang y/z va
    // huong NGANG ra thay vi huong vao may quay. Trong anh hai canh la mat ngua ap thang
    // ve phia nguoi xem, nen cai ribbon khong the ra hinh do -> fin() ty le trong mat
    // phang cua chinh no: A = T x z (RONG, luon nam trong mat phang ngang cua may quay),
    // N = T x A (DAY). Non-indexed => phap tuyen tung tam giac phang, khong bi trung
    // binh mem giua mat truoc va canh ben. DoubleSide vi sau luoi la mat phang khong day.
    // fin() o day chi la BO DIEM toa do: (az,theta,r) -> theu gioi roi thi goi finPlate
    // duy nhat (vong kiem duoi chan cung dung no - hai ban lech nhau la hai mat z-fight).
    const fin = (pts, ws) => finPlate(pts.map(([a, t, r]) => sph(a, t, r)), ws);
    // BE RONG: do crop 0.28,0.06..0.68,0.46 bang ty le 190 img px = 0,92 theu (206 px/theu):
    // CAI QUAT trong canh luoi ~150 crop px = 0,37 theu = 0,185 NUA be o GOC, thuon xuong
    // than luoi 0,041 o 50% chieu dai. Ba ban truoc (0,095 plateau / 0,125 goc) deu ra
    // hinh cai SỪNG vi goc dat sai (xem duoi) chu khong phai vi so rong, nhung 0,185 moi
    // la do that. Station 0-1 giu 0,180 de quat tron ben toc, thuon nhanh 25% dau.
    const IR_FIN_W = [0.180, 0.180, 0.168, 0.150, 0.128, 0.106, 0.086, 0.068, 0.053,
      0.041, 0.031, 0.023, 0.017, 0.011, 0.007, 0.003, 0.001];
    // LUOI = QUAT RO GOC + NGON NHON. Do: qua trong canh luoi median 247px sat<=30 =
    // #f7f1f5 (gan TRANG). metalness 0,25: 0,45 render ra xam dai o shot12 vi kim loai
    // an diffuse. Van con xam la vi LY DO KHAC: phap tuyen tam phang nam doc truc z nen
    // den key (2,4,-3) chi cham mat phang voi N.L = 0,56 - khong the sang hon 56% du
    // albedo = 1,0. Thieu 0,40 nua: emissive #c9c3dd 0,30, do la phan "chop sang" ma
    // hoa si ve tay, khong phai anh cua den.
    const finM = mat('#e8e2f2', { metalness: 0.25, roughness: 0.28, emissive: '#c9c3dd', emissiveIntensity: 0.30, side: THREE.DoubleSide });
    // VONG LECH TAM, khong doi xung - do crop 0.28,0.06..0.68,0.46 (anh goc): ngon ben
    // phai nam TRAI hon goc cua no 28px tren 77px doc = ngheng 20 ve trai; ngon ben trai
    // cung trai hon goc cua no 20px tren 47px = 23, CUNG CHIEU. Hai luoi ngheng ve mot
    // phia = vong kiem dang quay, dau an nhan vat. Ban doi xung (ca hai cong vao giua,
    // az 48->36 va -50->-43) render ra hai cai CORN o /tmp/ill-shot9/front.png. May quay
    // nam o -z nen trai = +x: az GIAM o ben az + (30 < 48), |az| TANG o ben az - (70 > 50).
    // GOC o az 60, KHONG phai 46-55: do anh goc, qua trong canh luoi nam o x -0,30..-0,53
    // tuc SAT mang tai. Ba ban dat goc az 48-52 nen tam luoi nam tren tran va hai cai
    // moc len thang nhu tai (shot10/11/12). Voi goc az60 th54 r0,50: x = -0,350, T gan
    // +y nen A = T x z gan +x -> phieng duoi x -0,53..-0,17; phan trong hon -0,428 bi
    // khoi dau an mat, dung cach cai quat trong anh bi toc che lap.
    // Ngon (36,15,0.84): y = 0,81 = 1,76 lan ban kinh dau; lech x -0,350 -> -0,163 tuc
    // 19 do ve trai, khop do 20 o crop. (Do luoi ben trai NGAN HON 0,72 lan o day da bi
    // bac bo - xem "HAI BEN NHU HET NHAU" duoi: do la phoi canh trong anh, khong phai
    // kich thuoc that.)
    // GOC HA xuong th 58 r 0,48 (shot13 dat th 54 r 0,50 nen day quat nam CAO HON dau
    // dai bac va lo mot khe hong giua kim loai voi kim loai): day quat now o ngay dau
    // dai, chong len nhau 0,02 nen khong con khe, cung cach do dai 0,487+0,020.
    // QUAT NHIEU TANG: crop cho thay cai quat khong phai MOT tam - co 2-3 ngon chong
    // le nhau (ngon nho ben trong ngon lon, cung do ngheng). Them mot luoi PHU 0,55 lan
    // be, ngon ngan hon (r 0,68 vs 0,84) dat sau luoi chinh 6 do az. Mot tam tron duoi
    // van ra cai canh la, khong phai vong kiem.
    // HAI BEN NHU HET NHAU (user: "hai mieng sat cai tren dau kich thuoc phai nhu nhau").
    // Ban cu ghi 0,72 lan cho canh trai vi do tren ANH GOC - do la phoi canh cua hoa si
    // (ngon ben trai bi toc va goc nhin an mot phan), khong phai hai cai quat be khac
    // nhau. Tren khoi 3D thi nguoi xem quay quanh va bat chu ngay: mot ben lon hon ben
    // kia = loi model. Nen L = R cung IR_FIN_W, cung 5 station, cung r 0,48 -> 0,84; chi
    // KHAC chieu ngheng (xem VONG LECH TAM o tren: R az 62 -> 36, L az -62 -> -88, ca hai
    // deu di -26 do quanh truc y = cung mot chieu quay). Fit: hai ngon ra world
    // y 2,261 z -0,103 giong het nhau, nen do khong may anh cua o thumbnail khong doi.
    // Luoi PHU cung vay: 0,55 lan cho ca hai ben, ngon ngan hon (r 0,68), sau luoi chinh
    // 14 do az ve cung chieu quay.
    const IR_FIN_W_L = IR_FIN_W.map((w) => w * 0.55);
    head.add(m(fin([[62, 58, 0.48], [58, 46, 0.58], [50, 34, 0.68], [42, 23, 0.77], [36, 15, 0.84]], IR_FIN_W),
      finM, 0, 0, 0, { cast: false }));
    head.add(m(fin([[-62, 58, 0.48], [-66, 46, 0.58], [-74, 34, 0.68], [-82, 23, 0.77], [-88, 15, 0.84]], IR_FIN_W),
      finM, 0, 0, 0, { cast: false }));
    head.add(m(fin([[68, 62, 0.46], [66, 52, 0.54], [60, 42, 0.62], [54, 34, 0.68]], IR_FIN_W_L),
      finM, 0, 0, 0, { cast: false }));
    head.add(m(fin([[-68, 62, 0.46], [-70, 52, 0.54], [-76, 42, 0.62], [-82, 34, 0.68]], IR_FIN_W_L),
      finM, 0, 0, 0, { cast: false }));
  } else if (id === 'ahri_chibi') {
    // CAO DUOI TRANG - buoc 3. 3D chi cho nhung thu lop son khong voi toi: (a) vom toc,
    // (b) hai TAI CAO nho ra ngoai vo, (c) hai LON OM MAT roi ngon xoe ra ngoai, (d) mui
    // lon sau lung. Chan toc / ngoi gia / loi toc sau / vuot má / mieng da o buoc son
    // tren phiến 512 - ve lai thanh mesh la hai surface dong tam (bat bien 1).
    //
    // VOM TOC VONG 9 - PHAN QUYET 2026-11-13 "toc KHONG dung lai cua Irelia, lam lai
    // theo anh tham chieu". Bỏ ba so cua Irelia (C 0;0,074;0,06 / R 0,4662 / thL 140) vi
    // chung render thanh CAI NON BO HE (ahr29/front.png), hai loi goc:
    //   1. vom chi le phien mat 3 mm nen be ngang toc = be ngang mat: dau tron lỳ, khong
    //      co "toc day hon dau" nhu anh (do tren /tmp/ahr-head-crop2.png: 394/292 = 1,35).
    //   2. duong chan toc la GIAO TUYEN HAI MAT CAU, ma giao tuyen hai mat cau nam trong
    //      mat phang vuong goc noi tam NEN LUON DOI XUONG QUA G - bo ba so cua Irelia cat
    //      nhau o az 0 -> theta 47 va khong the nao lech ben. Bang mai quat qua mot ben
    //      cua Ahri la dieu BAT KHA THI voi mot vom cat sat phien.
    // Cach: vom TO va THAP hon de giao tuyen tui xuong duoi chan toc muon ve, va luc do
    // bien ALPHA cua lop son - khong phai vom - CHINH LA duong chan toc. Bien alpha la
    // mot duong cong bat ky nen quat duoc qua ben trai. Vong 9 (/tmp/ahri-cap.mjs):
    //   C = (0, 0,055, 0,055), R = 0,485, S = (1,09, 1,00, 1,05), thetaLength 163 do.
    //   be ngang 0,529 / be mat phien 0,781 = ti le 1,35 = dung ti le do tren anh.
    //   DINH vom theu y 1,980: bang het vom cu, nen so lieu cua quat duoi o buoc 169
    //   van dung (ngon toc cao nhat 1,647 van cach dinh toc 335 mm).
    //   rim 163 do: max |p| 0,457 < dau 0,460 -> AN hoan toan trong dau, khong co mép.
    //   GIAO TUYEN vom/phien (az -> theta): 0:77,5  15:80,3  25:85,0  35:92,0  45:100,0
    //     57,6:110,8  70:120,0  90:131,8  180:149,3. Duoi duong nay vom nam SAU phien
    //   (lop toc az 0 th 80 = -2 mm) nen phien an no; TREN duong nay vom nam TRUOC phien
    //   7..17 mm (th 70 -> 7 mm, th 60 -> 17 mm), tuc bang mai NAM SAT DA tran dung nhu
    //   anh, va son quyet dinh chan toc o moi az muon.
    const D2R = Math.PI / 180;
    const sph = (az, th, r) => [
      -r * Math.sin(az * D2R) * Math.sin(th * D2R),
      r * Math.cos(th * D2R),
      -r * Math.cos(az * D2R) * Math.sin(th * D2R),
    ];
    const HC = [0, 0.055, 0.055], HR = 0.485, HS = [1.09, 1.00, 1.05], HTH = 163;
    const INV = HS.map((s) => 1 / (s * s));
    const hairTex = (() => {
      if (typeof document === 'undefined') return null;
      const W = 1024, H = 512;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      // (az,theta) tren mat cau DAU -> (u,v) tren vom ELLIPSOID. Vom vua lech tam vua
      // giang theo tung truc nen khong doi thang duoc: ray tu tam dau cat vom tai rho,
      // phai doi (rho*d - C)/S ra toa do ban kinh TRUOC khi doc goc cuc bo. Voi S = 1
      // ba dong duoi thu ve dung cong thuc vom tron cua Irelia (kiem tra bang cach do).
      const T = (az, th) => {
        const a = az * D2R, t = th * D2R;
        const dx = -Math.sin(a) * Math.sin(t), dy = Math.cos(t), dz = -Math.cos(a) * Math.sin(t);
        const A = dx * dx * INV[0] + dy * dy * INV[1] + dz * dz * INV[2];
        const B = HC[0] * dx * INV[0] + HC[1] * dy * INV[1] + HC[2] * dz * INV[2];
        const Cq = HC[0] * HC[0] * INV[0] + HC[1] * HC[1] * INV[1] + HC[2] * HC[2] * INV[2] - HR * HR;
        const rho = (B + Math.sqrt(B * B - A * Cq)) / A;
        const qx = (rho * dx - HC[0]) / HS[0], qy = (rho * dy - HC[1]) / HS[1];
        const qz = (rho * dz - HC[2]) / HS[2];
        const tl = Math.acos(qy / HR) / D2R;
        let pl = Math.atan2(qz, -qx) / D2R;
        if (pl < 0) pl += 360;
        return [pl / 360 * W, tl / HTH * H];
      };
      // MAU DO TUNg vung tren anh (/tmp/ahr-pal.mjs, median): khoi toc #2d2d52, ben mat
      // #30446e, ngon thoe #3b4576, toc sau toi nhat #28203b / #362846, dai bong tren
      // bang mai #676388, dinh gom #474c79. Nang them kenh xanh duoi luc son vi den
      // sảnh lam mat xanh (bat bien mau cua skill): duoi luc #2b3a68 la khoi, #161a34 la
      // goc, #4a5c9a la soi, #5f68a0 la bong.
      g.fillStyle = '#2b3a68'; g.fillRect(0, 0, W, H);
      const cap = g.createLinearGradient(0, 0, 0, 0.26 * H);
      cap.addColorStop(0, '#161a34'); cap.addColorStop(1, 'rgba(22,26,52,0)');
      g.fillStyle = cap; g.fillRect(0, 0, W, 0.26 * H);
      const strand = (az0, th0, az1, th1, w, color, alpha) => {
        g.strokeStyle = color; g.lineWidth = w; g.globalAlpha = alpha; g.lineCap = 'round';
        g.beginPath();
        let prev = null;
        for (let i = 0; i <= 16; i++) {
          const t = i / 16, e = t * t * (3 - 2 * t);
          const p = T(az0 + (az1 - az0) * e, th0 + (th1 - th0) * t);
          let x = p[0];
          if (prev !== null) { while (x - prev > W / 2) x -= W; while (prev - x > W / 2) x += W; }
          if (i === 0) g.moveTo(x, p[1]); else g.lineTo(x, p[1]);
          prev = p[0];
        }
        g.stroke();
      };
      // DUONG CHAN TOC LECH NGANG - doc tung diem tren /tmp/ahr-face2.png (crop mat),
      // KHONG PHAI vom cat nua. az duong = ben PHAI cua nguoi xem (may quay o -z).
      // Ngoi gia o az +14 nen ben phai tran LO NHIEU HON: chan toc ben ay chay NGANG
      // (68 do tu az 14 den 26 roi xuong dan 92 o az 38, 112 o az 58), con ben trai
      // bang mai rua XUONG LIEN (68 -> 124 trong 62 do az) - do chinh la cai quat ngang
      // qua tran ma mot vom tron cat sat phien khong bao gio co.
      // Vong 10 THU HEP TRAN. Vong 9 de dinh chan toc o theta 58: do mat la 30 do tu
      // chan toc den long may (th 82) = 25% chieu cao mat, trong khi do tren
      // ahr-head-crop2.png chi 45/360 px = 12%. ahr32/front.png vi the ra mot cai tran
      // cao loe phia sau hai tai. Kien ca duong xuong 6-10 do (dinh 68) va van o TREN
      // giao tuyen vom/phien (az 0 -> 77,5; az 38 -> 93) nen bien alpha that su la
      // chan toc, khong bi phien an.
      // Vong 10 KHUC THE HOA. Vong 9 noi lien cac diem bang DUONG THANG va ket qua tren
      // ahr31/front.png la mot mep RANG CA: moi doan doi huong tao mot dinh tam giac sac
      // (5 do az = 14 px, du to trong 512px). Cung tap diem do, Catmull-Rom (tan tuyen
      // lay tu hai lang ke) cho mep MOOT C0 ma dinh van con - toc trong anh cung the:
      // hai cuc dai lien tiep noi nhau bang mot vong cong, khong phai hai cat.
      // Cac cuc dai bay gio la: ngon rua o az -48 (th 120, ngay tren long may trai),
      // khe -38 (96), roi ngoi gia 14 (58), va ben phai xuong dan 48 (84) -> 68 (146).
      // DINH NHON CHI CO MOT VUNG. Cat duoc cua vom/phien la 0:77,5  15:80,3  25:85,0
      // 35:92,0  45:100,0  57,6:110,8: duoi con so do phien an lop toc, nen mot ngon
      // son xuong toi 124 o az -48 (vong 10 lan 1) la ngon KHONG AI NHIN THAY - no nam
      // sau cai mat. Anh lai co dinh nhon ngay o mang cung (az 35..50), la noi duyet
      // nhat con lai. Vong 10 lan 2: hai dinh 88 o az 34 va 96 o az 46, ca hai cach
      // bien nhin 4 do; xen giua la khe 78 va 86. Ben trai giu duong rua tron vi o do
      // long may trai da bi che boi lon 3D (mesh), khong phai boi son.
      const FRINGE = [
        [-74, 178], [-64, 156], [-54, 136], [-46, 124], [-38, 110], [-30, 98], [-20, 86],
        [-10, 78], [0, 72], [10, 68], [18, 68], [26, 72], [34, 88], [40, 78], [46, 96],
        [52, 86], [58, 110], [66, 146], [74, 178],
      ];
      const FR = (a) => {
        const x = Math.max(-74, Math.min(74, a));
        let i = 1;
        while (i < FRINGE.length - 1 && x > FRINGE[i][0]) i++;
        const [x1, y1] = FRINGE[i - 1], [x2, y2] = FRINGE[i];
        const y0 = FRINGE[Math.max(0, i - 2)][1], y3 = FRINGE[Math.min(FRINGE.length - 1, i + 1)][1];
        const t = (x - x1) / (x2 - x1);
        const m0 = (y2 - y0) / (x2 - FRINGE[Math.max(0, i - 2)][0]);
        const m1 = (y3 - y1) / (FRINGE[Math.min(FRINGE.length - 1, i + 1)][0] - x1);
        const h = x2 - x1, t2 = t * t, t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * y1 + (t3 - 2 * t2 + t) * m0 * h
          + (-2 * t3 + 3 * t2) * y2 + (t3 - t2) * m1 * h;
      };
      // NGOI GIA LA MOT DUONG NGOI CHU KHONG PHAI MOT DIEM. That thu vong 9 lan 1: cho
      // 30 soi cat nhau tu (12, theta 4..15) - gan dinh den kinh tuyen ep moi diem do
      // ve cung MOT CHO o canvas (u 0,77..0,79, v 0,02..0,09) nen 30 net tu quy thanh
      // CAI MAI NHEN, xem /tmp/ahr-hair-tex.png. Anh thi toc rue thanh HAI RUA tu mot
      // vet ke doc: duong ngoi tu (14, 24) xuong (22, 56), va moi soi noi manh vao mot
      // doan cua vet ay, cach nhau 3-4 do az.
      const CREASE = (f) => [14 + f * 8, 24 + f * 32];
      const bang = (a1, f, w, color, alpha) => {
        const [a0, t0] = CREASE(f);
        strand(a0, t0, a1, Math.min(150, FR(a1)) - 5, w, color, alpha);
      };
      // 17 soi rua TRAI (quat qua tran den tan ben tai, az -68) + 9 soi rua PHAI (ngan,
      // sat dinh roi xuong duoi 68 do az de hai "tai nua" ben mat co loi toc chu khong
      // con la hai vai tron). Thu tu color dao lien tuc de hai soi ke nhau khong cung
      // mau - do la cai tao nen so loi toc.
      for (let k = 0; k < 17; k++) {
        const a1 = 12 - k * 5;
        bang(a1, 1 - k / 16, 13 + (k % 3) * 6, ['#4a5c9a', '#3a4a80', '#20264a'][k % 3], 0.26);
      }
      for (let k = 0; k < 9; k++) {
        const a1 = 18 + k * 6;
        bang(a1, 1 - k / 8, 15 + (k % 2) * 7, ['#3a4a80', '#20264a'][k % 2], 0.24);
      }
      // VET NGOI: mot net toi chay doc theo CREASE, ve SAU khi cac soi rua da xep xong
      // de no cat roi hai rua that.
      strand(14, 22, 23, 58, 9, '#161a34', 0.6);
      // TOC SAU - vong 10 THAY cho mesh "dai toc" (ly do o mesh block duoi). Vom
      // ellipsoid da kin den theta 163 tuc den tan gay, nen mat sau DA co toc phu; cai
      // con thieu chi la LOI TOC. Vong 9 de tron o day nen ahr31/rear.png ra mot qua cau
      // bong. 9 soi moi nua chay doc theo lung, loi nhe ve phia giua (az 180) khi xuong
      // gan gay. Vong 10 lan 1 cho chung bat dau o theta 34..50 va ket o 138..153 deu
      // den 5 do: ahr32/rear.png ra HAI DUONG NGANG song song vi 18 dau cuoi tron
      // (lineCap round) xep thanh hai hang thang. Do do do do PHAI roi tung 9-11 do.
      for (const s of [-1, 1]) {
        for (let k = 0; k < 9; k++) {
          const a0 = s * (94 + k * 9);
          strand(a0, 24 + (k % 4) * 11, a0 + s * (3 + (k % 3) * 5), 112 + (k % 5) * 11,
            14 + (k % 2) * 9, ['#3a4a80', '#20264a'][k % 2], 0.16);
        }
      }
      // DAI BONG theo chieu quat: anh co mot dai mau sang hon chay doc theo bang mai,
      // tu do cao 40 o phia ngoi gia lech xuong 74 o dau ben trai (median do #676388).
      g.globalAlpha = 0.16; g.strokeStyle = '#5f68a0'; g.lineWidth = 24; g.lineCap = 'round';
      for (const [a0, t0, a1, t1] of [[22, 40, -50, 78], [26, 42, 46, 60]]) {
        g.beginPath();
        for (let i = 0; i <= 12; i++) {
          const f = i / 12; const p = T(a0 + (a1 - a0) * f, t0 + (t1 - t0) * f);
          if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
        }
        g.stroke();
      }
      // VIEM TOI SAT MEp: bien toc trong anh la mot duong SAC (toc mong dan o do, den
      // phia sau chieu xuyen qua), khong phai bien muot. Net nay ve CUNG chieu duoi
      // chan toc 8 do de duong cat khong an het no.
      g.globalAlpha = 0.5; g.strokeStyle = '#161a34'; g.lineWidth = 14; g.lineJoin = 'round';
      g.beginPath();
      for (let az = -70; az <= 70; az += 2) { const p = T(az, FR(az) - 8); if (az === -70) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]); }
      g.stroke();
      // VIEM SANG SAT tren mép (ve TRUOC de duong cat cat gon no) - luc nay chan toc la
      // bien alpha nen viem sang PHAI theo FR, khong theo vom nua.
      g.globalAlpha = 0.4; g.strokeStyle = '#4a5c9a'; g.lineWidth = 9; g.lineJoin = 'round';
      g.beginPath();
      for (let az = -70; az <= 70; az += 2) { const p = T(az, FR(az) - 3); if (az === -70) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]); }
      g.stroke();
      g.globalAlpha = 1; g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
      g.beginPath();
      g.moveTo(T(-72, 178)[0], H);
      for (let az = -72; az <= 72; az += 1) { const p = T(az, FR(az)); g.lineTo(p[0], p[1]); }
      g.lineTo(T(72, 178)[0], H); g.closePath(); g.fill();
      g.globalCompositeOperation = 'source-over';
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    // scale = HS: SphereGeometry(HR) la MAT CAU BANKinh, muon ra ellipsoid (1,09,1,00,
    // 1,05) thi ep theo tung truc bang mesh.scale - m() dat scale TRUOC khi doi chieu
    // cao, nen toa do trong dau = HC + HS * diem tren mat cau, dung dung cong thuc T()
    // da nguoc o tren.
    head.add(m(new THREE.SphereGeometry(HR, 48, 30, 0, Math.PI * 2, 0, HTH * D2R),
      new THREE.MeshStandardMaterial({ map: hairTex, roughness: 0.62, transparent: true }),
      0, HC[1], HC[2], { scale: HS }));

    // TOC = BON LOp VO GON SONG, khong phai mot khoi tron. Vom tron du son 26 soi toc
    // van ra vom tron: bien cua no la duong tron ellipsoid, nen lop phai la bien THAT
    // trong 3D. Bon vo cung cat (SphereGeometry HR = 0,485), ban kinh 0,494 -> 0,524 -
    // vo CAO nhat nam NGOAI CUNG vi toc that thi lop tren de LEN tren lop duoi; do vay
    // vo duoi chi lo ra o cai MIENG cua no, va mieng lech nhau moi tao thanh lop.
    //   rim(az) = rimBase*taper + amp/2*(1 + cos(k*(az + phase)))*swell
    // k = 4: bon thuyeng lon deu nhau mot vong, dinh thuyeng o az 90/180/270 (hai
    // ben mai + giua lua) voi phase 0. Vo le phase 45 dao dau cos -> thuyeng cua no
    // nam LEO vao khe cua vo tren; do la cai xen ke khiem khac cua toc xoe, khong
    // phai bon cai vat bang nhau chong len nhau. phase chi duoc boi so le cua 90/k vi
    // cos(k*(az+phase)) phai chan tinh voi az -> -az (doi xung trai/phai qua mat
    // phang ngang) va voi 180+d -> 180-d (doi xung truoc/sau).
    // Vong 12 THAY PINH = TAPER + SWELL. Vong cu ep ca rim lan bulge bang pinch =
    // sin(pi*s)^0,3: o az 90 (hai ben mai, NOI MA NGUOI XEM TIEN THANG nhin thay) pinch
    // moi bang 0,61 va no NAP SAT bon thuyeng lai, nen toc van la mot khoi tron khi nhin
    // lech 3/4 (shot-rear34.png). Nay taper chi di vao rimBase (do sau trung binh cua
    // dai), con swell = sin(pi*s)^0,09 = 0,91 ngay tai az 90 va chi tui ve 0 o 6 do az
    // cuoi cung cua dai - thuyeng va bung giu du do lon gan het vong, dai van dong lai
    // thanh luoi dao sau tai de khong co tam cat thang.
    // DAI MO RONG DEN AZ +-62 (tung +-72): 57,6 la mep cua phieng mat, nen tu 62 ra ngoai
    // khong con gi de che. Do la hai lon OM HAI BEN MAT - thu duy nhat lam bien toc lo
    // lech khoi duong tron khi nhin CHINH DIEN.
    // Son vo bang CHINH hairTex (uv = (az-90)/360, 1 - theta/HTH la dung cach
    // SphereGeometry cua vom quy chieu), nen soi toc chay LIEN qua mieng lop, khong
    // bi cat khuc. Doi xung trai/phai la do taper/swell va cos chan tinh, khong do guong.
    const shell = (R, rimBase, amp, phase, radial, tint) => {
      const nA = 44, nT = 9, az0 = 62, az1 = 360 - az0;
      const pos = [], uvs = [], col = [], idx = [];
      const c3 = new THREE.Color(tint);
      for (let i = 0; i <= nA; i++) {
        const s = i / nA, az = az0 + (az1 - az0) * s;
        const taper = Math.pow(Math.sin(Math.PI * s), 0.3);
        const swell = Math.pow(taper, 0.3);
        const lobe = 0.5 * (1 + Math.cos(4 * (az + phase) * D2R));
        const rim = rimBase * taper + amp * lobe * swell;
        for (let j = 0; j <= nT; j++) {
          const v = j / nT, th = rim * v;
          // PHAI TRON BAN KINH theo do sau: o dinh (v=0) moi cot az ghep ve MOT diem
          // nen R lech nhau se nut toan khoi toc thanh cai hoa hong tran vet; chi gan
          // mieng (v=1) duoc phong. Do la ly do radial nhan v^2 va swell.
          const [x, y, z] = sph(az, th, R + radial * lobe * swell * v * v);
          pos.push(x, y, z);
          uvs.push((((az - 90) % 360) + 360) % 360 / 360, 1 - th / HTH);
          // Mep TOI dan theo v roi BONG SAT o mieng. Mieng cua vo NAY de LEN vo KIA nen
          // ngay duoi no phai toi (bong), con chinh no phai sang (sac to hieu ung cua
          // toc bong). Khong co hai thu do thi tren khoi toc den #2b3a68, lech tint 23%
          // gan 0 do anh va bon lop bi doc thanh MOT khoi tron - dung cai user ban.
          const sh = 1 - 0.42 * v * v * v + 0.8 * Math.pow(v, 12);
          col.push(c3.r * sh, c3.g * sh, c3.b * sh);
        }
      }
      for (let i = 0; i < nA; i++)
        for (let j = 0; j < nT; j++) {
          const a = i * (nT + 1) + j, b = a + nT + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      head.add(m(geo, new THREE.MeshStandardMaterial({
        map: hairTex, vertexColors: true, roughness: 0.55, side: THREE.DoubleSide,
      }), 0, HC[1], HC[2], { scale: HS }));
    };
    // Bon tint toi dan xuong duoi (lop o duoi nam TRONG BONG cua lop tren). Tren khoi
    // toc den thi tint khong du: #2b3a68 nhan 0,6 van la den nen phai co duong gop
    // THAT do vertexColor ve o mieng tung lop (xem sh o tren).
    shell(0.524, 52, 30, 0, 0.034, '#f4f6ff');
    shell(0.514, 78, 30, 45, 0.028, '#d3dbf2');
    shell(0.504, 104, 30, 0, 0.022, '#b4c0e4');
    shell(0.494, 130, 32, 45, 0.016, '#98a8d2');

    // DINH DAU KHONG CO "BUN". Vong 9 them mot dia toc gom o dinh (SphereGeometry 0,085
    // ep [1,35,0,55,1,15] tai y 0,528) vi doc sai anh: trong /tmp/llref/Chibi_Ahri.png
    // khoi toc chay tu ngoi gia ra sau roi xuong lung, giua hai tai la MOT mat cong tron
    // va duong rieng cua hai tai. Vong 10 ahr31/front.png chung minh no hai tac: dia
    // bun 0,115 ngang chen giua hai tai doc thanh "cai mu beret" ngay tren tran. Vom
    // ellipsoid dinh 0,540 (theu y 1,980) + vet ngoi son az 14 da du hinh khoi; vet gom
    // that su nam O SAU (duoi bun -> dai toc), nay son bang 9 soi toc sau o tren.

    // HAI TAI CAO. Thu duy nhat ma phiến son VOI TREN MAT CAU khong the nao lam duoc:
    // chung NHO ra ngoai vo 0,463 chu khong nam TREN vo (bat bien 1 - bai hoc tai na
    // Bat Man :1280).
    //
    // KICH THUOC do bang luoi tren splash (/tmp/ahri-g2.mjs): dau 210 x 190 px, tai gan
    // 55 x 70 px -> 0,24 x 0,31 the gioi (1 px anh = 0,92/210 = 0,00438).
    // VI TRI: do bang luoi, day tai nam cach tam dau 72/210 = 34% be ngang, tuc
    // 0,315/0,46 = 68% ban kinh dau. Hai vong dau dat az 44 chi dat 30% nen tai moc len
    // NGAY TREN DINH nhu doi sua; az 70 + theta 52 moi ra x 0,74r, y 0,62r dung cho do.
    //
    // TAI SAO LA BAN PLAT (finPlate) CHU KHONG CONE: hai vong cone (h 0,40 roi 0,60)
    // deu bi vom toc an het, va ly do khong phai cone qua ngan ma la cone mong dan ve
    // phia ngon. Voi goc o sph(70, 45, 0,36) thi |goc - C| = 0,334 trong khi |ngon - C|
    // = 0,604 nen truc chi thoat mat vom (R = 0,4662) o 51% chieu dai - ma 51% do la du
    // theo TRUC, be ngang bi ep cung ty le do (1 - t) nen mat day chi con 0,10 thay vi
    // 0,24 do duoc. Ban plat thi nguoc lai: be ngang la ws[] dat tai tung ga, muon chon
    // sau bao nhieu thi keo ga duoi xuong, tai van gi nguyen be ngang.
    // PHAN QUYET 2026-11-13: "cho nho lai va dua len phia tren dau". Vong 5..7 dat neo o
    // sph(70, 52, 0,575) = day tai cach tam dau 0,426 THEU NGANG (93% ban kinh dau) va
    // ngon tai o y 1,945 - tuc hai cai tai NAM NGANG BEN MAT dau, gan bang chieu cao chop
    // toc, nen tai bi toc an va khong doc thanh tai. Vong 8 doi sang DINH: /tmp/ahri-ear3.mjs
    // quen (az, theta, r, phi, tz) va giai |v + s.a| = R. Nghiem CHON = az 44, theta 28,
    // r 0,50, phi 0,10, tz 0,44. Vong 9 thay vom thanh ellipsoid C=(0;0,055;0,055)
    // R 0,485 S=(1,09,1,00,1,05) nen /tmp/ahri-ear4.mjs PHAI giai lai |((P+s.a-C)/S)| = R
    // tren vom MOI - va no bao: khong doi mot con so nao trong mesh tai ca:
    //   truc a = Rx(0,10)*Rz(0,44)*(0,1,0) = (-0,42594; 0,89983; 0,09032)
    //   P = sph(44, 28, 0,50) = (-0,16308; 0,44147; -0,16886)
    //     -> |q|/S = 0,466 < R 0,485 => neo van AN TRONG vom, sau 19 mm (vom cu an 4 mm,
    //        vom MOI an SAU hon vi to hon - tai moc truc tiep len toc, khong noi loi).
    //   s1 = -0,822, s2 = +0,023 => voi ga ngon 0,20 va ga day -0,12 thi phan LO ra
    //     khoi vom la 0,177 (vom cu: 0,196), phan AN 0,143. Bang EAR/PIN/FLF khong doi
    //     mot so nao: tai da duoc cat nho o vong 8 (LO 0,289 -> 0,196, be 0,230 -> 0,158),
    //     vom to hon chi lam no moc sau hon chu khong lam no ngan hay hep them.
    //   Ngon tai theu y 2,062 (|x| 0,248): ca hai ngon DEO NHO LEN TREN chop vom toc
    //   1,980 (vom moi van 1,980 - do la thu pham tinh toan khi chon R/S) chu khong xep
    //   ngang ben mat - do la cai "dua len phia tren dau".
    //   Truc lech huong ban kinh 33 do = dung bang vong cu, nen do NGHIENG RA NGOAI
    //   giu nguyen, chi doi vom xung quanh.
    // DoubleSide BAT BUOC: finPlate khong index va thu tu quad cua mat phang (-z) sinh
    // ra phap tuyen +z, tuc HUONG VAO KHOI tam - FrontSide an toan ca hai mat va chi
    // de lai mot thanh tuong ben phai day 0,036. vong 5 render ra "sợi wire" chinh la
    // cai tuong do, khong phai ban tai bi toc an.
    const earDark = mat('#404060', { roughness: 0.55, side: THREE.DoubleSide });
    // median cac cluster toi trong hop tai (282..340 x 26..90): #303050/#404060/#484868
    // - nhe hon vom toc #2b3a68 nen vien tai doc duoc tren toc.
    const earPink = mat('#946c84', { roughness: 0.7, side: THREE.DoubleSide });
    // median 554 px #886880..#a07088 cung hop: long tai LAI ro nhat, khong phai vien.
    const earTuft = mat('#e8e8f8', { roughness: 0.62, side: THREE.DoubleSide });
    // ngon 0,006 -> 0,012: CatmullRom qua 5 ga ma ga cuoi bang 0 thi vuot qua 0 va
    // tam giac hoa dao, render ra ngon ut nhu kim. 0,012 van gon (< 1/3 be ngang 0,040
    // o ga 0,12) nen tai doc la ngon tron, khong phai cat cun.
    // 5 ga tu -0,12 den +0,20 = ban kinh dai 0,32 (cu: 0,52). Ga dau duoi mat vom
    // (s2 = +0,004) nen no chi de gian doan CatmullRom, khong lo ra dau.
    const EAR = [[-0.12, 0.112], [-0.05, 0.092], [0.04, 0.070], [0.12, 0.040], [0.20, 0.012]];
    for (const s of [-1, 1]) {
      const grp = new THREE.Group();
      grp.position.set(...sph(s * 44, 28, 0.50));
      grp.rotation.set(0.10, 0, s * 0.44);
      grp.add(m(finPlate(EAR.map(([y, w]) => [0, y, 0]), EAR.map(([, w]) => w), 0.036),
        earDark, 0, 0, 0));
      // MAT TRONG: ban hong 0,010 nam TRUOC ban den, DAT GIUA (x = 0). Trong anh goc
      // (crop luoi 10 px, 256..358 x 10..123: ngon (306;38), day 55x62 px = 0,24x0,27
      // theu gioi) vien den DAY hon o canh ngoai (318..330) va bun chay lech vao trong
      // (285..315 x 55..95 = 55% dien tich) - nhung do la PHOI CANH cua dau nghieng 3/4,
      // khong phai thiet ke: khung quy cua hai tai KHONG doi xung qua G - Rz(+0,44) cho
      // s=+1 dat tai -x nen +X huong VAO trong, Rz(-0,44) cho s=-1 dat tai +x nen cung
      // +X lai huong RA ngoai - nen moi lech ngang cung chieu se dao nguoc giua hai ben.
      // ws hong nho hon ws den tai CA 5 ga (0,072<0,101; 0,060<0,085; 0,046<0,066;
      // 0,026<0,044; 0,004<0,026 - so ben phai la EAR noi suy dung tai y cua ga hong)
      // nen vieng den bao quanh deu hai ben.
      const PIN = [[-0.08, 0.072], [-0.02, 0.060], [0.05, 0.046], [0.11, 0.026], [0.16, 0.004]];
      grp.add(m(finPlate(PIN.map(([y, w]) => [0, y, 0]), PIN.map(([, w]) => w), 0.010),
        earPink, 0, 0, -0.048));
      // BUN TRANG = BAN THU TU, KHONG PHAI QUA CAU: vong 5 ba qua cau cach deu nhau ra
      // ba noi com ran; vong 6 ba qua de trung nhau van ra ba cai bong tron vi bien cua
      // cau la duong cong deu, khong co goc de tao thi tai doc. Trong anh goc bun la MỘT
      // khoi lien chiem ~55% mat trong, RONG o chan tai va TEP dan len ngon - dung la
      // dang cua mot finPlate: ws dat theo tung ga, khong phai theo ban kinh cau.
      // FLF nho hon PIN tai CA 5 ga (so ben phai la PIN noi suy dung tai y cua ga bun:
      // 0,032<0,068; 0,036<0,058; 0,028<0,046; 0,017<0,033; 0,004<0,017) va trung bin
      // khoang 55% nen vieng hong lo ra deu hai ben, ban bun khong an het tai.
      // Day 0,016 chu khong 0,020: tai da co lai theo phan quyet "nho lai" (ngon 0,20
      // thay vi 0,18, be 0,112 thay vi 0,162) nen ba lop phai cung co lai, neu gi 0,020
      // thi ban bun sau hon chinh no va mat ben van ra vieng nu to choang.
      // Cach mat hong o ca hai ben (hong -0,053..-0,043, bun -0,074..-0,058, lech 0,005)
      // nen hai mat phang khong hop nien; do lech nho nay chi du de tranh z-fighting,
      // may quay cach tai ~2m nen 0,005 do sau doi <1% kich thuoc chieu.
      const FLF = [[-0.06, 0.032], [-0.01, 0.036], [0.05, 0.028], [0.09, 0.017], [0.13, 0.004]];
      grp.add(m(finPlate(FLF.map(([y, w]) => [0, y, 0]), FLF.map(([, w]) => w), 0.016),
        earTuft, 0, 0, -0.066));
      head.add(grp);
    }

    // HAI LON OM MA: trong anh toc con di xuong tan ham, vuong goc 96 o az 50. Lot
    // bat dau o theta 78 - SAU duong chan toc cua vom (az 48, th 79) nen dau tren cua
    // lot nam giua khoi toc, khong lo mot dau cat cun tron ben mat (vong 1 mo mang o
    // th 92 = 4 do DUOI mép, render ra hai dai nhon noi loi khoi toc).
    // RONG: ribbon() lấy w là BÁN KÍNH tiết diện và flat nhân tiếp theo truc phap tuyen,
    // nen w=0,050 flat=1,8 ra mot thanh 0,18 x 0,10 - vong 1 dùng số đó nên hai lon
    // ngieng len nhu cai ghe tai chat lay dau. w=0,030 con 0,108 x 0,060 = 12% be ngang
    // dau, van doc ra la mot lọn toc o 144px. Vong 10 len 0,034 (122 x 68 mm) vi lon
    // phai doc duoc CA khi trung voi vai cua chinh no o goc ngheng.
    // Vong 9 PHAI DOI BAN KINH cung: vom ellipsoid o az 48 th 84 da dat 0,482 (vom cu
    // 0,4662) nen lot 0,472 cua vong 8 BI AN HET.
    // Vong 10 THEM NGON XOE RA NGOAI. Trong anh hai lon om mat KHONG rua theo mat: den
    // ngang cam no LECH RA, ngon tom lai o ngoai. Duong cu ket thuc az 57 -> 53 tuc
    // QAY NGUOC VOI trong anh, do vay vong nay di az 48-55-62-72 va ban kinh TANG dan
    // 0,505/0,500/0,510/0,535 (vom 0,482/0,466/0,454/0,448, lech 23..87 mm). Ngon o
    // the lo y 1,068 |x| 0,372: cat ngang vom cung do cao chi 0,251 tuc LO RA 121 mm -
    // cai ma mot lon rua thang mat khong the co. Chan lot van nam trong khoi toc (ga 0
    // th 84 sau duong chan toc az 48 th 79), khong lo dau cat cun.
    const lock = (pts, w, seg = 16, flat = 1.8) => ribbon(pts.map(([a, t, r]) => sph(a, t, r)), w, 0.006,
      { seg, rad: 7, flat });
    const lockM = mat('#4a5c9a', { roughness: 0.46 });    // soi SANG HON khoi toc
                                                          // #2b3a68 mot bac ro. Vong 9
                                                          // de #3a4a80 = dung mau net
                                                          // rua da son tren vom nen hai
                                                          // lon TAI BIEN trong
                                                          // ahr34/head-zoom.png: chi con
                                                          // hai mieng xanh o duoi cai
                                                          // toc, doc tren rear.png nhu
                                                          // hai sticker.
    for (const s of [-1, 1]) {
      head.add(m(lock([[s * 48, 84, 0.505], [s * 55, 106, 0.500], [s * 62, 122, 0.510], [s * 72, 134, 0.535]], 0.034), lockM, 0, 0, 0));
    }
    // KHONG CO MESH TOC SAU. Vong 8 lam "doi canh" (az 74 -> 174, th 96..126, loe r
    // 0,545) -> ahr29/rear.png ra hai cai canh chong ngang: toc thi RIA XUONG DUOI theo
    // trong luc, khong bay ra ngang. Vong 9 gom ve mat phang G (az 180) -> ahr30/rear.png
    // ra mot cai LUOC doc lung, vi lock() ep r1 = 0,006 nen du nao cung ton thanh ngon.
    // Vong 10 goi thang ribbon() w1 0,085 thi luoc het that, nhung no van la mot dai
    // 290x780 mm NAM NGAY TREN mat vom - ma vom ellipsoid da kin den theta 163, tuc den
    // tan gay: khong co cho nao cho mot mesh toc CHUA duoc phu. Do do lop nay la trang
    // tri thuan, va la nguyen nhan duy nhat khieng duoi (buoc 169 rung z 0,21..0,84,
    // len toi 1,647) dinh vao toc. Toc sau chi con la 9 soi son doc lung o tren.
  }
}

// Trang bị vũ khí, áo choàng và hiệu ứng nguyên tố 3D trên cơ thể nhân vật
// `head` và `root` chỉ hình nào cần MỘT BẢN SAO của khối đầu thật (zed_chibi): sao tại chỗ
// thì phiến sơn đã đo vào bóng miễn phí, vẽ lại lần hai là hai cái nạ lệch nhau.
function buildHeroProps3D(upper, hands, arms, legR, hero, head, root) {
  const id = hero.id;
  const vfxGroup = new THREE.Group();
  upper.add(vfxGroup);

  if (id === 'luffy_g5') {
    // Khăn mây trắng bay lơ lửng quanh vai + Mũ rơm đeo sau lưng
    const cloudM = mat('#ffffff', { emissive: '#e2e8f0', emissiveIntensity: 0.35, roughness: 0.3 });
    const scarf = m(new THREE.TorusGeometry(0.52, 0.075, 12, 32, Math.PI * 1.35), cloudM, 0, 0.62, 0.08, { rot: [0.35, 0, -0.35] });
    vfxGroup.add(scarf);
    // Mũ rơm đeo lưng
    const strawM = mat('#facc15', { roughness: 0.7 });
    const sh = new THREE.Group();
    sh.position.set(0, 0.48, 0.36); sh.rotation.x = 1.35;
    sh.add(m(new THREE.CylinderGeometry(0.38, 0.38, 0.03, 24), strawM));
    sh.add(m(new THREE.SphereGeometry(0.22, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), strawM, 0, 0.01, 0));
    sh.add(m(new THREE.CylinderGeometry(0.225, 0.225, 0.05, 20), mat('#dc2626'), 0, 0.04, 0));
    upper.add(sh);
  } else if (id === 'naruto_sage') {
    // 6 Cầu Hắc Đạo Ngọc (Truth-Seeking Orbs) bay lơ lửng thành vòng tròn sau lưng
    const orbM = mat('#09090b', { emissive: '#78350f', emissiveIntensity: 0.3, roughness: 0.15, metalness: 0.8 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 1.2 - Math.PI * 0.6;
      vfxGroup.add(m(G.orb, orbM, Math.sin(a) * 0.58, 0.55 + Math.cos(a) * 0.32, 0.32));
    }
  } else if (id === 'zoro') {
    // 3 Thanh Kiếm Katana (Tam Kiếm Phái) đeo bên hông phải
    const hilts = ['#f8fafc', '#dc2626', '#9333ea'];
    for (let k = 0; k < 3; k++) {
      const sw = new THREE.Group();
      sw.position.set(-0.38, 0.22 + k * 0.065, 0.05);
      sw.rotation.set(0.55 + k * 0.08, 0.15, 0.1);
      sw.add(m(new THREE.CylinderGeometry(0.022, 0.018, 0.78, 8), mat('#111827', { roughness: 0.3 }), 0, -0.1, 0.12, { rot: [Math.PI / 2, 0, 0] }));
      sw.add(m(new THREE.CylinderGeometry(0.055, 0.055, 0.018, 12), mat('#facc15', { metalness: 0.85 }), 0, 0.02, -0.26, { rot: [Math.PI / 2, 0, 0] }));
      sw.add(m(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8), mat(hilts[k]), 0, 0.06, -0.38, { rot: [Math.PI / 2, 0, 0] }));
      upper.add(sw);
    }
  } else if (id === 'sasuke') {
    // Tuyệt chiêu Lôi Kiếm – Ngàn Tia phóng sét xanh rực trên bàn tay trái
    const chidori = new THREE.Group();
    const boltM = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
    const coreM = new THREE.MeshBasicMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.88 });
    chidori.add(m(new THREE.SphereGeometry(0.14, 14, 12), coreM, 0, 0, 0, { cast: false }));
    for (let i = 0; i < 6; i++) {
      const bar = m(new THREE.ConeGeometry(0.03, 0.38, 5), boltM, 0, 0, 0, { rot: [i * 1.1, i * 0.8, i * 1.5], cast: false });
      chidori.add(bar);
    }
    hands[1].add(chidori);
    vfxGroup.userData.chidori = chidori;
  } else if (id === 'sanji') {
    // Ngọn lửa Gót Lửa bốc cháy ở chân phải
    const fire = new THREE.Group();
    fire.position.set(0, -0.12, -0.04);
    fire.add(m(new THREE.ConeGeometry(0.15, 0.38, 10), new THREE.MeshBasicMaterial({ color: '#f97316', transparent: true, opacity: 0.85 }), 0, 0.08, 0, { cast: false }));
    fire.add(m(new THREE.ConeGeometry(0.10, 0.28, 10), new THREE.MeshBasicMaterial({ color: '#fef08a' }), 0, 0.06, 0, { cast: false }));
    legR.add(fire);
    vfxGroup.userData.fireLeg = fire;
  } else if (id === 'law') {
    // Thanh trường kiếm Kikoku vác chéo trên vai
    const kikoku = new THREE.Group();
    kikoku.position.set(0.18, 0.56, 0.24);
    kikoku.rotation.set(0.3, 0, -0.78);
    kikoku.add(m(new THREE.CylinderGeometry(0.025, 0.022, 1.35, 10), mat('#1e1b18'), 0, 0, 0));
    kikoku.add(m(new THREE.CylinderGeometry(0.028, 0.028, 0.36, 10), mat('#dc2626'), 0, 0.52, 0));
    kikoku.add(m(new THREE.SphereGeometry(0.065, 10, 8), mat('#f8fafc'), 0, 0.33, 0));
    upper.add(kikoku);
  } else if (id === 'itachi') {
    // Cổ áo choàng cao che cằm + họa tiết mây đỏ (Tóc Dài)
    const colM = mat('#18181b', { roughness: 0.7, side: THREE.DoubleSide });
    upper.add(m(new THREE.CylinderGeometry(0.28, 0.24, 0.22, 24, 1, true), colM, 0, 0.68, 0));
    upper.add(m(new THREE.CylinderGeometry(0.27, 0.23, 0.21, 24, 1, true), mat('#991b1b', { side: THREE.BackSide }), 0, 0.68, 0));
  } else if (id === 'ace') {
    // Vòng cổ hạt đỏ + Hai nắm đấm rực lửa Hỏa Quyền (Mera Mera)
    upper.add(m(new THREE.TorusGeometry(0.24, 0.038, 10, 24), mat('#dc2626', { roughness: 0.3 }), 0, 0.62, -0.04, { rot: [Math.PI / 2 + 0.25, 0, 0] }));
    for (const h of hands) {
      const f = new THREE.Group();
      f.add(m(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshBasicMaterial({ color: '#f97316', transparent: true, opacity: 0.82 }), 0, 0, 0, { cast: false }));
      f.add(m(new THREE.ConeGeometry(0.11, 0.26, 8), new THREE.MeshBasicMaterial({ color: '#fde047' }), 0, 0.1, 0, { cast: false }));
      h.add(f);
    }
  } else if (id === 'shanks') {
    // Áo choàng Tứ Hoàng đen + Thanh kiếm Tây dương Gryphon bên tay phải
    const cape = m(new THREE.CylinderGeometry(0.28, 0.52, 0.78, 20, 1, true, -Math.PI * 0.55, Math.PI * 1.1), mat('#0f172a', { side: THREE.DoubleSide }), 0, 0.32, 0.06);
    upper.add(cape);
    const sword = new THREE.Group();
    sword.add(m(new THREE.BoxGeometry(0.025, 0.06, 0.72), mat('#e2e8f0', { metalness: 0.9, roughness: 0.15 }), 0, -0.02, -0.38));
    sword.add(m(new THREE.TorusGeometry(0.08, 0.018, 8, 16, Math.PI), mat('#eab308', { metalness: 0.85 }), 0, 0, -0.02, { rot: [0, Math.PI / 2, 0] }));
    hands[0].add(sword);
  } else if (id === 'minato') {
    // Áo choàng Hokage Đệ Tứ trắng viền lửa đỏ + Kunai Phi Lôi Thần
    const cloak = m(new THREE.CylinderGeometry(0.27, 0.50, 0.76, 20, 1, true, -Math.PI * 0.6, Math.PI * 1.2), mat('#f8fafc', { side: THREE.DoubleSide }), 0, 0.32, 0.05);
    const flameHem = m(new THREE.CylinderGeometry(0.49, 0.51, 0.14, 20, 1, true, -Math.PI * 0.6, Math.PI * 1.2), mat('#dc2626', { side: THREE.DoubleSide }), 0, -0.01, 0.05);
    upper.add(cloak, flameHem);
  } else if (id === 'kaido') {
    // Áo choàng lông tím của Sừng Trâu + chùy gai sắt khổng lồ
    const furM = mat('#581c87', { roughness: 0.9 });
    for (let i = -3; i <= 3; i++) {
      upper.add(m(new THREE.SphereGeometry(0.18, 12, 10), furM, i * 0.13, 0.54 - Math.abs(i) * 0.04, 0.22, { scale: [1, 1.3, 1] }));
    }
    const club = new THREE.Group();
    const ironM = mat('#1e293b', { metalness: 0.75, roughness: 0.35 });
    club.add(m(new THREE.CylinderGeometry(0.04, 0.12, 0.88, 12), ironM, 0, 0.18, -0.18, { rot: [1.1, 0, 0] }));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      club.add(m(new THREE.ConeGeometry(0.035, 0.11, 6), ironM, Math.cos(a) * 0.11, 0.32 + (k % 2) * 0.12, -0.32 + Math.sin(a) * 0.11, { rot: [0, 0, -a] }));
    }
    hands[0].add(club);
  } else if (id === 'yone_chibi') {
    // Song kiếm chéo sau lưng: một lưỡi đỏ son, một lưỡi thép bọc hồn lam.
    const blade = (steel, flame) => {
      const g = new THREE.Group();
      const edgeM = mat(steel, { metalness: 0.7, roughness: 0.28 });
      g.add(m(new THREE.BoxGeometry(0.055, 0.78, 0.016), edgeM, 0, 0.42, 0));
      g.add(m(new THREE.ConeGeometry(0.039, 0.13, 4), edgeM, 0, 0.87, 0));
      g.add(m(new THREE.TorusGeometry(0.072, 0.019, 8, 16), mat('#facc15', { metalness: 0.8, roughness: 0.25 }), 0, 0.02, 0, { rot: [Math.PI / 2, 0, 0] }));
      g.add(m(new THREE.CylinderGeometry(0.026, 0.026, 0.26, 8), mat('#1e1b18', { roughness: 0.6 }), 0, -0.14, 0));
      if (flame) {
        g.add(m(new THREE.BoxGeometry(0.15, 0.86, 0.07), new THREE.MeshBasicMaterial({ color: flame, transparent: true, opacity: 0.4, depthWrite: false }), 0, 0.44, 0, { cast: false }));
      }
      return g;
    };
    // Lưỡi đỏ son đứng về phía +x — cùng phía với con mắt bị nạ che, đúng như ảnh
    // (kiếm đỏ và mắt tinh thể là một cặp). Lưỡi thép hồn lam ở phía -x.
    const dao = blade('#b31f52', null);
    dao.position.set(0.16, 0.34, 0.32); dao.rotation.set(-0.2, 0, -0.55);
    const hon = blade('#cbd5e1', '#a2c1dd');
    hon.position.set(-0.16, 0.34, 0.32); hon.rotation.set(-0.2, 0, 0.55);
    upper.add(dao, hon);
    // Vai lông trắng: ảnh đo ra #6a7e92 vì đèn của ảnh thiên lam, sảnh này sáng ấm
    // nên albedo nâng lên #cbd5e1 mới ra đúng chất lông trắng như trong ảnh.
    const featherM = mat('#cbd5e1', { roughness: 0.85 });
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const a = -0.5 + i * 0.25;
        upper.add(m(new THREE.ConeGeometry(0.045, 0.20, 6), featherM, s * (0.30 + Math.cos(a) * 0.04), 0.54 - Math.abs(i - 2) * 0.02, -0.06 + Math.sin(a) * 0.10, { rot: [0.2, 0, s * (1.1 - i * 0.2)] }));
      }
    }
  } else if (id === 'leesin_chibi') {
    // GIÁP TAY PHÁT SÁNG - chi tiết 3D DUY NHẤT của hình này mà sơn với tới không được: nó
    // nhô ra ngoài vỏ đầu 0,463. Mọi hex do measure.mjs --sat 0 trên
    // leesin-long-cuoc-ti-ni.jpg:
    //   #3398e6 khối tinh thể  (0.40,0.56,0.46,0.63 hue 206 sat 179) ~ skillColor #349ee2
    //   #41a6f0 lẻ sáng        (0.47,0.66,0.50,0.72 hue 205 sat 175)
    //   #2c79d6 gốc thẫm       (0.41,0.53,0.44,0.57 hue 213 sat 170)
    //   #68f8ff lõi nóng       (dọc qua x 0.46, y 0.515 - điểm no nhất của khối xanh)
    //   #aa855f đai vàng cổ tay (0.40,0.38,0.72,0.56) - cùng vàng với viền mặt nạ
    //   #75a2ec = aura: quầng xanh quanh khối giáp trong ảnh (0.15,0.05,0.85,0.28 hue 217 sat 119)
    //
    // (Rồng xoắn ốc quanh người đã gỡ hẳn theo yêu cầu. Hai hex #9abaea và #83a1e8 ở lại
    // DUY NHẤT trong comment này, không mesh nào dùng nữa.)
    //
    // ĐÓ KHÔNG PHẢI VŨ KHÍ. Bản đầu vẽ một thanh kiếm linh vì khối xanh trong ảnh loe ra
    // như một lưỡi gươm; user sửa: đó là CÁNH TAY của nhân vật, bọc giáp năng lượng kết
    // tinh. Bản thứ hai vẫn đặt ở bàn tay nên nó trôi tự do và cái loe bị đọc thành một
    // chiếc mũ chóp. Vì vậy giờ giáp bám vào CÁNH TAY: arms[i] có trục −y quay từ khuỷu về
    // nắm đấm (animateAvatar: a.quaternion.setFromUnitVectors(_down=(0,-1,0), hand-shoulder)
    // và a.position đặt ở trung điểm), nên mọi chi tiết đặt theo local y là tự dọc theo
    // cẳng tay, tự theo cả nhịp ngồi thiền lẫn nhịp đấm. Nắm đấm nằm ở local y -0,22:
    // |shoulder->hand|/2 chia cho đúng hệ số co giãn len/0,44 của nhóm -> 0,22 không đổi.
    const crysM = mat('#3398e6', { emissive: '#2c79d6', emissiveIntensity: 1.7, roughness: 0.2, transparent: true, opacity: 0.6 });
    const litM = new THREE.MeshBasicMaterial({ color: '#41a6f0', transparent: true, opacity: 1, depthWrite: false });
    const coreM = new THREE.MeshBasicMaterial({ color: '#68f8ff', transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
    const hazeM = new THREE.MeshBasicMaterial({ color: '#75a2ec', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
    const guard = new THREE.Group();
    // Bản thứ ba ra một CỤC XANH giữa ngực. Hai lý do, cả hai đều là số: (a) vỏ bọc
    // 0,175 và quầng 0,24 so với cánh tay 0,105 - gấp 1,7 và 2,3 lần, nên nó nuốt trọn
    // cẳng tay và không còn gì để đọc là tay; (b) cụm chi tiết chạy từ local y +0,11 tới
    // -0,61 trong khi nắm đấm ở -0,22, tức quá nửa nằm NGOÀI bàn tay, lơ lửng trước ngực.
    // Từ đây mọi mảnh nằm trong dải [-0,40 .. +0,10] và bề ngang lớn nhất là 0,15.
    // (1) Bọc cẳng tay: loe dần về phía nắm đấm đúng như ảnh (khuỷu gọn, cổ tay nở),
    // bán kính 0,115 -> 0,150 = 1,1..1,43 lần cánh tay - vẫn là tay có giáp, không phải
    // một khối lạ đính trên tay. CylinderGeometry mặc định rộng ở +y nên phải lật X 180°.
    guard.add(m(new THREE.CylinderGeometry(0.115, 0.150, 0.26, 8, 1, true), crysM, 0, -0.04, 0, { rot: [Math.PI, 0, 0], cast: false }));
    // (1b) LÕI NĂNG LƯỢNG BÊN TRONG CẲNG TAY. Ảnh không cho một khối xanh đặc: điểm no
    // nhất #68f8ff nằm GIỮA khối (x 0,46 y 0,515) và thẫm dần ra biên #2c79d6. Bản trước
    // úp vỏ 0,95 nên lõi 0,070 gần như không lộ ra - giáp trông như nhựa màu. Giờ vỏ 0,6 để
    // light xuyên qua được, và lõi trụ 0,080..0,100 chạy trong bọc 0,115..0,150: vẫn chừa
    // một viền lam 0,030..0,050 quanh nó, nên đọc là tinh thể PHÁT SÁNG chứ không phải một
    // cái ống trắng thay thế giáp.
    guard.add(m(new THREE.CylinderGeometry(0.080, 0.100, 0.24, 10, 1, true), coreM, 0, -0.04, 0, { rot: [Math.PI, 0, 0], cast: false }));
    // (2) Hai đai: một ở khuỷu một ở cổ tay. Torus mặc định nằm trong mặt phẳng xy nên
    // phải lật X 90° để nó nằm ngang, vuông góc với trục cánh tay.
    for (const [ry, rr, tr] of [[0.08, 0.120, 0.026], [-0.16, 0.158, 0.030]]) {
      guard.add(m(new THREE.TorusGeometry(rr, tr, 10, 20), crysM, 0, ry, 0, { rot: [Math.PI / 2, 0, 0] }));
    }
    // (3) Bọc nắm đấm + lõi nóng bên trong: vỏ 0,130 lớn hơn bàn tay 0,095 nên vẫn thấy
    // các mặt phẳng của icosahedron bắt sáng thành từng lẻ. Lõi 0,098 (từ 0,070) để gần nửa
    // mặt vỏ trong suốt là vùng sáng.
    guard.add(m(new THREE.IcosahedronGeometry(0.130, 0), crysM, 0, -0.23, 0, { cast: false }));
    guard.add(m(new THREE.SphereGeometry(0.098, 12, 10), coreM, 0, -0.23, 0, { cast: false }));
    // (4) Vảy: bốn mảnh chẻ RA từ bọc, không mọc DỌC theo nó - ảnh cho giáp kết tinh
    // thành phiến quanh cẳng tay. Rz(-1.35) đưa +y tới (0,976; 0,219; 0) = ra +x (bên
    // trái khung nhìn); Rz(+1.35) đối xứng; Rx(±1.35) ra trước/sau. Dài 0,15, gốc nằm
    // ngay trên mặt vỏ (0,150) nên nó trông như mọc ra từ giáp chứ không bay cạnh giáp.
    for (const [px, py, pz, rot, sc] of [
      [0.14, 0.00, 0.0, [0.2, 0, -1.35], [0.55, 0.90, 0.40]],
      [-0.14, -0.05, 0.0, [-0.2, 0, 1.35], [0.55, 1.00, 0.40]],
      [0.0, -0.02, -0.14, [1.35, 0, 0.2], [0.55, 0.85, 0.40]],
      [0.0, -0.10, 0.14, [-1.35, 0, -0.2], [0.55, 0.95, 0.40]],
    ]) {
      guard.add(m(new THREE.ConeGeometry(0.055, 0.15, 5), litM, px, py, pz, { rot, scale: sc, cast: false }));
      // Mỗi vảy có một lõi #68f8ff riêng (0,55 lần mảnh vảy, cùng trục): litM không bắt
      // đèn nên tự nó đã là màu no, nhưng muốn RA PHÁT S sáng thì phải có cộng sáng ở
      // giữa phiến, không chỉ ở khối vỏ.
      guard.add(m(new THREE.ConeGeometry(0.055, 0.15, 5), coreM, px, py, pz, { rot, scale: sc.map((k) => k * 0.55), cast: false }));
    }
    // (5) Ba mấu khớp ngón: chĩa DỌC theo -y (về phía nắm đấm) bằng Rx(pi), đặt quanh mặt
    // trước của bọc nắm đấm - đó là thứ khiến nó đọc là giáp chứ không đọc là dụng cụ.
    for (const [ox, oz] of [[-0.075, 0.045], [0, 0.08], [0.075, 0.045]]) {
      guard.add(m(new THREE.ConeGeometry(0.030, 0.10, 5), crysM, ox, -0.31, oz, { rot: [Math.PI, 0, 0], cast: false }));
    }
    // (6) Ngọn linh lực vọt QUÁ nắm đấm: trong ảnh đây chính là thứ làm bản đầu nhầm thành
    // kiếm. Nó là phần giáp vọt ra, không chuôi, không chắn, và NẰM DỌC theo cánh tay
    // (chĩa -y) chứ không vểnh ra ngoài. Chóp 6 cạnh dẹt (scale z 0,4) để chính diện thấy
    // bản hẹp như ảnh; dài 0,18 để ngọn dừng ở local y -0,40, vẫn trong tầm cẳng tay.
    // Lõi trong 0,062x0,16 (từ 0,045x0,12) - ngọn là điểm sáng nhất của cả cụm trong ảnh.
    guard.add(m(new THREE.ConeGeometry(0.095, 0.18, 6), crysM, 0, -0.38, -0.02, { rot: [Math.PI, 0, 0], scale: [1, 1, 0.4], cast: false }));
    guard.add(m(new THREE.ConeGeometry(0.062, 0.16, 6), coreM, 0, -0.385, -0.02, { rot: [Math.PI, 0, 0], scale: [1, 1, 0.4], cast: false }));
    // (7) Quầng: chỉ bao NẮM ĐẤM và cẳng tay, không nuốt cả hai - vỏ 0,17 quanh một điểm là
    // đủ cảm giác tự phát sáng mà không xoá mất đường nét của tay. Quầng cẳng tay 0,145
    // ngang vẫn dưới 0,150 của vỏ bọc, nên nó thêm sáng chứ không thêm bề ngang.
    guard.add(m(new THREE.SphereGeometry(0.17, 14, 12), hazeM, 0, -0.23, 0, { cast: false }));
    guard.add(m(new THREE.SphereGeometry(0.10, 14, 12), hazeM, 0, -0.04, 0, { scale: [1.45, 1.5, 1.45], cast: false }));
    arms[1].add(guard);
    // Tay kia không phát sáng: trong ảnh nó chỉ có một đai vàng trần ở cổ tay, cùng
    // #aa855f với viền mặt nạ để hai chi tiết vàng của hình này là MỘT màu, không phải hai.
    arms[0].add(m(new THREE.TorusGeometry(0.125, 0.030, 10, 20), mat('#aa855f', { metalness: 0.8, roughness: 0.3 }), 0, -0.17, 0, { rot: [Math.PI / 2, 0, 0] }));
  } else if (id === 'batman_chibi') {
    // ÁO CHOÀNG + ẤN NGỰC DƠI: hai thứ phiến sơn đầu với tới không được, cái nhất vì nó
    // là khối sau LƯNG, cái nhì vì nó dính trên thân áo LatheGeometry.
    //
    // Cả hai giờ dựng ở gear.js (batCape/batEmblem) vì cửa hàng bán chúng thành món rời
    // cho tướng khác mặc: MỘT hàm dựng duy nhất là "bộ đồ của tướng" và "đồ mua" không
    // bao giờ lệch nhau, mà lệch nhau một li thôi là hai mặt cùng vị trí thành z-fighting.
    // Số học và bốn ràng buộc khung hình (rim tới cổ, gấu trên vành sáng chân, mép vải
    // sau ngực, |x| dưới 0,738) ghi ngay cạnh từng hàm đó.
    //
    // Hai mảnh còn lại của hoá phục không cần gọi hàm: tai nạ dựng ở buildHeroHead3D
    // (nó là phần lồi của khối đầu), còn đai vàng tự vào vì sashColor '#facc15' chạy qua
    // sashM trong makeAvatar.
    upper.add(batCape());
    upper.add(batEmblem());
  } else if (id === 'zed_chibi') {
    // CÁI BÓNG ĐI SAU LƯNG ("rất giống nó"). Đây là BẢN SAO của khối đầu thật, không phải
    // một cái đầu thứ hai vẽ lại: head.clone(true) ăn nguyên phiến sơn đã đo, nên bóng và
    // chủ lệch nhau là KHÔNG THỂ xảy ra — và makeHeroFaceTex có FACE_TEX_CACHE nên tấm
    // canvas không bị sơn lần hai. Chỉ đổi MATERIAL:
    //  - phiến: MeshBasicMaterial + color. Basic không ăn đèn của sảnh và color NHÂN vào
    //    từng pixel của map trong không gian LINEAR (three giải mã cả map lẫn color trước
    //    khi nhân), nên cả mask tối đi đúng một hệ số và vẫn phẳng như một cái bóng.
    //    color của phiến là XÁM TRUNG TÍNH chứ không phải tím-lơ: nạ đã đổi sang bạc thì
    //    nhân một màu xanh tím vào nó là bóng thành xanh tím. Hệ số hiện tại #4f4f51 =
    //    #6f6f72 x 0,713, vì vòng này nâng steel từ v 117 lên v 164 (tỉ 0,713 = 117/164):
    //    map sáng gấp đôi theo linear nên phải giảm color đi một nửa linear, nếu không thì
    //    chính cái bóng cũng sáng lên theo chủ và mất hết tương phản với nạ thật.
    //  - còn lại (đầu, tai, mắt ẩn): một vật liệu xám-black chung, roughness 0,95.
    const shadow = new THREE.Group();
    const darkM = mat('#2e2d30', { roughness: 0.95 });
    const plateM = new THREE.MeshBasicMaterial({ map: makeHeroFaceTex(hero.id), color: '#4f4f51', transparent: true, depthWrite: false });
    const hd = head.clone(true);
    hd.position.set(0, 0, 0); // 0,98 của head đã nằm trong vị trí của shadow, cộng hai lần là tụt
    hd.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.material = o.material.map ? plateM : darkM;
    });
    // Hai con mắt phát sáng là KHỐI, không phải nét sơn: phiến đã tối đi vì color nhân, và
    // quy tắc của hình này là cái gì nằm TRÊN vỏ thì sơn, cái gì TỰ PHÁT SÁNG thì khối.
    // Đặt ở bán kính 0,475 > vỏ 0,463 (batman_chibi: nhô ra ngoài chứ không áp lên) để
    // không có hai surface đồng tâm. Tâm mắt đo từ ảnh: theta 106,7°, phương vị ±24° ->
    // x = -0,475*sin(±24°)*sin(106,7°) = ∓0,185, y = 0,475*cos(106,7°) = -0,135,
    // z = -0,475*cos(24°)*sin(106,7°) = -0,416. Nghiêng ±0,6 rad đúng độ nghiêng mắt vẽ.
    // CÙNG MỘT vật liệu Basic #f03050 cho cả chủ lẫn bóng, và gắn cho `head` SAU khi đã
    // clone: gắn trước thì traverse biến lens của bản sao thành darkM rồi lens sáng chồng
    // lên đúng cùng chỗ, hai surface đồng tâm. Basic chứ không Standard+emissive: mắt là
    // nguồn sáng, nó không được tối đi khi quay lưng vào đèn key của sảnh.
    // Sơn mắt (bước 7) KHÔNG bị xoá, nó lùi làm QUẦNG: lens dài 2*0,0775 = 18,7° phương vị
    // còn quầng sơn 88px = 19,8°, nên viền loè vẫn còn thấy quanh khối; lòng hốc slit thì
    // lens che đúng phần lõi, phần còn lại thành mí tối.
    const eyeM = new THREE.MeshBasicMaterial({ color: '#f03050' });
    const zedEyes = (g) => {
      for (const s of [-1, 1]) {
        g.add(m(new THREE.SphereGeometry(0.05, 12, 10), eyeM, s * 0.185, -0.135, -0.416, { scale: [1.55, 0.62, 0.5], rot: [0, 0, s * 0.6], cast: false }));
      }
    };
    zedEyes(hd);
    zedEyes(head);
    // HAI LƯỠI CHẠY DỌC CÁNH TAY (không phải "treo xuống từ cổ tay"): lưỡi là mesh con của
    // ARM và đi theo trục -y của arm. animateAvatar đặt a.quaternion = setFromUnitVectors
    // ((0,-1,0), hand - shoulder) MỖI FRAME nên -y của arm luôn luôn là hướng cẳng tay —
    // đổi dáng tay là lưỡi đổi theo. Bản gắn vào hand với một hướng hardest-code chỉ đúng
    // cho dáng chắp tay trước ngực mà mọi hình đang dùng; các hình sau này có dáng khác.
    // arm.scale.y = len/0,44 có ép lưới, nhưng chỉ DỌC theo chính nó: bề ngang và bề dày
    // nằm trong mặt x/z không bị scale, nên thứ duy nhất thay đổi là chiều dài lưỡi.
    // Trong frame đó +x là RA NGOÀI: từ (0,-1,0) xuống d̂ = (0,330, -0,932, -0,117) (dáng
    // BUÔNG TAY, vai x 0,27 -> tay x 0,44) là phép quay tối thiểu 0,371 rad quanh
    // (0,334, 0, 0,943), đưa x̂ về (0,940, 0,341, 0,021) — 94% vẫn là x, phần y là xoè LÊN
    // nên loe lưỡi không tự đổ xuống sàn. Hai cánh tay mirror nhau nên +x luôn là phía
    // xoè ra, BỘ ĐIỂM DÙNG CHUNG cho hai bên không cần nhân dấu s.
    // Loe +x chỉ 0,10 -> 0,20 đơn vị L (bản 0,36 vẽ cho dáng chắp tay): cẳng tay đã tự
    // nghiêng ra ngoài 0,17 trên 0,48, loe thêm 0,36 nữa là hai lưỡi xoè như hai cái sừng.
    // Con số hiện trường là probe.mjs (bbox world sau nhịp xoay 0,45 của thân, dáng đứng):
    // lưỡi ngoài nhất |x| 0,606 và THẤP NHẤT y 0,162 - sàn/aura ở 0,12, nên ngọn cách
    // mặt sàn 0,042 chứ không đâm xuyên sàn như bản 0,36.
    // Ở tư thế lạy sâu nhất (k=1, d̂ = (-0,335,-0,787,-0,590)) ngọn vẫn ở x +0,063 — mỗi
    // lưỡi nằm bên của nó, không bắt chéo nhau trước bụng.
    // THEO ẢNH GỐC user vừa gửi (một cặp lưỡi bạc trên chắn tay vàng): lưỡi là MỘT TẤM
    // DẸT có đường biên gồm ba đoạn — thân bản rộng, một VAI BẬT cấp, rồi ngọn bản hẹp kéo
    // dài tới mũi. Không phải cái móng vuốt thuôn đều, và cũng không phải một cái bản dẹt
    // nằm NGANG: hai sai đó đều nằm trong vòng này.
    // (a) TRỤC. Tiết diện ribbon là ellipse có bán-trục r theo B (binormal) và r*flat theo
    //     N (normal). Với bộ điểm này N ≈ ±x (sai 94%) và B ≈ ±z, nên flat < 1 đặt bản lưỡi
    //     vào z = mặt SONG SONG với máy quay sảnh: nhìn thẳng chỉ thấy bề dày 0,10, còn
    //     0,304 bề ngang thì dồn hết vào chiều sâu, vô hình. flat 2,9 LẬT lại: bản nằm
    //     trong mặt x/y, pháp tuyến mặt lưỡi hướng ±z tức hướng về người xem, và toàn bộ
    //     ĐƯỜNG BIÊN (thân - vai - ngọn) đọc được từ trước. Đây là lý do vòng trước "to hơn"
    //     mà vẫn không ra hình lưỡi kiếm.
    // (b) BIÊN. rs là bảng bán-trục theo B, tức nửa bề dày; bề ngang = rs x 2,9:
    //     đốt 0-2   0,016 -> 0,034  cán chui qua chắn tay, bản 0,09
    //     đốt 3-11  0,038           THÂN: 9/20 chiều dài, bản 0,220
    //     đốt 11->12 0,038 -> 0,024 VAI: bật cấp trong MỘT đốt ở 55% lưỡi, không phải một
    //                              đường chéo. ribbon lấy rs theo từng đốt nguyên giá trị
    //                              nên bước nhảy sống nguyên - đó là toàn bộ cái "step"
    //                              trong ảnh gốc, và nó là thứ duy nhất phân biệt lưỡi này
    //                              với một cái dùi.
    //     đốt 12-17 0,024           NGỌN: bản 0,139 = 63% thân, song song suốt 30% lưỡi
    //     đốt 18-20 0,018 -> 0,003  mũi
    // Hai bậc đã thử và đã loại, cả hai đều sai vì LƯỠI NÀY DÀI 0,588 chứ không dài như
    // lưỡi trong ảnh: bản 0,260 cho thân thì 2,3:1 thành cái GAI, bản 0,180 thì 3,3:1 thành
    // cái KIM (đốt 12 ngọn 0,099 gần bằng cán, không còn bật cấp ra mắt). 0,220 là bậc mà
    // thân vẫn rộng hơn cán rõ và ngọn vẫn đọc ra một lưỡi, ở đúng chiều dài hiện trường.
    const ZED_BLADE_RS = [0.016, 0.026, 0.034,
      0.038, 0.038, 0.038, 0.038, 0.038, 0.038, 0.038, 0.038, 0.038,
      0.024, 0.024, 0.024, 0.024, 0.024, 0.024,
      0.018, 0.011, 0.003];
    const ZED_BLADE_FLAT = 2.9;   // bề ngang / bề dày của tấm lưỡi
    const zedBlade = (L, material, o = {}) => {
      const g = new THREE.Group();
      if (o.dir) g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...o.dir).normalize());
      if (o.at) g.position.set(...o.at);
      // Gốc ở +x 0,10L = 0,055: mép ngoài cẳng tay là 0,105 nên lưỡi MỌC RA TỪ THÀNH NGOÀI
      // của cánh tay chứ không chìm trong ống tay, và ngọn hất nhẹ về +z (ngược hướng tới)
      // — nét võng của lưỡi trong ảnh.
      // Rễ +0,08 / ngọn -0,90 (thay vì +0,04/-1,00): lưỡi dài 0,98L. Hai đốt cuối mang
      // bán kính gấp đôi và pháp tuyến Frenet ở ngọn nghiêng nên tiết diện góp một phần theo
      // trục y; probe đo ngọn thật của bản này ở 0,162, còn 0,042 trên sàn/aura 0,12. Để
      // -1,00 thì hết số dư đó, cà đất.
      const pts = [[0.10, 0.08, 0], [0.13, -0.24, -0.02], [0.16, -0.52, -0.03], [0.18, -0.76, -0.01], [0.20, -0.90, 0.03]]
        .map(([x, y, z]) => new THREE.Vector3(x * L, y * L, z * L));
      g.add(m(ribbon(pts, o.r0 ?? 0.115, o.r1 ?? 0.018,
        { seg: 20, rad: 12, flat: o.flat ?? ZED_BLADE_FLAT, rs: o.rs ?? null }), material, 0, 0, 0, { cast: false }));
      // CHI TIẾT = GỜ NỔI GIỮA MẶT LƯỠI (fuller), không phải một dải nằm TRONG khối: nó
      // phải nằm TRÊN mặt đang quay về người xem, tức lệch theo z. Bán trục bề dày của thân
      // là 0,038 nên tâm gờ ở -0,034, bản thân gờ dày 0,026 -> nhô khỏi mặt lưỡi 0,009, tức
      // 12% bề dày lưỡi: đủ để bắt sáng thành một nét, không đủ để thành một sống dao.
      // Cùng hex với lưỡi nhưng roughness 0,06 thay vì 0,22: trên một vật kim loại, chi tiết
      // đọc được là chỗ PHẢN XẠ NHỌN hơn, không phải chỗ sáng hơn, nên đổi độ nhám chứ không
      // đổi albedo (mọi hex sắt của hình này đều phải về một bảng màu). Bảng rs nhân 0,34
      // theo tỉ bề ngang gờ / bề ngang lưỡi trong ảnh gốc (rãnh chiếm ~1/3 bản), và vì nó là
      // CÙNG một bảng nên gờ bật cấp ở đúng đốt 11->12: vai lưỡi có hai bậc thì gờ cũng hai
      // bậc, không lệch nhau lấy một đốt.
      if (o.edge) {
        const sp = pts.map((p) => p.clone().add(new THREE.Vector3(0, 0, -0.034)));
        g.add(m(ribbon(sp, 0.045, 0.010, {
          seg: 20, rad: 6, flat: 2.2,
          rs: (o.rs ?? ZED_BLADE_RS).map((r) => r * 0.34),
        }), o.edge, 0, 0, 0, { cast: false }));
      }
      // CHẮN TAY = MỘT PHIẾN VÀNG DẸT nằm trong CÙNG mặt phẳng với lưỡi (x là bề ngang, z là
      // bề dày), rộng 0,318 = 1,45 lần bản lưỡi 0,220 - đúng tỉ lá chắn so với lưỡi trong ảnh
      // gốc - và dày 0,108 > 0,076 của lưỡi để nó đọc là một món ĐÚNG chứ không phải cái khung
      // bao quanh. Bản cũ 0,30 x 0,055 x 0,11 là một thanh DỌC theo z: nhìn thẳng từ sảnh nó
      // chỉ còn một gờ và nằm gọn TRONG bề ngang lưỡi, nên chắn tay biến mất.
      // Tâm theo x ở đúng 0,10L = gốc lưỡi, không phải 0,04L: lệch vào trong thì mép ngoài của
      // phiến nằm TRONG mép ngoài của thân lưỡi, lá chắn bị lưỡi che mất một bên và mất luôn
      // nét "xoè ra hai phía" của ảnh gốc.
      // Local y +0,03L phủ đoạn cán (đốt 0-2) và chân thân; mép dưới ở -0,060 vẫn trên cổ tay
      // -0,22 (wrist là -len/2 chia cho scale len/0,44, MỘT SỐ KHÔNG ĐỔI) nên đai vàng riêng
      // không bị che.
      if (o.guard) g.add(m(new THREE.BoxGeometry(0.53 * L, 0.26 * L, 0.18 * L), o.guard, 0.10 * L, 0.03 * L, 0, { cast: false }));
      // Đai cổ tay ở local y -0,20: wrist là (-len/2) chia cho scale len/0,44 = -0,22, MỘT
      // SỐ KHÔNG ĐỔI bất kể dáng tay hay độ dài tay.
      if (o.ring) g.add(m(new THREE.TorusGeometry(0.118, 0.020, 8, 20), o.ring, 0, -0.20, 0, { rot: [Math.PI / 2, 0, 0], cast: false }));
      return g;
    };
    // NỬA DƯỚI LÀ KHÓI, KHÔNG PHẢI KHỐI: bóng không có chân, phần dưới thuôn tới không —
    // và "như một làn khói đen chứ không rõ khối". Không còn một sphere nào: một khối cầu
    // dù tối vẫn có biên nét cứng, đọc là cái bụng. Bản BA dải mảnh (flat 0,7) vừa render
    // đã bị vì nó ra một cái cổ áo rách: ribbon mảnh + flat nhỏ thì biên sắc như gai.
    // Khói là MỘT CỘT TRÒN TO (flat 0,9 gần tiết diện tròn, r0 0,28 = 61% đầu 0,46) thổi
    // xuống và hơi ngả ra sau, ngọn thuôn về 0,02. Ba cột từng đè nhau chỉ thành một búi
    // gai khi render: một cột + hai lưỡi khói là đủ đọc ra làn khói mà không tranh nét.
    // Trục là local của khối đầu (chưa scale 0,6).
    // Khói trôi về HƯỚNG RA XA CHỦ: hướng từ bóng về thân trong root-local là
    // (-0,71, 0, -0,71), quay ngược lại -0,35 rad của shadow thì thành (-0,42, 0, -0,91),
    // nên đuôi phải trôi theo (+0,42, 0, +0,91) — nếu trôi ngược là nó vắt ngang lưng
    // chủ thành một cái vòi đen (đã render và bị).
    // Basic + cùng hex #2e2d30 với darkM (median xám tối của ảnh sat 19 v 57, đã ép sat
    // về 2 vì hue 250 là ambient tím của cảnh chứ không phải màu khói), chỉ thêm alpha:
    // không ăn đèn của sảnh nên mỗi dải LÀM TỐI nền sau nó, đúng cách khói hiện ra.
    // depthWrite false để các dải không che lẫn theo z-buffer — khói thì cộng mờ.
    const smokeM = new THREE.MeshBasicMaterial({ color: '#2e2d30', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const wisp = (pts, r0) =>
      m(ribbon(pts.map((p) => new THREE.Vector3(...p)), r0, 0.02, { seg: 16, rad: 8, flat: 0.9 }), smokeM, 0, 0, 0, { cast: false });
    hd.add(wisp([[0, -0.28, 0.0], [0.04, -0.52, 0.10], [0.12, -0.74, 0.22], [0.20, -0.94, 0.40]], 0.28));
    // Hai lưỡi khói của bóng: cùng builder với lưỡi sắt của chủ, chỉ đổi material và
    // tiết diện. Bản r0 0,10 / r1 0,015 / flat 0,6 render ra hai CÁI GAI kim loại — trái
    // ràng buộc "nửa dưới của bóng là làn khói chứ không rõ khối". Khói thì đầu-cuối gần
    // bằng nhau và tiết diện gần tròn: r0 0,16 -> r1 0,10, flat 0,9.
    // Bóng không có tay nên lưỡi mọc từ hai bên cột khói (x ±0,30, y -0,44) và tự xoè ra
    // theo dir, không có frame cẳng tay để bám.
    for (const s of [-1, 1]) {
      hd.add(zedBlade(0.46, smokeM, { at: [s * 0.30, -0.44, 0], dir: [s * 0.55, -0.75, -0.38], r0: 0.16, r1: 0.10, flat: 0.9 }));
    }
    shadow.add(hd);
    // 0,6 lần chủ: đủ để đọc ra cùng chiếc nạ, đủ nhỏ để không tranh cái nhìn với mặt thật.
    // Gắn vào ROOT chứ không vào upper/vfxGroup: upper quay -1,15 rad khi lạy và cả cái bóng
    // sẽ lộn nhào xuống sàn, còn một cái bóng đứng sau lưng thì phải ở lại sau lưng.
    // Trung tâm bóng ở root-local y 1,34 = đúng trục khối đầu chủ (upper 0,3 + head 0,98 =
    // 1,28) nên nó NGANG ĐẦU chủ, nhô ra lề chứ không bay trên cao như quả bóng bay.
    // Đỉnh bóng thế giới = 0,17 + 1,34 + 0,276 = 1,786 < 2,266 (ngọn tóc Võ Sư Mù, điểm cao
    // nhất khung heroScene đã chốt) -> ô thumbnail không phải tính lại.
    // Rộng nhất sau nhịp xoay 0,45 của thân: x' = 0,60cos + 0,52sin = 0,766, +0,276 = 1,042 <
    // 1,436 được phép ở độ sâu 4,8 + z' (-0,60sin + 0,52cos = 0,207).
    shadow.scale.setScalar(0.6);
    shadow.position.set(0.6, 1.34, 0.52);
    shadow.rotation.set(0.08, 0.35, -0.12);
    root.add(shadow);
    // HAI LƯỠI SẮC DỌC THEO HAI CÁNH TAY, VÀ LÀ KIM LOẠI THẬT. Kết luận "sảnh không có
    // env map nên metalness 0,8 ra que đen" là SAI và đến từ harness /tmp/zed3d thiếu
    // scene.environment: world.js:77 dựng RoomEnvironment PMREM (intensity 0,35) và
    // thumbs.js:140 dựng lại với 0,55, nên vật liệu kim loại CÓ phản xạ để nhân. Harness
    // đã được vá đúng ánh sáng heroScene trước vòng này.
    // Hex: với metalness ~1, color là MÀU PHẢN XẠ chứ không phải albedo. Lưỡi lấy đúng
    // steelLit của phiến mặt (#d6d2da = median vòm sắt #6377a4 x 1,33 sau khi ép bão hoà)
    // để cả hình CHỈ CÓ MỘT BẢNG KIM LOẠI: bản #d4d4d8 đo từ điểm sáng nhất #d5ffff vẫn
    // đúng về hue nhưng lệch một bậc giá trị so với hệ sắt vừa nâng sáng, thành hai cái
    // bạc khác nhau dưới cùng một đèn. Sóng lưỡi cùng hex, chỉ roughness 0,22 -> 0,06.
    const bladeM = mat('#d6d2da', { metalness: 0.95, roughness: 0.22 });
    const edgeM = mat('#d6d2da', { metalness: 0.98, roughness: 0.06 });
    const cuffM = mat('#cf9561', { metalness: 0.85, roughness: 0.3 });
    for (const a of arms) a.add(zedBlade(0.60, bladeM, { rs: ZED_BLADE_RS, ring: cuffM, edge: edgeM, guard: cuffM }));
    // GIÁP CẦU VAI ĐỎ (user: "trang phục áo thêm phần giáp cầu vai màu đỏ"). Gắn vào
    // vfxGroup (con của upper) chứ không vào arm: arm quay quaternion mỗi frame và
    // scale.y = len/0,44, nên giáp dính arm sẽ bị kéo dài theo dáng tay.
    // Vì SAO KHÔNG ĐẶT ĐÚNG VAI (±0,27, 0,58): khối đầu 0,46 tâm upper-local 0,98 nên đáy
    // đầu ở 0,52 và lát cắt ở cao độ vai 0,58 có bán kính 0,456 - vai 0,27 nằm TRONG bóng
    // đầu, giáp đặt đó bị đầu chibi nuốt. Lùi xuống (±0,34, 0,46, -0,05): 0,46 < 0,52 nên
    // hết đầu che, và 0,34 ± 0,19 = 0,15..0,53 phủ khít cẳng tay (trục vai->tay đi qua
    // x 0,31 ở y 0,46, bán kính 0,105).
    // MŨ CHE = SphereGeometry bán kính 0,19 cắt theta 0..0,55π (99° từ đỉnh) dẹt [1,0,0,86,1]:
    // vòm giáp chứ không phải quả bóng, đáy mở úp lên vai. Viền = torus đặt đúng vòng chân
    // mũ: rim ở theta 99° có r = 0,19*sin 99° = 0,188 và y = 0,19*cos 99° * 0,86 = -0,026,
    // nên hai surface chỉ gặp nhau trên một đường tròn chung, không có vỏ nào áp vỏ.
    // Đỏ lấy hex đo của khăn trong ảnh (median #5e1319, sat 75 hue 355, 180 px) - cùng hex
    // với clothM của khăn và phiến sơn, chia mã mới là hai màu đỏ dưới một đèn.
    const pauldM = mat('#5e1319', { roughness: 0.42, metalness: 0.25, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      vfxGroup.add(m(new THREE.SphereGeometry(0.19, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
        pauldM, s * 0.34, 0.46, -0.05, { scale: [1, 0.86, 1], cast: false }));
      vfxGroup.add(m(new THREE.TorusGeometry(0.188, 0.020, 8, 22), cuffM, s * 0.34, 0.434, -0.05,
        { rot: [Math.PI / 2, 0, 0], cast: false }));
    }
    vfxGroup.userData.zedShadow = shadow;
  } else if (id === 'irelia_chibi') {
    // VONG KIEM GIUA THAN = "kiem vu thanh vong", cai banh xe sau luoi kiem trong anh goc.
    // Gan ROOT, khong gan upper/vfxGroup: `on` doi upper.position.y 0,3 -> 0,4 khi dung
    // (:2852) va upper quay -1,15 rad khi lay, nen vong gan upper se nghien xuong san theo
    // dong nguoi. Mot vong kiem dang quay thi nam ngang thanh dia, khong chen theo nguoi.
    // root-local: san = 0 (dia aura o y 0,03), baseY = groundY + 0,17 khi ngoi (:2853).
    // THAN NGUOI chay tu day ao 0,30 (ROBE_PROFILE :357 gan upper 0,30) den co 1,04, trung
    // diem la 0,67 -> lay tam vong y 0,68 (user: "nang len cao hon 1 ti, nam giua than
    // nguoi"; ban cu 0,40 nam sat bung, duoi both tay gap o 0,64..0,83). Tai do than ao
    // con ban kinh 0,368 (0,40 o upper-local 0,25 thuon 0,35 o 0,45) nen vong o R 0,56
    // cach ao 0,19 va cach both tay 0,10 - khong mieng giay nao cam vao nguoi nhu ban
    // 0,10 sau bung (/tmp/ill-shot15/body.png) va ban 0,40 sat G.lap (shot17-18).
    const IR_RING_R = 0.56, IR_RING_Y = 0.68;
    // BAN kinh 0,56: lap 0,52 va than ao 0,368 o do cao nen 0,56 cach thanh ao 0,19.
    // Ngon xa truc nhat = hypot(0,56 + 0,096*cos 0,42 = 0,649, 0,32 doc tiep tuyen) =
    // 0,724 root-local = 0,81 theu (x 1,12); hai ghe cach nhau 2,4 (meta.json
    // cushions.cols/dz) nen hai vong cua hai nguoi ke nhau con 0,39 theu chen giua.
    // 9 luoi cach deu 40 do, lech pha 20 do cho khong co luoi nao dung giua mat truoc
    // (hai luoi bien khung dang ngoi) cung khong co luoi thang sau lung (choang nguoi
    // khac mac se chong). Mot luoi quep 0,32 tiep tuyen tu ban kinh 0,56 ra ngon 0,649
    // = atan(0,32/0,649) = 26,2 do, chiem 65% cua o 40 do -> 9 canh qua roi rac, le nhau
    // 13,8 do tuc 0,13 chu vi, khong dan thanh dia kin va khong con la 6 cai nan hoa.
    // LUOI = TAM PHANG trong mat quy uoc cua no (x = rong, y = doc, z = phap tuyen) roi
    // moi xoay, cung mot ly do voi fin() tren dau: ribbon dat truc RONG theo phap tuyen
    // Frenet nen duong cong vuot qua mat cau thi ban luoi nghieng dan ra khoi may quay.
    // Day la MOT BAN finPlate duy nhat (:1504) cho ca sau luoi va quat tren dau.
    // NAM NGANG, KHONG PHAI NAM DOC: Euler XYZ cua three la Rx*Ry*Rz va Rz tac dong
    // TRUOC, nen rot = [PI/2 + tilt, 0, PI/2] di qua ba buoc:
    //   Rz(90): truc DOC cua luoi (y) -> -x cua nhom = TIEP TUYEN cua vong. Day la buoc
    //     duy nhat bien "hoa xa" thanh "vong tron": khong co no thi moi luoi chiem mot
    //     goc hoa xa, sau cai la sau cai nan hoa, khong phai sau cai qua canh.
    //   Rx(90): phap tuyen (z) -> -y = xuong san. Luc nay luoi NAM NGANG that, rong theo
    //     phuong kinh tuyen.
    //   Rx(them tilt 0,42 = 24 do): lech phap tuyen ra ngoai, tuc VANG NGOAI THAP HON
    //     vang trong = cai chao. Mat phang nam ngang hoan toan bi bac bo o day: may quay
    //     ngoi cao hon that lung 6..15 do nen no nhin DOC theo mat luoi (probe do tung
    //     luoi chi cao 0,32 theu va ngan 70px tren anh 512px, /tmp/ill-shot16/body.png).
    //     Nghieng 24 do thi |n . mat phang may quay| = sin(24 + 6) = 0,50 cho luoi o
    //     PHIA TRUOC (vang ngoai cua no quay ve phia may quay) - do la luoi SANG nhat,
    //     va luoi sau lung thi ngan den, nen vong co sang toi khi quay chu khong phai
    //     sau cai nhu nhau.
    // (b) group.rotation.y = PI - (phi + 25 do): giu nguyen ban cu, nhung y nghia doi.
    //     Trong khung nay x = -tiep tuyen(phi+25), z = kinh tuyen(phi+25); 25 do lech
    //     nay chinh la GOC NE cua canh qua (luoi khong nam thang theo tiep tuyen ma
    //     ngheng ve chieu quay), tuc chieu quay banh xe ma anh goc cho thay.
    const IR_TILT = 0.42, IR_PINWHEEL = (25 * Math.PI) / 180;
    const IR_ROT = [Math.PI / 2 + IR_TILT, 0, Math.PI / 2];
    // NHO HON 0,63 LAN (user: "cho cac luoi kiem nho lai va tang so luong"). Ty le giu
    // NGUYEN de cai qua van la cai qua: 0,51 -> 0,32 dai, 0,15 -> 0,095 lech ngon,
    // 0,050 -> 0,030 nua-ban. So kiem chung van dung o ban moi: chu vi vong 9 luoi
    // 2*pi*0,56 = 3,52, sau luoi 9*0,32 = 2,88 = 82%, nen be ngang 0,06 van nho hon
    // nhieu so voi chieu dai - six cai qua to dan den mot cai la, chin cai nho thi
    // doc thanh vong. Day soi luong cung ti le 0,63: [0,008 goc mong, 0,016, 0,030 vai
    // o 50% dai, 0,026, 0,015, 0,001 ngon het]; vai roi tu tu qua 3 dot, khong nhay cap
    // - mot nhay cap trong MỘT dot ra tam giac (shot19), loi da tra gia o quat tren dau.
    const IR_RING_PTS = [[0, 0], [0.003, 0.08], [0.010, 0.16], [0.028, 0.23], [0.057, 0.28], [0.095, 0.32]];
    const IR_RING_W = [0.008, 0.016, 0.030, 0.026, 0.015, 0.001];
    // THEP: cung #e8e2f2 voi quat tren dau (median 247px sat<=30 = #f7f1f5, triet chung
    // "ca hinh CHI CO MOT BANG KIM LOAI" nhu zed_chibi :2566).
    // 0,28 -> 0,88: ban cu render ra GIAY TRANG, do do photo do tren vong luoi sau khi
    // xoay ngang (/tmp/ill-shot24): p25 135 -> p90 189 tuc co DANH ROI sang toi, trong
    // khi ban 0,28 nam dong o p25 = p50 = 199 voi 81% px >190 = mot mat trang ket.
    // Kim loai chi sang khi co environment; chanh dien co scene.environment (world.js)
    // nen o day metalness that su chay - khong phai la con so de trang tri.
    // Emissive giam 0,30 -> 0,10 vi 0,30 de len metalness 0,88 ta duoc mot dia trang
    // khong con khoi; no chi con de giu bong dang trong dem toi.
    const ringM = mat('#e8e2f2', { metalness: 0.88, roughness: 0.16, emissive: hero.skillColor, emissiveIntensity: 0.10, side: THREE.DoubleSide });
    // thick 0,014 -> 0,006: ban nam ngang thi do day khong con tao bong dang (khong ai
    // nhin vao canh cua no nua), chi lam ngon luoi day up; 0,006 -> 0,005 khi thu nho
    // 0,63 lan de ti le day:dai khong doi. LUONG cung thu theo ti le do, 0,022 -> 0,014,
    // de goc nghiet giu NGUYEN: atan(0,014/0,030) = 25,0 do, LECH NHAU 50 do, van la
    // duong sang chay doc giua moi canh qua khi vong xoay. Luong ma giu 0,022 tren ban
    // 0,030 thi ra cai lều 36 do, mat hết chất thép.
    const ringGeo = finPlate(IR_RING_PTS, IR_RING_W, 0.005, 0.014);
    const ring = new THREE.Group();
    ring.position.y = IR_RING_Y;
    // THU/RA 0,075 (user 2026-11-13: "vong tron 9 luoi kiem se thu ra thu vao theo
    // chuyen dong"). LECH MOT CHIEU 0,56 -> 0,635, khong giao phoi hai ben cua 0,075,
    // vi 0,56 LA CAI DA DUOC DO: /tmp/ll3d/breathe.mjs chay 6 tu the voi breathe = 0
    // (vet day cua bien do) ra khe ho nho nhat giua luoi va mui cau vai 0,0734 luc lay.
    // An SAU hon nua la an vao 0,0734 do. Ra NGOAI thi do lai duoc bang do luong cung
    // probe: day 1 -> ban kinh dinh 0,667 (loi ngoai 0,6028 + 0,064), |x| lon nhat cua
    // moi dinh luoi 0,6648 van duoi vat rong nhat trong khung thumbnail 1,1484 (dia aura
    // #f59e0b), va sweep do lai o bien do day thi khe ho cau vai con 0,072 - tuc mo het
    // cung khong tao ra va cham moi. Hai ghe cach 2,4 (meta.json cushions) nen vong cua
    // hai nguoi ke nhau con 2,4/2 - 0,667 = 0,53 chen giua.
    ring.userData.breathe = 0.075;
    for (let i = 0; i < 9; i++) {
      // 20 do lech pha: khong co luoi dung giua mat truoc - hai luoi bien khung dang
      // ngoi, va khong co luoi nao dung thang sau lung (noi ma ao choang/cape nguoi
      // khac mac se chong). Chin luoi cach deu 40 do; hai luoi gan vai trai nhat o
      // 100 va 140 do van khong trung voi goc 130 cua quat tren dau, va le 20 do du
      // cho mot luoi khong roi vao sau gáy (180 do) noi ma nguoi xem thay ao choang.
      const phi = (i / 9) * Math.PI * 2 + Math.PI / 9;
      const g = new THREE.Group();
      g.position.set(Math.sin(phi) * IR_RING_R, 0, -Math.cos(phi) * IR_RING_R);
      g.rotation.y = Math.PI - (phi + IR_PINWHEEL);
      // luu goc va ban kinh goc: animateAvatar di tung luoi doc theo phuong kinh cua
      // chinh no. Khong keo scale cua ring - no se bien dang ban luoi (moi luoi nam
      // mot huong khac nhau nen x/z co lech) va ban luoi to ra cung voi vong to ra.
      g.userData.phi = phi;
      g.userData.r0 = IR_RING_R;
      g.add(m(ringGeo, ringM, 0, 0, 0, { rot: IR_ROT, cast: false }));
      ring.add(g);
    }
    root.add(ring);
    vfxGroup.userData.bladeRing = ring;
    // GIAP BAC TREN AO HONG (user: "them 1 vai chi tiet giap sat (bac) tren ao hong").
    // Ba cho: nguc (mot phien), that lung (mot ong tron), cau vai (mui + vien). Tat ca
    // dung DUNG MOT object material voi vong kiem (ringM o tren, #e8e2f2 metalness
    // 0,88) - them mot hex bac moi la them mot thu thep duoi den chanh, pham
    // "ca hinh CHI CO MOT BANG KIM LOAI" (zed :2594, quat tren dau :2104).
    // Gan vfxGroup = frame upper-local (y 0 = that lung; root-local = +0,30). KHONG gan
    // arm: arm quay quaternion va scale.y = len/0,44 moi frame (ly do ghi o zed :2596),
    // giap gan tay se bi keo dai theo dang tay.
    // VONG KIEM QUET QUANH CAO VAI: bien THAT cua vong do bang probe (/tmp/ll3d/env.mjs
    // va /tmp/ll3d/clash.mjs tren 1 620 dinh cua 9 luoi, root-local) = loi trong 0,4945,
    // loi ngoai 0,6028, dai cao do 0,6352..0,6973 (upper 0,3352..0,3973). Day la hai
    // luong ke cho moi chi tiet giap o ngang vai, khong phai con so 0,56 cua tam vong:
    // ban luoi nghieng nen loi trong no gan truc hon tam.
    // KHE HO DO TREN DINH THAT, khong phai tu bien cua tam vong (/tmp/ll3d/clash.mjs,
    // cung 1 620 dinh cua 9 luoi doi chieu voi dinh cua tung mieng giap):
    //   phien nguc 0,1199 | ong that lung 0,2069 | mui + vien vai 0,157..0,228.
    //   upper VUA LEO VUA NGHI theo pose nen BOX cua mot mieng doi theo tung frame,
    //   va KHE HO CUA MUI DOI THEO POSE (mui gan vao arm): gia tri nho nhat trong 6
    //   tu the la 0,0734 luc lay - xem sweep ghi o ngay CAU VAI ben duoi.
    // Ao la LatheGeometry(ROBE_PROFILE) dat y -0,05 scale z 0,88 (:2825), nen moi phien
    // giap duoi day dat DUNG y -0,05 va scale [1,1,0,88]: ban kinh giap = ban kinh ao
    // cong ra theo chinh ROBE_PROFILE noi suy tuyen tinh, khong phai mot vong tron
    // cham vao ao phia tren (ao thon: 0,40 o t 0,25 ma 0,26 o t 0,62).
    const robeR = (t) => {
      const i = Math.max(1, ROBE_PROFILE.findIndex((p) => p.y >= t));
      const a = ROBE_PROFILE[i - 1], b = ROBE_PROFILE[i];
      return a.x + (b.x - a.x) * ((t - a.y) / (b.y - a.y));
    };
    // TIEN = MOT PHIEN nguc + MOT dai bac + HAI cau vai, va ba thu NOI LIEN nhau
    // thanh mot bo giap. Ban dau la HAI phien chong nhau 0,020 (duoi 140 do
    // t 0,41..0,48, tren 76 do t 0,47..0,62). Da xoa phien tren sau khi do bang anh
    // (/tmp/ill-shot28/body.png, dem pixel tung dong anh): hai canh tay bat cheo
    // (arm tam upper 0,38 ban kinh 0,105, + ban tay nam TRUOC ao o z -0,36) phu het
    // mat nguc tu upper 0,28 den 0,50, nen mot tam chi vong ±38 do quanh mat truoc
    // khong toi duoc MAY ANH - giap khong ai nhin thay la cong viec von. Thay bang
    // cach keo phien duoi LEN t 0,52: chan mui vai gam vao day no, va hai mieng ben
    // (azimuth ±70) van lo ra ngoai canh tay, nen van la 140 do chu khong phai 76.
    const plateGeo = (t0, t1, deg, off, seg) => new THREE.LatheGeometry(
      Array.from({ length: 6 }, (_, i) => { const t = t0 + ((t1 - t0) * i) / 5; return new THREE.Vector2(robeR(t) + off, t); }),
      seg, Math.PI - (deg * Math.PI) / 360, (deg * Math.PI) / 180);
    // 140 do (±70): bien phien o azimuth 70 dat x 0,388*sin70 = 0,365 va z
    // -0,388*cos70*0,88 = -0,117, tuc phien vong qua ca hai mat BEN cua ao chu khong
    // rieng mat truoc. 24 dot tren 140 do = 5,83 do/dot, day cung 0,388 thi loi day
    // cong vao trong 0,0005, nho hon 32 lan lech do duoc nen khong lo rong nen hong.
    vfxGroup.add(m(plateGeo(0.40, 0.52, 140, 0.026, 24), ringM, 0, -0.05, 0, { scale: [1, 1, 0.88], cast: false }));
    // THAT LUNG BAC = mot ong tron BOT LEN KHAN HONG, khong phai mot dai moi o tren.
    // Cylinder lo mo 0,400 cao 0,06 (ban da thu, cung mot render ay) ra mot dai
    // XAM-XANH: mat phang co phap tuyen nam NGANG, den chanh dat o tren cao nen chi
    // rai den no, khong bat duoc sang nao. Do bang PIL tren body.png thi dai do nang
    // ~0,55 do mau trong khi cau vai CUNG ringM dat 0,85 - mot thu thep ra hai mau la
    // loi cua HINH, khong cua material. Torus co mat tron nen duong dinh no sang
    // giong cau vai.
    // Dat o upper 0,14 = DUNG tam khan hong (sashM :2827, cylinder 0,39-0,41 cao 0,14
    // tai y 0,14 tuc 0,07..0,21): khan 0,40 o do cao ay, loi ong 0,405-0,030 = 0,375
    // nen ong bam 0,025 vao vai va chi lo ra ngoai 0,035. Lo nhieu hon (0,047 o ban
    // 0,415/0,032 da render) thi vong tron bi tach khoi quan thanh mot chiec vong
    // choi troi; bam sau vao vai thi no doc la dai THAT LEN khan, khong phai vong
    // QUANH quan. Nho do so dai ngang tren nguoi giam tu BON (bac - hong sam - hong
    // nhat - hong sam) xuong HAI, khong con dai hong tron chen giua hai mieng giap.
    // KHONG scale z 0,88 nhu ao: khan hong cung khong bop, nen dai bac phai tron nhu
    // no; neu bop 0,88 thi mat truoc loi 0,11 trong khi hai ben chi loi 0,05.
    vfxGroup.add(m(new THREE.TorusGeometry(0.405, 0.030, 10, 32), ringM, 0, 0.14, 0, { rot: [Math.PI / 2, 0, 0], cast: false }));
    // CAU VAI GAN VAO ARM, khong gan vfxGroup. Ban dat trong vfxGroup o (0,32; 0,455)
    // la CAI SAI POSE: moi frame (:3194) hai tay bi ghi de hoan toan - tam a.position
    // = _sh + 0.5*d, quaternion = setFromUnitVectors(down, d), scale.y = len/0,44, voi
    // KHOP VAN _sh = (s*0,27; 0,58; -0,04) upper-local va ban tay nguyen tay o
    // (s*0,05; 0,50; -0,36). Tuc tay di ra MAINH VE PHIA TRUOC (+z -0,32 tren -y 0,08,
    // nghieng 11 do so voi mat ngang), khong xuong duoi; mui vai nam tinh o 0,455
    // chung loc thanh hai tam boc ngang NGUC, khong trong deo tay nao (user: "cau vai
    // khong khop voi pose cua 2 canh tay").
    // y = 0,22 trong frame cua arm la DUNG KHOP VAN, va do la mot hang so: arm o tam
    // _sh + 0,5*d, local +y huong ve _sh, do dai thuc cua nua arm = 0,5*len nhung
    // khung local da bi nhan len len/0,44 -> 0,5*len * 0,44/len = 0,22. The so 0,44
    // HEN, nen moi pose (ngoai, chay, lay, dam, tay buong) deu quy ve _sh.
    // Ly do zed (:2714) not giap gan tay day la arm scale.y keo dai luoi theo dang tay;
    // o day mui la KHOI TROI XUNG QUANH TRUC cua no nen bi keo cung truc chi bien no
    // thanh mui sau/hon mot ti (len 0,397 ngoai -> 0,902; 0,512 tay buong -> 1,164),
    // van la mui vai. Vien torus di cung mui nen chan vien luon luon trung mui.
    // KINH so voi vong kiem do qua sweep POSE (/tmp/ll3d/sweep.mjs: 6 tu the, moi tu
    // the do dinh that cua 9 luoi doi chieu dinh cua mui + vien, lay gap nho nhat):
    //   dung 0,180/0,171 | thien 0,175/0,157 | giua k 0,176/0,166 | tay buong
    //   0,228/0,210 | LAI 0,073/0,074 (upper nghien -1,15 rad nen vai xuong gan
    //   banh xe nhat). Nho nhat trong 6 pose = 0,0734.
    //   So voi ban cu (mui nam tinh trong vfxGroup o upper 0,455): 0,0384, tuc ban
    //   nay rong hon 1,9 lan, VA khong con phai chiu loi vong 0,4945 theo ban kinh
    //   vi tam mui o upper 0,58 = root 0,88, cach dai luoi 0,6352..0,6973 den 0,18.
    //   Cung sweep: phien nguc 0,1199 luc dung / 0,2539 luc lay (upper nghieng nen
    //   phien ngua ra xa vong), ong that lung 0,2069 luc dung / 0,1362 luc lay.
    // 0,19 cua zed -> 0,15: vai o day da cao nen khong can mui lon de choang; 0,15
    // phu khit khop (ban kinh arm 0,105) va loi trong 0,27-0,148 = 0,122 nam duoi
    // khoi dau (dau tam upper 0,98 ban kinh 0,46, o cao do 0,58 rong 0,227) - mui
    // trom vao co nhu vai that, khong noi tro lenh denh.
    for (const s of [-1, 1]) {
      const arm = arms[s < 0 ? 0 : 1];
      arm.add(m(new THREE.SphereGeometry(0.15, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
        ringM, 0, 0.22, 0, { scale: [1, 0.86, 1], cast: false }));
      arm.add(m(new THREE.TorusGeometry(0.1482, 0.016, 8, 22), ringM, 0, 0.1998, 0,
        { rot: [Math.PI / 2, 0, 0], cast: false }));
    }
    // KHONG co dai lua khaan bay sau lung (da thu, hai lan): gan vfxGroup thi dai lua
    // moc ra o (0,20; 0,48) = DUNG CHO DANH TAY moc ra, va no bay ra NGANG nen render
    // ra hai canh tay thu ba (/tmp/ill-shot17/body.png). Muon no khong tranh chan tay
    // thi phai dat sau lung hoan toan va luc do may quay frontal chi con thay mot vet
    // hong mo - khong bang noi dung da bo. Hong cua khaan van con o that lung (sashM
    // :2770 dung hero.sashColor) va tren tay ao, dung nhu anh goc: khaan cua Irelia la
    // dai vo ngang nguoi, khong phai dai bay.
  } else if (id === 'ahri_chibi') {
    // QUAT CHIN DUI = "linh ho cuu vi", cai choa trang sau lung trong anh goc. Gan ROOT
    // chu khong gan upper/vfxGroup: upper quay -1,15 rad luc lay (:3660) nen quat gan
    // upper se ngua theo nguoi va dap xuong san; chin doi moc ra TU LUNG, khong phai
    // mang theo tung dong nguoi.
    // MOT duong sinh + MOT phep quay cho moi cap doi: hai ban lech nhau mot li la hai mat
    // cung transform va chung z-fight ca khi ngoi yen. Chieu doi duoc phan ban bang
    // scale.x = -1 (guong qua mat phang doc), khong bang mot geometry dao nguoc, nen
    // "hai ben bang nhau" la DO DUOC chu khong phai tin tuong.
    // DUONG SINH = CUNG TRON do (L, psi0, turn) cho: psi0 la HUONG DI cua goc (do tu
    // truc +x, nguoc chieu kim dong ho), turn la tong quay do doc theo do dai - PROFIL
    // TUONG ONG vi do cong khong doi thi duong sinh la mot cung tron that, tuc doi chay
    // VONG QUANH nguoi chu khong bay thang ra tam diem.
    // Sao phai vong chu khong phai xa dan: chin doi phan khoang tu MOT diem + bien ngoai
    // la vong tron tam diem = dinh nghia cua hoa sen, va do chinh xac la cai ma vong
    // 13..18 ra (/tmp/ahr-shot16, /tmp/ahr-shot18). Anh goc ve khac: duoi moc o lung,
    // di XUONG va ra ngoai mot quang, roi bun nguoc LEN - ngon nam tren vong cung ban
    // kinh ~0,9 quanh hong va CHIEU TIEN theo tiep tuyen vong do, khong phai theo ban
    // kinh. turn 130..150 do la do tu chinh anh; 180 do (da thu trong /tmp/ahri-fan.mjs)
    // gập qua mat va render thanh cai tuyet/sanh donut.
    // Doi giua (i=0) co psi0 = 90 va turn = 0: cos(90 do) = 0 chang, nen no nam NGUYEN
    // TRONG mat phang x = 0 - doi xung cua bon ben khong bi no lech di. No van cong ra
    // sau (+z) nen khong phai cai cot gang.
    // Van guong duoc qua scale.x vi psi0/turn nam TRONG duong sinh, khong trong phep quay.
    // DAI/NGAN khong deu nhau (1,00..1,15) va CACH NHAU KHONG DEU (psi0 -15/-30/-45/-55):
    // deu nhau = thuoc do. Anh goc cho hai doi ngoai VONG LAI PHIA TRUOC hai ben hong
    // nen do sau cung khong phai hang so: back 0,18 o doi cao nhat xuong -0,06 o doi
    // tha nhat - quat co chieu sau thay vi mot tam quat giay cat tren cung mot mat
    // phang (van de /tmp/ahr-shot12).
    // PRIMITIVE: RIBBON chu khong phai FINPLATE. Ba vong tryen /tmp/ahr-shot11..14 deu
    // dung finPlate (phieng phang, khong UV, khong nhan smooth) va ca ba vong render ra
    // "hoa sen/canh la bang giay": bien cua no la duong thang noi lien cac ga nen moi
    // ngon la mot tam giac co duong giua noi, va khong co khoi. ribbon() sinh tiet dien
    // tron theo Frenet frame co san phap tuyen smooth - do la thu duy nhat doc ra la
    // LONG, khong phai vai. tiet dien tron cung nghia la doi nhin tu moi goc deu ra khoi,
    // khong bi mat khi nghieng nhu phieng phang.
    const TAIL_N = 12;
    const tailSpine = (psi0, turn, back, L) => {
      const pts = [];
      const n = TAIL_N, ds = L / (n - 1), D2R = Math.PI / 180;
      let x = 0, y = 0;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        pts.push([x, y, back * t * t]);
        if (i === n - 1) break;
        // goc trung binh tren doan de Euler khong tro (dpsi/ds = turn/L = hang so).
        const tm = (psi0 + turn * t + psi0 + turn * (t + 1 / (n - 1))) / 2 * D2R;
        x += Math.cos(tm) * ds;
        y += Math.sin(tm) * ds;
      }
      return pts;
    };
    // RS = ban kinh tiet dien theo 15 dot (seg 14 + 1). Day la bien THAT cua doi = 2*rs.
    // HINH DANG = CO MIN - BONG PLUME: co van min suot nua dau, bung dan 0,106 o 50%
    // len 0,184 o 86% roi DONG LAI trong hai dot cuoi (0,142 -> 0,024).
    // Vi sao co phai MIN: do luong anh goc cho thay phan TO chi la 1/3 cuoi cua doi, hai
    // 2/3 dau la mot soi min di VONG sau nguoi. RS bung do o 42..71% (vong 16) thi hai
    // 2/3 dau cua bon doi chong len nhau thanh MOT KHOI MEM va mat bien tach - do la ly
    // do /tmp/ahri-fan.png vong 18 ra hai dam may thay vi chin doi.
    //  (a) Peak 0,184 o 86% chieu dai, khong phai 100%: mui plume TRON, khong phai kim.
    //      Do day 13/11 (lenh user "moi chiec duoi dang hoi bi mong nho"): bung
    //      0,156 -> 0,184 va 6 dot lien truoc cung nhac ~18%, HAI DOT dau GIU NGUYEN
    //      min (0,013/0,023) vi tiet dien goc 26 mm la thu GIU cho chin ngon TU MOT
    //      DIEM (xem ghi chu "SO 0,42" o duoi). Bung them ma khong xoe thi hai ngon cao nhat
    //      lech nhau 12 do va chui vao vom toc: gate do tu MESH (silhouette.mjs, 6 frame
    //      dang di) bao 138..192 dinh nam TRUOC be mat toc, khong phai 6. Con so 6 den tu
    //      cong thuc tai lieu chi biet khoi cau dinh dau 0,485, trong khi toc Ahri LA BON
    //      VO 0,494..0,524 nhan doc 1,09 + u to, ban kinh hieu dung 0,607 tuc rong hon
    //      cong thuc ~15%. See "Cong bong de" trong SKILL.md.
    //  (b) ribbon khong nap hai dau, loi cuoi rong bang 2*rs[14] = 0,048 theu = 3 px o
    //      anh 144px, an sau mui tron nen khong con duong vi den (vong 16 de 0,060 va
    //      /tmp/ahr-shot16 render ra chin cai ong rong).
    //  (c) flat = 1: tiet dien TRON, khong ep thanh dai. Ep doc nao cung phai chon mot
    //      trong hai truc, ma Frenet normal cua cung tron nam TRONG mat phang cong (no
    //      chi ve tam vong), nen flat < 1 se lam doi MEP DI theo huong no vong - dung la
    //      dieu nguoc lai voi can. Tron thi nhin tu goc nao cung ra khoi.
    const RS = [0.013, 0.023, 0.038, 0.066, 0.078, 0.092, 0.106, 0.122, 0.137, 0.151, 0.165, 0.177, 0.184, 0.142, 0.024];
    // MAU = bai toan hai buoc, khong phai "nhac sang cho dep":
    //  (1) Median hai hop duoi trong anh goc: #b8b8d8 (228 px, x 348..400 y 169..220)
    //      va #d0d0e8 (180 px, x 369..420 y 230..296); highlight #f0f0f0 (286 px).
    //  (2) Nhung do la MAU DA RENDER trong anh goc, con scene nay doi ngoi nguoi choi
    //      nen mat duoi HUONG NGUOC chieu sang. He so anh sang do truc tiep tren chinh
    //      kieu vat lieu nay (albedo #d0d0e8 -> pixel #9a9398 trong rear.png,
    //      /tmp/ahri-k.mjs): k = 0,700. Can 208/0,700 = 297 > 255, tuc kenh mau khong
    //      con cho dat duoc median do bang albedo thuan. Emissive la lop con lai:
    //      #e8e8f8*0,700 = (162,162,174) cong #2e2e3a = (208,208,232) = DUNG #d0d0e8.
    // Emissive cung khong doi duoc sac thai giua cac mat (k lech nhau van con), chi nen
    // dinh cua do sang.
    const tailM = mat('#e8e8f8', {
      roughness: 0.8, emissive: '#2e2e3a', side: THREE.DoubleSide,
    });
    const fan = new THREE.Group();
    // (0; 0,62; 0,42) root-local. LUU TOA DO TRUOC TIEN: day la goc cua `root`, va
    // `root` di theo dang: __api.rootProbe().baseY = 0 khi DUNG, 0,17 khi NGOI THIEN.
    // Nen mot diem y trong bang cong THEM baseY moi ra THE GIOI; moi so lieu do tru
    // hom 13/11 thieu 0,17 va PHAI DO LAI. Diem quy cua ban cu 0,86 nam o THE GIOI
    // 1,03 khi ngoi - gan ngang that cua nguoi ngoi va sau gay, tuc la NGUYEN NHAN
    // user bao "duoi nam dính ca vao toc".
    // 0,62 = THE GIOI 0,79 (khi ngoi): that lung hanbok 0,54..0,68 nen goc duoi THAT
    // LUNG 1 TI 110 mm (lenh 13/11). DO LA MOT PHEP TINH TIEN: ca quat di song song
    // 240 mm, L / psi0 / turn / back / w giu NGUYEN nen hinh dang khong doi chut nao.
    // SO 0,42 LA DO SÂU CUA DIEM QUY va no PHAI lon hon mat lung ao. rootProbe do
    // tren CHINH MESH trong scene (khong phai cong thuc noi suy tay): o cung do cao voi
    // goc, surface sau nhat cua THAN nam tai z 0,390, nen 0,26 cu la goc AN SAU 130 mm
    // BEN TRONG than. Hau qua khong phai "dem khong du 9" ma la "khong TU MOT GOC": moi
    // ngon chi lo ra khi xuyen qua mat than, tai MOT DO CAO KHAC NHAU, nen chin duoi
    // moc ra tu chin diem doc than chu khong tu mot diem. 0,42 = 30 mm NGOAI MAT AO
    // (khuat -0,03), chin tiet dien goc cung nam tai MOT cho (lech goc 0,012 m) va doc
    // ra la nhung dong tu mot goc. Do lai: silhouette.mjs <hero> --occ head --walk
    // --sweep 6 -> khuat -0,03 va DE LEN toc 0 o ca ba goc rear/q3/thumb.
    // TIET DIEN GOC CUNG PHAI MIN: RS[0] 0,028 -> 0,013, hai dot ke 0,036/0,045 ->
    // 0,023/0,034, tuc be ngang goc 56 mm -> 26 mm. Chin ngon 56 mm chong len MOT diem
    // van ra mot bui tron; min thi chung la chin soi rua dong tu, va bung 0,156 o 86%
    // khong doi nen ngon van day nhu cu. Nghieng X
    // 0,14 = 8 do. Ban 0,30 (17 do) la nguyen nhan that su cua ca hai loi "duoi de
    // len toc" va "nhin sau khong du 9": no nghiem mat phang quat ve phia may anh, nen
    // ngon cang CAO thi cang TIEN GAN may va chui vao tron vom toc (z tang them
    // y*sin 0,30 = 0,30*y). Voi 0,14 quat gan nhu thang dung trong mat phang may anh.
    fan.position.set(0, 0.62, 0.42);
    fan.rotation.x = 0.14;
    // 9 ngon = 1 doi giua + 4 doi guong qua mat phang doc. Bang [L, psi0, turn, back, w]:
    // psi0 do tu truc +x nguoc chieu kim dong ho, turn la TONG goc bun theo ca doi
    // (profil tuong ong = do cong khong doi = cung tron), w = nhan ban kinh rs.
    // DOI GIUA PHAI LA psi0 = -90, turn = 0, va chi vay: mot ngon khong ban soi muon
    // doi xung qua mat phang doc thi ca duong song cua no phai nam TRONG mat phang ay.
    // Ban cu [1,20; 30; 50] lech sang phai 38 do va la ngon DUY NHAT ve de len toc
    // (14 dinh) - no gay bat can bang va gay loi toc cung mot luc. -90 huong thang
    // xuong: do la ngon duoi rua sau lung, khong cat ngang toc chiec nao.
    // BANG NAY NGHIEM TU goc NHIN SAU bang .qoder/skills/temple-hero/scripts/
    // silhouette.mjs - do tu MESH THAT trong scene, khong phai cong thuc tai lieu.
    // Muc tieu la TACH NHAU, khong phai nam ngoai ban tron toc. Ba cot do:
    //   goc = dinh ngon trong hinh chieu may anh, tu truc +x cua diem quy (0 = ngang
    //         ben hong, 90 = thang dinh dau), in ra theo TUNG nhanh wi<N>R/L vi muon
    //         doi duong phai biet goc nao do ngon nao sinh ra. DANG DUNG (1 frame):
    //         wi1R -39,1 · wi2R 6,1 · wi3R 47,3 · wi4R 61,9 (doi giua wi0R -90),
    //         he nhat 14,5 do. DANG DI thi chin goc nay di dong ±4 do va he nhat xuong
    //         12,3 - do la con so gate chiu tai, vi duoi 12 hai ngon trung nhau tren
    //         vong tron va hoa thanh mot khoi = loi "nhin sau khong du 9" user da bao.
    //   bi an = dinh nam SAU be mat toc: 0 tren ca 9 ngon o goc sau (o goc nghieng 3/4
    //         thi ~1400 la DUNG, than che duoi, do khong phai loi).
    //   DE LEN TOC = dinh nam TRUOC be mat khoi toc (loi user phan anh hai lan): 0,
    //         o ca ba goc rear/q3/thumb VA phai la 0 tren FRAME XAU NHAT cua chu ky:
    //         nghieng duoi ±0,075 rad nen mot frame may man bao 0 trong khi dinh chu
    //         ky bao 192. Do = them --walk --sweep 6.
    // Cac goc dinh cua bang cu (-20 / 12 / 42 / 63) do bang cong thuc tai lieu, KHONG
    // CUNG THUOC DO voi bon con so tren, dung so sanh.
    // Bang cu co 4/9 ngon de len toc va 27 nam trong ban tron toc vi chung moc thang
    // len dung cho dung. Tu day chung xoe RONG ra hai ben roi moi moc len tron ben
    // dau - do la ly do L dai (1,10..1,58) ma van an toan.
    // ENVELOPE = min/max qua 6 frame x 3 goc may x 2 dang, cung phep do tren (mot prop
    // dong KHONG CO mot con so bien, nen ghi ca dai): |x|max 1,04..1,09 (luoi thumbnail
    // 1,1484, het 95%), CAO NHAT 1,72 khi dung va 1,89 khi ngoi (dinh toc 1,982: ngon
    // cao nhat dung NGAY ben dau chu khong qua dinh; 0,17 cua baseY khi ngoi la phan
    // chay het), sau nhat z 0,99..1,02, THAP NHAT 0,008 - ngon doi giua rua xuong gan
    // SAT SAN (san 0, tran 2,10). Do la ly do khong duoc dai L them ma khong do lai cot nay.
    // DOI CAO NHAT: turn 86/126 -> 82/112 (dong 3 va 4) cung luc voi luc bung RS
    // 0,156 -> 0,184. Voi bung 0,184 thi 126 de lai 138..192 dinh nam TRUOC vom toc
    // theo gate do tu mesh, trong khi cong thuc tai lieu bao 0 - ly do: cong thuc chi
    // biet khoi cau dinh dau R 0,485, con toc Ahri that la BON VO 0,494..0,524 nhan doc
    // 1,09 cong u to, ban kinh hieu dung 0,607 tuc rong hon ~15% (xem SKILL.md).
    // Gia turn la xoe RONG ngon ra ben hong cho no khong ngot qua vom: nut min bang
    // 0,84/0,82 tren cung bung thi turn 82 van con 2..6 dinh, tuc lech do la lech
    // RONG chu khong lech MIN (nhan min la hu viec user da yeu cau "day len 1 ti").
    const TAILS = [
      [0.44, -90, 0, 0.50, 0.72],
      [1.10, -58, 96, 0.45, 0.90],
      [1.14, 2, 44, 0.45, 0.90],
      [1.36, 2, 82, 0.00, 0.90],
      [1.58, 2, 112, 0.00, 0.90],
    ];
    TAILS.forEach(([L, psi0, turn, back, w], i) => {
      // seg 14 de du 3 dot cuoi dong kin ngon (RS (b)); rad 8 = bat giac, du tron cho
      // mot ngon duoi 0,31 be va giu ca quat o 14*8*2*9 = 2016 tam giac - swiftshader
      // trong sảnh chay ~3fps nen so luong nay la ro rang.
      const geo = ribbon(tailSpine(psi0, turn, back, L), 0, 0,
        { seg: 14, rad: 8, flat: 1, rs: RS.map((v) => v * w) });
      for (const s of i ? [-1, 1] : [1]) {
        const g = new THREE.Group();
        g.scale.x = s;
        g.userData.wi = i;
        // sg = ben duoc guong (1 = phai, -1 = trai). HOAT HINH CAN sg: hai nguon lech
        // nhau phai TRAI NGUOC DIEU mot thi bong cai quat moi doi xung qua mat phang x=0
        // (Rz(t2)*D = D*Rz(t1) chi nghiem voi t2 = -t1), khong phai lech cung chieu -
        // lech cung chieu thi cai quay guong nhau nhu banh xe va mat ben lech ben thang.
        g.userData.sg = s;
        g.add(m(geo, tailM, 0, 0, 0, { cast: false }));
        fan.add(g);
      }
    });
    root.add(fan);
    vfxGroup.userData.tailFan = fan;
    // NGOC = qua cau lam Ahri nam trong tay o anh goc. Day la vfxGroup = frame upper-local
    // nen no di theo nguc, khong loi khi nguoi choi lay.
    // VI TRI (0,36; 0,58; -0,50) upper-local = root-local (0,36; 1,03; -0,50): o anh goc
    // ngoc nam BEN HONG MAT, khong truoc nguc (crop 0,10..0,38 x 0,28..0,54: tam ngoc o
    // x 55/512 = 0,49 lan chieu cao than lech truc than, y 180/512 = ngang mat). Tay Ahri
    // trong anh giua luc nhao nen khong the bay xa den the trong chieu ngang 1,078 cua chieu
    // ngoi; 0,36 la lech ra NGOAI VA TREN vai, gan nhat ma khong chep len ao. Kiem tra
    // chong: ao ban kinh 0,40 o cao do 1,03 nen mat truoc ao o z -0,17 tai x 0,36 - ngoc
    // cach no 0,33; khoi cau dau o y 1,11 co ban kinh cat ngang sqrt(0,46^2-0,41^2)=0,21
    // nen ngoc duoi hon 0,08 thi da thoat bien mat.
    const orb = new THREE.Group();
    orb.position.set(0.36, 0.58, -0.50);
    // CAU TRUC NGOC = ba lop dong tam. TI LE KICH HUOC do bang mat duoc tren crop ngoc
    // (195 px cua anh = 0,476 lan; so ra anh goc 512 px, than 410 px = 1,78 theu):
    //  (a) LOI trang-xanh #90f8f8 duong kinh 25 px = 0,11 theu -> ban kinh 0,055.
    //  (b) QUA CAU XANH duong kinh 80 px = 0,35 theu -> 0,155. Day la lop LAN, khong
    //      phai vien: vong tron xanh la vat the that, loi chi chiem 1/3 no.
    //  (c) HAO duong kinh 103 px -> 0,215 = 1,4 lan lop (b).
    // Vong truoc dao nguoc ti le (loi 0,075 gan bang vo 0,118) nen pixel giua ngoc la
    // 0,95 cong 0,55 cong 0,30 ba lop cong dan den trang te, khong con gi la xanh.
    // MAU do tung hop: loi #90f8f8 (68 px, x 102..154 y 184..236); vo #4890f0..#5098f0
    // (62 px vong vien); hao bang hero.skillColor #72c9f9 - cung ho xanh cua ngoc.
    // Ba ban kinh 0,055 < 0,155 < 0,215 khong hai mat nao chung: khong z-fight.
    const orbCore = new THREE.MeshBasicMaterial({ color: '#90f8f8', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    const orbRim = mat('#4890f0', { emissive: hero.skillColor, emissiveIntensity: 0.3, roughness: 0.35, transparent: true, opacity: 0.86 });
    // QUA CAU, khong phai IcosahedronGeometry: bac 1 cua khoi hai muoi hai mat ngu giac
    // phang, moi mat mot phap tuyen, nen du roughness 0,15 van ra vien NGOC thay vi mot
    // qua cau mau - va do la anh 512 px, o thumbnail 40 px no thanh cai bat ky.
    orb.add(m(new THREE.SphereGeometry(0.055, 12, 8), orbCore, 0, 0, 0, { cast: false }));
    // SO LAI sau vong 22: ba lop cong don (loi 0,95 + mem 0,42 + hao 0,22, deu mau
    // xanh-lac #90f8f8/#72c9f9) lam TRON CA VIEN XANH do cua vo, va do bang vong tron
    // tam ngoc tren /tmp/ahr-shot23/front.png thi 4 dai ban kinh 0..27 px deu ra
    // #d9fbff - tuc ngoc chi con mot dia trang, khong con cau truc loi-trang/vo-xanh.
    // Nen: lop mem cut tu 0,09 x 0,42 xuong 0,075 x 0,28 (no nam trong loi 0,055 + 1/4
    // vien, khong lan ra 3/4 vien con lai) va vo bo phat sang manh: emissiveIntensity
    // 0,9 -> 0,3, roughness 0,15 -> 0,35, opacity 0,72 -> 0,86 de mau #4890f0 cua chinh
    // no la mau cua vien, khong phai mau cua den.
    orb.add(m(new THREE.SphereGeometry(0.075, 12, 8),
      new THREE.MeshBasicMaterial({ color: '#90f8f8', transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }),
      0, 0, 0, { cast: false }));
    orb.add(m(new THREE.SphereGeometry(0.155, 16, 12), orbRim, 0, 0, 0, { cast: false }));
    // Khong co hao quang thi ngoc la mot qua cau xanh deo, trong khi anh goc cho mot chum
    // sang loe mu. Cung kieu hop nien voi hazeM cua leesin (:2754).
    const halo = m(new THREE.SphereGeometry(0.215, 14, 10),
      new THREE.MeshBasicMaterial({ color: hero.skillColor, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }),
      0, 0, 0, { cast: false });
    orb.add(halo);
    // Tham chieu TEN, khong phai children[i]: lop mem xen vao giua loi va vo da doi
    // chi so cua hao tu 2 sang 3, va opacity cua vo la vat lieu mat() DANH THEO KHO
    // (cache theo mau + opts) nen ai do khong dung chung khoa se bi nhap chay theo.
    orb.userData.halo = halo;
    vfxGroup.add(orb);
    vfxGroup.userData.ahriOrb = orb;
  }

  return vfxGroup;
}

// Vầng sáng dưới chân nhân vật
// Bán kính 0,86 (từng là 1,15): dải sáng của auraTex nằm ở 0,7..0,88 mặt đĩa, nên vòng
// nhìn thấy có bán kính 0,8 × r × AV_SCALE. Với r cũ là 0,75m trong khi thân rộng nhất
// 0,42 (ROBE_PROFILE) × 0,82 = 0,34m, tức vòng cách thân gấp 2,2 lần — floor trống giữa
// chân và vòng. 0,86 cho 0,57m, gấp 1,64 lần thân: vẫn là quầng, không còn là thảm.
const auraGeo = new THREE.CircleGeometry(0.86, 40);
let auraTexCache = null;
function auraDisc(color) {
  if (!auraTexCache && typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 18, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,255,255,.78)');
    grad.addColorStop(0.7, 'rgba(255,255,255,.25)');
    grad.addColorStop(0.88, 'rgba(255,255,255,.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    auraTexCache = new THREE.CanvasTexture(c);
  }
  const disc = new THREE.Mesh(
    auraGeo,
    new THREE.MeshBasicMaterial({ color, map: auraTexCache, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.03;
  disc.renderOrder = 1;
  return disc;
}

// Vầng sáng dưới chân người CHƠI THẬT thì theo vận/bậc (auraOf trong ladder.js), không
// theo tướng hay áo nữa: màu = hue của khung vận, độ toả = bậc 1/2/3 trong vận đó. NPC vẫn
// dùng màu của tướng vì họ không có bậc. world.js gọi hàm này cùng nhịp với hào quang sau
// gáy, tức là đổi bậc thì cả hai thứ đổi một lần, không phải dựng lại avatar.
export function setAuraRung(av, level) {
  const a = auraOf(level);
  if (av.aura) {
    av.aura.material.color.set(a.color);
    av.aura.scale.setScalar(a.scale);
  }
  av.auraBase = a.base;
  av.auraAmp = a.amp;
  return a;
}

let autoHeroIdx = 0;
function resolveHero(opts = {}) {
  const ap = opts.appearance || {};
  if (ap.hero && HERO_MAP[ap.hero]) return HERO_MAP[ap.hero];
  if (opts.hero && HERO_MAP[opts.hero]) return HERO_MAP[opts.hero];
  // Gán tự động đa dạng cả bộ sưu tập tướng cho NPC / đạo hữu trong chùa
  const seedStr = `${ap.hair || ''}:${ap.skin || ''}:${opts.robe?.color || ''}`;
  if (seedStr !== '::') {
    let h = 0;
    for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
    return HERO_LIST[(h + (autoHeroIdx++)) % HERO_LIST.length];
  }
  return HERO_LIST[(autoHeroIdx++) % HERO_LIST.length];
}

let autoOutfitIdx = 0;
function resolveOutfit(opts = {}) {
  const ap = opts.appearance || {};
  if (ap.outfit && OUTFIT_MAP[ap.outfit]) return OUTFIT_MAP[ap.outfit];
  if (opts.outfit && OUTFIT_MAP[opts.outfit]) return OUTFIT_MAP[opts.outfit];
  if (opts.autoSansaOutfit) {
    const sansaIds = ['sansa_sage', 'sansa_lotus', 'sansa_celadon', 'sansa_kasa', 'hanbok_maru', 'default'];
    return OUTFIT_MAP[sansaIds[(autoOutfitIdx++) % sansaIds.length]] || OUTFIT_LIST[0];
  }
  return OUTFIT_LIST[0];
}

export function makeAvatar(opts = {}) {
  const hero = resolveHero(opts);
  const outfit = resolveOutfit(opts);
  const useOutfitColors = outfit && outfit.id !== 'default';
  // Món áo trong túi có màu riêng (data.color / data.sash trong meta.json). Hai dòng
  // dưới chỉ nhìn tướng và pháp phục nên mặc áo nào cũng ra màu của tướng: 19 món áo
  // mua xong không đổi gì trên nhân vật.
  // costumeLocked: bộ đồ là HOÁ PHỤC, không phải áo khoác - màu do tướng quyết, kể cả khi
  // lời gọi truyền vào một tấm áo màu khác. Hai chỗ truyền màu đỏ: heroScene trong
  // thumbs.js trung hoà mọi ô chọn nhân vật bằng robe {color '#8f6a3e', sash '#6b2416'}
  // (đai nên ra ĐỎ chứ không vàng), và một món áo đã mua trong túi cũng đi qua đúng cửa
  // opts.robe đó. Hình này chỉ được phép là ĐEN-VÀNG, nên ba dòng dưới ưu tiên hero.
  const suitLocked = !!hero.costumeLocked;
  const rColor = (suitLocked && hero.robeColor) || opts.robe?.color || (useOutfitColors && outfit.robeColor ? outfit.robeColor : hero.robeColor);
  const pColor = (suitLocked && hero.pantsColor) || (useOutfitColors && outfit.pantsColor ? outfit.pantsColor : hero.pantsColor);
  const sColor = (suitLocked && hero.sashColor) || opts.robe?.sash || (useOutfitColors && outfit.sashColor ? outfit.sashColor : hero.sashColor);

  // KIEU DANG HANBOK: truong sam rong + co giao linh + vay + no goreum von o trong
  // OUTFIT_LIST (phap phuc Sansa), nay mot tuong cung dung duoc bang cach dat
  // `hanbokRobe: true` trong HERO_LIST. KHONG ve them geometry moi: mot kieu dang,
  // hai nguon (mon mua trong cua hang hoac hoa phuc cua tuong) thi hai nguon phai
  // trung het, neu tach ra hai nhanh la hai cai ao lech nhau mot li cung transform.
  // `sansa`/`wide`/`goreum` bang FALSE voi moi hinh cu, nen 17 hinh da ship khong
  // doi mot pixel nao.
  const sansa = !!outfit?.sansaRobe || !!hero.hanbokRobe;
  const wide = !!outfit?.wideSleeves || !!hero.hanbokRobe;
  const goreum = outfit?.hanbokRibbon || (hero.hanbokRobe ? hero.sashColor : null);

  const skinM = mat(hero.skin, { roughness: 0.52 });
  const robeM = mat(rColor, {
    roughness: sansa ? 0.82 : (hero.id === 'naruto_sage' && !useOutfitColors ? 0.3 : 0.65),
    emissive: hero.id === 'naruto_sage' && !useOutfitColors ? '#b45309' : '#000000',
    emissiveIntensity: hero.id === 'naruto_sage' && !useOutfitColors ? 0.35 : 0,
  });
  const pantsM = mat(pColor, { roughness: sansa ? 0.82 : 0.7 });
  const sashM = mat(sColor, { roughness: 0.5, metalness: 0.08 });
  // VAY (chima) di mot mau rieng thi chi Ahri khai; phap phuc Sansa van vay = ao nen
  // chimaM === robeM va hai dong lap/skirt duoi day giu nguyen han vi cu.
  const chimaM = hero.chimaColor ? mat(hero.chimaColor, { roughness: 0.82 }) : robeM;

  const root = new THREE.Group();
  const upper = new THREE.Group();
  root.add(upper);

  // Thân áo 3D Chibi (riêng Mũ Cam, Sừng Trâu, Mặt Nạ Sừng và Võ Sư Mù không có áo)
  // Võ Sư Mù: trong ảnh Lee Sin ở trần, chỉ có đai lưng — nên thân là da, không phải
  // robeColor. Mặc pháp phục Sansa vào thì thân lại là áo (điều kiện !sansaRobe).
  const bareChest = !outfit?.sansaRobe && (hero.id === 'ace' || hero.id === 'kaido' || hero.id === 'yone_chibi' || hero.id === 'leesin_chibi');
  const torsoMat = bareChest ? skinM : robeM;
  upper.add(m(G.torso, torsoMat, 0, -0.05, 0, { scale: [1, 1, 0.88] }));
  // Đai thắt lưng / Sash đặc trưng
  upper.add(m(new THREE.CylinderGeometry(0.39, 0.41, 0.14, 28), sashM, 0, 0.14, 0));

  // Tay & Bàn tay + Tay áo rộng Hàn Quốc (dance-sleeves từ Sansa Temple ?room=maru)
  const arms = [], hands = [];
  const sleeveGeo = new THREE.ConeGeometry(0.24, 0.42, 18, 1, true);
  const sleeveMat = mat(rColor, { roughness: 0.82, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const a = m(G.arm, torsoMat, s * 0.30, 0.38, -0.12, { rot: [1.0, 0, s * 0.5] });
    if (wide) {
      // Tay áo trường sam Hàn Quốc (One_continuous_soft_robe / dance-sleeves) rủ mềm quanh cánh tay
      a.add(m(sleeveGeo, sleeveMat, 0, -0.04, 0.04, { rot: [Math.PI, 0, 0], scale: [0.85, 1.0, 1.25] }));
    }
    const h = m(G.hand, skinM, s * 0.05, 0.5, -0.36);
    arms.push(a); hands.push(h);
    upper.add(a, h);
  }

  // Chi tiết 3D đặc trưng của Bộ Sưu Tập Trang Phục Sansa Temple (?room=maru) & Lễ Hội
  if (sansa) {
    // Cổ áo giao lĩnh chữ V Hàn Quốc (Beopbok / 승복) & Vạt xếp nếp prayerCloth
    const collarMat = mat('#f8fafc', { roughness: 0.75 });
    upper.add(m(new THREE.TorusGeometry(0.21, 0.035, 10, 24), collarMat, 0, 0.62, -0.02, { rot: [Math.PI / 2 + 0.22, 0, 0] }));
    const foldMat = mat(sColor, { roughness: 0.78 });
    upper.add(m(new THREE.BoxGeometry(0.22, 0.46, 0.04), foldMat, 0, 0.34, -0.33, { rot: [-0.12, 0, 0.18] }));
  }
  // Chuỗi Tràng Hạt đeo cổ: màu lấy từ món đang đeo (c1/c2 luân phiên, metal cho
  // chuỗi kim); pháp phục Sansa vẫn giữ chuỗi malaColor của riêng nó khi chưa đeo gì.
  // Vòng hạt cũ (x 0.25, y 0.46..0.66) nằm trọn BÊN TRONG thân: áo là LatheGeometry
  // có bán kính 0.345 ở cao độ 0.46, đầu chibi che xuống tới 0.52 — nên đeo chuỗi
  // nào cũng không thấy. Dải mới vẽ riêng cung trước (±109°) với bán kính 0.34 trễ
  // dần xuống 0.46 ở giữa ngực: đủ ló khỏi mặt áo, và không chui vào khối đầu.
  const mala = opts.beads?.c1 ? opts.beads : outfit?.malaColor ? { c1: outfit.malaColor, c2: outfit.malaColor } : null;
  if (mala) {
    const beadMats = [mat(mala.c1, { roughness: 0.35, metalness: mala.metal || 0.1 }),
      mat(mala.c2 || mala.c1, { roughness: 0.35, metalness: mala.metal || 0.1 })];
    for (let b = 0; b < 17; b++) {
      const ang = -1.9 + (b / 16) * 3.8;
      upper.add(m(new THREE.SphereGeometry(0.045, 10, 10), beadMats[b % 2], Math.sin(ang) * 0.34, 0.58 - Math.cos(ang) * 0.12, -0.04 - Math.cos(ang) * 0.34));
    }
    // Mặt ngọc ở đáy chữ V giữa ngực, hạt to nhất và bóng nhất của dây.
    upper.add(m(new THREE.SphereGeometry(0.06, 12, 12), mat(mala.c2 || mala.c1, { roughness: 0.22, metalness: (mala.metal || 0.1) + 0.25 }), 0, 0.44, -0.36));
  }
  if (outfit?.kasaColor) {
    // Y Hậu Cà Sa (Kasa / 가사) đỏ son viền vàng vắt chéo vai trái xuống hông phải
    const kasaMat = mat(outfit.kasaColor, { roughness: 0.6, side: THREE.DoubleSide });
    const kasaSash = m(new THREE.CylinderGeometry(0.37, 0.41, 0.44, 24, 1, true, -0.8, 3.6), kasaMat, 0, 0.36, 0, { rot: [0, 0, 0.34] });
    const goldRing = m(new THREE.TorusGeometry(0.065, 0.016, 10, 20), mat('#facc15', { metalness: 0.85, roughness: 0.2 }), -0.18, 0.48, -0.31);
    upper.add(kasaSash, goldRing);
  }
  if (goreum) {
    // Nơ áo Hanbok Goreum truyền thống Hàn Quốc trước ngực
    const ribMat = mat(goreum, { roughness: 0.55 });
    upper.add(m(new THREE.TorusGeometry(0.075, 0.022, 8, 18), ribMat, 0.08, 0.48, -0.35, { rot: [0.2, 0.3, 0.5] }));
    upper.add(m(new THREE.BoxGeometry(0.055, 0.34, 0.02), ribMat, 0.06, 0.28, -0.37, { rot: [0, 0, -0.12] }));
    upper.add(m(new THREE.BoxGeometry(0.055, 0.28, 0.02), ribMat, 0.13, 0.30, -0.36, { rot: [0, 0, -0.26] }));
  }

  // Đầu Chibi lớn biểu cảm + Mặt Anime sắc nét + Tóc/Mũ/Sừng 3D
  const head = new THREE.Group();
  head.position.y = 0.98;
  head.add(m(G.head, skinM));
  const faceTex = makeHeroFaceTex(hero.id);
  if (faceTex) {
    // Những hình trong WRAP_FACE_IDS (yone_chibi, leesin_chibi) dùng tấm rộng hơn vì một
    // phiến sơn của chúng quấn kín đầu; các hình khác giữ facePatch - canvas của
    // makeHeroFaceTex sinh ra đúng theo kích thước tấm ấy, nên hai bên không lệch nhau được.
    const faceGeo = WRAP_FACE_IDS.has(hero.id) ? G.wrapMask : G.facePatch;
    // faceMetal (chỉ Zed khai): phiến SẮT phải là sắt, không phải vải sơn xám. Sảnh có
    // scene.environment (world.js:77) nên metalness nhân được phản xạ của phòng; hai hình
    // nạ kia không khai field này nên vẫn roughness 0,45 kim loại-vừa như đã chốt.
    const fm = hero.faceMetal || {};
    const faceMesh = m(faceGeo, new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: fm.roughness ?? 0.45, metalness: fm.metalness ?? 0, depthWrite: false }), 0, 0, 0, { cast: false });
    head.add(faceMesh);
  }
  // Tai ẩn với hình có MŨ 3D trùm đầu: vành ngoài tai ở |x| 0,44 + 0,085*0,6 = 0,491 trong
  // khi khăn Zed ở cao độ đó chỉ r 0,434, nên để tai thì nó xiên ra ngoài đúng lớp vải mà
  // user vừa yêu cầu "là 1 layer riêng" - back.png vòng trước có một cục xám giữa khăn.
  for (const s of [-1, 1]) {
    if (hero.id === 'zed_chibi') continue;
    head.add(m(G.ear, skinM, s * 0.44, -0.02, 0.02, { scale: [0.6, 1, 0.8] }));
  }
  // Hai node mắt ẩn để giữ tương thích hoàn toàn với code nhắm mắt khi thiền
  const eyes = [m(G.eye, skinM, -0.13, 0, -0.42), m(G.eye, skinM, 0.13, 0, -0.42)];
  eyes.forEach((e) => { e.visible = false; head.add(e); });

  buildHeroHead3D(head, hero);

  upper.add(head);

  // Chân, Giày và Vạt áo (One_continuous_soft_robe)
  const lap = m(G.lap, sansa ? chimaM : pantsM, 0, 0.12, -0.06, { scale: [0.52, 0.17, 0.42] });
  const legs = new THREE.Group();
  const legL = m(G.leg, pantsM, -0.14, 0.2, 0), legR = m(G.leg, pantsM, 0.14, 0.2, 0);
  const shoeM = mat(sansa ? '#f8fafc' : '#1e1b18', { roughness: 0.65 });
  for (const l of [legL, legR]) {
    l.add(m(G.foot, shoeM, 0, -0.19, -0.05, { scale: [0.95, 0.65, 1.4] }));
  }
  legs.add(legL, legR);
  const skirt = m(G.skirt, chimaM, 0, 0, 0, { scale: sansa ? [1.02, 0.96, 0.96] : [0.95, 0.85, 0.85] });
  skirt.visible = sansa || ['itachi', 'zoro', 'naruto_sage', 'minato', 'yone_chibi'].includes(hero.id);
  legs.add(skirt);
  root.add(lap, legs);

  // Đạo cụ 3D & Hiệu ứng nguyên tố
  const vfxGroup = buildHeroProps3D(upper, hands, arms, legR, hero, head, root);

  // Quả cầu Tuyệt Chiêu 3D (hiện lên khi tung tuyệt chiêu)
  const ultSphere = m(
    new THREE.SphereGeometry(0.28, 20, 16),
    new THREE.MeshBasicMaterial({ color: hero.skillColor, transparent: true, opacity: 0 }),
    0, 0.58, -0.68,
    { cast: false }
  );
  upper.add(ultSphere);

  if (hero.id === 'kaido') {
    root.scale.setScalar(1.12);
  }

  const av = {
    root, upper, head, lap, legs, legL, legR, skirt, arms, hands, eyes,
    vfxGroup, ultSphere, hero, outfit,
    groundY: opts.groundY || 0,
    pose: 'sit', bowing: false, bowT: 0, walk: 0, meditate: 0,
    armDown: hero.armPose === 'down',
    ultTimer: 0,
    onBow: null, phase: Math.random() * 10,
  };
  // Màu này chỉ còn là mặc định cho NPC; với người chơi, setAuraRung đã phủ lại theo vận
  // ngay lúc world.js dựng avatar.
  av.aura = auraDisc(opts.robe?.aura || outfit?.swatch || hero.aura);
  root.add(av.aura);

  addGear(av, opts);
  setSeated(av, true);
  return av;
}

export function setSeated(av, on) {
  if (av.cloud) av.cloud.visible = !on;
  av.seated = on;
  av.lap.visible = on;
  av.legs.visible = !on;
  av.upper.position.y = on ? 0.3 : 0.4;
  av.baseY = (av.groundY || 0) + (on ? 0.17 : 0);
  av.root.position.y = av.baseY;
}

export function triggerUltimate(av) {
  startFight(av, 'hit');
  av.ultTimer = 0.85;
}

export const BOW_TIME = 2.6;
const ss = THREE.MathUtils.smoothstep;
const _sh = new THREE.Vector3(), _d = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0);

const pulse = (t, a, b) => { const u = (t - a) / (b - a); return u <= 0 || u >= 1 ? 0 : Math.sin(u * Math.PI); };
const FIGHT_HIT = 0.72, FIGHT_HURT = 1.0;
export function startFight(av, kind) { av.fight = { kind, t: 0, dur: kind === 'hit' ? FIGHT_HIT : FIGHT_HURT }; }

function fightArms(av, t) {
  const pr = [pulse(t, 0.22, 0.48), pulse(t, 0, 0.26)]; // Liên hoàn đấm cực bốc
  av.hands.forEach((h, i) => {
    const s = i ? 1 : -1, x = pr[i];
    h.position.set(s * (0.22 - x * 0.14), 0.62 + x * 0.05, -0.28 - x * 0.72);
  });
  av.arms.forEach((a, i) => {
    const s = i ? 1 : -1, h = av.hands[i].position;
    _sh.set(s * 0.27, 0.58, -0.04);
    _d.subVectors(h, _sh); const len = _d.length();
    a.position.copy(_sh).addScaledVector(_d, 0.5);
    a.quaternion.setFromUnitVectors(_down, _d.normalize());
    a.scale.set(1, len / 0.44, 1);
  });
}

function fightBody(av, f) {
  const t = f.t;
  if (f.kind === 'hit') {
    const pu = pulse(t, 0, 0.26) + pulse(t, 0.22, 0.48), kick = pulse(t, 0.45, 0.72);
    av.upper.rotation.y = (pulse(t, 0, 0.26) - pulse(t, 0.22, 0.48)) * 0.55 + kick * 0.35;
    av.upper.rotation.x = -0.24 * pu + 0.32 * kick;
    av.upper.position.z = -0.14 * pu;
    av.legR.rotation.x = kick * 1.75;
    av.legL.rotation.x = -kick * 0.25;
    av.root.position.y = av.baseY + kick * 0.18;
  } else {
    const hurt = pulse(t, 0, f.dur);
    av.upper.rotation.x = 0.5 * hurt;
    av.upper.position.z = 0.14 * hurt;
    av.upper.rotation.y = Math.sin(t * 22) * 0.16 * hurt;
    av.head.rotation.z = Math.sin(t * 18) * 0.28 * hurt;
    av.legL.rotation.x = -0.3 * hurt; av.legR.rotation.x = -0.18 * hurt;
  }
}

export function animateAvatar(av, dt, time, moving = false) {
  av.gearTick?.(time, moving);
  if (av.aura) {
    // Dải chớp do bậc quyết (setAuraRung); mặc định là dải cũ để NPC không đổi hình ảnh.
    const lo = av.auraBase ?? 0.38;
    const amp = av.auraAmp ?? 0.16;
    av.aura.material.opacity = av.ultTimer > 0 ? 0.78 : (lo + amp * Math.sin(time * 1.8 + av.phase));
    av.aura.rotation.z = time * 0.25;
  }
  if (av.vfxGroup?.userData.chidori) {
    av.vfxGroup.userData.chidori.rotation.set(time * 16, time * 12, time * 9);
  }
  const zs = av.vfxGroup?.userData.zedShadow;
  if (zs) {
    // Bóng lượn quanh vai chủ theo phase RIÊNG của từng avatar (av.phase) để hai người
    // mặc Zed trong sảnh không chớp cùng một nhịp. Biên 0,07/0,06 giữ đỉnh bóng trong khung
    // thumbnail ở MỌI pha: cao nhất 1,34+0,07+0,276 = 1,686 root-local, thế giới 1,856 <
    // 2,266; rộng nhất 0,766+0,05+0,276 = 1,092 < 1,436 được phép ở độ sâu 5,007.
    const t = time * 1.4 + av.phase;
    zs.position.set(0.6 + Math.sin(t) * 0.05, 1.34 + Math.sin(t * 0.9) * 0.07, 0.52 + Math.cos(t * 0.7) * 0.06);
    zs.rotation.set(0.08 + Math.sin(t * 1.3) * 0.05, 0.35 + Math.sin(t * 0.55) * 0.22, -0.12 + Math.cos(t * 0.8) * 0.05);
  }
  const ir = av.vfxGroup?.userData.bladeRing;
  if (ir) {
    // 0,45 rad/s = ~14 giay/vong: du cham de doc ra sau luoi rieng biet, du nhanh de
    // banh xe khong bi tuong tinh khi ngoi thien.
    // Bien 0,02: vong quay quanh truc THANG nen lech doc khong bao gio mo be ngang cua no
    // ra - do la ly do bien an toan o day, khong phai chuyen giu ngon luoi trong khung
    // (ban doc cu lam viec do vi ngon cao 0,464 va cham day au). Dai dao dong cong them
    // lech cua do ngheng 0,42 (0,104 plate-x * sin = 0,042) va luong 0,014: vong chay
    // trong y 0,618..0,719 root-local = theu 0,79..0,88, van giua than (than 0,30..1,04).
    // Rang buoc that la ban kinh, khong phai do cao: loi trong nhat cua vong o
    // 0,56-0,008 = 0,552 con both tay gap truc nhat 0,34, le 0,21 o moi pha.
    ir.rotation.y = time * 0.45;
    ir.position.y = 0.68 + Math.sin(time * 1.1 + av.phase) * 0.02;
    // THU/RA theo chuyen dong. Bien do (0..1) la CUONG DO, khong phai ba nguyen tac
    // khac nhau: di buoc 1, ngoi thien 0,55 (lay av.meditate - da duoc muot san o duoi,
    // chi tre mot frame), nghi 0,16 de vong van tho khi khong lam gi. Bo 0,16 di thi
    // NPC dung yen trong sảnh la mot vong kiem dong, khong phai mot cai la dong ho.
    // Do bang /tmp/ll3d/breathe.mjs (ban kinh tam cua luoi, root-local):
    //   NGHI 0,560..0,572   THIEN 0,560..0,601   DI BUOC 0,560..0,635.
    // dt*3,5 = 0,29 giay de doi het bien do. Ngan hon thi vong nop bung theo tung buoc
    // chan (nhap nhu den chap), dai hon thi muot qua, khong kip luc nguoi choi dung buoc.
    // Gia so vao bien do chu khong vao ban kinh: khong co luc vong "thu het" ve 0.
    const want = Math.max(moving ? 1 : 0, av.meditate * 0.55, 0.16);
    const a0 = av.bladeAmp ?? want;
    av.bladeAmp = a0 + (want - a0) * Math.min(1, dt * 3.5);
    // Pha tich luy chu khong lay time * rate: rate doi theo bien do, ma time thi co
    // dinh, nen nhan truc tiep se lam nhay goc khi nguoi choi dung buoc.
    const ph = (av.bladePh = (av.bladePh ?? av.phase) + dt * (1.15 + av.bladeAmp * 1.6));
    const kids = ir.children;
    const push = ir.userData.breathe;
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      // - i * 0,22: 9 luoi le nhau 0,22 rad cua song = 1,98 rad vong tron, tuc mot song
      // chay theo banh xe chu khong phai 9 cai piston dong bo. Lech nay khong bien vong
      // thanh da giac: ban kinh hai luoi ke nhau lech toi da
      // push * 0,5 * 2*sin(0,11) = 0,008, trong khi cho trong giua hai luoi la 0,13.
      const r = c.userData.r0 + av.bladeAmp * push * (0.5 + 0.5 * Math.sin(ph - i * 0.22));
      c.position.set(Math.sin(c.userData.phi) * r, 0, -Math.cos(c.userData.phi) * r);
    }
  }
  const tf = av.vfxGroup?.userData.tailFan;
  if (tf) {
    // QUAT DUI THO THEO CHUYEN DONG, cung bo dieu khien voi vong kiem Irelia o tren
    // (muon = 1 khi di, 0,55 khi thien, 0,16 khi dung yen; dt*3,5 = 0,29 giay doi bien
    // do). Duoi dung bien do NHAN LECH GOC chu khong nhan ban kinh nhu luoi: long duoi
    // la vat mem nen no quay Quanh goc moc, khong tron ra. 0,075 rad = 4,3 do o ngon
    // duoi du choi bang 0,08 theu (dai 1,05..1,15 tu moc) - du de doc ra tren bien toc,
    // du nho de mot NPC dung yen khong bi nhu mot cai quat may quay.
    const want = Math.max(moving ? 1 : 0, av.meditate * 0.55, 0.16);
    const a0 = av.tailAmp ?? want;
    av.tailAmp = a0 + (want - a0) * Math.min(1, dt * 3.5);
    const ph = (av.tailPh = (av.tailPh ?? av.phase) + dt * (0.85 + av.tailAmp * 1.15));
    // Song chay doc quat: doi 0 le doi 1 0,57 rad, tuc mot con song di tu giua ra hai
    // canh 3 lan (2*4*0,57 = 4,56 rad ~ 260 do gan vong tron). Khong lech thi chin duoi
    // dap cung mot nhip = mot tam bang phang, khong phai long.
    const K = 0.55;
    for (const c of tf.children) {
      const d = av.tailAmp * 0.075 * Math.sin(ph - c.userData.wi * K);
      if (c.userData.wi === 0) {
        // Doi giua nam TRONG mat phang x = 0 nen khong duoc nghieng ngang: no se pha
        // doi xung cua CA BON ben xung quanh. Cho no gập tới-lui (truc X) thi bong van
        // doi xung, va do la chuyen dong cua doi duoi that khi nguoi nghieng nguoi.
        c.rotation.x = d * 0.7;
      } else {
        // Nguoc dau theo sg vi lech cung chieu thi hai ben guong nhau nhu banh xe
        // (xem ghi chu sg o nhanh dung).
        c.rotation.z = d * c.userData.sg;
      }
    }
    // Ca quat nghieng 0,30 luc dung + 0,035 rad (2 do) tho: mat quat hoi rung len roi
    // sa xuong theo buoc chan, chu khong phai 9 luoi gang gan len lung.
    tf.rotation.x = 0.3 + Math.sin(ph * 0.7) * 0.035 * av.tailAmp;
  }
  const ao = av.vfxGroup?.userData.ahriOrb;
  if (ao) {
    // Khong xoay nua: bon lop cua ngoc LA BON QUA CAU TRON dong tam, mot phep xoay
    // khong doi duoc mot qua cau (va den thi moi mat cung tinh theo phap tuyen ban
    // kinh nen cung khong doi). Truoc day co xoay vi lop vo la Icosahedron nhieu mat
    // phang - doi khi no thanh khoi tron thi dong nay la vong tron chay khong toi.
    // Ngoc o (0,36; ..; -0,50): lech sang phai, KHONG nam tren truc.
    ao.position.set(0.36, 0.58 + Math.sin(time * 1.3 + av.phase) * 0.022, -0.50);
    // Hao quang nhop quanh gia tri 0,22 da so sanh: 0,16..0,28, lech khoang 1,8 giay.
    ao.userData.halo.material.opacity = 0.16 + 0.06 * (1 + Math.sin(time * 3.4 + av.phase));
  }
  if (av.ultTimer > 0) {
    av.ultTimer = Math.max(0, av.ultTimer - dt);
    const k = av.ultTimer / 0.85;
    av.ultSphere.material.opacity = Math.sin(k * Math.PI) * 0.85;
    const sc = 0.5 + (1 - k) * 2.2;
    av.ultSphere.scale.setScalar(sc);
  } else if (av.ultSphere) {
    av.ultSphere.material.opacity = 0;
  }

  // Lạy Phật
  if (av.bowing || av.bowT > 0) {
    av.bowT += dt / (BOW_TIME * (av.bowSlow || 1));
    if (av.bowT >= 1) { av.bowT = av.bowing ? av.bowT - 1 : 0; av.onBow?.(); }
  }
  const f = av.fight;
  if (f) { f.t += dt; if (f.t >= f.dur) av.fight = null; }
  const p = av.bowT;
  const amt = p < 0.45 ? ss(p, 0, 0.45) : p < 0.6 ? 1 : 1 - ss(p, 0.6, 1);
  av.upper.rotation.x = -1.15 * amt;
  av.upper.position.z = -0.12 * amt;
  av.head.rotation.x = -0.3 * amt;

  // Thiền định
  const target = av.meditating ? 1 : 0;
  av.meditate += (target - av.meditate) * Math.min(1, dt * 4);
  const k = av.meditate;
  av.hands.forEach((h, i) => {
    const s = i ? 1 : -1;
    // Dáng tay là per-hero. Mặc định: chắp trước ngực (mọi hình đang ship). Riêng Zed
    // BUÔNG DỌC THÂN khi đứng (user: "phần tay không chắp trước ngực, mà hai buông
    // xuống") vì hai lưỡi kiếm đi dọc cẳng tay — chắp thì hai mũi chĩa vào nhau trước
    // bụng. k (ngồi vào bệ + cầu may) kéo cả hai tư thế về cùng một điểm kiết tường
    // trên lòng, nên hình buông tay vẫn chắp đúng lúc lạy.
    // x 0,44 chứ không phải 0,33: áo là LatheGeometry rộng nhất 0,42 ở y 0,08 và 0,375 ở
    // y 0,10, nên bản 0,33 khiến CẢ hai cánh tay lẫn hai lưỡi nằm TRONG thân - thumb.png
    // vòng trước ra một cái chuông trơn không có tay. Nghiêng 18,8° ra ngoài (0,44-0,27 =
    // 0,17 trên 0,48 rơi) thì khủy và cổ tay vượt áo 0,065. Ba trục của d ở k=1 là
    // (0,44-0,34, 0,10+0,08, -0,10-0,24) = (0,10, 0,18, -0,34) = đúng số nhánh chắp.
    const d = av.armDown;
    h.position.set(
      d ? s * (0.44 - k * 0.34) : s * (0.05 + k * 0.05),
      d ? 0.10 + k * 0.08 : 0.5 - k * 0.32,
      d ? -0.10 - k * 0.24 : -0.36 + k * 0.02,
    );
  });

  av.arms.forEach((a, i) => {
    const s = i ? 1 : -1, h = av.hands[i].position;
    _sh.set(s * 0.27, 0.58, -0.04);
    _d.subVectors(h, _sh); const len = _d.length();
    a.position.copy(_sh).addScaledVector(_d, 0.5);
    a.quaternion.setFromUnitVectors(_down, _d.normalize());
    a.scale.set(1, len / 0.44, 1);
  });
  if (av.fight?.kind === 'hit') fightArms(av, av.fight.t);
  if (k > 0.01) av.head.rotation.x = Math.min(av.head.rotation.x, -0.15 * k);

  // Bước đi
  if (moving) {
    av.walk += dt * 10;
    av.legL.rotation.x = Math.sin(av.walk) * 0.6;
    av.legR.rotation.x = -Math.sin(av.walk) * 0.6;
    av.root.position.y = av.baseY + Math.abs(Math.sin(av.walk)) * 0.06;
    av.skirt.rotation.z = Math.sin(av.walk) * 0.035;
  } else {
    av.legL.rotation.x *= 0.8; av.legR.rotation.x *= 0.8; av.skirt.rotation.z *= 0.8;
    av.root.position.y = av.baseY;
  }
  if (av.fight) fightBody(av, av.fight);
  av.head.position.y = 0.98 + Math.sin(time * 1.8 + av.phase) * 0.009;
}

export function setGhost(av, on) {
  if (!!av.ghost === on) return;
  av.ghost = on;
  if (!on) av.ghostMats?.forEach((g) => g.dispose());
  av.ghostMats = on ? [] : null;
  av.root.traverse((o) => {
    if (!o.isMesh || o === av.aura) return;
    if (on) {
      const g = new THREE.MeshStandardMaterial({ color: 0x5f6f7f, emissive: 0x1c2a38, transparent: true, opacity: 0.62, depthWrite: false });
      o.userData.real = o.material; o.material = g; av.ghostMats.push(g);
    } else if (o.userData.real) { o.material = o.userData.real; delete o.userData.real; }
  });
}

export function disposeAvatar(av) {
  av.ghostMats?.forEach((g) => g.dispose());
  av.root.removeFromParent();
  if (av.pet) { av.pet.root.removeFromParent(); av.pet.dispose(); av.pet = null; }
  av.aura?.material.dispose();
  av.root.traverse((o) => { if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); } });
}
