import { expect, test } from 'playwright/test';

test('/admin stays English-only and is not rewritten to /vi/admin', async ({ page }) => {
  const response = await page.request.get('/admin', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('/en/login?next=/admin');
});

// /admin/users is the only place an operator moves accounts between roles, so
// the two checks that matter are: the page never renders for a visitor the API
// has not confirmed as admin, and the endpoint it calls answers on its own
// rather than trusting the page.
// The gate lives in the admin shell layout, so every /admin/… deep link sends a
// signed-out visitor to sign-in and then to the overview — not to the page they
// asked for. Asserting the exact target keeps that behaviour visible.
test('/admin/users is behind the same admin gate as the overview', async ({ page }) => {
  const response = await page.request.get('/admin/users', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('/en/login?next=/admin');
});

test('the admin user endpoints answer 401 before any data, read or write', async ({ request }) => {
  const list = await request.get('/api/admin/users');
  expect(list.status()).toBe(401);
  expect(await list.json()).toMatchObject({ code: 'unauthenticated' });

  // A role change is the destructive one; it must not fall through to the
  // handler just because the caller skipped the page.
  const write = await request.patch('/api/admin/users/11111111-1111-4111-8111-111111111111/role', {
    data: { role: 'admin' },
  });
  expect(write.status()).toBe(401);
  expect(await write.json()).toMatchObject({ code: 'unauthenticated' });
});

test('a forged session cookie is unauthenticated, not a partial login', async ({ request }) => {
  const response = await request.get('/api/admin/users', { headers: { cookie: 'mb_session=not-a-real-session-token' } });
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({ code: 'unauthenticated' });
});
