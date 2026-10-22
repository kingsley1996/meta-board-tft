import { expect, test } from 'playwright/test';

const searchBox = (page: import('playwright/test').Page) => page.getByRole('combobox', { name: /Search champions|Tìm tướng/ });

test('header search opens a champion page', async ({ page }) => {
  await page.goto('/en');
  await searchBox(page).fill('Ahri');

  const result = page.getByRole('option', { name: /^Ahri/ }).first();
  await expect(result).toBeVisible();
  await result.click();

  await expect(page).toHaveURL(/\/en\/champions\/da-18-ahri$/);
  await expect(page.getByRole('heading', { name: 'Ahri' })).toBeVisible();
});

test('header search opens item detail pages', async ({ page }) => {
  await page.goto('/en');
  await searchBox(page).fill('Radiant Rabadon');

  await page.getByRole('option', { name: /Radiant Rabadon's Deathcap/ }).first().click();
  await expect(page).toHaveURL(/\/en\/items\/tft5-item-rabadonsdeathcapradiant$/);
  await expect(page.getByRole('heading', { name: "Radiant Rabadon's Deathcap" })).toBeVisible();
  await expect(page.getByText('Category: Radiant')).toBeVisible();
});

test('header search opens augment and trait pages', async ({ page }) => {
  await page.goto('/en');
  await searchBox(page).fill('U.R.F');
  await page.getByRole('option', { name: /^U\.R\.F/ }).first().click();
  await expect(page).toHaveURL(/\/en\/augments\/tft16-augment-ultrarapidfire$/);
  await expect(page.getByRole('heading', { name: 'U.R.F' })).toBeVisible();

  await searchBox(page).fill('Elderwood');
  await page.getByRole('option', { name: 'Elderwood', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/traits\/da-18-elderwood$/);
  await expect(page.getByRole('heading', { name: 'Elderwood' })).toBeVisible();
});

test('header search is localized and stays inside a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/vi');
  await searchBox(page).fill('Mũ');
  await expect(page.getByRole('option').first()).toContainText('Mũ Phù Thủy Rabadon');
  await searchBox(page).fill('Mũ Phù Thủy Rabadon Ánh Sáng');
  await page.getByRole('option', { name: /Rabadon Ánh Sáng/ }).first().click();
  await expect(page).toHaveURL(/\/vi\/items\/tft5-item-rabadonsdeathcapradiant$/);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('desktop navigation dropdown closes after selecting an item', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/en');

  const menu = page.locator('[data-section="menu"]');
  const database = menu.getByRole('button', { name: 'Database' });
  await database.hover();

  const champions = menu.getByRole('link', { name: 'Champions', exact: true });
  await expect(champions).toBeVisible();
  await champions.click();

  await expect(page).toHaveURL(/\/en\/champions$/);
  await expect(champions).toBeHidden();
});
