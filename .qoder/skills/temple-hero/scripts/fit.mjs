// Máy tính hình học cho nhân vật trong avatar.js, dựng sẵn để khỏi đoán lại ba lần một
// công thức. Chạy bằng Node thường, KHÔNG cần three (avatar.js import 'three' bằng bare
// specifier nên require thẳng tệp đó sẽ MODULE_NOT_FOUND).
//
//   node fit.mjs point 0.4864,0.9452,-0.2935 --rotY 0.45
//   node fit.mjs cone 0.125,0.66 --pos 0.3139,0.6765,-0.2104 --rot -0.30,0,-0.55 --scale 1,1,0.45 --rotY 0.45 --headRotX -0.03
//   node fit.mjs frame --cy 1.26 --dist 4.8 --need 2.386,-0.501
//   node fit.mjs frame --fit 2.386,0.12
//   node fit.mjs uv -1.2,0.9
//   node fit.mjs px 544,227.6 --w 1600 --h 763 --phiStart -1.5 --phiLength 2 --thetaStart 0 --thetaLength 0.805
//
// uv <phiPi,thetaPi> -> toa do px tren canvas;  px <x,y> -> nguoc lai (kem azimuth).
// Mac dinh dien hinh = G.facePatch (avatar.js:229: 512x512, -0.82pi/0.64pi, 0.24pi/0.54pi).
// Tam son cua yone_chibi nam tren G.yoneMask (avatar.js:238: 1600x763, -1.5pi/2pi, 0/0.805pi)
// nen PHAI truyen du tham so o dong `px` tren; galong mac dinh vao so cua canvas 1600 se tra
// azimuth lech hang chuc do. Moc kiem chung: goc canvas cu (544,227.6) phai ra az -57,6deg.
//
// Quy ước toạ độ ĐẦU (head space, tâm khối đầu ở 0,0,0, bán kính 0,46):
//   y = r*cos(theta)  (KHÔNG phải sin), x = -r*cos(phi)*sin(theta), z = r*sin(phi)*sin(theta)
//   theta = góc cực từ +y (0 = đỉnh đầu), mặt trước = -z.
//   azimuth A = deg(atan2(z, -x)) + 90  => A = 0 ngay trước mặt, A am = phía +x = bên
//   TRÁI người nhìn. Tấm sơn facePatch phủ |A| <= 57,6deg, theta 43,2..140.
// Thế giới = head space + headY 0.98 + upperY 0.30 (ngồi) + rootY 0.17, rồi xoay thân
// quanh trục y một góc rotY (0.45 trong mọi ảnh thumb).

const argv = process.argv.slice(2);
const mode = argv[0];
const raw = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const N = (n, d) => Number(String(raw(n, d)).replace(/pi/g, '*Math.PI').replace(/^\*/, '1*'));
const V = (n, d) => String(raw(n, d)).split(',').map(Number);
const fmt = (x) => (Math.round(x * 1000) / 1000).toFixed(3);

const HEAD_Y = N('headY', 0.98), UPPER_Y = N('upperY', 0.3), ROOT_Y = N('rootY', 0.17);
const ROTY = N('rotY', 0), HEADROTX = N('headRotX', 0);

