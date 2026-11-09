// Đồ Tây Du Ký: mũ gắn vào đầu, pháp khí dựng bên phải, Cân Đẩu Vân dưới chân. Người khác thấy được vì dựng từ equipped như áo.
// Hình và vật liệu dùng chung (mỗi mẫu dựng một lần rồi clone), disposeAvatar không huỷ chúng.
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });
const GOLD = std('#e0ac3c', { metalness: 0.75, roughness: 0.32, emissive: '#5a3a08', emissiveIntensity: 0.35 });
const GOLD_D = std('#a87522', { metalness: 0.7, roughness: 0.42, emissive: '#2c1b04', emissiveIntensity: 0.3 });
const RED = std('#b3261c', { roughness: 0.45, emissive: '#3a0806', emissiveIntensity: 0.3 });
const WOOD = std('#5b3a20', { roughness: 0.75 });
const STEEL = std('#c7ced6', { metalness: 0.7, roughness: 0.3, emissive: '#23262a', emissiveIntensity: 0.3 });
const GEM = std('#2fb7a6', { metalness: 0.2, roughness: 0.15, emissive: '#0d5a50', emissiveIntensity: 0.6 });
const PLUME = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });

function add(g, geo, mat, x = 0, y = 0, z = 0, rot) {
  const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z);
  if (rot) o.rotation.set(...rot);
  o.castShadow = true; g.add(o); return o;
}
const cyl = (r, h, top = r) => new THREE.CylinderGeometry(top, r, h, 14);
const ball = (r) => new THREE.SphereGeometry(r, 14, 10);

