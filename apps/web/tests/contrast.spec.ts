import { expect, test } from 'playwright/test';

// lib/palette-tokens.test.ts can only reason about two solid colours. Two places
// on the homepage paint text over a picture instead: the hero headline over the
// banner photo behind a directional wash, and the comps card over the penguin
// render. Here the only background that exists is a set of pixels, so this reads
// the ones the browser actually composited. The ink is hidden before the
// screenshot, so no anti-aliased glyph edge can be mistaken for background.

function luminance(r: number, g: number, b: number): number {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastOf(ink: number, pixel: number): number {
  return (Math.max(ink, pixel) + 0.05) / (Math.min(ink, pixel) + 0.05);
}

type Run = { text: string; color: string; x: number; y: number; w: number; h: number; need: number };

// A screenshot taken between two frames captures whatever the compositor last
// painted, which on a cold load is the page ground instead of the picture.
async function nextPaint(page: import('playwright/test').Page) {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

// Every picture behind the text has to be decoded before the frame is worth
// reading: the section's own CSS background and any <img> inside it.
async function waitForPictures(page: import('playwright/test').Page, selector: string) {
  await page.evaluate(async (root) => {
    const element = document.querySelector(root)!;
    const urls = [...element.querySelectorAll('img')].map((image) => image.currentSrc || image.src);
    const banner = getComputedStyle(element).backgroundImage.match(/url\("?(.*?)"?\)/)?.[1];
    if (banner) urls.push(banner);
    await Promise.all(
      urls
        .filter((url) => url && !url.startsWith('data:'))
        .map(
          (url) =>
            new Promise<void>((resolve, reject) => {
              const image = new Image();
              image.onload = () => resolve();
              image.onerror = () => reject(new Error(`did not decode: ${url}`));
              image.src = url;
            }),
        ),
    );
  }, selector);
  await nextPaint(page);
}

async function runsOverPictures(
  page: import('playwright/test').Page,
  selector: string,
  opts: { hover?: boolean } = {},
): Promise<Run[]> {
  const section = page.locator(selector);
  await expect(section).toBeVisible();
  await waitForPictures(page, selector);

  // The comps render lifts and grows under the pointer, so the frame worth
  // measuring is the settled one, not the first painted after the hover.
  if (opts.hover) {
    await section.locator('a').first().hover();
    await page.waitForTimeout(500);
    await nextPaint(page);
  }

  // The ink has to be read while it is still painted, and positioned relative to
  // the section's own corner: element.screenshot() may scroll the page while it
  // captures, but its crop always starts at that corner, so the offset survives.
  const runs = await section.evaluate((root) => {
    const origin = root.getBoundingClientRect();
    const out: Run[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent || '').trim();
      if (text.length < 2) continue;
      const element = node.parentElement;
      if (!element) continue;
      const style = getComputedStyle(element);
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const size = parseFloat(style.fontSize);
      const weight = Number(style.fontWeight) || 400;
      // WCAG large-text bar: 24px, or 18.66px at weight 700.
      out.push({
        text: text.slice(0, 28),
        color: style.color,
        x: rect.left - origin.left,
        y: rect.top - origin.top,
        w: rect.width,
        h: rect.height,
        need: size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5,
      });
    }
    return out;
  });

  // The ink goes transparent before the picture is captured. Next reconciles
  // <head> while it hydrates and can drop an injected style tag, which would
  // leave the glyphs in the frame and measure text against itself.
  await page.addStyleTag({
    content: 'body, body * { color: transparent !important; text-shadow: none !important; -webkit-text-stroke: 0 !important; }',
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          (root) =>
            [...document.querySelectorAll(`${root} h1, ${root} h2, ${root} h3, ${root} p, ${root} a, ${root} span`)].every(
              (element) => getComputedStyle(element).color === 'rgba(0, 0, 0, 0)',
            ),
          selector,
        ),
      { message: `${selector} kept its glyphs, so the screenshot would measure ink against ink` },
    )
    .toBe(true);
  await nextPaint(page);
  const shot = await section.screenshot();

  const pixels = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return { width: canvas.width, height: canvas.height, data: Array.from(data) };
  }, shot.toString('base64'));

  for (const run of runs) {
    const [r, g, b] = run.color.match(/\d+/g)!.map(Number);
    expect(r + g + b, `"${run.text}" was measured with its ink already hidden`).toBeGreaterThan(0);
    const ink = luminance(r, g, b);
    const left = Math.max(0, Math.round(run.x));
    const top = Math.max(0, Math.round(run.y));
    const right = Math.min(pixels.width, left + Math.round(run.w));
    const bottom = Math.min(pixels.height, top + Math.round(run.h));
    const ratios: number[] = [];
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const i = (y * pixels.width + x) * 4;
        if (pixels.data[i + 3] < 250) continue;
        ratios.push(contrastOf(ink, luminance(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2])));
      }
    }
    expect(ratios.length, `"${run.text}" has no pixels behind it`).toBeGreaterThan(50);
    ratios.sort((a, b) => a - b);
    // 5th percentile, so a few stray bright pixels in the art cannot fail the
    // build, while a wash that lets the picture through behind the copy can.
    const p05 = ratios[Math.floor(ratios.length * 0.05)];
    expect(p05, `"${run.text}" at ${run.color} is ${p05.toFixed(2)}:1 over the picture, needs ${run.need}:1`).toBeGreaterThanOrEqual(run.need);
  }
  return runs;
}

const sections = ['section[data-section="hero"]', 'section[data-section="features"]'];
const widths = [1440, 1024, 390];

// The homepage sections that paint over a picture, at the widths where their
// layout actually changes: the feature grid reflows at 640 and 1024, and the
// hero swaps its wash for a flat ground below 1280. The hovered frame is only
// worth a pass where the pointer exists and the art escapes its card.
const cases = [
  ...widths.flatMap((width) => sections.map((selector) => ({ width, selector, hover: false }))),
  { width: 1440, selector: 'section[data-section="features"]', hover: true },
];

for (const lang of ['vi', 'en']) {
  test(`the ${lang} homepage clears WCAG against the pixels behind its text`, async ({ page }) => {
    test.setTimeout(240_000);
    for (const { width, selector, hover } of cases) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${lang}`, { waitUntil: 'networkidle' });
      const runs = await runsOverPictures(page, selector, { hover });
      expect(runs.length, `${selector} at ${width}px had no text to measure`).toBeGreaterThan(3);
    }
  });
}
