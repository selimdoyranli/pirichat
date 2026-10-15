import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyInput } from '../src/sources.js';

test('YouTube video forms', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=abc',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    '<https://www.youtube.com/watch?v=dQw4w9WgXcQ>',
  ]) {
    const r = classifyInput(url);
    assert.equal(r.kind, 'youtube-video', url);
    assert.equal(r.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  }
});

test('watch link with a list plays only the video; /playlist plays the list', () => {
  assert.equal(classifyInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ').kind, 'youtube-video');
  const pl = classifyInput('https://www.youtube.com/playlist?list=PL1234567890');
  assert.equal(pl.kind, 'youtube-playlist');
  assert.equal(pl.url, 'https://www.youtube.com/playlist?list=PL1234567890');
});

test('Spotify links', () => {
  assert.deepEqual(classifyInput('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=x'), {
    kind: 'spotify', type: 'track', id: '4cOdK2wGLETKBW3PvgPWqT', url: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
  });
  assert.equal(classifyInput('https://open.spotify.com/intl-tr/album/4aawyAB9vmqN3uQ7FjRGTy').type, 'album');
  assert.equal(classifyInput('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M').type, 'playlist');
  assert.equal(classifyInput('https://spotify.link/AbCdEf').type, 'short');
  assert.equal(classifyInput('https://open.spotify.com/artist/0gxyHStUsqpMadRV0Di1Qt').kind, 'unsupported');
});

test('search text, empty, and refused hosts', () => {
  assert.deepEqual(classifyInput('  tarkan kuzu kuzu '), { kind: 'search', query: 'tarkan kuzu kuzu' });
  assert.deepEqual(classifyInput(''), { kind: 'empty' });
  assert.equal(classifyInput('https://soundcloud.com/a/b').kind, 'url');
  assert.equal(classifyInput('http://127.0.0.1:8080/admin').kind, 'unsupported');
  assert.equal(classifyInput('https://example.com/x.mp3').kind, 'unsupported');
  assert.equal(classifyInput('file:///etc/passwd').kind, 'search');
});
