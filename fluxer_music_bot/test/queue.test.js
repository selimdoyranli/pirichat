import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SongQueue } from '../src/queue.js';

const s = (t) => ({ title: t });

test('positions and advance', () => {
  const q = new SongQueue();
  assert.equal(q.add(s('a')), 1);
  assert.equal(q.add(s('b')), 2);
  assert.equal(q.add([s('c'), s('d')]), 3);
  assert.equal(q.size, 4);
  assert.equal(q.advance().title, 'b');
  assert.equal(q.advance().title, 'c');
  assert.equal(q.advance().title, 'd');
  assert.equal(q.advance(), null);
  assert.equal(q.size, 0);
});

test('song loop repeats on finish but a skip moves on', () => {
  const q = new SongQueue();
  q.add([s('a'), s('b')]);
  assert.equal(q.toggleLoop(), true);
  assert.equal(q.advance().title, 'a');
  assert.equal(q.advance({ skipped: true }).title, 'b');
  assert.equal(q.advance({ failed: true }), null);
});

test('queue loop rotates, failed songs drop out', () => {
  const q = new SongQueue();
  q.add([s('a'), s('b')]);
  assert.equal(q.toggleQueueLoop(), true);
  assert.equal(q.advance().title, 'b');
  assert.equal(q.advance().title, 'a');
  assert.equal(q.advance({ failed: true }).title, 'b');
  assert.equal(q.advance().title, 'b');
  assert.equal(q.toggleQueueLoop(), false);
  assert.equal(q.toggleLoop(), true);
  assert.equal(q.loop, 'song');
});
