import { expect, test } from 'playwright/test';
import { readFileSync } from 'node:fs';

// A patch article is generated from Riot's own rows, so the browser check is about the
// wiring, not the prose: the URL carries the patch number Riot prints (`18.6`, or a hotfix
// like `18.5c`, not the store's `patch-18-5c`), a hotfix Riot folded into the 18.5 article is
// an article of its own here, the card counts are read off those rows instead of a summary
// typed next to them, and the Vietnamese headings must be Riot's translation rather than ours.

const LIST = '[data-section="patch-list"]';
const PBE = '[data-section="pbe-preview"]';
const ARTICLE = '[data-section="patch-article"]';
const CARD = '[data-section="patch-highlights"]';

// The preview board, the preview page and the patch the list opens first all come out of the
// data files the crawler writes, so which number they name — and how many entities a tab counts —
// moves with every refresh. This file reads them from those files instead of pinning them here.
const pbeDoc = JSON.parse(readFileSync('packages/shared/data/pbe.json', 'utf8')) as {
  // Null when the test build measures the patch that already shipped: the crawler names a
  // preview only off a diff that has something unreleased in it.
  patch: string | null;
  baseline: { patch: string };
  rows: { kind: string; ref: string }[];
  added: { kind: string; ref: string }[];
  removed: { kind: string; ref: string }[];
  editorial: { kind: string; name: string }[];
};
const livePatch = (JSON.parse(readFileSync('packages/shared/data/patch-notes.json', 'utf8')) as {
  livePatch: string;
}).livePatch;
// The window the match counts were measured over. It belongs to a stats provider that re-cuts
// its board after a release, so it can sit a patch behind `livePatch` — which is exactly the
// case this file has to keep honest about.
const statsPatch = (JSON.parse(readFileSync('packages/shared/data/meta.json', 'utf8')) as {
  source: { patch: string };
}).source.patch;

// The same arithmetic the page runs: a tab counts the separate things that moved, so an entity
// whose two stats changed is one entity, and an entity that only appeared still counts.
const pbeAllRows = [...pbeDoc.rows, ...pbeDoc.added, ...pbeDoc.removed];
const pbeEntities = (kind: string) =>
  new Set(pbeAllRows.filter((row) => row.kind === kind).map((row) => row.ref)).size;
const pbeChanges = (list: 'added' | 'removed', kind: string) =>
  pbeDoc[list].filter((row) => row.kind === kind).length;
// The store keeps the article under its own slug, so a request here answers whether Riot has
// shipped the patch the diff names. A diff that names no patch has nothing to ask about.
const articleApi = (patch: string) => `/api/guides/patch-${patch.replace(/\./g, '-')}?lang=en`;

test('the list gives every proven hotfix its own card, newest first', async ({ page }) => {
  await page.goto('/en/patches');
  const cards = page.locator(`${LIST} a`);
  // The live patch Riot published, the two updates they wrote into 18.5, and the same pair
  // one patch earlier.
  expect(await cards.evaluateAll((links) => links.map((link) => link.getAttribute('href')))).toEqual([
    `/en/patches/${livePatch}`,
    '/en/patches/18.5c',
    '/en/patches/18.5b',
    '/en/patches/18.5',
    '/en/patches/18.4b',
    '/en/patches/18.4',
  ]);
  await expect(page.getByText('Latest', { exact: true })).toHaveCount(1);

  // The counts live on the card because the rows travel in the same payload — and they are
  // the counts of this entry alone: the 27th's rows belong to 18.5c now.
  const base = cards.filter({ hasText: '18.5' }).last();
  await expect(base).toContainText(/19 buffs/i);
  await expect(base).toContainText(/17 nerfs/i);
  await expect(base).toContainText(/34 adjustments/i);

  // A hotfix card shows only the rows of its own day, and one nerf is one nerf: the chip is
  // its own element, so it reads "1 Nerf" where the patch below it would say "17 Nerfs".
  const hotfix = cards.filter({ hasText: '18.5b' });
  await expect(hotfix.getByText('1 Nerf', { exact: true })).toHaveCount(1);
  await expect(hotfix.getByText('6 Adjustments', { exact: true })).toHaveCount(1);
  await expect(hotfix.getByText(/1 Nerfs/i)).toHaveCount(0);
});

