import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { ImportMapping } from "../imports";
import { users, workspaces } from "./auth";
import { createdAt, id, updatedAt } from "./columns";

export const importStatus = pgEnum("import_status", [
  "draft", // uploaded, columns not mapped yet
  "queued",
  "processing",
  "completed",
  "failed",
  "canceled",
]);

// One CSV upload. Format detection and a sample are stored at upload time so
// the mapping page renders without re-reading the file.
export const subscriberImports = pgTable(
  "subscriber_imports",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    fileKey: text().notNull(),
    fileName: text().notNull(),
    fileSize: bigint({ mode: "number" }).notNull(),
    encoding: text().notNull(), // "utf-8" | "windows-1252"
    delimiter: text().notNull(),
    hasHeader: boolean().notNull(),
    columns: jsonb().$type<string[]>().notNull(),
    sampleRows: jsonb().$type<string[][]>().notNull(),
    mapping: jsonb().$type<ImportMapping>(),
    listIds: jsonb().$type<string[]>().notNull().default([]),
    updateExisting: boolean().notNull().default(false),
    status: importStatus().notNull().default("draft"),
    totalRows: integer().notNull().default(0),
    processedRows: integer().notNull().default(0),
    createdCount: integer().notNull().default(0),
    updatedCount: integer().notNull().default(0),
    skippedCount: integer().notNull().default(0),
    errorCount: integer().notNull().default(0),
    // Bytes of the file read so far; progress = bytesProcessed / fileSize.
    bytesProcessed: bigint({ mode: "number" }).notNull().default(0),
    // CSV of skipped rows (row number, email, reason), when there were any.
    errorReportKey: text(),
    error: text(),
    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.workspaceId, t.id)],
);

export type SubscriberImport = typeof subscriberImports.$inferSelect;
export type ImportStatus = (typeof importStatus.enumValues)[number];
