# Build context is the repository root (see docker-compose.yml)
FROM node:22-slim AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/

RUN pnpm install --filter @tabwalk/web... --frozen-lockfile=false

COPY apps/web apps/web
RUN pnpm --filter @tabwalk/web build


FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
