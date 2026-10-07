import { type ConnectionOptions, Queue } from "bullmq";
import { Redis } from "ioredis";

// Job queues shared by the web app (producer) and the worker (consumer).
// Each queue's name and payload type live here so both sides agree.

export const QUEUES = {
  imports: "subscriber-imports",
} as const;

export type ImportJob = { importId: string; workspaceId: string };

/** A fresh connection: BullMQ workers need their own (blocking commands). */
export function queueConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  return new Redis(url, { maxRetriesPerRequest: null });
}

const globalForQueues = globalThis as typeof globalThis & {
  __sendcoopImportQueue?: Queue<ImportJob>;
};

function importQueue() {
  globalForQueues.__sendcoopImportQueue ??= new Queue<ImportJob>(QUEUES.imports, {
    connection: queueConnection(),
  });
  return globalForQueues.__sendcoopImportQueue;
}

/**
 * Queues an import. The job id is the import id, so queueing the same import
 * twice is a no-op. No automatic retries: a failed import is marked failed
 * and the user starts a new one after fixing the file.
 */
export async function enqueueImport(job: ImportJob) {
  await importQueue().add("import", job, {
    jobId: job.importId,
    attempts: 1,
    removeOnComplete: { age: 24 * 3600 },
    removeOnFail: { age: 7 * 24 * 3600 },
  });
}
