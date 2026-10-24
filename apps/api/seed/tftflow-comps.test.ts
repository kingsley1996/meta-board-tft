import test from 'node:test';
import assert from 'node:assert/strict';
import { translateCompTitle } from './tftflow-comps.ts';

test('translates champion and trait words in tftflow titles', () => {
  assert.equal(translateCompTitle('Yunara Executioner Reroll'), 'Yunara Đao Phủ Reroll');
  assert.equal(translateCompTitle('Invoker Brambleback'), 'Thuật Sĩ Bụi Gai Đỏ');
  assert.equal(translateCompTitle('Blossom'), 'Hoa Linh');
  assert.equal(translateCompTitle('Master Yi Adaptor'), 'Master Yi Thích Ứng');
  assert.equal(translateCompTitle('Elise Ravager-Emblem'), 'Ấn Elise Tàn Phá');
});

test('keeps separators and unknown words as written', () => {
  assert.equal(translateCompTitle('Cinderling / Pebbles Riftbeast'), 'Mầm Non / Sỏi Quái Rừng');
  assert.equal(translateCompTitle('Karma & Yunara Blossom'), 'Karma & Yunara Hoa Linh');
  assert.equal(translateCompTitle('Azir Reroll'), 'Azir Reroll');
});
