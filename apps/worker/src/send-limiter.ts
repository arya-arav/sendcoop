import { getRedis } from "@sendcoop/redis";

// Per-server sending limits, shared by every worker process through Redis.
// Each UTC second, hour and day is a counter; one Lua script checks all three
// and only then counts the send, so concurrent workers can't overshoot.

export type Limits = {
  maxPerSecond: number | null;
  maxPerHour: number | null;
  maxPerDay: number | null;
};

// KEYS: second, hour, day counters. ARGV: their limits (0 = none), then TTLs.
// Returns 0 when the send may go ahead, or 1/2/3 for the window that is full.
const ACQUIRE = `
for i = 1, 3 do
  local limit = tonumber(ARGV[i])
  if limit > 0 and tonumber(redis.call('GET', KEYS[i]) or '0') >= limit then
    return i
  end
end
for i = 1, 3 do
  if tonumber(ARGV[i]) > 0 then
    redis.call('INCR', KEYS[i])
    redis.call('EXPIRE', KEYS[i], ARGV[i + 3])
  end
end
return 0`;

const WINDOWS_MS = [1000, 3_600_000, 86_400_000] as const;

/**
 * Takes one send from the server's budget. Returns null if it may go now, or
 * the time (ms since epoch) when the full window resets.
 */
export async function acquireSendSlot(
  serverId: string,
  limits: Limits,
  now = Date.now(),
): Promise<number | null> {
  const values = [limits.maxPerSecond, limits.maxPerHour, limits.maxPerDay].map((v) => v ?? 0);
  if (values.every((v) => v <= 0)) return null;

  const starts = WINDOWS_MS.map((size) => Math.floor(now / size) * size);
  const keys = ["s", "h", "d"].map((w, i) => `send-limit:${serverId}:${w}:${starts[i]}`);
  const ttls = WINDOWS_MS.map((size) => Math.ceil(size / 1000) + 5);
  const full = (await getRedis().eval(ACQUIRE, 3, ...keys, ...values, ...ttls)) as number;
  return full === 0 ? null : starts[full - 1]! + WINDOWS_MS[full - 1]!;
}
