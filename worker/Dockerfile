# Match the browser image to the version pinned in worker/package-lock.json.
FROM mcr.microsoft.com/playwright:v1.64.0-noble
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
ENV CARRIER_BROWSER_MODE=hosted SCHEDULED_SYNC_ENABLED=false LOCALAPPDATA=/state
USER pwuser
CMD ["node", "worker/node_modules/tsx/dist/cli.mjs", "--tsconfig", "worker/tsconfig.json", "worker/src/index.ts"]
