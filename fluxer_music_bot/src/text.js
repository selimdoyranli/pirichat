// Every message users see lives here, in Turkish.

/** Seconds -> "M:SS" or "H:MM:SS". Unknown or live duration -> "canlı/?" placeholder. */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '?:??';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Song title for chat: no mentions, no markdown links, bounded length. */
export function songLabel(song) {
  const title = String(song.title ?? 'Bilinmeyen şarkı')
    .replace(/@/g, '@​')
    .replace(/[`*_~|]/g, '')
    .slice(0, 120);
  const duration = song.duration ? ` (${formatDuration(song.duration)})` : '';
  return `**${title}**${duration}`;
}

export const T = {
  notInVoice: '❌ Önce bir ses kanalına girmen lazım.',
  otherChannel: (channelId) => `❌ Şu an başka bir ses kanalında çalıyorum (<#${channelId}>). Oraya gel ya da \`!durdur\` ile beni çıkar.`,
  needQuery: '❌ Ne çalayım? Örnek: `!çal https://youtu.be/...` ya da `!çal tarkan şımarık`',
  searching: (q) => `🔎 Aranıyor: ${q}`,
  notFound: '❌ Şarkı bulunamadı!',
  nowPlaying: (song) => `🎶 Şimdi çalıyor: ${songLabel(song)}`,
  addedNow: (song) => `🎶 Çalıyor: ${songLabel(song)}`,
  addedQueue: (song, pos) => `➕ Kuyruğa eklendi (${pos}. sıra): ${songLabel(song)}`,
  addedPlaylist: (count, name, capped) =>
    `📃 ${name ? `**${name}** listesinden ` : ''}${count} şarkı kuyruğa eklendi.${capped ? ` (En fazla ${capped} şarkı alıyorum.)` : ''}`,
  spotifyTrack: (artistTitle, song) => `🟢 Spotify: ${artistTitle} → YouTube'da bulduğum: ${songLabel(song)}`,
  spotifyList: (count, name) =>
    `🟢 Spotify ${name ? `**${name}** ` : ''}listesinden ${count} şarkı eklendi. Her şarkıyı sırası gelince YouTube'da arayıp çalacağım.`,
  spotifyFailed: '❌ Spotify bağlantısını okuyamadım. Bağlantı herkese açık mı?',
  queueFull: (max) => `❌ Kuyruk dolu (en fazla ${max} şarkı).`,
  nothingPlaying: '❌ Şu an çalan bir şey yok.',
  skipped: (song) => `⏭️ Geçildi: ${songLabel(song)}`,
  paused: '⏸️ Duraklatıldı. Devam etmek için `!devam`.',
  alreadyPaused: '⏸️ Zaten duraklatılmış.',
  resumed: '▶️ Devam ediyoruz.',
  notPaused: '▶️ Zaten çalıyor.',
  stopped: '⏹️ Kuyruk temizlendi, kanaldan çıktım.',
  loopOn: '🔂 Şarkı döngüsü açık: bu şarkı tekrar tekrar çalacak.',
  loopOff: '➡️ Şarkı döngüsü kapandı.',
  queueLoopOn: '🔁 Kuyruk döngüsü açık: liste bitince baştan başlayacak.',
  queueLoopOff: '➡️ Kuyruk döngüsü kapandı.',
  queueEmpty: '📭 Kuyruk boş.',
  queueList: (current, upcoming, total, loopMode) => {
    const lines = [];
    if (current) lines.push(`🎶 Şimdi: ${songLabel(current)}`);
    upcoming.forEach((song, i) => lines.push(`${i + 1}. ${songLabel(song)}`));
    const rest = total - upcoming.length;
    if (rest > 0) lines.push(`…ve ${rest} şarkı daha`);
    if (loopMode === 'song') lines.push('🔂 Şarkı döngüsü açık');
    if (loopMode === 'queue') lines.push('🔁 Kuyruk döngüsü açık');
    return lines.join('\n');
  },
  current: (song, elapsed, paused) =>
    `${paused ? '⏸️' : '🎶'} ${songLabel(song)}\n⏱️ ${formatDuration(elapsed)} / ${formatDuration(song.duration)}${song.url ? `\n🔗 <${song.url}>` : ''}`,
  soundcloudFallback: (song) => `🔁 YouTube vermedi, SoundCloud'dan çalıyorum: ${songLabel(song)}`,
  playError: (song, reason) => `❌ ${songLabel(song)} çalınamadı: ${reason} Sıradakine geçiyorum.`,
  addError: (reason) => `❌ Eklenemedi: ${reason}`,
  voiceJoinFailed: (reason) => `❌ Ses kanalına bağlanamadım: ${reason}`,
  leftIdle: '👋 Kuyruk bitti, kanaldan çıktım.',
  leftAlone: '👋 Kanalda kimse kalmadı, ben de çıktım.',
  help: [
    '🎵 **Müzik komutları**',
    '`!çal <YouTube/Spotify bağlantısı ya da şarkı adı>`: çalar ya da kuyruğa ekler (kısaca `!p`, `!play`)',
    '`!atla`: sıradaki şarkıya geçer',
    '`!duraklat` / `!devam`: duraklatır, kaldığı yerden sürdürür',
    '`!durdur`: kuyruğu temizler ve kanaldan çıkar',
    '`!kuyruk`: sıradaki şarkıları gösterir',
    '`!şimdi`: çalan şarkıyı gösterir',
    '`!döngü`: şarkıyı tekrarlar, `!kuyrukdöngü`: bütün listeyi tekrarlar',
    'Komutları kullanmak için bir ses kanalında olman gerekiyor. Liste bitince 5 saniye bekler, yeni şarkı gelmezse çıkarım.',
  ].join('\n'),
};

/** Maps yt-dlp/ffmpeg stderr to a short Turkish reason. */
export function explainYtDlpError(stderr = '') {
  const s = String(stderr);
  if (/not a bot/i.test(s)) {
    return "YouTube bu sunucuyu bot sandı ve videoyu vermedi (çerez dosyası gerekebilir).";
  }
  if (/Private video/i.test(s)) return 'video gizli.';
  if (/confirm your age|age.restricted|inappropriate for some users/i.test(s)) return 'video yaş doğrulaması istiyor.';
  if (/members-only|Join this channel/i.test(s)) return 'video yalnız kanal üyelerine açık.';
  if (/not available in your country|geo.?restrict|blocked it in your country/i.test(s)) return 'video bu ülkede engelli.';
  if (/Video unavailable|This video is unavailable|has been removed|does not exist/i.test(s)) return 'video kaldırılmış ya da erişilemiyor.';
  if (/live event will begin|Premieres in/i.test(s)) return 'yayın henüz başlamadı.';
  if (/Unsupported URL|is not a valid URL/i.test(s)) return 'bu bağlantıyı tanımıyorum.';
  if (/HTTP Error 429|Too Many Requests/i.test(s)) return 'YouTube çok fazla istek dedi, biraz sonra tekrar dene.';
  if (/timed out|timeout/i.test(s)) return 'zaman aşımı oldu.';
  return 'yt-dlp hata verdi.';
}