test('a row shows which entities moved, not only how many', async ({ page }) => {
  await page.goto('/en/patches');
  const rows = page.locator(`${LIST} a`);

  // The 27th wrote six lines about four things, two of them champions, so the row draws four
  // faces and the reader never has to open the article to learn whether *their* champion changed.
  const hotfix = rows.filter({ hasText: '18.5c' });
  expect(await hotfix.locator('img').count()).toBe(4);
  await expect(hotfix.locator('[data-tip^="champion:"]')).toHaveCount(2);
  // The radiant item is its own face next to the plain one Riot named the same change after.
  await expect(hotfix.locator('img[src$="/tft5-item-handofjusticeradiant.png"]')).toHaveCount(1);

  // A line holds twelve cells; past that the row clips the wall and says how much it clipped,
  // while the chip in front still counts every row of the patch: 19 buffs, twelve shown, +4.
  const base = rows.filter({ hasText: '18.5' }).last();
  // The chip is lowercased by CSS, so the DOM still carries Riot's capitalisation.
  await expect(base.getByText('19 Buffs', { exact: true })).toBeVisible();
  await expect(base.getByText('+4', { exact: true })).toBeVisible();
  // Champions are read by face, so all twenty-one that moved stay faces — never one "21 champions".
  await expect(base.locator('[data-tip^="champion:"]')).toHaveCount(21);
  await expect(base.getByText('21 champions')).toHaveCount(0);

  // The dashed preview row earns its place only while there is something unreleased to name,
  // and the store has no article for the number it names. Otherwise the board would print that
  // number twice, or print one Riot has not printed yet — so the row goes, and returns on its
  // own with the next PBE cycle.
  const preview = pbeDoc.patch;
  const shipped = preview !== null && (await page.request.get(articleApi(preview))).ok();
  if (preview && !shipped) {
    const panel = page.locator(PBE);
    await expect(panel.getByText(preview, { exact: true })).toBeVisible();
    await expect(panel.locator('a')).toHaveCount(1);
    await expect(panel.locator('a')).toHaveAttribute('href', `/en/patches/${preview}`);
  } else {
    await expect(page.locator(PBE)).toHaveCount(0);
  }
});

test('a card opens the article at the patch number Riot prints', async ({ page }) => {
  await page.goto('/en/patches');
  await page.locator(`${LIST} a`).first().click();
  await expect(page).toHaveURL(new RegExp(`/en/patches/${livePatch.replace(/\./g, '\\.')}$`));
  await expect(page.locator('h1')).toContainText(livePatch);
});

test('the highlight card names entities instead of counting kinds', async ({ page }) => {
  await page.goto('/en/patches/18.5');
  await expect(page.locator(`${CARD} h2`)).toHaveText('Highlights');

  // A count of a kind tells a reader nothing, so every kind gets its own row of faces. Eleven
  // buffed champions are eight of their faces plus a `+3` that says how many the row clipped —
  // never one cell reading "11 champions". The face and the name under it are two anchors for
  // one cell, so a champion is counted by her tile, not by her links.
  for (const label of ['champions', 'traits', 'items', 'augments', 'wisps']) {
    await expect(page.locator(CARD).getByText(new RegExp(`^\\d+ ${label}$`))).toHaveCount(0);
  }
  // 11 buffed (clipped to 8) + 4 nerfed + 6 adjusted champions, each drawn once per bucket.
  expect(await page.locator(`${CARD} [data-tip^="champion:"]`).count()).toBe(18);
  await expect(page.locator(`${CARD} a[href="/en/champions/da-18-caitlyn"]`).first()).toBeVisible();
  await expect(page.locator(`${CARD} a[href="/en/champions/da-18-azir"]`).first()).toBeVisible();
  await expect(page.locator(CARD).getByText('+3', { exact: true })).toBeVisible();
  await expect(page.locator(CARD).getByText('+6', { exact: true })).toBeVisible();
  // The kinds that used to fold are drawn like any other: three buffed augments and the one wisp
  // Riot added each get a face, and the kind label in front says what they are.
  await expect(page.locator(`${CARD} a[href="/en/augments/tft-augment-cookingpot"]`)).toHaveCount(2);
  await expect(page.locator(`${CARD} [data-tip^="augment:"]`)).not.toHaveCount(0);
  await expect(page.locator(`${CARD} [data-tip^="trait:"]`)).not.toHaveCount(0);
});

