import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { prettyString } from './trace-format.ts';

describe('prettyString', () => {
  it('pretty-prints model JSON so escapes become real lines', () => {
    assert.equal(prettyString('{"answer":"xin chào","points":["a","b"]}'), [
      '{',
      '  "answer": "xin chào",',
      '  "points": [',
      '    "a",',
      '    "b"',
      '  ]',
      '}',
    ].join('\n'));
  });

  it('leaves prose, arrays of prose and malformed JSON untouched', () => {
    assert.equal(prettyString('Hello\nthere'), 'Hello\nthere');
    assert.equal(prettyString('{not json'), '{not json');
    assert.equal(prettyString('  plain  '), '  plain  ');
  });
});
