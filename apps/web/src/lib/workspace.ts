import { findMemberWorkspace } from "@sendcoop/db";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireSession } from "./session";

/**
 * The workspace at /w/<slug> and the user's role in it. Non-members get a 404,
 * so workspace slugs can't be probed. Cached per request for layouts and pages.
 */
export const requireMemberWorkspace = cache(async (slug: string) => {
  const { user } = await requireSession();
  const membership = await findMemberWorkspace(user.id, slug);
  if (!membership) notFound();
  return { user, ...membership };
});