// Euler 'XYZ' của three áp lên vector = Rx(Ry(Rz(v))), và rotY của thân quay quanh trục y.
function rotXYZ(v, [rx, ry, rz]) {
  let [x, y, z] = v;
  let c = Math.cos(rz), s = Math.sin(rz); [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(ry); s = Math.sin(ry); [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(rx); s = Math.sin(rx); [y, z] = [y * c - z * s, y * s + z * c];
  return [x, y, z];
}
function toWorld(p) {
  const [x, y0, z0] = rotXYZ(p, [HEADROTX, 0, 0]);
  const y = y0 + HEAD_Y + UPPER_Y + ROOT_Y;
  const c = Math.cos(ROTY), s = Math.sin(ROTY);
  return { x: x * c + z0 * s, y, z: -x * s + z0 * c };
}
function polar(p) {
  const [x, y, z] = p;
  const r = Math.hypot(x, y, z);
  return { r, theta: Math.acos(y / r) * 180 / Math.PI, az: Math.atan2(z, -x) * 180 / Math.PI + 90 };
}
function report(name, headP) {
  const w = toWorld(headP), pl = polar(headP);
  const onSheet = pl.theta <= 144.9;
  console.log(`${name}  head ${headP.map(fmt).join(',')}  |  world y ${fmt(w.y)} z ${fmt(w.z)} x ${fmt(w.x)}  |  theta ${fmt(pl.theta)}deg az ${fmt(pl.az)}deg r ${fmt(pl.r)} ${onSheet ? '' : '(DUOI phiến son)'}`);
}

if (mode === 'point') report('diem ', V('p', argv[1]));
else if (mode === 'cone') {
  const [r, h] = V('c', argv[1]);
  const pos = V('pos', '0,0,0'), rot = V('rot', '0,0,0'), sc = V('scale', '1,1,1');
  const apex = pos.map((v, i) => v + rotXYZ([0, (h / 2) * sc[1], 0], rot)[i]);
  const base = pos.map((v, i) => v + rotXYZ([0, -(h / 2) * sc[1], 0], rot)[i]);
  report('apex ', apex); report('base ', base);
  console.log(`truc cone ${rotXYZ([0, 1, 0], rot).map(fmt).join(',')}`);
  console.log(`ban kinh day ${fmt(r * Math.max(sc[0], sc[2]))} (scale x/z), chóp cone nam tai tam + truc*(h/2)`);
} else if (mode === 'frame') {
  const cy = N('cy', 1.26), d = N('dist', 4.8), fov = N('fov', 32);
  const t = Math.tan((fov / 2) * Math.PI / 180);
  console.log(`may anh (0, ${fmt(cy)}, -${fmt(d)}) fov ${fov}: tai z=0 khung bao y ${fmt(cy - d * t)}..${fmt(cy + d * t)}, nua rong ${fmt(d * t)}`);
  for (const n of ['need', 'needBottom']) {
    const v = raw(n); if (!v) continue;
    const [y, z] = v.split(',').map(Number);
    const allowed = (d + z) * t, want = Math.abs(y - cy);
    console.log(`${n} y ${y} z ${z}: can ${fmt(want)}, khung cho ${fmt(allowed)} -> ${allowed >= want ? 'LOT, le ' + fmt(allowed - want) : 'CAT MIENG ' + fmt(want - allowed)}`);
  }
  const fit = raw('fit');
  if (fit) {
    const [top, bottom] = fit.split(',').map(Number);
    console.log(`goi y: cy ${fmt((top + bottom) / 2)}, dist toi thieu ${fmt(((top - bottom) / 2) / t)} (cho moi vat z=0), them 6% -> ${fmt(((top - bottom) / 2 / t) * 1.06)}. Vat gan ong kinh (z am) can dist LON HON: trù z của nó vào.`);
  }
} else if (mode === 'uv' || mode === 'px') {
  const W = N('w', 512), H = N('h', 512);
  const ps = N('phiStart', -0.82), pl = N('phiLength', 0.64), ts = N('thetaStart', 0.24), tl = N('thetaLength', 0.54);
  if (mode === 'uv') {
    const [phi, theta] = V('a', argv[1]).map((x) => x * Math.PI);
    console.log(`phi ${fmt(phi / Math.PI)}pi theta ${fmt(theta / Math.PI)}pi -> canvas ${fmt((phi / Math.PI - ps) / pl * W)},${fmt((theta / Math.PI - ts) / tl * H)}  (ngoai 0..${W}/${H} = khong nam tren tam son)`);
  } else {
    const [x, y] = V('a', argv[1]);
    const phi = (ps + (x / W) * pl) * Math.PI, theta = (ts + (y / H) * tl) * Math.PI;
    console.log(`canvas ${x},${y} -> phi ${fmt(phi / Math.PI)}pi theta ${fmt(theta / Math.PI)}pi | azimuth ${fmt(phi * 180 / Math.PI + 90)}deg | px/deg azimuth ${fmt(W / (pl * 180))}, px/deg polar ${fmt(H / (tl * 180))}`);
  }
} else console.log('mode: point | cone | frame | uv | px  (xem header dau file)');
