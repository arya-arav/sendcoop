"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resumeCampaignSending } from "@/lib/campaign-control";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

/** Resumes a campaign paused for its health. */
export async function resumeCampaignAction(slug: string, campaignId: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false as const, error: "Only workspace owners and admins can do this." };
  }
  if (!z.uuid().safeParse(campaignId).success) return { ok: false as const, error: "Not found." };
  if (!(await resumeCampaignSending(workspace.id, campaignId))) {
    return { ok: false as const, error: "This campaign isn't paused any more." };
  }
  revalidatePath(`/w/${slug}/deliverability`);
  return { ok: true as const };
}
