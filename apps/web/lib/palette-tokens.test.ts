import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

// The palette lives in CSS custom properties, so this reads globals.css the way
// a browser would. The @theme block is the only palette the app ships.
const root = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(root, '..', 'app', 'globals.css'), 'utf8');
const tokens: Record<string, string> = Object.fromEntries(
  [...css.slice(css.indexOf('@theme'), css.indexOf('body {')).matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})\b/g)].map(
    (match) => [match[1], match[2]],
  ),
);

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((pair) => parseInt(pair, 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const surfaces = ['page', 'panel', 'util'];

// Text tokens have to stay readable on every surface they can land on.
// on-brand is the ink for the solid action fills, brand and brand-deep.
const bodyText: Array<[string, string[]]> = [
  ['fog', surfaces],
  ['mist', surfaces],
  ['brand', surfaces],
  ['brand-deep', surfaces],
  ['on-brand', ['brand', 'brand-deep']],
];

// Data colours are graphics, not body copy: the tier ladder marks a badge or a
// thin border, and a cost colour is only the rim of a UnitHex, so both are held
// to the 3:1 graphic bar against every surface they touch.
const graphics: Array<[string, string[]]> = [
  ...['s', 'a', 'b', 'c', 'd', 'x'].map((tier) => [`tier-${tier}`, surfaces] as [string, string[]]),
  ...[1, 2, 3, 4, 5].map((cost) => [`cost-${cost}`, surfaces] as [string, string[]]),
];

describe('palette tokens', () => {
  it('declares every token the checks below read', () => {
    const required = [
      ...surfaces,
      'line',
      ...bodyText.map(([foreground]) => foreground),
      ...graphics.map(([foreground]) => foreground),
    ];
    for (const token of required) {
      assert.match(tokens[token] ?? '', /^#[0-9a-f]{6}$/, `--color-${token} is missing from the @theme block`);
    }
  });

  // There is no palette switcher, so an override block would be dead CSS that
  // nobody renders — and a silent way to reintroduce a flash.
  it('ships no theme overrides', () => {
    assert.doesNotMatch(css, /:root\[data-theme/, 'globals.css has data-theme overrides but the app cannot switch palettes');
  });

  it('keeps body text at 4.5:1 or better', () => {
    for (const [foreground, backgrounds] of bodyText) {
      for (const background of backgrounds) {
        const ratio = contrast(tokens[foreground], tokens[background]);
        assert.ok(ratio >= 4.5, `${foreground} on ${background} is ${ratio.toFixed(2)}`);
      }
    }
  });

  // A token that only ever paints as a graphic still has to clear 3:1, and this
  // is the bar the tier badges and the UnitHex rim are designed against.
  it('keeps the data colours legible as graphics', () => {
    for (const [foreground, backgrounds] of graphics) {
      for (const background of backgrounds) {
        const ratio = contrast(tokens[foreground], tokens[background]);
        assert.ok(ratio >= 3, `${foreground} on ${background} is ${ratio.toFixed(2)}`);
      }
    }
  });

  // The PWA manifest and the browser bar are static values, so they have to
  // agree with the ground the CSS paints.
  it('paints the browser chrome in the ground colour', () => {
    const manifest = readFileSync(join(root, '..', 'app', 'manifest.ts'), 'utf8');
    const layout = readFileSync(join(root, '..', 'app', '[lang]', 'layout.tsx'), 'utf8');
    for (const [source, pattern] of [
      [manifest, /theme_color: '(#[0-9a-f]{6})'/],
      [layout, /themeColor: '(#[0-9a-f]{6})'/],
    ] as const) {
      assert.equal(source.match(pattern)?.[1], tokens.page, `${pattern.source} is not the --color-page ground`);
    }
  });
});
