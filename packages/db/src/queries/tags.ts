import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "../client";
import { subscriberTags, type Tag, tags } from "../schema";

// Scoped by workspaceId like every other query.

export const MAX_TAG_LENGTH = 50;

/** The workspace's tags, alphabetical, with how many subscribers have each. */
export async function listTags(workspaceId: string) {
  return getDb()
    .select({
      id: tags.id,
      name: tags.name,
      subscriberCount: sql<number>`(
        select count(*)::int from ${subscriberTags} where ${subscriberTags.tagId} = ${tags.id}
      )`,
    })
    .from(tags)
    .where(eq(tags.workspaceId, workspaceId))
    .orderBy(asc(sql`lower(${tags.name})`));
}

export async function getTag(workspaceId: string, tagId: string): Promise<Tag | null> {
  const [tag] = await getDb()
    .select()
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.workspaceId, workspaceId)));
  return tag ?? null;
}

/** The tag with this name (ignoring case), created if it doesn't exist yet. */
export async function findOrCreateTag(workspaceId: string, name: string): Promise<Tag> {
  const db = getDb();
  const clean = name.trim().slice(0, MAX_TAG_LENGTH);
  await db.insert(tags).values({ workspaceId, name: clean }).onConflictDoNothing();
  const [tag] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.workspaceId, workspaceId), sql`lower(${tags.name}) = lower(${clean})`));
  return tag!;
}
