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

FROM nginx:1.27-alpine
COPY infra/docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=frontend-build /app/dist /usr/share/nginx/html
