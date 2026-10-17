// node capture/shoot-source.mjs capture/sources.json capture/source
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [sourcesFile, outRoot] = process.argv.slice(2);
const sources = JSON.parse(fs.readFileSync(sourcesFile, 'utf8'));
const widths = [390, 768, 1440];

const survey = () => {
  const tally = (map, key) => key && map.set(key, (map.get(key) || 0) + 1);
  const seen = { text: new Map(), fill: new Map(), family: new Map(), type: new Map(), space: new Map(), radius: new Map(), shadow: new Map(), maxWidth: new Map() };
  const assets = [];
  for (const el of document.body.querySelectorAll('*')) {
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) continue;
    const cs = getComputedStyle(el);
    if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
      tally(seen.text, cs.color);
      tally(seen.family, cs.fontFamily);
      tally(seen.type, `${cs.fontSize} / ${cs.lineHeight} / ${cs.fontWeight}`);
    }
    for (const gap of [cs.paddingTop, cs.paddingLeft, cs.rowGap, cs.columnGap]) if (/^[1-9]/.test(gap)) tally(seen.space, gap);
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') tally(seen.fill, cs.backgroundColor);
    if (cs.borderTopLeftRadius !== '0px') tally(seen.radius, cs.borderTopLeftRadius);
    if (cs.boxShadow !== 'none') tally(seen.shadow, cs.boxShadow);
    if (cs.maxWidth !== 'none') tally(seen.maxWidth, cs.maxWidth);
    for (const m of cs.backgroundImage.matchAll(/url\("([^"]+)"\)/g)) assets.push({ kind: 'background', url: m[1] });
  }
  for (const img of document.images) assets.push({ kind: 'img', url: img.currentSrc, alt: img.alt, natural: `${img.naturalWidth}x${img.naturalHeight}`, shown: `${img.clientWidth}x${img.clientHeight}` });
  for (const media of document.querySelectorAll('video, audio')) assets.push({ kind: media.tagName.toLowerCase(), url: media.currentSrc, poster: media.poster });
  for (const link of document.querySelectorAll('link[rel~="icon"]')) assets.push({ kind: 'icon', url: link.href });
  const variables = {}, breakpoints = new Set(), unreadable = [];
  const walk = (rules) => {
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule) for (const m of rule.conditionText.matchAll(/width[^)]*?([\d.]+(?:px|em|rem))/g)) breakpoints.add(m[1]);
      if (rule instanceof CSSStyleRule && /(^|,)\s*(:root|html|body)\s*(,|$)/.test(rule.selectorText)) {
        for (const name of rule.style) if (name.startsWith('--')) variables[name] = rule.style.getPropertyValue(name).trim();
      }
      if (rule.cssRules) walk(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules); } catch { unreadable.push(sheet.href); }
  }
  const ranked = Object.fromEntries(Object.entries(seen).map(([k, map]) => [k, [...map].sort((a, b) => b[1] - a[1]).slice(0, 12)]));
  const fonts = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.style}`);
  return { variables, breakpoints: [...breakpoints], unreadable, fonts, inlineSvg: document.querySelectorAll('svg').length, ...ranked, assets };
};

const discoverSections = () => {
  document.querySelectorAll('[data-capture-tag]').forEach((el) => el.removeAttribute('data-capture-tag'));
  let root = document.body;
  while (root.children.length === 1 && root.children[0].offsetHeight > 0 && root.firstElementChild.tagName !== 'MAIN') {
    root = root.children[0];
  }
  let blocks = [...root.children].filter((el) => el.offsetHeight > 120);
  if (blocks.length < 3) {
    const deeper = [...root.children].flatMap((el) => (el.offsetHeight > 120 ? [...el.children] : [])).filter((el) => el.offsetHeight > 120);
    if (deeper.length > blocks.length) blocks = deeper;
  }
  return blocks.map((el, i) => {
    el.setAttribute('data-capture-tag', String(i));
    const name = (el.id || el.getAttribute('aria-label') || [...el.classList].find((c) => c.length > 2 && c.length < 30) || el.tagName.toLowerCase())
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'block';
    return { i, name: `${String(i).padStart(2, '0')}-${name}`, tag: el.tagName.toLowerCase(), classes: String(el.className).slice(0, 120), top: Math.round(el.getBoundingClientRect().top + scrollY), height: Math.round(el.offsetHeight) };
  });
};

const scrapeLinks = () => {
  const grab = (root) => root ? [...root.querySelectorAll('a')].map((a) => ({ text: a.innerText.trim().replace(/\s+/g, ' ').slice(0, 60), href: a.getAttribute('href') })).filter((a) => a.text || a.href) : [];
  const header = document.querySelector('header') || document.querySelector('nav');
  const footer = document.querySelector('footer');
  return { header: grab(header), footer: grab(footer) };
};

const browser = await chromium.launch();
const report = [];

for (const source of sources) {
  const outDir = path.join(outRoot, source.name);
  fs.mkdirSync(outDir, { recursive: true });
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    try {
      await page.goto(source.url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      for (const label of ['Accept', 'Accept all', 'Agree', 'Got it', 'OK', 'Close']) {
        await page.getByRole('button', { name: label, exact: false }).first().click({ timeout: 700 }).catch(() => {});
      }
      await page.evaluate(async () => {
        await document.fonts.ready;
        for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
          scrollTo(0, y);
          await new Promise((done) => setTimeout(done, 120));
        }
        scrollTo(0, 0);
      });
      await page.waitForTimeout(400);
      const sections = await page.evaluate(discoverSections);
      if (width === 1440) {
        fs.writeFileSync(path.join(outDir, 'survey.json'), JSON.stringify(await page.evaluate(survey), null, 2));
        fs.writeFileSync(path.join(outDir, 'sections.json'), JSON.stringify(sections, null, 2));
        fs.writeFileSync(path.join(outDir, 'links.json'), JSON.stringify(await page.evaluate(scrapeLinks), null, 2));
      }
      await page.screenshot({ path: path.join(outDir, `page-${width}.png`), fullPage: true, animations: 'disabled' });
      const boxes = {};
      for (const section of sections) {
        const locator = page.locator(`[data-capture-tag="${section.i}"]`).first();
        boxes[section.name] = await locator.evaluate((el) => ({ top: Math.round(el.getBoundingClientRect().top + scrollY), height: Math.round(el.offsetHeight) })).catch(() => null);
        await locator.screenshot({ path: path.join(outDir, `${section.name}-${width}.png`), animations: 'disabled' }).catch(() => {});
      }
      fs.writeFileSync(path.join(outDir, `boxes-${width}.json`), JSON.stringify(boxes, null, 2));
      report.push(`${source.name} @${width}: ${sections.length} sections, page ${boxes[sections[0]?.name] ? 'ok' : 'empty'}`);
    } catch (error) {
      report.push(`${source.name} @${width}: FAILED ${String(error).slice(0, 120)}`);
    }
    await context.close();
  }
}
await browser.close();
console.log(report.join('\n'));
