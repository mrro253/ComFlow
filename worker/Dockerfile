# Match the browser image to the version pinned in worker/package-lock.json.
FROM mcr.microsoft.com/playwright:v1.65.0-noble@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d
# Only Chromium is used by the downloader. GStreamer bad plugins support the
# unused WebKit/media stack; remove them and apply available distribution fixes.
RUN apt-get update \
    && apt-get purge -y gstreamer1.0-plugins-bad libgstreamer-plugins-bad1.0-0 \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY worker/package.json worker/package-lock.json ./worker/
RUN npm ci --prefix worker --omit=dev --ignore-scripts
# The running worker invokes Node/tsx directly and never needs global npm/npx.
RUN npm_root="$(npm root -g)"; npm_bin="$(command -v npm)"; npx_bin="$(command -v npx)"; \
    case "$npm_root" in /usr/lib/node_modules|/usr/local/lib/node_modules) ;; *) exit 1 ;; esac; \
    rm -rf "$npm_root/npm" && rm -f "$npm_bin" "$npx_bin"
COPY tsconfig.json ./
COPY worker/tsconfig.json ./worker/
COPY worker/src ./worker/src
COPY lib ./lib
COPY types ./types
COPY --chmod=755 worker/container-entrypoint.sh /usr/local/bin/comflow-worker
RUN mkdir /state && chown pwuser:pwuser /state
ENV CARRIER_BROWSER_MODE=hosted SCHEDULED_SYNC_ENABLED=false LOCALAPPDATA=/state
USER pwuser
ENTRYPOINT ["/usr/local/bin/comflow-worker"]
