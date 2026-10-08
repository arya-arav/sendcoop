import {
  assignAbVariants,
  claimCampaign,
  clickUrl,
  decideDueAbTests,
  failCampaign,
  getCampaign,
  getDkimSigningKey,
  getSendingServer,
  getSendingServerConfig,
  getUtmSettings,
  getVariantB,
  honeypotUrl,
  listCampaignLinks,
  listSendingDomains,
  loadMessageBatch,
  markMessageFailed,
  markMessageSent,
  openPixelUrl,
  prepareCampaignMessages,
  queuedMessageBatchesTimed,
  refreshCampaignProgress,
  storeCampaignLinks,
  startDueCampaigns,
  skipUnsendableMessages,
  unsubscribeUrls,
} from "@sendcoop/db";
import {
  buildRawMessage,
  createDriver,
  extractLinks,
  type DkimKey,
  listUnsubscribeHeaders,
  mergeValuesFor,
  personalize,
  rewriteLinks,
  type ServerConfig,
  serverConfigSchema,
  withTrackingPixel,
  withUnsubscribeLink,
} from "@sendcoop/mailer";
import {
  type CampaignJob,
  enqueueCampaign,
  enqueueSendBatches,
  type SendBatchJob,
} from "@sendcoop/queue";
import { DelayedError, type Job } from "bullmq";
import { acquireSendSlot, type Limits } from "../send-limiter";

export const BATCH_SIZE = 100;
/** How often (in messages) a running batch checks whether the campaign was paused... */
const STATUS_CHECK_EVERY = 20;
/** ...and at least this often when sending slowly (rate limits). */
const STATUS_CHECK_MS = 1000;

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
  // A/B test: only the test share goes now; the rest wait for the winner.
  await assignAbVariants(campaign);
  // The email's links, for click tracking and per-link reports.
  await storeCampaignLinks(
    workspaceId,
    campaignId,
    "a",
    extractLinks(campaign.html, campaign.text),
  );
  if (campaign.abTest) {
    const variantB = await getVariantB(campaignId);
    if (variantB) {
      await storeCampaignLinks(
        workspaceId,
        campaignId,
        "b",
        extractLinks(variantB.html, variantB.text),
      );
    }
  }
  // Batches for a later local time (subscriber timezones) wait until then.
  const batches = await queuedMessageBatchesTimed(campaignId, BATCH_SIZE);
  await enqueueSendBatches(
    batches.map((b) => ({
      campaignId,
      workspaceId,
      messageIds: b.messageIds,
      notBefore: b.sendAfter,
    })),
  );
  if (batches.length === 0) await refreshCampaignProgress(campaignId);
}

/** Starts scheduled campaigns whose time has come (a maintenance job). */
/** Ends due A/B tests and queues the winner for everyone held back (a maintenance job). */
export async function decideAbTests() {
  const decided = await decideDueAbTests();
  for (const { campaignId, workspaceId, batches } of decided) {
    await enqueueSendBatches(
      batches.map((b) => ({
        campaignId,
        workspaceId,
        messageIds: b.messageIds,
        notBefore: b.sendAfter,
      })),
    );
  }
  return decided;
}

export async function startScheduledCampaigns() {
  const due = await startDueCampaigns();
  for (const campaign of due) await enqueueCampaign(campaign);
  return due.length;
}

/** The open pixel (when the workspace tracks opens) and the bot-catching hidden link. */
function withPixel(body: { html: string; text: string }, messageId: string, trackOpens: boolean) {
  return {
    ...body,
    html: withTrackingPixel(
      body.html,
      trackOpens ? openPixelUrl(messageId) : null,
      honeypotUrl(messageId),
    ),
  };
}

/** Waits this long for a per-second slot; longer waits postpone the batch. */
const MAX_INLINE_WAIT_MS = 2000;

export type BatchResult = {
  sent: number;
  failed: number;
  /** Set when an hourly or daily limit is reached: run the batch again then. */
  resumeAt?: number;
};