test('the tab row filters the article to one kind of entity', async ({ page }) => {
  await page.goto('/en/patches/18.5');
  const tabs = page.getByRole('group', { name: 'Every change' });
  await expect(tabs).toBeVisible();
  // A tab counts the things that moved, not the lines they wrote: twenty augments, twenty-three
  // lines of the article's tables.
  await expect(tabs.getByRole('button', { name: 'champions 16' })).toBeVisible();
  await expect(tabs.getByRole('button', { name: 'augments 20' })).toBeVisible();
  // A kind with nothing in it still gets its tab, reading zero and staying off, so the reader
  // learns "nothing here moved" instead of wondering whether the page forgot to look.
  await expect(tabs.getByRole('button', { name: 'emblems 0' })).toBeDisabled();
  await expect(tabs.getByRole('button', { name: 'encounters 0' })).toBeDisabled();

  // The article opens on the first kind that has rows, and every other block is out of the way.
  // One table entry is one entity, the way Riot's own list reads: sixteen champions, twenty-seven
  // stat lines, so an entry whose ability moved twice says its name once.
  const body = page.locator('[data-kind-filter]');
  await expect(body).toHaveAttribute('data-kind-filter', 'champion');
  expect(await body.locator('li[data-kind="champion"]').count()).toBe(16);
  expect(await body.locator('li[data-kind="champion"]:visible').count()).toBe(16);
  expect(await body.locator('li[data-kind="champion"] .diff-new').count()).toBe(27);
  // Alune moved three times and is named once: one icon, one link to its page, three lines.
  const alune = body.locator('li[data-kind="champion"]').filter({ hasText: 'Alune' });
  await expect(alune).toHaveCount(1);
  expect(await alune.locator('.diff-new').count()).toBe(3);
  expect(await alune.locator('a[href^="/en/champions/"]').count()).toBe(2);
  // The three lines are rows of one column pair: each field starts under the entity's own name
  // and every new value ends at the same edge, so the numbers of one entity read down a ruler.
  const lines = alune.locator('[data-change-line]');
  expect(await lines.count()).toBe(3);
  const nameBox = await alune.locator('a[href^="/en/champions/"]').nth(1).boundingBox();
  const rightEdges = new Set<number>();
  for (const line of await lines.all()) {
    const field = await line.locator('span').first().boundingBox();
    const value = await line.locator('.diff-new').boundingBox();
    if (!nameBox || !field || !value) throw new Error('the entry has no measurable box');
    expect(Math.round(field.x)).toBe(Math.round(nameBox.x));
    rightEdges.add(Math.round(value.x + value.width));
  }
  expect(rightEdges.size).toBe(1);
  expect(await body.locator('li[data-kind="augment"]:visible').count()).toBe(0);
  // A block whose rows all belong to another kind takes its heading along with them.
  expect(await page.locator('h2:visible').filter({ hasText: 'AUGMENTS' }).count()).toBe(0);

  await tabs.getByRole('button', { name: 'augments 20' }).click();
  await expect(body).toHaveAttribute('data-kind-filter', 'augment');
  expect(await body.locator('li[data-kind="augment"]:visible').count()).toBe(20);
  expect(await body.locator('li[data-kind="augment"] .diff-new').count()).toBe(23);
  expect(await body.locator('li[data-kind="champion"]:visible').count()).toBe(0);
  await expect(page.locator('h2:visible').filter({ hasText: 'AUGMENTS' })).toHaveCount(1);
});

// The preview page only has a URL while the feed has an unreleased patch to name and the store
// has no article for it: the moment Riot ships, the real article takes the same address. So the
// test asks the store first and says what it skipped, and every number it then checks comes from
// the same file the page reads rather than from a snapshot of one particular diff.
test('the preview page reads as a preview while its patch is unreleased', async ({ page }) => {
  if (pbeDoc.patch === null) {
    test.skip(true, 'the PBE feed measures the patch that already shipped, so there is no preview number');
    return;
  }
  const preview = pbeDoc.patch;
  test.skip(
    (await page.request.get(articleApi(preview))).ok(),
    `${preview} has an article in the store, so the preview branch has no URL to render`,
  );

  await page.goto(`/en/patches/${preview}`);
  await expect(page.locator('h1')).toContainText(preview);
  await expect(page.locator(ARTICLE)).toContainText(`PBE · ${pbeDoc.baseline.patch}`);
  await expect(page.locator(ARTICLE)).toContainText('Not final');
  // Riot has published no article for it, so the page cites none.
  expect(await page.locator(`${ARTICLE} a[href*="leagueoflegends"]`).count()).toBe(0);

  // The same engine as a released article, run on the diff: the card counts off the rows, the
  // entities are faces, and the kinds the build did not touch read zero and stay off.
  await expect(page.locator(CARD)).toBeVisible();
  const tabs = page.getByRole('group', { name: 'Every change' });
  const tabLabels: Record<string, string> = {
    champion: 'champions',
    trait: 'traits',
    item: 'items',
    augment: 'augments',
    wisp: 'wisps',
  };
  for (const [kind, label] of Object.entries(tabLabels)) {
    const count = pbeEntities(kind);
    const tab = tabs.getByRole('button', { name: `${label} ${count}` });
    if (count) await expect(tab).toBeVisible();
    else await expect(tab).toBeDisabled();
  }

  // An augment that only exists on the test build has no before/after number, so its row states
  // what happened where a moved stat would print its two values.
  const augments = pbeEntities('augment');
  if (augments) {
    await tabs.getByRole('button', { name: `augments ${augments}` }).click();
    await expect(page.locator('li[data-kind="augment"]').filter({ hasText: 'addition' })).toHaveCount(
      pbeChanges('added', 'augment'),
    );
    await expect(page.locator('li[data-kind="augment"]').filter({ hasText: 'removal' })).toHaveCount(
      pbeChanges('removed', 'augment'),
    );
  }

  // A row whose numbers did not move, only its sentence, is neither a buff nor a nerf.
  if (pbeDoc.editorial.length) {
    await expect(page.locator(ARTICLE)).toContainText('Only the words changed');
    await expect(page.locator(ARTICLE)).toContainText(pbeDoc.editorial[0].name);
  }
});

