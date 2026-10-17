// node capture/shots.mjs <sources.json> <sections.json> <outRoot> [urlPrefix]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [sourcesFile, sectionsFile, outRoot, urlPrefix = ''] = process.argv.slice(2);
const sources = JSON.parse(fs.readFileSync(sourcesFile, 'utf8'));
const sectionsAll = JSON.parse(fs.readFileSync(sectionsFile, 'utf8'));
const widths = [390, 768, 1440];

const browser = await chromium.launch();
const missing = [];

for (const source of sources) {
  const outDir = path.join(outRoot, source.name);
  fs.mkdirSync(outDir, { recursive: true });
  const sections = sectionsAll[source.name] || {};
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    try {
      await page.goto(urlPrefix + source.url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.evaluate(() => document.querySelectorAll('.toaster').forEach((el) => { el.style.display = 'none'; }));
      await page.evaluate(async () => {
        await document.fonts.ready;
        for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
          scrollTo(0, y);
          await new Promise((done) => setTimeout(done, 120));
        }
        scrollTo(0, 0);
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, `page-${width}.png`), fullPage: true, animations: 'disabled' });
      const boxes = {};
      for (const [name, selector] of Object.entries(sections)) {
        const locator = page.locator(selector).first();
        if ((await locator.count()) === 0) {
          missing.push(`${source.name}/${name}@${width}`);
          boxes[name] = null;
          continue;
        }
        boxes[name] = await locator.evaluate((el) => ({ top: Math.round(el.getBoundingClientRect().top + scrollY), height: Math.round(el.offsetHeight), width: Math.round(el.offsetWidth) })).catch(() => null);
        await locator.screenshot({ path: path.join(outDir, `${name}-${width}.png`), animations: 'disabled' }).catch(() => {});
      }
      fs.writeFileSync(path.join(outDir, `boxes-${width}.json`), JSON.stringify(boxes, null, 2));
    } catch (error) {
      missing.push(`${source.name}@${width}: ${String(error).slice(0, 100)}`);
    }
    await context.close();
  }
}
await browser.close();
console.log(missing.length ? 'MISSING:\n' + missing.join('\n') : 'all sections captured');