// lông trĩ: thon dần về ngọn, khoang đỏ sậm xen vàng nâu như đuôi trĩ thật
function plumeGeo(points, r0) {
  const curve = new THREE.CatmullRomCurve3(points), SEG = 30, SIDE = 6, pos = [], col = [], idx = [];
  const frames = curve.computeFrenetFrames(SEG, false);
  const c = new THREE.Color();
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG, p = curve.getPoint(t), r = r0 * (1 - t * 0.9), band = Math.sin(t * 42) > 0;
    c.set(band ? '#8e1d14' : '#d9a23c').multiplyScalar(t > 0.93 ? 0.5 : 1);
    for (let j = 0; j < SIDE; j++) {
      const a = (j / SIDE) * Math.PI * 2;
      const n = frames.normals[i].clone().multiplyScalar(Math.cos(a) * r).addScaledVector(frames.binormals[i], Math.sin(a) * r * 0.55);
      pos.push(p.x + n.x, p.y + n.y, p.z + n.z); col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < SEG; i++) for (let j = 0; j < SIDE; j++) {
    const a = i * SIDE + j, b = a + SIDE, d = i * SIDE + (j + 1) % SIDE, e = d + SIDE;
    idx.push(a, b, d, d, b, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function petalGeo(w, h) {
  const s = new THREE.Shape();
  s.moveTo(-w * 0.5, 0); s.bezierCurveTo(-w * 0.62, h * 0.5, -w * 0.25, h * 0.85, 0, h);
  s.bezierCurveTo(w * 0.25, h * 0.85, w * 0.62, h * 0.5, w * 0.5, 0); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: false, curveSegments: 8 });
}

const HATS = {
  // nón thần: nón lá viền vàng
  non_than() {
    const g = new THREE.Group();
    add(g, new THREE.ConeGeometry(0.72, 0.42, 32, 1, true), std('#e7d7a4', { roughness: 0.8, side: THREE.DoubleSide }), 0, 0.42, 0);
    // vành tre chạy quanh nón, cách đều như nón lá thật
    for (let i = 1; i <= 9; i++) { const k = i / 10; add(g, new THREE.TorusGeometry(0.72 * k, i % 3 ? 0.0035 : 0.006, 5, 36), i % 3 ? BAMBOO_D : GOLD_D, 0, 0.63 - 0.42 * k, 0, [Math.PI / 2, 0, 0]); }
    add(g, new THREE.TorusGeometry(0.72, 0.016, 6, 40), GOLD, 0, 0.21, 0, [Math.PI / 2, 0, 0]);
    add(g, ball(0.035), GEM, 0, 0.64, 0);
    return g;
  },
  // vòng kim cô của Tôn Ngộ Không
  kim_co() {
    const g = new THREE.Group();
    add(g, new THREE.TorusGeometry(0.405, 0.026, 8, 40), GOLD, 0, 0.13, 0, [Math.PI / 2 - 0.08, 0, 0]);
    add(g, new THREE.TorusGeometry(0.405, 0.01, 6, 40), GOLD_D, 0, 0.17, 0, [Math.PI / 2 - 0.08, 0, 0]);
    add(g, ball(0.045), GEM, 0, 0.13, -0.42, [0, 0, 0]).scale.set(1, 1.2, 0.5);
    for (const s of [-1, 1]) add(g, new THREE.TorusGeometry(0.05, 0.012, 6, 16), GOLD, s * 0.09, 0.14, -0.395, [0, s * 0.3, 0]);
    return g;
  },
  // tử kim quan phượng sí: mũ vàng, ngù đỏ, hai lông trĩ dài cong ra sau
  tu_kim_quan() {
    const g = new THREE.Group();
    add(g, new THREE.TorusGeometry(0.405, 0.035, 8, 40), GOLD, 0, 0.13, 0, [Math.PI / 2 - 0.08, 0, 0]);
    const dome = new THREE.SphereGeometry(0.415, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.46);
    add(g, dome, GOLD_D, 0, 0.1, 0.01);
    add(g, petalGeo(0.3, 0.34), GOLD, 0, 0.14, -0.41, [-0.22, 0, 0]);
    add(g, ball(0.05), GEM, 0, 0.27, -0.455).scale.set(1, 1.2, 0.5);
    for (const s of [-1, 1]) {
      add(g, petalGeo(0.2, 0.26), GOLD, s * 0.25, 0.15, -0.33, [-0.2, -s * 0.65, 0]);
      add(g, ball(0.075), RED, s * 0.33, 0.42, -0.1);
      add(g, ball(0.055), RED, s * 0.43, 0.13, -0.02);
      const root = new THREE.Group(); root.position.set(s * 0.14, 0.42, -0.22); root.userData.sway = s;
      add(root, plumeGeo([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(s * 0.08, 0.5, 0.02), new THREE.Vector3(s * 0.26, 1.0, 0.22),
        new THREE.Vector3(s * 0.56, 1.28, 0.62), new THREE.Vector3(s * 0.92, 1.16, 1.0),
      ], 0.036), PLUME);
      g.add(root);
    }
    add(g, ball(0.07), RED, 0, 0.53, 0.02);
    return g;
  },
  // mũ Tỳ Lư của Đường Tăng: năm cánh sen trước trán, dải đỏ sau tai
  ty_lu() {
    const g = new THREE.Group();
    add(g, new THREE.TorusGeometry(0.405, 0.03, 8, 40), RED, 0, 0.14, 0, [Math.PI / 2 - 0.08, 0, 0]);
    for (let i = -2; i <= 2; i++) {
      const a = i * 0.52, p = new THREE.Group();
      p.position.set(Math.sin(a) * 0.4, 0.13, -Math.cos(a) * 0.4); p.rotation.y = -a;
      const h = 0.46 - Math.abs(i) * 0.05;
      add(p, petalGeo(0.26, h), GOLD, 0, 0, -0.012, [-0.2, 0, 0]);
      add(p, petalGeo(0.17, h * 0.72), RED, 0, 0.025, -0.036, [-0.2, 0, 0]);
      add(p, ball(0.032), GEM, 0, h * 0.42, -0.1).scale.z = 0.5;
      g.add(p);
    }
    for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.07, 0.62, 0.012), RED, s * 0.36, -0.15, 0.2, [0.25, 0, -s * 0.12]);
    return g;
  },
  // NẠ DƠI: vòm vải đen khoét hở mặt, hai tai nhọn — cái nạ của hình thứ 15 dựng thành
  // khối để tướng khác đeo. addGear nhân 1,15 MỌI chiếc mũ (band 0,405 -> 0,466 cho lọt
  // đầu 0,46), nên số dưới đây là số thế giới của tai nạ trong avatar.js chia 1,15:
  //   vòm 0,415 đặt ở y 0,1 z 0,01 — cùng cỡ, cùng cao độ vòm của tử kim quan đã ship ->
  //     rendered 0,4773, lệch mặt đầu 0,46 đúng 0,017 nên không z-fighting với phiến sơn;
  //   thetaLength 0,46π như tử kim quan: rim ở 0,115 + 0,4773*cos(82,8°) = 0,175 với bán
  //     kính ngang 0,473; mép vải cuối cung mở (55° so với trục mặt) cách trục đầu 0,473
  //     trong khi lát đầu ở cao độ đó rộng 0,426 -> vải bay ngoài thái dương 0,047, không
  //     cắt vào mặt, không che mắt (mắt sơn nằm dưới 0,1);
  //   cung mở 110° quanh phi -π/2 — hệ sphere của three để phi π/2 là SAU gáy, -π/2 là
  //     ĐÚNG TRƯỚC mặt -> phiStart -0,6108, phiLength 4,3632;
  //   tai: cone 5 cạnh 0,100 x 0,348 (thế giới 0,115 x 0,400, đúng hai tai đã sơn), ép
  //     z 0,5 thành bản dẹt; `add` đặt TÂM cone ở pos nên gốc thật là pos - axis*0,174 =
  //     (0,121; 0,183; -0,034) -> |p| 0,222, tức 0,256 thế giới, lẹm vào trong vòm 0,477
  //     nên tai mọc RA TỪ vòm chứ không nổi trên da.
  na_doi() {
    const g = new THREE.Group();
    const cowl = std('#18181b', { roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide });
    add(g, new THREE.SphereGeometry(0.415, 28, 12, -0.6108, 4.3632, 0, Math.PI * 0.46), cowl, 0, 0.1, 0.01);
    for (const s of [-1, 1]) add(g, new THREE.ConeGeometry(0.1, 0.348, 5), cowl, s * 0.166, 0.3504, -0.0522, [-0.1081, 0, -s * 0.2635]).scale.set(1, 1, 0.5);
    return g;
  },
};

