// Thang 19 mốc của docs/SHRINE-LADDER.md §3 (chốt 2026-11-06): sáu "vận" ba bậc cộng một
// đỉnh Như Ý. Máy chủ sinh `title`/`level` từ exp (apps/api/src/temple/identity.ts); tệp
// này là phần còn lại — vận nào khung/ấn đó (7 cột của sheet), bậc chỉ hiện bằng chữ.
// Tách riêng khỏi textures.js vì HUD React cũng cần đọc mà không được kéo theo THREE.
export const REALMS = ['Khai Vận', 'Hanh Thông', 'Cát Khánh', 'Cát Tường', 'Hồng Phước', 'Đại Cát', 'Như Ý'];
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

// Câu dẫn chuyện của từng vận — một dòng cho mỗi vận, không phải cho mỗi bậc: ba bậc
// trong một vận chung khung, chung ấn và chung nghĩa. Modal lên bậc và Cẩm nang lấy
// đúng dòng này để người chơi biết vận mình đang đứng là vận gì, chứ không chỉ thấy
// một cái tên.
export const REALM_ABOUT = [
  'Cửa lành vừa mở, cầu gì thấy nấy, bước đâu ra bước đó.',
  'Việc gì cũng thuận dây, nói có người nghe, làm có người đỡ.',
  'Chuyện vui tới trước, chuyện phiền lùi sau, nhà cửa có hỷ khí.',
  'Gặp dữ hoá lành, mọi chuyện thuận lợi, đánh đâu thắng đó.',
  'Phước dày như nước, làm hay gặp lành, người lành tự tìm tới.',
  'Trời đất chiều lòng, cầu được ước thấy, cả mùa hanh thông.',
  'Toại đúng ý mình, đi tới đâu cũng là đất lành.',
];

// level là vị trí 1..19 trên thang; realm 1..7 là vận, khớp đúng công thức trong
// levelFromExp() phía máy chủ.
export function rungOf(level) {
  const n = Math.min(19, Math.max(1, Math.round(level) || 1));
  const realm = Math.min(REALMS.length, Math.ceil(n / 3));
  return { level: n, realm, stage: realm === REALMS.length ? 1 : ((n - 1) % 3) + 1 };
}

export const titleOfLevel = (level) => REALMS[rungOf(level).realm - 1];

export function rungLabel(level) {
  const { realm, stage } = rungOf(level);
  return realm === REALMS.length ? 'Đỉnh Như Ý' : `Vận ${ROMAN[realm - 1]} · bậc ${stage}`;
}

// Khoảng level của một vận 1..7: ba bậc mỗi vận, riêng đỉnh Như Ý chỉ bậc 19. Cẩm nang
// dùng để nói "vận này từ bậc nào tới bậc nào" thay vì bắt người chơi tự đếm.
export function realmLevels(realm) {
  const from = (realm - 1) * 3 + 1;
  return [from, Math.min(19, from + 2)];
}
