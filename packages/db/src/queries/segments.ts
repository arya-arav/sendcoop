import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "../client";
import { type Segment, segments } from "../schema";
import type { SegmentRules } from "../segments";
import { isUniqueViolation } from "./errors";

// Scoped by workspaceId like every other query. Rules must already be checked
// with segmentRulesProblem.

export type SegmentWriteResult =
  { ok: true; segment: Segment } | { ok: false; error: "duplicate" | "not_found" };

export async function listSegments(workspaceId: string): Promise<Segment[]> {
  return getDb()
    .select()
    .from(segments)
    .where(eq(segments.workspaceId, workspaceId))
    .orderBy(asc(sql`lower(${segments.name})`));
}

export async function getSegment(workspaceId: string, segmentId: string): Promise<Segment | null> {
  const [row] = await getDb()
    .select()
    .from(segments)
    .where(and(eq(segments.id, segmentId), eq(segments.workspaceId, workspaceId)));
  return row ?? null;
}

export async function createSegment(
  workspaceId: string,
  input: { name: string; rules: SegmentRules },
): Promise<SegmentWriteResult> {
  try {
    const [segment] = await getDb()
      .insert(segments)
      .values({ workspaceId, ...input })
      .returning();
    return { ok: true, segment: segment! };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicate" };
    throw error;
  }
}

export async function updateSegment(
  workspaceId: string,
  segmentId: string,
  input: { name: string; rules: SegmentRules },
): Promise<SegmentWriteResult> {
  try {
    const [segment] = await getDb()
      .update(segments)
      .set(input)
      .where(and(eq(segments.id, segmentId), eq(segments.workspaceId, workspaceId)))
      .returning();
    return segment ? { ok: true, segment } : { ok: false, error: "not_found" };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicate" };
    throw error;
  }
}

export async function deleteSegment(workspaceId: string, segmentId: string): Promise<boolean> {
  const deleted = await getDb()
    .delete(segments)
    .where(and(eq(segments.id, segmentId), eq(segments.workspaceId, workspaceId)))
    .returning({ id: segments.id });
  return deleted.length > 0;
}
