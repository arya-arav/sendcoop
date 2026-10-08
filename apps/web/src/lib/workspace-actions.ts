"use server";

import { accountQuota, isWorkspaceSlugTaken } from "@sendcoop/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/session";
import { slugCandidate, slugify } from "@/lib/slug";

export type CreateWorkspaceState = { error: string | null };

export async function createWorkspace(
  _prev: CreateWorkspaceState,
  formData: FormData,
): Promise<CreateWorkspaceState> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 60) {
    return { error: "Use between 2 and 60 characters." };
  }

  const { user } = await requireSession();
  const quota = await accountQuota(user.id);
  if (quota.room.workspaces < 1) {
    return {
      error: `Your ${quota.planName} plan allows ${quota.limits.workspaces} ${quota.limits.workspaces === 1 ? "workspace" : "workspaces"}. Upgrade your plan to add another.`,
    };
  }

  const slug = await availableSlug(name);
  if (!slug) return { error: "Couldn't find a free web address for that name. Try another." };

  // Creates the workspace, adds the user as owner and makes it their active workspace.
  await auth.api.createOrganization({ body: { name, slug }, headers: await headers() });
  redirect(`/w/${slug}`);
}

async function availableSlug(name: string) {
  const base = slugify(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = slugCandidate(base, attempt);
    if (!(await isWorkspaceSlugTaken(slug))) return slug;
  }
  return null;
}
