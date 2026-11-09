// Một nguồn duy nhất cho chữ nghĩa trong vendor/temple/data/meta.json.
//
// meta.json là tài sản vendored từ bản gốc nên không sửa tay: chạy
//   node apps/web/scripts/rename-meta.mjs
// sau khi git checkout lại tệp, hoặc khi cần đối chiếu những gì đã đổi. Script này
// idempotent — chạy lần hai chỉ in ra bảng khác biệt rỗng.
//
// Bảng map lấy nguyên văn từ docs/SHRINE-CONTENT-MAP.md (§3 lối chơi, §4 trang bị,
// §6 key chết). Quy tắc: một dòng mô tả, không từ vựng nghi lễ, không giải thích cơ
// chế, và không đổi `id`/`price_*`/`unlock_level`/`data` vì đó là identifier và thông
// số render.
//
// Ba món Dơi (na_doi, ao_doi, ao_duc_anh) KHÔNG có trong tài sản vendored: id, giá và
// `data` của chúng soạn ở meta.json, chỉ chữ nghĩa là đi qua tệp này. Vì vậy bảng map
// bắt buộc phải có dòng cho chúng — thiếu một dòng là script chết ở vòng lặp cuối.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const META = join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'temple', 'data', 'meta.json');

/** @type {Record<string, [name: string, description: string]>} */
const ITEMS = {
  // Dâng lễ (§4.1) — bộ đồ cầu may.
  huong_tram: ['Bùa May Mắn', 'Lá bùa đỏ thêu vàng, treo góc nào là góc đó sáng lên.'],
  nen_sap: ['Nến Hex', 'Nến cháy lửa xanh lục, thắp lên là rõ cả góc bàn.'],
  hoa_dang: ['Đóa Sao', 'Một đóa sao giấy, dâng xong là nhẹ người.'],

  // Áo choàng (§4.2).
  ao_lam: ['Áo Choàng Lam', 'Màu lam quen thuộc của người mới vào sảnh.'],
  ao_xam: ['Áo Choàng Xám', 'Xám bạc mộc mạc, mặc cho gọn người.'],
  ao_nau: ['Áo Choàng Nâu', 'Màu nâu đất mộc mạc.'],
  ao_trang: ['Áo Choàng Trắng', 'Trắng tinh khôi, không hoạ tiết.'],
  ao_vang: ['Áo Choàng Vàng Cam', 'Vàng nghệ rực, dành cho người đã lên cấp 10.'],
  ao_sen: ['Áo Choàng Hồng Sương', 'Hồng phấn, thêu sương mờ.'],
  ao_vulan: ['Áo Choàng Má Hồng', 'Hồng phấn thêu hoa trắng ngà, mặc mùa tri ân.'],
  ao_may_bac: ['Áo Choàng Mây Bạc', 'Xám bạc dệt vân mây trắng, nhẹ như sương sớm.'],
  ao_truc: ['Áo Choàng Trúc Xanh', 'Xanh rừng núi, thêu cành trúc thanh tao.'],
  ao_nguyet: ['Áo Choàng Nguyệt Bạch', 'Trắng ánh trăng, thêu chỉ vàng, tỏa vầng sáng dịu.'],
  ao_lien_hoa: ['Áo Gấm Hồng Gai', 'Gấm đỏ son thêu hoa vàng, óng ánh dưới ánh nến.'],
  ao_thien_thanh: ['Áo Gấm Thiên Thanh', 'Xanh trời dệt mây trắng, tỏa vầng sáng xanh mát.'],
  ao_hoang_kim: ['Áo Gấm Hoàng Kim', 'Gấm vàng dệt trám cung đình, rực nhất sảnh, kèm vầng sáng vàng.'],
  tang_bao: ['Áo Choàng Quà Sảnh', 'Sảnh tặng người hay quay lại hoặc đi dạo nhiều. Không bán.'],
  ao_cam_lan: ['Áo Gấm Cẩm Lan', 'Đỏ son dệt vàng của Đường Tam Tạng, kèm vầng sáng.'],
  ao_hoa_sala: ['Áo Choàng Hoa Vàng', 'Vàng trắng như hoa mùa hội, trao cho người đi hết mùa. Không bán.'],
  ao_chien_bao: ['Chiến Bào Sắt', 'Áo sắt sẫm dệt trám vàng, gợi nhớ tráng sĩ cưỡi ngựa sắt.'],
  ao_non_tan: ['Áo Non Tản', 'Xanh núi Ba Vì, thêu mây quấn đỉnh non.'],
  ao_vay_rong: ['Áo Vảy Rồng', 'Gấm đỏ dệt vảy rồng vàng của dòng dõi Lạc Long.'],
  ao_duc_anh: ['Chiến Bào Dực Ảnh', 'Đen tuyền đai vàng, trước ngực đóng ấn bóng dơi.'],

  // Áo khoác — loại mới do repo này soạn (SHRINE-CONTENT-MAP §4 chưa có), tách từ Hiệp Sĩ
  // Dơi. Ấn ngực không có id riêng: nó là `data.emblem` của Chiến Bào Dực Ảnh ở trên, vì
  // nó dán lên thân áo chứ không phải lên choàng.
  ao_doi: ['Áo Choàng Dơi', 'Vải đen hai chóp cổ, gấu chấm cưa như đôi cánh xoè.'],

  // Vòng năng lượng (§4.3) — một vòng là 30 hạt, xem BEAD_ROUND trong apps/api.
  chuoi_go: ['Vòng Gỗ', 'Vòng 30 hạt gỗ mộc.'],
  chuoi_bode: ['Vòng Hạt Tự Nhiên', 'Hạt bồ đề trắng ngà, vân li ti.'],
  chuoi_tram: ['Vòng Trầm', 'Gỗ trầm nâu sẫm, vân dầu óng ánh.'],
  chuoi_ngoc: ['Vòng Ngọc Bích', 'Ngọc bích xanh trong mát.'],
  chuoi_hophach: ['Vòng Hổ Phách', 'Hổ phách vàng mật, trong suốt.'],
  chuoi_tudan: ['Vòng Anh Đào', 'Gỗ anh đào đỏ thẫm, vân mịn, càng cầm càng bóng.'],
  chuoi_thach_anh: ['Vòng Thạch Anh', 'Thạch anh hồng trong trẻo, ánh lên dịu dàng.'],
  chuoi_luu_ly: ['Vòng Lưu Ly', 'Xanh thẳm điểm vân vàng như trời sao.'],
  chuoi_kim: ['Vòng Hoàng Kim', 'Mạ sắc vàng kim, lấp lánh theo từng nhịp tay.'],
  chuoi_dua_do: ['Vòng Dưa Đỏ', 'Đỏ tươi như ruột dưa trên đảo của Mai An Tiêm.'],
  chuoi_dau: ['Vòng Dâu', 'Tím thẫm như quả dâu, gợi nhớ làng Dâu cổ.'],

  // Bệ ngồi (§4.4).
  bd_xam: ['Bệ Xám', 'Bệ vải bố, không hoạ tiết.'],
  bd_nau: ['Bệ Nâu', 'Màu nâu trầm ấm.'],
  bd_vang: ['Bệ Vàng', 'Vàng nghệ nổi bật giữa sảnh.'],
  bd_sen: ['Bệ Hồng Sương', 'Bệ tròn hồng phấn, mềm mắt.'],
  bd_may: ['Bệ Mây Lam', 'Vải lam dịu, ngồi lâu vẫn mát mắt.'],
  bd_tuyet: ['Bệ Tuyết', 'Trắng tinh khôi cho người ở lại lâu nhất.'],
  bd_ngoc: ['Bệ Ngọc', 'Xanh ngọc mát lành.'],
  bd_kim_lien: ['Bệ Hoàng Kim', 'Vàng kim, nổi bật giữa hàng trăm bệ ngồi.'],
  bd_tram_sen: ['Bệ Trăm Hoa', 'Hồng ngà nhiều cánh, gợi tích bọc trăm trứng.'],
  bd_mai_rua: ['Bệ Mai Rùa', 'Mặt bệ dệt vân mai Rùa Vàng.'],

  // Gậy (§4.5).
  tr_thien_truong: ['Gậy Chín Khoen', 'Đầu vàng, chín khoen đồng rung theo bước đi.'],
  tr_kim_co_bong: ['Kim Cô Bổng', 'Như Ý Kim Cô Bổng đỏ son, hai đầu bịt vàng.'],
  tr_dinh_ba: ['Cửu Xỉ Đinh Ba', 'Đinh ba chín răng của Trư Bát Giới.'],
  tr_nguyet_nha: ['Nguyệt Nha Sản', 'Bảo trượng trăng khuyết của Sa Ngộ Tĩnh.'],
  tr_tre_nga: ['Trượng Tre Ngà', 'Cây tre ngà óng vàng trong truyền thuyết làng Gióng.'],
  tr_gay_than: ['Gậy Thần', 'Cây gậy phép trong tích Chử Đồng Tử.'],
  tr_tram_dot: ['Trượng Trăm Đốt', 'Cây tre xanh dày đốt của anh nông dân thật thà.'],

  // Mũ (§4.5).
  mu_kim_co: ['Vòng Kim Cô', 'Vòng vàng trên trán Tôn Ngộ Không.'],
  mu_tu_kim: ['Mũ Lông Trĩ', 'Mũ vàng hai lông trĩ dài như Tề Thiên Đại Thánh, rung theo bước chân.'],
  mu_ty_lu: ['Mũ Chóp Vàng', 'Mũ chóp vàng năm tầng của Đường Tam Tạng.'],
  mu_non_than: ['Nón Thần', 'Chiếc nón phép đi cùng cây gậy thần, viền vàng mộc mạc.'],
  na_doi: ['Nạ Dơi', 'Vải đen khoét hở mặt, hai tai nhọn dựng trên đầu.'],

  // Item legend (§4.5).
  bi_kiep_van_phat: ['Bùa Vô Cực', 'Cuốn sách sờn gáy của Lão Hành Khất, chỉ đổi cho người hữu duyên.'],

  // Thú đồng hành + mây (§4.6).
  lt_huou: ['Hươu Non', 'Chú hươu vàng của truyện cổ, theo bạn ra sân chứ không vào sảnh.'],
  lt_tho_ngoc: ['Thỏ Bông', 'Trong truyện cổ, thỏ sẵn lòng cứu người đói — biểu tượng của sự cho đi. Theo bạn ra sân chứ không vào sảnh.'],
  lt_nghe: ['Nghê', 'Linh vật canh cửa đình, cửa đền Việt. Theo bạn ra sân chứ không vào sảnh.'],
  lt_su_tu_xanh: ['Sư Tử Xanh', 'Linh thú của trí tuệ, không biết sợ là gì. Theo bạn ra sân chứ không vào sảnh.'],
  lt_thanh_long: ['Thanh Long', 'Thần thú phương Đông trong Tứ Phương, thân phủ vảy ngọc, đuổi theo long châu. Theo bạn ra sân chứ không vào sảnh.'],
  lt_chu_tuoc: ['Chu Tước', 'Thần điểu phương Nam trong Tứ Phương, lông đỏ son, đuôi phượng dài như ngọn lửa. Theo bạn ra sân chứ không vào sảnh.'],
  lt_huyen_vu: ['Huyền Vũ', 'Thần thú phương Bắc trong Tứ Phương, rùa mai huyền cùng rắn nhỏ quấn bên mình, tượng trưng cho sự trường thọ. Theo bạn ra sân chứ không vào sảnh.'],
  lt_bach_tuong: ['Bạch Tượng Lục Nha', 'Voi trắng sáu ngà trong mộng lành của một hoàng hậu, tượng trưng cho sức bền. Theo bạn ra sân chứ không vào sảnh.'],
  lt_trau_vang: ['Trâu Vàng', 'Trâu vàng không cần dây xỏ mũi trong tranh cổ, hình ảnh của cái tâm đã thuần. Theo bạn ra sân chứ không vào sảnh.'],
  may_can_dau: ['Mây Chở Đi', 'Vầng mây vàng nhẹ bồng bềnh dưới chân khi đi lại.'],
  may_song_bac: ['Mây Sóng Bạc', 'Vầng sóng xanh bạc nâng bước chân như giữa dòng sông Đà.'],
};

