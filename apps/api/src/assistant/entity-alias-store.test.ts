import test from 'node:test';
import assert from 'node:assert/strict';
import { unresolvedMentionCandidates } from './entity-alias-store.ts';

test('unresolved entity candidates are normalized, deduplicated, and never store the full query', () => {
  const candidates = unresolvedMentionCandidates(
    [
      { name: '  My   Old Champion  ', entityType: 'champion' },
      { name: 'my old champion', entityType: 'champion' },
      { name: 'link', entityType: 'item' },
      { name: 'bad\nname', entityType: 'item' },
      { name: 'https://example.com', entityType: 'comp' },
      { name: 'Which champion is strong?', entityType: null },
    ],
    'Which champion is strong?'
  );

  assert.deepEqual(candidates, [
    { name: 'My Old Champion', entityType: 'champion', nameKey: 'myoldchampion' },
    { name: 'link', entityType: 'item', nameKey: 'link' },
  ]);
});
