// Họa tiết vẽ bằng canvas (không cần file ảnh)
import * as THREE from 'three';
import { rungOf, titleOfLevel, rungLabel } from './ladder.js';

export const rand = (a, b) => a + Math.random() * (b - a);
const cache = new Map();

export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const memo = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

/* ---------- Sàn ---------- */
export function floorTex(kind, size) {
  const rep = [size[0] / 6, size[1] / 6];
  if (kind === 'stone') {
    return canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#6a645c'; g.fillRect(0, 0, w, h);
      const n = 4, s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const k = rand(0.85, 1.1);
        g.fillStyle = `rgb(${110 * k},${104 * k},${96 * k})`;
        g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
        for (let p = 0; p < 60; p++) { g.fillStyle = `rgba(0,0,0,${rand(0.02, 0.08)})`; g.fillRect(i * s + rand(0, s), j * s + rand(0, s), rand(2, 10), rand(2, 10)); }
      }
    }, rep);
  }
  if (kind === 'tile') {
    return canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#5a2a1a'; g.fillRect(0, 0, w, h);
      const n = 8, s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const k = rand(0.85, 1.08);
        g.fillStyle = `rgb(${150 * k},${70 * k},${45 * k})`;
        g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
        g.fillStyle = 'rgba(255,220,160,.07)';
        g.beginPath(); g.arc(i * s + s / 2, j * s + s / 2, s / 4, 0, Math.PI * 2); g.fill();
      }
    }, rep);
  }
  return canvasTex(1024, 1024, (g, w, h) => {
    const rows = 16, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rand(0, 300);
      while (x < w) {
        const len = rand(260, 520), s = rand(0.75, 1.1);
        g.fillStyle = `rgb(${62 * s},${42 * s},${30 * s})`;
        g.fillRect(x, r * rh, len, rh);
        g.strokeStyle = 'rgba(0,0,0,.18)';
        for (let k = 0; k < 6; k++) {
          const y = r * rh + rand(4, rh - 4);
          g.beginPath(); g.moveTo(x, y);
          g.bezierCurveTo(x + len / 3, y + rand(-3, 3), x + (2 * len) / 3, y + rand(-3, 3), x + len, y); g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x, r * rh, 2, rh);
        x += len;
      }
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, r * rh, w, 2);
    }
  }, rep);
}

export const rockTex = () => memo('rock', () => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#5d554c'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    const v = rand(60, 120);
    g.fillStyle = `rgba(${v},${v * 0.94},${v * 0.86},${rand(0.1, 0.4)})`;
    g.beginPath(); g.ellipse(rand(0, w), rand(0, h), rand(4, 30), rand(3, 14), rand(0, 3), 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(30,25,20,.35)';
  for (let i = 0; i < 40; i++) { g.lineWidth = rand(1, 3); g.beginPath(); let x = rand(0, w), y = rand(0, h); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rand(-30, 30); y += rand(-30, 30); g.lineTo(x, y); } g.stroke(); }
}, [3, 3]));

/* ---------- Tranh vách ---------- */
function drawFigure(g, cx, cy, s, robe, accent) {
  g.save(); g.translate(cx, cy); g.scale(s, s);
  g.fillStyle = 'rgba(240,190,90,.22)';
  g.beginPath(); g.arc(0, -150, 52, 0, Math.PI * 2); g.fill();
  g.strokeStyle = accent; g.lineWidth = 3; g.stroke();
  g.fillStyle = robe;
  g.beginPath(); g.moveTo(-30, -110); g.quadraticCurveTo(-70, 40, -60, 220); g.lineTo(60, 220); g.quadraticCurveTo(70, 40, 30, -110); g.closePath(); g.fill();
  g.strokeStyle = accent; g.globalAlpha = 0.6; g.lineWidth = 2;
  for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 10, -90); g.quadraticCurveTo(i * 22, 60, i * 18, 215); g.stroke(); }
  g.globalAlpha = 1;
  g.fillStyle = '#e8b989'; g.beginPath(); g.ellipse(0, -150, 24, 30, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2b1a14'; g.beginPath(); g.ellipse(0, -180, 22, 14, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#4c8a6a'; g.lineWidth = 8;
  g.beginPath(); g.moveTo(-60, -40); g.bezierCurveTo(-120, 40, 100, 80, 80, 180); g.stroke();
  g.restore();
}

