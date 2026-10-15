import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceLink, VoiceJoinError, normalizeLiveKitUrl } from '../src/voice.js';

test('LiveKit URL keeps the /livekit path', () => {
  assert.equal(normalizeLiveKitUrl('wss://pirichat.online/livekit'), 'wss://pirichat.online/livekit');
  assert.equal(normalizeLiveKitUrl('https://pirichat.online:443/livekit/'), 'wss://pirichat.online/livekit');
  assert.equal(normalizeLiveKitUrl('pirichat.online/livekit'), 'wss://pirichat.online/livekit');
  assert.equal(normalizeLiveKitUrl('http://livekit:7880'), 'ws://livekit:7880');
  assert.equal(normalizeLiveKitUrl(''), null);
});

test('join sends op 4 and a refused join rejects with a Turkish reason', async () => {
  const sent = [];
  const link = new VoiceLink({ send: (p) => sent.push(p), selfId: () => 'me' });
  const p = link.join('g', 'v');
  assert.equal(sent[0].op, 4);
  assert.equal(sent[0].d.channel_id, 'v');
  await assert.rejects(link.join('g', 'v'), (e) => e.code === 'BUSY');
  link.onGatewayError('VOICE_CHANNEL_FULL');
  await assert.rejects(p, (e) => e instanceof VoiceJoinError && /dolu/.test(e.message));
});

test('a P2P or E2EE grant is refused and the connection is released', async () => {
  for (const grant of [
    { guild_id: 'g', channel_id: 'v', connection_id: 'c1', p2p: true, ice_servers: [] },
    { guild_id: 'g', channel_id: 'v', connection_id: 'c2', token: 't', endpoint: 'wss://x/livekit', e2ee_key: 'k' },
  ]) {
    const sent = [];
    const link = new VoiceLink({ send: (p) => sent.push(p), selfId: () => 'me' });
    const p = link.join('g', 'v');
    await link.onServerUpdate(grant);
    await assert.rejects(p, (e) => e instanceof VoiceJoinError);
    assert.equal(sent.at(-1).d.channel_id, null);
    assert.equal(sent.at(-1).d.connection_id, grant.connection_id);
    assert.equal(link.get('g'), null);
  }
});

test('own voice state removal closes the connection', () => {
  const link = new VoiceLink({ send: () => {}, selfId: () => 'me' });
  let closed = false;
  const conn = { guildId: 'g', connectionId: 'c', closed: false, channelId: 'v', _gatewayClosed() { closed = true; } };
  link.connections.set('g', conn);
  link.onStateUpdate({ guild_id: 'g', user_id: 'someone', channel_id: null, connection_id: 'c' });
  assert.equal(closed, false);
  link.onStateUpdate({ guild_id: 'g', user_id: 'me', channel_id: 'v2', connection_id: 'c' });
  assert.equal(conn.channelId, 'v2');
  link.onStateUpdate({ guild_id: 'g', user_id: 'me', channel_id: null, connection_id: 'c' });
  assert.equal(closed, true);
});
