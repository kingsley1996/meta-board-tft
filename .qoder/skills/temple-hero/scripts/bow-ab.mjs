// A/B tu the lay cho MOT chiec vay gan `root`: dung hai cach sua trong CUNG mot
// phien browser (sua avatar.js 3 lan = 3 lan boot, va do nham phase), roi mo PNG.
//
//   node .qoder/skills/temple-hero/scripts/bow-ab.mjs <hero> <dressKey> <port>
//
// Phuong an:
//   whole   = ca vay sang `upper` (1 dong sua) -> vay nghiem theo than, guoc bay
//   split   = bodice (eo -> nguc) sang `upper`, chan vay van o `root`
//   short   = cat het phan tren eo, than tho = `G.torso` (von da thuoc `upper`)
// Moi phuong an chup 2 frame: DUNG va LAI (phase 0,52 = dinh plateau cua amt).
const { chromium } = await import(
  '/Users/samuel/ai-projects/tft-comps/node_modules/playwright/index.mjs');
const [hero, DRESS_KEY, PORT] = process.argv.slice(2);
const KEY = DRESS_KEY || 'morgDress';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 760, height: 560 } });
p.on('pageerror', (e) => console.log('pageerror ' + String(e).slice(0, 160)));
await p.goto(`http://127.0.0.1:${PORT}/?hero=${hero}`, { waitUntil: 'load' });
await p.waitForTimeout(9000);
await p.evaluate(() => window.__api.setView(Math.PI / 2 + 0.45, 0.2, 4.4, 1.05));
await p.waitForTimeout(600);

const install = (mode) => p.evaluate(({ key, m }) => {
  const { av, THREE } = window.__api;
  const dress = av.vfxGroup.userData[key];
  if (!dress) throw new Error('khong co userData.' + key);
  if (!globalThis.__abOrig) globalThis.__abOrig = { parent: dress.parent, pos: dress.position.clone(), geo: dress.geometry };
  const O = globalThis.__abOrig;
  // tra ve nguyen trang thai truoc moi luot
  O.parent.add(dress); dress.position.copy(O.pos); dress.geometry = O.geo;
  dress.visible = true;
  const hem = O.geo.parameters.points;           // Vector2(radius, y)
  const UP = 0.40;                               // upper.position.y khi dung
  // points cua LatheGeometry LA Vector2, khong phai [r, y] - thu destructure chuoi
  // mang se loi im (Vector2 khong iterable), nen loc bang `.y`.
  const mk = (pts) => new THREE.LatheGeometry(pts.map((v) => new THREE.Vector2(v.x, v.y)), 40);
  if (m === 'whole') {
    av.root.remove(dress); av.upper.add(dress); dress.position.y = -UP;
  } else if (m === 'split' || m === 'short') {
    const WAIST = 0.55;
    const lo = hem.filter((v) => v.y <= WAIST + 0.001);
    const hi = hem.filter((v) => v.y >= WAIST - 0.001);
    if (m === 'split') {
      const bod = new THREE.Mesh(mk(hi), dress.material);
      bod.scale.set(1, 1, 0.92);
      av.upper.add(bod); bod.position.y = hi[0][1] - UP;   // moc tai eo
      // mesh bodice phai xoay QUANH goc cua no o eo, nen dich dinh duong xuong 0
      const g = bod.geometry.clone().translate(0, -hi[0].y, 0);
      bod.geometry = g;
      globalThis.__abBod = bod;
    }
    const sk = new THREE.Mesh(mk(lo), dress.material);
    sk.scale.set(1, 1, 0.92);
    av.root.add(sk);
    globalThis.__abSkirt = sk;
    dress.visible = false;
  }
  if (globalThis.__abBod && m !== 'split') { av.upper.remove(globalThis.__abBod); globalThis.__abBod = null; }
  if (globalThis.__abSkirt && m !== 'split' && m !== 'short') { av.root.remove(globalThis.__abSkirt); globalThis.__abSkirt = null; }
  av.root.updateMatrixWorld(true);
  return { mode: m, dressVisible: dress.visible };
}, { key: KEY, m: mode });

const shoot = async (mode, t, tag) => {
  await p.evaluate(({ bt }) => { const av = window.__api.av; av.bowing = bt > 0; av.bowT = bt; }, { bt: t });
  await p.waitForTimeout(t > 0 ? 200 : 900);
  const deg = await p.evaluate(() => +(window.__api.av.upper.rotation.x * 180 / Math.PI).toFixed(1));
  // guoc vay: dinh that cua phan gan san (do tu mesh, khong suy)
  const hemY = await p.evaluate(() => {
    const { av, THREE } = window.__api;
    const sk = globalThis.__abSkirt || av.vfxGroup.userData.morgDress;
    let mx = 1e9; const v = new THREE.Vector3();
    sk.updateWorldMatrix(true, false);
    const a = sk.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i).applyMatrix4(sk.matrixWorld);
      if (Math.abs(v.x) > 0.2 || Math.abs(v.z) > 0.2) mx = Math.min(mx, v.y);
    }
    return +mx.toFixed(3);
  });
  await p.screenshot({ path: `/tmp/ab-${hero}-${mode}-${tag}.png` });
  console.log(`${mode.padEnd(6)} ${tag.padEnd(5)} upper ${String(deg).padStart(6)} deg · gấu vay ${hemY}`);
};

for (const mode of ['whole', 'split', 'short']) {
  await install(mode);
  await shoot(mode, 0, 'stand');
  await shoot(mode, 0.52, 'bow');
}
await b.close();
