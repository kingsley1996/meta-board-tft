// Cong do bong de + goc tu mot diem, chay tren SCENE THAT trong harness (khong co
// cong thuc tai lieu nao trong file nay - do la loi da tra gia, xem harness.html).
//
//   node .qoder/skills/temple-hero/scripts/silhouette.mjs <hero> [flags]
//     --group tailFan     nhanh prop can do (ten cot cua `av` hoac khoa userData)
//     --occ head          nhanh bi che; mac dinh = ca than, truyen 'head' de do toc
//     --view rear,thumb   preset hoac so nguyen van az,el,dist,ty; lap lai duoc
//     --grid 128          phan giac map do sau
//     --near 1            0 = so dung o, 1 = so 3x3 lang gieng (that de giua dinh)
//     --pose sit          stand|sit (mac dinh stand)
//     --walk              bat nhip di de do Bong DANG CHAY, khong chi dang dung yen
//     --shots DIR         luu shot-<hero>-<view>.png vao DIR
//     --min-gap 12        hai ngon dat gan nhau hon thi mat dem duoc 9
//     --sweep 6           lap lai phep do N lan cach nhau ~600ms va lay MAX. Bat buoc voi
//                         prop dong: quat duoi nghieng theo nhip (tailAmp), nen mot frame
//                         may man co the bao 0 trong khi dinh cua chu ky che vao toc.
//     --port 8899         cong cua server tam. Tab cua user thuong dang giu 8899 ->
//                         gate chay 89xx; script that bai ro rang chu khong do lan vao
//                         server cua mot ban harness khac.
//
// exit 1 khi co dinh nam TRUOC be mat bi che ho khi goc khuat sau mat than.
const { chromium } = await import(
  '/Users/samuel/ai-projects/tft-comps/node_modules/playwright/index.mjs');
const { spawn } = await import('node:child_process');

const argv = process.argv.slice(2);
const hero = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'ahri_chibi';
const flag = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const has = (k) => argv.includes('--' + k);
const VIEWS = {
  front: [Math.PI, 0.18, 4.8, 1.05],
  rear: [0, 0.24, 5.2, 1.05],
  thumb: [Math.PI - 0.55, 0.34, 4.8, 1.12],
  q3: [2.35, 0.22, 4.6, 1.02],
};
const OPT = {
  group: flag('group', 'tailFan'), occ: flag('occ', 'head'),
  grid: +flag('grid', 128), near: +flag('near', 1),
};
const views = flag('view', 'rear').split(',').map((v) =>
  VIEWS[v.trim()] ? [v.trim(), ...VIEWS[v.trim()]] : [v.trim(), ...v.split(',').map(Number)]);
const SWEEPS = Math.max(1, +flag('sweep', has('walk') ? 6 : 1));
// Khoang goc he nhat giua hai dinh ngon. Duoi ~12 do thi hai ngon trung nhau tren moi
// vong tron va mat dem duoc 9 - day la "nhin sau khong du 9" ma user da bao.
const MIN_GAP = +flag('min-gap', 12);

const PORT = +flag('port', 8899);
// Cong dang co ai do ngoi (thuong la TAB CUA USER chay ban harness ra truoc do) thi
// spawn se that bai YEN LANG (stdio 'ignore') va phep do buoc loi vao server AY: co the
// la ban harness cu, khong co __api moi. Bao ro, de user giu 8899 con gate o 89xx.
const net = await import('node:net');
const busy = await new Promise((r) => {
  const s = net.createServer();
  s.once('error', () => r(true));
  s.once('listening', () => s.close(() => r(false)));
  s.listen(PORT, '127.0.0.1');
});
if (busy) {
  console.log(`cong ${PORT} dang bi chiem. Gate phai do dung ban harness cua lan chay nay` +
    ` (tab cua user o ${PORT} co the la ban cu) -> chay lai voi --port ${PORT + 2}`);
  process.exit(2);
}
const srv = spawn('node', [new URL('preview.mjs', import.meta.url).pathname, hero, '--port', PORT],
  { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));

const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await p.goto(`http://127.0.0.1:${PORT}/?hero=${hero}`, { waitUntil: 'load' });
await p.waitForTimeout(9000);
// __api vang mat = avatar.js loi (cú phap hoac import khong toi). Bao ro thay vi
// de page.evaluate nem "Cannot read properties of undefined" giua luot do.
if (!(await p.evaluate(() => !!window.__api))) {
  console.log('harness khong load duoc avatar.js:' + (errs[0] || 'khong co pageerror - kiem tra URL/port'));
  await b.close(); srv.kill(); process.exit(2);
}
if (flag('pose', 'stand') === 'sit') await p.evaluate(() => window.__api.setPose(true));
if (has('walk')) await p.evaluate(() => window.__api.setMoving(true));
await p.waitForTimeout(1200);