const IVORY = std('#e8d286', { roughness: 0.38, emissive: '#4a380c', emissiveIntensity: 0.25 });
const BAMBOO = std('#6e9450', { roughness: 0.48, emissive: '#142a0a', emissiveIntensity: 0.2 });
const BAMBOO_D = std('#3f5f2a', { roughness: 0.62 });

// lá tre: thon nhọn hai đầu, dẹt
function leafGeo() {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.05, 0.14, 0, 0.36); s.quadraticCurveTo(-0.05, 0.14, 0, 0);
  return new THREE.ShapeGeometry(s, 6);
}
function bamboo(body, ring, n, leaf) {
  const g = new THREE.Group(), H = 2.3, geo = leafGeo();
  for (let i = 0; i < n; i++) {
    const a = i / n, b = (i + 1) / n, ra = 0.042 - a * 0.016, rb = 0.042 - b * 0.016;
    add(g, new THREE.CylinderGeometry(rb, ra, (H / n) * 0.97, 12), body, 0, (a + b) / 2 * H, 0);
    if (i) { add(g, new THREE.CylinderGeometry(ra + 0.005, ra + 0.005, 0.016, 12), ring, 0, a * H, 0); }
  }
  // cành nhỏ gần ngọn, mỗi cành một chùm lá rủ
  for (const [y, dir, ry] of [[H * 0.97, 1, 0.3], [H * 0.9, -1, 2.2], [H * 0.8, 1, 4.1]]) {
    const sprig = new THREE.Group(); sprig.position.y = y; sprig.rotation.y = ry; g.add(sprig);
    add(sprig, new THREE.CylinderGeometry(0.004, 0.008, 0.22, 5), ring, dir * 0.08, 0.05, 0, [0, 0, -dir * 1.1]);
    for (const [z, x] of [[-dir * 2.2, 0.15], [-dir * 1.55, -0.4], [-dir * 0.8, 0.35], [-dir * 2.7, 0.5]]) add(sprig, geo, leaf, dir * 0.17, 0.09, 0, [x, 0, z]);
  }
  return g;
}

