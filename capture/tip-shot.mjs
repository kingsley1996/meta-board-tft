// Scratch: hover a few data-tip targets and screenshot the cards.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function shot(url, selector, file, nth = 0) {
  await page.goto(url, { waitUntil: 'networkidle' });
  const target = page.locator(selector).nth(nth);
  await target.scrollIntoViewIfNeeded();
  await target.hover();
  await page.waitForTimeout(400);
  await page.screenshot({ path: file });
  console.log(file, 'ok');
}

await shot('http://localhost:4173/tierlist/comps', '[data-tip^="champion:"]', '/tmp/tip-champ.png');
await shot('http://localhost:4173/tierlist/items', '[data-tip^="item:"]', '/tmp/tip-item.png');
await shot('http://localhost:4173/tierlist/augments', '[data-tip^="augment:"]', '/tmp/tip-augment.png');

await page.goto('http://localhost:4173/tierlist/comps', { waitUntil: 'networkidle' });
const href = await page.locator('a[href^="/tierlist/comps/"]').first().getAttribute('href');
await page.goto(`http://localhost:4173${href}`, { waitUntil: 'networkidle' });
await page.locator('[data-tip^="trait:"]').first().hover();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/tip-trait.png' });
console.log('trait ok', href);
await page.locator('[data-section="comp-panel"] [data-tip^="item:"]').first().hover();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/tip-comp-item.png' });
console.log('comp-item ok');

await browser.close();
