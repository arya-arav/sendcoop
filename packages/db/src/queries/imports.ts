import { and, desc, eq } from "drizzle-orm";
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
