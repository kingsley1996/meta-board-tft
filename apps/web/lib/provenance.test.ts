import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PROVENANCE_FIELDS, type ProvenanceKey } from './provenance.ts';

// The overlay measures whatever carries data-pv; a key with no hook gets a rail
// row that never highlights, and a hook with no key is invisible to the reader.
// Both are silent bugs, so they fail here instead.
const panel = readFileSync(new URL('../components/comp-panel.tsx', import.meta.url), 'utf8');
const hooked = [...panel.matchAll(/data-pv="([a-z-]+)"|pv="([a-z-]+)"/g)].map((match) => (match[1] ?? match[2]) as ProvenanceKey);

describe('comp provenance catalog', () => {
  it('has one entry per hook on the panel', () => {
    assert.deepEqual([...new Set(hooked)].sort(), PROVENANCE_FIELDS.map((field) => field.key).sort());
  });

  it('has no duplicate key', () => {
    const keys = PROVENANCE_FIELDS.map((field) => field.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  it('explains every field in all four slots', () => {
    for (const field of PROVENANCE_FIELDS) {
      for (const slot of ['label', 'path', 'writer', 'changes', 'note'] as const) {
        assert.ok(field[slot].trim().length, `${field.key}.${slot} is empty`);
      }
    }
  });
});
