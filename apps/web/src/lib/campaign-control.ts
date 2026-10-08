import { queuedMessageBatchesTimed, refreshCampaignProgress, resumeCampaign } from "@sendcoop/db";
import { enqueueSendBatches } from "@sendcoop/queue";

const BATCH_SIZE = 100; // as in the worker

/**
 * Resumes a paused campaign: the messages still waiting are queued again
 * (new job ids, since earlier jobs for the same batches are kept a while),
 * each at its own send time. False if the campaign wasn't paused.
 */
export async function resumeCampaignSending(workspaceId: string, campaignId: string) {
  const campaign = await resumeCampaign(workspaceId, campaignId);
  if (!campaign) return false;
  const batches = await queuedMessageBatchesTimed(campaign.id, BATCH_SIZE);
  if (batches.length === 0) {
    await refreshCampaignProgress(campaign.id); // nothing left: it's done
    return true;
  }
  await enqueueSendBatches(
    batches.map((b) => ({
      campaignId: campaign.id,
      workspaceId,
      messageIds: b.messageIds,
      notBefore: b.sendAfter,
    })),
    { round: String(Date.now()) },
  );
  return true;
}
