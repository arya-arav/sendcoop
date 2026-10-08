# One image for the web app, the edge (tracking) and the worker (D82); the
# compose file runs each with its own command. Built from the repo root:
#   docker build -t sendcoop .
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
# The build doesn't connect to anything; these only satisfy config checks.
RUN BETTER_AUTH_SECRET=build-only BETTER_AUTH_URL=http://localhost:3000 \
    DATABASE_URL=postgres://build:build@localhost:5432/build REDIS_URL=redis://localhost:6379 \
    ENCRYPTION_KEY=YnVpbGQtb25seS1rZXktZG8tbm90LXVzZS1hbnl3aGVyZSE= \
    pnpm build

FROM base AS runtime
ENV NODE_ENV=production
# pg_dump and psql for the backup service; curl for health checks.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data/storage && chown node:node /data/storage
USER node
EXPOSE 3000 3001 3002
CMD ["pnpm", "--filter", "@sendcoop/web", "start"]