test('a hotfix article carries the rows the base article no longer has', async ({ page }) => {
  await page.goto('/en/patches/18.5c');
  const row = page.locator('li').filter({ hasText: '230/310/450 AP' }).first();
  // One entry for Kha'Zix, both of the values Riot moved under it.
  expect(await row.locator('.diff-old').count()).toBe(2);
  await expect(row.locator('.diff-old').first()).toHaveText('250/345/500');
  await expect(row.locator('.diff-new').first()).toHaveText('230/310/450 AP');
  // The tone is the direction, so the colour of the new value is data, not decoration.
  await expect(row.locator('.diff-new').first()).toHaveAttribute('data-tone', 'hard');
  await expect(row.locator('[data-tip^="champion:"]')).toHaveCount(1);
  // Riot wrote this block into the 18.5 article on the 27th, and the page says so.
  await expect(page.locator(ARTICLE)).toContainText('Mid-patch update of 18.5');

  // A radiant item is its own entity: Riot named the change after the plain item, and the
  // article answers with the radiant art and the radiant page, next to the plain row it sits by.
  await expect(page.locator('li').filter({ hasText: 'Radiant Omnivamp' })).toHaveCount(1);
  await expect(
    page.locator('img[src$="/tft5-item-handofjusticeradiant.png"]').first(),
  ).toBeVisible();
  await expect(
    page.locator('a[href="/en/items/tft5-item-handofjusticeradiant"]').first(),
  ).toBeVisible();

  await page.goto('/en/patches/18.5');
  await expect(page.locator('li').filter({ hasText: '230/310/450 AP' })).toHaveCount(0);
  // The RADIANT ITEMS block is drawn from the radiant entries, not their base items.
  const radiant = page.locator('li[data-kind="item"]').filter({ hasText: 'Radiant Adaptive Helm' });
  await expect(radiant).toHaveCount(1);
  expect(await radiant.locator('.diff-new').count()).toBe(2);
  expect(await radiant.locator('img[src$="/tft5-item-adaptivehelmradiant.png"]').count()).toBe(1);
  // An item icon is a square, so it gets the square slot the item pages and the comp board use.
  // A hexagon would clip the corners, and on a radiant item those corners are the glow that
  // tells it apart from the plain item Riot named the change after.
  const items = page.locator('li[data-kind="item"]');
  expect(await items.locator('.hex').count()).toBe(0);
  expect(await items.locator('[class*="rounded-[22%]"]').count()).toBe(2);
});

test('the day Riot wrote becomes the reader’s own date', async ({ page }) => {
  // One block, headed by the day rather than by an entity kind: the day is what the reader of
  // a hotfix is looking for, and Riot writes it as their heading.
  await page.goto('/en/patches/18.5c');
  await expect(page.locator(`${ARTICLE} h2`)).toHaveText(['Highlights', 'October 27']);

  await page.goto('/vi/patches/18.5c');
  await expect(page.locator(`${ARTICLE} h2`)).toHaveText(['Tiêu điểm', '27/10']);
  await expect(page.locator(ARTICLE)).toContainText('Giữa bản vá 18.5');
  await expect(page.locator(`${ARTICLE} p`).filter({ hasText: '27/10/2026' }).first()).toBeVisible();
});

test('the Vietnamese article uses Riot’s own group names and date', async ({ page }) => {
  await page.goto('/vi/patches/18.5');
  const headings = page.locator(`${ARTICLE} h2`);
  await expect(headings.filter({ hasText: 'TỘC/HỆ' })).not.toHaveCount(0);
  await expect(headings.filter({ hasText: 'TINH LINH' })).not.toHaveCount(0);
  await expect(headings.filter({ hasText: 'CHAMPIONS' })).toHaveCount(0);
  await expect(page.locator(`${ARTICLE} p`).filter({ hasText: '20/10/2026' }).first()).toBeVisible();
});

