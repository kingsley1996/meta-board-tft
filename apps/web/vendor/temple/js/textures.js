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

export function danhHieuLabelTex(name, title, level) {
  return canvasTex(512, 192, (g, w) => {
    const { realm } = rungOf(level), frame = frameImg(realm);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 27px -apple-system, Segoe UI, Roboto, sans-serif';
    const label = title || titleOfLevel(level);
    const tw = g.measureText(label).width;
    // Lòng khung (vùng nền tối) chỉ rộng non nửa bản vẽ: giãn khung theo chữ chứ không
    // condense chữ, nếu không chữ dài sẽ dính vào hoa văn hai đầu.
    const hw = Math.min(w - 24, Math.max(250, tw / 0.5 + 10)), hx = (w - hw) / 2;
    if (frame.complete && frame.naturalWidth) drawFrame(g, frame, hx, 2, hw, 88);
    else { g.fillStyle = 'rgba(20,14,10,.6)'; g.beginPath(); g.roundRect(hx, 2, hw, 88, 12); g.fill(); }
    // chữ nằm trên nền khung nhiều màu nên cần viền tối, nếu không mất trên nền vàng
    g.shadowColor = 'rgba(0,0,0,.85)'; g.shadowBlur = 7;
    g.fillStyle = '#ffe9a8';
    g.fillText(label, Math.round(w / 2), 40);
    g.shadowBlur = 0;
    g.font = '600 40px -apple-system, Segoe UI, Roboto, sans-serif';
    const nw = Math.min(w - 20, g.measureText(name).width + 40);
    g.fillStyle = 'rgba(20,14,10,.6)'; g.beginPath(); g.roundRect((w - nw) / 2, 96, nw, 58, 29); g.fill();
    g.fillStyle = '#fff'; g.fillText(name, w / 2, 125, w - 40);
    g.font = '500 26px -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillStyle = '#fbe3ae'; g.fillText(rungLabel(level), w / 2, 174);
  });
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
