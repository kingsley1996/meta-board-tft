import { expect, test } from 'playwright/test';

test('/admin stays English-only and is not rewritten to /vi/admin', async ({ page }) => {
  const response = await page.request.get('/admin', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('/en/login?next=/admin');
});
