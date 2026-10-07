import type { ServiceName } from "@sendcoop/db";
import { Hono } from "hono";

const service: ServiceName = "edge";

// Public, high-traffic endpoints: open pixel, click redirect, postbacks (D37+).
export const app = new Hono();

app.get("/health", (c) => c.json({ service, ok: true }));
