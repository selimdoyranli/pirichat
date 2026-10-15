import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseArgs, streamArgs, searchArgs, playlistArgs, ffmpegArgs, entryToSong } from '../src/ytdlp.js';
import { explainYtDlpError, formatDuration, songLabel } from '../src/text.js';

test('yt-dlp args: cookies and js runtime only when set, url after --', () => {
  assert.equal(baseArgs({ jsRuntime: null }).includes('--cookies'), false);
  assert.equal(baseArgs({ jsRuntime: null }).includes('--js-runtimes'), false);
  const a = streamArgs('-https://evil', { cookiesPath: '/tmp/c.txt', jsRuntime: 'node' });
  assert.deepEqual(a.slice(a.indexOf('--cookies'), a.indexOf('--cookies') + 2), ['--cookies', '/tmp/c.txt']);
  assert.deepEqual(a.slice(-2), ['--', '-https://evil']);
  assert.ok(a.includes('bestaudio/best'));
  assert.deepEqual(searchArgs('x', {}).slice(-1), ['ytsearch1:x']);
  const p = playlistArgs('u', 100, {});
  assert.equal(p[p.indexOf('--playlist-end') + 1], '100');
});

test('ffmpeg outputs 48k stereo s16le', () => {
  const a = ffmpegArgs('volume=0.6');
  assert.deepEqual(a.slice(-7), ['-ac', '2', '-ar', '48000', '-f', 's16le', 'pipe:1']);
  assert.ok(a.includes('volume=0.6'));
  assert.equal(ffmpegArgs('').includes('-af'), false);
});

test('entryToSong handles flat entries and drops private ones', () => {
  assert.deepEqual(entryToSong({ id: 'dQw4w9WgXcQ', title: 'T', duration: 212, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
    { title: 'T', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', duration: 212, live: false });
  assert.equal(entryToSong({ id: 'dQw4w9WgXcQ', title: '[Private video]' }), null);
  assert.equal(entryToSong({ id: 'dQw4w9WgXcQ', title: 'x' }).url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(entryToSong({ title: 'x', duration: null }), null);
});

test('error explanations are Turkish and specific', () => {
  assert.match(explainYtDlpError("ERROR: [youtube] x: Sign in to confirm you're not a bot"), /bot sandı/);
  assert.match(explainYtDlpError('ERROR: [youtube] x: Video unavailable'), /kaldırılmış/);
  assert.match(explainYtDlpError('ERROR: [youtube] x: Private video. Sign in'), /gizli/);
  assert.match(explainYtDlpError('ERROR: Sign in to confirm your age'), /yaş/);
  assert.match(explainYtDlpError(''), /yt-dlp/);
});

test('formatting', () => {
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3725), '1:02:05');
  assert.equal(formatDuration(0), '?:??');
  assert.equal(songLabel({ title: '@everyone *x*', duration: 61 }), '**@​everyone x** (1:01)');
});
