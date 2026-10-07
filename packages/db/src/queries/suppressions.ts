import { and, count, desc, eq, isNull, like, lt, or, type SQLWrapper, sql } from "drizzle-orm";
import { getDb, getSql } from "../client";
import { type SuppressionReason, suppressions } from "../schema";
import { escapeLike } from "./like";
import { normalizeEmail } from "./subscribers";

// Suppression lists: a workspace's own, plus the platform-wide one (rows with
// no workspace). Campaigns never send to an address on either.

const INSERT_CHUNK = 5000;

/**
 * Adds addresses (already validated) to a workspace's list, or to the global
 * list when workspaceId is null. Returns how many were new.
 */
export async function addSuppressions(
  workspaceId: string | null,
  emails: string[],
  reason: SuppressionReason,
): Promise<number> {
  const unique = [...new Set(emails.map(normalizeEmail))].filter(Boolean);
  let added = 0;
  for (let i = 0; i < unique.length; i += INSERT_CHUNK) {
    const rows = await getDb()
      .insert(suppressions)
      .values(unique.slice(i, i + INSERT_CHUNK).map((email) => ({ workspaceId, email, reason })))
      .onConflictDoNothing()
      .returning({ id: suppressions.id });
    added += rows.length;
  }
  return added;
}

export async function removeSuppression(workspaceId: string, id: string) {
  const rows = await getDb()
    .delete(suppressions)
    .where(and(eq(suppressions.workspaceId, workspaceId), eq(suppressions.id, id)))
    .returning({ email: suppressions.email });
  return rows[0]?.email ?? null;
}

/** Whether campaigns from this workspace would skip the address. */
export async function isSuppressed(workspaceId: string, email: string) {
  const [row] = await getDb()
    .select({ id: suppressions.id })
    .from(suppressions)
    .where(
      and(
        or(eq(suppressions.workspaceId, workspaceId), isNull(suppressions.workspaceId)),
        eq(suppressions.email, normalizeEmail(email)),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export const SUPPRESSIONS_PAGE_SIZE = 50;

/** A page of a workspace's list, newest first, optionally filtered by text. */
export async function listSuppressions(
  workspaceId: string,
  { query, before }: { query?: string; before?: string } = {},
) {
  const db = getDb();
  const matching = and(
    eq(suppressions.workspaceId, workspaceId),
    query?.trim()
      ? like(suppressions.email, `%${escapeLike(query.trim().toLowerCase())}%`)
      : undefined,
  );
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(suppressions)
      .where(and(matching, before ? lt(suppressions.id, before) : undefined))
      .orderBy(desc(suppressions.id))
      .limit(SUPPRESSIONS_PAGE_SIZE + 1),
    db.select({ n: count() }).from(suppressions).where(matching),
  ]);
  const more = rows.length > SUPPRESSIONS_PAGE_SIZE;
  const page = rows.slice(0, SUPPRESSIONS_PAGE_SIZE);
  return {
    rows: page,
    total: total?.n ?? 0,
    nextCursor: more ? page.at(-1)!.id : null,
  };
}

/** Every entry on a workspace's list, oldest first, in pages (for CSV export). */
export async function* streamSuppressions(workspaceId: string) {
  const cursor = getSql()<{ email: string; reason: SuppressionReason; added_at: string }[]>`
    select email, reason,
      to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as added_at
    from suppressions
    where workspace_id = ${workspaceId} order by id`.cursor(1000);
  for await (const rows of cursor) yield rows;
}

/**
 * The condition, for SQL about messages or subscribers, that an email column
 * is suppressed for a workspace.
 */
export function suppressedSql(workspaceId: SQLWrapper | string, emailColumn: SQLWrapper) {
  return sql`exists (
    select 1 from ${suppressions}
    where (${suppressions.workspaceId} = ${workspaceId} or ${suppressions.workspaceId} is null)
      and ${suppressions.email} = lower(${emailColumn}))`;
}
