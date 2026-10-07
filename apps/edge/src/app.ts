import { pingDatabase, type ServiceName } from "@sendcoop/db";
import { pingRedis } from "@sendcoop/redis";
import { Hono } from "hono";

const service: ServiceName = "edge";

// Public, high-traffic endpoints: open pixel, click redirect, postbacks (D37+).
export const app = new Hono();

app.get("/health", async (c) => {
  const [postgres, redis] = await Promise.all([pingDatabase(), pingRedis()]);
  const ok = postgres && redis;
  return c.json({ service, ok, postgres, redis }, ok ? 200 : 503);
});
