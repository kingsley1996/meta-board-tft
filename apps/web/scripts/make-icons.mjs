// Generates public/icons/icon-{192,512}.png: brand background + white hexagon.
// Run: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const BG = [0x7c, 0x5c, 0xff];
const HEX = [0xff, 0xff, 0xff];

function hexagonVertices(size) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.32;
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index - 90);
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  });
}

function insidePolygon(polygon, x, y) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

for (const size of [192, 512]) {
  const polygon = hexagonVertices(size);
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const color = insidePolygon(polygon, x + 0.5, y + 0.5) ? HEX : BG;
      const index = (size * y + x) << 2;
      png.data[index] = color[0];
      png.data[index + 1] = color[1];
      png.data[index + 2] = color[2];
      png.data[index + 3] = 255;
    }
  }
  mkdirSync('public/icons', { recursive: true });
  writeFileSync(`public/icons/icon-${size}.png`, PNG.sync.write(png));
  console.log(`public/icons/icon-${size}.png`);
}