const STAFFS = {
  // tre ngà làng Gióng: thân vàng ngà thon dần, đốt phình có vạch nâu, ngọn tủa lá
  tre_nga() { return bamboo(IVORY, GOLD_D, 7, std('#7fa64f', { roughness: 0.55, side: THREE.DoubleSide })); },
  // tre trăm đốt: xanh già, đốt ngắn và dày
  tram_dot() { return bamboo(BAMBOO, BAMBOO_D, 16, std('#4f8a3c', { roughness: 0.6, side: THREE.DoubleSide })); },
  // gậy thần: gỗ mun cong nhẹ, đầu ngọc ôm vòng vàng
  gay_than() {
    const g = new THREE.Group();
    add(g, cyl(0.036, 1.1, 0.03), WOOD, 0, 0.55, 0);
    add(g, cyl(0.03, 1.0, 0.038), WOOD, 0.03, 1.55, 0, [0, 0, -0.06]);
    add(g, cyl(0.046, 0.05), GOLD, 0.01, 1.08, 0);
    add(g, new THREE.TorusGeometry(0.13, 0.02, 8, 24), GOLD, 0.06, 2.18, 0);
    add(g, ball(0.085), GEM, 0.06, 2.18, 0);
    return g;
  },
  // thiền trượng: cán đỏ, đầu tháp vàng, sáu khoen đồng rung khi đi
  thien_truong() {
    const g = new THREE.Group();
    add(g, cyl(0.03, 2.0), RED, 0, 1, 0);
    for (const y of [0.04, 0.72, 1.4, 1.98]) add(g, cyl(0.042, 0.06), GOLD, 0, y, 0);
    add(g, new THREE.TorusGeometry(0.2, 0.024, 8, 28), GOLD, 0, 2.22, 0).scale.y = 1.25;
    add(g, new THREE.TorusGeometry(0.12, 0.014, 6, 20), GOLD_D, 0, 2.2, 0).scale.y = 1.3;
    add(g, ball(0.05), GOLD, 0, 2.5, 0);
    add(g, new THREE.ConeGeometry(0.035, 0.14, 8), GOLD, 0, 2.6, 0);
    add(g, petalGeo(0.15, 0.2), GOLD, 0, 2.03, -0.01);
    const rings = new THREE.Group(); rings.position.y = 2.2; rings.userData.jingle = 1;
    for (const [x, y] of [[-0.24, 0.1], [-0.27, -0.06], [-0.2, -0.2], [0.24, 0.1], [0.27, -0.06], [0.2, -0.2]]) add(rings, new THREE.TorusGeometry(0.052, 0.009, 6, 14), GOLD, x, y, 0, [0, 0.9, 0]);
    g.add(rings);
    return g;
  },
  // Như Ý Kim Cô Bổng: thân đỏ son, hai đầu vàng
  kim_co_bong() {
    const g = new THREE.Group();
    add(g, cyl(0.04, 2.3), std('#c8301e', { roughness: 0.35, emissive: '#541006', emissiveIntensity: 0.5 }), 0, 1.15, 0);
    for (const y of [0.13, 2.17]) add(g, cyl(0.052, 0.26), GOLD, 0, y, 0);
    for (const y of [0.3, 2]) add(g, new THREE.TorusGeometry(0.052, 0.012, 6, 18), GOLD_D, 0, y, 0, [Math.PI / 2, 0, 0]);
    return g;
  },
  // cửu xỉ đinh ba của Trư Bát Giới
  dinh_ba() {
    const g = new THREE.Group();
    add(g, cyl(0.032, 1.95), WOOD, 0, 0.97, 0);
    add(g, new THREE.BoxGeometry(0.72, 0.12, 0.09), GOLD_D, 0, 1.97, 0);
    add(g, ball(0.075), GEM, 0, 2.02, -0.04).scale.z = 0.5;
    for (let i = 0; i < 9; i++) add(g, new THREE.ConeGeometry(0.024, 0.34, 8), STEEL, -0.32 + i * 0.08, 1.74, 0, [Math.PI, 0, 0]);
    return g;
  },
  // nguyệt nha sản của Sa Tăng: đầu xẻng bán nguyệt, đuôi trăng khuyết
  nguyet_nha() {
    const g = new THREE.Group();
    add(g, cyl(0.03, 2.1), WOOD, 0, 1.05, 0);
    for (const y of [0.4, 1.7]) add(g, cyl(0.04, 0.05), GOLD, 0, y, 0);
    const s = new THREE.Shape(); s.moveTo(-0.22, 0); s.quadraticCurveTo(-0.26, 0.26, 0, 0.36); s.quadraticCurveTo(0.26, 0.26, 0.22, 0); s.quadraticCurveTo(0, 0.1, -0.22, 0);
    add(g, new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }), STEEL, 0, 2.08, -0.01);
    const m = new THREE.Shape(); m.moveTo(-0.24, 0.16); m.quadraticCurveTo(0, -0.26, 0.24, 0.16); m.quadraticCurveTo(0, -0.06, -0.24, 0.16);
    add(g, new THREE.ExtrudeGeometry(m, { depth: 0.02, bevelEnabled: false }), STEEL, 0, -0.02, -0.01);
    add(g, ball(0.045), GOLD, 0, 2.08, 0);
    return g;
  },
};

