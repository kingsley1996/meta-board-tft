import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isRevalidateKind, revalidationsFor, tokenMatches } from './revalidate.ts';

describe('revalidationsFor', () => {
  it('names each route once, with the locale left as the pattern Next tags by', () => {
    const paths = revalidationsFor('comps');
    assert.deepEqual(
      paths.map((entry) => entry.path),
      ['/[lang]/tierlist/comps', '/[lang]/tierlist/comps/[slug]', '/[lang]/champions/[slug]', '/[lang]/quiz']
    );
    // Every entry sits under the dynamic locale, so Next needs the type on all of them.
    for (const entry of paths) assert.equal(entry.type, 'page', entry.path);
  });

  it('touches only article routes for the guide kind', () => {
    assert.deepEqual(
      revalidationsFor('guides').map((entry) => entry.path),
      ['/[lang]/guides', '/[lang]/guides/[slug]', '/[lang]/patches', '/[lang]/patches/[patch]']
    );
  });
});

describe('isRevalidateKind', () => {
  it('accepts the kinds the API is allowed to name', () => {
    assert.equal(isRevalidateKind('comps'), true);
    assert.equal(isRevalidateKind('guides'), true);
  });

  it('rejects anything else, including a path the caller made up', () => {
    for (const value of ['all', '', 'comps; DROP', undefined, null, { kind: 'comps' }]) {
      assert.equal(isRevalidateKind(value), false, String(value));
    }
  });
});

describe('tokenMatches', () => {
  it('passes only on an exact token', () => {
    assert.equal(tokenMatches('secret-value', 'secret-value'), true);
    assert.equal(tokenMatches('secret-valu2', 'secret-value'), false);
  });

  it('refuses a missing header and an unconfigured secret without comparing', () => {
    assert.equal(tokenMatches(null, 'secret-value'), false);
    assert.equal(tokenMatches('', 'secret-value'), false);
    assert.equal(tokenMatches('anything', undefined), false);
    assert.equal(tokenMatches('anything', ''), false);
    assert.equal(tokenMatches('short', 'secret-value'), false);
  });
});
