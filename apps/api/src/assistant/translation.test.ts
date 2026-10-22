import test from 'node:test';
import assert from 'node:assert/strict';
import { translateText } from './translate.ts';

test('translation catalog translates dynamic strings and falls back safely', () => {
  assert.equal(translateText('en', 'loot', 'page-name', 'Expected Unexpectedness'), 'Expected Unexpectedness');
  assert.equal(translateText('vi', 'loot', 'page-name', 'Expected Unexpectedness'), 'Kỳ Vọng Bất Ngờ');
  assert.equal(translateText('vi', 'custom', 'label', 'Unknown English'), 'Unknown English');
  assert.equal(translateText('vi', 'custom', 'label', 'Unknown English', 'Bản dịch sẵn có'), 'Bản dịch sẵn có');
});