export function muralTex({ bg = '#3a160f', accent = '#d9a645' } = {}) {
  return memo('mural' + bg + accent, () => canvasTex(2048, 640, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const shade = g.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, 'rgba(0,0,0,.25)'); shade.addColorStop(1, 'rgba(255,255,255,.04)');
    g.fillStyle = shade; g.fillRect(0, 0, w, h);
    g.strokeStyle = accent; g.globalAlpha = 0.18; g.lineWidth = 3;
    for (let i = 0; i < 90; i++) {
      const x = rand(0, w), y = rand(0, h), r = rand(10, 30);
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 1.5); g.arc(x + r * 1.2, y, r * 0.6, Math.PI, Math.PI * 2.4); g.stroke();
    }
    g.globalAlpha = 1;
    const cx = w / 2, cy = h * 0.45;
    const colors = ['#2f6e5a', '#a63a26', accent, '#2b4f7a', '#c4552f', '#e8c46a'];
    for (let ring = 7; ring >= 0; ring--) {
      const r = 70 + ring * 34, petals = 18 + ring * 4;
      g.fillStyle = colors[ring % colors.length];
      g.beginPath();
      for (let i = 0; i <= petals * 2; i++) {
        const a = (i / (petals * 2)) * Math.PI * 2, rr = i % 2 ? r : r - 14;
        g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92);
      }
      g.fill();
    }
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, 120);
    glow.addColorStop(0, '#ffe7a8'); glow.addColorStop(1, 'rgba(255,200,100,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, 120, 0, Math.PI * 2); g.fill();
    drawFigure(g, 420, 380, 1.2, '#7a2a1c', accent);
    drawFigure(g, w - 420, 380, 1.2, '#2c5a4c', accent);
    drawFigure(g, 140, 400, 0.9, '#5a3b20', accent);
    drawFigure(g, w - 140, 400, 0.9, '#5a3b20', accent);
    g.strokeStyle = accent; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 4; g.strokeRect(22, 22, w - 44, h - 44);
  }));
}

/* ---------- Cảnh ngoài cửa ---------- */
function tower(g, x, base, hgt, color = '#8a3a22') {
  const tiers = 7, th = hgt / tiers;
  for (let i = 0; i < tiers; i++) {
    const wdt = 46 - i * 4.5, y = base - (i + 1) * th;
    g.fillStyle = color; g.fillRect(x - wdt / 2, y + 4, wdt, th - 4);
    g.fillStyle = '#3a2016';
    g.beginPath(); g.moveTo(x - wdt / 2 - 8, y + 6); g.lineTo(x + wdt / 2 + 8, y + 6); g.lineTo(x + wdt / 2, y); g.lineTo(x - wdt / 2, y); g.fill();
  }
  g.fillStyle = '#d9a645'; g.fillRect(x - 2, base - hgt - 20, 4, 20);
}
function palm(g, x, base, hgt) {
  g.strokeStyle = '#6a5038'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(x, base); g.quadraticCurveTo(x + 15, base - hgt / 2, x + 8, base - hgt); g.stroke();
  g.strokeStyle = '#3f7a3a'; g.lineWidth = 5;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.beginPath(); g.moveTo(x + 8, base - hgt); g.quadraticCurveTo(x + 8 + Math.cos(a) * 40, base - hgt - 25, x + 8 + Math.cos(a) * 70, base - hgt + 20 + Math.sin(a) * 10); g.stroke();
  }
}
function lattice(g, w, h, frame = '#3a2416') {
  g.strokeStyle = frame; g.lineWidth = 16; g.strokeRect(0, 0, w, h);
  g.lineWidth = 6;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo((w / 4) * i, 0); g.lineTo((w / 4) * i, h); g.stroke(); }
  g.lineWidth = 3;
  for (let y = 0; y < h * 0.3; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  for (let x = 0; x < w; x += 22) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h * 0.3); g.stroke(); }
}