let bad = 0;
for (const [name, az, el, dist, ty] of views) {
  await p.evaluate((v) => window.__api.setView(...v), [az, el, dist, ty]);
  await p.waitForTimeout(name === 'rear' || name === 'q3' ? 1500 : 900);
  let s = null;
  for (let k = 0; k < SWEEPS; k++) {
    const c = await p.evaluate((o) => window.__api.silhouette(o), OPT);
    if (!s || (c.over ?? -1) > s.over) s = c;
    if (k + 1 < SWEEPS) await p.waitForTimeout(600);
  }
  const r = await p.evaluate((o) => window.__api.rootProbe(o), { group: OPT.group });
  if (s.missing || r.missing) { console.log(JSON.stringify({ view: name, ...s, ...r })); bad++; continue; }
  const hit = s.rows.filter((x) => x.over > 0).sort((a, b) => b.over - a.over);
  console.log(`\n[${name}] ${OPT.group} vs ${OPT.occ} · grid ${OPT.grid} near ${OPT.near}` +
    ` · ${SWEEPS} frame · ${s.duocChe} o bi che/${s.occVerts} dinh`);
  console.log(`  DE LEN: ${s.over}   bi an: ${s.behind}   trong cho trong: ${s.rows.reduce((a, x) => a + x.free, 0)}`);
  for (const x of hit) {
    console.log(`  ${x.tag}: ${x.over} dinh nam TRUOC, sau ${x.sau} m tai world ${JSON.stringify(x.tai?.slice(0, 3))}` +
      ` (px,py ${JSON.stringify(x.tai?.slice(3))})`);
  }
  const tips = s.rows.map((x) => x.goc).sort((a, b) => a - b);
  const gaps = tips.slice(1).map((g, i) => +(g - tips[i]).toFixed(1));
  const minGap = gaps.length ? Math.min(...gaps) : 999;
  // Do LECH goc chi co nghia khi may thang sau. Nghieng 3/4 thi chin ngon chen nhau
  // tren vong tron va he nhat 2,6 do la do THIEU KHONG GIAN, khong phai loi; ep gate
  // o day se dua den xoe duoi vo du so sach.
  const rearish = Math.abs(Math.atan2(Math.sin(az), Math.cos(az))) < 0.35;
  // In theo TUNG NHANH chu khong chi theo danh sach goc: comment trong avatar.js ghi
  // "bon doi ben phai dat -20 / 12 / 42 / 63", ma muon doi duong thi phai biet goc
  // -20 do ngon nao sinh ra. `--occ head` that de thi hai ngoac don cung bi an,
  // nen goc cua ben trai/phai khong the suy ra tu nhau bang dau tru.
  const byTag = s.rows.map((x) => `${x.tag} ${x.goc.toFixed(1)}°`).sort((a, b) =>
    parseFloat(a.split(' ')[1]) - parseFloat(b.split(' ')[1]));
  console.log(`  goc dinh: ${byTag.join('  ')} ·` +
    ` hep nhat ${minGap} do` + (rearish ? ` (nguong ${MIN_GAP})` : ' · KHONG gate: lech goc chi do duoc khi may thang sau'));
  const ext = s.rows.reduce((a, x) => ({
    x: Math.max(a.x, x.x), ymin: Math.min(a.ymin, x.y[0]), ymax: Math.max(a.ymax, x.y[1]),
    z: Math.max(a.z, x.z),
  }), { x: 0, ymin: 9, ymax: -9, z: -9 });
  console.log(`  bien: |x|max ${ext.x.toFixed(3)} (luoi thumbnail 1,148) · y ${ext.ymin.toFixed(3)}..${ext.ymax.toFixed(3)}` +
    ` (san 0, tran 2,10) · zmax ${ext.z.toFixed(3)}`);
  console.log(`  goc: ${JSON.stringify(r.root)} · baseY ${r.baseY} · ${r.nhanh} nhanh · khuat ${r.khuat} m` +
    ` (mat than z ${r.matThanZ}) · lech goc ${r.lechGoc} · be ngang goc ${r.beNgangGoc}`);
  if (s.over > 0 || r.khuat > 0 || (rearish && minGap < MIN_GAP)) bad++;
  if (has('shots')) {
    const dir = flag('shots', '.').replace(/\/$/, '');
    await p.screenshot({ path: `${dir}/shot-${hero}-${name}.png` });
  }
}
const f = await p.evaluate(() => window.__api.vertexFrame());
console.log(`\nframe: maxSide ${f.maxSide.toFixed(3)} maxY ${f.maxY.toFixed(3)} meshes ${f.count}` +
  ` · pageerror ${errs.length}${errs.length ? ' ' + errs[0] : ''}`);
await b.close(); srv.kill();
process.exit(bad ? 1 : 0);
