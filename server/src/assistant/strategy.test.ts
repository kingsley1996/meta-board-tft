import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStrategy, buildStrategyPlan, isStrategyQuestion, parseStrategyState } from './strategy.ts';

test('parses explicit game state from a strategy question', () => {
  const state = parseStrategyState('level 7 40 vang 30 hp stage 4 2 nen roll hay len 8');
  assert.equal(state.level, 7);
  assert.equal(state.gold, 40);
  assert.equal(state.hp, 30);
  assert.equal(state.stage, '4-2');
});

test('routes stateful decisions to strategy, not generic mechanics', () => {
  assert.equal(isStrategyQuestion('level 7 40 vang 30 hp nen roll hay len 8'), true);
  assert.equal(isStrategyQuestion('toi dang thieu frontline nen giu vang hay roll'), true);
  assert.equal(isStrategyQuestion('board nay co du manh de len cap khong'), true);
  assert.equal(isStrategyQuestion('khi nao nen pivot'), true);
  assert.equal(isStrategyQuestion('should i roll or save gold'), true);
  assert.equal(isStrategyQuestion('comp tier s nao phu hop voi reroll'), false);
  assert.equal(isStrategyQuestion('kinh te vang nen choi sao'), false);
});

test('computes level cost from verified xp and shop-odds tables', () => {
  const analysis = analyzeStrategy('level 7 40 vang 30 hp nen roll hay len 8');
  assert.ok(analysis);
  assert.equal(analysis.nextLevel, 8);
  assert.equal(analysis.xpNeeded, 56);
  assert.equal(analysis.costGold, 56);
  assert.equal(analysis.canLevel, false);
  assert.equal(analysis.action, 'roll');
  assert.equal(analysis.odds?.[3], 10);
});

test('asks for missing state instead of guessing', () => {
  const analysis = analyzeStrategy('level 7 nen roll hay len 8');
  assert.ok(analysis);
  assert.equal(analysis.action, 'clarify');
  const plan = buildStrategyPlan(analysis, 'vi', '18.4');
  assert.equal(plan.status, 'needs_clarification');
  assert.match(plan.answer, /vàng|level/);
});

test('answers with basis, trade-offs and assumptions and no null artefacts', () => {
  const analysis = analyzeStrategy('level 7 80 vang 70 hp nen len 8 hay roll');
  assert.ok(analysis);
  assert.equal(analysis.action, 'level');
  const plan = buildStrategyPlan(analysis, 'vi', '18.4');
  assert.equal(plan.status, 'answered');
  assert.match(plan.answer, /56/);
  assert.deepEqual(plan.sections.map((section) => section.heading), ['Khuyến nghị', 'Căn cứ', 'Đánh đổi', 'Giả định', 'Còn thiếu']);
  assert.doesNotMatch(JSON.stringify(plan), /null/);
});
