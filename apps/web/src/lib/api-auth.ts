import { findMemberWorkspace } from "@sendcoop/db";
import { headers } from "next/headers";
import { auth } from "./auth";
import { canManage } from "./permissions";

export const jsonError = (status: number, message: string) =>
  Response.json({ error: message }, { status });

/**
 * These handlers trust the session cookie, so another site could make a
 * signed-in browser call them (CSRF). Browsers say where a request came
 * from: refuse it when that's another site. (Same-site navigations, such as
 * a download link, send no Origin.)
 */
export function crossSite(requestHeaders: Headers) {
  if (requestHeaders.get("sec-fetch-site") === "cross-site") return true;
  const origin = requestHeaders.get("origin");
  return origin !== null && origin !== appOrigin();
}

const appOrigin = () => new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;

/**
 * Session + membership check for route handlers (pages use requireMemberWorkspace,
 * which redirects instead). Returns the workspace, or a Response to send back.
 */
export async function managerWorkspaceForApi(slug: string) {
  const requestHeaders = await headers();
  if (crossSite(requestHeaders)) {
    return { response: jsonError(403, "Requests from other sites are refused.") } as const;
  }
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return { response: jsonError(401, "Log in again.") } as const;
  const membership = await findMemberWorkspace(session.user.id, slug);
  if (!membership) return { response: jsonError(404, "Workspace not found.") } as const;
  if (!canManage(membership.role)) {
    return { response: jsonError(403, "Only workspace owners and admins can do this.") } as const;
  }
  return { session, workspace: membership.workspace } as const;
}
