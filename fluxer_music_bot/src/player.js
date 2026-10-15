// One guild's playback: queue, voice connection, idle/alone timers.
// Everything with side effects comes in through `deps`, so the timing rules
// (5 s idle leave, 5 s alone leave) are unit tested with fake timers.

import { SongQueue } from './queue.js';
import { CHANNELS, SAMPLE_RATE, cleanTitleForSearch, isYouTubeUrl } from './ytdlp.js';
import { T, explainYtDlpError } from './text.js';

export const FRAME_MS = 20;
const YOUTUBE_BLOCK_MS = 60 * 60 * 1000;
/** Shared across guilds: the block is on the server's IP, not a channel. */
const YOUTUBE_BLOCK = { until: 0 };
export const SAMPLES_PER_FRAME = (SAMPLE_RATE / 1000) * FRAME_MS; // 960 per channel
const FRAME_BYTES = SAMPLES_PER_FRAME * CHANNELS * 2;

/** Cuts an s16le byte stream into fixed 20 ms frames, carrying leftovers. */
export class PcmFramer {
  constructor() {
    this.rest = Buffer.alloc(0);
  }

  /** @returns {Int16Array[]} */
  push(chunk) {
    const buf = this.rest.length ? Buffer.concat([this.rest, chunk]) : chunk;
    const frames = [];
    let offset = 0;
    while (buf.length - offset >= FRAME_BYTES) {
      const frame = new Int16Array(SAMPLES_PER_FRAME * CHANNELS);
      // Copy instead of viewing: the chunk's byteOffset may be odd.
      Buffer.from(frame.buffer).set(buf.subarray(offset, offset + FRAME_BYTES));
      frames.push(frame);
      offset += FRAME_BYTES;
    }
    this.rest = Buffer.from(buf.subarray(offset));
    return frames;
  }
}

export class GuildPlayer {
  /**
   * @param {object} deps
   * @param {string} deps.guildId
   * @param {(guildId:string, channelId:string) => Promise<any>} deps.joinVoice resolves a VoiceConnection-like object
   * @param {{ stream:(url:string)=>{pcm:AsyncIterable<Buffer>, kill:()=>void, done:Promise<{ok:boolean,stderr:string}>}, search:(q:string)=>Promise<object|null> }} deps.media
   * @param {(samples:Int16Array) => any} deps.makeFrame wraps samples into a LiveKit AudioFrame
   * @param {() => number} deps.humansInChannel non-bot users in the bot's channel
   * @param {number} [deps.idleMs]
   * @param {number} [deps.aloneMs]
   * @param {{setTimeout:Function, clearTimeout:Function}} [deps.timers]
   * @param {(...a:any[]) => void} [deps.log]
   */
  constructor(deps) {
    this.deps = { idleMs: 5000, aloneMs: 5000, timers: globalThis, log: () => {}, ...deps };
    this.guildId = deps.guildId;
    this.queue = new SongQueue();
    this.conn = null;
    this.joining = null;
    this.running = false;
    this.paused = false;
    this.handle = null;
    this.skipRequested = false;
    this.framesPlayed = 0;
    this.idleTimer = null;
    this.aloneTimer = null;
    this.quietSong = null;
    this.say = () => {};
    this.resumeWaiters = [];
  }

  get channelId() {
    return this.conn && !this.conn.closed ? this.conn.channelId : null;
  }

  get elapsedSeconds() {
    return (this.framesPlayed * FRAME_MS) / 1000;
  }

  /** Where announcements go (the channel of the latest command). */
  setAnnouncer(fn) {
    this.say = (text) => Promise.resolve().then(() => fn(text)).catch((err) => this.deps.log('announce failed', err?.message));
  }

