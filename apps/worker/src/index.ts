import { pingDatabase, type ServiceName } from "@sendcoop/db";
import { pingRedis } from "@sendcoop/redis";

const service: ServiceName = "worker";

// Background jobs: sending, imports, automations, webhooks.
// Queues (BullMQ on Redis) are wired up from D19; for now the process checks
// its connections and stays alive so `pnpm dev` runs every service.

const [postgres, redis] = await Promise.all([pingDatabase(), pingRedis()]);
console.log(
  `[${service}] started (postgres: ${postgres ? "ok" : "DOWN"}, redis: ${redis ? "ok" : "DOWN"})`,
);

const keepAlive = setInterval(() => {}, 60_000);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(keepAlive);
    console.log(`[${service}] stopped`);
    process.exit(0);
  });
}
