import { expect, test, type Page } from 'playwright/test';

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const USER = { id: 'test-user', email: 'person@example.com', name: 'Test', avatarUrl: null, emailVerified: true, role: 'user' };

type WidgetMock = Window & {
  challenge: Record<string, (token?: string) => void>;
  stopSolving: boolean;
  resetCount: number;
};

async function widget(page: Page) {
  await page.route('**/api/auth/turnstile', (route) => route.fulfill({ json: { site_key: 'test-site-key' } }));
  await page.route(SCRIPT, (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      let serial = 0;
      window.resetCount = 0;
      window.turnstile = {
        render(host, options) {
          window.challenge = options;
          host.dataset.testid = 'challenge';
          const box = document.createElement('div');
          box.style.width = options.size === 'compact' ? '150px' : '300px';
          box.style.flexShrink = '0';
          box.textContent = 'Browser verified (test widget)';
          host.append(box);
          options.callback('token-' + ++serial);
          return 'widget';
        },
        reset() {
          window.resetCount++;
          if (!window.stopSolving) window.challenge.callback('token-' + ++serial);
        },
        remove() {}
      };
    `,
  }));
}

async function fill(page: Page, lang = 'en', mode = 'login') {
  await page.goto(`/${lang}/login?mode=${mode}&next=/${lang}/items`);
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(USER.email);
  await page.locator('input[type=password]').fill('valid-password');
}

const submit = (page: Page) => page.locator('main button[type=submit]');

test('three failed logins consume distinct tokens, including synchronous reset callbacks', async ({ page }) => {
  await widget(page);
  const tokens: (string | undefined)[] = [];
  await page.route('**/api/auth/login', (route) => {
    tokens.push(route.request().headers()['cf-turnstile-response']);
    return route.fulfill({ status: 401, json: { code: 'invalid_credentials' } });
  });
  await fill(page);
  await expect(page.getByTestId('challenge')).toBeVisible();
  for (let attempt = 1; attempt <= 3; attempt++) {
    await submit(page).click();
    await expect.poll(() => tokens.length).toBe(attempt);
    await expect(submit(page)).toBeEnabled();
  }
  expect(tokens).toEqual(['token-1', 'token-2', 'token-3']);
  await expect(page.getByText('Wrong email or password.')).toBeVisible();
});

test('an expired held token is replaced before login', async ({ page }) => {
  await widget(page);
  let token: string | undefined;
  await page.route('**/api/auth/login', (route) => {
    token = route.request().headers()['cf-turnstile-response'];
    return route.fulfill({ status: 401, json: { code: 'invalid_credentials' } });
  });
  await fill(page);
  await expect(page.getByTestId('challenge')).toBeVisible();
  await page.evaluate(() => (window as unknown as WidgetMock).challenge['expired-callback']());
  await submit(page).click();
  await expect.poll(() => token).toBe('token-2');
});

for (const lang of ['en', 'vi']) {
  test(`${lang}: rejected verification is localized and a retry gets a fresh token`, async ({ page }) => {
    await page.setViewportSize({ width: lang === 'vi' ? 320 : 425, height: 820 });
    await widget(page);
    const tokens: (string | undefined)[] = [];
    await page.route('**/api/auth/login', (route) => {
      tokens.push(route.request().headers()['cf-turnstile-response']);
      return route.fulfill({ status: 403, json: { code: 'turnstile_rejected' } });
    });
    await fill(page, lang);
    const challenge = page.getByTestId('challenge');
    await expect(challenge).toBeVisible();
    expect(await challenge.evaluate((host) => {
      const box = host.firstElementChild!.getBoundingClientRect();
      const bounds = host.getBoundingClientRect();
      return box.left >= bounds.left && box.right <= bounds.right;
    })).toBe(true);
    await submit(page).click();
    const message = lang === 'en'
      ? 'Browser verification expired or was rejected. Please try again.'
      : 'Xác minh trình duyệt đã hết hạn hoặc bị từ chối. Vui lòng thử lại.';
    await expect(page.getByText(message)).toBeVisible();
    await submit(page).click();
    await expect.poll(() => tokens.length).toBe(2);
    expect(tokens).toEqual(['token-1', 'token-2']);
  });
}

test('widget failure sends no login request and automatic recovery works', async ({ page }) => {
  await widget(page);
  let requests = 0;
  await page.route('**/api/auth/login', (route) => {
    requests++;
    return route.fulfill({ status: 401, json: { code: 'invalid_credentials' } });
  });
  await fill(page, 'vi');
  await expect(page.getByTestId('challenge')).toBeVisible();
  await page.evaluate(() => (window as unknown as WidgetMock).challenge['error-callback']());
  await submit(page).click();
  await expect(page.getByText('Không thể xác minh trình duyệt. Hãy tải lại trang và thử lại.')).toBeVisible();
  await expect(submit(page)).toBeEnabled();
  expect(requests).toBe(0);
  await page.evaluate(() => (window as unknown as WidgetMock).challenge.callback('recovered-token'));
  await submit(page).click();
  await expect.poll(() => requests).toBe(1);
});

test('a missing solve times out and restores the submit button', async ({ page }) => {
  await widget(page);
  await fill(page);
  await expect(page.getByTestId('challenge')).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as WidgetMock).challenge['expired-callback']();
    (window as unknown as WidgetMock).stopSolving = true;
  });
  await page.clock.install();
  await submit(page).click();
  await expect(submit(page)).toBeDisabled();
  await page.clock.fastForward(20_001);
  await expect(page.getByText('Could not verify your browser. Reload the page and try again.')).toBeVisible();
  await expect(submit(page)).toBeEnabled();
});

test('a blocked script does not leave the form busy or submit unverified credentials', async ({ page }) => {
  await widget(page);
  await page.route(SCRIPT, (route) => route.abort());
  let requests = 0;
  page.on('request', (request) => { if (request.url().endsWith('/api/auth/login')) requests++; });
  await fill(page);
  await submit(page).click();
  await expect(page.getByText('Could not verify your browser. Reload the page and try again.')).toBeVisible();
  await expect(submit(page)).toBeEnabled();
  expect(requests).toBe(0);
});

test('disabled configuration loads no Cloudflare script and preserves ordinary login', async ({ page }) => {
  await page.route('**/api/auth/turnstile', (route) => route.fulfill({ status: 204 }));
  const scripts: string[] = [];
  page.on('request', (request) => { if (request.url().includes('challenges.cloudflare.com')) scripts.push(request.url()); });
  let headers: Record<string, string> | undefined;
  await page.route('**/api/auth/login', (route) => {
    headers = route.request().headers();
    return route.fulfill({ status: 401, json: { code: 'invalid_credentials' } });
  });
  await fill(page);
  await submit(page).click();
  await expect.poll(() => Boolean(headers)).toBe(true);
  expect(headers?.['cf-turnstile-response']).toBeUndefined();
  expect(scripts).toEqual([]);
});

test('configuration outage cannot bypass an enabled server gate', async ({ page }) => {
  await page.route('**/api/auth/turnstile', (route) => route.fulfill({ status: 503 }));
  await page.route('**/api/auth/login', (route) => route.fulfill({ status: 403, json: { code: 'turnstile_rejected' } }));
  await fill(page);
  await submit(page).click();
  await expect(page.getByText('Browser verification expired or was rejected. Please try again.')).toBeVisible();
  await expect(submit(page)).toBeEnabled();
});

test('network errors release busy state and the retry uses a new token', async ({ page }) => {
  await widget(page);
  const tokens: (string | undefined)[] = [];
  await page.route('**/api/auth/login', (route) => {
    tokens.push(route.request().headers()['cf-turnstile-response']);
    return tokens.length === 1
      ? route.abort()
      : route.fulfill({ status: 401, json: { code: 'invalid_credentials' } });
  });
  await fill(page);
  await expect(page.getByTestId('challenge')).toBeVisible();
  await submit(page).click();
  await expect(page.getByText('Something went wrong. Please try again.')).toBeVisible();
  await submit(page).click();
  await expect.poll(() => tokens.length).toBe(2);
  expect(tokens).toEqual(['token-1', 'token-2']);
});

for (const path of ['login', 'register']) {
  test(`${path}: successful response forwards the token and follows next`, async ({ page }) => {
    await widget(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let token: string | undefined;
    await page.route(`**/api/auth/${path}`, (route) => {
      token = route.request().headers()['cf-turnstile-response'];
      return route.fulfill({ json: { ok: true, user: USER } });
    });
    await fill(page, 'en', path === 'register' ? 'signup' : 'login');
    await expect(page.getByTestId('challenge')).toBeVisible();
    await submit(page).click();
    await expect(page).toHaveURL(/\/en\/items$/);
    expect(token).toBe('token-1');
    expect(errors).toEqual([]);
  });
}

test('register still asks for email verification when the API sends no user', async ({ page }) => {
  await widget(page);
  await page.route('**/api/auth/register', (route) => route.fulfill({ json: { ok: true } }));
  await fill(page, 'en', 'signup');
  await expect(page.getByTestId('challenge')).toBeVisible();
  await submit(page).click();
  await expect(page).toHaveURL(/\/en\/login\?/);
  await expect(submit(page)).toBeEnabled();
  await expect(page.getByText(/verification link/i)).toBeVisible();
});
