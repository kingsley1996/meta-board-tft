// Chup tu the LAY (upper quay -1,15 rad) va do hai thu: dau co roi khoi mieng
// quan ao khong, va co phần nao tham xuong DUOI SAN khong.
//
//   node .qoder/skills/temple-hero/scripts/bow-shot.mjs <hero> <port> [t0,t1,...] [--garment <ten>] [--root-baseline] [--view az,el,dist,ty]
//
// Loi dang gap: mot chiec vay/chieu ao gan vao `root` (khong xoay cung than tren)
// thi khi lay, dau + vai rung khoi mieng ao va ngin nhu dau roi khoi than. Mat
// tran khong phat hien duoc vi dang dung hai lop an khau nhau; chi quay moi lo.
//
// `--garment` la ten nhom ao (av.<ten> hoac av.vfxGroup.userData.<ten>, cung
// cach giai ma ma silhouette.mjs --group dung). KHONG do "diem cao nhat cua moi
// mesh khong phai dau" nhu ban dau: canh/tai/duoi cung la mesh khong-phai-dau va
// no cao hon ao, nen phep do ay bi nhiem va `gap` luc nao cung am gia (ban cu in
// ra -0,98 tren morgana_chibi ngay 2026-11-16, vi dinh canh 1,83 la so thang).
// Khong co --garment thi chi do SAN.
//
// In ra moi phase: goc upper, tam + day dau, `neckOff`, `clothHem`, `floorMin`
// va `lowest` = 3 mesh am xuong duoi sau nhat kem duong dan cha cua no.
//   neckOff = khoang cach tu TRUC cua ao toi tam dau, trong he toa do RIENG cua
//   ao. Khi dang no ~0,04 (dau nam tren truc vay). So sanh moi phase voi gia tri
//   t=0: no van ~0,04 thi vay quay cung nguoi, dau con trong vay; no PHAT SONG
//   (morgana_chibi ban cu 1,05 o dinh lay) thi vay dung thang con nguoi nghieng
//   ra ngoai - do chinh la cai nguoi xem goi la "dau roi khoi than".
//   floorMin < 0 = co phần tham xuong san; san khop opaque nen trong anh no chi
//   la vay "nang" san. Tu ~-0,3 tro xuong thi nen doi.
const { chromium } = await import(
  '/Users/samuel/ai-projects/tft-comps/node_modules/playwright/index.mjs');
const ARGS = process.argv.slice(2);
const hero = ARGS.shift(), PORT = ARGS.shift();
let GARMENT = null, ROOTBASE = false, VIEW = [Math.PI / 2 + 0.5, 0.16, 4.6, 1.02];
const TS = [];
for (let i = 0; i < ARGS.length; i++) {
  if (ARGS[i] === '--garment') { GARMENT = ARGS[++i]; continue; }
  if (ARGS[i] === '--root-baseline') { ROOTBASE = true; continue; }
  // `--view` de nhin thay CA DIEM QUAN AO CHAM SAN: mac dinh cat sat chan vay vi
  // no lo long co + mieng ao, la thu can xem de doc "dau roi khoi than".
  if (ARGS[i] === '--view') { VIEW = ARGS[++i].split(',').map(Number); continue; }
  if (!ARGS[i].startsWith('--')) TS.push(...ARGS[i].split(',').map(Number));
}
if (!TS.length) TS.push(0, 0.45, 0.6);
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 900, height: 640 } });
p.on('pageerror', (e) => console.log('pageerror ' + String(e).slice(0, 160)));
await p.goto(`http://127.0.0.1:${PORT}/?hero=${hero}`, { waitUntil: 'load' });
await p.waitForTimeout(9000);
if (!(await p.evaluate(() => !!window.__api))) { console.log('khong co __api'); await b.close(); process.exit(2); }
// MAY NGHIENG: nhin thay ca co, mieng ao va do nghiep cua than.
await p.evaluate((v) => window.__api.setView(...v), VIEW);
await p.waitForTimeout(800);
// --root-baseline: do LAI tren chinh phien ban MAU, bang cach keo nhom ao ve
// `root` ngay trong scene. Day la cach tra loi "con so truoc khi sua la bao
// nhieu" ma khong phai doi avatar.js roi chay lenh git checkout.
if (ROOTBASE) {
  if (!GARMENT) { console.log('--root-baseline can --garment'); await b.close(); process.exit(2); }
  await p.evaluate(({ gname }) => {
    const av = window.__api.av;
    const g = av[gname] || av.vfxGroup.userData[gname];
    g.position.set(0, 0, 0);
    av.root.add(g);
  }, { gname: GARMENT });
  await p.waitForTimeout(300);
  console.log('BASELINE: vay da bi keo ve root');
}

