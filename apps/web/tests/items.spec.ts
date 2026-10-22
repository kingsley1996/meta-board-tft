import { expect, test } from 'playwright/test';

test('item database includes radiant and Ornn items', async ({ page }) => {
  await page.goto('/en/items');

  await page.getByRole('link', { name: 'Radiant', exact: true }).click();
  await expect(page).toHaveURL(/type=radiant/);
  await expect(page.getByText("Radiant Rabadon's Deathcap")).toBeVisible();
  await expect(page.getByText('Infinity Edge', { exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: 'Ornn items', exact: true }).click();
  await expect(page).toHaveURL(/type=artifact/);
  await expect(page.getByText('Dawncore')).toBeVisible();
  await expect(page.getByText("Death's Defiance")).toBeVisible();
});

test('localized item tabs show Vietnamese radiant names', async ({ page }) => {
  await page.goto('/vi/items?type=radiant');

  await expect(page.getByText('Mũ Phù Thủy Rabadon Ánh Sáng')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ánh sáng', exact: true })).toBeVisible();
});

test('recipes with repeated components do not produce duplicate React keys', async ({ page }) => {
  const duplicateKeyWarnings: string[] = [];
  page.on('console', (message) => {
    if (/same key/i.test(message.text())) duplicateKeyWarnings.push(message.text());
  });

  await page.goto('/vi/items?type=completed');
  await expect(page.getByText('Mũ Phù Thủy Rabadon', { exact: true })).toBeVisible();

  await page.goto('/vi/items/tft-item-rabadonsdeathcap');
  await expect(page.getByText('Gậy Quá Khổ', { exact: true })).toHaveCount(2);
  await expect.poll(() => duplicateKeyWarnings).toEqual([]);
});
