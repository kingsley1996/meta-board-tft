import { expect, test } from 'playwright/test';

// The All ranks / Master+ switch was a `?rank=` link, so every toggle was a
// server round-trip that also held the whole champion route dynamic. Both blocks
// ship in the document now and the switch is state, which is what these prove.
test('champion stats switch rank without a navigation', async ({ page }) => {
  await page.goto('/en/champions/da-18-ahri');
  const panel = page.locator('[data-section="champion-stats"]');
  const avg = panel.locator('div.grid > div').first().locator('p').first();
  const allRanks = (await avg.textContent())?.trim() ?? '';
  expect(allRanks).toMatch(/^\d+\.\d\d$/);

  const navigations: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'document') navigations.push(request.url());
  });

  await page.getByRole('button', { name: 'Master+', exact: true }).click();
  await expect(avg).not.toHaveText(allRanks);
  await expect(page.getByRole('button', { name: 'Master+', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(navigations).toHaveLength(0);
  await expect(page).toHaveURL(/\/en\/champions\/da-18-ahri$/);

  await page.getByRole('button', { name: 'All ranks', exact: true }).click();
  await expect(avg).toHaveText(allRanks);
});

test('the rank blocks are in the document, not fetched when the tab is clicked', async ({ page }) => {
  const response = await page.goto('/en/champions/da-18-ahri');
  const html = (await response!.body()).toString();
  expect(html).toContain('data-section="champion-stats"');
  expect(html).toContain('All ranks');
  expect(html).toContain('Master+');
});
