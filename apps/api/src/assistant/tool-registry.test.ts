import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSISTANT_TOOLS, AssistantToolError, executeAssistantTool } from './tool-registry.ts';

test('exposes only read-only assistant tools', () => {
  assert.deepEqual(
    ASSISTANT_TOOLS.map((tool) => tool.function.name),
    ['find_comps', 'search_comps', 'get_comp', 'compare_comps', 'get_stats', 'get_game_mechanics', 'get_economy_plan']
  );
});

test('rejects malformed tool arguments before querying data', async () => {
  await assert.rejects(executeAssistantTool('find_comps', { champions: 'Ahri' }, 'en'), AssistantToolError);
  await assert.rejects(executeAssistantTool('find_comps', { champions: [], extra: true }, 'en'), AssistantToolError);
  await assert.rejects(executeAssistantTool('compare_comps', { slugs: ['only-one'] }, 'en'), AssistantToolError);
  await assert.rejects(executeAssistantTool('get_game_mechanics', { table: 'income', query: 'gold' }, 'en'), AssistantToolError);
  await assert.rejects(executeAssistantTool('get_economy_plan', { strategy: 'Fast 8', query: 'Ahri' }, 'en'), AssistantToolError);
  await assert.rejects(executeAssistantTool('unknown_tool', {}, 'en'), AssistantToolError);
});

test('returns exact game mechanics tables with source metadata', async () => {
  const income = await executeAssistantTool('get_game_mechanics', { table: 'income' }, 'vi');
  const incomePayload = income.payload as {
    baseIncome: { rounds: string; gold: number }[];
    interest: { hold: string; gold: number }[];
    source: { url: string };
    summary: string;
  };
  assert.equal(incomePayload.baseIncome.find((entry) => entry.rounds === '2-2+')?.gold, 5);
  assert.equal(incomePayload.interest.find((entry) => entry.hold === '50+')?.gold, 5);
  assert.match(incomePayload.summary, /Thu nhập/);
  assert.match(incomePayload.source.url, /gold-income/);

  const odds = await executeAssistantTool('get_game_mechanics', { table: 'shop_odds' }, 'en');
  const oddsPayload = odds.payload as { rows: { level: number; odds: number[] }[] };
  assert.deepEqual(oddsPayload.rows.find((entry) => entry.level === 8)?.odds, [15, 20, 32, 30, 3]);
});

test('returns focused loot-table pages and supports a second query for table details', async () => {
  // Small mechanic pages (the nine Coven cashout tables) inline every table so
  // the model gets reward details in one call instead of stopping at a listing.
  const page = await executeAssistantTool('get_game_mechanics', { table: 'loot_tables', slug: 'coven' }, 'en');
  const pagePayload = page.payload as {
    tables: { title: string; facts: { label: string; value: string }[] }[];
    tableCount: number;
    source: { url: string };
  };
  assert.ok(pagePayload.tables.length > 0);
  assert.equal(pagePayload.tableCount, pagePayload.tables.length);
  assert.match(pagePayload.source.url, /coven$/);

  // Large pages still return an index to keep the payload bounded.
  const bigPage = await executeAssistantTool('get_game_mechanics', { table: 'loot_tables', slug: 'stage-loot-orbs' }, 'en');
  const bigPayload = bigPage.payload as { tableIndex: string[] };
  assert.ok(bigPayload.tableIndex.length > 0);

  const details = await executeAssistantTool(
    'get_game_mechanics',
    { table: 'loot_tables', slug: 'stage-loot-orbs', query: 'gold' },
    'en'
  );
  const detailsPayload = details.payload as {
    tables: { title: string; rows: { value: string }[][] }[];
    matchedCount: number;
    source: { url: string };
  };
  assert.ok(detailsPayload.matchedCount > 0);
  assert.ok(detailsPayload.tables.length <= 3);
  assert.match(detailsPayload.source.url, /stage-loot-orbs$/);

  const globalSearch = await executeAssistantTool(
    'get_game_mechanics',
    { table: 'loot_tables', query: 'Tacticians Crown' },
    'en'
  );
  const globalPayload = globalSearch.payload as { results: { slug: string }[]; matchedPages: number };
  assert.ok(globalPayload.matchedPages > 0);
  assert.ok(globalPayload.results.length <= 3);

  const localizedSearch = await executeAssistantTool('get_game_mechanics', { table: 'loot_tables', query: 'Vàng' }, 'vi');
  const localizedPayload = localizedSearch.payload as { matchedPages: number; results: { slug: string }[] };
  assert.ok(localizedPayload.matchedPages > 0);
  assert.ok(localizedPayload.results.length <= 3);
});

test('returns localized round-by-round economy strategies', async () => {
  const result = await executeAssistantTool('get_economy_plan', { strategy: 'Fast 8' }, 'vi');
  const payload = result.payload as {
    plan: { name: string; rounds: { round: string; text: string }[] };
    source: { provider: string; url: string };
    summary: string;
  };
  assert.equal(payload.plan.rounds.length, 12);
  assert.equal(payload.plan.rounds[0].round, '2-1');
  assert.match(payload.plan.name, /Lên cấp 8 nhanh/);
  assert.match(payload.source.provider, /tftflow/);
  assert.match(payload.summary, /Kế hoạch/);
  assert.match(payload.plan.rounds[0].text, /vàng|cấp|thắng|thua/i);
});