export function viewTex(view, { frame = '#3a2416', towerColor } = {}) {
  return memo('view' + view + frame, () => canvasTex(512, 512, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    const skies = {
      pond: ['#e6efe0', '#b9d3b0'], lake: ['#dfe8ef', '#a9c4d6'], clouds: ['#9fb8d8', '#f4f6fa'],
      mountain: ['#d8e2e6', '#b8cbb8'], river: ['#f6c48a', '#e98a5a'], palm: ['#bfe3f7', '#f2f7f0'], garden: ['#e4f0d8', '#9fbf86'],
    };
    const [a, b] = skies[view] || skies.garden;
    sky.addColorStop(0, a); sky.addColorStop(1, b);
    g.fillStyle = sky; g.fillRect(0, 0, w, h);

    if (view === 'pond') {
      g.fillStyle = '#6f9a8a'; g.fillRect(0, h * 0.45, w, h);
      for (let i = 0; i < 26; i++) {
        const x = rand(0, w), y = rand(h * 0.5, h);
        g.fillStyle = '#3f7a3a'; g.beginPath(); g.ellipse(x, y, rand(18, 34), rand(6, 10), 0, 0, Math.PI * 2); g.fill();
        if (Math.random() < 0.4) { g.fillStyle = '#f2a5b8'; g.beginPath(); g.ellipse(x, y - 12, 7, 11, 0, 0, Math.PI * 2); g.fill(); }
      }
    } else if (view === 'lake' || view === 'river') {
      if (view === 'river') { g.fillStyle = '#f9e08a'; g.beginPath(); g.arc(w * 0.7, h * 0.32, 28, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = view === 'river' ? '#6a6a8a' : '#6f8fa8';
      g.fillRect(0, h * 0.5, w, h);
      g.fillStyle = view === 'river' ? '#4a5a4a' : '#5a7a5a';
      g.beginPath(); g.moveTo(0, h * 0.5); for (let x = 0; x <= w; x += 32) g.lineTo(x, h * 0.46 - Math.sin(x / 60) * 10); g.lineTo(w, h * 0.5); g.fill();
      tower(g, w * 0.32, h * 0.5, 170, towerColor);
      g.strokeStyle = 'rgba(255,255,255,.25)';
      for (let i = 0; i < 20; i++) { const y = rand(h * 0.55, h); g.beginPath(); g.moveTo(rand(0, w), y); g.lineTo(rand(0, w), y); g.stroke(); }
    } else if (view === 'clouds') {
      g.fillStyle = '#5a6a7a';
      g.beginPath(); g.moveTo(0, h * 0.6); g.lineTo(w * 0.2, h * 0.35); g.lineTo(w * 0.4, h * 0.55); g.lineTo(w * 0.7, h * 0.3); g.lineTo(w, h * 0.5); g.lineTo(w, h); g.lineTo(0, h); g.fill();
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${rand(0.5, 0.9)})`; g.beginPath(); g.ellipse(rand(0, w), rand(h * 0.55, h), rand(40, 110), rand(14, 30), 0, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = '#3f6a3a'; g.lineWidth = 4;
      for (let i = 0; i < 10; i++) { const x = rand(0, w); g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + rand(-20, 20), h * 0.6, x + rand(-30, 30), h * 0.4); g.stroke(); }
    } else if (view === 'mountain') {
      for (let layer = 0; layer < 3; layer++) {
        g.fillStyle = ['#8aa08a', '#5f7f5f', '#3f5f3f'][layer];
        for (let i = 0; i < 6; i++) {
          const x = rand(-40, w), wd = rand(60, 120), ht = rand(120, 240) - layer * 30;
          g.beginPath(); g.moveTo(x, h * 0.75); g.quadraticCurveTo(x + wd * 0.1, h * 0.75 - ht, x + wd / 2, h * 0.75 - ht); g.quadraticCurveTo(x + wd * 0.9, h * 0.75 - ht, x + wd, h * 0.75); g.fill();
        }
      }
      g.fillStyle = '#7a9a8a'; g.fillRect(0, h * 0.75, w, h);
    } else if (view === 'palm') {
      g.fillStyle = '#c8b890'; g.fillRect(0, h * 0.7, w, h);
      for (let i = 0; i < 4; i++) palm(g, 60 + i * 130 + rand(-20, 20), h * 0.75, rand(200, 280));
    } else {
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${rand(30, 60)},${rand(70, 100)},${rand(30, 50)},.8)`; g.beginPath(); g.ellipse(rand(0, w), rand(h * 0.2, h * 0.7), rand(40, 90), rand(14, 26), rand(-0.3, 0.3), 0, Math.PI * 2); g.fill(); }
    }
    lattice(g, w, h, frame);
  }));
}

