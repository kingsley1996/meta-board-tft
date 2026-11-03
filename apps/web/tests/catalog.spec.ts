import { expect, test } from 'playwright/test';

// The two boards the Set menu got this round: the trait catalog and the encounter pool.
test('the trait list shows every trait with its ladder and its carrier count', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en/traits');

  await expect(page.getByRole('heading', { name: 'Traits', level: 1 })).toBeVisible();
  await expect(page.getByText('36 of 36 traits')).toBeVisible();

  const cards = page.locator('[data-section="trait-grid"] a');
  await expect(cards).toHaveCount(36);
  // Elderwood is the long ladder: five breakpoints and seven champions carry it.
  const elderwood = page.getByRole('link', { name: /Elderwood/ });
  await expect(elderwood.getByText('7 champions')).toBeVisible();
  await expect(elderwood.getByText('11')).toBeVisible();
  await expect(elderwood).toHaveAttribute('href', '/en/traits/da-18-elderwood');

  await page.goto('/vi/traits');
  await expect(page.getByRole('heading', { name: 'Tộc hệ', level: 1 })).toBeVisible();
  const thanRung = page.getByRole('link', { name: /Thần Rừng/ });
  await expect(thanRung).toBeVisible();
  await expect(thanRung.getByText('7 tướng')).toBeVisible();

  await page.goto('/en/traits?q=brawler');
  await expect(cards).toHaveCount(1);
  await page.goto('/en/traits?q=nothing-matches-this');
  await expect(page.getByText('No trait matches that search.')).toBeVisible();
});

test('the encounter board lists the pool with the odds of each one', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en/encounters');

  await expect(page.getByRole('heading', { name: 'Encounters', level: 1 })).toBeVisible();
  await expect(page.getByText('20 of 20 encounters')).toBeVisible();

  const cards = page.locator('[data-section="encounter-grid"] > div');
  await expect(cards).toHaveCount(20);
  // Sorted by odds, so the commonest roll leads and the rarest sits last.
  await expect(cards.first()).toContainText('2 Cost Start');
  await expect(cards.first()).toContainText('6.82%');
  await expect(cards.last()).toContainText('Prismatic Party');
  await expect(cards.last()).toContainText('2.27%');

  // The bar is a share of the biggest slot in the pool, not a raw percentage.
  const bar = cards.first().locator('.bg-brand');
  expect(((await bar.boundingBox())!.width / ((await cards.first().locator('.bg-util').boundingBox())!.width - 0.01))).toBeGreaterThan(0.95);

  // Only the encounters with a table of their own get the link.
  await expect(page.getByRole('link', { name: /Loot table/ })).toHaveCount(1);
  // The words are the game's, and the fetch source stays in the crawler.
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/tftips|encounter-boards/i);

  await page.goto('/vi/encounters');
  await expect(page.getByRole('heading', { name: 'Kỳ ngộ', level: 1 })).toBeVisible();
  await expect(page.getByText('Khởi Đầu Với Tướng 2 Vàng')).toBeVisible();
  // The anvil's own name, not the sentence that mentions it.
  await expect(page.getByText('Đe Linh Kiện', { exact: true })).toBeVisible();

  // The search reads the effect line too, so the forge shows up with the two anvil slots.
  await page.goto('/en/encounters?q=anvil');
  await expect(cards).toHaveCount(3);
});
