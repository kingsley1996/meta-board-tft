import { expect, test, type Page } from 'playwright/test';
import { compVariants, type VariantComp } from '../lib/variants.ts';

// The detail page eases its tier row under the sticky bars for about a second
// after paint. A scrollY read taken mid-glide is wherever the animation
// happened to be passing, so compare only once the page has held still.
async function scrollAtRest(page: Page) {
  let prev = -1;
  let steady = 0;
  for (let i = 0; i < 60; i++) {
    const y = await page.evaluate(() => window.scrollY);
    steady = y === prev ? steady + 1 : 0;
    prev = y;
    if (steady >= 3) return y;
    await page.waitForTimeout(100);
  }
  return prev;
}

// The rail, the toolbar buttons and the tile sizes are read off one comp page;
// which comp is not the point of those tests, so the slug can stay named.
const detail = '/en/tierlist/comps/veigar-blackthorn';
const bar = '[data-section="comp-toolbar"]';

// The tests about variant tabs resolve their fixture from the payload instead of
// naming a slug. The board is re-cut every patch, and at 18.5c Veigar Blackthorn
// became an X-flagged single: its carry group went empty, the tab bar collapsed to
// one tab, and every assertion about it failed as though the page had broken.
type BoardComp = VariantComp & {
  style: string;
  difficulty: number;
  cover: { kind: 'item' | 'augment'; name: string } | null;
  flex: { name: string; replaces?: { name: string } }[];
  alt: { name: string; items: string[] }[];
};

const hrefOf = (comp: { slug: string }) => `/en/tierlist/comps/${comp.slug}`;

async function boardComps(page: Page): Promise<BoardComp[]> {
  const body = await (await page.request.get('/api/comps?lang=en')).json();
  return (body.comps ?? body) as BoardComp[];
}

// Every group the board carries, in the order the reader meets them: one entry
// per variant set, each sorted the way the tab strip sorts it (tier first, then
// title), so tabs.nth(i) is group[i].
function variantGroups(comps: BoardComp[]): BoardComp[][] {
  const groups: BoardComp[][] = [];
  const seen = new Set<string>();
  for (const comp of comps) {
    const group = compVariants(comps, comp.slug);
    if (group.length < 2 || seen.has(group[0].slug)) continue;
    seen.add(group[0].slug);
    groups.push(group);
  }
  return groups;
}

// A pair split across two tiers, so a glide would move the page a visible amount
// and "the tab swap did not move it" is a claim about the glide rather than about
// two rows that happened to sit side by side.
const pairedGroup = (comps: BoardComp[]) => variantGroups(comps).find((group) => group[0].tier !== group[1].tier);

test('the toolbar lists the carry variants and each tab is its own comp page', async ({ page }) => {
  const comps = await boardComps(page);
  const group = pairedGroup(comps);
  expect(group, 'the board needs a two-tab variant group in two different tiers').toBeTruthy();
  const [lead, sibling] = group!;
  await page.goto(hrefOf(lead));
  const tabs = page.locator(`${bar} nav a`);
  await expect(tabs).toHaveCount(group!.length);
  await expect(tabs.first()).toHaveAttribute('aria-current', 'page');
  // Tier first, like the reference site, so a variant reads as its own ranked
  // comp rather than a colourless alias of the one on screen.
  for (const [index, comp] of group!.entries()) {
    await expect(tabs.nth(index).locator('span').first()).toHaveText(comp.tier);
    await expect(tabs.nth(index).getByText(comp.title)).toBeVisible();
  }

  // The bar heads the content column: inside the panel card, to the right of
  // the 300px rail — not a strip across the top of the whole detail.
  const panel = page.locator('[data-section="comp-panel"]');
  await expect(panel.locator(bar)).toHaveCount(1);
  const railBox = (await panel.locator('> aside').boundingBox())!;
  expect((await panel.locator(bar).boundingBox())!.x).toBeGreaterThan(railBox.x + 300);

  await tabs.nth(1).click();
  await expect(page).toHaveURL(new RegExp(hrefOf(sibling) + '$'));
  await expect(page.locator('h1')).toContainText(sibling.title);
});