// §3: năm lối chơi thay bốn thiền phái. id khớp ID_PATTERN trong apps/api, màu và mô
// tả đúng bảng map. bonus/bonusText/titles bị bỏ vì không nơi nào đọc (chỉ .name,
// .color vào màn hình).
const SECTS = {
  reroll: { id: 'reroll', name: 'Reroll', color: '#c4688a', icon: '🔁', desc: 'Đẩy level sớm rồi về 0 vàng ở cấp 5–6 để tìm comp.' },
  fast8: { id: 'fast8', name: 'Fast 8', color: '#4f8a4a', icon: '⚡', desc: 'Nhảy 8 nhanh, lấy comp bài 4–5 tiền.' },
  fast9: { id: 'fast9', name: 'Fast 9', color: '#3f6f9a', icon: '🚀', desc: 'Thẳng lên 9, chơi tướng bài 5.' },
  tempo: { id: 'tempo', name: 'Tempo', color: '#c0602e', icon: '⏱️', desc: 'Lên cấp đúng nhịp, ép sân bằng unit mạnh tạm, giữ tiền chặt.' },
  flex: { id: 'flex', name: 'Flex', color: '#8a5cc8', icon: '🧩', desc: 'Không khoá comp, rẽ nhánh theo ấn và lõi.' },
};

