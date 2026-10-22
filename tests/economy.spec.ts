import { expect, test } from 'playwright/test';

test('economy page lists the eight strategies with their round plan', async ({ page }) => {
  await page.goto('/en/economy');

  await expect(page.getByRole('heading', { name: 'Economy strategies' })).toBeVisible();
  for (const strategy of ['1-Cost Reroll', '2-Cost Reroll', '3-Cost Reroll', 'Fast 8', 'Fast 9']) {
    await expect(page.getByRole('heading', { name: strategy, exact: true })).toBeVisible();
  }
  await expect(page.getByText('2-1').first()).toBeVisible();
});

test('comp page shows its economy strategy and links to the plan', async ({ page }) => {
  await page.goto('/en/tierlist/comps/kha-zix-elderwood');

  const chip = page.getByRole('link', { name: /Reroll/ }).first();
  await expect(chip).toBeVisible();
  await expect(page.getByText(/Economy plan/)).toBeVisible();
});