// Picking a comp from the tier rows glides that row under the sticky bars. A
// tab swap must not: the reader is already inside the detail, and the two
// variants sit in different tiers here, so a glide would move the page a lot.
test('a variant tab swaps the comp in place instead of gliding to its tier row', async ({ page }) => {
  const comps = await boardComps(page);
  const group = pairedGroup(comps);
  expect(group, 'the board needs a two-tab variant group in two different tiers').toBeTruthy();
  const [lead, sibling] = group!;
  await page.goto(hrefOf(lead));
  const tabs = page.locator(`${bar} nav a`);
  await tabs.first().scrollIntoViewIfNeeded();
  const before = await scrollAtRest(page);

  await tabs.nth(1).click();
  await expect(page).toHaveURL(new RegExp(hrefOf(sibling) + '$'));
  await expect(page.locator('h1')).toContainText(sibling.title);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

// The names view is read from localStorage. The flip lasts a frame or two, so
// only a per-frame sample of the switch catches a mount that renders the
// default view first — the board rows change width and height when it does.
async function watchNamesSwitch(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__switch = [] as string[];
    const tick = () => {
      const on = document.querySelector<HTMLElement>('[role="switch"][title]');
      if (on) w.__switch.push(on.getAttribute('aria-checked') ?? '');
      w.__switchSampler = requestAnimationFrame(tick);
    };
    tick();
  });
}

async function readNamesSwitch(page: Page) {
  return page.evaluate(() => {
    const w = window as any;
    cancelAnimationFrame(w.__switchSampler);
    return [...new Set(w.__switch as string[])];
  });
}

// The board buckets comps into one row per tier, and a variant group shows only
// its lead — which lead depends on the payload the route carries. Read the rows
// from the live DOM at the moment of the click; a snapshot taken before one can
// name a comp the board has since grouped away.
async function tierRows(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-tier-row]')].map((row) => ({
      tier: row.getAttribute('data-tier-row') ?? '',
      top: Math.round(row.getBoundingClientRect().top + window.scrollY),
      hrefs: [...new Set([...row.querySelectorAll('a[href*="/tierlist/comps/"]')].map((a) => a.getAttribute('href') ?? ''))].filter(Boolean),
    }))
  );
}

// A click dispatched from the page rather than by Playwright: Playwright first
// scrolls the link into view, which is a real move of the page and would be
// counted as the glide the test is looking for.
const clickHref = (page: Page, href: string) =>
  page.evaluate((target) => document.querySelector<HTMLAnchorElement>(`a[href="${target}"]`)?.click(), href);

