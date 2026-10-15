// Fluxer gateway details the SDK does not cover. Pure: no I/O.
// References (fork, branch pirichat):
//   fluxer_docs/src/content/docs/gateway/commands.md  (Identify, Voice State Update)
//   fluxer_docs/src/content/docs/gateway/events.md    (VOICE_SERVER_UPDATE, voice state object)
//   fluxer_docs/src/content/docs/voice/index.md       (placement, connection_id semantics)

export const OP_VOICE_STATE_UPDATE = 4;
export const OP_GATEWAY_ERROR = 12;

/** Opens a new voice connection: channel_id and no connection_id. Never p2p. */
export function voiceJoinPayload(guildId, channelId) {
  return {
    op: OP_VOICE_STATE_UPDATE,
    d: {
      guild_id: guildId,
      channel_id: channelId,
      connection_id: null,
      self_mute: false,
      self_deaf: false,
      self_video: false,
      self_stream: false,
    },
  };
}

/** Drops one connection in a guild. Fluxer refuses a guild leave without connection_id. */
export function voiceLeavePayload(guildId, connectionId) {
  return {
    op: OP_VOICE_STATE_UPDATE,
    d: {
      guild_id: guildId,
      channel_id: null,
      connection_id: connectionId,
      self_mute: false,
      self_deaf: false,
      self_video: false,
      self_stream: false,
    },
  };
}

/**
 * @fluxerjs/core always identifies with properties.e2ee_capable = true.
 * This bot does not do LiveKit end-to-end encryption, so the flag is rewritten
 * to false; otherwise an encrypted channel would hand it a key it cannot use.
 * Returns the frame unchanged when it is not an Identify.
 * @param {unknown} frame outgoing WebSocket frame
 */
export function patchIdentifyFrame(frame) {
  if (typeof frame !== 'string' || !frame.includes('"op":2')) return frame;
  let payload;
  try {
    payload = JSON.parse(frame);
  } catch {
    return frame;
  }
  if (payload?.op !== 2 || !payload.d?.properties) return frame;
  payload.d.properties.e2ee_capable = false;
  payload.d.properties.browser = 'pirichat-muzik-bot';
  return JSON.stringify(payload);
}

/** Extracts the refusal code from an Opcode 12 frame, or null. */
export function gatewayErrorCode(frame) {
  if (typeof frame !== 'string' || !frame.includes('"op":12')) return null;
  try {
    const payload = JSON.parse(frame);
    return payload?.op === OP_GATEWAY_ERROR && typeof payload.d?.code === 'string' ? payload.d.code : null;
  } catch {
    return null;
  }
}

/**
 * Who is in which voice channel, keyed by connection (one user can hold
 * several connections). Fed by GUILD_CREATE voice_states and VOICE_STATE_UPDATE.
 */
export class VoiceStateTracker {
  constructor() {
    /** guildId -> Map(connectionKey -> {userId, channelId, bot}) */
    this.guilds = new Map();
  }

  #guild(guildId) {
    let map = this.guilds.get(guildId);
    if (!map) {
      map = new Map();
      this.guilds.set(guildId, map);
    }
    return map;
  }

  static #key(state) {
    return state.connection_id ?? `user:${state.user_id}`;
  }

  /** Full replacement for one guild (GUILD_CREATE). */
  sync(guildId, states) {
    const map = new Map();
    for (const state of states ?? []) {
      if (state?.channel_id && state.user_id) map.set(VoiceStateTracker.#key(state), VoiceStateTracker.#entry(state));
    }
    this.guilds.set(guildId, map);
  }

  static #entry(state) {
    return {
      userId: String(state.user_id),
      channelId: String(state.channel_id),
      bot: state.member?.user?.bot === true,
    };
  }

  /** One VOICE_STATE_UPDATE. Returns the guild id it touched, or null. */
  apply(state) {
    if (!state?.guild_id || !state.user_id) return null;
    const map = this.#guild(String(state.guild_id));
    const key = VoiceStateTracker.#key(state);
    if (state.channel_id) map.set(key, VoiceStateTracker.#entry(state));
    else {
      map.delete(key);
      // A leave without connection_id clears every connection of that user.
      if (!state.connection_id) {
        for (const [k, v] of map) if (v.userId === String(state.user_id)) map.delete(k);
      }
    }
    return String(state.guild_id);
  }

  /** A voice channel the user is in (the most recent one wins if several). */
  channelOf(guildId, userId) {
    let found = null;
    for (const v of this.#guild(guildId).values()) if (v.userId === String(userId)) found = v.channelId;
    return found;
  }

  /** Number of distinct non-bot users in a channel, excluding `selfId`. */
  humansIn(guildId, channelId, selfId) {
    const users = new Set();
    for (const v of this.#guild(guildId).values()) {
      if (v.channelId === channelId && v.userId !== String(selfId) && !v.bot) users.add(v.userId);
    }
    return users.size;
  }
}
