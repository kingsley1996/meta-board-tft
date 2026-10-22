import { expect, test } from 'playwright/test';

test('statistics question answers with MetaTFT stats', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/en/assistant');
  await page.getByRole('textbox', { name: /ask about/i }).fill('What is Ahri win rate?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  await expect(page.getByText(/11\.2%|50\.8%/).first()).toBeVisible({ timeout: 75_000 });
});

test('comp page opens the assistant with comp context', async ({ page }) => {
  await page.goto('/en/tierlist/comps/ahri-spellweaver');
  await page.getByRole('link', { name: 'Ask about this comp' }).click();

  await expect(page).toHaveURL(/\/en\/assistant\?comp=ahri-spellweaver$/);
  await expect(page.getByText('Asking about Ahri & Morgana Blossom')).toBeVisible();
});

test('mobile assistant has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/vi/assistant');
  await expect(page).toHaveTitle(/Coach AI/);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow).toBe(false);
});
