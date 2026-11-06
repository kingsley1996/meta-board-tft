// Thang 19 mốc của docs/SHRINE-LADDER.md §3 (chốt 2026-11-06): sáu "vận" ba bậc cộng một
// đỉnh Như Ý. Máy chủ sinh `title`/`level` từ exp (apps/api/src/temple/identity.ts); tệp
// này là phần còn lại — vận nào khung/ấn đó (7 cột của sheet), bậc chỉ hiện bằng chữ.
// Tách riêng khỏi textures.js vì HUD React cũng cần đọc mà không được kéo theo THREE.
export const REALMS = ['Khai Vận', 'Hanh Thông', 'Cát Khánh', 'Cát Tường', 'Hồng Phước', 'Đại Cát', 'Như Ý'];
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

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
