// Bằng chứng RẺ cho ô chọn nhân vật: chạy đúng hàng đợi WebGL trong thumbs.js qua
// trang dev thật, xuất PNG 144px của mọi ô 3D + ảnh chụp chính thẻ trong DOM (nền tối
// của thẻ mới là thứ người chơi nhìn, PNG thô có nền suốt nên vành sáng dưới chân trông
// như vệt đen). ~40-70s, không kéo camera, không dựng cả sảnh.
//
//   node hero-thumb.mjs <thu-muc-dau-ra> [ten-nhan-vat]
//   TEMPLE_EMAIL=.. TEMPLE_PASS=.. WEB=http://localhost:4173 API=http://localhost:4000 node hero-thumb.mjs /tmp/out
import { chromium } from 'playwright';
import fs from 'node:fs';

const API = process.env.API || 'http://localhost:4000';
const WEB = process.env.WEB || 'http://localhost:4173';
const EMAIL = process.env.TEMPLE_EMAIL || 'yone-dev@example.com';
const PASS = process.env.TEMPLE_PASS;
if (!PASS) {
  console.log('thieu TEMPLE_PASS (mat khau tai khoan mien phat tren dev): TEMPLE_PASS=.. node hero-thumb.mjs /tmp/out leesin');
  process.exit(1);
}
const dir = process.argv[2] || '/tmp/hero-thumb';
const want = process.argv[3];
fs.mkdirSync(dir, { recursive: true });

let res = await fetch(`${API}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASS, lang: 'vi' }),
});
if (res.status !== 200) {
  res = await fetch(`${API}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS, name: 'Ke Doi', lang: 'vi' }),
  });
}
const session = (res.headers.get('set-cookie') || '').match(/mb_session=([^;]+)/)?.[1];
console.log('auth', res.status, session ? 'co session' : 'KHONG CO SESSION');
if (!session) process.exit(1);

const ctx = await chromium.launchPersistentContext(`${dir}/profile`, {
  channel: 'chrome', headless: true, viewport: { width: 900, height: 900 },
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'],
});
await ctx.addCookies([{ name: 'mb_session', value: session, domain: new URL(WEB).hostname, path: '/' }]);
const page = ctx.pages()[0] ?? await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));

await page.goto(`${WEB}/vi/temple`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#hud', { timeout: 300_000 }).then(() => console.log('HUD len'))
  .catch((e) => console.log('HUD TIMEOUT', e.message));
await page.waitForTimeout(12_000);
await page.evaluate(() => document.querySelector('#meChip')?.click());

// drain() của thumbs.js vẽ một món mỗi khung hình, nên ảnh chỉ xuất hiện sau khi hàng
// đợi chạy xong; waitForFunction mới là nhịp chờ đúng, không phải setTimeout cố định.
const found = await page.waitForFunction(
  () => document.querySelectorAll('#temple-root .hc-thumb-3d img').length,
  null, { timeout: 180_000 },
).then((h) => h.jsonValue()).catch((e) => { console.log('KHONG CO ANH 3D', e.message); return 0; });
console.log('o 3D:', found, 'tong the:', await page.evaluate(() => document.querySelectorAll('#temple-root .hero-card').length));

const cards = await page.$$('#temple-root .hero-card');
for (let i = 0; i < cards.length; i++) {
  const meta = await cards[i].evaluate((el) => ({ n: el.querySelector('.hc-meta b')?.textContent || '', three: !!el.querySelector('.hc-thumb-3d img') }));
  if (!meta.three) continue;
  if (want && !meta.n.normalize('NFC').includes(want.normalize('NFC'))) continue;
  const src = await cards[i].evaluate((el) => el.querySelector('.hc-thumb-3d img').src);
  fs.writeFileSync(`${dir}/thumb-${i}.png`, Buffer.from(src.split(',')[1], 'base64'));
  await cards[i].screenshot({ path: `${dir}/card-${i}.png` });
  console.log(`luu the ${i} "${meta.n}" -> ${dir}/thumb-${i}.png + card-${i}.png`);
}
console.log('pageerror:', errs.length ? [...new Set(errs)].join(' || ') : '0');
await ctx.close();
