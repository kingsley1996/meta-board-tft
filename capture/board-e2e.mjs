import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:4173';
// Secret lives in the gitignored server/.env — never in the repo.
process.loadEnvFile(new URL('../server/.env', import.meta.url));
const PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD) throw new Error('ADMIN_PASSWORD missing — expected in server/.env');
const OUT = '/tmp/board-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const failures = [];
const check = (label, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures.push(label);
};

// Turn a served comp back into the admin PUT payload shape.
const toPayload = (comp, matchups = []) => ({
  title: comp.title,
  slug: comp.slug,
  tier: comp.tier,
  style: comp.style,
  difficulty: comp.difficulty,
  trend: comp.trend ?? null,
  playstyle: comp.playstyle,
  units: comp.units.map((unit) => ({
    name: unit.name,
    row: unit.row,
    col: unit.col,
    stars: unit.stars,
    items: (unit.items ?? []).map((item) => item.name ?? item),
  })),
  early: comp.early.map((unit) => unit.name),
  carry: comp.carry.name,
  items: comp.items.map((item) => item.name),
  augments: comp.augments.map((augment) => augment.name),
  tips: comp.tips,
  stages: comp.stages.map((stage) => ({ text: stage.text })),
  alt: comp.alt.map((unit) => unit.name),
  playstyleVi: null,
  tipsVi: null,
  matchups,
});

page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));

// Public comp page: positioned board with stars + items
await page.goto(`${BASE}/en/tierlist/comps/ahri-spellweaver`);
await page.waitForSelector('.hex-board', { timeout: 15000 });
const boardCells = await page.locator('.hex-board .hex-board-cell').count();
check(`public board renders 28 cells (got ${boardCells})`, boardCells === 28);
await page.screenshot({ path: `${OUT}/public-comp.png`, fullPage: true });

// Vote button: one click per browser, disables itself
const voteBtn = page.locator('button[aria-label="Mark this comp helpful"]');
await voteBtn.click();
check('vote button disables after voting', await voteBtn.isDisabled());

// Clicking a comp on the tier list opens the panel without jumping to the top
await page.goto(`${BASE}/en/tierlist/comps`);
await page.waitForSelector('[data-section="tierlist"]', { timeout: 15000 });
const cluster = page.locator('a[href="/en/tierlist/comps/tristana-sprykin-reroll"]');
await cluster.evaluate((el) => el.scrollIntoView({ block: 'center' }));
await page.waitForTimeout(100);
const beforeY = await page.evaluate(() => window.scrollY);
check(`pre-click scroll is mid-page (${beforeY})`, beforeY > 100);
await cluster.click();
await page.waitForURL(/\/en\/tierlist\/comps\/tristana-sprykin-reroll/, { timeout: 15000 });
await page.waitForSelector('.hex-board', { timeout: 15000 });
const afterY = await page.evaluate(() => window.scrollY);
const boardTop = await page.locator('.hex-board').first().evaluate((el) => el.getBoundingClientRect().top);
check(`comp click keeps page scrolled (before ${beforeY}, after ${afterY})`, afterY > 0);
check(`expanded comp panel scrolled into view (board top ${Math.round(boardTop)})`, boardTop >= 0 && boardTop < 700);
await page.screenshot({ path: `${OUT}/comp-click-scroll.png` });

// Login
await page.goto(`${BASE}/admin/login`);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/\/admin$/, { timeout: 15000 });
await page.waitForSelector('[data-section="admin-sidebar"]', { timeout: 15000 });
check('admin shell sidebar renders', (await page.locator('[data-section="admin-sidebar"] nav a').count()) === 4);
// Clear leftovers from an earlier interrupted run so creates don't 409.
await page.request.delete(`${BASE}/api/admin/comps/board-test`);
await page.request.delete(`${BASE}/api/admin/guides/e2e-guide`);
await page.screenshot({ path: `${OUT}/admin-overview.png`, fullPage: true });

