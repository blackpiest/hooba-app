# syntax=docker/dockerfile:1
# glibc: официальный mediasoup-worker на Alpine (musl) стартует и сразу падает с SIGSEGV.
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    python3 \
    python3-pip \
    python-is-python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.21.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
COPY assets ./assets

RUN pnpm prisma generate && pnpm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system hooba \
  && useradd --system --gid hooba --create-home --shell /usr/sbin/nologin hooba \
  && mkdir -p /data/uploads && chown hooba:hooba /data/uploads && chmod 755 /data/uploads

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/dist ./dist
COPY --from=base /app/assets ./assets
RUN chown -R hooba:hooba /app
USER hooba

ENV NODE_ENV=production
# Бинарники из образа. pnpm/corepack на старте качает менеджер в $HOME и падает:
# у пользователя hooba нет права создать /home/hooba/.cache.
ENV PATH="/app/node_modules/.bin:${PATH}"
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "prisma migrate deploy && prisma db seed && node dist/main.js"]
