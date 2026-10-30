import { expect, test } from 'playwright/test';

// Without the catch-all under [lang], an unknown URL renders Next's built-in
// English 404 and drops the nav, so a missing page looks like a broken site.
test('unmatched URLs render the locale 404 with status 404', async ({ page }) => {
  const response = await page.goto('/vi/khong-ton-tai');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/không có trên bản đồ/);
  await expect(page.getByRole('link', { name: 'Về bảng xếp hạng' })).toBeVisible();
  await expect(page.getByText('This page could not be found')).toHaveCount(0);
});
