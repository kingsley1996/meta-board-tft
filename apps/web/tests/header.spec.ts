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

test('the brand mark is one palette-cut hexagon in the nav and in the favicon', async ({ page }) => {
  await page.goto('/en');
  const mark = page.locator('[data-section="brand"] svg');
  await expect(mark).toBeVisible();

  // Token colours rather than literals, so a palette change reaches the mark the
  // same moment it reaches everything else.
  await expect(mark.locator('polygon')).toHaveCSS('fill', 'rgb(255, 107, 61)');
  await expect(mark.locator('path')).toHaveCSS('stroke', 'rgb(22, 11, 5)');

  // A regular pointy-top hexagon, like every board cell, not a squashed one.
  const box = await mark.boundingBox();
  expect(box!.width / box!.height).toBeCloseTo(0.866, 2);

  // app/icon.svg is a static file with the same two colours as literals: the
  // pre-palette violet mark sat there unnoticed until it was read.
  const icon = readFileSync(join(__dirname, '..', 'app', 'icon.svg'), 'utf8');
  expect(icon).toContain('#ff6b3d');
  expect(icon).toContain('#160b05');
  expect(icon).not.toMatch(/#6a45ff|#b9a8ff|#121722|#7c5cff/i);
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
