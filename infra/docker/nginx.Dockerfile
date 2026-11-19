# syntax=docker/dockerfile:1
# Контекст сборки — корень репозитория (см. docker-compose.prod.yml).
FROM node:22-alpine AS frontend-build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.21.0 --activate

COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
ENV NODE_ENV=production
RUN pnpm run build

# Стабильная ветка nginx; `hooba update` собирает с --pull и подтягивает патчи 1.30.x.
# Не ниже 1.30.7: исправлены CVE-2026-123007 и CVE-2026-123633 (HTTP/2, у нас http2 on).
FROM nginx:1.30-alpine
COPY infra/docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY infra/docker/nginx/turns.conf.stream-template /etc/nginx/templates/turns.conf.stream-template
COPY --from=frontend-build /app/dist /usr/share/nginx/html
