import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PRIORITY, bucketFor, shrinkGain } from './item-priority-score.ts';

describe('item priority scoring', () => {
  it('keeps the published thresholds ordered', () => {
    assert.ok(PRIORITY.strong > PRIORITY.situational && PRIORITY.situational > 0);
    assert.ok(PRIORITY.core > PRIORITY.strong);
    assert.ok(PRIORITY.minShare > 0 && PRIORITY.overpickedShare > PRIORITY.minShare);
    assert.ok(PRIORITY.minEmblemShare > 0 && PRIORITY.minEmblemGames > 0);
    assert.ok(PRIORITY.maxComps > 0 && PRIORITY.maxArtifacts > 0 && PRIORITY.maxEmblems > 0);
  });

  it('maps gain and share to the published buckets', () => {
    assert.equal(bucketFor(PRIORITY.core, 0.1), 'core');
    assert.equal(bucketFor(PRIORITY.strong, 0.1), 'strong');
    assert.equal(bucketFor(PRIORITY.situational + 0.01, 0.01), 'situational');
    assert.equal(bucketFor(0.04, PRIORITY.overpickedShare), 'overpicked');
    assert.equal(bucketFor(0.04, 0.01), null);
  });

  it('flags an item that hurts but is carried often', () => {
    assert.equal(bucketFor(-0.4, 0.2), 'overpicked');
    assert.equal(bucketFor(-0.4, 0.01), null);
  });

  it('shrinks thin samples toward zero without flipping the sign', () => {
    const thin = shrinkGain(-0.5, 1_000);
    const thick = shrinkGain(-0.5, 100_000);
    assert.ok(thin > 0 && thin < thick && thick < 0.5);
    assert.ok(Math.abs(shrinkGain(-0.5, Number.MAX_SAFE_INTEGER) - 0.5) < 1e-6);
    assert.ok(shrinkGain(0.5, 50_000) < 0);
  });
});
