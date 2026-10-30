import { expect, test } from 'playwright/test';

// The paid pilot's public surface (task #93, docs/MEMBERSHIP-PLAN.md §11 "UI" and
// "Ownership"). The API suites already prove what a request costs; this file proves
// the browser shows the approved offer and that nothing on the purchase path opens
// for a visitor the API has not recognised.

test('the approved offer is on the pricing page in English and Vietnamese', async ({ page }) => {
  await page.goto('/en/membership');
  const en = page.locator('body');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('MetaBoard');
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(en).toContainText('99,000₫');
  await expect(en).toContainText('3,300₫ a day');
  await expect(en).toContainText('300 Coach messages per 30 days');
  await expect(en).toContainText('20 minutes of voice in');
  await expect(en).toContainText('10,000 read-aloud characters');

  // The buy button is the only link into checkout, and it carries the plan code
  // rather than a price: the server resolves the amount.
  const buy = page.getByRole('link', { name: /get plus/i });
  await expect(buy).toHaveAttribute('href', '/en/checkout?plan=plus');
  await expect(page.getByText('Free', { exact: true }).first()).toBeVisible();

  await page.goto('/vi/membership');
  const vi = page.locator('body');
  await expect(vi).toContainText('99.000₫');
  await expect(vi).toContainText('3.300₫ mỗi ngày');
  await expect(vi).toContainText('300 lượt Coach trong 30 ngày');
  await expect(vi).toContainText('20 phút giọng nói vào');
  await expect(vi).toContainText('10.000 ký tự đọc to');
});

test('the pricing page fits a 320px screen in both languages', async ({ page }) => {
  for (const lang of ['en', 'vi']) {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`/${lang}/membership`);
    await expect(page.getByRole('article')).toHaveCount(2);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow, lang).toBe(false);
  }
});

test('buying needs an account and keeps the intended destination', async ({ page }) => {
  const plan = await page.request.get('/vi/checkout?plan=plus', { maxRedirects: 0 });
  expect(plan.status()).toBe(307);
  expect(plan.headers().location).toBe('/vi/login?next=%2Fvi%2Fcheckout%3Fplan%3Dplus');

  // A receipt is somebody's order; the page asks for a session before it even
  // looks the order up, so a shared link cannot print a stranger's amount.
  const receipt = await page.request.get('/en/checkout?order=11111111-1111-4111-8111-111111111111', { maxRedirects: 0 });
  expect(receipt.status()).toBe(307);
  expect(receipt.headers().location).toBe('/en/login?next=%2Fen%2Fcheckout%3Forder%3D11111111-1111-4111-8111-111111111111');
});

test('the membership console is behind the admin gate', async ({ page }) => {
  const response = await page.request.get('/admin/membership', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('/en/login?next=/admin');
});

test('plan, orders and usage stay closed to a caller without a session', async ({ request }) => {
  for (const path of ['/api/me/membership', '/api/me/orders', '/api/me/usage']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(401);
    expect(await response.json(), path).toMatchObject({ code: 'unauthenticated' });
  }

  // A forged cookie is not a partial login: the token is looked up, not trusted.
  const forged = await request.get('/api/me/membership', { headers: { cookie: 'mb_session=forged-token' } });
  expect(forged.status()).toBe(401);
  expect(await forged.json()).toMatchObject({ code: 'unauthenticated' });
});

test('the catalog the checkout reads is public but carries no account data', async ({ request }) => {
  const response = await request.get('/api/membership/catalog');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { offers: Array<Record<string, unknown>> };
  expect(Array.isArray(body.offers)).toBe(true);
  for (const offer of body.offers) {
    expect(Object.keys(offer).sort()).toEqual(
      ['allowances', 'buyable', 'code', 'label', 'planVersionId', 'price', 'termDays', 'version'],
    );
  }
});
