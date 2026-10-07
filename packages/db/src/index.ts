// Database client and schema live here (Drizzle + Postgres, added in D3).
// Apps import from "@sendcoop/db" so they never talk to Postgres directly.

export const SERVICE_NAMES = ["web", "worker", "edge"] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];
