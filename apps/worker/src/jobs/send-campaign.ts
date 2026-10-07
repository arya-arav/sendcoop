import {
  claimCampaign,
  failCampaign,
  getCampaign,
  getDkimSigningKey,
  getSendingServerConfig,
  listSendingDomains,
  loadMessageBatch,
  markMessageFailed,
  markMessageSent,
  prepareCampaignMessages,
  queuedMessageBatches,
  refreshCampaignProgress,
} from "@sendcoop/db";
import {
  buildRawMessage,
  createDriver,
  type DkimKey,
  type ServerConfig,
  serverConfigSchema,
} from "@sendcoop/mailer";
import { type CampaignJob, enqueueSendBatches, type SendBatchJob } from "@sendcoop/queue";

export const BATCH_SIZE = 100;

/**
 * Prepare step: claims a queued campaign, creates a message per recipient and
 * queues the send batches. A campaign with nothing to send finishes at once.
 */
export async function prepareCampaign(
  { campaignId, workspaceId }: CampaignJob,
  { resume = false } = {},
) {
  const campaign = await claimCampaign(workspaceId, campaignId, { resume });
  if (!campaign) return; // not queued: a duplicate job, or already started

  const context = await sendContext(workspaceId, campaign);
  if ("error" in context) {
    await failCampaign(workspaceId, campaignId, context.error);
    return;
  }

  await prepareCampaignMessages(campaign);
  const batches = await queuedMessageBatches(campaignId, BATCH_SIZE);
  await enqueueSendBatches(batches.map((messageIds) => ({ campaignId, workspaceId, messageIds })));
  if (batches.length === 0) await refreshCampaignProgress(campaignId);
}

/** Sends one batch. Only still-queued messages are sent, so retries never double-send. */
export async function sendBatch({ campaignId, workspaceId, messageIds }: SendBatchJob) {
  const campaign = await getCampaign(workspaceId, campaignId);
  // Paused or canceled campaigns leave their remaining messages queued.
  if (!campaign || campaign.status !== "sending") return { sent: 0, failed: 0 };

  const context = await sendContext(workspaceId, campaign);
  if ("error" in context) throw new Error(context.error);
  const batch = await loadMessageBatch(workspaceId, campaignId, messageIds);
  if (batch.length === 0) return { sent: 0, failed: 0 };

  const driver = createDriver(context.config, { pool: true });
  let sent = 0;
  let failed = 0;
  try {
    for (const message of batch) {
      const raw = await buildRawMessage(
        {
          from: { email: context.from, name: campaign.fromName },
          to: message.email,
          replyTo: campaign.replyTo ?? undefined,
          subject: campaign.subject,
          html: campaign.html,
          text: campaign.text,
          // Ties bounces and complaints back to this message (D22).
          headers: { "X-Sendcoop-Message": message.id },
        },
        context.dkim,
      );
      try {
        const result = await driver.send(raw, { from: context.from, to: [message.email] });
        await markMessageSent(message.id, result.messageId);
        sent++;
      } catch (error) {
        // The server is down or asks us to slow down: stop, and let the job
        // retry later. Messages already sent in this batch stay sent.
        if (isTemporary(error)) throw error;
        await markMessageFailed(message.id, describe(error));
        failed++;
      }
    }
  } finally {
    driver.close();
    await refreshCampaignProgress(campaignId);
  }
  return { sent, failed };
}

type Context =
  { config: ServerConfig; from: string; dkim: DkimKey | undefined } | { error: string };

/** The server, From address and DKIM key a campaign sends with. */
async function sendContext(
  workspaceId: string,
  campaign: { sendingServerId: string | null; sendingDomainId: string | null; fromLocal: string },
): Promise<Context> {
  if (!campaign.sendingServerId) return { error: "The campaign has no sending server." };
  if (!campaign.sendingDomainId) return { error: "The campaign has no sending domain." };
  const [stored, domains] = await Promise.all([
    getSendingServerConfig(workspaceId, campaign.sendingServerId),
    listSendingDomains(workspaceId),
  ]);
  const config = stored ? serverConfigSchema.safeParse(stored.config) : null;
  if (!config?.success) return { error: "The sending server was deleted or is incomplete." };
  const domain = domains.find((d) => d.id === campaign.sendingDomainId);
  if (!domain) return { error: "The sending domain was deleted." };

  const key = await getDkimSigningKey(workspaceId, domain.domain);
  return {
    config: config.data as ServerConfig,
    from: `${campaign.fromLocal}@${domain.domain}`,
    dkim: key
      ? { domainName: domain.domain, keySelector: key.selector, privateKey: key.privateKeyPem }
      : undefined,
  };
}

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ESOCKET",
  "EDNS",
  "ECONNECTION",
  "EAI_AGAIN",
]);

/** Errors worth retrying the whole batch for, rather than failing one recipient. */
function isTemporary(error: unknown) {
  const e = error as { code?: string; responseCode?: number; name?: string; $retryable?: unknown };
  if (e.code && NETWORK_CODES.has(e.code)) return true;
  if (typeof e.responseCode === "number" && e.responseCode >= 400 && e.responseCode < 500) {
    return true; // SMTP 4xx: try again later
  }
  // SES throttling and service errors are flagged retryable by the AWS SDK.
  return Boolean(e.$retryable) || e.name === "TooManyRequestsException";
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
