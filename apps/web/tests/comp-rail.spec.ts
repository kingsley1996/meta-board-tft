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

// The rail wears the comp's own tier, and a tier sync can move a comp between
// letters, so read the tier off the toolbar tab instead of naming it here.
async function pageTier(page: import('playwright/test').Page) {
  const letter = await page
    .locator('[data-section="comp-toolbar"] nav a[aria-current="page"] span')
    .first()
    .textContent();
  const tier = letter!.trim();
  return { tier, paint: await paint(page, `var(--color-tier-${tier.toLowerCase()})`) };
}

test('the carry frame, the rail wash and the ghost letter all follow the comp tier', async ({ page }) => {
  await page.goto('/en/tierlist/comps/kha-zix-elderwood');
  const aside = page.locator('[data-section="comp-panel"] aside');
  await expect(aside).toBeVisible();
  const { tier, paint: tierPaint } = await pageTier(page);

  // The carry's frame is normally its cost colour; on the rail it is the tier.
  await expect(aside.locator('div.hex').first()).toHaveCSS('background-color', tierPaint);

  // A clipped layer carries the tier wash and, behind the crest, a ghost tier
  // letter: same hue, translucent. It is its own layer because the crest breaks
  // the rail's top edge, so the rail itself cannot clip.
  const wash = aside.locator('> span[aria-hidden="true"]');
  const ghost = wash.locator('> span').nth(1);
  await expect(ghost).toHaveText(tier);
  const ghostPaint = await ghost.evaluate((el) => getComputedStyle(el).color);
  expect(ghostPaint).toMatch(/^color\(srgb [\d.]+ [\d.]+ [\d.]+ \/ 0\.\d+\)$/);

  // ...and the rail fades from that same hue down to the plain panel. The hue
  // is read from the ghost letter's own computed colour, so the comparison is
  // between two browser-parsed values rather than against a literal that can
  // round differently (0.858823 vs 0.858824).
  const ghostHue = ghostPaint.match(/[\d.]+/g)!.slice(0, 3);
  const washStops = await wash.locator('> span').first().evaluate((el) => {
    const nums = getComputedStyle(el).backgroundImage.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/)!;
    return nums.slice(1);
  });
  expect(washStops.map((n) => Math.round(parseFloat(n) * 1000))).toEqual(ghostHue.map((n) => Math.round(parseFloat(n) * 1000)));
  await expect(wash.locator('> span').first()).toHaveCSS('background-image', /^linear-gradient\((180deg, )?color\(srgb [\d.]+ [\d.]+ [\d.]+ \/ 0\.\d+\) 0px/);

  // The top edge is perforated, so the crest has something to tear through.
  await expect(wash.locator('> span').nth(2)).toHaveCSS('background-image', /^repeating-linear-gradient/);

  // The tier is also stamped, cocked into the top-right corner of the rail. The
  // wording is the same "S Tier" the TierChip rows use, in both locales.
  const stamp = aside.locator('> span:not([aria-hidden])');
  await expect(stamp).toContainText(`${tier} Tier`);
  await expect(stamp).toHaveCSS('border-color', tierPaint);
  expect(await stamp.evaluate((el) => getComputedStyle(el).rotate)).not.toBe('none');

  // The crest leaves the rail through that top edge, so the panel keeps room
  // above the rail for it and the rail itself must not clip. The page eases
  // down to the detail after load, so both boxes have to come from one frame:
  // two separate reads straddle the glide and disagree by the scroll distance.
  expect(await aside.evaluate((el) => getComputedStyle(el).overflow)).toBe('visible');
  const escape = await aside.evaluate((el) => el.querySelector('div.hex')!.getBoundingClientRect().y - el.getBoundingClientRect().y);
  expect(escape).toBeLessThan(0);
});

test('only the carry is re-framed; every other hex keeps its cost colour', async ({ page }) => {
  await page.goto('/en/tierlist/comps/kha-zix-elderwood');
  // Scoped to the rail: an item plate in the strip also wears a frame, the
  // colour of the champion carrying it, so the panel as a whole is not one.
  const framed = page.locator('[data-section="comp-panel"] > aside div.hex[style]');
  await expect(framed).toHaveCount(1);
  await expect(framed).toHaveCSS('background-color', (await pageTier(page)).paint);
  // Frames are inline custom properties now, so "keeps its cost colour" reads
  // as a hex whose background resolves to a --color-cost-* token.
  await expect(page.locator('[data-section="team-strip"] div.hex[style*="--color-cost-"]').first()).toBeVisible();
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

// The explorer used to ship an empty shell and wait for the browser to refetch
// the list, so the detail page paid for a second cross-region round-trip before
// anything appeared. The panel only renders once the payload is in state, so
// finding it in the raw document is what proves the data shipped with it.
test('the comp detail ships its data in the document, not behind a client fetch', async ({ page }) => {
  const res = await page.goto('/vi/tierlist/comps/azir-reroll');
  const html = (await res!.body()).toString();
  expect(html).toContain('data-section="comp-panel"');
  expect(html).toContain('Tộc hệ kích hoạt');
});
