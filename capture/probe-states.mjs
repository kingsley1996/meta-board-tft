// node capture/probe-states.mjs > capture/states.raw.json
import { chromium } from 'playwright';

const probe = (selector) => {
  const watch = ['color', 'backgroundColor', 'borderColor', 'boxShadow', 'transform', 'opacity', 'padding', 'height', 'textDecorationLine', 'transitionProperty', 'transitionDuration', 'transitionTimingFunction'];
  const el = document.querySelector(selector);
  if (!el) return { missing: selector };
  const cs = getComputedStyle(el);
  return Object.fromEntries(watch.map((name) => [name, cs[name]]));
};
const settle = () => {
  const frame = () => new Promise((next) => requestAnimationFrame(next));
  const running = () => document.getAnimations().filter((a) => a instanceof CSSTransition && a.playState === 'running');
  return frame().then(frame).then(async () => {
    while (running().length) await Promise.allSettled(running().map((a) => a.finished)).then(frame);
    return new Promise((done) => setTimeout(done, 150));
  });
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
const page = await context.newPage();
const results = {};

await page.goto('https://tftacademy.com/', { waitUntil: 'load' });
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);

results.home = {};
results.home.featureCard = { before: await page.evaluate(probe, 'div.group') };
await page.locator('div.group').first().hover().catch(() => {});
await page.evaluate(settle);
results.home.featureCard.after = await page.evaluate(probe, 'div.group');
results.home.featureCard.afterImg = await page.evaluate(probe, 'div.group img');

results.home.ctaButton = { before: await page.evaluate(probe, 'a[href*="set"], a:has(span)') };
const cta = page.getByText('Learn Set 18', { exact: false }).first();
await cta.hover().catch(() => {});
await page.evaluate(settle);
results.home.ctaButton.after = await page.evaluate(probe, 'a[href*="set"], a:has(span)');

results.home.scrolledNav = {};
results.home.scrolledNav.before = await page.evaluate(probe, 'body > div:nth-child(1) > div:nth-child(2)');
await page.evaluate(() => scrollTo(0, 600));
await page.waitForTimeout(500);
results.home.scrolledNav.after = await page.evaluate(probe, 'body > div:nth-child(1) > div:nth-child(2)');
results.home.scrolledNav.stickyTop = await page.evaluate(() => {
  const el = document.querySelector('body > div:nth-child(1) > div:nth-child(2)');
  return { top: el.getBoundingClientRect().top, position: getComputedStyle(el).position, height: el.offsetHeight };
});

await page.goto('https://tftacademy.com/tierlist/comps', { waitUntil: 'load' });
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);

results.comps = {};
results.comps.navDropdown = {};
const navText = page.locator('nav');
results.comps.navDropdown.closedText = await navText.first().innerText().catch(() => '');
const tierLink = page.getByText('Tierlist', { exact: true }).first();
await tierLink.hover().catch(() => {});
await page.waitForTimeout(600);
results.comps.navDropdown.openText = await navText.first().innerText().catch(() => '');
results.comps.navDropdown.menuBoxes = await page.evaluate(() => [...document.querySelectorAll('nav ul, nav [role="menu"], nav div')]
  .filter((el) => el.offsetHeight > 20 && getComputedStyle(el).visibility !== 'hidden' && el.offsetParent)
  .map((el) => ({ tag: el.tagName, class: String(el.className).slice(0, 80), h: el.offsetHeight, text: el.innerText.slice(0, 150).replace(/\n/g, ' | ') }))
  .slice(0, 12));
await page.screenshot({ path: 'capture/source/nav-dropdown-open.png', clip: { x: 0, y: 0, width: 1440, height: 500 } });

results.comps.hexagon = { before: await page.evaluate(() => {
  const el = [...document.querySelectorAll('img')].find((i) => getComputedStyle(i).clipPath !== 'none' || (i.parentElement && getComputedStyle(i.parentElement).clipPath !== 'none'));
  if (el) { el.closest('a,button,div').setAttribute('data-probe', 'hex'); return true; }
  return false;
}) };
if (await page.locator('[data-probe="hex"]').count()) {
  results.comps.hexagon.before = await page.evaluate(probe, '[data-probe="hex"]');
  await page.locator('[data-probe="hex"]').first().hover().catch(() => {});
  await page.evaluate(settle);
  results.comps.hexagon.after = await page.evaluate(probe, '[data-probe="hex"]');
  results.comps.hexagon.tooltip = await page.evaluate(() => {
    const tips = [...document.querySelectorAll('[role="tooltip"], .tooltip')].filter((el) => el.offsetHeight > 10);
    return tips.map((el) => el.innerText.slice(0, 120));
  });
  await page.screenshot({ path: 'capture/source/hexagon-hover.png', clip: { x: 260, y: 280, width: 1030, height: 200 } });
}

results.comps.searchInput = { before: await page.evaluate(probe, 'input') };
if (await page.locator('input').count()) {
  await page.locator('input').first().click().catch(() => {});
  await page.evaluate(settle);
  results.comps.searchInput.after = await page.evaluate(probe, 'input');
}

results.comps.tabs = { before: await page.evaluate(() => location.pathname + ' | ' + document.querySelector('h1, [class*="title"]')?.innerText?.slice(0, 60)) };
await page.getByText('Items', { exact: true }).first().click().catch(() => {});
await page.waitForTimeout(2500);
results.comps.tabs.after = await page.evaluate(() => location.pathname + ' | ' + document.querySelector('h1, [class*="title"]')?.innerText?.slice(0, 60));

await browser.close();
console.log(JSON.stringify(results, null, 2));
