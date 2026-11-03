import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';

test('desktop header keeps the menu sticky and hides the search row on scroll down', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en');

  const search = page.getByRole('combobox', { name: /Search champions/ });
  const menu = page.locator('[data-section="menu"]');
  await expect(search).toBeVisible();
  await expect(menu.getByRole('navigation')).toBeVisible();

  await page.mouse.wheel(0, 600);
  await expect.poll(async () => (await search.boundingBox())?.y ?? 0).toBeLessThan(0);
  await expect.poll(async () => (await menu.boundingBox())?.y ?? 1).toBe(0);

  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await search.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
  await expect.poll(async () => (await menu.boundingBox())?.y ?? 0).toBeGreaterThan(0);
});

test('the tierlist keeps the search row pinned with the menu row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en/tierlist/comps');

  const search = page.getByRole('combobox', { name: /Search champions/ });
  const header = page.locator('[data-section="nav"]');
  const menu = page.locator('[data-section="menu"]');

  await page.mouse.wheel(0, 1500);
  await expect.poll(async () => (await header.boundingBox())?.y ?? -1).toBe(0);
  await expect.poll(async () => (await menu.boundingBox())?.y ?? 0).toBe(64);
  await expect(search).toBeVisible();

  // Deep in the list, after the direction that would hide it anywhere else.
  await page.mouse.wheel(0, 4000);
  await expect.poll(async () => (await header.boundingBox())?.y ?? -1).toBe(0);
  await expect.poll(async () => (await menu.boundingBox())?.y ?? 0).toBe(64);
  await expect(search).toBeVisible();
});

test('mobile header stays a single row without the menu row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/vi');

  await expect(page.getByRole('combobox')).toBeVisible();
  await expect(page.locator('[data-section="menu"]')).toBeHidden();

  await page.getByRole('button', { name: 'Menu điều hướng' }).click();
  const menu = page.locator('#mobile-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('link', { name: 'Tướng', exact: true }).click();
  await expect(page).toHaveURL(/\/vi\/champions$/);
});

test('the set menu splits the season into entities and the pages that read them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en');

  const menu = page.locator('[data-section="menu"]');
  await menu.getByRole('button', { name: 'Set 18' }).hover();

  const panel = menu.locator('div.grid');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('link')).toHaveCount(9);
  // Traits and encounters have boards now, so nothing in the season is held back.
  await expect(panel.locator('[data-nav-soon]')).toHaveCount(0);
  // Every row carries its glyph, so the list reads by shape before it reads by name.
  await expect(panel.locator('a svg')).toHaveCount(9);
  const champions = await panel.getByRole('link', { name: 'Champions', exact: true }).boundingBox();
  const patches = await panel.getByRole('link', { name: 'Patch notes', exact: true }).boundingBox();
  expect(champions?.x ?? 0).toBeLessThan(patches?.x ?? 0);

  // Item priority is something you build with, so it sits with the other tools — and the
  // glyph is a season-menu thing: the ranking and tool rows are plain text.
  await menu.getByRole('button', { name: 'Tools' }).hover();
  const tools = menu.getByRole('link', { name: 'Item priority', exact: true });
  await expect(tools).toBeVisible();
  await expect(tools.locator('svg')).toHaveCount(0);

  // Being inside the season lights both the row and the group it hangs off.
  await page.goto('/en/augments');
  await menu.getByRole('button', { name: 'Set 18' }).hover();
  await expect(panel.getByRole('link', { name: 'Augments', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(menu.getByRole('button', { name: 'Set 18' })).toHaveClass(/bg-util/);
});

test('the mobile menu lists the season, its boards and the tools', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/vi');
  await page.getByRole('button', { name: 'Menu điều hướng' }).click();

  const menu = page.locator('#mobile-menu');
  await expect(menu.getByText('Mùa 18', { exact: true })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Tộc/Hệ', exact: true })).toHaveCount(1);
  await expect(menu.getByRole('link', { name: 'Kỳ ngộ', exact: true })).toHaveCount(1);
  await expect(menu.getByRole('link', { name: 'Lõi nâng cấp', exact: true })).toHaveCount(1);
  await expect(menu.getByRole('link', { name: 'Trang bị ưu tiên', exact: true })).toHaveCount(1);
});

test('the app renders the one palette with no theme switcher', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/vi');

  const html = page.locator('html');
  await expect(html).not.toHaveAttribute('data-theme');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe('rgb(13, 19, 23)');
  // The action fill is orange: white on it is 2.83, so its ink is near-black.
  await expect
    .poll(() => page.locator('[data-section="hero"] a').first().evaluate((element) => getComputedStyle(element).color))
    .toBe('rgb(22, 11, 5)');
  await expect(page.locator('[data-section="theme-switch"]')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Menu điều hướng' }).click();
  await expect(page.locator('#mobile-menu [data-section="theme-switch"]')).toHaveCount(0);
});

test('the brand mark is the same hexagon-ring logo in the nav and the favicon', async ({ page }) => {
  await page.goto('/en');
  const mark = page.locator('[data-section="brand"] svg');
  await expect(mark).toBeVisible();

  // The brand board fixes the logo's own gradient, so it is drawn with literals
  // instead of the UI accent token.
  const stops = await mark.locator('stop').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('stop-color')));
  expect(stops).toEqual(['#FA7F30', '#EA4F21', '#B32C0C']);

  // No squashing: the rendered box keeps the viewBox ratio.
  const box = await mark.boundingBox();
  expect(box!.width / box!.height).toBeCloseTo(51.4 / 58.2, 2);

  // app/icon.svg is a static file: it has to carry the same stops, or the tab
  // icon drifts from the header the way the old violet mark sat unnoticed.
  const icon = readFileSync(join(__dirname, '..', 'app', 'icon.svg'), 'utf8');
  for (const stop of stops) expect(icon).toContain(stop!);
  expect(icon).not.toMatch(/#6a45ff|#b9a8ff|#121722|#7c5cff|#ff6b3d/i);
});

