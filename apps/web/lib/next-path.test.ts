import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { safeNextPath } from './next-path.ts';

describe('safeNextPath', () => {
  it('keeps an in-app path, including its query string', () => {
    assert.equal(safeNextPath('/admin/users', 'en'), '/admin/users');
    assert.equal(safeNextPath('/vi/assistant?comp=ahri-spellweaver', 'vi'), '/vi/assistant?comp=ahri-spellweaver');
  });

  it('falls back to the assistant in the visitor own locale', () => {
    assert.equal(safeNextPath(undefined, 'en'), '/en/assistant');
    assert.equal(safeNextPath('', 'vi'), '/vi/assistant');
  });

  it('refuses anything that is not a path of this site', () => {
    for (const hostile of [
      '//evil.example/admin',
      'https://evil.example',
      'HTTP://evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '/admin\\@evil.example',
    ]) {
      assert.equal(safeNextPath(hostile, 'en'), '/en/assistant', `${hostile} must not be a redirect target`);
    }
  });
});
