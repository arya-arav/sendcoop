import {
  getSql,
  pingDatabase,
  type ServiceName,
  systemTxtLookup,
  verifyDueDomains,
} from "@sendcoop/db";
import {
  type ImportJob,
  MAINTENANCE_JOBS,
  QUEUES,
  queueConnection,
  scheduleMaintenanceJobs,
} from "@sendcoop/queue";
import { pingRedis } from "@sendcoop/redis";
import { Worker } from "bullmq";
import { createServer } from "node:http";
import { processImport } from "./jobs/import-subscribers";

const service: ServiceName = "worker";

// Background jobs. Each queue gets a BullMQ Worker; more queues (sending,
// automations, webhooks) join this list as they're built.

const [postgres, redis] = await Promise.all([pingDatabase(), pingRedis()]);
console.log(
  `[${service}] started (postgres: ${postgres ? "ok" : "DOWN"}, redis: ${redis ? "ok" : "DOWN"})`,
);

const workers = [
  new Worker<ImportJob>(
    QUEUES.imports,
    // attemptsStarted > 1 means a previous run stalled (worker died mid-import).
    (job) => processImport(job.data, { allowRestart: job.attemptsStarted > 1 }),
    { connection: queueConnection(), concurrency: 2 },
  ),
  // Recurring housekeeping, registered by scheduleMaintenanceJobs below.
  new Worker(
    QUEUES.maintenance,
    async (job) => {
      if (job.name === MAINTENANCE_JOBS.verifyDomains.name) {
        const result = await verifyDueDomains(systemTxtLookup());
        if (result.checked > 0) {
          console.log(
            `[${service}] domains: checked ${result.checked}, newly verified ${result.verified}`,
          );
        }
      }
    },
    { connection: queueConnection(), concurrency: 1 },
  ),
];
await scheduleMaintenanceJobs();

for (const worker of workers) {
  worker.on("failed", (job, error) =>
    console.error(`[${service}] ${worker.name} job ${job?.id} failed`, error),
  );
}

// Health check for deploys (and for the browser tests to wait on).
const healthPort = Number(process.env.WORKER_HEALTH_PORT ?? 3002);
const health = createServer(async (request, response) => {
  if (request.url !== "/health") {
    response.writeHead(404).end();
    return;
  }
  const [db, queue] = await Promise.all([pingDatabase(), pingRedis()]);
  const ok = db && queue && workers.every((w) => w.isRunning());
  response
    .writeHead(ok ? 200 : 503, { "content-type": "application/json" })
    .end(JSON.stringify({ service, ok, postgres: db, redis: queue }));
});
health.listen(healthPort, () =>
  console.log(`[${service}] health on http://localhost:${healthPort}/health`),
);

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    console.log(`[${service}] stopping: letting running jobs finish their current step`);
    health.close();
    await Promise.all(workers.map((w) => w.close()));
    await getSql().end();
    console.log(`[${service}] stopped`);
    process.exit(0);
  });
}
