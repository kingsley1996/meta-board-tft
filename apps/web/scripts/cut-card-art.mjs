// One-off, per homepage card render: these PNGs already ship with a transparent
// plate, so this only trims the empty margin and re-encodes for the web. The box
// comes from the alpha channel, not sharp's trim(), which compares RGB and would
// mistake the near-black transparent pixels for the dark rock.
// Run: node scripts/cut-card-art.mjs <source.png> public/images/tft/<name>.webp
import sharp from 'sharp';

const [input, output] = process.argv.slice(2);
const MAX_WIDTH = 1100;
const MIN_HEIGHT = 400;

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

// The card renders its art 184px tall, so a retina screen asks for 368 device px.
// A 192px-tall plate leaves the browser to resample upwards and the art goes soft,
// so the plate is pre-scaled past that floor with a filter the browser can beat.
let { width: outWidth, height: outHeight } = box;
const upscaled = outHeight < MIN_HEIGHT;
if (upscaled) {
  outHeight = MIN_HEIGHT;
  outWidth = Math.round((box.width * MIN_HEIGHT) / box.height);
}
if (outWidth > MAX_WIDTH) {
  outWidth = MAX_WIDTH;
  outHeight = Math.round((box.height * MAX_WIDTH) / box.width);
}

const plate = sharp(input).ensureAlpha().extract(box);
if (outWidth !== box.width) plate.resize({ width: outWidth, height: outHeight, fit: 'inside' });
if (upscaled) plate.sharpen({ sigma: 0.8 });
await plate.webp({ quality: 88, alphaQuality: 100, effort: 6 }).toFile(output);
console.log(`${before.width}x${before.height} -> content ${box.width}x${box.height} -> ${outWidth}x${outHeight} -> ${output}`);
