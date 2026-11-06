// Chùa: sáu lỗi người dùng báo sau lượt QA trên prod, kiểm bằng hai trình duyệt thật.
//
// Hai context riêng vì mỗi context có cookie riêng → hai hàng riêng → hai id riêng
// (một context mở hai tab sẽ bị máy chủ đá, đúng theo thiết kế của ws.ts).
//
// Màn chờ giờ hỏi người chơi trước khi tự cấp phiên khách, nên bài nào vào đền cũng phải
// bấm "Vào với tư cách khách" trước khi #hud xuất hiện. Bài nào chạm tuyến ghi (đổi tên,
// kết bạn, tặng quà) phải dùng tài khoản thật: khách bị máy chủ chặn bằng 403
// guest_account_required (apps/api/src/temple/http.ts:withAccount) — đó là chủ ý.
import { test, expect, type BrowserContext, type Page } from 'playwright/test';

// Nối tiếp nhau vì bài đếm người online so số tuyệt đối (1 rồi 2): chạy song song là
// hai bài khác nhét thêm người vào cùng một phòng.
test.describe.configure({ mode: 'serial' });
// Cảnh 3D khởi động bằng swiftshader mất hàng chục giây mỗi lần vào trang.
test.setTimeout(420_000);

const HUD_TIMEOUT = 150_000;
const PW = 'temple-e2e-password';
// Một lần chạy một bộ hàng mới: quan hệ bạn bè và quà còn sót từ lần trước sẽ làm lệch
// các phát hiện bên dưới (add trên cặp đã accepted trả 409).
const RUN = Date.now().toString(36);

async function openTemple(ctx: BrowserContext, opts: { account?: string } = {}): Promise<Page> {
  const page = await ctx.newPage();
  if (opts.account) {
    const email = `temple-e2e-${opts.account}-${RUN}@example.com`;
    const r = await page.request.post('/api/auth/register', { data: { email, password: PW, name: `Đồng Tu ${opts.account}`, lang: 'vi' } });
    expect(r.ok(), `register ${opts.account}: ${r.status()}`).toBe(true);
  }
  await page.goto('/vi/temple');
  await reveal(page);
  return page;
}

// Có phiên thì đền mở thẳng, chưa có thì màn chờ hiện hai nút — cả hai đường đều về #hud.
async function reveal(page: Page): Promise<void> {
  await page.waitForSelector('#hud, .loader-acts', { timeout: HUD_TIMEOUT });
  if (await page.locator('.loader-acts').isVisible()) {
    await page.getByRole('button', { name: 'Vào với tư cách khách' }).click();
  }
  await page.waitForSelector('#hud', { timeout: HUD_TIMEOUT });
}

const idOf = (page: Page) => page.evaluate(async () => (await (await fetch('/api/temple/me')).json()).profile.playerId as number);

// Hồ sơ đền của một tài khoản mới mang tên tự sinh (identity.ts:guestName), không phải
// tên lúc đăng ký, nên muốn tìm hàng của một người trong bảng thì phải đọc tên đền.
const nameOf = (page: Page) => page.evaluate(async () => (await (await fetch('/api/temple/state')).json()).state.name as string);

