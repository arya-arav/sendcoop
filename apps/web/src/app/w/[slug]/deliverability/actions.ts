"use server";

import { queuedMessageBatches, refreshCampaignProgress, resumeCampaign } from "@sendcoop/db";
import { enqueueSendBatches } from "@sendcoop/queue";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

const BATCH_SIZE = 100; // as in the worker

/** Resumes a paused campaign: the messages still waiting are queued again. */
export async function resumeCampaignAction(slug: string, campaignId: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false as const, error: "Only workspace owners and admins can do this." };
  }
  if (!z.uuid().safeParse(campaignId).success) return { ok: false as const, error: "Not found." };

  const campaign = await resumeCampaign(workspace.id, campaignId);
  if (!campaign) return { ok: false as const, error: "This campaign isn't paused any more." };
  const batches = await queuedMessageBatches(campaign.id, BATCH_SIZE);
  if (batches.length === 0) {
    await refreshCampaignProgress(campaign.id); // nothing left: it's done
  } else {
    await enqueueSendBatches(
      batches.map((messageIds) => ({
        campaignId: campaign.id,
        workspaceId: workspace.id,
        messageIds,
      })),
      // Earlier jobs for these batches are kept a while; new ids queue them again.
      { round: String(Date.now()) },
    );
  }
  revalidatePath(`/w/${slug}/deliverability`);
  return { ok: true as const };
}
