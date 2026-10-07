// Database client and schema (Drizzle tables are added in D3).
// Apps import from "@sendcoop/db" so they never talk to Postgres directly.

export { getSql, pingDatabase } from "./client";

export const SERVICE_NAMES = ["web", "worker", "edge"] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];
