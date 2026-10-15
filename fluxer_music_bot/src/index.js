// pirichat müzik botu: entry point. Wires the Fluxer SDK, voice link and players.

import { Client, Events } from '@fluxerjs/core';
import { AudioFrame } from '@livekit/rtc-node';
import { loadConfig } from './config.js';
import { makeWebSocketClass } from './gateway.js';
import { MusicController } from './music.js';
import { CHANNELS, SAMPLE_RATE, YtDlp, prepareCookies } from './ytdlp.js';
import { SAMPLES_PER_FRAME } from './player.js';
import { VoiceStateTracker, gatewayErrorCode } from './protocol.js';
import { VoiceLink } from './voice.js';
import { createGatewayWatchdog } from './watchdog.js';

const config = loadConfig();
const log = (...args) => console.log(new Date().toISOString(), ...args);
const debug = config.debug ? log : () => {};

if (!config.token) {
  // Runs in the main compose before a bot token exists; exiting would make Docker restart it forever.
  console.error('FLUXER_BOT_TOKEN tanımlı değil; bot bekliyor. Token Coolify ortam değişkeni PIRICHAT_MUSIC_BOT_TOKEN olarak girilince yeniden deploy et.');
  // A pending top-level await alone exits with code 13; the timer keeps the event loop alive.
  setInterval(() => {}, 1 << 30);
  await new Promise(() => {});
}

const media = new YtDlp({
  ytdlpPath: config.ytdlpPath,
  ffmpegPath: config.ffmpegPath,
  cookiesPath: prepareCookies(config.cookiesFile),
  jsRuntime: config.ytdlpJsRuntime,
  audioFilter: config.audioFilter,
});
if (config.cookiesFile) log('yt-dlp cookie file in use');

const tracker = new VoiceStateTracker();
let voice = null;

const SocketClass = makeWebSocketClass(globalThis.WebSocket, (data) => {
  const code = gatewayErrorCode(data);
  if (code) {
    log('gateway refused voice join:', code);
    voice?.onGatewayError(code);
  }
});

const client = await Client.fromDiscovery(config.instance, {
  WebSocket: SocketClass,
  cache: { messages: false, members: 500 },
  ignoredEvents: ['TYPING_START', 'MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE', 'PRESENCE_UPDATE'],
  defaultAllowedMentions: { parse: [], repliedUser: false },
});

voice = new VoiceLink({
  send: (payload) => client.sendToGateway(0, payload),
  selfId: () => client.user?.id ?? null,
  log,
});

const controller = new MusicController({
  config,
  tracker,
  media,
  joinVoice: (guildId, channelId) => voice.join(guildId, channelId),
  makeFrame: (samples) => new AudioFrame(samples, SAMPLE_RATE, CHANNELS, SAMPLES_PER_FRAME),
  selfId: () => client.user?.id ?? null,
  sendToChannel: (channelId, text) => client.channels.send(channelId, { content: text, allowedMentions: { parse: [] } }),
  log,
});

// Reconnect storms after a server redeploy never produced a Ready again (see watchdog.js); exit with 1 so Docker
// restarts the process. Normal exit codes stay 0 so an operator's stop is not retried.
const watchdog = createGatewayWatchdog({
  log,
  onStuck: (reason) => {
    log(`${reason}; yeniden başlatılmak üzere çıkıyorum`);
    const leaving = [...controller.players.values()].map((p) => p.stop().catch(() => {}));
    Promise.race([Promise.all(leaving), new Promise((r) => setTimeout(r, 3000))]).finally(() => {
      client.destroy?.();
      process.exit(1);
    });
  },
});

let readyOnce = false;
client.on(Events.Ready, () => {
  watchdog.noteReady();
  log(`bağlandı: ${client.user?.username ?? '?'} (${client.user?.id ?? '?'})`);
  // A second Ready means a fresh session: the old one's voice connections are gone.
  if (readyOnce) voice.dropAll('new gateway session');
  readyOnce = true;
});

client.on(Events.VoiceStatesSync, ({ guildId, voiceStates }) => {
  tracker.sync(String(guildId), voiceStates);
  controller.onVoiceActivity(String(guildId));
});

client.on(Events.VoiceStateUpdate, (state) => {
  debug('VOICE_STATE_UPDATE', state?.guild_id, state?.user_id, state?.channel_id, state?.connection_id);
  voice.onStateUpdate(state);
  const guildId = tracker.apply(state);
  if (guildId) controller.onVoiceActivity(guildId);
});

client.on(Events.VoiceServerUpdate, (grant) => {
  debug('VOICE_SERVER_UPDATE', grant?.guild_id, grant?.channel_id, grant?.connection_id, grant?.endpoint);
  voice.onServerUpdate(grant).catch((err) => log('voice server update failed', err?.message));
});

client.on(Events.MessageCreate, (message) => {
  controller
    .handle({
      content: message.content,
      authorId: message.author?.id,
      authorBot: message.author?.bot === true,
      authorName: message.author?.username,
      guildId: message.guildId,
      channelId: message.channelId,
      reply: (text) => message.reply({ content: text, allowedMentions: { parse: [] } }, { ping: false }),
    })
    .catch((err) => log('message handler failed', err?.message));
});

client.on(Events.Error, (err) => watchdog.noteError(String(err?.message ?? err)));

async function shutdown(signal) {
  log(`${signal} alındı, kapanıyorum`);
  const leaving = [...controller.players.values()].map((p) => p.stop().catch(() => {}));
  await Promise.race([Promise.all(leaving), new Promise((r) => setTimeout(r, 3000))]);
  client.destroy?.();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await client.login(config.token);