/** Sends one batch. Only still-queued messages are sent, so retries never double-send. */
export async function sendBatch({
  campaignId,
  workspaceId,
  messageIds,
}: SendBatchJob): Promise<BatchResult> {
  const campaign = await getCampaign(workspaceId, campaignId);
  // Paused or canceled campaigns leave their remaining messages queued.
  if (!campaign || campaign.status !== "sending") return { sent: 0, failed: 0 };

  const context = await sendContext(workspaceId, campaign);
  if ("error" in context) throw new Error(context.error);
  // Suppressed or unsubscribed since the campaign started: never sent.
  const skipped = await skipUnsendableMessages(workspaceId, campaignId, messageIds);
  const batch = await loadMessageBatch(workspaceId, campaignId, messageIds);
  // Variant B's subject and content, for A/B test recipients who get it.
  const variantB = batch.some((m) => m.variant === "b") ? await getVariantB(campaignId) : null;
  const { trackOpens } = await getUtmSettings(workspaceId);
  // Link ids by version and position, for each recipient's tracked links.
  const linkIds = { a: [] as string[], b: [] as string[] };
  for (const link of await listCampaignLinks(workspaceId, campaignId)) {
    linkIds[link.variant][link.position] = link.id;
  }
  if (batch.length === 0) {
    if (skipped > 0) await refreshCampaignProgress(campaignId);
    return { sent: 0, failed: 0 };
  }

  const driver = createDriver(context.config, { pool: true });
  let sent = 0;
  let failed = 0;
  try {
    let checkedAt = Date.now();
    for (const [i, message] of batch.entries()) {
      // Paused (by hand or for its health) while this batch runs: stop here.
      // The rest stay queued and are sent if the campaign resumes.
      if (i > 0 && (i % STATUS_CHECK_EVERY === 0 || Date.now() - checkedAt >= STATUS_CHECK_MS)) {
        checkedAt = Date.now();
        const current = await getCampaign(workspaceId, campaignId);
        if (current?.status !== "sending") break;
      }

      // Respect the server's limits: short waits inline, long ones postpone.
      let resumeAt = await acquireSendSlot(context.serverId, context.limits);
      while (resumeAt !== null && resumeAt - Date.now() <= MAX_INLINE_WAIT_MS) {
        await new Promise((r) => setTimeout(r, Math.max(resumeAt! - Date.now(), 1)));
        resumeAt = await acquireSendSlot(context.serverId, context.limits);
      }
      if (resumeAt !== null) return { sent, failed, resumeAt };
      const handedOverAt = new Date();

      const unsubscribe = unsubscribeUrls(message.id);
      // Merge tags and spintax, seeded by the message so a retry reads the same.
      const variant = message.variant === "b" && variantB ? "b" : "a";
      const version = variant === "b" ? variantB! : campaign;
      // Each link goes through the click tracker with this recipient's own token.
      const tracked = rewriteLinks(version, (position) => {
        const linkId = linkIds[variant][position];
        return linkId ? clickUrl(message.id, linkId) : null;
      });
      const content = personalize({ ...version, ...tracked }, mergeValuesFor(message), message.id);
      const raw = await buildRawMessage(
        {
          from: { email: context.from, name: campaign.fromName },
          to: message.email,
          replyTo: campaign.replyTo ?? undefined,
          subject: content.subject,
          ...withPixel(withUnsubscribeLink(content, unsubscribe.page), message.id, trackOpens),
          headers: {
            ...listUnsubscribeHeaders(unsubscribe.oneClick),
            // Ties bounces and complaints back to this message (D22).
            "X-Sendcoop-Message": message.id,
          },
        },
        context.dkim,
      );
      try {
        const result = await driver.send(raw, { from: context.from, to: [message.email] });
        await markMessageSent(message.id, result.messageId, handedOverAt);
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
  | {
      serverId: string;
      config: ServerConfig;
      limits: Limits;
      from: string;
      dkim: DkimKey | undefined;
    }
  | { error: string };

/** The server, From address and DKIM key a campaign sends with. */
async function sendContext(
  workspaceId: string,
  campaign: { sendingServerId: string | null; sendingDomainId: string | null; fromLocal: string },
): Promise<Context> {
  if (!campaign.sendingServerId) return { error: "The campaign has no sending server." };
  if (!campaign.sendingDomainId) return { error: "The campaign has no sending domain." };
  const [server, stored, domains] = await Promise.all([
    getSendingServer(workspaceId, campaign.sendingServerId),
    getSendingServerConfig(workspaceId, campaign.sendingServerId),
    listSendingDomains(workspaceId),
  ]);
  const config = stored ? serverConfigSchema.safeParse(stored.config) : null;
  if (!server || !config?.success) {
    return { error: "The sending server was deleted or is incomplete." };
  }
  const domain = domains.find((d) => d.id === campaign.sendingDomainId);
  if (!domain) return { error: "The sending domain was deleted." };

  const key = await getDkimSigningKey(workspaceId, domain.domain);
  return {
    serverId: server.id,
    config: config.data as ServerConfig,
    limits: server,
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

/**
 * The BullMQ processor for send batches. When an hourly or daily limit is
 * full, the job is postponed until the window resets; that isn't a failed attempt.
 */
export async function processSendBatch(job: Job<SendBatchJob>, token?: string) {
  const result = await sendBatch(job.data);
  if (result.resumeAt) {
    await job.moveToDelayed(result.resumeAt, token);
    throw new DelayedError();
  }
  return result;
}
