import { expect, test, type Page } from 'playwright/test';

// The detail page eases its tier row under the sticky bars for about a second
// after paint. A scrollY read taken mid-glide is wherever the animation
// happened to be passing, so compare only once the page has held still.
async function scrollAtRest(page: Page) {
  let prev = -1;
  let steady = 0;
  for (let i = 0; i < 60; i++) {
    const y = await page.evaluate(() => window.scrollY);
    steady = y === prev ? steady + 1 : 0;
    prev = y;
    if (steady >= 3) return y;
    await page.waitForTimeout(100);
  }
  return prev;
}

// Veigar Blackthorn is the one comp that carries every new block at once: a
// cover badge, a sibling variant, flex pairs and alt builds.
const detail = '/en/tierlist/comps/veigar-blackthorn';
const bar = '[data-section="comp-toolbar"]';

test('the toolbar lists the carry variants and each tab is its own comp page', async ({ page }) => {
  await page.goto(detail);
  const tabs = page.locator(`${bar} nav a`);
  await expect(tabs).toHaveCount(2);
  await expect(tabs.first()).toHaveAttribute('aria-current', 'page');
  // Tier first, like the reference site, so a variant reads as its own ranked
  // comp rather than a colourless alias of the one on screen.
  await expect(tabs.first().locator('span').first()).toHaveText('S');
  await expect(tabs.nth(1).locator('span').first()).toHaveText('C');
  await expect(tabs.nth(1).getByText('Veigar Sprykin')).toBeVisible();

  // The bar heads the content column: inside the panel card, to the right of
  // the 300px rail — not a strip across the top of the whole detail.
  const panel = page.locator('[data-section="comp-panel"]');
  await expect(panel.locator(bar)).toHaveCount(1);
  const railBox = (await panel.locator('> aside').boundingBox())!;
  expect((await panel.locator(bar).boundingBox())!.x).toBeGreaterThan(railBox.x + 300);

  await tabs.nth(1).click();
  await expect(page).toHaveURL(/\/en\/tierlist\/comps\/veigar-sprykin$/);
  await expect(page.locator('h1')).toContainText('Veigar Sprykin');
});

// Picking a comp from the tier rows glides that row under the sticky bars. A
// tab swap must not: the reader is already inside the detail, and the two
// variants sit in different tiers here, so a glide would move the page a lot.
test('a variant tab swaps the comp in place instead of gliding to its tier row', async ({ page }) => {
  await page.goto(detail);
  const tabs = page.locator(`${bar} nav a`);
  await tabs.first().scrollIntoViewIfNeeded();
  const before = await scrollAtRest(page);

  await tabs.nth(1).click();
  await expect(page).toHaveURL(/\/en\/tierlist\/comps\/veigar-sprykin$/);
  await expect(page.locator('h1')).toContainText('Veigar Sprykin');
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

// The names view is read from localStorage. The flip lasts a frame or two, so
// only a per-frame sample of the switch catches a mount that renders the
// default view first — the board rows change width and height when it does.
async function watchNamesSwitch(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__switch = [] as string[];
    const tick = () => {
      const on = document.querySelector<HTMLElement>('[role="switch"][title]');
      if (on) w.__switch.push(on.getAttribute('aria-checked') ?? '');
      w.__switchSampler = requestAnimationFrame(tick);
    };
    tick();
  });
}

async function readNamesSwitch(page: Page) {
  return page.evaluate(() => {
    const w = window as any;
    cancelAnimationFrame(w.__switchSampler);
    return [...new Set(w.__switch as string[])];
  });
}

// The board buckets comps into one row per tier, and a variant group shows only
// its lead — which lead depends on the payload the route carries. Read the rows
// from the live DOM at the moment of the click; a snapshot taken before one can
// name a comp the board has since grouped away.
async function tierRows(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-tier-row]')].map((row) => ({
      tier: row.getAttribute('data-tier-row') ?? '',
      top: Math.round(row.getBoundingClientRect().top + window.scrollY),
      hrefs: [...new Set([...row.querySelectorAll('a[href*="/tierlist/comps/"]')].map((a) => a.getAttribute('href') ?? ''))].filter(Boolean),
    }))
  );
}

// A click dispatched from the page rather than by Playwright: Playwright first
// scrolls the link into view, which is a real move of the page and would be
// counted as the glide the test is looking for.
const clickHref = (page: Page, href: string) =>
  page.evaluate((target) => document.querySelector<HTMLAnchorElement>(`a[href="${target}"]`)?.click(), href);

