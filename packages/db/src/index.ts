// Database client and schema. Apps import from "@sendcoop/db" so they never
// talk to Postgres directly.

export { getDb, getSql, pingDatabase, type Db } from "./client";
export * from "./custom-fields";
export * from "./domain-verification";
export * from "./imports";
export * from "./secrets";
export * from "./segments";
export * from "./sending-domains";
export * from "./unsubscribe-token";
export * from "./schema";
export * from "./queries/bulk";
export * from "./queries/campaigns";
export * from "./queries/custom-fields";
export * from "./queries/domain-verification";
export * from "./queries/forms";
export * from "./queries/import-batch";
export * from "./queries/imports";
export * from "./queries/lists";
export * from "./queries/segments";
export * from "./queries/sending-domains";
export * from "./queries/sending-servers";
export * from "./queries/subscribers";
export * from "./queries/tags";
export * from "./queries/unsubscribe";
export * from "./queries/workspaces";

export const SERVICE_NAMES = ["web", "worker", "edge"] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];