// ---- HOÁ PHỤC DƠI ---------------------------------------------------------------
// Tách hình thứ 15 (batman_chibi) ra TỪNG PHẦN để các tướng khác mặc được: choàng sau
// lưng, nạ có tai trên đầu, ấn trước ngực. Mỗi phần là MỘT hàm dựng duy nhất và
// avatar.js gọi đúng hàm đó khi vẽ Hiệp Sĩ Dơi, nên "đồ của tướng" và "đồ mua ở cửa
// hàng" không thể lệch nhau — hai khối cùng transform là z-fighting chớp cả lúc ngồi.
// Màu không có ảnh đo: ba hex vay nguyên bộ đã sơn trong HERO_LIST của batman_chibi
// ('#09090b' vải choàng = quần, '#18181b' da nạ = thân áo — nó nằm trong HATS.na_doi ở
// trên vì đó là chất liệu của một chiếc mũ như mọi chiếc mũ, '#facc15' vàng đai + ấn).
const BAT_CLOTH = std('#09090b', { roughness: 0.85, side: THREE.DoubleSide });
const BAT_GOLD = std('#facc15', { roughness: 0.35, metalness: 0.25 });

// m() trong avatar.js đội lốt ở đây: đặt + xoay + tỉ lệ và KHÔNG đổ bóng, vì vải mỏng
// của choàng mà đổ bóng thì nền sảnh ra một tảng đen.
function nb(g, geo, mat, x = 0, y = 0, z = 0, rot, scale) {
  const o = add(g, geo, mat, x, y, z, rot);
  o.castShadow = false;
  if (scale) o.scale.set(...scale);
  return o;
}

// Con dơi MỘT nét liền (không ghép Box): ở ô 144px, ghép khối ra một con bọ, còn một
// path thì giữ được hai tai và đuôi nhọn.
function batPath() {
  const s = new THREE.Shape();
  s.moveTo(-1.00, 0.05);
  s.quadraticCurveTo(-0.62, -0.02, -0.55, 0.22);
  s.lineTo(-0.30, 0.10);
  s.lineTo(-0.16, 0.30);
  s.lineTo(-0.06, 0.12);
  s.lineTo(0.06, 0.12);
  s.lineTo(0.16, 0.30);
  s.lineTo(0.30, 0.10);
  s.lineTo(0.55, 0.22);
  s.quadraticCurveTo(0.62, -0.02, 1.00, 0.05);
  s.quadraticCurveTo(0.55, -0.05, 0.34, -0.28);
  s.quadraticCurveTo(0.12, -0.12, 0.00, -0.42);
  s.quadraticCurveTo(-0.12, -0.12, -0.34, -0.28);
  s.quadraticCurveTo(-0.55, -0.05, -1.00, 0.05);
  return s;
}