// A second pick from the row already holding the detail changes nothing on the
// board, so the glide must not run: it would drag the comp the reader just
// clicked out of view. A pick in another row still glides, and the test picks a
// row deep enough that "landed" and "did not move" are different numbers.
test('a second comp in the same tier row swaps in place instead of gliding', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  // Names-off is a saved setting, not the default. The detail route remounts the
  // explorer, so a mount that paints the default first shows the other board
  // view for a frame — the rows change width mid-load, and the glide then
  // measures against a layout that has already moved.
  await page.addInitScript(() => localStorage.setItem('comps-show-names', '0'));
  await page.goto('/en/tierlist/comps');
  // The server cannot read the saved view, so the first paint of a fresh load is
  // the default one. Wait that out; the claim is about the comp click, which is
  // a client-side transition and never re-renders the other view.
  await expect(page.getByRole('switch', { name: 'Comp names' })).toHaveAttribute('aria-checked', 'false');

  const open = (await tierRows(page)).find((row) => row.hrefs.length >= 2 && row.top > 250);
  expect(open, 'the board needs a deep tier row holding two comps').toBeTruthy();
  const first = open!.hrefs[0];

  await watchNamesSwitch(page);
  await clickHref(page, first);
  const landed = await scrollAtRest(page);
  expect(await readNamesSwitch(page), 'the saved names view must not flash the default one').toEqual(['false']);
  expect(landed).toBeGreaterThan(0);

  const after = await tierRows(page);
  const live = after.find((row) => row.hrefs.includes(first));
  const second = live?.hrefs.find((href) => href !== first);
  const other = after.find((row) => row.tier !== live?.tier && row.top > 250 && row.hrefs.length)?.hrefs[0];
  expect(second, 'the row must still hold a second comp once the detail is open').toBeTruthy();
  expect(other, 'the board needs a second deep row to glide to').toBeTruthy();

  // Still on the row's landing spot, a swap must not shift the page a pixel.
  await clickHref(page, second!);
  await expect(page).toHaveURL(new RegExp(second + '$'));
  await expect(page.locator('[data-section="comp-detail"]')).toHaveCount(1);
  expect(await scrollAtRest(page)).toBe(landed);

  // The reader's own case: back at the top, the same swap leaves them at the top.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await clickHref(page, first);
  await expect(page.locator('[data-section="comp-detail"]')).toHaveCount(1);
  expect(await scrollAtRest(page)).toBe(0);

  // A different row is a different landing spot, so the glide still runs.
  await clickHref(page, other!);
  expect(await scrollAtRest(page)).toBeGreaterThan(0);
});

// The other locale is the same page translated, so switching keeps the reader in
// place. The router's default scroll-to-top yanked them back to the header with
// the comp panel left far below, and no glide could bring it into view because
// the row already holds the detail.
test('switching language holds the page still with a comp open', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto('/en/tierlist/comps');
  const href = (await tierRows(page)).find((row) => row.top > 250 && row.hrefs.length)?.hrefs[0];
  expect(href, 'the board needs a comp deep enough to glide to').toBeTruthy();

  await clickHref(page, href!);
  const landed = await scrollAtRest(page);
  expect(landed).toBeGreaterThan(0);

  await page.click('[data-section="lang-switch"] a[href^="/vi"]');
  await expect(page).toHaveURL(new RegExp(href!.replace('/en/', '/vi/') + '$'));
  await expect(page.locator('[data-section="comp-detail"]')).toHaveCount(1);
  const after = await scrollAtRest(page);
  // A translated title can shift the row a couple of pixels, and the effect may
  // settle that; what must not happen is the walk back to the top.
  expect(Math.abs(after - landed), 'the locale switch moved the reader off the panel').toBeLessThanOrEqual(6);

  // The panel still hangs from the row parked under the pinned bars.
  const gap = await page.evaluate(() => {
    const panel = document.querySelector('[data-section="comp-detail"]');
    const row = panel?.previousElementSibling;
    const bottom = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().bottom ?? 0;
    const stack = Math.max(bottom('[data-section="nav"]'), bottom('[data-section="menu"]'));
    return row ? Math.round(row.getBoundingClientRect().top - stack) : NaN;
  });
  expect(Math.abs(gap)).toBeLessThanOrEqual(6);
});

// The tierlist pins both bars, so the stack a glide lands under is header plus
// menu. A row that ends up inside that band reads as cut off mid-selection.
test('the row a comp lands in sits clear of the pinned bars', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en/tierlist/comps');
  const rows = page.locator('[data-section="tierlist"] > div');
  const deep = await rows.last().locator('a[href^="/en/tierlist/comps/"]').first().getAttribute('href');
  await page.goto(deep!);

  await scrollAtRest(page);
  const stack = await page.evaluate(() => {
    const bottom = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().bottom ?? 0;
    return Math.max(bottom('[data-section="nav"]'), bottom('[data-section="menu"]'));
  });
  expect(stack).toBeGreaterThan(100);
  const landed = page.locator('[data-section="tierlist"] > div').filter({ has: page.locator('[data-section="comp-panel"]') }).first();
  expect((await landed.boundingBox())!.y).toBeGreaterThanOrEqual(stack - 2);
});

