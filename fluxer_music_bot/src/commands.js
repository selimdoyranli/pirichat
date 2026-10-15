// Text command parsing. Pure: no I/O.

const ALIASES = {
  play: ['çal', 'cal', 'play', 'p', 'oynat'],
  skip: ['atla', 'geç', 'gec', 'skip', 's', 'next'],
  pause: ['duraklat', 'dur', 'pause'],
  resume: ['devam', 'resume', 'sürdür', 'surdur'],
  stop: ['durdur', 'stop', 'çık', 'cik', 'leave'],
  queue: ['kuyruk', 'liste', 'queue', 'q'],
  loop: ['döngü', 'dongu', 'tekrar', 'loop'],
  queueloop: ['kuyrukdöngü', 'kuyrukdongu', 'queueloop', 'loopqueue'],
  nowplaying: ['şimdi', 'simdi', 'np', 'nowplaying', 'çalan', 'calan'],
  help: ['yardım', 'yardim', 'help', 'komutlar'],
};

const LOOKUP = new Map();
for (const [name, words] of Object.entries(ALIASES)) {
  for (const word of words) LOOKUP.set(word, name);
}

/**
 * "!ÇAL tarkan" -> { name: 'play', args: 'tarkan' }. Unknown commands and
 * plain chat return null so the bot stays quiet.
 * @param {string} content
 * @param {string} prefix
 */
export function parseCommand(content, prefix = '!') {
  if (typeof content !== 'string') return null;
  const text = content.trim();
  if (!text.startsWith(prefix)) return null;
  const body = text.slice(prefix.length);
  const match = /^(\S+)\s*([\s\S]*)$/.exec(body);
  if (!match) return null;
  const word = match[1].toLocaleLowerCase('tr-TR');
  const name = LOOKUP.get(word);
  if (!name) return null;
  return { name, args: match[2].trim() };
}
