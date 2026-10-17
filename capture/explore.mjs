// node capture/explore.mjs capture/sources.json capture/source
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [sourcesFile, outRoot] = process.argv.slice(2);
const sources = JSON.parse(fs.readFileSync(sourcesFile, 'utf8'));

const dump = () => {
  const cssPath = (el) => {
    const parts = [];
    while (el && el !== document.body && parts.length < 7) {
      const parent = el.parentElement;
      if (!parent) break;
      parts.unshift(`${el.tagName.toLowerCase()}:nth-child(${[...parent.children].indexOf(el) + 1})`);
      el = parent;
    }
    return 'body > ' + parts.join(' > ');
  };
  const rows = [];
  const walk = (el, depth) => {
    if (depth > 5 || rows.length > 400) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    if (h > 30 && w > 200) {
      rows.push(`${'  '.repeat(depth)}[${h}|${w}|${Math.round(el.getBoundingClientRect().top + scrollY)}] ${el.tagName.toLowerCase()} .${String(el.className).replace(/\s+/g, '.').slice(0, 70)} :: ${cssPath(el)}`);
    }
    if (h > 30 || cs.display === 'contents') for (const child of el.children) walk(child, depth + 1);
  };
  for (const child of document.body.children) walk(child, 0);
  return rows.join('\n');
};

const browser = await chromium.launch();
for (const source of sources) {
  const outDir = path.join(outRoot, source.name);
  fs.mkdirSync(outDir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(source.url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      scrollTo(0, y);
      await new Promise((done) => setTimeout(done, 100));
    }
    scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
  fs.writeFileSync(path.join(outDir, 'tree.txt'), await page.evaluate(dump));
  console.log(`--- ${source.name} ---\n` + fs.readFileSync(path.join(outDir, 'tree.txt'), 'utf8').split('\n').filter((l) => l && !l.startsWith('  ')).slice(0, 40).join('\n'));
  await context.close();
}
await browser.close();