// The strip is the one place a reader identifies each carry by its art, so at
// desktop widths it runs at the 62.25px ceiling and the item plate under it
// scales with the tile instead of staying a fixed 16px chip.
test('the team strip grows its hexes and item plates on a large screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(detail);
  const strip = page.locator('[data-section="team-strip"]');
  const tile = strip.locator('a').first();
  expect((await tile.boundingBox())!.width).toBeCloseTo(62.25, 1);

  const items = strip.locator('span[data-tip^="item:"]');
  await expect(items.first()).toBeVisible();
  expect((await items.first().boundingBox())!.width).toBeGreaterThanOrEqual(16);

  await page.setViewportSize({ width: 390, height: 844 });
  // The tile carries `smooth`, so its width eases across the breakpoint change.
  await expect.poll(async () => (await tile.boundingBox())!.width).toBeCloseTo(54, 0);
});

test('a variant group holds one slot on the tier board', async ({ page }) => {
  await page.goto('/en/tierlist/comps');
  const board = page.locator('[data-section="tierlist"]');
  const switcher = page.getByRole('switch', { name: 'Comp names' });
  const lead = board.locator('a[href="/en/tierlist/comps/veigar-blackthorn"]');
  await expect(switcher).toHaveAttribute('aria-checked', 'true');
  await expect(lead).toHaveCount(1);
  // The sibling is not a second avatar; it is the second tab of this one.
  await expect(board.locator('a[href="/en/tierlist/comps/veigar-sprykin"]')).toHaveCount(0);
  await expect(lead).toHaveAttribute('aria-label', /includes 1 other variant/);

  // The board holds one slot per group in either view, so the avatar-only mode
  // is the same comp link with a different body rather than a new row.
  await switcher.click();
  await expect(switcher).toHaveAttribute('aria-checked', 'false');
  await expect(lead).toHaveCount(1);
  await expect(lead).toHaveClass(/rounded-lg/);
  await switcher.click();

  // Opening a sibling by its own URL adds no second avatar anywhere: the detail
  // sits under the group's slot — the lead's row — and that avatar is the lit one.
  await page.goto('/en/tierlist/comps/veigar-sprykin');
  const slotRow = page
    .locator('[data-section="tierlist"] > div')
    .filter({ has: page.locator('[data-section="comp-detail"]') });
  await expect(board.locator('a[aria-label^="Veigar Sprykin"]')).toHaveCount(0);
  const slotLead = slotRow.locator('a[aria-label^="Veigar Blackthorn"]');
  await expect(slotLead).toHaveCount(1);
  await expect(slotLead).toHaveClass(/ring-brand/);
  await expect(page.locator('h1')).toContainText('Veigar Sprykin');
});

test('a comp with no siblings keeps its own tab so the bar never collapses', async ({ page }) => {
  await page.goto('/en/tierlist/comps/soraka-executioner');
  const tabs = page.locator(`${bar} nav a`);
  await expect(tabs).toHaveCount(1);
  await expect(tabs.first()).toHaveAttribute('aria-current', 'page');
});

test('the rail wears the comp cover, and flex units read as pairs', async ({ page }) => {
  await page.goto(detail);
  await expect(page.locator('[data-section="comp-cover"] [data-tip="augment:Portable Forge"]')).toBeVisible();

  const pairs = page.locator('[data-section="flex-units"] a');
  await expect(pairs).toHaveCount(2);
  await expect(pairs.first()).toHaveAttribute('aria-label', 'Ahri replaces Cassiopeia');
  // The big hex is the unit coming in; the corner hex is the one it swaps.
  await expect(pairs.first().locator('[data-tip^="champion:"]')).toHaveCount(2);

  const alts = page.locator('[data-section="alt-builds"] a');
  await expect(alts).toHaveCount(2);
  await expect(alts.first().locator('span[data-tip^="item:"]')).toHaveCount(3);
});

test('the bar copies the comp link and closes back to the tier list', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(detail);
  await page.locator(`${bar} button[aria-label="Copy link"]`).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('/en/tierlist/comps/veigar-blackthorn');
  await expect(page.locator(`${bar} button[aria-label="Link copied"]`)).toBeVisible();

  await page.locator(`${bar} button[aria-label="Close comp details"]`).click();
  await expect(page).toHaveURL(/\/en\/tierlist\/comps$/);
});

test('the tab strip scrolls inside itself on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(detail);
  await expect(page.locator(`${bar} nav`)).toHaveCSS('overflow-x', 'auto');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