// §6: 16 key không có reader — engine.ts:12 là nơi duy nhất import tệp này và nó chỉ
// đọc temples/sects/items. `donate` và `fund` mang số tài khoản + tên thật nên bắt
// buộc phải ra khỏi bundle client.
const DEAD_KEYS = ['levels', 'maxLevel', 'appearance', 'event', 'announcement', 'announcementFx', 'ticker', 'tickers', 'fund', 'sessions', 'serverNow', 'paymentMode', 'packages', 'chantAudio', 'donate', 'exp'];

// Vườn cây đã cắt (§8): ba hạt giống và quả đổi Ngọc không còn route nào phục vụ.
const DEAD_ITEM_TYPES = ['plant', 'fruit'];

// §8 giữ 15 map làm theme cho admin chọn, nên chỉ sửa thứ HUD thực sự vẽ: tên của map
// đang dùng. `region`/`sort` là hai cột không reader.
const TEMPLE_NAMES = { nhattru: 'Đền Cầu May' };
const DEAD_TEMPLE_KEYS = ['region', 'sort'];

const meta = JSON.parse(readFileSync(META, 'utf8'));
const report = { items: 0, sects: false, deadKeys: [], plants: [], temples: [] };

meta.items = meta.items.filter((it) => {
  if (DEAD_ITEM_TYPES.includes(it.type)) {
    report.plants.push(it.id);
    return false;
  }
  return true;
});

