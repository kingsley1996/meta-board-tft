// Đo màu và vị trí từ ẢNH THAM CHIẾU, không đoán. Chạy:
//   node measure.mjs <anh> --palette
//   node measure.mjs <anh> --region 0.3,0.1,0.7,0.5 --hue 300,360
//   node measure.mjs <anh> --grid
//   node measure.mjs <anh> --crop 0.2,0.0,0.8,0.4 --out /tmp/zoom.png
// --region trả median của các điểm no màu trong ô (toạ độ theo tỷ lệ 0..1), nên nền mờ
// và chớp sáng trắng không kéo màu đi lệch. --hue lọc theo dải Hue (độ), --sat trần tối
// thiểu độ no để loại xám.
import sharp from 'sharp';

const a = process.argv.slice(2);
const src = a[0];
if (!src) { console.log('dung: node measure.mjs <anh> --palette | --region x0,y0,x1,y1 [--hue lo,hi] [--sat n] | --grid | --crop x0,y0,x1,y1 --out <png>'); process.exit(1); }
const flag = (n, d) => { const i = a.indexOf(`--${n}`); return i < 0 ? d : a[i + 1]; };
// Toa do luon la ti le 0..1 (anh nao cung duoc, khong can biet kich thuoc). Truyen px vao
// day se thanh vong lap hang tram trieu luot va OT.
const frac4 = (name) => {
  const v = String(flag(name, '')).split(',').map(Number);
  if (v.length !== 4 || v.some((n) => !Number.isFinite(n))) { console.log(`--${name} can 4 so ti le 0..1, vi du 0.3,0.1,0.7,0.5`); process.exit(1); }
  if (v.some((n) => n < 0 || n > 1)) { console.log(`--${name}: "${v.join(',')}" ngoai 0..1. Do la toa do px thi chia cho canh anh (anh nay bao nhieu px cung la 0..1 het).`); process.exit(1); }
  return v;
};
const S = 300;
const { data, info } = await sharp(src).resize(S, S).raw().toBuffer({ resolveWithObject: true });
const ch = info.channels;
const px = (x, y) => { const i = (y * S + x) * ch; return [data[i], data[i + 1], data[i + 2]]; };
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const satOf = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b);
const hueOf = ([r, g, b]) => {
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (!d) return -1;
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
};

if (a.includes('--palette')) {
  const bucket = new Map();
  for (let i = 0; i < S * S; i++) {
    const c = px(i % S, (i / S) | 0);
    const k = c.map((v) => v >> 5).join(',');
    const e = bucket.get(k) || { n: 0, c: [0, 0, 0] };
    e.n++; c.forEach((v, j) => (e.c[j] += v));
    bucket.set(k, e);
  }
  console.log('== palette (14 nhom lon nhat) ==');
  for (const e of [...bucket.values()].sort((x, y) => y.n - x.n).slice(0, 14)) {
    const c = e.c.map((v) => v / e.n);
    console.log(`${hex(c)}  ${((e.n / (S * S)) * 100).toFixed(1)}%  sat ${satOf(c).toFixed(0)}  hue ${hueOf(c).toFixed(0)}`);
  }
}

if (a.includes('--region')) {
  const [x0, y0, x1, y1] = frac4('region');
  const [hlo, hhi] = (flag('hue') || '-1,-1').split(',').map(Number);
  const satMin = Number(flag('sat', 70));
  const sel = [];
  for (let y = Math.round(y0 * S); y < Math.round(y1 * S); y++)
    for (let x = Math.round(x0 * S); x < Math.round(x1 * S); x++) {
      const c = px(x, y);
      if (satOf(c) < satMin) continue;
      if (hhi >= 0) { const h = hueOf(c); if (!(hlo <= hhi ? h >= hlo && h < hhi : h >= hlo || h < hhi)) continue; }
      sel.push(c);
    }
  if (sel.length < 12) { console.log('region: qua it px', sel.length); process.exit(0); }
  const med = (k) => sel.map((p) => p[k]).sort((x, y) => x - y)[Math.round(sel.length * 0.5)];
  const c = [0, 1, 2].map(med);
  const mean = [0, 1, 2].map((k) => sel.reduce((s, p) => s + p[k], 0) / sel.length);
  console.log(`== region ${x0},${y0}..${x1},${y1} ==`);
  console.log(`median ${hex(c)}  px ${sel.length}  sat ${satOf(c).toFixed(0)}  hue ${hueOf(c).toFixed(0)}`);
  console.log(`mean   ${hex(mean)}  sat ${satOf(mean).toFixed(0)}  hue ${hueOf(mean).toFixed(0)}`);
}

if (a.includes('--grid')) {
  console.log('== luoi 10x10: hue / sat (trống = duoi 40 no mau) ==');
  for (let gy = 0; gy < 10; gy++) {
    const row = [];
    for (let gx = 0; gx < 10; gx++) {
      const c = px(gx * 30 + 15, gy * 30 + 15);
      row.push(satOf(c) < 40 ? '  .  ' : `${hueOf(c).toFixed(0).padStart(3)}/${satOf(c).toFixed(0).padStart(2)}`);
    }
    console.log(`y${(gy / 10).toFixed(1)} ` + row.join(' '));
  }
}

if (a.includes('--crop')) {
  const [x0, y0, x1, y1] = frac4('crop');
  const out = flag('out', '/tmp/crop.png');
  const m = await sharp(src).metadata();
  await sharp(src)
    .extract({ left: Math.round(x0 * m.width), top: Math.round(y0 * m.height), width: Math.max(1, Math.round((x1 - x0) * m.width)), height: Math.max(1, Math.round((y1 - y0) * m.height)) })
    .resize(480, 480, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toFile(out);
  console.log('crop ->', out);
}
