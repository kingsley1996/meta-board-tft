// Bằng chứng ĐẮT: dựng cả chánh điện thật và chụp nhân vật đang đứng giữa sảnh.
// ~90s/lượt trên swiftshader (35s boot + kéo camera), nên chỉ chạy khi user bấm, và
// phải kiểm mọi số hình học bằng Node trước khi bỏ tiền một lượt render.
//
//   node hall-shot.mjs <out.png> [--yaw 524] [--pitch -130] [--zoom 7] [--wait 35000] [--hide-hud]
// yaw: px kéo ngang, 524px = pi rad (cam.yaw -= dx*0.006). pitch: px kéo dọc, am = máy
// thấp xuống. zoom: số con lăn wheel(-120).
import { chromium } from 'playwright';

const API = process.env.API || 'http://localhost:4000';
const WEB = process.env.WEB || 'http://localhost:4173';
const EMAIL = process.env.TEMPLE_EMAIL || 'yone-dev@example.com';
const PASS = process.env.TEMPLE_PASS;
if (!PASS) { console.log('thieu TEMPLE_PASS (mat khau tai khoan mien phat tren dev)'); process.exit(1); }
const out = process.argv[2] || '/tmp/hall.png';
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : Number(process.argv[i + 1]); };
const bool = (n) => process.argv.includes(`--${n}`);
const YAW = arg('yaw', 524), PITCH = arg('pitch', -130), ZOOM = arg('zoom', 3), WAIT = arg('wait', 35000);

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

const ctx = await chromium.launchPersistentContext('/tmp/hero-shot/profile', {
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
await page.waitForTimeout(WAIT);

const frame = await page.evaluate(async ({ YAW, PITCH, ZOOM, hideHud }) => {
  // Nút "Dậy" = rời tư thế ngồi, đứng lên để thấy cả thân; không có thì bỏ qua.
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.normalize('NFC').includes('dậy'));
  if (b) b.click();
  await new Promise((r) => setTimeout(r, 800));
  const c = document.querySelector('canvas');
  const r0 = c.getBoundingClientRect();
  const cx = r0.left + r0.width / 2, cy = r0.top + r0.height * 0.42;
  const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, {
    clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true,
    button: 0, buttons: t === 'pointerup' ? 0 : 1,
  }));
  ev('pointerdown', cx, cy);
  for (let i = 1; i <= 24; i++) ev('pointermove', cx + (YAW * i) / 24, cy + (PITCH * i) / 24);
  ev('pointerup', cx + YAW, cy + PITCH);
  await new Promise((r) => setTimeout(r, 900));
  for (let i = 0; i < ZOOM; i++) c.dispatchEvent(new WheelEvent('wheel', { clientX: cx, clientY: cy, deltaY: -120, bubbles: true }));
  await new Promise((r) => setTimeout(r, 3000));
  if (hideHud) {
    const st = document.createElement('style');
    st.textContent = '#hud,#hud *{visibility:hidden}';
    document.head.appendChild(st);
  }
  return b ? 'framed + dung' : 'framed (khong tim thay nut day)';
}, { YAW, PITCH, ZOOM, hideHud: bool('hide-hud') });
console.log(frame);
await page.screenshot({ path: out }).catch((e) => console.log('shot fail', e.message));
console.log('pageerror:', errs.length ? [...new Set(errs)].join(' || ') : '0');
await ctx.close();
