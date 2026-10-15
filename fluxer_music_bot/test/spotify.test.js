import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpotifyEmbed, spotifySearchQuery, fetchSpotify } from '../src/spotify.js';

const page = (entity) => `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity } } } } })}</script></html>`;

test('track embed', () => {
  const r = parseSpotifyEmbed(page({ type: 'track', name: 'Never Gonna Give You Up', artists: [{ name: 'Rick Astley' }], duration: 213573 }));
  assert.equal(r.type, 'track');
  assert.deepEqual(r.tracks, [{ title: 'Never Gonna Give You Up', artists: 'Rick Astley', durationMs: 213573 }]);
  assert.equal(spotifySearchQuery(r.tracks[0]), 'Rick Astley - Never Gonna Give You Up');
});

test('album/playlist embed keeps playable tracks, normalises nbsp', () => {
  const r = parseSpotifyEmbed(page({
    type: 'album', name: 'Global Warming',
    trackList: [
      { title: 'Global Warming (feat. Sensato)', subtitle: 'Pitbull, Sensato', duration: 85400, isPlayable: true },
      { title: 'Gone', subtitle: 'X', isPlayable: false },
    ],
  }));
  assert.equal(r.name, 'Global Warming');
  assert.deepEqual(r.tracks, [{ title: 'Global Warming (feat. Sensato)', artists: 'Pitbull, Sensato', durationMs: 85400 }]);
});

test('broken page throws', () => {
  assert.throws(() => parseSpotifyEmbed('<html></html>'));
});

test('fetchSpotify uses the embed endpoint', async () => {
  const seen = [];
  const fakeFetch = async (url) => {
    seen.push(url);
    return { ok: true, url, text: async () => page({ type: 'track', name: 'A', artists: [{ name: 'B' }] }) };
  };
  const r = await fetchSpotify({ type: 'track', id: '4cOdK2wGLETKBW3PvgPWqT', url: '' }, fakeFetch);
  assert.equal(seen[0], 'https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT');
  assert.equal(r.tracks[0].artists, 'B');
});
