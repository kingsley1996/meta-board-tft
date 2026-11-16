// Quet tham so cua MOT prop trong MỘT phien browser, khong can sua avatar.js moi
// vong. Gia tri nao thang nhat thi ghi nguoc vao avatar.js va do lai bang
// silhouette.mjs that (day la duong dan toi nguong, khong phai bang chung).
//
//   node .qoder/skills/temple-hero/scripts/prop-sweep.mjs <hero> <group> <port> \
//        <z1,z2,...> <d1,d2,...> [--base 0.02] [--ns 14] [--views rear,q3]
//
// CAN mot `preview.mjs <hero> --port <port>` dang chay.
//
// HAI truc que, tuong duong hai hang so trong avatar.js:
//   z (list 1)  = GRP.z  -> `group.position.z`. P2 tra toa do TRONG group va phep chieu
//                 nguoc (xy2uv) bo qua z, nen day la tinh dich cung hoan toan.
//   d (list 2)  = XIN    -> dat `position.x = -d` len TUNG mesh con cua moi `side`.
//                 `side.scale.x = ±1` dao lai dau nen hai ben le VAO TRONG deu nhau,
//                 dung ban chat cua XIN. KHONG dat len group.position.x: no dich ca
//                 hai ben ve CUNG mot phia (lech tam, va 3/4 van "tron" nen loi ngu).
//                 `--base` la XIN dang nung trong avatar.js (morgana = 0,02).
//
// Lay MAX qua `--ns` pha le cua nhip nghi: prop TINH van di theo `root` luc idle, nen
// it pha thi bao 0 gia (6 pha -> 0, 14 pha -> 2 voi cung mot cau lenh).
const { chromium } = await import(
  '/Users/samuel/ai-projects/tft-comps/node_modules/playwright/index.mjs');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const [hero, group, PORT, ZLIST, DLIST] = argv.filter((a) => !a.startsWith('--'));
const BASE = +arg('base', 0.02);
const NS = +arg('ns', 14);
const ZS = (ZLIST || '0.28').split(',').map(Number);
const DS = (DLIST || '0').split(',').map(Number);
const VIEWS = { rear: [0, 0.24, 5.2, 1.05], q3: [2.35, 0.22, 4.6, 1.02], thumb: [Math.PI - 0.55, 0.34, 4.8, 1.12] };
const names = (arg('views', 'rear,q3')).split(',');

const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
p.on('pageerror', (e) => console.log('pageerror ' + String(e).slice(0, 160)));
await p.goto(`http://127.0.0.1:${PORT}/?hero=${hero}`, { waitUntil: 'load' });
await p.waitForTimeout(9000);
if (!(await p.evaluate(() => !!window.__api))) { console.log('khong co __api'); await b.close(); process.exit(2); }

for (const z of ZS) {
  for (const d of DS) {
    await p.evaluate(({ gg, zz, dd }) => {
      const g = window.__api.part(gg);
      if (!g) throw new Error('khong tim thay group ' + gg);
      g.position.z = zz;
      for (const side of g.children) for (const c of side.children) c.position.x = -dd;
      g.updateMatrixWorld(true);
    }, { gg: group, zz: z, dd: d });
    const line = [];
    for (const vn of names) {
      await p.evaluate((v) => window.__api.setView(...v), VIEWS[vn]);
      await p.waitForTimeout(1200);
      let best = null;
      for (let k = 0; k < NS; k++) {
        const s = await p.evaluate((o) => window.__api.silhouette(o), {
          group, occ: 'head', grid: 128, near: 1,
        });
        if (!best || (s.over ?? -1) > best.over) best = s;
        if (k < NS - 1) await p.waitForTimeout(500);
      }
      const hit = (best.rows || []).filter((x) => x.over > 0)
        .sort((a, x) => x.over - a.over)[0];
      line.push(`${vn} DE LEN ${best.over}` +
        (hit ? ` [${hit.tag} ${hit.over} @ ${JSON.stringify(hit.tai?.slice(0, 3))}]` : ''));
    }
    console.log(`z ${z.toFixed(2)} XIN ${(BASE + d).toFixed(2)}  ·  ${line.join('   ')}`);
  }
}
await b.close();
