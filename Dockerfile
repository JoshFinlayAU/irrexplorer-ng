# syntax=docker/dockerfile:1

# Build stage: install with the locked versions and produce .output/.
FROM node:26-alpine AS build
WORKDIR /app
# Node 25+ no longer ships corepack; install the pnpm version package.json pins.
RUN npm install -g pnpm@11.21.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Runtime stage: Node plus the self-contained Nitro output, nothing else.
FROM node:26-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS=--max-old-space-size=2048
# tini as PID 1 so SIGTERM from "docker stop" reaches Node and it exits promptly.
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=build --chown=node:node /app/.output ./.output
# Optional download cache (see BULK_CACHE_DIR); a mounted volume inherits this owner.
RUN mkdir -p /app/.cache && chown node:node /app/.cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" > /dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", ".output/server/index.mjs"]
