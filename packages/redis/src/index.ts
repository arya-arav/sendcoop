import { Redis } from "ioredis";

// One shared connection per process, kept on globalThis to survive Next.js dev reloads.
const globalForRedis = globalThis as typeof globalThis & { __sendcoopRedis?: Redis };

export function getRedis(): Redis {
  if (!globalForRedis.__sendcoopRedis) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL is not set");
    // BullMQ requires maxRetriesPerRequest: null on connections it uses.
    globalForRedis.__sendcoopRedis = new Redis(url, { maxRetriesPerRequest: null });
  }
  return globalForRedis.__sendcoopRedis;
}

export async function pingRedis(timeoutMs = 2000): Promise<boolean> {
  // With retries disabled per request, a down Redis would leave PING queued forever.
  try {
    const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs));
    const ping = getRedis()
      .ping()
      .then((reply) => reply === "PONG")
      .catch(() => false);
    return await Promise.race([ping, timeout]);
  } catch {
    return false;
  }
}
