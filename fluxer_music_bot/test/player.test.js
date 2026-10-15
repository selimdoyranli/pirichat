import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { GuildPlayer, PcmFramer, SAMPLES_PER_FRAME } from '../src/player.js';

const FRAME_BYTES = SAMPLES_PER_FRAME * 2 * 2;

class FakeTimers {
  constructor() { this.now = 0; this.items = new Map(); this.seq = 0; }
  setTimeout = (fn, ms) => { const id = ++this.seq; this.items.set(id, { fn, at: this.now + ms }); return id; };
  clearTimeout = (id) => { this.items.delete(id); };
  /** Advance fake time, firing due callbacks in order. */
  tick(ms) {
    const end = this.now + ms;
    for (;;) {
      const due = [...this.items.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.items.delete(due[0]);
      this.now = due[1].at;
      due[1].fn();
    }
    this.now = end;
  }
  get pending() { return this.items.size; }
}

const settle = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };

function fakeConn(channelId = 'v1') {
  const conn = new EventEmitter();
  Object.assign(conn, {
    channelId, closed: false, left: 0, frames: 0,
    source: { captureFrame: async () => { conn.frames += 1; }, clearQueue() {} },
    async leave() { conn.closed = true; conn.left += 1; },
  });
  return conn;
}

/** A stream that yields `frames` frames, optionally only after `gate` resolves. */
function fakeMedia({ frames = 3, fail = false } = {}) {
  const streams = [];
  return {
    streams,
    search: async (q) => ({ title: `hit:${q}`, url: `https://y/${q}`, duration: 1 }),
    stream(url) {
      let release;
      const gate = new Promise((r) => { release = r; });
      let killed = false;
      const s = {
        url, release, get killed() { return killed; },
        pcm: (async function* () {
          await gate;
          for (let i = 0; i < frames && !killed; i++) yield Buffer.alloc(FRAME_BYTES);
        })(),
        kill() { killed = true; release(); },
      };
      s.done = gate.then(() => ({ ok: !fail || killed, stderr: fail ? 'ERROR: Video unavailable' : '' }));
      streams.push(s);
      return s;
    },
  };
}

function setup(opts = {}) {
  const timers = new FakeTimers();
  const media = fakeMedia(opts);
  const conns = [];
  const said = [];
  let humans = 1;
  const player = new GuildPlayer({
    guildId: 'g',
    joinVoice: async (_g, ch) => { const c = fakeConn(ch); conns.push(c); return c; },
    media,
    makeFrame: (x) => x,
    humansInChannel: () => humans,
    timers,
    idleMs: 5000,
    aloneMs: 5000,
  });
  player.setAnnouncer((t) => said.push(t));
  return { player, timers, media, conns, said, setHumans: (n) => { humans = n; } };
}

const song = (t) => ({ title: t, url: `https://y/${t}`, duration: 10 });

test('framer cuts 20 ms stereo frames across chunk boundaries', () => {
  const f = new PcmFramer();
  assert.equal(f.push(Buffer.alloc(FRAME_BYTES - 1)).length, 0);
  const frames = f.push(Buffer.alloc(2));
  assert.equal(frames.length, 1);
  assert.equal(frames[0].length, 1920);
  assert.equal(f.rest.length, 1);
  assert.equal(f.push(Buffer.alloc(FRAME_BYTES * 2 - 1)).length, 2);
  assert.equal(f.rest.length, 0);
});

test('plays, then leaves 5 s after the queue runs out', async () => {
  const { player, timers, media, conns, said } = setup();
  const { position } = await player.enqueue([song('a')], 'v1', { quiet: true });
  assert.equal(position, 1);
  await settle();
  media.streams[0].release();
  await settle();
  assert.equal(conns[0].frames, 3);
  assert.equal(player.queue.current, null);
  timers.tick(4999);
  assert.equal(conns[0].left, 0, 'still waiting');
  timers.tick(1);
  await settle();
  assert.equal(conns[0].left, 1, 'left after 5 s');
  assert.ok(said.some((t) => t.includes('Kuyruk bitti')));
  assert.equal(player.channelId, null);
});

