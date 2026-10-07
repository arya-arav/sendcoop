import type { ServiceName } from "@sendcoop/db";

const service: ServiceName = "worker";

// Background jobs: sending, imports, automations, webhooks.
// Queues (BullMQ on Redis) are wired up from D19; for now the process just
// starts and stays alive so `pnpm dev` runs every service.

console.log(`[${service}] started, waiting for queues (none registered yet)`);

const keepAlive = setInterval(() => {}, 60_000);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(keepAlive);
    console.log(`[${service}] stopped`);
    process.exit(0);
  });
}
