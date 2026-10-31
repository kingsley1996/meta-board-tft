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

// The middleware skips anything with a dot, so these reach the locale route
// directly. They have to 404 like any other unknown path — Riot fetches
// /riot.txt when it verifies the domain, and a 500 there reads as a broken site.
test('root paths that look like files return 404, not 500', async ({ request }) => {
  for (const path of ['/riot.txt', '/favicon.ico', '/a.txt']) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});
