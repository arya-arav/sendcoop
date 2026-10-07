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

Performance check for the subscriber table (search uses a trigram index, paging uses cursors):

```sh
pnpm --filter @sendcoop/db seed:subscribers <workspace-slug> 100000
pnpm --filter @sendcoop/db bench:subscribers <workspace-slug>
```

With 100,000 subscribers every query used by the Contacts page takes 4–35 ms, and full page loads take 60–75 ms locally.

## Auth

Better Auth (`apps/web/src/lib/auth.ts`) with email + password and required email verification. Its "organizations" are our workspaces (`workspaces` / `memberships` / `invitations` tables).

Flow: `/signup` → confirmation email (see Mailpit at http://localhost:8027) → `/onboarding` to name the workspace → `/w/<slug>`. Pages under `/w/<slug>` return 404 to anyone who isn't a member.

Set `BETTER_AUTH_SECRET` in `.env` (`openssl rand -base64 32`).

## Tests

```sh
pnpm test                          # unit tests (Vitest)
PW_CHANNEL=msedge pnpm test:e2e     # browser tests (Playwright) using installed Edge
```

Browser tests need `pnpm services:up` and migrations; they start `pnpm dev` unless it is already running. Without `PW_CHANNEL`, run `pnpm --filter @sendcoop/web exec playwright install chromium` once.

CI (`.github/workflows/ci.yml`) runs format, lint, typecheck, unit tests and build, then the browser tests against a production build with Postgres, Redis and Mailpit service containers. `AUTH_RATE_LIMIT=disabled` is set for that job only, because many signups come from one IP.

## UI

shadcn/ui (Base UI primitives) in `apps/web/src/components/ui`; add components with `pnpm dlx shadcn@latest add <name>` from `apps/web`. The workspace shell (sidebar, switcher, account menu with light/dark/system theme) is in `src/components/shell`.

Health checks: `GET :3000/api/health`, `GET :3001/health`. Each reports Postgres and Redis, and returns 503 if either is down.
