import { and, asc, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../client";
import { invitations, memberships, users, workspaces } from "../schema";

// Team members and invitations (D74). Better Auth writes these tables (its
// organization plugin: invite, accept, change role, remove); these are the
// reads the team page and the invitation page need.

export async function listTeam(workspaceId: string) {
  return getDb()
    .select({
      id: memberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.workspaceId, workspaceId))
    .orderBy(asc(memberships.createdAt));
}

export async function listPendingInvitations(workspaceId: string) {
  return getDb()
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.workspaceId, workspaceId),
        eq(invitations.status, "pending"),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitations.createdAt));
}

/** Members plus pending invitations: the seats the plan's team limit counts. */
export async function teamSeatsUsed(workspaceId: string) {
  const [row] = await getDb().execute<{ n: number }>(sql`
    select (select count(*) from memberships where workspace_id = ${workspaceId})
         + (select count(*) from invitations
            where workspace_id = ${workspaceId} and status = 'pending' and expires_at > now()) as n`);
  return Number(row?.n ?? 0);
}

/** A pending, unexpired invitation with what its page shows; null otherwise. */
export async function getOpenInvitation(invitationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(invitationId)) return null;
  const [row] = await getDb()
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      inviterName: users.name,
    })
    .from(invitations)
    .innerJoin(workspaces, eq(workspaces.id, invitations.workspaceId))
    .innerJoin(users, eq(users.id, invitations.inviterId))
    .where(
      and(
        eq(invitations.id, invitationId),
        eq(invitations.status, "pending"),
        gt(invitations.expiresAt, new Date()),
      ),
    );
  return row ?? null;
}
