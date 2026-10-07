import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import type { ImportMapping } from "../imports";
import { type SubscriberImport, subscriberImports } from "../schema";

// Scoped by workspaceId like every other query.

export type NewImport = Pick<
  SubscriberImport,
  | "fileKey"
  | "fileName"
  | "fileSize"
  | "encoding"
  | "delimiter"
  | "hasHeader"
  | "columns"
  | "sampleRows"
> & { createdBy: string | null; mapping: ImportMapping };

export async function createImport(workspaceId: string, input: NewImport) {
  const [row] = await getDb()
    .insert(subscriberImports)
    .values({ workspaceId, ...input })
    .returning();
  return row!;
}

export async function getImport(
  workspaceId: string,
  importId: string,
): Promise<SubscriberImport | null> {
  const [row] = await getDb()
    .select()
    .from(subscriberImports)
    .where(and(eq(subscriberImports.id, importId), eq(subscriberImports.workspaceId, workspaceId)));
  return row ?? null;
}

export async function listImports(workspaceId: string, { limit = 10 } = {}) {
  return getDb()
    .select()
    .from(subscriberImports)
    .where(eq(subscriberImports.workspaceId, workspaceId))
    .orderBy(desc(subscriberImports.id))
    .limit(limit);
}

/** Saves the column mapping and options. Only drafts can change; returns false otherwise. */
export async function saveImportMapping(
  workspaceId: string,
  importId: string,
  input: { mapping: ImportMapping; listIds: string[]; updateExisting: boolean },
): Promise<boolean> {
  const updated = await getDb()
    .update(subscriberImports)
    .set(input)
    .where(
      and(
        eq(subscriberImports.id, importId),
        eq(subscriberImports.workspaceId, workspaceId),
        eq(subscriberImports.status, "draft"),
      ),
    )
    .returning({ id: subscriberImports.id });
  return updated.length > 0;
}

/**
 * Saves the final mapping and moves a draft to "queued" in one step. Returns
 * false if the import isn't a draft any more (already started, or a double click).
 */
export async function queueImport(
  workspaceId: string,
  importId: string,
  input: { mapping: ImportMapping; listIds: string[]; updateExisting: boolean },
): Promise<boolean> {
  const updated = await getDb()
    .update(subscriberImports)
    .set({ ...input, status: "queued" })
    .where(
      and(
        eq(subscriberImports.id, importId),
        eq(subscriberImports.workspaceId, workspaceId),
        eq(subscriberImports.status, "draft"),
      ),
    )
    .returning({ id: subscriberImports.id });
  return updated.length > 0;
}

/**
 * Worker: takes a queued import. Null if it isn't queued (e.g. a duplicate job).
 * allowRestart also takes one left "processing" by a worker that died: BullMQ
 * re-runs stalled jobs, and re-importing is safe (existing rows count as unchanged).
 */
export async function claimImport(
  workspaceId: string,
  importId: string,
  { allowRestart = false } = {},
): Promise<SubscriberImport | null> {
  const [row] = await getDb()
    .update(subscriberImports)
    .set({ status: "processing", startedAt: new Date() })
    .where(
      and(
        eq(subscriberImports.id, importId),
        eq(subscriberImports.workspaceId, workspaceId),
        allowRestart
          ? inArray(subscriberImports.status, ["queued", "processing"])
          : eq(subscriberImports.status, "queued"),
      ),
    )
    .returning();
  return row ?? null;
}

export type ImportCounters = Pick<
  SubscriberImport,
  | "processedRows"
  | "createdCount"
  | "updatedCount"
  | "skippedCount"
  | "errorCount"
  | "bytesProcessed"
>;

export async function updateImportProgress(importId: string, counters: ImportCounters) {
  await getDb()
    .update(subscriberImports)
    .set(counters)
    .where(and(eq(subscriberImports.id, importId), eq(subscriberImports.status, "processing")));
}

export async function finishImport(
  importId: string,
  result: ImportCounters &
    ({ status: "completed"; errorReportKey: string | null } | { status: "failed"; error: string }),
) {
  await getDb()
    .update(subscriberImports)
    .set({
      ...result,
      totalRows: result.processedRows,
      finishedAt: new Date(),
    })
    .where(eq(subscriberImports.id, importId));
}