/* ---------- Hạt tràng ---------- */
export function beadTex({ c1 = '#d98a48', c2 = '#e8a565', grain = '#8c4619', metal = 0 } = {}) {
  return memo('bead' + c1 + c2 + grain + metal, () => canvasTex(256, 256, (g, w, h) => {
    const base = g.createLinearGradient(0, 0, w, 0);
    base.addColorStop(0, c1); base.addColorStop(0.5, c2); base.addColorStop(1, c1);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    if (metal) return; // kim loại không có vân gỗ
    g.strokeStyle = grain;
    for (let i = 0; i < 40; i++) {
      g.globalAlpha = rand(0.08, 0.3); g.lineWidth = rand(0.5, 2.5);
      g.beginPath(); const y0 = rand(0, h);
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 + Math.sin(x / rand(20, 40)) * rand(2, 8));
      g.stroke();
    }
  }));
}

export const softDot = () => memo('dot', () => canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
}));

// Nhãn tên trên đầu nhân vật: khung danh hiệu cắt từ hàng 2 của sheet người dùng gửi.
// Bảy cột khung = bảy VẬN của thang 19 mốc (xem ladder.js), còn bậc chỉ hiện bằng chữ.
// Ấn hàng 3 dành riêng cho HUD/modal React.
const frameImgs = [];
function frameImg(n) {
  if (!frameImgs[n]) {
    const im = new Image();
    im.src = '/temple/badges/danh-hieu-frame-' + n + '.png';
    frameImgs[n] = im;
  }
  return frameImgs[n];
}
// world.js ghim cờ này vào tag để dựng lại nhãn ngay khi khung nạp xong.
export function frameReady(level) {
  const f = frameImg(rungOf(level).realm);
  return f.complete && !!f.naturalWidth;
}
// Không "warm-up" bằng một vòng lặp lúc module nạp: frameReady được gọi mỗi nhịp phòng
// và đã kích hoạt tải ảnh, còn vòng lặp chạy cả trên server (nơi không có `Image`).

// Vẽ khung ở mọi bề rộng mà không méo hoa văn: hai đầu và giữa giữ nguyên tỷ lệ,
// chỉ hai dải nền giữa chúng là giãn ngang.
function drawFrame(g, im, x, y, w, h) {
  const pw = im.naturalWidth, ph = im.naturalHeight, s = h / ph;
  const cap = 0.18 * pw * s, mid = 0.2 * pw * s, fill = (w - 2 * cap - mid) / 2;
  const P = (fx, fw, dx, dw) => g.drawImage(im, fx * pw, 0, fw * pw, ph, dx, y, dw, h);
  P(0, 0.18, x, cap);
  P(0.18, 0.22, x + cap, fill);
  P(0.4, 0.2, x + cap + fill, mid);
  P(0.6, 0.22, x + cap + fill + mid, fill);
  P(0.82, 0.18, x + w - cap, cap);
}

// Sao nhiều cánh vẽ bằng path: 5 cánh cho sao bậc, 4 cánh cho tia chớp.
function pathStar(g, cx, cy, r, points, inner) {
  g.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rad = i % 2 ? r * inner : r;
    if (i) g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    else g.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.closePath();
}

