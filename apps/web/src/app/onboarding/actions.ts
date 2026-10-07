"use server";

import { isWorkspaceSlugTaken } from "@sendcoop/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export type CreateWorkspaceState = { error: string | null };

export async function createWorkspace(
  _prev: CreateWorkspaceState,
  formData: FormData,
): Promise<CreateWorkspaceState> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 60) {
    return { error: "Use between 2 and 60 characters." };
  }

  const slug = await availableSlug(name);
  if (!slug) return { error: "Couldn't find a free web address for that name. Try another." };

  // Creates the workspace, adds the user as owner and makes it their active workspace.
  await auth.api.createOrganization({ body: { name, slug }, headers: await headers() });
  redirect(`/w/${slug}`);
}

async function availableSlug(name: string) {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace";

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (!(await isWorkspaceSlugTaken(slug))) return slug;
  }
  return null;
}