test('assistant is promoted on the home page and directly linked from desktop navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/vi');

  const hero = page.locator('[data-section="hero"]');
  const bannerResponse = await page.request.get('/images/tft/enchanted-wilds-banner.webp');
  expect(bannerResponse.ok()).toBeTruthy();
  await expect.poll(() => hero.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain('enchanted-wilds-banner.webp');
  const coachMascot = page.locator('img[src*="coach-penguin"]');
  await expect(coachMascot).toBeVisible();
  await expect.poll(() => coachMascot.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

  const spotlight = page.locator('[data-section="assistant-spotlight"]');
  await expect(spotlight.getByRole('heading', { name: 'Tự tin chọn nước đi tiếp theo.' })).toBeVisible();
  // Its glow is mixed from --color-brand, so it cannot drift away from the palette.
  expect(await spotlight.evaluate((element) => getComputedStyle(element).boxShadow)).not.toContain('124, 58, 237');
  await spotlight.getByRole('link', { name: 'Hỏi Coach AI' }).click();
  await expect(page).toHaveURL(/\/vi\/assistant$/);

  await page.goto('/en');
  await expect(page.locator('[data-section="menu"]').getByRole('link', { name: 'Coach AI', exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/vi');
  await expect(page.locator('[data-section="assistant-spotlight"]').getByRole('link', { name: 'Hỏi Coach AI' })).toBeVisible();
});

test('every card render breaks its frame and the overhang still routes the click', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/vi');
  const cards = page.locator('[data-section="features"] a:has(img.card-art)');
  // Four art cards today; a card losing its render is fine, the guard is that
  // whatever does carry art carries it outside the frame.
  expect(await cards.count()).toBeGreaterThan(1);

  for (let i = 0; i < (await cards.count()); i++) {
    const card = cards.nth(i);
    const art = card.locator('img.card-art');
    const href = await card.getAttribute('href');
    await card.scrollIntoViewIfNeeded();

    const overhang = async () => {
      const box = await card.boundingBox();
      const image = await art.boundingBox();
      return box && image ? box.y - image.y : 0;
    };
    await expect
      .poll(overhang, { message: `${href}: the render has to escape the top edge of the card, not sit inside it` })
      .toBeGreaterThan(20);

    // The overhang is still a descendant of the same <a>, so the empty-looking air
    // above the frame opens that board too.
    const box = await card.boundingBox();
    const image = await art.boundingBox();
    await page.mouse.click(image!.x + image!.width / 2, box!.y - 12);
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await page.goBack();
    await page.waitForLoadState('networkidle');
  }
});