// New comp through the board editor
await page.goto(`${BASE}/admin/comps/new`);
await page.getByLabel('Title', { exact: true }).fill('Board Test');
await page.getByLabel('Playstyle (one line)').fill('E2E board run');
await page.getByLabel('Early units').fill('Ahri');
await page.locator('[data-pick="Ahri"]').click();
await page.getByLabel('Item priority').fill('Blue Buff');
await page.locator('[data-pick="Blue Buff"]').click();
await page.getByLabel('Augments').fill('Cybernetic Uplink');
await page.locator('[data-pick="Cybernetic Uplink"]').click();
await page.getByLabel('Tips', { exact: true }).fill('E2E board test comp.');
for (const stage of ['Stage 2', 'Stage 3', 'Stage 4']) await page.getByLabel(stage, { exact: true }).fill('E2E stage text.');

// Palette trait filter narrows the champion grid
const paletteBefore = await page.locator('button[title]').count();
await page.getByLabel('Filter by trait').selectOption('Vanguard');
const paletteAfter = await page.locator('button[title]').count();
check(`trait filter narrows palette (${paletteBefore} → ${paletteAfter})`, paletteAfter > 0 && paletteAfter < paletteBefore);
check('trait filter keeps Hecarim', (await page.locator('button[title="Hecarim"]').count()) === 1);
await page.getByLabel('Filter by trait').selectOption('');

await page.locator('button[title="Ahri"]').first().click();
await page.click('button[aria-label="Place at row 2 column 4"]');
await page.locator('button[title="Sett"]').first().click();
await page.click('button[aria-label="Place at row 1 column 1"]');
await page.locator('button[title="Rakan"]').first().click();
await page.click('button[aria-label="Place at row 4 column 7"]');
await page.waitForSelector('button[aria-label="Ahri"]');
const placedCount = await page.locator('.hex-board button[aria-label]:not([aria-label^="Place at"])').count();
check(`placed units on hex board (got ${placedCount})`, placedCount === 3);
check('unit counter shows 3/12', (await page.getByText('3/12 units').count()) === 1);

// Inspector: stars + item + carry
await page.click('button[aria-label="Ahri"]');
await page.getByRole('button', { name: '★★★', exact: true }).click();
await page.locator('button[title="Blue Buff"]').first().click();
await page.getByRole('button', { name: 'Make carry' }).click();
await page.screenshot({ path: `${OUT}/admin-editor.png`, fullPage: true });

// Save
await page.getByRole('button', { name: 'Create comp' }).click();
await page.waitForURL(/\/admin\/comps$/, { timeout: 15000 });

const saved = await page.request.get(`${BASE}/api/comps/board-test`);
check('created comp fetchable', saved.status() === 200);
const comp = await saved.json();
const unit = (comp.units ?? []).find((entry) => entry.name === 'Ahri') ?? {};
check(`unit name/pos saved (${unit.name} ${unit.row}:${unit.col})`, unit.name === 'Ahri' && unit.row === 1 && unit.col === 3);
check(`stars saved (${unit.stars})`, unit.stars === 3);
check(`items saved (${JSON.stringify(unit.items?.map?.((i) => i.name ?? i))})`, JSON.stringify(unit.items?.map?.((i) => i.name ?? i)) === '["Blue Buff"]');
check(`carry saved (${comp.carry?.name})`, comp.carry?.name === 'Ahri');

await page.goto(`${BASE}/en/tierlist/comps/board-test`);
await page.waitForSelector('.hex-board', { timeout: 15000 });
await page.screenshot({ path: `${OUT}/public-board-test.png`, fullPage: true });

