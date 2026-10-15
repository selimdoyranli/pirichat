import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGatewayWatchdog } from '../src/watchdog.js';

function harness() {
  const logs = [];
  const stuck = [];
  const dog = createGatewayWatchdog({
    log: (...a) => logs.push(a.join(' ')),
    onStuck: (r) => stuck.push(r),
    errorBurst: 3,
    windowMs: 1000,
    recoveryMs: 20,
    logEveryMs: 1000,
  });
  return { dog, logs, stuck };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('a burst without Ready asks for a restart', async () => {
  const { dog, stuck } = harness();
  dog.noteError('WebSocket error');
  dog.noteError('WebSocket error');
  assert.equal(dog.pending, false);
  dog.noteError('WebSocket error');
  assert.equal(dog.pending, true);
  await wait(40);
  assert.equal(stuck.length, 1);
});

test('Ready during the grace period cancels the restart', async () => {
  const { dog, stuck } = harness();
  for (let i = 0; i < 3; i++) dog.noteError('WebSocket error');
  dog.noteReady();
  assert.equal(dog.pending, false);
  await wait(40);
  assert.equal(stuck.length, 0);
});

test('repeated identical errors are counted, not printed', () => {
  const { dog, logs } = harness();
  for (let i = 0; i < 50; i++) dog.noteError('WebSocket error');
  const printed = logs.filter((l) => l.startsWith('client error:'));
  assert.equal(printed.length, 1);
});

test('scattered errors below the burst never trigger', async () => {
  let t = 0;
  const stuck = [];
  const dog = createGatewayWatchdog({ log: () => {}, onStuck: (r) => stuck.push(r), errorBurst: 3, windowMs: 100, recoveryMs: 10, now: () => t });
  dog.noteError('x'); t += 200;
  dog.noteError('x'); t += 200;
  dog.noteError('x');
  assert.equal(dog.pending, false);
  await wait(30);
  assert.equal(stuck.length, 0);
});
