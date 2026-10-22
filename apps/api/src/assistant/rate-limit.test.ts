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

test('inference slot serializes work', async () => {
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
});
