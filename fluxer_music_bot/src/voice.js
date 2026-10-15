// Joins a Fluxer voice channel and publishes one audio track to LiveKit.
//
// Protocol (see README "Protokol" for the full write-up):
//   1. gateway op 4 {guild_id, channel_id, connection_id: null}  -> opens a connection
//   2. dispatch VOICE_SERVER_UPDATE {token, endpoint, connection_id, channel_id, guild_id}
//   3. LiveKit Room.connect(endpoint, token); identity/metadata are baked into the token
//   4. leave: op 4 {guild_id, channel_id: null, connection_id}
// We do not use @fluxerjs/voice: its LiveKit URL builder drops the path, and
// pirichat serves LiveKit under /livekit, so it would dial the web app instead.

import { EventEmitter } from 'node:events';
import {
  AudioSource,
  LocalAudioTrack,
  Room,
  RoomEvent,
  TrackPublishOptions,
  TrackSource,
} from '@livekit/rtc-node';
import { voiceJoinPayload, voiceLeavePayload } from './protocol.js';
import { CHANNELS, SAMPLE_RATE } from './ytdlp.js';

const JOIN_TIMEOUT_MS = 15_000;
// Small native queue: pause/skip react within this many ms.
const SOURCE_QUEUE_MS = 300;

/** Gateway endpoint -> URL the LiveKit SDK accepts. Keeps the path (/livekit). */
export function normalizeLiveKitUrl(endpoint) {
  const raw = String(endpoint ?? '').trim();
  if (!raw) return null;
  const url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `wss://${raw}`);
  if (url.protocol === 'https:') url.protocol = 'wss:';
  else if (url.protocol === 'http:') url.protocol = 'ws:';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

export class VoiceJoinError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}

/** One live voice connection: a LiveKit room plus our audio source. */
export class VoiceConnection extends EventEmitter {
  constructor(link, guildId, channelId, connectionId) {
    super();
    this.link = link;
    this.guildId = guildId;
    this.channelId = channelId;
    this.connectionId = connectionId;
    /** @type {AudioSource|null} the player writes PCM frames here */
    this.source = null;
    this.room = null;
    this.closed = false;
    this.lastGrant = null;
  }

  /** Connects (or reconnects after a move) with a VOICE_SERVER_UPDATE grant. */
  async connect(grant) {
    if (grant.p2p || !grant.token || !grant.endpoint) {
      throw new VoiceJoinError('P2P', 'kanal eşler arası (P2P) modda; bot yalnız LiveKit üzerinden bağlanabiliyor.');
    }
    if (grant.e2ee_key) {
      throw new VoiceJoinError('E2EE', 'kanal uçtan uca şifreli; bot şifreli sesi desteklemiyor.');
    }
    const url = normalizeLiveKitUrl(grant.endpoint);
    await this.#teardownRoom();

    const room = new Room();
    room.on(RoomEvent.Disconnected, (reason) => {
      if (this.room === room && !this.closed) this.#closedRemotely(`livekit disconnected (${reason})`);
    });
    // We only send audio; never pull other people's streams.
    await room.connect(url, grant.token, { autoSubscribe: false, dynacast: false });

    const source = new AudioSource(SAMPLE_RATE, CHANNELS, SOURCE_QUEUE_MS);
    const track = LocalAudioTrack.createAudioTrack('muzik', source);
    const options = new TrackPublishOptions();
    // The grant allows MICROPHONE when the bot has SPEAK in the channel.
    options.source = TrackSource.SOURCE_MICROPHONE;
    await room.localParticipant.publishTrack(track, options);

    this.room = room;
    this.track = track;
    this.source = source;
    this.channelId = grant.channel_id ?? this.channelId;
    this.lastGrant = grant;
  }

  async #teardownRoom() {
    const { room, source } = this;
    this.room = null;
    this.source = null;
    this.track = null;
    if (source) await source.close().catch(() => {});
    if (room) await room.disconnect().catch(() => {});
  }

  #closedRemotely(reason) {
    if (this.closed) return;
    this.closed = true;
    this.#teardownRoom().finally(() => this.emit('closed', reason));
    this.link.forget(this);
  }

  /** Called by the link when the gateway says our connection is gone. */
  _gatewayClosed() {
    this.#closedRemotely('voice state removed');
  }

  /** Leave on purpose: tell the gateway, then close LiveKit. */
  async leave() {
    if (this.closed) return;
    this.closed = true;
    this.link.forget(this);
    this.link.send(voiceLeavePayload(this.guildId, this.connectionId));
    await this.#teardownRoom();
  }
}

