import { expect, test } from 'playwright/test';

test('signed-out /profile asks for sign-in and returns to the profile', async ({ page }) => {
  const response = await page.request.get('/vi/profile', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('/vi/login?next=/vi/profile');
});
