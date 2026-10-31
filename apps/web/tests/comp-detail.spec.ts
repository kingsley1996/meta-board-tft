import { expect, test } from 'playwright/test';

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
  const before = await page.evaluate(() => window.scrollY);

  await tabs.nth(1).click();
  await expect(page).toHaveURL(/\/en\/tierlist\/comps\/veigar-sprykin$/);
  await expect(page.locator('h1')).toContainText('Veigar Sprykin');
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

test('a variant group holds one slot on the tier board', async ({ page }) => {
  await page.goto('/en/tierlist/comps');
  const board = page.locator('[data-section="tierlist"]');
  const lead = board.locator('a[href="/en/tierlist/comps/veigar-blackthorn"]');
  await expect(lead).toHaveCount(1);
  // The sibling is not a second avatar; it is the second tab of this one.
  await expect(board.locator('a[href="/en/tierlist/comps/veigar-sprykin"]')).toHaveCount(0);
  await expect(lead.locator('[data-variants]')).toHaveText('+1');
  await expect(lead).toHaveAttribute('aria-label', /includes 1 other variant/);

  // Opening a sibling by its own URL adds no second avatar anywhere: the detail
  // sits under the group's slot — the lead's row — and that avatar is the lit one.
  await page.goto('/en/tierlist/comps/veigar-sprykin');
  const slotRow = page
    .locator('[data-section="tierlist"] > div')
    .filter({ has: page.locator('[data-section="comp-detail"]') });
  await expect(board.locator('a[title="Veigar Sprykin"]')).toHaveCount(0);
  await expect(slotRow.locator('a[title="Veigar Blackthorn"]')).toHaveCount(1);
  await expect(slotRow.locator('a[title="Veigar Blackthorn"]')).toHaveClass(/ring-brand/);
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
