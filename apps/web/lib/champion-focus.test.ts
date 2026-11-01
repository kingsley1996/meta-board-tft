import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const focus = JSON.parse(readFileSync(new URL('./champion-focus.json', import.meta.url), 'utf8')) as Record<
  string,
  [number, number]
>;
const icons = readdirSync(new URL('../public/tft/champions', import.meta.url));

describe('champion focus map', () => {
  it('covers every champion icon and nothing else', () => {
    assert.deepEqual(Object.keys(focus).sort(), [...icons].sort());
  });

  it('puts every focus point inside the art', () => {
    for (const [file, [x, y]] of Object.entries(focus)) {
      assert.ok(x > 0 && x < 1 && y > 0 && y < 1, `focus out of bounds: ${file}`);
    }
  });
});
