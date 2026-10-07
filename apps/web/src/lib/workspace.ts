import { findMemberWorkspace, setSessionActiveWorkspace } from "@sendcoop/db";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireSession } from "./session";

/**
 * The workspace at /w/<slug> and the user's role in it. Non-members get a 404,
 * so workspace slugs can't be probed. Cached per request for layouts and pages.
 */
export const requireMemberWorkspace = cache(async (slug: string) => {
  const { user, session } = await requireSession();
  const membership = await findMemberWorkspace(user.id, slug);
  if (!membership) notFound();

  // Opening a workspace makes it the active one, so "/" and new tabs return here.
  if (session.activeOrganizationId !== membership.workspace.id) {
    await setSessionActiveWorkspace(session.id, membership.workspace.id);
  }
  return { user, ...membership };
});
