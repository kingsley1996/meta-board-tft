// Chùa: sáu lỗi người dùng báo sau lượt QA trên prod, kiểm bằng hai trình duyệt thật.
//
// Hai context riêng vì mỗi context có cookie riêng → hai hàng khách riêng → hai id riêng
// (một context mở hai tab sẽ bị máy chủ đá, đúng theo thiết kế của ws.ts).
import { test, expect, type BrowserContext, type Page } from 'playwright/test';

const HUD_TIMEOUT = 150_000;

test.describe.configure({ mode: 'serial' });
test.setTimeout(420_000);

async function openTemple(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto('/vi/temple');
  await page.waitForSelector('#hud', { timeout: HUD_TIMEOUT });
  return page;
}

// Số trên HUD phải đúng bằng số người thật đang đứng trong chánh điện.
test('số người online đúng theo người thật, tăng khi vào và giảm khi rời trang', async ({ browser }) => {
  const a = await openTemple(await browser.newContext());
  await expect(a.locator('#tOnline')).toHaveText(/1 đang online/);

  const b = await openTemple(await browser.newContext());
  await expect(a.locator('#tOnline')).toHaveText(/2 đang online/, { timeout: 20_000 });
  await expect(b.locator('#tOnline')).toHaveText(/2 đang online/);

  // Rời trang phải rời phòng ngay: nếu không thì avatar còn đứng đó tới khi heartbeat
  // 30s sau mới bị gỡ và con số đếm thừa một người.
  await b.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect(a.locator('#tOnline')).toHaveText(/1 đang online/, { timeout: 20_000 });
});

// Hồ sơ: chỗ đổi tên + bảng chọn nhân vật (máy trước không có cả hai).
test('đổi tên và chọn nhân vật trong Hồ sơ', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await openTemple(ctx);
  const me = await page.evaluate(async () => (await (await fetch('/api/temple/me')).json()).profile.playerId as number);
  const state = async (): Promise<{ name: string; hero: string }> =>
    page.evaluate(async () => {
      const r = (await (await fetch('/api/temple/state')).json()) as { state: { name: string; appearance: Record<string, string> } };
      return { name: r.state.name, hero: r.state.appearance.hero };
    });

  const before = await state();
  expect(before.hero).toBeTruthy();
  expect(before.name).toBeTruthy();

  await page.locator('#meChip').click();
  const sheet = page.locator('.sheet');
  await expect(sheet.getByRole('heading', { name: 'Hồ sơ' })).toBeVisible();
  await expect(sheet.locator('.hero-card')).toHaveCount(12);

  // Bảng hồ sơ mở tại chỗ sau khi đổi tên — người đổi tên thường đổi luôn nhân vật.
  await sheet.locator('input').fill('Đồng Tu Một');
  await sheet.getByRole('button', { name: 'Đổi tên' }).click();
  await expect(sheet.getByRole('button', { name: 'Đổi tên' })).toBeDisabled();
  await expect.poll(state, { timeout: 20_000 }).toEqual({ ...before, name: 'Đồng Tu Một' });
  await expect(page.locator('#meChip')).toContainText('Đồng Tu Một');

  const other = page.locator('.hero-card').filter({ hasText: 'Zoro' }).first();
  await other.click();
  await expect.poll(state, { timeout: 20_000 }).toEqual({ name: 'Đồng Tu Một', hero: 'zoro' });
  await expect(page.locator('.hero-card.on')).toContainText('Zoro');

  // id không có trong HERO_LIST thì máy chủ khước từ, không lưu bừa.
  const bad = await page.evaluate(async () => (await fetch('/api/temple/profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ appearance: { hero: 'songoku' } }),
  })).status);
  expect(bad).toBe(400);
  expect(me).toBeGreaterThan(0);
});

// Nhắn tin và lời mời kết bạn phải tự hiện lên ở máy người kia.
test('chat và lời mời kết bạn báo cho người kia', async ({ browser }) => {
  const a = await openTemple(await browser.newContext());
  const b = await openTemple(await browser.newContext());
  const idIn = (page: Page) => page.evaluate(async () => (await (await fetch('/api/temple/me')).json()).profile.playerId as number);
  const [ida, idb] = [await idIn(a), await idIn(b)];

  const call = (page: Page, path: string, body: unknown) =>
    page.evaluate(
      async ([p, b]) => (await fetch(`/api/temple${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).status,
      [path, body] as [string, unknown],
    );

  expect(await call(b, '/friends', { id: ida, action: 'add' })).toBe(200);
  await expect(a.locator('.toast')).toContainText('muốn kết bạn đồng tu', { timeout: 10_000 });

  expect(await call(a, '/friends', { id: idb, action: 'accept' })).toBe(200);
  await expect(b.locator('.toast')).toContainText('đã đồng ý kết bạn đồng tu', { timeout: 10_000 });

  expect(await call(b, '/dms', { id: ida, text: 'A Di Đà Phật' })).toBe(200);
  await expect(a.locator('.toast')).toContainText('đã nhắn cho bạn', { timeout: 10_000 });
});

// Màn chờ: thanh tiến độ chạy bằng transform (compositor) và màn chờ mờ dần thay vì cắt cứng.
test('loading trôi và màn chờ mờ dần', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('**/vi/temple', async (route) => {
    const res = await route.fetch();
    const html = (await res.body().then((b) => b.toString('utf8'))).replace(
      '</head>',
      '<script>window.__p=[];const o=CSSStyleDeclaration.prototype.setProperty;' +
        'CSSStyleDeclaration.prototype.setProperty=function(k,v){if(k==="--p")window.__p.push(String(v));return o.call(this,k,v)};' +
        'new MutationObserver(()=>{const l=document.querySelector("#loader");if(l&&l.classList.contains("out"))window.__out=1}).observe(document.documentElement,{childList:1,subtree:1,attributes:1,attributeFilter:["class"]});</script></head>',
    );
    await route.fulfill({ response: res, body: html });
  });
  await page.goto('/vi/temple');
  await page.waitForSelector('#hud', { timeout: HUD_TIMEOUT });

  const seen = await page.evaluate(() => (window as unknown as { __p?: string[]; __out?: number }).__p ?? []);
  const pct = seen.filter((v) => !Number.isNaN(parseFloat(v))).map((v) => parseFloat(v));
  expect(pct.length).toBeGreaterThanOrEqual(3);
  expect(pct[0]).toBeLessThan(pct[pct.length - 1]);
  expect(await page.evaluate(() => (window as unknown as { __out?: number }).__out ?? 0)).toBe(1);

  // Luật CSS thật của thanh chờ (bám `.loader .bar i`), kiểm bằng cách dựng đúng cấu
  // trúc đó trong #temple-root rồi đọc computed style.
  const transition = await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'loader';
    host.innerHTML = '<div class="bar"><i></i></div>';
    document.getElementById('temple-root')!.appendChild(host);
    const t = getComputedStyle(host.querySelector('i')!).transitionProperty;
    host.remove();
    return t;
  });
  expect(transition).toContain('transform');
  // màn chờ đã qua thì không còn lý do ở lại DOM.
  expect(page.locator('#loader .bar i')).toHaveCount(0);
});
