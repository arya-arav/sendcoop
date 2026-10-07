import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = Number(process.env.EDGE_PORT ?? 3001);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[edge] listening on http://localhost:${info.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
