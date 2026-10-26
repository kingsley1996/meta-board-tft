import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, withInferenceSlot } from './rate-limit.ts';

test('rate limit rejects a key after the window cap', () => {
  const previous = process.env.ASSISTANT_RATE_LIMIT;
  process.env.ASSISTANT_RATE_LIMIT = '2';
  const key = `test-${Date.now()}-${Math.random()}`;
  assert.equal(checkRateLimit(key).allowed, true);
  assert.equal(checkRateLimit(key).allowed, true);
  const rejected = checkRateLimit(key);
  assert.equal(rejected.allowed, false);
  if (!rejected.allowed) assert.ok(rejected.retryAfter > 0);
  if (previous === undefined) delete process.env.ASSISTANT_RATE_LIMIT;
  else process.env.ASSISTANT_RATE_LIMIT = previous;
});

test('inference slot serializes work when the cap is one', async () => {
  process.env.ASSISTANT_MAX_CONCURRENCY = '1';
  try {
    const order: string[] = [];
    await Promise.all([
      withInferenceSlot(async () => {
        order.push('first-start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push('first-end');
      }),
      withInferenceSlot(async () => {
        order.push('second-start');
      }),
    ]);
    assert.deepEqual(order, ['first-start', 'first-end', 'second-start']);
  } finally {
    delete process.env.ASSISTANT_MAX_CONCURRENCY;
  }
});

test('inference slot overlaps work up to the cap and never past it', async () => {
  process.env.ASSISTANT_MAX_CONCURRENCY = '2';
  try {
    let running = 0;
    let peak = 0;
    const hold = () =>
      withInferenceSlot(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
      });
    await Promise.all([hold(), hold(), hold(), hold(), hold()]);
    assert.equal(peak, 2);
  } finally {
    delete process.env.ASSISTANT_MAX_CONCURRENCY;
  }
});

test('inference slot releases the slot when work throws', async () => {
  process.env.ASSISTANT_MAX_CONCURRENCY = '1';
  try {
    await assert.rejects(
      withInferenceSlot(async () => {
        throw new Error('upstream failed');
      }),
      /upstream failed/
    );
    assert.equal(await withInferenceSlot(async () => 'served'), 'served');
  } finally {
    delete process.env.ASSISTANT_MAX_CONCURRENCY;
  }
});