// Counters: attach a matchup through the API, check validation + public panel
const boardTest = await (await page.request.get(`${BASE}/api/comps/board-test`)).json();
const putMatchup = await page.request.put(`${BASE}/api/admin/comps/board-test`, {
  data: toPayload(boardTest, [{ slug: 'ahri-spellweaver', kind: 'good' }]),
});
check(`matchup PUT accepted (${putMatchup.status()})`, putMatchup.status() === 200);
const withMatchup = await (await page.request.get(`${BASE}/api/comps/board-test`)).json();
check(`matchup resolved (${withMatchup.matchups?.[0]?.slug})`, withMatchup.matchups?.[0]?.slug === 'ahri-spellweaver' && typeof withMatchup.matchups[0].title === 'string');
const selfMatchup = await page.request.put(`${BASE}/api/admin/comps/board-test`, {
  data: toPayload(boardTest, [{ slug: 'board-test', kind: 'good' }]),
});
check(`self-matchup rejected (${selfMatchup.status()})`, selfMatchup.status() === 400);
await page.goto(`${BASE}/en/tierlist/comps/board-test`);
await page.waitForSelector('.hex-board', { timeout: 15000 });
check('public panel shows matchup section', (await page.getByText('Strong against').count()) > 0);
check('matchup links to the other comp', (await page.locator('a[href="/en/tierlist/comps/ahri-spellweaver"]').count()) > 0);
await page.screenshot({ path: `${OUT}/comp-matchups.png`, fullPage: true });

// Guides: list shows seeded guides, then create → article → edit (vi survives) → delete
await page.goto(`${BASE}/admin/guides`);
await page.waitForSelector('table', { timeout: 15000 });
check('guides table lists seeded guides', (await page.getByText('Economy first').count()) > 0);
await page.screenshot({ path: `${OUT}/admin-guides.png`, fullPage: true });

await page.goto(`${BASE}/admin/guides/new`);
await page.getByLabel('Title', { exact: true }).fill('E2E Guide');
await page.getByLabel('Author').fill('E2E Bot');
await page.getByLabel('Excerpt (one or two lines, shown on cards)').fill('Created by the end-to-end test.');
await page.getByLabel('Tags (comma separated, English keys)').fill('Meta');
await page.getByLabel('Heading (en)').fill('First heading');
await page.getByLabel('Body — one paragraph per line (en)').fill('First paragraph.\nSecond paragraph.');
await page.getByLabel('Bullets — one per line (en, optional)').fill('Bullet one');
await page.getByLabel('Title (vi)').fill('Bài E2E');
await page.getByLabel('Heading (vi)').fill('Tiêu đề một');
await page.getByLabel('Body — one paragraph per line (vi)').fill('Đoạn một.');
await page.screenshot({ path: `${OUT}/admin-guide-form.png`, fullPage: true });
await page.getByRole('button', { name: 'Create guide' }).click();
await page.waitForURL(/\/admin\/guides$/, { timeout: 15000 });

const guideRes = await page.request.get(`${BASE}/api/guides/e2e-guide`);
check('created guide fetchable', guideRes.status() === 200);
const guide = await guideRes.json();
check('guide sections saved', guide.sections?.[0]?.body?.length === 2 && guide.sections?.[0]?.list?.[0] === 'Bullet one');
const guideVi = await (await page.request.get(`${BASE}/api/guides/e2e-guide?lang=vi`)).json();
check(`guide vi title served (${guideVi.title})`, guideVi.title === 'Bài E2E');

await page.goto(`${BASE}/en/guides/e2e-guide`);
await page.waitForSelector('[data-section="article"]', { timeout: 15000 });
check('public guide article renders', (await page.getByText('First paragraph.').count()) > 0);

await page.goto(`${BASE}/admin/guides/e2e-guide/edit`);
await page.getByLabel('Title', { exact: true }).fill('E2E Guide edited');
await page.getByRole('button', { name: 'Save changes' }).click();
await page.waitForURL(/\/admin\/guides$/, { timeout: 15000 });
const editedGuide = await (await page.request.get(`${BASE}/api/guides/e2e-guide`)).json();
check(`guide edit saved (${editedGuide.title})`, editedGuide.title === 'E2E Guide edited');
const editedVi = await (await page.request.get(`${BASE}/api/guides/e2e-guide?lang=vi`)).json();
check(`vi title survives english edit (${editedVi.title})`, editedVi.title === 'Bài E2E');

