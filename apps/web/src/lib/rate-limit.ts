import { getRedis } from "@sendcoop/redis";

/**
 * Fixed-window counter in Redis: true while `key` has been used at most
 * `limit` times in the current window. Fails open if Redis is unreachable, so
 * an outage doesn't block signups.
 */
export async function withinRateLimit(key: string, limit: number, windowSeconds: number) {
  try {
    const redis = getRedis();
    const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
    const [[, count]] = (await redis.multi().incr(bucket).expire(bucket, windowSeconds).exec()) as [
      [Error | null, number],
    ];
    return count <= limit;
  } catch {
    return true;
  }
}

/** True the first time in `seconds` for this key (e.g. one email per person per 10 min). */
export async function firstTimeWithin(key: string, seconds: number) {
  try {
    return (await getRedis().set(`once:${key}`, "1", "EX", seconds, "NX")) === "OK";
  } catch {
    return true;
  }
}

/** The client's IP, from the proxy header when behind one. */
export function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
