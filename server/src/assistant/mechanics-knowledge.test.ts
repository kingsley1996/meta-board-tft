import test from 'node:test';
import assert from 'node:assert/strict';
import { mechanicsPatch } from '../../../lib/mechanics.ts';
import { buildSystemPrompt, buildUserPrompt, type Evidence } from './prompt.ts';
import {
  isMechanicsQuestion,
  mechanicsFor,
  mechanicsPrimer,
  mechanicsSource,
} from './mechanics-knowledge.ts';

function fixture(text: string, lang: 'en' | 'vi' = 'en'): Evidence {
  return {
    intent: 'gameplay_knowledge',
    setId: '18',
    patch: '18.4b',
    setName: 'Enchanted Wilds',
    lang,
    entities: [],
    relatedEntities: [],
    comps: [],
    relatedComps: [],
    stats: [],
    candidates: [],
    comparison: null,
    mechanics: mechanicsFor(text, lang, '18'),
    limitations: [],
  };
}

test('semantic mechanics matching covers topics and paraphrases', () => {
  assert.equal(mechanicsFor('hello', 'en'), null);
  assert.equal(isMechanicsQuestion('hello'), false);
  assert.equal(mechanicsFor('How do Wisps work?', 'en')!.topic, 'wisps');
  assert.match(mechanicsFor('Lãi vàng hoạt động thế nào?', 'vi')!.rules.join(' '), /10-19:1/);
  assert.match(mechanicsFor('Should I save gold for interest?', 'en')!.rules.join(' '), /Interest/);
  assert.match(mechanicsFor('When should I level up?', 'en')!.rules.join(' '), /XP/);
  assert.match(mechanicsFor('What does the emblem do?', 'en')!.rules.join(' '), /grant \+1 trait/);
  const coven = mechanicsFor('How does Coven work?', 'en')!;
  assert.match(coven.rules.join(' '), /Essence/);
  assert.doesNotMatch(coven.rules.join(' '), /Elderwood/);
  assert.equal(mechanicsFor('Coven và Wisp tương tác thế nào?', 'vi')!.topic, 'wisps,coven');
  assert.match(mechanicsFor('What is Set 18?', 'en')!.rules.join(' '), /Enchanted Wilds/);
  assert.equal(mechanicsFor('Wisp và Blossom tương tác thế nào?', 'vi')!.topic, 'wisps,blossom');
});

test('mechanics data carries patch and source metadata', () => {
  const source = mechanicsSource('18');
  assert.equal(source.patch, mechanicsPatch);
  assert.equal(source.title, 'Enchanted Wilds mechanics');
  assert.match(source.updated, /^2026-/);
  assert.equal(mechanicsFor('How do Wisps work?', 'en', '18')!.setName, 'Enchanted Wilds');
});

test('system prompt includes stable rules only for mechanics questions', () => {
  const mechanics = buildSystemPrompt('en', fixture('How do Wisps work?'));
  assert.match(mechanics, /GENERAL TFT RULES/);
  assert.match(mechanics, /8-player autobattler/);
  assert.match(mechanics, /Current Set 18/);
  assert.doesNotMatch(mechanics, /SET 18 — ENCHANTED WILDS/);

  const vi = buildSystemPrompt('vi', fixture('Wisp là gì?', 'vi'));
  assert.match(vi, /TFT là autobattler 8 người/);

  const core = buildSystemPrompt('en', fixture('How do I play TFT?'));
  assert.doesNotMatch(core, /GENERAL TFT RULES/);

  const stats = buildSystemPrompt('en', {
    ...fixture('What is Ahri win rate?'),
    intent: 'meta_query',
    mechanics: null,
  });
  assert.doesNotMatch(stats, /GENERAL TFT RULES/);
  assert.ok(stats.length < mechanics.length);
});

test('user prompt serializes mechanics evidence', () => {
  const prompt = buildUserPrompt('How do Wisps work?', fixture('How do Wisps work?'));
  assert.match(prompt, /"topic":"wisps"/);
  assert.match(prompt, /rightmost shop slot/);
  assert.match(prompt, /"setName":"Enchanted Wilds"/);
});

test('general primer stays language-aware', () => {
  assert.match(mechanicsPrimer('en'), /8-player autobattler/);
  assert.match(mechanicsPrimer('vi'), /autobattler 8 người/);
});
