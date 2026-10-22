import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSISTANT_TOOLS, AssistantToolError, executeAssistantTool } from './tool-registry.ts';

test('exposes only read-only assistant tools', () => {
  assert.deepEqual(
    ASSISTANT_TOOLS.map((tool) => tool.function.name),
    ['find_comps', 'search_comps', 'get_comp', 'compare_comps', 'get_stats']
  );
});

test('rejects malformed tool arguments before querying data', async () => {
  await assert.rejects(executeAssistantTool('find_comps', { champions: 'Ahri' }, 'en'), AssistantToolError);
  await assert.rejects(executeAssistantTool('find_comps', { champions: [], extra: true }, 'en'), AssistantToolError);
  await assert.rejects(executeAssistantTool('compare_comps', { slugs: ['only-one'] }, 'en'), AssistantToolError);
  await assert.rejects(executeAssistantTool('unknown_tool', {}, 'en'), AssistantToolError);
});