// ÁO CHOÀNG. Group trả về mốc tại UPPER và không tự dời, nên cảnh graph dựng bằng hàm
// này đúng từng node như bản đang ship trong avatar.js.
// Vải là một chóp cụt 245° quanh lưng (thetaStart -0,68π, thetaLength 1,36π) trong hệ
// CylinderGeometry của three (x = r*sin(theta), z = r*cos(theta) => theta 0 là CHÍNH
// SAU LƯNG). Bốn ràng buộc:
//   - mép cuối cung theta ±0,68π -> x 0,422 (qua bờ vai 0,30, nhìn trước lẫn sau đều
//     thấy vải), z -0,198 (vẫn SAU ngực -0,33, không mảnh nào chui ra trước);
//   - rim trên local +0,37 -> upper 0,56, cao hơn đáy khối đầu 0,52 nên bám tới cổ;
//   - gấu local -0,37 -> upper -0,18 -> thế giới 0,29, cao hơn đáy vạt 0,12 và vành
//     sáng chân 0,20: ngồi thiền không xuyên ghế;
//   - lưng lồi nhất z 0,57 so với lưng áo 0,37 -> dày 0,20, là choàng chứ không phải
//     cái dù ôm sát người. Bề ngang |x| lớn nhất 0,51 < 0,738 mà khung heroScene cho.
// Miệng chóp cụt là vỏ MỞ nên đóng bằng đĩa ngang 0,27 ở local +0,37; nửa trước của đĩa
// ở z -0,20 lọt trong ngực (mặt áo -0,31) nên nó không thành khiên che ấn - chỉ phần
// sau gáy lộ ra, đúng chỗ cần bịt. Gấu chấm cưa: bảy mũi cone 4 cạnh lật ngược cao
// 0,12, ngọn dừng ở thế giới 0,19 — nét khiến một cái váy đen đọc là dơi.
export function batCape() {
  const g = new THREE.Group();
  const cloth = new THREE.Group();
  cloth.position.set(0, 0.19, 0.07);
  cloth.rotation.x = 0.10;   // chúc gấu ra sau một chút để nó rủ, không đứng như cái loa
  nb(cloth, new THREE.CylinderGeometry(0.27, 0.50, 0.74, 14, 1, true, -Math.PI * 0.68, Math.PI * 1.36), BAT_CLOTH);
  nb(cloth, new THREE.CircleGeometry(0.27, 20), BAT_CLOTH, 0, 0.37, 0, [-Math.PI / 2, 0, 0]);
  for (const th of [-0.62, -0.41, -0.21, 0, 0.21, 0.41, 0.62]) {
    const a = th * Math.PI;
    nb(cloth, new THREE.ConeGeometry(0.085, 0.12, 4), BAT_CLOTH, 0.50 * Math.sin(a), -0.41, 0.50 * Math.cos(a), [Math.PI, 0, 0]);
  }
  g.add(cloth);
  // Hai chóp cổ áo phía sau gáy - apex local y 0,52 + 0,929*0,11 = 0,62, z 0,20-0,032:
  // nằm SAU khối đầu 0,46 nên chỉ lộ ra hai bên cổ, đúng chiếc cổ áo đứng.
  for (const s of [-1, 1]) add(g, new THREE.ConeGeometry(0.09, 0.22, 4), BAT_CLOTH, s * 0.15, 0.52, 0.20, [-0.30, 0, 0]);
  return g;
}

// ẤN NGỰC: oval vàng + bóng dơi đen, hai mặt phẳng quay về -z dán trước ngực. Số do
// LatheGeometry của thân áo: ở cao độ y 0,36 biên ngang lát cắt là r = 0,40 -
// (0,11/0,20)*0,05 = 0,3725 và z ép 0,88 -> mặt áo ở z -0,328, nên oval đặt -0,340
// (lề 0,012) và dơi -0,348 (nổi trên oval 0,008, đủ để hai mặt không cùng bán kính
// triệt tiêu thành z-fighting). Oval rộng 0,34 = 46% bề ngang ngực 0,745.
export function batEmblem() {
  const g = new THREE.Group();
  nb(g, new THREE.CircleGeometry(1, 32), BAT_GOLD, 0, 0.36, -0.340, [0, Math.PI, 0], [0.17, 0.10, 1]);
  nb(g, new THREE.ShapeGeometry(batPath()), std('#09090b', { roughness: 0.6, side: THREE.DoubleSide }), 0, 0.372, -0.348, [0, Math.PI, 0], [0.155, 0.092, 1]);
  return g;
}

const CAPES = { doi: batCape };
const EMBLEMS = { doi: batEmblem };