// A second pick from the row already holding the detail does not move the board
// while the reader is sitting on that row's landing spot: the glide would drag
// the comp they just clicked out of view. Away from the landing spot, with the
// panel out of sight, the same pick does glide. A pick in another row always
// glides, and the test picks a row deep enough that "landed" and "did not move"
// are different numbers.
test('a second comp in the row already on its landing spot swaps in place', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  // Names-off is a saved setting, not the default. The detail route remounts the
  // explorer, so a mount that paints the default first shows the other board
  // view for a frame — the rows change width mid-load, and the glide then
  // measures against a layout that has already moved.
  await page.addInitScript(() => localStorage.setItem('comps-show-names', '0'));
  await page.goto('/en/tierlist/comps');
  // The server cannot read the saved view, so the first paint of a fresh load is
  // the default one. Wait that out; the claim is about the comp click, which is
  // a client-side transition and never re-renders the other view.
  await expect(page.getByRole('switch', { name: 'Comp names' })).toHaveAttribute('aria-checked', 'false');

  const open = (await tierRows(page)).find((row) => row.hrefs.length >= 2 && row.top > 250);
  expect(open, 'the board needs a deep tier row holding two comps').toBeTruthy();
  const first = open!.hrefs[0];

  await watchNamesSwitch(page);
  await clickHref(page, first);
  // The glide only starts once the detail has mounted. Polling scrollY before it
  // exists reads a steady 0 and hands back "the page never moved".
  await expect(page.locator('[data-section="comp-detail"]')).toHaveCount(1);
  const landed = await scrollAtRest(page);
  expect(await readNamesSwitch(page), 'the saved names view must not flash the default one').toEqual(['false']);
  expect(landed).toBeGreaterThan(0);
  await page.waitForTimeout(2000);

  const after = await tierRows(page);
  const live = after.find((row) => row.hrefs.includes(first));
  const second = live?.hrefs.find((href) => href !== first);
  const other = after.find((row) => row.tier !== live?.tier && row.top > 250 && row.hrefs.length)?.hrefs[0];
  expect(second, 'the row must still hold a second comp once the detail is open').toBeTruthy();
  expect(other, 'the board needs a second deep row to glide to').toBeTruthy();

  // Still on the row's landing spot, a swap must not shift the page a pixel.
  await clickHref(page, second!);
  await expect(page).toHaveURL(new RegExp(second + '$'));
  await expect(page.locator('[data-section="comp-detail"]')).toHaveCount(1);
  expect(await scrollAtRest(page)).toBe(landed);

  // The reader's own case: they scrolled back up to the board, so the swap has
  // to bring the row and the panel hanging under it back into view. Leaving them
  // at the top showed them a comp they had not asked for.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await clickHref(page, first);
  await expect(page.locator('[data-section="comp-detail"]')).toHaveCount(1);
  expect(await scrollAtRest(page)).toBe(landed);

  // A different row is a different landing spot, so the glide still runs.
  await clickHref(page, other!);
  expect(await scrollAtRest(page)).toBeGreaterThan(0);
});

// The other half of the same rule. A phone row wraps to several lines, so its
// panel begins below the fold and landing the row cannot reveal it; gliding
// there would only slide the comp the reader tapped out of view, so the board
// holds its position and the reader scrolls to the panel themselves.
test('a pick inside a row taller than the screen leaves the board still', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/tierlist/comps');
  const rows = await tierRows(page);
  const open = rows.find((row) => row.hrefs.length >= 2 && row.top > 300);
  expect(open, 'the board needs a deep tier row holding two comps').toBeTruthy();

  await clickHref(page, open!.hrefs[0]);
  await expect(page.locator('[data-section="comp-detail"]')).toHaveCount(1);
  const landed = await scrollAtRest(page);
  expect(landed).toBeGreaterThan(0);
  // scrollAtRest stops at the first steady read, which the easing can hand it
  // mid-flight. The exemption below is only reached once a glide has finished,
  // so wait out the settle passes before judging where the next pick lands.
  await page.waitForTimeout(2000);
  // Which row holds a comp changes once the detail is open, so the second pick
  // comes from the board as it now stands.
  const live = (await tierRows(page)).find((row) => row.hrefs.includes(open!.hrefs[0]));
  const second = live?.hrefs.find((href) => href !== open!.hrefs[0]);
  expect(second, 'the row must still hold a second comp once the detail is open').toBeTruthy();
  const panelTop = await page.evaluate(() =>
    Math.round(document.querySelector('[data-section="comp-detail"]')!.getBoundingClientRect().top)
  );
  // The claim is only about a row whose panel does not fit under the bars.
  expect(panelTop, 'the phone row must wrap tall enough to push its panel off screen').toBeGreaterThan(844 - 180);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await clickHref(page, second!);
  await expect(page.locator('[data-section="comp-detail"]')).toHaveCount(1);
  expect(await scrollAtRest(page)).toBe(0);
});