const delGuide = await page.request.delete(`${BASE}/api/admin/guides/e2e-guide`);
check(`guide cleanup delete (${delGuide.status()})`, delGuide.status() === 200);
check('deleted guide 404', (await page.request.get(`${BASE}/api/guides/e2e-guide`)).status() === 404);

// Database pages: champions index → detail, item + augment filters, tables
await page.goto(`${BASE}/en/champions`);
await page.waitForSelector('a[href="/en/champions/da-gromp18-ap"]', { timeout: 15000 });
check('champions index links to detail', true);
await page.goto(`${BASE}/en/champions/da-gromp18-ap`);
await page.waitForSelector('[data-section="champion-comps"]', { timeout: 15000 });
check('champion detail shows the name', (await page.getByText('Gromp', { exact: true }).count()) > 0);
check('champion detail shows the ability panel', (await page.getByText('Ability').count()) > 0);
await page.screenshot({ path: `${OUT}/champion-detail.png`, fullPage: true });

await page.goto(`${BASE}/en/items?q=Infinity`);
await page.waitForSelector('[data-section="item-grid"]', { timeout: 15000 });
check('item search narrows the grid', (await page.locator('[data-section="item-grid"] > div').count()) < 10 && (await page.getByText('Infinity Edge').count()) > 0);
await page.goto(`${BASE}/en/items?type=component`);
await page.waitForSelector('[data-section="item-grid"]', { timeout: 15000 });
check('component filter returns a smaller set', (await page.locator('[data-section="item-grid"] > div').count()) < 20);

await page.goto(`${BASE}/en/augments?q=Cybernetic`);
await page.waitForSelector('[data-section="augment-grid"]', { timeout: 15000 });
check('augment search works', (await page.getByText('Cybernetic Uplink').count()) > 0);

await page.goto(`${BASE}/en/tables`);
await page.waitForSelector('table', { timeout: 15000 });
check('tables render the shop odds', (await page.getByText('Shop odds by level').count()) > 0 && (await page.locator('table').first().locator('tbody tr').count()) === 11);
await page.screenshot({ path: `${OUT}/tables.png`, fullPage: true });

// Builder share link restores a board
const payload = Buffer.from(JSON.stringify({ u: [['Ahri', 2, 4, 2, ['Blue Buff']]], c: 'Ahri' })).toString('base64url');
await page.goto(`${BASE}/en/builder?b=${payload}`);
await page.waitForSelector('.hex-board', { timeout: 15000 });
check('builder share link restores the board', (await page.getByText('1/12 units').count()) === 1);

// Tier maker: click a champion, click the S row
await page.goto(`${BASE}/en/tier-maker`);
await page.waitForSelector('[data-section="maker-pool"]', { timeout: 15000 });
await page.locator('[data-section="maker-pool"] button[title="Ahri"]').click();
await page.locator('[data-section="maker-tiers"] > div:first-child > div:nth-child(2)').click();
check('tier maker ranks a champion into S', (await page.locator('button[title="Ahri — click to unrank"]').count()) === 1);
await page.screenshot({ path: `${OUT}/tier-maker.png`, fullPage: true });

// Quiz: pick a unit, get scored comps
await page.goto(`${BASE}/en/quiz`);
await page.waitForSelector('button:has-text("Ahri")', { timeout: 15000 });
await page.locator('button:has-text("Ahri")').first().click();
await page.getByRole('button', { name: 'Find comps' }).click();
check('quiz returns a scored comp', (await page.locator('a[href="/en/tierlist/comps/ahri-spellweaver"]').count()) > 0);
await page.screenshot({ path: `${OUT}/quiz.png`, fullPage: true });