// `amt` bang 1 COT trong khoang p [0.45, 0.6) (avatar.js:5521) nen do o do thi
// khong bi ticker chay tron truoc khi kip doc: dat phase, nghi mot it frame, doc.
for (const t of TS) {
  await p.evaluate(({ bt }) => {
    const av = window.__api.av;
    av.bowing = true; av.bowT = bt;
  }, { bt: t });
  await p.waitForTimeout(120);
  const r = await p.evaluate((gname) => {
    const { av, surf, THREE } = window.__api;
    const hb = new THREE.Box3().setFromObject(av.head);
    const c = hb.getCenter(new THREE.Vector3());
    // Mesh cua QUAN AO = moi mesh nam duoi nhom co ten `gname` (av.<ten> hoac
    // vfxGroup.userData.<ten>), do TUNG DINH boi vi Box3 lay 8 goc cua bbox local
    // nen tren mot lathe nghieng no phong dai: dinh that o y 0,93 chi rong 0,26
    // con goc bbox o y 0,93 lai mang ban kinh chan vay 0,57.
    const g = gname && (av[gname] || av.vfxGroup?.userData?.[gname]);
    if (gname && !g) throw new Error('khong tim thay nhom ao "' + gname + '"');
    const inG = new Set();
    if (g) g.traverse((o) => { if (o.isMesh) inG.add(o); });
    // `neckOff` = khoang cach TU TRUC cua quan ao den tam dau, do trong HE TOA DO
    // RIENG cua chinh no (the local). Day la phep do DUY NHAT phan biet duoc hai
    // kieu gan: vay gan `upper` thi khi Nghieng, truc vay quay cung dau nen
    // neckOff khong doi; vay gan `root` thi truc vay thang dung con dau di ngang
    // 1,05 m nen neckOff PHAT SONG. So sanh voi gia tri khi dang (t = 0).
    let neckOff = null;
    if (g) {
      g.updateWorldMatrix(true, false);
      const h = g.worldToLocal(c.clone());
      neckOff = Math.hypot(h.x, h.z);
    }
    let hem = null, floorMin = null, lowest = [];
    // Nhan cua mesh = chuoi ten nhom trong `av` (root/upper/head/vfxGroup...) roi
    // den `tag` cua surf. `tag` tran cua no la "Sphere" nen khong doc duoc cai nao
    // dang cham san; phai di het chain cha.
    const LBL = new Map();
    for (const [k, v] of Object.entries(av)) if (v && v.isObject3D) LBL.set(v.uuid, k);
    const label = (o, tag) => {
      const seg = [];
      for (let p = o; p; p = p.parent) if (LBL.has(p.uuid)) seg.unshift(LBL.get(p.uuid));
      return `${seg.join('/')} · ${tag}`;
    };
    for (const { o, tag } of surf(av.root, null)) {
      if (!o.geometry?.attributes?.position) continue;
      o.updateWorldMatrix(true, false);
      const v = new THREE.Vector3();
      const a = o.geometry.attributes.position;
      let mine = null;
      for (let i = 0; i < a.count; i++) {
        v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld);
        if (mine === null || v.y < mine) mine = v.y;
        if (floorMin === null || v.y < floorMin) floorMin = v.y;
        if (!inG.has(o)) continue;
        if (!hem || v.y < hem.y) hem = { y: v.y };
      }
      // `lowest` = 3 mesh am xuong duoi sau nhat, de biet phep am do quan ao, canh
      // hay duoi: ba thu can ba cach sua khac nhau.
      if (mine !== null) lowest.push([label(o, tag), +mine.toFixed(3)]);
    }
    lowest = lowest.sort((x, y) => x[1] - y[1]).slice(0, 3);
    return {
      t: +av.bowT.toFixed(3),
      upperDeg: +(av.upper.rotation.x * 180 / Math.PI).toFixed(1),
      headBottom: +hb.min.y.toFixed(3),
      head: [+c.x.toFixed(3), +c.y.toFixed(3), +c.z.toFixed(3)],
      neckOff: neckOff === null ? null : +neckOff.toFixed(3),
      clothHem: hem && +hem.y.toFixed(3),
      floorMin: +floorMin.toFixed(3),
      lowest,
    };
  }, GARMENT);
  await p.screenshot({ path: `/tmp/bow-${hero}-${String(t).replace('.', '')}.png` });
  console.log(JSON.stringify(r));
}
await p.evaluate(() => { window.__api.av.bowing = false; window.__api.av.bowT = 0; });
await b.close();
