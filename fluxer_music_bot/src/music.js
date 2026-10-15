// Turns chat commands into player actions. One GuildPlayer per guild.

import { parseCommand } from './commands.js';
import { classifyInput } from './sources.js';
import { fetchSpotify, spotifySearchQuery } from './spotify.js';
import { T, explainYtDlpError } from './text.js';
import { GuildPlayer } from './player.js';
import { VoiceJoinError } from './voice.js';

const QUEUE_PREVIEW = 10;

export class MusicController {
  /**
   * @param {object} deps
   * @param {object} deps.config            loadConfig() result
   * @param {import('./protocol.js').VoiceStateTracker} deps.tracker
   * @param {{video:Function, playlist:Function, search:Function, stream:Function}} deps.media
   * @param {(guildId:string, channelId:string) => Promise<any>} deps.joinVoice
   * @param {(samples:Int16Array) => any} deps.makeFrame
   * @param {() => string|null} deps.selfId
   * @param {(channelId:string, text:string) => Promise<any>} deps.sendToChannel
   * @param {typeof fetch} [deps.fetch]
   * @param {(...a:any[]) => void} [deps.log]
   */
  constructor(deps) {
    this.deps = { fetch: globalThis.fetch, log: () => {}, ...deps };
    /** @type {Map<string, GuildPlayer>} */
    this.players = new Map();
  }

  player(guildId) {
    let p = this.players.get(guildId);
    if (!p) {
      const { config, tracker, media, joinVoice, makeFrame, selfId, log } = this.deps;
      p = new GuildPlayer({
        guildId,
        joinVoice,
        media,
        makeFrame,
        idleMs: config.idleLeaveMs,
        aloneMs: config.aloneLeaveMs,
        humansInChannel: () => (p.channelId ? tracker.humansIn(guildId, p.channelId, selfId()) : 0),
        log,
      });
      this.players.set(guildId, p);
    }
    return p;
  }

  /** Voice state changed somewhere in this guild. */
  onVoiceActivity(guildId) {
    this.players.get(guildId)?.checkAlone();
  }

  /**
   * @param {{content:string, authorId:string, authorBot:boolean, authorName?:string, guildId:string|null, channelId:string, reply:(text:string)=>Promise<any>}} msg
   */
  async handle(msg) {
    if (msg.authorBot || !msg.guildId) return;
    const cmd = parseCommand(msg.content, this.deps.config.prefix);
    if (!cmd) return;
    try {
      await this.#dispatch(cmd, msg);
    } catch (err) {
      this.deps.log('command failed', cmd.name, err?.stack ?? err);
      await msg.reply('❌ Bir şeyler ters gitti, tekrar dener misin?').catch(() => {});
    }
  }

  async #dispatch(cmd, msg) {
    if (cmd.name === 'help') return msg.reply(T.help);

    const player = this.player(msg.guildId);
    const userChannel = this.deps.tracker.channelOf(msg.guildId, msg.authorId);

    if (cmd.name === 'queue') return msg.reply(this.#queueText(player));
    if (cmd.name === 'nowplaying') {
      const song = player.queue.current;
      return msg.reply(song ? T.current(song, player.elapsedSeconds, player.paused) : T.nothingPlaying);
    }

    // Everything below changes playback: the caller must be in voice, and in our channel if we are connected.
    if (!userChannel) return msg.reply(T.notInVoice);
    if (player.channelId && player.channelId !== userChannel) return msg.reply(T.otherChannel(player.channelId));
    player.setAnnouncer((text) => this.deps.sendToChannel(msg.channelId, text));

    switch (cmd.name) {
      case 'play':
        return this.#play(cmd.args, msg, player, userChannel);
      case 'skip': {
        const song = player.skip();
        return msg.reply(song ? T.skipped(song) : T.nothingPlaying);
      }
      case 'pause':
        if (!player.queue.current) return msg.reply(T.nothingPlaying);
        return msg.reply(player.pause() ? T.paused : T.alreadyPaused);
      case 'resume':
        if (!player.queue.current) return msg.reply(T.nothingPlaying);
        return msg.reply(player.resume() ? T.resumed : T.notPaused);
      case 'stop':
        if (!player.channelId) return msg.reply(T.nothingPlaying);
        await player.stop();
        return msg.reply(T.stopped);
      case 'loop':
        if (!player.queue.current) return msg.reply(T.nothingPlaying);
        return msg.reply(player.queue.toggleLoop() ? T.loopOn : T.loopOff);
      case 'queueloop':
        if (!player.queue.current) return msg.reply(T.nothingPlaying);
        return msg.reply(player.queue.toggleQueueLoop() ? T.queueLoopOn : T.queueLoopOff);
      default:
        return undefined;
    }
  }

