// So sanh vi tri HEAD vs prop sau lung ở hai dang (dung/ngoi): neu dang NGOI day
// prop len nhon hon day dau thi prop bi tach khoi vai khi thien. Do bang Box3, tuc
// ~1 giay, khong can render.
//
//   node .qoder/skills/temple-hero/scripts/sitcheck.mjs <hero> <port> [prop] [prop2]
//
// <port> la cua mot `preview.mjs <hero>` dang chay; prop mac dinh = morgWings.
const { chromium } = await import(
  '/Users/samuel/ai-projects/tft-comps/node_modules/playwright/index.mjs');
const HERO = process.argv[2] || 'morgana_chibi';
const PORT = process.argv[3] || 8914;
const PROPS = process.argv.slice(4).filter(Boolean);
const LIST = PROPS.length ? PROPS : ['morgWings', 'morgDress'];
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
await p.goto(`http://127.0.0.1:${PORT}/?hero=${HERO}`, { waitUntil: 'load' });
await p.waitForTimeout(9000);
for (const pose of ['stand', 'sit']) {
  await p.evaluate((s) => window.__api.setPose(s === 'sit'), pose);
  await p.waitForTimeout(2500);
  const r = await p.evaluate((names) => {
    const { part, av, THREE } = window.__api;
    const box = (o) => { const B = new THREE.Box3().setFromObject(o); return [+B.min.y.toFixed(3), +B.max.y.toFixed(3), +((B.min.y + B.max.y) / 2).toFixed(3)]; };
    const out = { head: box(part('head')), rootY: +av.root.position.y.toFixed(3) };
    for (const n of names) out[n] = box(part(n));
    return out;
  }, LIST);
  console.log(pose, JSON.stringify(r));
}
await b.close();
