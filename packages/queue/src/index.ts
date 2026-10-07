import { type ConnectionOptions, Queue } from "bullmq";
import { Redis } from "ioredis";

// Job queues shared by the web app (producer) and the worker (consumer).
// Each queue's name and payload type live here so both sides agree.

export const QUEUES = {
  imports: "subscriber-imports",
  maintenance: "maintenance",
  /** One job per campaign: works out the recipients and queues the batches. */
  campaigns: "campaign-prepare",
  /** One job per batch of up to 100 messages. */
  sends: "campaign-sends",
} as const;

/** Recurring jobs on the maintenance queue, by name. */
export const MAINTENANCE_JOBS = {
  verifyDomains: { name: "verify-domains", everyMs: 10 * 60_000 },
} as const;

export type ImportJob = { importId: string; workspaceId: string };
export type CampaignJob = { campaignId: string; workspaceId: string };
export type SendBatchJob = { campaignId: string; workspaceId: string; messageIds: string[] };

/** A fresh connection: BullMQ workers need their own (blocking commands). */
export function queueConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  return new Redis(url, { maxRetriesPerRequest: null });
}

// One producer Queue per name, kept on globalThis to survive Next.js dev reloads.
const globalForQueues = globalThis as typeof globalThis & {
  __sendcoopQueues?: Map<string, Queue>;
};

function queue<T>(name: string): Queue<T> {
  globalForQueues.__sendcoopQueues ??= new Map();
  let q = globalForQueues.__sendcoopQueues.get(name);
  if (!q) {
    q = new Queue(name, { connection: queueConnection() });
    globalForQueues.__sendcoopQueues.set(name, q);
  }
  return q as Queue<T>;
}

const keep = { removeOnComplete: { age: 24 * 3600 }, removeOnFail: { age: 7 * 24 * 3600 } };

/**
 * Queues an import. The job id is the import id, so queueing the same import
 * twice is a no-op. No automatic retries: a failed import is marked failed
 * and the user starts a new one after fixing the file.
 */
export async function enqueueImport(job: ImportJob) {
  await queue<ImportJob>(QUEUES.imports).add("import", job, {
    jobId: job.importId,
    attempts: 1,
    ...keep,
  });
}

/** Queues a campaign's prepare step (job id = campaign id, so at most once). */
export async function enqueueCampaign(job: CampaignJob) {
  await queue<CampaignJob>(QUEUES.campaigns).add("prepare", job, {
    jobId: job.campaignId,
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    ...keep,
  });
}

/**
 * Queues send batches. Each job id is derived from its first message, so
 * queueing the same batch twice is a no-op. Batches retry with backoff when
 * the mail server is unreachable; messages already sent are never resent.
 */
export async function enqueueSendBatches(jobs: SendBatchJob[]) {
  if (jobs.length === 0) return;
  await queue<SendBatchJob>(QUEUES.sends).addBulk(
    jobs.map((data) => ({
      name: "send",
      data,
      opts: {
        jobId: `${data.campaignId}_${data.messageIds[0]}`,
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
        ...keep,
      },
    })),
  );
}

/**
 * Registers the recurring maintenance jobs (idempotent: upserting a scheduler
 * with the same id replaces it). Called by the worker on start.
 */
export async function scheduleMaintenanceJobs() {
  const maintenance = new Queue(QUEUES.maintenance, { connection: queueConnection() });
  for (const job of Object.values(MAINTENANCE_JOBS)) {
    await maintenance.upsertJobScheduler(job.name, { every: job.everyMs }, { name: job.name });
  }
  await maintenance.close();
}

/** Closes the producer queues (tests and scripts). */
export async function closeQueues() {
  await Promise.all([...(globalForQueues.__sendcoopQueues?.values() ?? [])].map((q) => q.close()));
  globalForQueues.__sendcoopQueues?.clear();
}
