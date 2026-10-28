import { expect, test } from 'playwright/test';

// The tag filter used to be `?tag=` read on the server, which kept the whole
// guides hub dynamic: every view paid for a render plus an API hop and the edge
// refused to cache the document. The chips are buttons over local state now, so
// filtering happens in the browser and the URL never moves.
test('guides hub narrows to one tag without touching the query string', async ({ page }) => {
  await page.goto('/en/guides');
  const cards = page.locator('[data-section="guide-list"] h3');
  const total = await cards.count();
  expect(total).toBeGreaterThan(10);

  await page.getByRole('button', { name: 'Economy', exact: true }).click();
  const filtered = await cards.count();
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(total);
  await expect(page).toHaveURL(/\/en\/guides$/);

  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(cards).toHaveCount(total);
});

test('the filter chips carry the translated tag names', async ({ page }) => {
  await page.goto('/vi/guides');
  const cards = page.locator('[data-section="guide-list"] h3');
  const total = await cards.count();
  await page.getByRole('button', { name: 'Kinh tế', exact: true }).click();
  expect(await cards.count()).toBeLessThan(total);
});
