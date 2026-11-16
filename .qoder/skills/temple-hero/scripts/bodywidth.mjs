// Do BE NGANG that cua NGUOI (tron ca tay, tru canh) theo tung dai y, tu mesh trong
// scene that - khong suy tu ban kinh lathe. In ra max|x| va zmax cua than trong moi
// dai, de biet goc canh o (x, z) co NAM DUOI nguoi hay khong.
//
//   node .qoder/skills/temple-hero/scripts/bodywidth.mjs <hero> <skipGroup|-> [port]
//
// <skipGroup> = ten prop khong tinh (thuong la prop dang dat), '-' = tinh ca than
// luon prop. Do bang vertex, KHONG bang Box3 (Box3 bao 0,995 khi dinh that 0,846).
// Can mot `preview.mjs <hero> --port <port>` dang chay (mac dinh 8914).
const { chromium } = await import(
  '/Users/samuel/ai-projects/tft-comps/node_modules/playwright/index.mjs');
const HERO = process.argv[2] || 'morgana_chibi';
const SKIP = process.argv[3] === '-' ? null : (process.argv[3] || 'morgWings');
const PORT = process.argv[4] || 8914;
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
p.on('pageerror', (e) => console.log('pageerror ' + String(e).slice(0, 160)));
await p.goto(`http://127.0.0.1:${PORT}/?hero=${HERO}`, { waitUntil: 'load' });
await p.waitForTimeout(9000);
const rows = await p.evaluate(({ skipName }) => {
  const { av, surf } = window.__api;
  // dong voi cach silhouette.mjs tim prop: cot `av` truoc, roi khoa
  // `vfxGroup.userData` (props 3D nam trong userData, khong phai tren `av`).
  const find = (n) => (n ? av[n] || (av.vfxGroup?.userData || {})[n] || null : null);
  const skip = find(skipName);
  const v = new (window.__api.THREE.Vector3)();
  const out = [];
  for (const { o, tag } of surf(av.root, skip)) {
    const a = o.geometry.attributes.position;
    o.updateWorldMatrix(true, false);
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld);
      out.push({ tag, x: v.x, y: v.y, z: v.z });
    }
  }
  const bands = [];
  for (let y = 0.40; y <= 1.45; y += 0.05) {
    const s = out.filter((q) => q.y >= y && q.y < y + 0.05);
    if (!s.length) { bands.push({ y: +y.toFixed(2), n: 0 }); continue; }
    bands.push({
      y: +y.toFixed(2), n: s.length,
      maxAbsX: +Math.max(...s.map((q) => Math.abs(q.x))).toFixed(3),
      // max|x| RIENG phan_than (tru tay): de biet ao/bung tu no rong den dau
      zBack: +Math.max(...s.map((q) => q.z)).toFixed(3),
      tags: [...new Set(s.map((q) => q.tag))].slice(0, 8),
    });
  }
  return bands;
}, { skipName: SKIP });
for (const r of rows) console.log(JSON.stringify(r));
await b.close();
