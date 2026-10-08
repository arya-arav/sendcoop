import { desc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { media } from "../schema";

export type NewMedia = Omit<typeof media.$inferInsert, "id" | "workspaceId" | "createdAt">;

/** Records an upload. The same image uploaded again returns the existing record. */
export async function addMedia(workspaceId: string, item: NewMedia) {
  const db = getDb();
  const [row] = await db
    .insert(media)
    .values({ workspaceId, ...item })
    .onConflictDoUpdate({
      // A no-op update, so the existing row is returned.
      target: [media.workspaceId, media.key],
      set: { key: item.key },
    })
    .returning();
  return row!;
}

/** The workspace's images, newest first (for the editor's image picker). */
export async function listMedia(workspaceId: string, limit = 200) {
  return getDb()
    .select()
    .from(media)
    .where(eq(media.workspaceId, workspaceId))
    .orderBy(desc(media.id))
    .limit(limit);
}