export class VoiceLink {
  /**
   * @param {{ send: (payload: object) => void, selfId: () => string|null, log?: (...a:any[]) => void }} deps
   */
  constructor({ send, selfId, log = () => {} }) {
    this.send = send;
    this.selfId = selfId;
    this.log = log;
    /** guildId -> VoiceConnection */
    this.connections = new Map();
    /** guildId -> {channelId, resolve, reject, timer} */
    this.pending = new Map();
  }

  get(guildId) {
    return this.connections.get(guildId) ?? null;
  }

  forget(conn) {
    if (this.connections.get(conn.guildId) === conn) this.connections.delete(conn.guildId);
  }

  /** @returns {Promise<VoiceConnection>} */
  join(guildId, channelId) {
    const existing = this.connections.get(guildId);
    if (existing && !existing.closed) return Promise.resolve(existing);
    if (this.pending.has(guildId)) return Promise.reject(new VoiceJoinError('BUSY', 'zaten bağlanmaya çalışıyorum.'));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(guildId);
        reject(new VoiceJoinError('TIMEOUT', 'sunucu cevap vermedi. Kanala bağlanma ve konuşma iznim var mı, kanal dolu mu?'));
      }, JOIN_TIMEOUT_MS);
      this.pending.set(guildId, { channelId, resolve, reject, timer });
      this.send(voiceJoinPayload(guildId, channelId));
    });
  }

  /** Dispatch VOICE_SERVER_UPDATE */
  async onServerUpdate(grant) {
    const guildId = grant?.guild_id ? String(grant.guild_id) : null;
    if (!guildId) return; // DM calls are not ours
    const pending = this.pending.get(guildId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(guildId);
      const conn = new VoiceConnection(this, guildId, String(grant.channel_id ?? pending.channelId), grant.connection_id);
      try {
        await conn.connect(grant);
        this.connections.set(guildId, conn);
        pending.resolve(conn);
      } catch (err) {
        conn.closed = true;
        this.send(voiceLeavePayload(guildId, grant.connection_id));
        pending.reject(err instanceof VoiceJoinError ? err : new VoiceJoinError('LIVEKIT', `ses sunucusuna bağlanılamadı (${err.message}).`));
      }
      return;
    }
    // A new grant for a live connection: moved by a moderator or region change.
    const conn = this.connections.get(guildId);
    if (conn && conn.connectionId === grant.connection_id) {
      this.log('voice regrant', guildId, grant.channel_id);
      try {
        await conn.connect(grant);
        conn.emit('moved', conn.channelId);
      } catch (err) {
        this.log('regrant failed', err.message);
        await conn.leave();
        conn.emit('closed', 'regrant failed');
      }
    }
  }

  /** Dispatch VOICE_STATE_UPDATE (any user). Only our own removals matter here. */
  onStateUpdate(state) {
    if (!state?.guild_id || String(state.user_id) !== String(this.selfId())) return;
    const conn = this.connections.get(String(state.guild_id));
    if (!conn || conn.closed) return;
    if (state.connection_id && state.connection_id !== conn.connectionId) return;
    if (!state.channel_id) conn._gatewayClosed();
    else if (String(state.channel_id) !== conn.channelId) conn.channelId = String(state.channel_id);
  }

  /** Gateway op 12 (refused join). The gateway does not say which guild, so fail every pending join. */
  onGatewayError(code) {
    const reason = {
      VOICE_CHANNEL_FULL: 'kanal dolu.',
      VOICE_P2P_CONSENT_REQUIRED: 'kanal eşler arası (P2P) modda; bot bu modda bağlanamıyor. Kanalda kimse yokken ya da P2P kapalıyken tekrar dene.',
      VOICE_P2P_UNAVAILABLE: 'kanal eşler arası (P2P) modda; bot bu modda bağlanamıyor.',
    }[code] ?? `sunucu reddetti (${code}).`;
    for (const [guildId, pending] of this.pending) {
      clearTimeout(pending.timer);
      this.pending.delete(guildId);
      pending.reject(new VoiceJoinError(code, reason));
    }
  }

  /** On a fresh gateway session the old voice connections are gone server side. */
  dropAll(reason) {
    for (const conn of [...this.connections.values()]) conn._gatewayClosed(reason);
  }
}
