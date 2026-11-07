# Match the browser image to the version pinned in worker/package-lock.json.
FROM mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY worker/package.json worker/package-lock.json ./worker/
RUN npm ci --prefix worker --omit=dev --ignore-scripts
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
