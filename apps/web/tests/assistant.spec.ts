import { expect, test } from 'playwright/test';

test('statistics question answers with MetaBoard stats', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/en/assistant');
  await page.getByRole('textbox', { name: /ask about/i }).fill('What is Ahri win rate?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  // Stats change with every meta.json refresh — assert the shape (a MetaBoard
  // stat line with a percentage), not exact numbers.
  await expect(page.getByText(/MetaBoard.*\d+(\.\d+)?%/s).first()).toBeVisible({ timeout: 75_000 });
});

test('comp page opens the assistant with comp context', async ({ page }) => {
  await page.goto('/en/tierlist/comps/ahri-spellweaver');
  await page.getByRole('link', { name: 'Ask about this comp' }).click();

  await expect(page).toHaveURL(/\/en\/assistant\?comp=ahri-spellweaver$/);
  await expect(page.getByText('Asking about Ahri & Morgana Blossom')).toBeVisible();
});

test('conversation list shows a delete action and new chat has a plus icon', async ({ page }) => {
  const conversation = {
    id: '11111111-1111-4111-8111-111111111111',
    client_id: 'e2e',
    lang: 'en',
    title: 'Ahri question',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  let deleted = '';
  await page.route('**/api/assistant/conversations', (route) => route.fulfill({ json: { conversations: [conversation] } }));
  await page.route('**/api/assistant/conversations/*', (route) => {
    if (route.request().method() === 'DELETE') {
      deleted = route.request().url();
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { conversationId: conversation.id, messages: [] } });
  });

  await page.goto('/en/assistant');

  const newChat = page.getByRole('button', { name: 'New chat' });
  await expect(newChat).toBeVisible();
  // The label still carries the accessible name, so the icon cannot break it.
  await expect(newChat.locator('svg')).toBeVisible();

  const row = page.getByRole('button', { name: 'Delete conversation: Ahri question' });
  await expect(row).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await row.click();

  await expect(page.getByRole('button', { name: 'New chat' })).toBeVisible();
  await expect(row).toHaveCount(0);
  expect(deleted).toContain(conversation.id);
});

test('mobile assistant has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/vi/assistant');
  await expect(page).toHaveTitle(/Coach AI/);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow).toBe(false);
});