for (const it of meta.items) {
  const map = ITEMS[it.id];
  if (!map) throw new Error(`no copy map entry for item "${it.id}" (${it.type})`);
  if (it.name !== map[0] || it.description !== map[1]) {
    it.name = map[0];
    it.description = map[1];
    report.items += 1;
  }
}

if (JSON.stringify(meta.sects) !== JSON.stringify(SECTS)) {
  meta.sects = SECTS;
  report.sects = true;
}

for (const key of DEAD_KEYS) if (key in meta) delete meta[key], report.deadKeys.push(key);

for (const t of meta.temples) {
  if (TEMPLE_NAMES[t.id] && t.name !== TEMPLE_NAMES[t.id]) {
    t.name = TEMPLE_NAMES[t.id];
    report.temples.push(t.id);
  }
  for (const key of DEAD_TEMPLE_KEYS) delete t[key];
}

const out = `${JSON.stringify(meta)}`;
writeFileSync(META, out, 'utf8');

const bytes = Buffer.byteLength(out);
const counts = { items: meta.items.length, sects: Object.keys(meta.sects).length, temples: meta.temples.length, keys: Object.keys(meta).length };
console.log(`meta.json → ${bytes} bytes`, counts);
console.log(`đổi tên/mô tả ${report.items} mục · bỏ ${report.plants.length} mục vườn (${report.plants.join(', ')}) · sects ${report.sects ? 'đã thay' : 'đã đúng'} · xoá ${report.deadKeys.length} key · đổi tên ${report.temples.join(', ') || 'map nào'}`);
