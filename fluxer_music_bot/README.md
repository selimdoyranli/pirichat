# pirichat müzik botu

Ses kanalında müzik çalan bot. YouTube ya da Spotify linki atınca ya da şarkı adını yazınca çalar, yeni gelenleri kuyruğa ekler. Liste bitince 5 saniye bekler, yeni şarkı gelmezse kanaldan çıkar. Kanalda kimse kalmazsa da 5 saniye sonra çıkar.

Fluxer'ın kendisine dokunmaz. Ayrı bir container olarak çalışır, pirichat'e normal bir bot hesabı gibi bağlanır, sesi de LiveKit'e diğer katılımcılar gibi gönderir.

## Komutlar

Bot okuyabildiği her metin kanalında dinler. Çalmayla ilgili komutlar için önce bir ses kanalına girmen gerekiyor; bot senin kanalına gelir.

| Komut | Ne yapar |
| --- | --- |
| `!çal <link ya da şarkı adı>` | Çalar. Bir şey çalıyorsa kuyruğa ekler ve kaçıncı sırada olduğunu söyler. Kısaca `!p` ya da `!play`. |
| `!atla` | Sıradaki şarkıya geçer. |
| `!duraklat` / `!devam` | Duraklatır, kaldığı yerden sürdürür. |
| `!durdur` | Kuyruğu temizler, kanaldan hemen çıkar. |
| `!kuyruk` | Çalanı ve sıradaki 10 şarkıyı gösterir. |
| `!şimdi` | Çalan şarkıyı, geçen süreyi ve linkini gösterir. |
| `!döngü` | Çalan şarkıyı tekrar tekrar çalar (tekrar yazınca kapanır). |
| `!kuyrukdöngü` | Liste bitince baştan başlar. |
| `!yardım` | Bu listeyi gösterir. |

Türkçe klavyesi olmayanlar için `!cal`, `!dongu`, `!simdi`, `!yardim` gibi yazımlar da çalışır.

`!çal` neleri kabul ediyor:

- **YouTube video linki** (`youtube.com/watch`, `youtu.be`, `shorts`, `music.youtube.com`). Linkte `&list=` olsa bile yalnız o video çalar; YouTube'un paylaşım linklerine eklediği sonsuz "mix" listeleri yüzünden böyle.
- **YouTube playlist linki** (`youtube.com/playlist?list=...`). İlk 100 şarkı eklenir.
- **Spotify şarkı, albüm ya da playlist linki.** Spotify'dan ses alınamıyor; bot şarkının adını ve sanatçısını Spotify'ın herkese açık embed sayfasından okur, YouTube'da arar ve bulduğunu çalar. Albüm ve playlist'te her şarkı sırası gelince aranır. Embed sayfası çok uzun listelerin hepsini vermeyebilir; bu sınır denenmedi.
- **SoundCloud linki.**
- **Düz metin**: YouTube'da arar, ilk sonucu çalar.

Başka sitelerin linkleri bilerek reddediliyor: yt-dlp verilen her adrese gider, buna izin vermek sunucunun iç ağındaki servislere istek attırmak olurdu.

## Kurulum

Bot pirichat'in ana compose'unda `music-bot` servisi olarak çalışır (`deploy/self-hosting/docker-compose.yml`); imajı diğer imajlarla birlikte `pirichat-imaj` iş akışı derler (`fluxer-music-bot`). Token yokken servis boşta bekler.

