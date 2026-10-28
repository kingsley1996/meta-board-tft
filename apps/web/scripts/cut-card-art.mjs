// One-off, per homepage card render: these PNGs already ship with a transparent
// plate, so this only trims the empty margin and re-encodes for the web. The box
// comes from the alpha channel, not sharp's trim(), which compares RGB and would
// mistake the near-black transparent pixels for the dark rock.
// Run: node scripts/cut-card-art.mjs <source.png> public/images/tft/<name>.webp
import sharp from 'sharp';

const [input, output] = process.argv.slice(2);
const MAX_WIDTH = 1100;

const before = await sharp(input).metadata();
const { info, data } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;

let top = height,
  bottom = -1,
  left = width,
  right = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] < 8) continue;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
    if (x < left) left = x;
    if (x > right) right = x;
  }
}
const box = { left, top, width: right - left + 1, height: bottom - top + 1 };

await sharp(input)
  .ensureAlpha()
  .extract(box)
  .resize({ width: Math.min(MAX_WIDTH, box.width) })
  .webp({ quality: 88, alphaQuality: 100, effort: 6 })
  .toFile(output);
console.log(`${before.width}x${before.height} -> content ${box.width}x${box.height} -> ${output}`);
