"use server";

import { removeSuppression } from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

export async function removeSuppressionAction(slug: string, id: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false as const, error: "Only workspace owners and admins can do this." };
  }
  if (!z.uuid().safeParse(id).success) return { ok: false as const, error: "Not found." };
  const email = await removeSuppression(workspace.id, id);
  if (!email) return { ok: false as const, error: "That address is no longer on the list." };
  revalidatePath(`/w/${slug}/contacts/suppressions`);
  return { ok: true as const, email };
}
