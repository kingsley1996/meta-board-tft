// Scratch: vi pass over the pages that gained translated content.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const shots = [
  ['http://localhost:4173/vi/tierlist/comps/sentinel-riftbeast', '/tmp/vi-comp-detail.png'],
  ['http://localhost:4173/vi/tierlist/comps/ahri-spellweaver', '/tmp/vi-comp-detail-2.png'],
  ['http://localhost:4173/vi/guides', '/tmp/vi-guides.png'],
  ['http://localhost:4173/vi/guides/economy-first-stage-2', '/tmp/vi-guide-article.png'],
  ['http://localhost:4173/vi/legal/privacy', '/tmp/vi-legal.png'],
];

for (const [url, file] of shots) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: file, fullPage: true });
  console.log(file, 'ok');
}

await browser.close();
