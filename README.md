# Sendcoop

Email marketing for affiliate, ecommerce and lead-gen, measured in revenue. Plan: [../ROADMAP.md](../ROADMAP.md).

## Layout

| Path          | What                                            | Dev URL               |
| ------------- | ----------------------------------------------- | --------------------- |
| `apps/web`    | Next.js dashboard, admin, API routes            | http://localhost:3000 |
| `apps/edge`   | Hono service for opens, clicks, postbacks       | http://localhost:3001 |
| `apps/worker` | Background jobs (sending, imports, automations) | –                     |
| `packages/db` | Database schema and client, shared by all apps  | –                     |

## Requirements

Node 24+, pnpm 10.

## Commands

```sh
pnpm install
cp .env.example .env
pnpm dev          # start web, edge and worker together
pnpm typecheck
pnpm lint
pnpm build
pnpm format
```

Health checks: `GET :3000/api/health`, `GET :3001/health`.
