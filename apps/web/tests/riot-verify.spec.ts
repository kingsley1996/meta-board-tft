import { expect, test } from 'playwright/test';

// Riot's domain check reads /<locale>/riot.txt and expects the code and
// nothing else. A redirect, a locale cookie write or the 404 page all fail it.
const TOKEN = '42758374-4a6f-42d9-b9c0-eeec248018ae';

test('riot.txt answers with the verification code alone', async ({ request }) => {
  for (const lang of ['en', 'vi']) {
    const res = await request.get(`/${lang}/riot.txt`, { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/plain');
    expect(await res.text()).toBe(TOKEN);
  }
});
