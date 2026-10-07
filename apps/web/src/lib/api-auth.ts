import { findMemberWorkspace } from "@sendcoop/db";
import { headers } from "next/headers";
import { auth } from "./auth";
import { canManage } from "./permissions";

export const jsonError = (status: number, message: string) =>
  Response.json({ error: message }, { status });

/**
 * Session + membership check for route handlers (pages use requireMemberWorkspace,
 * which redirects instead). Returns the workspace, or a Response to send back.
 */
export async function managerWorkspaceForApi(slug: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { response: jsonError(401, "Log in again.") } as const;
  const membership = await findMemberWorkspace(session.user.id, slug);
  if (!membership) return { response: jsonError(404, "Workspace not found.") } as const;
  if (!canManage(membership.role)) {
    return { response: jsonError(403, "Only workspace owners and admins can do this.") } as const;
  }
  return { session, workspace: membership.workspace } as const;
}