  /**
   * Adds songs, joining the caller's voice channel when needed.
   * @param {object[]} songs
   * @param {string} voiceChannelId
   * @param {{quiet?: boolean}} [opts] quiet: the command reply already says "now playing"
   * @returns {Promise<{position:number}>}
   */
  async enqueue(songs, voiceChannelId, { quiet = false } = {}) {
    this.#clearIdle();
    if (!this.conn || this.conn.closed) {
      // Two quick !çal commands share one join.
      this.joining ??= this.deps.joinVoice(this.guildId, voiceChannelId).finally(() => {
        this.joining = null;
      });
      const conn = await this.joining;
      if (this.conn !== conn) this.#attach(conn);
    }
    const position = this.queue.add(songs);
    if (quiet && position === 1) this.quietSong = this.queue.current;
    if (!this.running) this.#run();
    this.checkAlone();
    return { position };
  }

  #attach(conn) {
    this.conn = conn;
    conn.on?.('closed', () => {
      if (this.conn !== conn) return;
      this.deps.log('voice closed', this.guildId);
      this.#reset();
    });
  }

  async #run() {
    this.running = true;
    try {
      while (this.queue.current && this.conn && !this.conn.closed) {
        const song = this.queue.current;
        const outcome = await this.#playOne(song);
        // stop() + a new !çal can replace the queue while we were busy; only advance our own song.
        if (this.queue.current === song) this.queue.advance({ skipped: outcome === 'skipped', failed: outcome === 'failed' });
      }
    } finally {
      this.running = false;
    }
    if (this.conn && !this.conn.closed && !this.queue.current) this.#startIdle();
  }

  async #playOne(song) {
    this.framesPlayed = 0;
    this.skipRequested = false;
    if (!song.url && song.query) {
      try {
        const hit = await this.deps.media.search(song.query);
        if (!hit) {
          this.say(T.playError(song, 'YouTube\'da karşılığını bulamadım.'));
          return 'failed';
        }
        Object.assign(song, { url: hit.url, title: hit.title, duration: hit.duration });
      } catch (err) {
        this.say(T.playError(song, explainYtDlpError(err.stderr)));
        return 'failed';
      }
    }
    if (this.skipRequested || this.queue.current !== song) return 'skipped';
    if (this.quietSong === song) this.quietSong = null;
    else this.say(T.nowPlaying(song));

    // YouTube refuses this server's IP from time to time; once seen, go straight to SoundCloud for a while.
    if (this.#youtubeBlocked() && isYouTubeUrl(song.url)) {
      const moved = await this.#moveToSoundCloud(song);
      if (moved === 'skipped' || moved === 'failed') return moved;
    }
    let result = await this.#pump(song);
    if (result === 'skipped' || result === 'aborted') return result === 'aborted' ? 'failed' : 'skipped';
    if (!result.ok && this.framesPlayed === 0 && /not a bot/i.test(result.stderr) && isYouTubeUrl(song.url)) {
      this.deps.log('youtube blocked, trying soundcloud', song.url);
      YOUTUBE_BLOCK.until = (this.deps.now?.() ?? Date.now()) + YOUTUBE_BLOCK_MS;
      const moved = await this.#moveToSoundCloud(song);
      if (moved === 'skipped' || moved === 'failed') return moved;
      result = await this.#pump(song);
      if (result === 'skipped' || result === 'aborted') return result === 'aborted' ? 'failed' : 'skipped';
    }
    if (!result.ok) {
      this.deps.log('stream failed', song.url, result.stderr.slice(-500));
      this.say(T.playError(song, explainYtDlpError(result.stderr)));
      return 'failed';
    }
    return 'done';
  }

  #youtubeBlocked() {
    return YOUTUBE_BLOCK.until > (this.deps.now?.() ?? Date.now());
  }

  /** Swaps a YouTube song for its SoundCloud match; 'ok', 'failed' (announced) or 'skipped'. */
  async #moveToSoundCloud(song) {
    let hit = null;
    try {
      hit = this.deps.media.searchSoundCloud ? await this.deps.media.searchSoundCloud(cleanTitleForSearch(song.title)) : null;
    } catch (err) {
      this.deps.log('soundcloud search failed', err?.message);
    }
    if (this.skipRequested || this.queue.current !== song) return 'skipped';
    if (!hit) {
      this.say(T.playError(song, "YouTube vermedi, SoundCloud'da da bulamadım."));
      return 'failed';
    }
    Object.assign(song, { url: hit.url, duration: hit.duration || song.duration });
    this.say(T.soundcloudFallback({ ...song, title: hit.title }));
    return 'ok';
  }

  /** Streams one song into the voice source; the pipeline result, or 'skipped' / 'aborted'. */
  async #pump(song) {
    const handle = this.deps.media.stream(song.url);
    this.handle = handle;
    const framer = new PcmFramer();
    let aborted = false;
    try {
      for await (const chunk of handle.pcm) {
        for (const samples of framer.push(chunk)) {
          if (this.paused) await new Promise((resolve) => this.resumeWaiters.push(resolve));
          if (this.skipRequested || !this.conn || this.conn.closed) break;
          const source = this.conn.source;
          if (!source) {
            // Reconnecting after a move: drop the frame but keep real-time pace.
            await new Promise((resolve) => this.deps.timers.setTimeout(resolve, FRAME_MS));
            continue;
          }
          await source.captureFrame(this.deps.makeFrame(samples));
          this.framesPlayed += 1;
        }
        if (this.skipRequested || !this.conn || this.conn.closed) break;
      }
    } catch (err) {
      aborted = true;
      this.deps.log('pcm pump error', err?.message);
    } finally {
      // Leaving the loop early must kill the pipeline, or yt-dlp/ffmpeg block on a full pipe.
      if (aborted || this.skipRequested || !this.conn || this.conn?.closed) handle.kill();
    }
    const result = await handle.done;
    this.handle = null;
    if (this.skipRequested) return 'skipped';
    return result;
  }

  skip() {
    const song = this.queue.current;
    if (!song) return null;
    this.skipRequested = true;
    this.conn?.source?.clearQueue?.();
    this.handle?.kill();
    if (this.paused) this.resume();
    return song;
  }

  pause() {
    if (!this.queue.current || this.paused) return false;
    this.paused = true;
    this.conn?.source?.clearQueue?.();
    return true;
  }

  resume() {
    if (!this.paused) return false;
    this.paused = false;
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    for (const wake of waiters) wake();
    return true;
  }

  /** !durdur: clear everything and leave now. */
  async stop() {
    const conn = this.conn;
    this.#reset();
    if (conn && !conn.closed) await conn.leave();
  }

  #reset() {
    this.queue.clear();
    this.skipRequested = true;
    this.handle?.kill();
    this.conn = null;
    this.quietSong = null;
    this.resume();
    this.#clearIdle();
    this.#clearAlone();
  }

  #startIdle() {
    this.#clearIdle();
    this.idleTimer = this.deps.timers.setTimeout(() => {
      this.idleTimer = null;
      if (this.queue.current || !this.conn) return;
      this.say(T.leftIdle);
      this.stop();
    }, this.deps.idleMs);
  }

  #clearIdle() {
    if (this.idleTimer) this.deps.timers.clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  /** Call on every voice state change in this guild. */
  checkAlone() {
    if (!this.conn || this.conn.closed) return this.#clearAlone();
    if (this.deps.humansInChannel() > 0) return this.#clearAlone();
    if (this.aloneTimer) return;
    this.aloneTimer = this.deps.timers.setTimeout(() => {
      this.aloneTimer = null;
      if (!this.conn || this.deps.humansInChannel() > 0) return;
      this.say(T.leftAlone);
      this.stop();
    }, this.deps.aloneMs);
  }

  #clearAlone() {
    if (this.aloneTimer) this.deps.timers.clearTimeout(this.aloneTimer);
    this.aloneTimer = null;
  }
}
