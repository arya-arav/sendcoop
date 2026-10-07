import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { type List, lists } from "../schema";

// Every query is scoped by workspaceId, so an id from another workspace
// behaves exactly like an id that doesn't exist.

export type ListInput = { name: string; description: string | null };
export type ListWriteResult =
  { ok: true; list: List } | { ok: false; error: "duplicate" | "not_found" };

export async function listLists(workspaceId: string) {
  return getDb()
    .select()
    .from(lists)
    .where(eq(lists.workspaceId, workspaceId))
    .orderBy(desc(lists.createdAt));
}

export async function createList(workspaceId: string, input: ListInput): Promise<ListWriteResult> {
  try {
    const [list] = await getDb()
      .insert(lists)
      .values({ workspaceId, ...input })
      .returning();
    return { ok: true, list: list! };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicate" };
    throw error;
  }
}

export async function updateList(
  workspaceId: string,
  listId: string,
  input: ListInput,
): Promise<ListWriteResult> {
  try {
    const [list] = await getDb()
      .update(lists)
      .set(input)
      .where(and(eq(lists.id, listId), eq(lists.workspaceId, workspaceId)))
      .returning();
    return list ? { ok: true, list } : { ok: false, error: "not_found" };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicate" };
    throw error;
  }
}

/** Returns false if the list doesn't exist in this workspace. */
export async function deleteList(workspaceId: string, listId: string): Promise<boolean> {
  const deleted = await getDb()
    .delete(lists)
    .where(and(eq(lists.id, listId), eq(lists.workspaceId, workspaceId)))
    .returning({ id: lists.id });
  return deleted.length > 0;
}

// Drizzle wraps driver errors; the Postgres code is on the error or its cause.
function isUniqueViolation(error: unknown): boolean {
  for (let e = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}
