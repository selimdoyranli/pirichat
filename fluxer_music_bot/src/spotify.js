// Reads Spotify track/album/playlist metadata without an API key.
// The public embed page (open.spotify.com/embed/<type>/<id>) carries a
// __NEXT_DATA__ JSON blob with the title, artists and (for lists) the track list.

import { classifyInput } from './sources.js';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function cleanArtists(text) {
  return String(text ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Pure: embed page HTML -> { type, name, tracks: [{ title, artists, durationMs }] }
 * @param {string} html
 */
export function parseSpotifyEmbed(html) {
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('spotify embed: __NEXT_DATA__ missing');
  const entity = JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity;
  if (!entity || typeof entity !== 'object') throw new Error('spotify embed: entity missing');

  if (entity.type === 'track') {
    const artists = Array.isArray(entity.artists) ? entity.artists.map((a) => a?.name).filter(Boolean).join(', ') : '';
    return {
      type: 'track',
      name: entity.name ?? entity.title ?? '',
      tracks: [{ title: entity.name ?? entity.title ?? '', artists: cleanArtists(artists), durationMs: entity.duration ?? 0 }],
    };
  }

  const list = Array.isArray(entity.trackList) ? entity.trackList : [];
  return {
    type: entity.type ?? 'playlist',
    name: entity.name ?? entity.title ?? '',
    tracks: list
      .filter((t) => t && t.title && t.isPlayable !== false)
      .map((t) => ({ title: t.title, artists: cleanArtists(t.subtitle), durationMs: t.duration ?? 0 })),
  };
}

/** "Artist - Title" search text for YouTube. */
export function spotifySearchQuery(track) {
  return [track.artists, track.title].filter(Boolean).join(' - ');
}

/**
 * @param {{type:string, id:string, url:string}} ref result of classifyInput (kind 'spotify')
 * @param {typeof fetch} fetchImpl
 */
export async function fetchSpotify(ref, fetchImpl = fetch) {
  let { type, id } = ref;
  if (type === 'short') {
    const res = await fetchImpl(ref.url, { redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10_000) });
    const resolved = classifyInput(res.url);
    if (resolved.kind !== 'spotify' || resolved.type === 'short') throw new Error('spotify short link did not resolve');
    ({ type, id } = resolved);
  }
  const res = await fetchImpl(`https://open.spotify.com/embed/${type}/${id}`, {
    headers: { 'user-agent': UA, 'accept-language': 'tr,en;q=0.8' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`spotify embed HTTP ${res.status}`);
  return parseSpotifyEmbed(await res.text());
}