// Newsletter: validation, signup, admin list, cleanup
check('invalid email rejected', (await page.request.post(`${BASE}/api/subscribe`, { data: { email: 'nope', lang: 'en' } })).status() === 400);
check('valid email accepted', (await page.request.post(`${BASE}/api/subscribe`, { data: { email: 'e2e-sub@test.dev', lang: 'vi' } })).ok());
await page.goto(`${BASE}/admin/subscribers`);
await page.waitForSelector('table', { timeout: 15000 });
check('admin subscribers list shows the signup', (await page.getByText('e2e-sub@test.dev').count()) > 0);
await page.screenshot({ path: `${OUT}/admin-subscribers.png`, fullPage: true });
check('subscriber cleanup delete', (await page.request.delete(`${BASE}/api/admin/subscribers/e2e-sub%40test.dev`)).status() === 204);

// Admin comps table shows the community counters
await page.goto(`${BASE}/admin/comps`);
await page.waitForSelector('table', { timeout: 15000 });
check('admin comps table has Votes + Views', (await page.getByText('Votes', { exact: true }).count()) > 0 && (await page.getByText('Views', { exact: true }).count()) > 0);

// Guides tag filter
await page.goto(`${BASE}/en/guides?tag=Economy`);
await page.waitForSelector('[data-section="guide-hero"]', { timeout: 15000 });
check('guide tag filter keeps matching guide', (await page.getByText('Economy first').count()) > 0);

// SEO + PWA plumbing
const sitemap = await (await page.request.get(`${BASE}/sitemap.xml`)).text();
check('sitemap lists comps and champions', sitemap.includes('/en/tierlist/comps/ahri-spellweaver') && sitemap.includes('champions/da-gromp18-ap'));
check('robots disallows /admin', (await (await page.request.get(`${BASE}/robots.txt`)).text()).includes('Disallow: /admin'));
const manifest = await page.request.get(`${BASE}/manifest.webmanifest`);
check('manifest is served', manifest.ok() && (await manifest.json()).name.includes('TFTIQ'));
check('service worker is served', (await (await page.request.get(`${BASE}/sw.js`)).text()).includes('skipWaiting'));

// i18n: root picks Vietnamese from Accept-Language; vi pages render localized chrome.
const viContext = await browser.newContext({ locale: 'vi-VN', extraHTTPHeaders: { 'Accept-Language': 'vi-VN,vi;q=0.9' } });
const viPage = await viContext.newPage();
await viPage.goto(`${BASE}/`);
await viPage.waitForURL(/\/vi(\/|$)/, { timeout: 15000 });
check(`root redirects vi visitors (${viPage.url()})`, viPage.url().endsWith('/vi'));
await viPage.goto(`${BASE}/vi/tierlist/comps`);
await viPage.waitForSelector('[data-section="tierlist"]', { timeout: 15000 });
check('vi tier list chrome ("Tìm đội hình")', (await viPage.getByPlaceholder('Tìm đội hình').count()) === 1);
await viPage.goto(`${BASE}/vi/tierlist/items`);
await viPage.waitForSelector('[data-section="tierboard"]', { timeout: 15000 });
check('vi item names on page ("Vô Cực Kiếm")', (await viPage.getByText('Vô Cực Kiếm').count()) > 0);
await viPage.goto(`${BASE}/vi/guides`);
await viPage.waitForSelector('[data-section="guide-hero"]', { timeout: 15000 });
check('vi guides index serves DB translations', (await viPage.getByText('Kinh tế trước tiên').count()) > 0);
await viContext.close();

// Cleanup
const del = await page.request.delete(`${BASE}/api/admin/comps/board-test`);
check(`cleanup delete (${del.status()})`, del.status() === 200);
const gone = await page.request.get(`${BASE}/api/comps/board-test`);
check('deleted comp 404', gone.status() === 404);

await browser.close();
console.log(failures.length ? `FAILURES: ${failures.join(' | ')}` : 'ALL PASS');
process.exit(failures.length ? 1 : 0);
