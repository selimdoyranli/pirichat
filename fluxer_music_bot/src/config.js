import { existsSync } from 'node:fs';

function intFromEnv(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Reads settings from the environment. The token is returned but never logged.
 * @param {NodeJS.ProcessEnv} env
 */
export function loadConfig(env = process.env) {
  const token = (env.FLUXER_BOT_TOKEN ?? '').trim();
  const cookiesPath = env.YTDLP_COOKIES_FILE || '/run/secrets/youtube-cookies';
  return {
    token,
    instance: (env.FLUXER_INSTANCE || 'https://pirichat.online').replace(/\/+$/, ''),
    prefix: env.PREFIX || '!',
    idleLeaveMs: intFromEnv(env, 'IDLE_LEAVE_MS', 5000),
    aloneLeaveMs: intFromEnv(env, 'ALONE_LEAVE_MS', 5000),
    playlistLimit: intFromEnv(env, 'PLAYLIST_LIMIT', 100),
    maxQueue: intFromEnv(env, 'MAX_QUEUE', 500),
    ytdlpPath: env.YTDLP_PATH || 'yt-dlp',
    ffmpegPath: env.FFMPEG_PATH || 'ffmpeg',
    // Only used when the file actually exists, so the default path is harmless.
    cookiesFile: existsSync(cookiesPath) ? cookiesPath : null,
    // yt-dlp needs a JavaScript runtime for YouTube; node is always present in our image.
    ytdlpJsRuntime: env.YTDLP_JS_RUNTIME ?? 'node',
    audioFilter: env.AUDIO_FILTER ?? 'volume=0.6',
    debug: env.DEBUG === '1',
  };
}
