import {
  getSql,
  pingDatabase,
  type ServiceName,
  systemTxtLookup,
  verifyDueDomains,
} from "@sendcoop/db";
import {
  type CampaignJob,
  type ImportJob,
  MAINTENANCE_JOBS,
  QUEUES,
  queueConnection,
  scheduleMaintenanceJobs,
  type SendBatchJob,
  type AutomationRunJob,
  type UtmcapEventJob,
} from "@sendcoop/queue";
import { pingRedis } from "@sendcoop/redis";
import { Worker } from "bullmq";
import { createServer } from "node:http";
import {
  processAutomationRun,
  startClickRuns,
  startDateRuns,
  startTriggeredRuns,
  sweepAutomationRuns,
} from "./jobs/automation-runs";
import { refreshFxRates } from "./jobs/fx-rates";
import { processImport } from "./jobs/import-subscribers";
import { applyUtmcapEvent } from "./jobs/utmcap-events";
import {
  decideAbTests,
  prepareCampaign,
  processSendBatch,
  startScheduledCampaigns,
} from "./jobs/send-campaign";

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
  // A retry (attemptsStarted > 1) resumes a campaign the first attempt claimed.
  new Worker<CampaignJob>(
    QUEUES.campaigns,
    (job) => prepareCampaign(job.data, { resume: job.attemptsStarted > 1 }),
    {
      connection: queueConnection(),
      concurrency: 2,
    },
  ),
  // Several batches in parallel; per-server limits are enforced in Redis.
  new Worker<SendBatchJob>(QUEUES.sends, processSendBatch, {
    connection: queueConnection(),
    concurrency: Number(process.env.SEND_CONCURRENCY ?? 5),
  }),
  // Automation runs, one step after another.
  new Worker<AutomationRunJob>(
    QUEUES.automationRuns,
    (job) => processAutomationRun(job.data.runId),
    {
      connection: queueConnection(),
      concurrency: 10,
    },
  ),
  // UTMCAP conversion webhooks, kept by the edge.
  new Worker<UtmcapEventJob>(QUEUES.utmcapEvents, (job) => applyUtmcapEvent(job.data), {
    connection: queueConnection(),
    concurrency: 4,
  }),
  // Recurring housekeeping, registered by scheduleMaintenanceJobs below.
  new Worker(
    QUEUES.maintenance,
    async (job) => {
      if (job.name === MAINTENANCE_JOBS.decideAbTests.name) {
        for (const d of await decideAbTests()) {
          console.log(`[${service}] A/B test ${d.campaignId}: ${d.winner.toUpperCase()} won`);
        }
      }
      if (job.name === MAINTENANCE_JOBS.startScheduled.name) {
        const started = await startScheduledCampaigns();
        if (started > 0) console.log(`[${service}] scheduled campaigns started: ${started}`);
      }
      if (job.name === MAINTENANCE_JOBS.automationSweep.name) {
        await sweepAutomationRuns();
      }
      if (job.name === MAINTENANCE_JOBS.automationEvents.name) {
        await startTriggeredRuns();
      }
      if (job.name === MAINTENANCE_JOBS.automationDates.name) {
        await startDateRuns();
      }
      if (job.name === MAINTENANCE_JOBS.automationClicks.name) {
        await startClickRuns();
      }
      if (job.name === MAINTENANCE_JOBS.fxRates.name) {
        const result = await refreshFxRates();
        if (result) {
          console.log(
            `[${service}] FX rates for ${result.day}: ${result.stored} currencies, ${result.converted} conversions converted`,
          );
        }
      }
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