test('a patch without an article is a 404, not an empty page', async ({ page }) => {
  expect((await page.request.get('/en/patches/18.1')).status()).toBe(404);
  // A letter nobody can prove is not an article: 18.5a shipped, but no TFT number moved with it.
  expect((await page.request.get('/en/patches/18.5a')).status()).toBe(404);
  // A board with nothing unreleased names no patch, so it must not have built a page for one.
  expect((await page.request.get('/en/patches/null')).status()).toBe(404);
});

test('switching locale keeps the reader on the same patch', async ({ page }) => {
  await page.goto('/en/patches/18.5c');
  await page.click('[data-section="lang-switch"] a[href^="/vi"]');
  await expect(page).toHaveURL(/\/vi\/patches\/18\.5c$/);
  await expect(page.locator('h1')).toContainText('18.5c');
});

test('the patch bar opens the article for the version the game runs', async ({ page }) => {
  // The bar used to land on the list; now it goes straight to the article for the patch Riot
  // has released, which is the number the nav chip and the bar both print.
  await page.goto('/en/augments');
  const bar = page.locator(`main a[href="/en/patches/${livePatch}"]`).first();
  await expect(bar).toBeVisible();
  await bar.click();
  await expect(page).toHaveURL(new RegExp(`/en/patches/${livePatch.replace(/\./g, '\\.')}$`));

  // And the list is still one tap away: the breadcrumb carries the section, so a reader who
  // landed on a hotfix can walk back through the patch ladder. The ladder has one row per
  // article in the store, which is a question for the API rather than a number typed here.
  await page.locator('nav[aria-label="Breadcrumb"] a[href="/en/patches"]').click();
  await expect(page).toHaveURL(/\/en\/patches$/);
  const stored = (await (await page.request.get('/api/guides?lang=en&kind=patch_notes')).json()) as {
    guides: unknown[];
  };
  expect(await page.locator(`${LIST} a`).count()).toBe(stored.guides.length);
});

test('the chrome names the release and the numbers name the window they cover', async ({ page }) => {
  // A release lands before the stats provider re-cuts its board, so the two numbers differ for
  // a few days. The version a reader recognises goes in the nav and the bar; the window travels
  // with the match counts it measured, on the pages built out of them.
  await page.goto('/en/tierlist/map');
  await expect(page.locator('[data-section="nav"]')).toContainText(livePatch);
  const window = page.locator('main').filter({ hasText: `patch ${statsPatch}` });
  await expect(window.first()).toBeVisible();
});

test('a phone-width article has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // The list is the row layout, where a wall of hexes is the thing most likely to push out.
  await page.goto('/vi/patches');
  const listWidths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(listWidths.scroll).toBe(listWidths.client);

  await page.goto('/vi/patches/18.5');
  await expect(page.locator(`${ARTICLE}`)).toBeVisible();
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBe(widths.client);

  // The newest article is the one whose rows move with every refresh, so it gets measured too.
  await page.goto(`/vi/patches/${livePatch}`);
  await expect(page.locator(`${ARTICLE}`)).toBeVisible();
  const liveWidths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(liveWidths.scroll).toBe(liveWidths.client);

  // A stat name is never cut to "Base…" so the pair of numbers can keep its line: at phone
  // width the field takes the line and the values follow it on the same row or the next one.
  await page.goto('/en/patches/18.5c');
  const khazix = page.locator('li[data-kind="champion"]').filter({ hasText: "Kha'Zix" });
  expect(await khazix.locator('[data-change-line]').count()).toBe(2);
  await expect(khazix.locator('[data-change-line] > span').first()).toHaveText('Base Damage');
  await expect(khazix.locator('.diff-new').first()).toHaveText('230/310/450 AP');
});

test('the sitemap publishes the articles under the patch number', async ({ page }) => {
  const xml = await (await page.request.get('/sitemap.xml')).text();
  expect(xml).toContain('/en/patches');
  expect(xml).toContain('/en/patches/18.5c');
  expect(xml).toContain('/vi/patches/18.5');
  // The patch the game is on is listed whether its URL came from the store or from the diff
  // file, and the set in front of that loop keeps it on the page exactly once.
  expect(xml).toContain(`/en/patches/${livePatch}`);
  expect(xml.split(`/en/patches/${livePatch}`)).toHaveLength(2);
});