// Sprite hiệu ứng của Kenney Particle Pack (CC0), xem docs/SHRINE-BADGE-FRAMES.md.
// Bảy tệp 256px nạp một lần và dùng chung cho mọi nhãn.
const FX_NAMES = ['spark_01', 'spark_02', 'spark_04', 'spark_07', 'star_06', 'star_09', 'flare_01'];
// Số khoảnh khắc của một lượt sét. Vẽ thành dải ngang trong chính ảnh nhãn rồi chạy
// bằng UV (world.js dời map.offset.x) vì hai lý do đã đo: mặt trong khung đặc 100%
// nên một sprite sét đặt sau nhãn là vô hình, còn sprite sét đặt trước nhãn bằng
// additive thì làm bloat nét chữ.
const BOLT_FRAMES = 6;
const fxImgs = {};
function fxImg(n) {
  if (!fxImgs[n]) {
    const im = new Image();
    im.src = '/temple/fx/' + n + '.png';
    fxImgs[n] = im;
  }
  return fxImgs[n];
}
// world.js ghim cờ này vào tag: thiếu một sprite là cả 6 frame chỉ có nét viền, không
// có sét, nên phải biết chắc cả bảy đã về rồi mới dựng nhãn.
export function fxReady() {
  FX_NAMES.forEach(fxImg);
  return FX_NAMES.every((n) => fxImgs[n].complete && !!fxImgs[n].naturalWidth);
}

// Hue đo từ chính ảnh khung: cụm hue đông nhất trong vùng no màu của
// danh-hieu-frame-N.png. Sét giữ đúng hue ấy nhưng đẩy sáng lên 78% để nó đọc là tia
// sét chứ không phải vệt sơn cùng màu khung.
const REALM_HUE = [15, 105, 195, 270, 30, 0, 210];
const hsl = (h, s, l) => `hsl(${h}, ${s}%, ${l}%)`;
const hsla = (h, s, l, a) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

// Tô màu sprite: sprite gốc trắng nên tint bằng source-atop trên canvas tạm rồi blit
// lại bằng 'lighter'. Một canvas dùng chung, cấp phát theo cỡ lớn nhất từng thấy.
let sprC = null, sprG = null;
function fxSpr(g, im, x, y, w, h, alpha, tint, rot) {
  if (!im.complete || !im.naturalWidth || alpha <= 0) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = Math.min(1, Math.max(0, alpha));
  g.translate(x, y);
  if (rot) g.rotate(rot);
  const cw = Math.max(2, Math.ceil(w)), ch = Math.max(2, Math.ceil(h));
  if (tint) {
    if (!sprC) { sprC = document.createElement('canvas'); sprG = sprC.getContext('2d'); }
    if (sprC.width < cw || sprC.height < ch) { sprC.width = cw; sprC.height = ch; }
    sprG.globalCompositeOperation = 'source-over';
    sprG.clearRect(0, 0, cw, ch);
    sprG.drawImage(im, 0, 0, cw, ch);
    sprG.globalCompositeOperation = 'source-atop';
    sprG.fillStyle = tint;
    sprG.fillRect(0, 0, cw, ch);
    g.drawImage(sprC, 0, 0, cw, ch, -w / 2, -h / 2, w, h);
  } else g.drawImage(im, -w / 2, -h / 2, w, h);
  g.restore();
}

// Sao hạng: thân ngũ giác cắt sắc làm hai nửa sáng/tối ở 46% (khối nổi, không phải
// vệt gradient đều) cộng quầng sao 4 cánh Kenney thở theo số frame.
function rankStar(g, cx, cy, r, i) {
  pathStar(g, cx, cy, r, 5, 0.47);
  const f = g.createLinearGradient(0, cy - r, 0, cy + r);
  f.addColorStop(0, '#ffefb2');
  f.addColorStop(0.46, '#ffd257');
  f.addColorStop(0.46, '#e0951f');
  f.addColorStop(1, '#9c560a');
  g.fillStyle = f;
  g.fill();
  pathStar(g, cx, cy, r, 5, 0.47);
  g.strokeStyle = 'rgba(74,40,7,.9)';
  g.lineWidth = 1.5;
  g.stroke();
  fxSpr(g, fxImg('star_06'), cx, cy - r * 0.15, r * 2.6, r * 2.6,
    0.4 + 0.28 * Math.sin(i * 0.8 + 1), 'rgba(255,236,170,1)');
}