test('a new song inside the 5 s window keeps the bot in the channel', async () => {
  const { player, timers, media, conns } = setup();
  await player.enqueue([song('a')], 'v1');
  await settle();
  media.streams[0].release();
  await settle();
  timers.tick(3000);
  await player.enqueue([song('b')], 'v1');
  assert.equal(conns.length, 1, 'no second join');
  timers.tick(10_000);
  await settle();
  assert.equal(conns[0].left, 0, 'idle timer was cancelled');
  assert.equal(player.queue.current.title, 'b');
  media.streams[1].release();
  await settle();
  timers.tick(5000);
  await settle();
  assert.equal(conns[0].left, 1);
});

test('appending while playing returns the queue position', async () => {
  const { player, media, said } = setup();
  await player.enqueue([song('a')], 'v1', { quiet: true });
  assert.equal((await player.enqueue([song('b')], 'v1', { quiet: true })).position, 2);
  assert.equal((await player.enqueue([song('c'), song('d')], 'v1')).position, 3);
  await settle();
  media.streams[0].release();
  await settle();
  assert.equal(player.queue.current.title, 'b');
  assert.ok(said.some((t) => t.includes('Şimdi çalıyor') && t.includes('b')), 'next song is announced');
  assert.ok(!said.some((t) => t.includes('Şimdi çalıyor') && t.includes('**a**')), 'first song was announced by the reply');
});

test('skip kills the stream and moves on; song loop does not trap skip', async () => {
  const { player, media } = setup();
  await player.enqueue([song('a'), song('b')], 'v1');
  player.queue.toggleLoop();
  await settle();
  assert.equal(player.skip().title, 'a');
  await settle();
  assert.equal(media.streams[0].killed, true);
  assert.equal(player.queue.current.title, 'b');
});

test('failed stream reports in Turkish and continues', async () => {
  const { player, media, said } = setup({ fail: true, frames: 0 });
  await player.enqueue([song('a'), song('b')], 'v1');
  await settle();
  media.streams[0].release();
  await settle();
  assert.ok(said.some((t) => t.includes('çalınamadı') && t.includes('kaldırılmış')));
  assert.equal(player.queue.current.title, 'b');
});

test('lazy Spotify entries are searched when they come up', async () => {
  const { player, media } = setup();
  await player.enqueue([{ title: 'A - B', query: 'A - B', url: null }], 'v1');
  await settle();
  assert.equal(media.streams[0].url, 'https://y/A - B');
  assert.equal(player.queue.current.title, 'hit:A - B');
});

test('leaves when nobody is left for 5 s, stays if someone comes back', async () => {
  const { player, timers, conns, setHumans, said } = setup();
  await player.enqueue([song('a')], 'v1');
  await settle();
  setHumans(0);
  player.checkAlone();
  timers.tick(3000);
  setHumans(1);
  player.checkAlone();
  timers.tick(5000);
  assert.equal(conns[0].left, 0);
  setHumans(0);
  player.checkAlone();
  timers.tick(5000);
  await settle();
  assert.equal(conns[0].left, 1);
  assert.ok(said.some((t) => t.includes('kimse kalmadı')));
  assert.equal(player.queue.size, 0);
});

test('stop clears and leaves; remote close resets without a leave', async () => {
  const { player, conns } = setup();
  await player.enqueue([song('a'), song('b')], 'v1');
  await player.stop();
  assert.equal(conns[0].left, 1);
  assert.equal(player.queue.size, 0);

  await player.enqueue([song('c')], 'v1');
  conns[1].closed = true;
  conns[1].emit('closed');
  assert.equal(player.channelId, null);
  assert.equal(player.queue.size, 0);
  assert.equal(conns[1].left, 0);
});

test('pause blocks frames, resume continues', async () => {
  const { player, media, conns } = setup({ frames: 5 });
  await player.enqueue([song('a')], 'v1');
  assert.equal(player.pause(), true);
  assert.equal(player.pause(), false);
  await settle();
  media.streams[0].release();
  await settle();
  assert.equal(conns[0].frames, 0);
  assert.equal(player.resume(), true);
  await settle();
  assert.equal(conns[0].frames, 5);
});
