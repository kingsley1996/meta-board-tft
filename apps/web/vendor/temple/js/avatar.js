// Hệ thống Nhân vật 3D Chibi Anime (12 Nhân vật từ ảnh tham khảo characters-naruto-onpine.jpg)
// Tư thế hỗ trợ: đứng, đi, ngồi thiền, lạy Phật và tung tuyệt chiêu (fight / ultimate).
import * as THREE from 'three';
import { addGear } from './gear.js';
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
// mặt như leesin_chibi) phải vẽ trên tấm quấn 2π. Hình khác chỉ cần facePatch ±57,6°.
// Danh sách này là nguồn duy nhất: makeHeroFaceTex chọn kích thước canvas theo nó và
// buildHeroAvatar chọn geometry (G.wrapMask hay G.facePatch) theo nó.
const WRAP_FACE_IDS = new Set(['yone_chibi', 'leesin_chibi']);
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
  }

  // Mũi 3D shading nhẹ ở giữa
  g.fillStyle = 'rgba(120,53,15,0.22)';
  g.beginPath(); g.moveTo(256, 268); g.lineTo(246, 296); g.lineTo(264, 296); g.closePath(); g.fill();

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
function ribbon(points, r0, r1, { seg = 12, rad = 6, flat = 1 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const fr = curve.computeFrenetFrames(seg, false);
  const pos = [], nor = [], idx = [], p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, r = r0 + (r1 - r0) * t;
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
  }
}

// Trang bị vũ khí, áo choàng và hiệu ứng nguyên tố 3D trên cơ thể nhân vật
function buildHeroProps3D(upper, hands, arms, legR, hero) {
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
  const rColor = opts.robe?.color || (useOutfitColors && outfit.robeColor ? outfit.robeColor : hero.robeColor);
  const pColor = useOutfitColors && outfit.pantsColor ? outfit.pantsColor : hero.pantsColor;
  const sColor = opts.robe?.sash || (useOutfitColors && outfit.sashColor ? outfit.sashColor : hero.sashColor);

  const skinM = mat(hero.skin, { roughness: 0.52 });
  const robeM = mat(rColor, {
    roughness: outfit?.sansaRobe ? 0.82 : (hero.id === 'naruto_sage' && !useOutfitColors ? 0.3 : 0.65),
    emissive: hero.id === 'naruto_sage' && !useOutfitColors ? '#b45309' : '#000000',
    emissiveIntensity: hero.id === 'naruto_sage' && !useOutfitColors ? 0.35 : 0,
  });
  const pantsM = mat(pColor, { roughness: outfit?.sansaRobe ? 0.82 : 0.7 });
  const sashM = mat(sColor, { roughness: 0.5, metalness: 0.08 });

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
    if (outfit?.wideSleeves) {
      // Tay áo trường sam Hàn Quốc (One_continuous_soft_robe / dance-sleeves) rủ mềm quanh cánh tay
      a.add(m(sleeveGeo, sleeveMat, 0, -0.04, 0.04, { rot: [Math.PI, 0, 0], scale: [0.85, 1.0, 1.25] }));
    }
    const h = m(G.hand, skinM, s * 0.05, 0.5, -0.36);
    arms.push(a); hands.push(h);
    upper.add(a, h);
  }

  // Chi tiết 3D đặc trưng của Bộ Sưu Tập Trang Phục Sansa Temple (?room=maru) & Lễ Hội
  if (outfit?.sansaRobe) {
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
  if (outfit?.hanbokRibbon) {
    // Nơ áo Hanbok Goreum truyền thống Hàn Quốc trước ngực
    const ribMat = mat(outfit.hanbokRibbon, { roughness: 0.55 });
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
    const faceMesh = m(faceGeo, new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.45, depthWrite: false }), 0, 0, 0, { cast: false });
    head.add(faceMesh);
  }
  for (const s of [-1, 1]) {
    head.add(m(G.ear, skinM, s * 0.44, -0.02, 0.02, { scale: [0.6, 1, 0.8] }));
  }
  // Hai node mắt ẩn để giữ tương thích hoàn toàn với code nhắm mắt khi thiền
  const eyes = [m(G.eye, skinM, -0.13, 0, -0.42), m(G.eye, skinM, 0.13, 0, -0.42)];
  eyes.forEach((e) => { e.visible = false; head.add(e); });

  buildHeroHead3D(head, hero);

  upper.add(head);

  // Chân, Giày và Vạt áo (One_continuous_soft_robe)
  const lap = m(G.lap, outfit?.sansaRobe ? robeM : pantsM, 0, 0.12, -0.06, { scale: [0.52, 0.17, 0.42] });
  const legs = new THREE.Group();
  const legL = m(G.leg, pantsM, -0.14, 0.2, 0), legR = m(G.leg, pantsM, 0.14, 0.2, 0);
  const shoeM = mat(outfit?.sansaRobe ? '#f8fafc' : '#1e1b18', { roughness: 0.65 });
  for (const l of [legL, legR]) {
    l.add(m(G.foot, shoeM, 0, -0.19, -0.05, { scale: [0.95, 0.65, 1.4] }));
  }
  legs.add(legL, legR);
  const skirt = m(G.skirt, robeM, 0, 0, 0, { scale: outfit?.sansaRobe ? [1.02, 0.96, 0.96] : [0.95, 0.85, 0.85] });
  skirt.visible = !!outfit?.sansaRobe || ['itachi', 'zoro', 'naruto_sage', 'minato', 'yone_chibi'].includes(hero.id);
  legs.add(skirt);
  root.add(lap, legs);

  // Đạo cụ 3D & Hiệu ứng nguyên tố
  const vfxGroup = buildHeroProps3D(upper, hands, arms, legR, hero);

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
    h.position.set(s * (0.05 + k * 0.05), 0.5 - k * 0.32, -0.36 + k * 0.02);
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
