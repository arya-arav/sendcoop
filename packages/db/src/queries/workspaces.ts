import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { memberships, sessions, workspaces } from "../schema";

/** The workspace with this slug, plus the user's role in it, or null if they aren't a member. */
export async function findMemberWorkspace(userId: string, slug: string) {
  const [row] = await getDb()
    .select({ workspace: workspaces, role: memberships.role })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(and(eq(memberships.userId, userId), eq(workspaces.slug, slug)))
    .limit(1);
  return row ?? null;
}

/** All workspaces the user belongs to, oldest membership first. */
export async function listUserWorkspaces(userId: string) {
  return getDb()
    .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt));
}

export async function isWorkspaceSlugTaken(slug: string) {
  const [row] = await getDb()
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);
  return Boolean(row);
}

/** Remember the workspace a session last opened, so "/" returns there. */
export async function setSessionActiveWorkspace(sessionId: string, workspaceId: string) {
  await getDb()
    .update(sessions)
    .set({ activeWorkspaceId: workspaceId })
    .where(eq(sessions.id, sessionId));
}