// The other locale is the same page translated, so switching keeps the reader in
// place. The router's default scroll-to-top yanked them back to the header with
// the comp panel left far below, and no glide could bring it into view because
// the row already holds the detail.
test('switching language holds the page still with a comp open', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto('/en/tierlist/comps');
  const href = (await tierRows(page)).find((row) => row.top > 250 && row.hrefs.length)?.hrefs[0];
  expect(href, 'the board needs a comp deep enough to glide to').toBeTruthy();

  await clickHref(page, href!);
  await expect(page.locator('[data-section="comp-detail"]')).toHaveCount(1);
  const landed = await scrollAtRest(page);
  expect(landed).toBeGreaterThan(0);

  await page.click('[data-section="lang-switch"] a[href^="/vi"]');
  await expect(page).toHaveURL(new RegExp(href!.replace('/en/', '/vi/') + '$'));
  await expect(page.locator('[data-section="comp-detail"]')).toHaveCount(1);
  const after = await scrollAtRest(page);
  // A translated title can shift the row a couple of pixels, and the effect may
  // settle that; what must not happen is the walk back to the top.
  expect(Math.abs(after - landed), 'the locale switch moved the reader off the panel').toBeLessThanOrEqual(6);

  // The panel still hangs from the row parked under the pinned bars.
  const gap = await page.evaluate(() => {
    const panel = document.querySelector('[data-section="comp-detail"]');
    const row = panel?.previousElementSibling;
    const bottom = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().bottom ?? 0;
    const stack = Math.max(bottom('[data-section="nav"]'), bottom('[data-section="menu"]'));
    return row ? Math.round(row.getBoundingClientRect().top - stack) : NaN;
  });
  expect(Math.abs(gap)).toBeLessThanOrEqual(6);
});

// The same remount that yanked the scroll position also dropped the filters the
// reader had set on the board: one locale switch and a list narrowed to a handful
// of comps was back at its full length, re-flowing under a pointer still over a
// card. Style values and carry names are the same strings in both locales, so the
// count is comparable across the switch.
test('the board filters survive a locale switch', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  const comps = await boardComps(page);
  // A pair of filters that genuinely narrows the board today: a carry both
  // locales spell the same way, plus the style one of those comps carries.
  const matched = comps.filter((comp) => comp.title.toLowerCase().includes('ahri'));
  expect(matched.length, 'the board needs a comp named after Ahri').toBeGreaterThan(0);
  const styleName = matched[0].style ?? 'All';

  await page.goto('/en/tierlist/comps');
  const search = page.getByRole('searchbox', { name: 'Search comps' });
  const styleSelect = page.getByLabel('Comp style');
  const cards = page.locator('[data-section="tierlist"] a[href^="/en/tierlist/comps/"]');
  const total = await cards.count();
  await styleSelect.selectOption(styleName);
  await search.fill('ahri');
  await expect.poll(() => cards.count(), { message: 'the two filters have to reach the board' }).toBeLessThan(total);
  const narrowed = await cards.count();
  expect(narrowed).toBeGreaterThan(0);

  await page.click('[data-section="lang-switch"] a[href^="/vi"]');
  await expect(page).toHaveURL(/\/vi\/tierlist\/comps$/);
  await expect(page.getByRole('searchbox', { name: 'Tìm đội hình' })).toHaveValue('ahri');
  await expect(page.getByLabel('Lối chơi')).toHaveValue(styleName);
  await expect(page.locator('[data-section="tierlist"] a[href^="/vi/tierlist/comps/"]')).toHaveCount(narrowed);
});

// The mirror of that rule: a comp detail never inherits the list's text filter.
// A query that no longer matches the open comp would filter out its tier row, and
// with no row the panel has nowhere to sit — so the detail always opens plain.
test('a comp detail opens the whole board even when the list was filtered', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto('/en/tierlist/comps');
  const search = page.getByRole('searchbox', { name: 'Search comps' });
  const cards = page.locator('[data-section="tierlist"] a[href^="/en/tierlist/comps/"]');
  const total = await cards.count();
  await search.fill('ahri');
  await expect.poll(() => cards.count(), { message: 'the query has to reach the board' }).toBeLessThan(total);
  const href = (await cards.first().getAttribute('href'))!;

  await clickHref(page, href);
  await expect(page).toHaveURL(new RegExp(href + '$'));
  await expect(page.locator('[data-section="comp-detail"]')).toHaveCount(1);
  await expect(page.getByRole('searchbox', { name: 'Search comps' })).toHaveValue('');
  expect(await cards.count(), 'the detail board carries every comp, not the filtered few').toBeGreaterThan(10);
});

