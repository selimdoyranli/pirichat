import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  voiceJoinPayload, voiceLeavePayload, patchIdentifyFrame, gatewayErrorCode, VoiceStateTracker,
} from '../src/protocol.js';
import { makeWebSocketClass } from '../src/gateway.js';

test('voice join opens a new connection: no connection_id, no p2p', () => {
  const p = voiceJoinPayload('10', '20');
  assert.equal(p.op, 4);
  assert.equal(p.d.guild_id, '10');
  assert.equal(p.d.channel_id, '20');
  assert.equal(p.d.connection_id, null);
  assert.equal('p2p' in p.d, false);
  assert.equal(p.d.self_mute, false);
});

test('voice leave names the connection', () => {
  assert.deepEqual(voiceLeavePayload('10', 'abc').d, {
    guild_id: '10', channel_id: null, connection_id: 'abc', self_mute: false, self_deaf: false, self_video: false, self_stream: false,
  });
});

test('identify frame gets e2ee_capable false, other frames untouched', () => {
  const identify = JSON.stringify({ op: 2, d: { token: 'x', properties: { os: 'linux', browser: 'fluxerjs', device: 'fluxerjs', e2ee_capable: true } } });
  const out = JSON.parse(patchIdentifyFrame(identify));
  assert.equal(out.d.properties.e2ee_capable, false);
  assert.equal(out.d.token, 'x');
  const hb = JSON.stringify({ op: 1, d: 5 });
  assert.equal(patchIdentifyFrame(hb), hb);
  const buf = Buffer.from('x');
  assert.equal(patchIdentifyFrame(buf), buf);
});

test('gateway error code', () => {
  assert.equal(gatewayErrorCode('{"op":12,"d":{"code":"VOICE_CHANNEL_FULL","message":"m"}}'), 'VOICE_CHANNEL_FULL');
  assert.equal(gatewayErrorCode('{"op":0,"t":"X","d":{"op":12}}'), null);
  assert.equal(gatewayErrorCode('nope'), null);
});

test('voice state tracker counts humans per connection', () => {
  const t = new VoiceStateTracker();
  t.sync('g', [
    { guild_id: 'g', channel_id: 'v1', user_id: 'u1', connection_id: 'c1' },
    { guild_id: 'g', channel_id: 'v1', user_id: 'u1', connection_id: 'c2' },
    { guild_id: 'g', channel_id: 'v1', user_id: 'b2', connection_id: 'c3', member: { user: { id: 'b2', bot: true } } },
    { guild_id: 'g', channel_id: 'v1', user_id: 'me', connection_id: 'c4' },
  ]);
  assert.equal(t.channelOf('g', 'u1'), 'v1');
  assert.equal(t.humansIn('g', 'v1', 'me'), 1);
  t.apply({ guild_id: 'g', channel_id: null, user_id: 'u1', connection_id: 'c1' });
  assert.equal(t.humansIn('g', 'v1', 'me'), 1, 'second device still there');
  t.apply({ guild_id: 'g', channel_id: null, user_id: 'u1', connection_id: 'c2' });
  assert.equal(t.humansIn('g', 'v1', 'me'), 0);
  assert.equal(t.channelOf('g', 'u1'), null);
  t.apply({ guild_id: 'g', channel_id: 'v2', user_id: 'u5', connection_id: 'c9' });
  t.apply({ guild_id: 'g', channel_id: 'v1', user_id: 'u5', connection_id: 'c9' }); // moved
  assert.equal(t.channelOf('g', 'u5'), 'v1');
  assert.equal(t.apply({ guild_id: null, user_id: 'x', channel_id: 'dm' }), null);
});

test('websocket wrapper patches identify and observes frames', () => {
  const sent = [];
  class FakeWS {
    constructor(url) { this.url = url; this.listeners = []; }
    addEventListener(type, fn) { if (type === 'message') this.listeners.push(fn); }
    send(data) { sent.push(data); }
  }
  const seen = [];
  const WS = makeWebSocketClass(FakeWS, (d) => seen.push(d));
  const ws = new WS('wss://x/gateway?v=1&encoding=json');
  ws.send(JSON.stringify({ op: 2, d: { token: 't', properties: { os: 'a', browser: 'b', device: 'c', e2ee_capable: true } } }));
  assert.equal(JSON.parse(sent[0]).d.properties.e2ee_capable, false);
  ws.listeners[0]({ data: '{"op":12,"d":{"code":"X"}}' });
  assert.deepEqual(seen, ['{"op":12,"d":{"code":"X"}}']);
});
