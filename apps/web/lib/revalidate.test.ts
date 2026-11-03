import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isRevalidateKind, revalidationsFor, tokenMatches } from './revalidate.ts';

describe('revalidationsFor', () => {
  it('covers every locale and marks dynamic patterns as pages', () => {
    const paths = revalidationsFor('comps');
    assert.deepEqual(
      paths.map((entry) => entry.path),
      [
        '/en/tierlist/comps',
        '/en/tierlist/comps/[slug]',
        '/en/champions/[slug]',
        '/en/quiz',
        '/vi/tierlist/comps',
        '/vi/tierlist/comps/[slug]',
        '/vi/champions/[slug]',
        '/vi/quiz',
      ]
    );
    for (const entry of paths) {
      if (entry.path.includes('[')) assert.equal(entry.type, 'page', entry.path);
      else assert.equal(entry.type, undefined, entry.path);
    }
  });

  it('touches only article routes for the guide kind', () => {
    assert.deepEqual(
      revalidationsFor('guides').map((entry) => entry.path),
      [
        '/en/guides',
        '/en/guides/[slug]',
        '/en/patches',
        '/en/patches/[patch]',
        '/vi/guides',
        '/vi/guides/[slug]',
        '/vi/patches',
        '/vi/patches/[patch]',
      ]
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
