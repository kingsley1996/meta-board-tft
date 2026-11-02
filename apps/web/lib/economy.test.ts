import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { economyForComp, type EconomyPlanComp, type EconomyPlanStrategy } from '@tftiq/shared/economy-match';

// The board's rail card and the comp panel's plan chip have to name the same
// plan, so these pin the rule on the shared engine instead of on the snapshot:
// the comp's own style bucket owns the name, and a published board may only
// refine it inside the same family.
const strategies: EconomyPlanStrategy[] = [
  { name: '2-Cost Reroll', rounds: [{ round: '3-2', text: 'Roll at 6' }] },
  { name: '1 & 2-Cost Reroll', rounds: [{ round: '3-2', text: 'Roll for two-stars' }] },
  { name: 'Fast 8', rounds: [{ round: '4-2', text: 'Level 8' }] },
  { name: 'Fast 9', rounds: [{ round: '5-1', text: 'Level 9' }] },
];

const board = (name: string, strategy: string, carry: string, boardNames: string[]): EconomyPlanComp => ({
  slug: name.toLowerCase(),
  name,
  strategy,
  carry,
  boardNames,
  levelCurve: [{ stage: 'Stage 4', text: `${name} levels to ${strategy}` }],
  tips: [],
});

// Two published boards on the same carry running different plans, which is what
// the sources actually ship.
const comps = [board('Slow Brambleback', 'Fast 8', 'Brambleback', ['Brambleback', 'Galio', 'Sett']),
  board('Streak Brambleback', 'Fast 9', 'Brambleback', ['Brambleback', 'Galio', 'Ryze']),
  board('Reroll Aphelios', '1 & 2-Cost Reroll', 'Aphelios', ['Aphelios', 'Jinx', 'Leona'])];

const comp = (style: string, carry: { name: string; cost: number }, units: string[]) =>
  ({ style, carry, units: units.map((name) => ({ name })) });

describe('economyForComp', () => {
  it('keeps the plan the style tag claims when the matched board runs another', () => {
    const fast9 = economyForComp(comp('Fast 9', { name: 'Brambleback', cost: 4 }, ['Brambleback', 'Galio', 'Sett']), comps, strategies);
    assert.equal(fast9.strategy, 'Fast 9', 'a Fast 8 board may not rename a Fast 9 comp');
    assert.equal(fast9.source, 'derived');
    assert.match(fast9.levelCurve[0].text, /Level 9/, 'and it may not lend its level curve either');
  });

  it('takes the published plan and curve when they are the same plan', () => {
    const reroll = economyForComp(comp('Reroll', { name: 'Aphelios', cost: 2 }, ['Aphelios', 'Jinx', 'Leona']), comps, strategies);
    assert.equal(reroll.strategy, '1 & 2-Cost Reroll', 'a reroll comp keeps a more precise reroll name');
    assert.equal(reroll.source, 'tftflow');
    assert.equal(reroll.levelCurve[0].stage, 'Stage 4');
  });

  it('reads the roll ladder off the carry cost', () => {
    assert.equal(economyForComp(comp('Reroll', { name: 'Veigar', cost: 1 }, ['Veigar']), comps, strategies).strategy, '1-Cost Reroll');
    assert.equal(economyForComp(comp('Reroll', { name: 'Sett', cost: 5 }, ['Sett']), comps, strategies).strategy, '3-Cost Reroll');
  });

  it('lands Flex and Tempo on a plan that exists', () => {
    for (const style of ['Flex', 'Tempo']) {
      const economy = economyForComp(comp(style, { name: 'Ornn', cost: 5 }, ['Ornn']), comps, strategies);
      assert.equal(economy.strategy, 'Fast 8', `${style} has no ladder of its own`);
      assert.ok(economy.levelCurve.length, `${style} still shows a plan`);
    }
  });
});
