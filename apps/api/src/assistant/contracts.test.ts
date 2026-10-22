import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAssistantQuery } from './contracts.ts';

const base = {
  message: 'Comp nào dùng Ahri?',
  lang: 'vi' as const,
  history: [],
  context: { pageType: 'assistant' as const, compSlug: null, entityIds: [] },
};

test('validates message, history and context limits', () => {
  assert.equal(validateAssistantQuery({ ...base, message: '   ' }).ok, false);
  assert.equal(validateAssistantQuery({ ...base, message: 'x'.repeat(2001) }).ok, false);
  assert.equal(validateAssistantQuery({ ...base, history: Array.from({ length: 7 }, () => ({ role: 'user', content: 'x' })) }).ok, false);
  assert.equal(validateAssistantQuery({ ...base, context: { pageType: 'admin', compSlug: null, entityIds: [] } }).ok, false);
  assert.equal(validateAssistantQuery({ ...base, context: { pageType: 'assistant', compSlug: null, entityIds: ['champion:'] } }).ok, false);
});

test('normalizes a valid request and accepts stable entity IDs', () => {
  const result = validateAssistantQuery({
    ...base,
    message: '  Comp nào dùng Ahri?  ',
    context: { pageType: 'comp', compSlug: 'ahri-spellweaver', entityIds: ['champion:DA_18_Ahri', 'champion:DA_18_Ahri'] },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.message, 'Comp nào dùng Ahri?');
    assert.deepEqual(result.value.context.entityIds, ['champion:DA_18_Ahri']);
  }
});
