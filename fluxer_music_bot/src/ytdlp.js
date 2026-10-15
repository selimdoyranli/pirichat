// yt-dlp + ffmpeg wrappers. Argument builders are pure and unit tested;
// the spawn helpers are thin.

import { spawn } from 'node:child_process';
import { copyFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SAMPLE_RATE = 48000;
export const CHANNELS = 2;

/**
 * yt-dlp rewrites its cookie jar on exit, so a read-only mounted file is
 * copied to a private temp file first.
 * @returns {string|null} path to use with --cookies
 */
export function prepareCookies(sourcePath) {
  if (!sourcePath) return null;
  const target = join(tmpdir(), 'muzik-bot-cookies.txt');
  copyFileSync(sourcePath, target);
  chmodSync(target, 0o600);
  return target;
}

/** Options every yt-dlp call shares. */
export function baseArgs({ cookiesPath = null, jsRuntime = 'node' } = {}) {
  const args = ['--ignore-config', '--no-update', '--no-warnings', '--no-progress', '--socket-timeout', '15'];
  if (jsRuntime) args.push('--js-runtimes', jsRuntime);
  if (cookiesPath) args.push('--cookies', cookiesPath);
  return args;
}

export function videoInfoArgs(url, opts) {
  return [...baseArgs(opts), '-J', '--no-playlist', '--', url];
}

export function playlistArgs(url, limit, opts) {
  return [...baseArgs(opts), '-J', '--flat-playlist', '--playlist-end', String(limit), '--', url];
}

export function searchArgs(query, opts) {
  return [...baseArgs(opts), '-J', '--flat-playlist', '--', `ytsearch1:${query}`];
}

export function soundcloudSearchArgs(query, opts) {
  return [...baseArgs(opts), '-J', '--flat-playlist', '--', `scsearch1:${query}`];
}

/** Drops video-only noise ("(Official Music Video)", "[HD]", "Lyrics") so the SoundCloud search matches the song. */
export function cleanTitleForSearch(title = '') {
  return String(title)
    .replace(/[([](?:[^)\]]*?(?:official|video|audio|lyrics?|clip|klip|hd|4k|mv|visualizer|remaster(?:ed)?)[^)\]]*?)[)\]]/gi, ' ')
    .replace(/\b(?:official (?:music )?video|lyric video|music video|video ?clip|official audio)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isYouTubeUrl(url = '') {
  return /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\//i.test(url);
}

export function streamArgs(url, opts) {
  // HLS sources (SoundCloud) would write .part fragments into the read-only working dir; ffmpeg streams them instead.
  return [
    ...baseArgs(opts),
    '-q',
    '--no-playlist',
    '-f',
    'bestaudio/best',
    '--downloader',
    'm3u8:ffmpeg',
    '-o',
    '-',
    '--',
    url,
  ];
}

/** ffmpeg: whatever yt-dlp gives -> 48 kHz stereo s16le PCM on stdout. */
export function ffmpegArgs(audioFilter = '') {
  const args = ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn'];
  if (audioFilter) args.push('-af', audioFilter);
  args.push('-ac', String(CHANNELS), '-ar', String(SAMPLE_RATE), '-f', 's16le', 'pipe:1');
  return args;
}

const BAD_TITLES = new Set(['[Private video]', '[Deleted video]', '[Unavailable video]']);

/** yt-dlp JSON entry -> song fields. Returns null for unplayable entries. */
export function entryToSong(entry) {
  if (!entry || BAD_TITLES.has(entry.title)) return null;
  let url = entry.webpage_url || entry.original_url || entry.url;
  if (!url && entry.id) url = `https://www.youtube.com/watch?v=${entry.id}`;
  if (!url) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(url)) url = `https://www.youtube.com/watch?v=${url}`;
  return {
    title: entry.title || url,
    url,
    duration: Number.isFinite(entry.duration) ? entry.duration : 0,
    live: entry.live_status === 'is_live' || entry.is_live === true,
  };
}

/** Runs a command and collects output. Rejects with stderr attached on failure. */
export function run(cmd, args, { timeoutMs = 60_000, maxBytes = 32 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    let size = 0;
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) child.kill('SIGKILL');
      else out.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(Object.assign(err, { stderr }));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(out).toString('utf8'));
      else reject(Object.assign(new Error(`${cmd} exited with ${code ?? signal}`), { stderr: stderr || String(signal ?? '') }));
    });
  });
}

/** High level resolver used by the player. */
export class YtDlp {
  constructor({ ytdlpPath = 'yt-dlp', ffmpegPath = 'ffmpeg', cookiesPath = null, jsRuntime = 'node', audioFilter = '' } = {}) {
    this.bin = ytdlpPath;
    this.ffmpeg = ffmpegPath;
    this.opts = { cookiesPath, jsRuntime };
    this.audioFilter = audioFilter;
  }

  async video(url) {
    const info = JSON.parse(await run(this.bin, videoInfoArgs(url, this.opts)));
    const song = entryToSong(info);
    if (!song) throw Object.assign(new Error('unplayable'), { stderr: 'Video unavailable' });
    return song;
  }

  /** @returns {Promise<{name:string, songs:object[]}>} */
  async playlist(url, limit) {
    const info = JSON.parse(await run(this.bin, playlistArgs(url, limit, this.opts)));
    const songs = (info.entries ?? []).map(entryToSong).filter(Boolean).slice(0, limit);
    return { name: info.title ?? '', songs };
  }

  /** First YouTube search hit, or null. */
  async search(query) {
    const info = JSON.parse(await run(this.bin, searchArgs(query, this.opts), { timeoutMs: 30_000 }));
    const first = (info.entries ?? []).map(entryToSong).find(Boolean);
    return first ?? null;
  }

  /** First SoundCloud search hit, or null. Used when YouTube refuses this server. */
  async searchSoundCloud(query) {
    const info = JSON.parse(await run(this.bin, soundcloudSearchArgs(query, this.opts), { timeoutMs: 30_000 }));
    const first = (info.entries ?? []).map(entryToSong).find(Boolean);
    return first ?? null;
  }

  /**
   * Starts yt-dlp | ffmpeg for one song.
   * @returns {{ pcm: import('node:stream').Readable, kill: () => void, done: Promise<{ok:boolean, stderr:string}> }}
   */
  stream(url) {
    const dl = spawn(this.bin, streamArgs(url, this.opts), { stdio: ['ignore', 'pipe', 'pipe'], cwd: tmpdir() });
    const ff = spawn(this.ffmpeg, ffmpegArgs(this.audioFilter), { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    const note = (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    };
    dl.stderr.on('data', note);
    ff.stderr.on('data', note);
    dl.stdout.pipe(ff.stdin);
    // A killed reader makes the writer fail with EPIPE; that is expected on skip.
    ff.stdin.on('error', () => {});
    dl.stdout.on('error', () => {});

    let killed = false;
    const exited = (child) => new Promise((resolve) => {
      child.on('error', (err) => {
        note(String(err.message));
        resolve(-1);
      });
      child.on('close', (code) => resolve(code));
    });
    const done = Promise.all([exited(dl), exited(ff)]).then(([dlCode, ffCode]) => ({
      ok: killed || (dlCode === 0 && ffCode === 0),
      stderr,
    }));
    return {
      pcm: ff.stdout,
      done,
      kill() {
        killed = true;
        dl.kill('SIGKILL');
        ff.kill('SIGKILL');
      },
    };
  }
}
