import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEntityExtraction } from './unresolved-entity-detection.ts';

test('extracts only short, typed entity phrases copied from the question', () => {
  const question = 'Build a comp around Ahri with the old item "Frozen Hard"';
  const output = JSON.stringify({
    entities: [
      { name: 'Ahri', type: 'champion' },
      { name: 'Frozen Hard', type: 'item' },
      { name: 'Frozen Heart', type: 'item' },
      { name: 'Build a comp around Ahri with the old item "Frozen Hard"', type: 'item' },
      { name: 'old item', type: 'item' },
      { name: 'Ahri', type: 'unknown' },
    ],
  });

  assert.deepEqual(parseEntityExtraction(output, question), [
    { name: 'Ahri', entityType: 'champion' },
    { name: 'Frozen Hard', entityType: 'item' },
    { name: 'old item', entityType: 'item' },
  ]);
});

test('does not accept invalid JSON, untyped entities, or names absent from the source question', () => {
  assert.deepEqual(parseEntityExtraction('not json', 'Ahri'), []);
  assert.deepEqual(parseEntityExtraction(JSON.stringify({ entities: [{ name: 'Ahri' }] }), 'Ahri'), []);
  assert.deepEqual(parseEntityExtraction(JSON.stringify({ entities: [{ name: 'Ahri', type: 'champion' }] }), 'Morgana'), []);
});
