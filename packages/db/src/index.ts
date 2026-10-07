// Database client and schema. Apps import from "@sendcoop/db" so they never
// talk to Postgres directly.

export { getDb, getSql, pingDatabase, type Db } from "./client";
export * from "./custom-fields";
export * from "./imports";
export * from "./schema";
export * from "./queries/custom-fields";
export * from "./queries/import-batch";
export * from "./queries/imports";
export * from "./queries/lists";
export * from "./queries/subscribers";
export * from "./queries/workspaces";

export const SERVICE_NAMES = ["web", "worker", "edge"] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];
