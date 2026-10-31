import { expect, test } from 'playwright/test';

// The Riot Developer Portal application links reviewers to the product docs, so the
// page has to be reachable without an account and complete in both languages.
test('the Coach guide is public and translated', async ({ page }) => {
  await page.goto('/en/assistant/guide');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How to use Coach AI');
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(5);
  await expect(page.getByText('60 Coach messages a month')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Coach AI' })).toHaveAttribute('href', '/en/assistant');

  await page.goto('/vi/assistant/guide');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cách dùng Coach AI');
  await expect(page.getByText('60 lượt Coach mỗi tháng')).toBeVisible();
});

test('the guide is linked from the Coach before anyone signs in', async ({ page }) => {
  await page.goto('/en/assistant');
  await expect(page.getByRole('link', { name: 'How to use Coach' })).toHaveAttribute('href', '/en/assistant/guide');
});
