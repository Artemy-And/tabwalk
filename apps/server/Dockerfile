# Build context is the repository root (see docker-compose.yml)
FROM node:22-slim AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/

RUN pnpm install --filter @skiplink/server... --frozen-lockfile=false

COPY apps/server apps/server
RUN pnpm --filter @skiplink/server build


FROM node:22-slim AS runtime

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/

RUN pnpm install --filter @skiplink/server... --prod --frozen-lockfile=false \
  && pnpm --filter @skiplink/server exec playwright install --with-deps chromium \
  && pnpm store prune

COPY --from=build /app/apps/server/dist apps/server/dist
COPY apps/server/drizzle apps/server/drizzle

WORKDIR /app/apps/server

# Chromium will not run as root without --no-sandbox; the flags are set in
# runner.ts, but we drop privileges anyway.
RUN groupadd -r scanner && useradd -r -g scanner -m scanner \
  && chown -R scanner:scanner /app /ms-playwright
USER scanner

CMD ["node", "dist/index.js", "api"]
