// Renders public/icons/icon-{192,512}.png and the maskable variant from
// app/icon.svg, so the installed-app icon can never drift from the tab icon.
// Run from apps/web: node scripts/make-icons.mjs
// sharp is reached through Next's optional dependency; nothing here is declared
// in package.json because promoting it to a direct devDependency makes npm drop
// the `libc` selector on the platform binaries in the lockfile.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const GROUND = { alpha: 255, r: 0x0d, g: 0x13, b: 0x17 }; // --color-page
const MARK_BOX = 64; // app/icon.svg viewBox
const svg = readFileSync(join(process.cwd(), 'app/icon.svg'));

// `box` is the mark's edge in the final square, so the maskable variant can pull
// it inside the 80% safe zone instead of letting the hexagon's vertices be cut.
async function tile(file, size, box) {
  const offset = Math.round((size - box) / 2);
  await sharp({ create: { width: size, height: size, channels: 4, background: GROUND } })
    .composite([{ density: (72 * box) / MARK_BOX, input: svg, left: offset, top: offset }])
    .png()
    .toFile(file);
  console.log(file);
}

mkdirSync('public/icons', { recursive: true });
for (const size of [192, 512]) {
  await tile(join('public/icons', `icon-${size}.png`), size, size);
}
await tile(join('public/icons', 'icon-maskable-512.png'), 512, Math.round(512 * 0.78));
