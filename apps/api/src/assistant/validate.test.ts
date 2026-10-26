import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGeneratedAnswer } from './validate.ts';

test('accepts the assistant JSON shape', () => {
  const parsed = parseGeneratedAnswer(JSON.stringify({ answer: 'Ahri is a 4-cost.', followUpQuestions: ['Which comp?'], limitations: [] }));
  assert.equal(parsed?.answer, 'Ahri is a 4-cost.');
  assert.deepEqual(parsed?.followUpQuestions, ['Which comp?']);
});

test('rejects malformed JSON and oversized follow-ups, accepts stats', () => {
  assert.equal(parseGeneratedAnswer('not json'), null);
  assert.equal(
    parseGeneratedAnswer('```json\n' + JSON.stringify({ answer: 'fenced', followUpQuestions: [], limitations: [] }) + '\n```')?.answer,
    'fenced'
  );
  assert.equal(parseGeneratedAnswer(JSON.stringify({ answer: 'x', winRate: 0.5 })), null);
  assert.equal(parseGeneratedAnswer(JSON.stringify({ answer: 'x', followUpQuestions: ['1', '2', '3', '4'] }))?.followUpQuestions.length, 3);
  assert.equal(parseGeneratedAnswer(JSON.stringify({ answer: '', followUpQuestions: [], limitations: [] })), null);
  assert.equal(parseGeneratedAnswer(JSON.stringify({ answer: 'Ahri has a 52% win rate.', followUpQuestions: [], limitations: [] }))?.answer, 'Ahri has a 52% win rate.');
  assert.deepEqual(
    parseGeneratedAnswer(JSON.stringify({ answer: 'x', followUpQuestions: [',', 'Which comp?'], limitations: [] }))?.followUpQuestions,
    ['Which comp?']
  );
});

test('accepts structured sections and rejects invalid ones', () => {
  const parsed = parseGeneratedAnswer(
    JSON.stringify({
      answer: 'Build around Ahri.',
      sections: [{ heading: 'Items', points: ['Blue Buff first.', 'Then Nashor\'s Tooth.'] }],
      followUpQuestions: [],
      limitations: [],
    })
  );
  assert.deepEqual(parsed?.sections, [{ heading: 'Items', points: ['Blue Buff first.', "Then Nashor's Tooth."] }]);
  assert.equal(
    parseGeneratedAnswer(
      JSON.stringify({ answer: 'x', sections: [{ heading: 'A', points: ['1', '2', '3', '4', '5', '6', '7', '8'] }], followUpQuestions: [], limitations: [] })
    )?.sections[0].points.length,
    8
  );
  assert.deepEqual(parseGeneratedAnswer(JSON.stringify({ answer: 'x', sections: [{ heading: '', points: ['y'] }], followUpQuestions: [], limitations: [] }))?.sections, []);
  assert.equal(
    parseGeneratedAnswer(JSON.stringify({ answer: 'x', sections: [{ heading: 'A', points: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] }], followUpQuestions: [], limitations: [] }))?.sections[0].points.length,
    12
  );
  assert.equal(
    parseGeneratedAnswer(JSON.stringify({ answer: 'x', sections: [{ heading: 'A', points: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'] }], followUpQuestions: [], limitations: [] }))?.sections[0].points.length,
    12
  );
});