// The tierlist pins both bars, so the stack a glide lands under is header plus
// menu. A row that ends up inside that band reads as cut off mid-selection.
test('the row a comp lands in sits clear of the pinned bars', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en/tierlist/comps');
  const rows = page.locator('[data-section="tierlist"] > div');
  const deep = await rows.last().locator('a[href^="/en/tierlist/comps/"]').first().getAttribute('href');
  await page.goto(deep!);

  await scrollAtRest(page);
  const stack = await page.evaluate(() => {
    const bottom = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().bottom ?? 0;
    return Math.max(bottom('[data-section="nav"]'), bottom('[data-section="menu"]'));
  });
  expect(stack).toBeGreaterThan(100);
  const landed = page.locator('[data-section="tierlist"] > div').filter({ has: page.locator('[data-section="comp-panel"]') }).first();
  expect((await landed.boundingBox())!.y).toBeGreaterThanOrEqual(stack - 2);
});

// The strip is the one place a reader identifies each carry by its art, so at
// desktop widths it runs at the 62.25px ceiling and the item plate under it
// scales with the tile instead of staying a fixed 16px chip.
test('the team strip grows its hexes and item plates on a large screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(detail);
  const strip = page.locator('[data-section="team-strip"]');
  const tile = strip.locator('a').first();
  expect((await tile.boundingBox())!.width).toBeCloseTo(62.25, 1);

  const items = strip.locator('span[data-tip^="item:"]');
  await expect(items.first()).toBeVisible();
  expect((await items.first().boundingBox())!.width).toBeGreaterThanOrEqual(16);

  await page.setViewportSize({ width: 390, height: 844 });
  // The tile carries `smooth`, so its width eases across the breakpoint change.
  await expect.poll(async () => (await tile.boundingBox())!.width).toBeCloseTo(54, 0);
});

test('a variant group holds one slot on the tier board', async ({ page }) => {
  const comps = await boardComps(page);
  const group = variantGroups(comps)[0];
  expect(group, 'the board needs a carry with more than one comp').toBeTruthy();
  const [lead, sibling] = group!;
  await page.goto('/en/tierlist/comps');
  const board = page.locator('[data-section="tierlist"]');
  const switcher = page.getByRole('switch', { name: 'Comp names' });
  const leadLink = board.locator(`a[href="${hrefOf(lead)}"]`);
  await expect(switcher).toHaveAttribute('aria-checked', 'true');
  await expect(leadLink).toHaveCount(1);
  // The sibling is not a second avatar; it is the second tab of this one.
  await expect(board.locator(`a[href="${hrefOf(sibling)}"]`)).toHaveCount(0);
  await expect(leadLink).toHaveAttribute('aria-label', new RegExp(`includes ${group!.length - 1} other variant`));

  // The board holds one slot per group in either view, so the avatar-only mode
  // is the same comp link with a different body rather than a new row.
  await switcher.click();
  await expect(switcher).toHaveAttribute('aria-checked', 'false');
  await expect(leadLink).toHaveCount(1);
  await expect(leadLink).toHaveClass(/rounded-lg/);
  await switcher.click();

  // Opening a sibling by its own URL adds no second avatar anywhere: the detail
  // sits under the group's slot — the lead's row — and that avatar is the lit one.
  await page.goto(hrefOf(sibling));
  const slotRow = page
    .locator('[data-section="tierlist"] > div')
    .filter({ has: page.locator('[data-section="comp-detail"]') });
  await expect(board.locator(`a[aria-label^="${sibling.title}"]`)).toHaveCount(0);
  const slotLead = slotRow.locator(`a[aria-label^="${lead.title}"]`);
  await expect(slotLead).toHaveCount(1);
  await expect(slotLead).toHaveClass(/ring-brand/);
  await expect(page.locator('h1')).toContainText(sibling.title);
});

