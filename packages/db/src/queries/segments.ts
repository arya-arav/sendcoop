import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../client";
import { type Segment, segments, subscribers } from "../schema";
import type { SegmentRules } from "../segments";
import { isUniqueViolation } from "./errors";
import { subscriberConditions } from "./subscribers";

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

/** How many subscribers match the rules right now, plus a few newest examples. */
export async function previewSegment(
  workspaceId: string,
  rules: SegmentRules,
  { sampleSize = 5 } = {},
): Promise<{ count: number; sample: { id: string; email: string }[] }> {
  const where = subscriberConditions(workspaceId, { segment: rules });
  const db = getDb();
  const [[counted], sample] = await Promise.all([
    db.select({ count: count() }).from(subscribers).where(where),
    db
      .select({ id: subscribers.id, email: subscribers.email })
      .from(subscribers)
      .where(where)
      .orderBy(desc(subscribers.id))
      .limit(sampleSize),
  ]);
  return { count: counted?.count ?? 0, sample };
}
