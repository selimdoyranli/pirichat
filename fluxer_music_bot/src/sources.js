// Classifies what the user typed after !çal. Pure: no I/O.

const YT_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be',
]);
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_TYPES = new Set(['track', 'album', 'playlist']);

function tryUrl(input) {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} raw
 * @returns {{kind:'youtube-video', id:string, url:string}
 *   | {kind:'youtube-playlist', listId:string, url:string}
 *   | {kind:'spotify', type:'track'|'album'|'playlist', id:string, url:string}
 *   | {kind:'url', url:string}
 *   | {kind:'unsupported', url:string}
 *   | {kind:'search', query:string}
 *   | {kind:'empty'}}
 */
export function classifyInput(raw) {
  // Chat clients often wrap links in <...> to suppress embeds.
  const input = String(raw ?? '').trim().replace(/^<(.+)>$/, '$1').trim();
  if (!input) return { kind: 'empty' };

  const url = tryUrl(input);
  if (!url) return { kind: 'search', query: input };

  const host = url.hostname.toLowerCase();

  if (YT_HOSTS.has(host)) {
    let id = null;
    if (host.endsWith('youtu.be')) id = url.pathname.slice(1).split('/')[0];
    else if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = /^\/(shorts|live|embed|v)\/([^/?#]+)/.exec(url.pathname);
      if (m) id = m[2];
    }
    const listId = url.searchParams.get('list');
    if (id && YT_ID.test(id)) {
      // watch?v=X&list=Y plays the single video: shared links often carry an
      // endless auto-generated mix (list=RD...), so only /playlist means "all of it".
      return { kind: 'youtube-video', id, url: `https://www.youtube.com/watch?v=${id}` };
    }
    if (url.pathname === '/playlist' && listId) {
      return { kind: 'youtube-playlist', listId, url: `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}` };
    }
    return { kind: 'unsupported', url: url.toString() };
  }

  if (host === 'open.spotify.com' || host === 'play.spotify.com') {
    // /track/ID, /intl-tr/track/ID, /embed/playlist/ID
    const parts = url.pathname.split('/').filter(Boolean).filter((p) => !/^intl-/.test(p) && p !== 'embed');
    const [type, id] = parts;
    if (SPOTIFY_TYPES.has(type) && /^[A-Za-z0-9]{22}$/.test(id ?? '')) {
      return { kind: 'spotify', type, id, url: `https://open.spotify.com/${type}/${id}` };
    }
    return { kind: 'unsupported', url: url.toString() };
  }

  if (host === 'spotify.link' || host === 'spotify.app.link') {
    // Short links need a redirect lookup; the caller resolves them.
    return { kind: 'spotify', type: 'short', id: '', url: url.toString() };
  }

  if (host === 'soundcloud.com' || host.endsWith('.soundcloud.com')) {
    return { kind: 'url', url: url.toString() };
  }

  // Arbitrary hosts are refused on purpose: yt-dlp's generic extractor would
  // fetch any address, including services on the server's internal network.
  return { kind: 'unsupported', url: url.toString() };
}