// Số sao = bậc của vận hiện tại, đúng cơ chế sao trong TFT: một sao, hai sao, ba sao là
// trần. Đỉnh Như Ý không có bậc hai nên giữ ba sao — thang đã hết bậc, không tụt xuống
// một sao ngay ở mốc cao nhất.
function starsOf(level) {
  const { realm, stage } = rungOf(level);
  return realm === 7 ? 3 : stage;
}

// Mask nét chữ trắng trên nền trong, cache theo (chữ, font): lớp sét xuyên qua chữ
// cắt bằng destination-in vào đúng mặt nạ này.
let measureG = null;
const glyphCache = new Map();
function glyphMask(text, font) {
  const key = text + '|' + font;
  const hit = glyphCache.get(key);
  if (hit) return hit;
  if (!measureG) measureG = document.createElement('canvas').getContext('2d');
  measureG.font = font;
  const cw = Math.ceil(measureG.measureText(text).width) + 44, ch = Math.ceil(27 * 2.5);
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const s = c.getContext('2d');
  s.font = font; s.textAlign = 'center'; s.textBaseline = 'middle';
  s.fillStyle = '#fff';
  s.fillText(text, cw / 2, ch / 2);
  const e = { c, cw, ch };
  glyphCache.set(key, e);
  return e;
}

// Giật của sét phải xác định theo số frame, không theo Math.random: 6 frame của một
// spritesheet được dựng lại mỗi lần người đó lên bậc, ngẫu nhiên thật sẽ làm sét đổi
// dạng ngay cả khi không có gì thay đổi.
const rnd = (seed) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Lõi sét đi ở 1/3 trên thân chữ — bổ ngang thân là lý do bản đầu tiên bị chê khó đọc.
const BOLT_Y = 0.33;

function boltPath(g, x0, y0, x1, y1, seg, amp, seed) {
  g.beginPath();
  g.moveTo(x0, y0);
  for (let i = 1; i <= seg; i += 1) {
    const f = i / seg;
    g.lineTo(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f + (rnd(seed + i * 7.3) - 0.5) * amp * (1 - Math.abs(f - 0.5) * 0.7));
  }
}