1. pirichat'te **Ayarlar › Uygulamalar** sayfasında yeni bir uygulama aç (ör. `pirichatMuzik`), bot kullanıcısını oluştur ve bot token'ını kopyala. Tam değer yalnız oluşturulduğu ya da yenilendiği an görünür.
2. Coolify'da pirichat uygulamasının ortam değişkenlerine `PIRICHAT_MUSIC_BOT_TOKEN` olarak gir ve yeniden deploy et. Token'ı dosyaya, sohbete ya da repoya yazma.
3. Botu bir sunucuya eklemek için şu linki aç (`<uygulama_id>` yerine uygulamanın ID'si):

```
https://pirichat.online/oauth2/authorize?client_id=<uygulama_id>&scope=bot&permissions=3214336
```

`3214336` şu izinlerin toplamı: Kanalları görüntüle (`VIEW_CHANNEL`, 1024), Mesaj gönder (`SEND_MESSAGES`, 2048), Mesaj geçmişini oku (`READ_MESSAGE_HISTORY`, 65536), Bağlan (`CONNECT`, 1048576), Konuş (`SPEAK`, 2097152). Konuşma izni olmayan bir kanala bot girer ama ses gönderemez.

Loglarda `bağlandı: <bot adı> (...)` satırını görünce bot hazır.

Bağlantı bekçisi: sohbet sunucusu yeniden başlayınca SDK bazen sonsuz "WebSocket error" döngüsüne giriyor ve bir daha
bağlanamıyor (metin komutları çalışır görünür, ses gelmez). `src/watchdog.js` bir dakikada 20'den fazla hata görüp 30
saniye içinde "bağlandı" gelmezse süreci 1 koduyla kapatır, Docker (`restart: unless-stopped`) yeniden başlatır. Aynı
hata üst üste gelince log'a bir kez yazılıp tekrar sayısı eklenir. Modül genel; başka bir bot da aynı şekilde kullanabilir.

Ayarlar `.env` içinde (hepsi isteğe bağlı, örnekleri `.env.example`'da):

| Değişken | Varsayılan | Anlamı |
| --- | --- | --- |
| `FLUXER_INSTANCE` | `https://pirichat.online` (compose: `PIRICHAT_MUSIC_BOT_INSTANCE`) | Bağlanılacak Fluxer sunucusu. Adresler `/.well-known/fluxer`'dan okunur. |
| `PREFIX` | `!` | Komut ön eki. |
| `IDLE_LEAVE_MS` | `5000` | Liste bitince çıkmadan önce bekleme. |
| `ALONE_LEAVE_MS` | `5000` | Kanalda kimse kalmayınca çıkmadan önce bekleme. |
| `PLAYLIST_LIMIT` | `100` | Bir listeden en fazla kaç şarkı alınır. |
| `MAX_QUEUE` | `500` | Kuyruk üst sınırı. |
| `AUDIO_FILTER` | `volume=0.6` | ffmpeg ses filtresi. Ses seviyesi eşitlemek istersen `loudnorm=I=-16:TP=-1.5:LRA=11` (biraz daha CPU yer). Boş bırakırsan filtre yok. |
| `DEBUG` | `0` | `1` olursa voice olaylarını loglar. |

## YouTube engeli ve çerez dosyası

YouTube veri merkezi IP'lerinden gelen istekleri zaman zaman "bot olmadığını doğrula" diye geri çeviriyor. Bu olursa bot kanala "YouTube bu sunucuyu bot sandı" diye yazar. Çözüm, YouTube'a giriş yapmış bir tarayıcının çerezlerini yt-dlp'ye vermek.

Bunun için ayrı, önemsiz bir Google hesabı kullan; kişisel hesabını kullanma, YouTube bu tür kullanımda hesabı kısıtlayabiliyor.

1. Gizli pencerede o hesapla youtube.com'a gir, bir video aç.
2. Çerezleri Netscape biçiminde dışa aktar (yt-dlp'nin önerdiği yol: [yt-dlp wiki, "Exporting YouTube cookies"](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies)). Ardından gizli pencereyi kapat; açık kalırsa YouTube çerezleri yeniler ve dosyadaki eskir.
3. Dosyayı sunucuya, bot klasöründeki `secrets/` altına koy. Yalnız botun okuyabileceği izinleri ver:

   ```sh
   mkdir -p secrets
   mv ~/youtube-cookies.txt secrets/youtube-cookies.txt
   sudo chown 1000:1000 secrets/youtube-cookies.txt   # container içindeki node kullanıcısı
   chmod 400 secrets/youtube-cookies.txt
   ```

4. Çerez dosyasını container'a `/run/secrets/youtube-cookies` yolundan bağla (compose'da `secrets` ya da salt okunur volume) ve yeniden deploy et. Logda `yt-dlp cookie file in use` görünür.

Dosya container'a salt okunur bağlanır (`/run/secrets/youtube-cookies`). Bot açılışta onu `/tmp` altına kopyalayıp oradan kullanır, çünkü yt-dlp çerezleri her çalışmada geri yazmak istiyor. Çerezleri ortam değişkenine koyma: `docker inspect` ve loglarda görünür hale gelir. `secrets/` klasörü `.gitignore`'da, repoya girmez.

## Nasıl çalışıyor

```
metin kanalı ──!çal──▶ bot ──yt-dlp (arama/çözümleme)
                        │
                        ├─ gateway op 4 ──▶ Fluxer ──VOICE_SERVER_UPDATE (LiveKit adresi + token)
                        │
yt-dlp ─▶ ffmpeg (48 kHz, stereo, s16le) ─▶ 20 ms'lik parçalar ─▶ LiveKit AudioSource ─▶ ses kanalı
```

- Gateway ve REST için [`@fluxerjs/core`](https://www.npmjs.com/package/@fluxerjs/core) kullanılıyor; adresler pirichat'in `/.well-known/fluxer` belgesinden okunur.
- Ses için `@fluxerjs/voice` kullanılmıyor. O paket LiveKit adresinin yolunu atıyor (`wss://pirichat.online/livekit` → `wss://pirichat.online`), pirichat'de LiveKit `/livekit` altında olduğu için web uygulamasına bağlanmaya çalışıyor. Bunun yerine voice'a girişi `src/voice.js` kendisi yapıyor ve sesi doğrudan `@livekit/rtc-node` ile gönderiyor.
- Ses hızı LiveKit'in kendi kuyruğuyla ayarlanıyor: kuyruk 300 ms dolunca `captureFrame` bekliyor, böylece ffmpeg çıktısı gerçek zamandan hızlı akmıyor. Duraklatınca ve atlayınca kuyruk boşaltılıyor.

### Protokol notları

Fork'taki (branch `pirichat`) kaynaklardan çıkarıldı:

- **Kimlik doğrulama.** REST'te `Authorization: Bot <token>`; gateway Identify'da token öneksiz gider (`fluxer_docs/src/content/docs/authentication.md`, `gateway/overview.md`).
- **Gateway.** `wss://pirichat.online/gateway?v=1&encoding=json`, sıkıştırma yok (`compress=zstd-stream&stream=1` istenmedikçe sıkıştırma kapalı). Hello (op 10) → Identify (op 2) → Ready; heartbeat Hello'daki aralıkla, Resume op 6. Intent sistemi yok; bot oturumu hiçbir guild'de "passive" olmadığı için her `MESSAGE_CREATE` mention olmadan da gelir (`gateway/event-filtering.md`).
- **Identify.** `@fluxerjs/core` `properties.e2ee_capable: true` gönderiyor. Bot uçtan uca şifreleme yapmadığı için `src/gateway.js` bu alanı `false` yapıyor; yoksa VOICE_E2EE açık bir guild'de bota kullanamayacağı bir anahtar verilirdi. Bot oturumları şifreli kanallardan zaten muaf (`fluxer_gateway/src/guild/voice/guild_voice_e2ee.erl`, `check_join_allowed_guild`).
- **Voice'a giriş.** Op 4 `{guild_id, channel_id, connection_id: null, self_mute, self_deaf, self_video, self_stream}`: `connection_id` olmadan gönderilince yeni bağlantı açılır. Cevap olarak yalnız bu oturuma `VOICE_SERVER_UPDATE {token, endpoint, connection_id, channel_id, guild_id}` gelir. `endpoint` LiveKit adresi, token 600 saniyelik ve oda adı (`guild_<id>_channel_<id>`), katılımcı kimliği (`user_<id>_<connection_id>`), metadata ve yayın izinleri token'ın içinde (`fluxer_api/src/api/infrastructure/LiveKitService.ts`). Yani bot kimliğini kendisi ayarlamıyor; diğer istemcilerde katılımcı olarak görünmesi ve oda/koltuk mantığının çalışması için ayrıca bir şey gerekmiyor (koltuklar LiveKit `participant_joined` webhook'uyla sunucu tarafında atanıyor, `voice_seat/VoiceMembershipHooks.ts`).
- **Onay.** Gateway bağlantıyı önce "pending" tutar, LiveKit webhook'u katılımcının odaya girdiğini bildirince ses durumu herkese yayınlanır (`guild_voice_connection_confirm.erl`). Bu yüzden LiveKit'e bağlanmak tek başına yeterli.
- **Ses kaynağı.** Token `SPEAK` izni varsa `MICROPHONE` kaynağına yayın hakkı verir; bot tek bir mikrofon track'i yayınlar, kimseye abone olmaz (`autoSubscribe: false`).
- **Çıkış.** Op 4 `{guild_id, channel_id: null, connection_id}`. Guild'den çıkarken `connection_id` zorunlu, yoksa `VOICE_MISSING_CONNECTION_ID` ile sessizce reddedilir.
- **Reddedilen girişler.** Yalnız `VOICE_CHANNEL_FULL`, `VOICE_P2P_CONSENT_REQUIRED`, `VOICE_P2P_UNAVAILABLE` op 12 ile bildirilir; diğer retler (izin yok, zaman aşımı) hiç cevap vermez. Bot 15 saniye bekleyip kanala Türkçe hata yazar.
- **Bot ve P2P.** Gateway bot oturumunun P2P isteğini hep reddeder (`voice_p2p.erl`, `agreed(true, true) -> false`). İçinde yalnız P2P katılımcılar olan bir kanala bot giremez, kanal "P2P modunda" diye cevap verir.

## Doğrulananlar ve doğrulanamayanlar

Yerelde (macOS, Node 25) doğrulandı:

- Birim testleri: `npm test` (komut ayrıştırma, link sınıflandırma, Spotify embed ayrıştırma, kuyruk ve döngüler, 5 saniyelik boşta/yalnız kalma zamanlayıcıları, gateway payload'ları, Identify yaması).
- yt-dlp + ffmpeg hattı gerçek bir YouTube videosuyla: 10,8 saniyelik video 541 adet 20 ms'lik parçaya bölündü, WAV olarak 48 kHz, 2 kanal, s16le çıktı. YouTube araması, playlist okuma, Spotify şarkı/albüm okuma ve Spotify → YouTube eşleşmesi canlı çalıştı.
- `@livekit/rtc-node` macOS arm64'te AudioSource'a 3 saniyelik ses itildi; kuyruk gerçek zamanlı bekletti.
- pirichat'e geçersiz token'la LiveKit bağlantısı denendi: `wss://pirichat.online/livekit` LiveKit'in kendisinden 401 döndü (yani yol korunuyor), `wss://pirichat.online` web uygulamasına düştü.
- Gateway'e bağlanınca sıkıştırmasız Hello geldi.

Token olmadan doğrulanamayanlar: gerçek Identify, voice'a giriş ve sesin diğer kullanıcılara ulaşması. Docker yerelde kurulu olmadığı için image da derlenmedi. İlk kurulumda yapılacak kontrol: botu bir ses kanalına çağır, `!çal` ile kısa bir şarkı çal, başka bir hesaptan sesin geldiğini ve botun katılımcı listesinde göründüğünü gör, sonra `!durdur` ve 5 saniyelik çıkışı dene.

## Bilinen riskler

- **YouTube engeli.** Yukarıdaki çerez bölümü. yt-dlp sürümü image'da sabit; YouTube değiştikçe güncellemek gerekecek (`Dockerfile`'daki `yt-dlp[default,pin]==...` satırı).
- **Aynı makinede LiveKit.** Bot pirichat ile aynı VPS'te çalışırsa medya, container'dan sunucunun kendi dış IP'sine (7884/udp, 7883/tcp) gider. Docker bridge'de bu genelde çalışır; ses gelmezse `docker-compose.yml`'a `network_mode: host` eklemek ilk denenecek şey.
- **P2P ve şifreli kanallar.** Bot P2P modundaki kanallara giremez. Uçtan uca şifreleme pirichat'de varsayılan olarak yalnız `VOICE_E2EE` özelliği açık guild'lerde devrede. Bot oralarda şifresiz bağlanır (gateway buna izin verip yalnız log düşüyor); şifreli konuşan istemcilerin botun şifresiz sesini çalıp çalmadığı denenmedi.
- **Uzun gateway kopmaları.** Gateway kopan oturumu 60 saniye saklıyor, kısa kopmalarda Resume ile devam edilir. Daha uzun kopmada yeni oturum açılır; bot bu durumda çalmayı sıfırlıyor, `!çal` ile yeniden başlatmak gerekir.
- **Spotify embed sayfası.** Resmi bir API değil; Spotify sayfanın yapısını değiştirirse Spotify linkleri çalışmaz olur, YouTube etkilenmez. `spotify.link` kısa linkleri canlı denenmedi.
