import { expect, test } from 'playwright/test';

// Palette tokens are CSS custom properties, so ask the browser what a colour
// paints as instead of hardcoding hex values that drift with the palette.
function paint(page: import('playwright/test').Page, value: string) {
  return page.evaluate((v) => {
    const probe = document.createElement('span');
    probe.style.color = v;
    document.body.append(probe);
    const painted = getComputedStyle(probe).color;
    probe.remove();
    return painted;
  }, value);
}

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('the carry frame, the rail wash and the ghost letter all follow the comp tier', async ({ page }) => {
  await page.goto('/en/tierlist/comps/kha-zix-elderwood');
  const aside = page.locator('[data-section="comp-panel"] aside');
  await expect(aside).toBeVisible();

  // The carry's frame is normally its cost colour; on the rail it is the tier.
  await expect(aside.locator('div.hex').first()).toHaveCSS('background-color', await paint(page, 'var(--color-tier-s)'));

  // A ghost tier letter sits behind the portrait: same hue, translucent.
  const ghost = aside.locator('> span[aria-hidden="true"]');
  await expect(ghost).toHaveText('S');
  const ghostPaint = await ghost.evaluate((el) => getComputedStyle(el).color);
  expect(ghostPaint).toMatch(/^color\(srgb [\d.]+ [\d.]+ [\d.]+ \/ 0\.\d+\)$/);

  // ...and the rail fades from that same hue down to the plain panel.
  const hue = escapeRe(ghostPaint.split(' /')[0]);
  await expect(aside).toHaveCSS('background-image', new RegExp(`^linear-gradient\\((180deg, )?${hue} / 0\\.\\d+\\) 0px`));
});

test('only the carry is re-framed; every other hex keeps its cost colour', async ({ page }) => {
  await page.goto('/en/tierlist/comps/kha-zix-elderwood');
  const framed = page.locator('[data-section="comp-panel"] div.hex[style]');
  await expect(framed).toHaveCount(1);
  await expect(framed).toHaveCSS('background-color', await paint(page, 'var(--color-tier-s)'));
  await expect(page.locator('[data-section="comp-panel"] div.hex[class*="bg-cost-"]').first()).toBeVisible();
});

test('the unit strip carries no heading and item priority is one row', async ({ page }) => {
  await page.goto('/en/tierlist/comps/kha-zix-elderwood');
  const panel = page.locator('[data-section="comp-panel"]');
  await expect(panel.locator('p:text-is("Final board")')).toHaveCount(0);

  // A ▸ chain rather than ItemRanking's stacked list: every tile on one line.
  // scrollY is added because resolving the locator scrolls it into view, which
  // would otherwise move the very coordinates being compared.
  const lines = await panel.locator('p:text-is("Item priority")').evaluate((p) => {
    const tiles = [...(p.parentElement ?? p).querySelectorAll('a[href*="/items/"]')];
    return { total: tiles.length, rows: [...new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().y + window.scrollY)))] };
  });
  expect(lines.total).toBeGreaterThan(1);
  expect(lines.rows.length).toBe(1);
});

test('the round plan opens on four rounds and ramps the rest in', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/en/tierlist/comps/kha-zix-elderwood');
  const panel = page.locator('[data-section="comp-panel"]');
  const details = panel.locator('details');
  const summary = details.locator('> summary');

  // The first four rounds are always painted; the tail lives inside the disclosure.
  await expect(panel.locator('div > ol > li')).toHaveCount(4);
  expect(await details.locator('ol > li').count()).toBeGreaterThan(0);

  // The label swap is a CSS-only toggle, so ask which span actually displays.
  await expect(summary.locator('span:visible')).toHaveText('Show full plan');

  // The ramp is pure CSS. Rather than racing its frames, lock its contract: the
  // content box is closed to zero height and has a height transition to run.
  const closed = await details.evaluate((d) => ({
    height: d.getBoundingClientRect().height,
    content: getComputedStyle(d, '::details-content').height,
    ramp: getComputedStyle(d, '::details-content').transitionProperty,
    keyword: getComputedStyle(d).getPropertyValue('interpolate-size'),
  }));
  expect(closed.content).toBe('0px');
  expect(closed.ramp).toContain('height');
  expect(closed.keyword).toBe('allow-keywords');

  await summary.click();
  await expect(summary.locator('span:visible')).toHaveText('Collapse');
  expect(await details.evaluate((d) => d.getBoundingClientRect().height)).toBeGreaterThan(closed.height);

  await summary.click();
  await expect
    .poll(() => details.evaluate((d) => Math.round(d.getBoundingClientRect().height)))
    .toBe(Math.round(closed.height));
});