// Thân sét: đầu sét (spark_07 nằm ngang) + ba nhánh phía sau + lõi gãy white-hot kéo
// từ đuôi tới đầu + ba tia rẽ nhánh + điểm nóng tại đầu. k là tỷ lệ so với chữ.
function boltBody(l, cw, ch, head, i, hue, k) {
  l.globalCompositeOperation = 'lighter';
  l.lineCap = 'round';
  const by = ch * BOLT_Y, bw = cw * 0.5 * k;
  fxSpr(l, fxImg('spark_07'), head, by, bw, bw * 0.3, k, hsl(hue, 95, 78), (rnd(i * 3.1) - 0.5) * 0.12);
  for (let b = 0; b < 3; b += 1) {
    const fx = head - bw * (0.22 + b * 0.24);
    if (fx < 0) break;
    const fy = by + ch * 0.26 * (rnd(i * 5 + b * 11) - 0.5) * 2;
    const im = fxImg(['spark_01', 'spark_02', 'spark_04'][b]);
    const s2 = bw * (0.46 - b * 0.08);
    fxSpr(l, im, fx, fy, s2, s2 * 0.75, 0.62 * k - b * 0.1 * k, hsl(hue, 95, 78), (rnd(i * 9 + b) - 0.5) * 1.2);
  }
  const tail = Math.max(cw * 0.05, head - cw * 0.4);
  for (const [w, a] of [[10, 0.45], [4, 0.8]]) {
    boltPath(l, tail, by, head, by, 12, ch * 0.26, i);
    l.strokeStyle = hsla(hue, 95, 62, a * k);
    l.lineWidth = w * k;
    l.stroke();
  }
  boltPath(l, tail, by, head, by, 12, ch * 0.26, i);
  l.strokeStyle = hsla(0, 0, 100, 0.95 * k);
  l.lineWidth = 2.2 * k;
  l.stroke();
  for (let b = 0; b < 3; b += 1) {
    const bx = head - cw * (0.08 + b * 0.12), y2 = by + ch * 0.3 * (rnd(i + b) > 0.5 ? -1 : 1);
    for (const [w, c, a] of [[3.5, hsla(hue, 95, 62, 0.5 * k)], [1.3, hsla(0, 0, 100, 0.85 * k)]]) {
      boltPath(l, bx, by, bx + cw * 0.08, y2, 5, ch * 0.12, i * 13 + b);
      l.strokeStyle = c;
      l.lineWidth = w * k;
      l.stroke();
    }
  }
  const hot = l.createRadialGradient(head, by, 2, head, by, cw * 0.1);
  hot.addColorStop(0, hsla(0, 0, 100, 0.3 * k));
  hot.addColorStop(1, hsla(hue, 95, 60, 0));
  l.fillStyle = hot;
  l.fillRect(0, 0, cw, ch);
}

// Hai lớp sét phải sống đồng thời tới lúc ghép nên mỗi lớp cần canvas riêng; ép đúng cỡ
// mặt nạ để một blit 5 tham số không ăn sang phần ô khác của frame trước.
const layers = [null, null];
function layer(n, w, h) {
  let c = layers[n];
  if (!c) { c = document.createElement('canvas'); layers[n] = c; }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.clearRect(0, 0, w, h);
  return g;
}

// Sét chạy dọc chữ hạng, ghép theo thứ tự đã duyệt: quầng mờ quanh nét → lớp sét nổi
// (SAU chữ) → chữ viền nâu đậm lót trên → lớp sét xuyên nét chữ. Chữ vẽ đè lên sét là
// thứ giữ cho danh hiệu đọc được ở cỡ thật khi đứng xa.
function titleBolt(g, text, cx, cy, font, i, hue) {
  const { c: gc, cw, ch } = glyphMask(text, font);
  const head = cw * (0.05 + 0.9 * (i / BOLT_FRAMES));
  const lc = layer(0, cw, ch);
  boltBody(lc, cw, ch, head, i, hue, 0.85);
  lc.globalCompositeOperation = 'destination-in';
  lc.drawImage(gc, 0, 0);
  const uc = layer(1, cw, ch);
  boltBody(uc, cw, ch, head, i, hue, 1.25);
  fxSpr(uc, fxImg('star_09'), head, ch * BOLT_Y, cw * 0.18, cw * 0.18, 0.7, hsl(hue, 95, 80));
  fxSpr(uc, fxImg('flare_01'), head, ch * BOLT_Y, cw * 0.46, cw * 0.3, 0.55, hsl(hue, 95, 82));
  const dx = Math.round(cx - cw / 2), dy = Math.round(cy - ch / 2);
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.filter = 'blur(8px)';
  g.globalAlpha = 0.1 + 0.16 * Math.max(0, 1 - Math.abs(head / cw - 0.5) * 1.6);
  g.drawImage(gc, dx, dy);
  g.restore();
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.drawImage(layers[1], dx, dy);
  g.restore();
  g.save();
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 4.5;
  g.strokeStyle = 'rgba(26,12,4,.92)';
  g.strokeText(text, cx, cy);
  g.lineWidth = 2;
  g.strokeStyle = hsla(hue, 80, 32, 0.9);
  g.strokeText(text, cx, cy);
  g.shadowColor = 'rgba(0,0,0,.8)';
  g.shadowBlur = 6;
  const fill = g.createLinearGradient(0, cy - 16, 0, cy + 16);
  fill.addColorStop(0, '#ffffff');
  fill.addColorStop(0.55, '#fff2cf');
  fill.addColorStop(1, '#ffd98d');
  g.fillStyle = fill;
  g.fillText(text, cx, cy);
  g.restore();
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.drawImage(layers[0], dx, dy);
  g.restore();
}