// Hiệp Sĩ Dơi đã mặc sẵn ba món này bằng CHÍNH mấy hàm trên: choàng và ấn thì avatar.js
// gọi batCape/batEmblem, còn tai nạ thì dựng trong buildHeroHead3D với toạ độ trùng
// khớp (chia 1,15) cho mẫu na_doi dưới kia. Đeo thêm bản mua là hai khối cùng transform
// — z-fighting chớp cả lúc ngồi thiền — nên món nào tướng đó đã có thì không mount nữa.
const ALREADY_WORN = { batman_chibi: ['cape:doi', 'emblem:doi', 'hat:na_doi'] };

// Cân Đẩu Vân: vầng mây vàng trắng dưới chân, khi ngồi thì ẩn
function cloudModel(kind) {
  const g = new THREE.Group(), m = kind === 'song_bac' ? std('#9fd6f2', { roughness: 0.4, metalness: 0.15, emissive: '#1f7fc4', emissiveIntensity: 0.55 }) : std('#fffaf0', { roughness: 0.9, emissive: '#ffd98a', emissiveIntensity: 0.35 });
  for (const [x, y, z, r] of [[0, 0.1, 0, 0.42], [0.42, 0.08, 0.05, 0.3], [-0.42, 0.08, 0.05, 0.3], [0.2, 0.08, -0.38, 0.28], [-0.2, 0.08, 0.4, 0.28], [-0.26, 0.06, -0.3, 0.25], [0.28, 0.06, 0.36, 0.25], [0.72, 0.06, -0.06, 0.2], [-0.72, 0.06, -0.06, 0.18], [0.95, 0.05, 0.1, 0.12]]) add(g, new THREE.SphereGeometry(r, 14, 10), m, x, y, z).scale.y = 0.55;
  return g;
}

const cache = new Map();
const model = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key).clone(true); };

export function addGear(av, { hat, staff, cloud, cape, robe }) {
  const parts = { sways: [], rings: [] };
  const worn = new Set(ALREADY_WORN[av.hero?.id] || []);
  const want = (kind, id) => id && !worn.has(`${kind}:${id}`);
  if (want('hat', hat?.model) && HATS[hat.model]) {
    const h = model('h' + hat.model, HATS[hat.model]);
    // Dải mũ của cả bốn mẫu viết cho đầu bán kính ~0.40, còn đầu chibi trong avatar.js
    // là hình cầu 0.46 (G.head), nên vòng trôn ốc 0.405 nằm trọn bên trong khối đầu và
    // người chơi mua nón xong không thấy gì. Nhân tỉ lệ 1.15 quanh tâm đầu: vòng 0.466
    // tính cả ống 0.03 là 0.496, ló ra ngoài mặt cắt đầu (0.441 ở cao độ 0.13).
    h.scale.setScalar(1.15);
    av.head.add(h);
    h.traverse((o) => { if (o.userData.sway) parts.sways.push(o); });
  }
  if (want('staff', staff?.model) && STAFFS[staff.model]) {
    const s = model('s' + staff.model, STAFFS[staff.model]);
    s.position.set(0.68, 0, -0.08); s.rotation.z = -0.05;
    av.root.add(s);
    s.traverse((o) => { if (o.userData.jingle) parts.rings.push(o); });
  }
  if (want('cape', cape?.model) && CAPES[cape.model]) av.upper.add(model('cp' + cape.model, CAPES[cape.model]));
  if (want('emblem', robe?.emblem) && EMBLEMS[robe.emblem]) av.upper.add(model('em' + robe.emblem, EMBLEMS[robe.emblem]));
  if (cloud) { av.cloud = model('cloud' + (cloud.model || ''), () => cloudModel(cloud.model)); av.root.add(av.cloud); }
  if (!parts.sways.length && !parts.rings.length && !av.cloud) return;
  av.gearTick = (time, moving) => {
    const k = moving ? 2.2 : 1;
    for (const p of parts.sways) { p.rotation.z = Math.sin(time * 1.5 * k + av.phase) * 0.035 * k * p.userData.sway; p.rotation.x = Math.sin(time * 1.1 * k + av.phase) * 0.03 * k; }
    for (const r of parts.rings) r.rotation.z = moving ? Math.sin(time * 9) * 0.1 : Math.sin(time * 0.9 + av.phase) * 0.02;
    if (av.cloud) av.cloud.position.y = 0.02 + Math.sin(time * 1.6 + av.phase) * 0.025;
  };
}
