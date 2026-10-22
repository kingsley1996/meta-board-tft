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