  #queueText(player) {
    const { current, upcoming, loop } = player.queue;
    if (!current) return T.queueEmpty;
    return T.queueList(current, upcoming.slice(0, QUEUE_PREVIEW), upcoming.length, loop);
  }

  async #play(args, msg, player, voiceChannelId) {
    const { config, media } = this.deps;
    const input = classifyInput(args);
    const requestedBy = { id: msg.authorId, name: msg.authorName ?? null };
    const tag = (song) => ({ ...song, requestedBy });

    let songs;
    let reply; // (position) => text
    try {
      switch (input.kind) {
        case 'empty':
          return msg.reply(T.needQuery);
        case 'unsupported':
          return msg.reply(T.addError('bu bağlantıyı desteklemiyorum. YouTube, Spotify ya da SoundCloud bağlantısı ver veya şarkının adını yaz.'));
        case 'youtube-video':
        case 'url': {
          const song = tag(await media.video(input.url));
          songs = [song];
          reply = (pos) => (pos === 1 ? T.addedNow(song) : T.addedQueue(song, pos));
          break;
        }
        case 'search': {
          const hit = await media.search(input.query);
          if (!hit) return msg.reply(T.notFound);
          const song = tag(hit);
          songs = [song];
          reply = (pos) => (pos === 1 ? T.addedNow(song) : T.addedQueue(song, pos));
          break;
        }
        case 'youtube-playlist': {
          const list = await media.playlist(input.url, config.playlistLimit);
          if (list.songs.length === 0) return msg.reply(T.notFound);
          songs = list.songs.map(tag);
          const capped = list.songs.length >= config.playlistLimit ? config.playlistLimit : 0;
          reply = () => T.addedPlaylist(songs.length, list.name, capped);
          break;
        }
        case 'spotify': {
          let data;
          try {
            data = await fetchSpotify(input, this.deps.fetch);
          } catch (err) {
            this.deps.log('spotify failed', err?.message);
            return msg.reply(T.spotifyFailed);
          }
          if (data.tracks.length === 0) return msg.reply(T.notFound);
          if (data.type === 'track') {
            const query = spotifySearchQuery(data.tracks[0]);
            const hit = await media.search(query);
            if (!hit) return msg.reply(T.notFound);
            const song = tag(hit);
            songs = [song];
            reply = (pos) => T.spotifyTrack(query, song) + (pos > 1 ? `\n➕ Kuyrukta ${pos}. sırada.` : '');
          } else {
            // Lists are searched lazily, one song at a time, when each comes up.
            songs = data.tracks.slice(0, config.playlistLimit).map((t) => tag({
              title: spotifySearchQuery(t),
              query: spotifySearchQuery(t),
              url: null,
              duration: Math.round((t.durationMs ?? 0) / 1000),
            }));
            reply = () => T.spotifyList(songs.length, data.name);
          }
          break;
        }
        default:
          return msg.reply(T.notFound);
      }
    } catch (err) {
      this.deps.log('resolve failed', input.kind, err?.message, String(err?.stderr ?? '').slice(-300));
      return msg.reply(T.addError(explainYtDlpError(err?.stderr)));
    }

    const room = config.maxQueue - player.queue.size;
    if (room <= 0) return msg.reply(T.queueFull(config.maxQueue));
    if (songs.length > room) songs = songs.slice(0, room);

    // A command can take seconds to resolve; re-check the caller is still with us.
    if (player.channelId && player.channelId !== voiceChannelId) return msg.reply(T.otherChannel(player.channelId));

    try {
      const { position } = await player.enqueue(songs, voiceChannelId, { quiet: songs.length === 1 });
      return msg.reply(reply(position));
    } catch (err) {
      if (err instanceof VoiceJoinError) return msg.reply(T.voiceJoinFailed(err.message));
      throw err;
    }
  }
}