test('a comp with no siblings keeps its own tab so the bar never collapses', async ({ page }) => {
  const comps = await boardComps(page);
  // A carry that stands alone: not an X flag (those keep their own rail slot by
  // rule), simply the only comp on the board with this carry.
  const solo = comps.find((comp) => !comp.situational && !compVariants(comps, comp.slug).length);
  expect(solo, 'the board needs a comp whose carry has no sibling').toBeTruthy();
  await page.goto(hrefOf(solo!));
  const tabs = page.locator(`${bar} nav a`);
  await expect(tabs).toHaveCount(1);
  await expect(tabs.first()).toHaveAttribute('aria-current', 'page');
});

test('the rail wears the comp cover, and flex units read as pairs', async ({ page }) => {
  const comps = await boardComps(page);
  // Whichever comp is the most dressed-up one this patch: the cover column, the
  // hand-mapped flex pairs and the alt builds all travel independently.
  const comp = comps.find((candidate) => candidate.cover && candidate.flex.length && candidate.alt.length);
  expect(comp, 'the board needs a comp with a cover, a flex pair and an alt build').toBeTruthy();
  await page.goto(hrefOf(comp!));
  await expect(page.locator(`[data-section="comp-cover"] [data-tip="${comp!.cover!.kind}:${comp!.cover!.name}"]`)).toBeVisible();

  const pairs = page.locator('[data-section="flex-units"] a');
  await expect(pairs).toHaveCount(comp!.flex.length);
  await expect(pairs.first()).toHaveAttribute('aria-label', `${comp!.flex[0].name} replaces ${comp!.flex[0].replaces?.name}`);
  // The big hex is the unit coming in; the corner hex is the one it swaps.
  await expect(pairs.first().locator('[data-tip^="champion:"]')).toHaveCount(2);

  const alts = page.locator('[data-section="alt-builds"] a');
  await expect(alts).toHaveCount(comp!.alt.length);
  await expect(alts.first().locator('span[data-tip^="item:"]')).toHaveCount(comp!.alt[0].items.length);
});

// The difficulty chip fills itself in its level's colour, and that tone has to
// live in the chip's own class list: Tailwind sorts these utilities alphabetically
// by token, so a fill written over the plain `bg-util` loses the cascade and the
// chip silently stays grey. Computed style is the only read that proves it painted.
test('the difficulty chip fills in its level colour', async ({ page }) => {
  const comps = await boardComps(page);
  await page.goto(hrefOf(comps[0]));
  const tokens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    const rgb = (level: string) => {
      const hex = styles.getPropertyValue(`--color-diff-${level}`).trim();
      return `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
    };
    return { easy: rgb('easy'), average: rgb('average'), hard: rgb('hard'), conditional: rgb('conditional') };
  });
  const levels: Array<{ tone: keyof typeof tokens; label: string; pick: (comp: BoardComp) => boolean }> = [
    { tone: 'easy', label: 'Easy to play', pick: (comp) => !comp.situational && comp.difficulty === 1 },
    { tone: 'average', label: 'Average', pick: (comp) => !comp.situational && comp.difficulty === 2 },
    { tone: 'hard', label: 'Hard to pull off', pick: (comp) => !comp.situational && comp.difficulty === 3 },
    { tone: 'conditional', label: 'Needs conditions', pick: (comp) => comp.situational === true },
  ];
  for (const level of levels) {
    const comp = comps.find(level.pick);
    expect(comp, `the board needs a ${level.tone} comp`).toBeTruthy();
    await page.goto(hrefOf(comp!));
    const chip = page.locator('[data-pv="chips"] > span:last-child');
    await expect(chip).toHaveText(level.label);
    await expect(chip).toHaveCSS('background-color', tokens[level.tone]);
  }
});

test('the bar copies the comp link and closes back to the tier list', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(detail);
  await page.locator(`${bar} button[aria-label="Copy link"]`).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('/en/tierlist/comps/veigar-blackthorn');
  await expect(page.locator(`${bar} button[aria-label="Link copied"]`)).toBeVisible();

  await page.locator(`${bar} button[aria-label="Close comp details"]`).click();
  await expect(page).toHaveURL(/\/en\/tierlist\/comps$/);
});

test('the tab strip scrolls inside itself on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(detail);
  await expect(page.locator(`${bar} nav`)).toHaveCSS('overflow-x', 'auto');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