// Một ô 512x224 = một danh hiệu tĩnh, chỉ khác nhau ở đúng dải chữ hạng.
function badgeCell(g, name, label, level, realm, hue, i) {
  const W = 512;
  const titleFont = '800 27px -apple-system, Segoe UI, Roboto, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = titleFont;
  const tw = g.measureText(label).width;
  // Lòng khung (vùng nền tối) chỉ rộng non nửa bản vẽ: giãn khung theo chữ chứ không
  // condense chữ, nếu không chữ dài sẽ dính vào hoa văn hai đầu.
  const hw = Math.min(W - 24, Math.max(250, tw / 0.5 + 10)), hx = (W - hw) / 2;
  const frame = frameImg(realm);
  if (frame.complete && frame.naturalWidth) drawFrame(g, frame, hx, 34, hw, 88);
  else { g.fillStyle = 'rgba(20,14,10,.6)'; g.beginPath(); g.roundRect(hx, 34, hw, 88, 12); g.fill(); }
  // Dải 32px trên cùng dành riêng cho hàng sao, nằm ngay trên honor.
  const n = starsOf(level);
  for (let s = 0; s < n; s += 1) rankStar(g, W / 2 + (s - (n - 1) / 2) * 34, 18, 13, i);
  titleBolt(g, label, W / 2, 72, titleFont, i, hue);
  g.font = '600 40px -apple-system, Segoe UI, Roboto, sans-serif';
  const nw = Math.min(W - 20, g.measureText(name).width + 40);
  g.fillStyle = 'rgba(20,14,10,.6)';
  g.beginPath();
  g.roundRect((W - nw) / 2, 128, nw, 58, 29);
  g.fill();
  g.fillStyle = '#fff';
  g.fillText(name, W / 2, 157, W - 40);
  g.font = '500 26px -apple-system, Segoe UI, Roboto, sans-serif';
  g.fillStyle = '#fbe3ae';
  g.fillText(rungLabel(level), W / 2, 206);
}

// Nhãn là spritesheet ngang: F ô 512x224 kế tiếp nhau, repeat.x = 1/F nên cửa sổ UV
// của sprite chỉ ăn đúng một ô và offset.x = k/F nhảy sang ô k. Mi-mapping vẫn bật:
// hai mép trái/phải của mỗi ô là vùng nền trong suốt (khung bắt đầu từ x=12) nên các
// ô không lẫn vào nhau ở bậc mi thấp.
export function danhHieuLabelTex(name, title, level, frames = BOLT_FRAMES) {
  const F = Math.max(1, frames);
  const { realm } = rungOf(level);
  const label = title || titleOfLevel(level);
  const tex = canvasTex(512 * F, 224, (g) => {
    for (let i = 0; i < F; i += 1) {
      g.save();
      g.translate(512 * i, 0);
      badgeCell(g, name, label, level, realm, REALM_HUE[realm - 1], i);
      g.restore();
    }
  });
  tex.repeat.set(1 / F, 1);
  tex.frames = F;
  return tex;
}

export function labelTex(name, sub, color = '#fbe3ae') {
  return canvasTex(512, 128, (g, w, h) => {
    g.font = '600 44px -apple-system, Segoe UI, Roboto, sans-serif';
    const tw = Math.min(w - 20, g.measureText(name).width + 40);
    g.fillStyle = 'rgba(20,14,10,.55)';
    const x = (w - tw) / 2;
    g.beginPath(); g.roundRect(x, 8, tw, 70, 35); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name, w / 2, 44, w - 40);
    if (sub) { g.font = '500 30px -apple-system, Segoe UI, Roboto, sans-serif'; g.fillStyle = color; g.fillText(sub, w / 2, 104); }
  });
}
