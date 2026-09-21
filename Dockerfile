# syntax=docker/dockerfile:1

# Build tools are only needed if better-sqlite3 has to compile from source.
FROM node:25-bookworm-slim AS toolchain
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./

FROM toolchain AS build
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM toolchain AS prod-deps
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:25-bookworm-slim AS runtime
ARG HUB_VERSION=dev
ENV NODE_ENV=production \
    HUB_VERSION=${HUB_VERSION} \
    HUB_HOST=127.0.0.1 \
    HUB_PORT=3000 \
    HUB_DATA_DIR=/data
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
COPY package.json ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.HUB_PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/server/index.js"]
