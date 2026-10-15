# pirichat müzik botu. Built from the repo root (image workflow: fluxer-music-bot -> fluxer_music_bot/Dockerfile). @livekit/rtc-node ships prebuilt native binaries; we build for linux/amd64.
FROM --platform=linux/amd64 node:22.23.2-bookworm-slim

ENV NODE_ENV=production \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    XDG_CACHE_HOME=/tmp/cache

# ffmpeg from Debian bookworm; yt-dlp pinned in its own venv. The [default,pin]
# extras pin every dependency, including yt-dlp-ejs (YouTube's JS challenge solver,
# run with node via --js-runtimes node).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/yt-dlp \
 && /opt/yt-dlp/bin/pip install "yt-dlp[default,pin]==2026.8.19" \
 && ln -s /opt/yt-dlp/bin/yt-dlp /usr/local/bin/yt-dlp \
 && yt-dlp --version && ffmpeg -version | head -n 1

WORKDIR /app
COPY fluxer_music_bot/package.json fluxer_music_bot/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY fluxer_music_bot/src ./src

USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/index.js"]