// Gọi REST bằng đúng cookie của context đang kiểm, không dựng thêm một nguồn định danh.
const call = (page: Page, path: string, body: unknown) =>
  page.evaluate(
    async ([p, b]) => (await fetch(`/api/temple${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).status,
    [path, body] as [string, unknown],
  );

// Số trên HUD phải đúng bằng số người thật đang đứng trong chánh điện.
//
// So bằng mốc tương đối chứ không phải số tuyệt đối: hàng khách của lần chạy trước vẫn
// còn trong phòng tới khi nhịp heartbeat (~30s) gỡ đi, và dev thì có người thật vào ra.
// Một bài kiểm "1 đang online" sẽ fail vì những người không liên quan tới bài.
const countOnline = (page: Page) => async () => {
  const m = (await page.locator('#tOnline').innerText()).match(/\d+/);
  return m ? Number(m[0]) : Number.NaN;
};

// "Lặng" là hai lần đọc cách nhau 6s ra cùng một số; lấy mốc giữa lúc phòng đang gỡ
// người thừa thì mọi phép cộng/trừ sau đều lệch.
async function settledCount(page: Page): Promise<number> {
  let n = Number.NaN;
  await expect
    .poll(
      async () => {
        const first = await countOnline(page)();
        await page.waitForTimeout(6_000);
        n = await countOnline(page)();
        return first === n ? 1 : 0;
      },
      { timeout: 120_000, intervals: [1_000] },
    )
    .toBe(1);
  return n;
}

test('số người online đúng theo người thật, tăng khi vào và giảm khi rời trang', async ({ browser }) => {
  const a = await openTemple(await browser.newContext());
  const base = await settledCount(a);
  expect(base).toBeGreaterThanOrEqual(1);

  const b = await openTemple(await browser.newContext());
  await expect.poll(countOnline(a), { timeout: 30_000 }).toBe(base + 1);
  await expect.poll(countOnline(b), { timeout: 30_000 }).toBe(base + 1);

  // Rời trang phải rời phòng ngay: nếu không thì avatar còn đứng đó tới khi heartbeat
  // 30s sau mới bị gỡ và con số đếm thừa một người.
  await b.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect.poll(countOnline(a), { timeout: 30_000 }).toBe(base);
});

// Hồ sơ: chỗ đổi tên + bảng chọn nhân vật (máy trước không có cả hai).
test('đổi tên và chọn nhân vật trong Hồ sơ', async ({ browser }) => {
  const page = await openTemple(await browser.newContext(), { account: 'ho' });
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
  const bad = await page.evaluate(async () => {
    const r = await fetch('/api/temple/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appearance: { hero: 'songoku' } }),
    });
    return r.status;
  });
  expect(bad).toBe(400);
});

// Quà, lời chúc và lời mời kết bạn phải tự hiện lên ở máy người kia — thẻ giữa lề phải,
// bấm vào mở đúng bảng. Tin nhắn riêng (/dms) cũng có push nhưng HUD chưa có hộp thư
// nên chưa có gì trên màn hình để kiểm ở đây.
test('tặng bùa, chúc phúc và lời mời kết bạn báo cho người kia', async ({ browser }) => {
  const a = await openTemple(await browser.newContext(), { account: 'an' });
  const b = await openTemple(await browser.newContext(), { account: 'binh' });
  const [ida, idb, nameA, nameB] = [await idOf(a), await idOf(b), await nameOf(a), await nameOf(b)];

  expect(await call(a, '/greetings', { id: idb, kind: 'huong', text: '' })).toBe(200);
  const giftNotice = b.locator('.notice').filter({ hasText: 'Bùa May Mắn' });
  await expect(giftNotice).toBeVisible({ timeout: 10_000 });
  await expect(giftNotice).toContainText(nameA);

  // Bấm thẻ là phải tới đúng nơi, không phải tới một cái bảng bất kỳ.
  await giftNotice.click();
  await expect(b.locator('.tabs button.on')).toContainText('Quà tặng');
  await expect(b.locator('.wish-card').filter({ hasText: nameA }).first()).toBeVisible();
  await b.locator('.sheet .x').click();

  // /greetings có nhịp 3s/người (apps/api/src/temple/social.ts), chờ đúng nhịp đó.
  await a.waitForTimeout(3200);
  expect(await call(a, '/greetings', { id: idb, kind: 'chuc', text: 'Gặp dữ hoá lành' })).toBe(200);
  await expect(b.locator('.notice').filter({ hasText: 'Gặp dữ hoá lành' })).toBeVisible({ timeout: 10_000 });

  // Một chiều mời thì người được mời mới là người thấy thẻ; máy người gửi không có lý do
  // gì để tự thông báo cho chính mình. (Các thẻ quà phía trên vẫn còn trên màn hình trong
  // 8s nên chỉ đếm riêng thẻ kết bạn.)
  expect(await call(b, '/friends', { id: ida, action: 'add' })).toBe(200);
  await expect(a.locator('.notice').filter({ hasText: 'muốn kết bạn với bạn' })).toBeVisible({ timeout: 10_000 });
  await expect(b.locator('.notice').filter({ hasText: 'kết bạn' })).toHaveCount(0);

  // Lời mời chưa được đồng ý thì chưa phải bạn: thẻ phải dẫn tới hàng chờ có nút Đồng ý.
  await a.locator('.notice').filter({ hasText: 'muốn kết bạn với bạn' }).click();
  await expect(a.locator('.tabs button.on')).toContainText('Bạn');
  const invite = a.locator('.friend-row').filter({ hasText: nameB });
  await expect(invite).toBeVisible();
  await invite.getByRole('button', { name: 'Đồng ý' }).click();

  // Phía kia phải nghe được cái gật đầu, và hai chiều đã accepted nên không còn lời mời nào.
  await expect(b.locator('.notice').filter({ hasText: 'đã chấp nhận lời mời kết bạn' })).toBeVisible({ timeout: 10_000 });
  await expect(a.locator('.friend-row').filter({ hasText: nameB }).locator('button')).toHaveCount(0);
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
  await reveal(page);

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

// Boot fail (mạng khựng đúng lúc xin phiên) thì màn chờ phải nói được lý do và cho bấm
// lại tại chỗ, thay vì đứng mãi ở "Đang mở sảnh…" hoặc bắt tải cả trang.
test('vào sảnh thất bại thì màn chờ có nút thử lại', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let blocked = true;
  await page.route('**/api/temple/guest', async (route) => (blocked ? route.abort('failed') : route.fallback()));

  await page.goto('/vi/temple');
  await page.waitForSelector('.loader-acts', { timeout: HUD_TIMEOUT });
  await page.getByRole('button', { name: 'Vào với tư cách khách' }).click();
  await expect(page.getByRole('heading', { name: 'Chưa vào được sảnh' })).toBeVisible({ timeout: 30_000 });

  blocked = false;
  // "Thử lại" hỏi lại phiên: chưa có cookie nào nên màn chờ quay về hai lựa chọn, và
  // lần bấm khách thứ hai mới thật sự vào sảnh.
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await reveal(page);
  // Phòng phải nối thật chứ không riêng cảnh 3D: con số có thể thừa vì người của các
  // test trước còn đang heartbeat, nhưng bằng 0 nghĩa là máy chủ chưa cho vào phòng.
  await expect(page.locator('#tOnline')).toHaveText(/[1-9]\d* đang online/, { timeout: 20_000 });
});

// Thẻ một đạo hữu phải nằm trong khung .modal-card: mọi rule của nó (rộng 420px, nền
// phủ, lời chúc một hàng) gắn với selector .modal-card:has(.pcard), nên mount trần là
// card tràn khắp màn hình như một bản không có CSS.
test('thẻ người chơi mở trong khung modal của bản gốc', async ({ browser }) => {
  const a = await openTemple(await browser.newContext(), { account: 'long' });
  const b = await openTemple(await browser.newContext(), { account: 'phong' });
  const [ida, idb] = [await idOf(a), await idOf(b)];
  // Mời hai chiều là đủ: server tự ghi accepted khi thấy lời mời ngược chiều
  // (apps/api/src/temple/social.ts:64-92), nên không có bước "accept" riêng để bấm.
  expect(await call(a, '/friends', { id: idb, action: 'add' })).toBe(200);
  expect(await call(b, '/friends', { id: ida, action: 'add' })).toBe(200);

  await a.locator('.side-menu button[title="Đồng đội"]').click();
  await a.locator('.friend-row').first().click();

  const frame = a.locator('.modal:has(.pcard) .modal-card');
  await expect(frame).toBeVisible();
  const box = await frame.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(460);
  // Nền phủ phải có: không thì người chơi bấm xuyên xuống chánh điện.
  expect(await a.locator('.modal:has(.pcard)').evaluate((n) => getComputedStyle(n).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');

  await a.locator('.pcard-x').click();
  await expect(a.locator('.modal:has(.pcard)')).toHaveCount(0);
});
