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

page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));

// Public comp page: positioned board with stars + items
await page.goto(`${BASE}/en/tierlist/comps/ahri-spellweaver`);
await page.waitForSelector('.hex-board', { timeout: 15000 });
const boardCells = await page.locator('.hex-board .hex-board-cell').count();
check(`public board renders 28 cells (got ${boardCells})`, boardCells === 28);
await page.screenshot({ path: `${OUT}/public-comp.png`, fullPage: true });

// Login
await page.goto(`${BASE}/admin/login`);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/\/admin$/, { timeout: 15000 });

// New comp through the board editor
await page.goto(`${BASE}/admin/comps/new`);
await page.getByLabel('Title').fill('Board Test');
await page.getByLabel('Playstyle (one line)').fill('E2E board run');
await page.getByLabel('Early units').fill('Ahri');
await page.getByLabel('Item priority (one per line)').fill('Blue Buff');
await page.getByLabel('Augments (one per line)').fill('Cybernetic Uplink');
await page.getByLabel('Tips').fill('E2E board test comp.');
for (const stage of ['Stage 2', 'Stage 3', 'Stage 4']) await page.getByLabel(stage).fill('E2E stage text.');

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
await page.waitForURL(/\/admin$/, { timeout: 15000 });

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
await viContext.close();

// Cleanup
const del = await page.request.delete(`${BASE}/api/admin/comps/board-test`);
check(`cleanup delete (${del.status()})`, del.status() === 200);
const gone = await page.request.get(`${BASE}/api/comps/board-test`);
check('deleted comp 404', gone.status() === 404);

await browser.close();
console.log(failures.length ? `FAILURES: ${failures.join(' | ')}` : 'ALL PASS');
process.exit(failures.length ? 1 : 0);
