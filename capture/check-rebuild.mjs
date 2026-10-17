// node capture/check-rebuild.mjs http://localhost:4173
import { chromium } from 'playwright';

const prefix = process.argv[2] || 'http://localhost:4173';
const paths = ['/', '/tierlist/comps', '/tierlist/comps/ahri-spellweaver', '/tierlist/items', '/tierlist/augments', '/guides', '/guides/economy-first-stage-2', '/learn/champions', '/media', '/legal/privacy', '/legal/terms', '/about', '/nope-404'];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const errors = [];
const failures = [];
const external = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('requestfailed', (request) => {
  const error = request.failure()?.errorText ?? '';
  if (error.includes('ERR_ABORTED')) return; // RSC prefetches cancelled by navigation
  failures.push(`${request.url()} ${error}`);
});
page.on('request', (request) => {
  const url = request.url();
  if (!url.startsWith(prefix) && !url.startsWith('data:')) external.push(url);
});

for (const path of paths) {
  const response = await page.goto(prefix + path, { waitUntil: 'networkidle', timeout: 30000 });
  const title = await page.title();
  console.log(`${response.status()} ${path} — ${title}`);
  const focusables = await page.evaluate(() => document.querySelectorAll('a[href], button, input, select').length);
  if (focusables < 5 && path !== '/nope-404') console.log(`  WARNING: only ${focusables} focusable elements`);
}

const tabWalk = ["Tab", "Tab", "Tab", "Tab", "Tab"];
await page.goto(prefix + '/', { waitUntil: 'load' });
for (const key of tabWalk) { await page.keyboard.press(key); }
const focused = await page.evaluate(() => {
  const el = document.activeElement;
  const cs = el ? getComputedStyle(el) : null;
  return el ? { tag: el.tagName, text: (el.textContent || '').trim().slice(0, 30), outline: cs.outlineStyle + ' ' + cs.outlineWidth } : null;
});
console.log('after 5 tabs, focus is:', JSON.stringify(focused));
console.log('console errors:', errors.length ? errors : 'none');
console.log('failed requests:', failures.length ? failures : 'none');
const oldSite = external.filter((url) => url.includes('tftacademy'));
console.log('requests to tftacademy.com:', oldSite.length ? oldSite : 'none');
console.log('other external requests:', external.length ? [...new Set(external)].slice(0, 10) : 'none');

await browser.close();
