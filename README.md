# Sendcoop

Email marketing for affiliate, ecommerce and lead-gen, measured in revenue. Plan: [../ROADMAP.md](../ROADMAP.md).

## Layout

| Path             | What                                            | Dev URL               |
| ---------------- | ----------------------------------------------- | --------------------- |
| `apps/web`       | Next.js dashboard, admin, API routes            | http://localhost:3000 |
| `apps/edge`      | Hono service for opens, clicks, postbacks       | http://localhost:3001 |
| `apps/worker`    | Background jobs (sending, imports, automations) | –                     |
| `packages/db`    | Database schema and client, shared by all apps  | –                     |
| `packages/redis` | Shared Redis connection (queues, rate limits)   | –                     |

## Requirements

Node 24+, pnpm 10, Docker.

## Local services

`docker-compose.yml` runs Postgres 18, Redis 8 and Mailpit. Ports are offset so they don't clash with other local projects:

| Service      | Port | Notes                            |
| ------------ | ---- | -------------------------------- |
| Postgres     | 5434 | user / password / db: `sendcoop` |
| Redis        | 6381 | `noeviction`, as BullMQ requires |
| Mailpit SMTP | 1026 | catches all outgoing mail        |
| Mailpit UI   | 8027 | http://localhost:8027            |

All apps read the single `.env` at the repo root.

## Commands

```sh
pnpm install
cp .env.example .env
pnpm services:up    # start Postgres, Redis, Mailpit
pnpm db:migrate     # apply database migrations
pnpm dev          # start web, edge and worker together
pnpm typecheck
pnpm lint
pnpm build
pnpm format
pnpm services:down  # stop them (data is kept)
```

## Database

Schema lives in `packages/db/src/schema` (Drizzle, snake_case columns, UUIDv7 ids from Postgres 18).

```sh
pnpm db:generate --name <change>      # write a migration after editing the schema
pnpm db:migrate                       # apply pending migrations
pnpm db:studio                        # browse data
```

Health checks: `GET :3000/api/health`, `GET :3001/health`. Each reports Postgres and Redis, and returns 503 if either is down.
