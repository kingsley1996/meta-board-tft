import { expect, test } from 'playwright/test';

test('tables page groups the loot tables like the tftflow hub', async ({ page }) => {
  await page.goto('/en/tables');

  for (const heading of ['System', 'Traits', 'Augments', 'Items', 'Champions', 'Encounters']) {
    await expect(page.getByRole('heading', { name: heading, exact: false })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'Coven', exact: true })).toHaveAttribute('href', '/en/tables/coven');
});

test('shop odds, pool size and xp live in their own table page, not on the index', async ({ page }) => {
  await page.goto('/en/tables');
  await expect(page.getByText('Shop odds by level')).toHaveCount(0);

  await page.goto('/en/tables/shop-odds-pool-size-xp-table');
  await expect(page.getByText('Shop Odds by Level')).toBeVisible();
  await expect(page.getByText('Champion Pool Size')).toBeVisible();
  await expect(page.getByText('Leveling')).toBeVisible();
});

test('gold income has its own page with the income tables', async ({ page }) => {
  await page.goto('/en/tables');
  await page.getByRole('link', { name: 'Gold income', exact: true }).click();

  await expect(page).toHaveURL(/\/en\/tables\/gold-income$/);
  await expect(page.getByRole('heading', { name: 'Gold income' })).toBeVisible();
  await expect(page.getByText('Base per round')).toBeVisible();
  await expect(page.getByText('Interest (per 10 held, max 5)')).toBeVisible();
});

test('loot assets are served locally, not hotlinked from tftflow', async ({ page }) => {
  await page.goto('/en/tables/coven');

  const remote = await page.evaluate(() =>
    [...document.querySelectorAll('img')]
      .map((img) => img.getAttribute('src') ?? '')
      .filter((src) => src.startsWith('http'))
  );
  expect(remote).toEqual([]);
  expect(await page.locator('img[src^="/tft/loot/"]').count()).toBeGreaterThan(0);
});

test('every loot table page renders without a broken image', async ({ page }) => {
  for (const slug of ['blackthorn', 'carousel-odds', 'expected-unexpectedness', 'coven', 'stage-loot-orbs']) {
    await page.goto(`/en/tables/${slug}`);
    const broken = await page.evaluate(() =>
      [...document.querySelectorAll('img')]
        .filter((img) => img.complete && img.naturalWidth === 0)
        .map((img) => img.getAttribute('src'))
    );
    expect(broken, `broken images on /tables/${slug}`).toEqual([]);
  }
});

test('loot table page renders the weighted outcomes', async ({ page }) => {
  await page.goto('/en/tables/coven');

  await expect(page.getByRole('heading', { name: 'Coven Cashout Tables' })).toBeVisible();
  await expect(page.getByText('Gold Coin').first()).toBeVisible();
  await expect(page.getByText('33.33%').first()).toBeVisible();
});

test('augment odds calculator narrows the next column when a tier is picked', async ({ page }) => {
  await page.goto('/en/tables/augment-odds');

  await expect(page.getByRole('button', { name: 'Gold 65.1%' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gold 47.9%' })).toBeVisible();

  await page.getByRole('button', { name: 'Silver 25.7%' }).click();

  await expect(page.getByRole('button', { name: 'Gold 60.7%' })).toBeVisible();
  await expect(page.getByText(/11.01% of games/)).toBeVisible();
});

test('loot table page has no horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of ['/vi/tables/carousel-odds', '/en/tables/augment-odds']) {
    await page.goto(route);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow, `horizontal overflow on ${route}`).toBe(false);
  }
});
