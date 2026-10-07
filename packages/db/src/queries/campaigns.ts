import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../client";
import { type Campaign, campaigns, messages, segments, subscribers } from "../schema";
import { subscriberConditions } from "./subscribers";

// Scoped by workspaceId. Status changes only happen from the expected previous
// state, so a duplicate or retried job can't run a step twice.

export type CampaignInput = Pick<
  Campaign,
  | "name"
  | "subject"
  | "fromName"
  | "fromLocal"
  | "replyTo"
  | "html"
  | "text"
  | "sendingDomainId"
  | "sendingServerId"
  | "listId"
  | "segmentId"
>;

export async function createCampaign(workspaceId: string, input: CampaignInput) {
  const [row] = await getDb()
    .insert(campaigns)
    .values({ workspaceId, ...input })
    .returning();
  return row!;
}

export async function getCampaign(workspaceId: string, campaignId: string) {
  const [row] = await getDb()
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, workspaceId)));
  return row ?? null;
}

async function moveStatus(
  workspaceId: string,
  campaignId: string,
  from: Campaign["status"],
  set: Partial<Campaign>,
) {
  const [row] = await getDb()
    .update(campaigns)
    .set(set)
    .where(
      and(
        eq(campaigns.id, campaignId),
        eq(campaigns.workspaceId, workspaceId),
        eq(campaigns.status, from),
      ),
    )
    .returning();
  return row ?? null;
}

/** draft -> queued. Null if it isn't a draft (already started, or a double click). */
export const queueCampaign = (workspaceId: string, campaignId: string) =>
  moveStatus(workspaceId, campaignId, "draft", { status: "queued" });

/**
 * Worker: queued -> sending, before preparing recipients. With resume, a
 * campaign already "sending" is returned too: a retried prepare job continues
 * (preparing and queueing batches are both idempotent).
 */
export async function claimCampaign(
  workspaceId: string,
  campaignId: string,
  { resume = false } = {},
) {
  const claimed = await moveStatus(workspaceId, campaignId, "queued", {
    status: "sending",
    startedAt: new Date(),
  });
  if (claimed || !resume) return claimed;
  const current = await getCampaign(workspaceId, campaignId);
  return current?.status === "sending" ? current : null;
}

export const failCampaign = (workspaceId: string, campaignId: string, error: string) =>
  moveStatus(workspaceId, campaignId, "sending", {
    status: "failed",
    error,
    finishedAt: new Date(),
  });

/**
 * Creates a queued message for every subscribed person in the audience, in one
 * statement. Unique per (campaign, subscriber), so running it again adds no
 * duplicates. Returns the number of recipients.
 */
export async function prepareCampaignMessages(campaign: Campaign): Promise<number> {
  const db = getDb();
  let segmentRules = null;
  if (campaign.segmentId) {
    const [segment] = await db
      .select({ rules: segments.rules })
      .from(segments)
      .where(
        and(eq(segments.id, campaign.segmentId), eq(segments.workspaceId, campaign.workspaceId)),
      );
    if (!segment) return 0;
    segmentRules = segment.rules;
  }
  const audience = subscriberConditions(campaign.workspaceId, {
    status: "subscribed",
    listId: campaign.listId ?? undefined,
    segment: segmentRules ?? undefined,
  });

  await db.execute(sql`
    insert into ${messages} (workspace_id, campaign_id, subscriber_id, email)
    select ${campaign.workspaceId}, ${campaign.id}, ${subscribers.id}, ${subscribers.email}
    from ${subscribers}
    where ${audience}
    on conflict (campaign_id, subscriber_id) do nothing`);

  const [counted] = await db
    .select({ n: count() })
    .from(messages)
    .where(eq(messages.campaignId, campaign.id));
  await db
    .update(campaigns)
    .set({ recipientCount: counted?.n ?? 0 })
    .where(eq(campaigns.id, campaign.id));
  return counted?.n ?? 0;
}

/** Ids of messages still to send, split into batches in send order. */
export async function queuedMessageBatches(campaignId: string, size = 100): Promise<string[][]> {
  const rows = await getDb()
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.campaignId, campaignId), eq(messages.status, "queued")))
    .orderBy(asc(messages.id));
  const batches: string[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    batches.push(rows.slice(i, i + size).map((r) => r.id));
  }
  return batches;
}

/** The batch's messages that are still queued, with what personalisation needs. */
export async function loadMessageBatch(
  workspaceId: string,
  campaignId: string,
  messageIds: string[],
) {
  return getDb()
    .select({
      id: messages.id,
      email: messages.email,
      subscriberId: messages.subscriberId,
      firstName: subscribers.firstName,
      lastName: subscribers.lastName,
      fields: subscribers.fields,
    })
    .from(messages)
    .leftJoin(subscribers, eq(subscribers.id, messages.subscriberId))
    .where(
      and(
        eq(messages.workspaceId, workspaceId),
        eq(messages.campaignId, campaignId),
        eq(messages.status, "queued"),
        inArray(messages.id, messageIds),
      ),
    )
    .orderBy(asc(messages.id));
}

export async function markMessageSent(messageId: string, providerMessageId: string | undefined) {
  await getDb()
    .update(messages)
    .set({ status: "sent", providerMessageId, sentAt: new Date() })
    .where(and(eq(messages.id, messageId), eq(messages.status, "queued")));
}

export async function markMessageFailed(messageId: string, error: string) {
  await getDb()
    .update(messages)
    .set({ status: "failed", error: error.slice(0, 500) })
    .where(and(eq(messages.id, messageId), eq(messages.status, "queued")));
}

/**
 * Updates the campaign's counters from its messages and, once nothing is
 * left queued, marks it sent. Safe to call from every batch.
 */
export async function refreshCampaignProgress(campaignId: string) {
  const db = getDb();
  const rows = await db
    .select({ status: messages.status, n: count() })
    .from(messages)
    .where(eq(messages.campaignId, campaignId))
    .groupBy(messages.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
  const done = (by.queued ?? 0) === 0;
  await db
    .update(campaigns)
    .set({
      sentCount: by.sent ?? 0,
      failedCount: by.failed ?? 0,
      ...(done ? { status: "sent" as const, finishedAt: new Date() } : {}),
    })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "sending")));
  return { sent: by.sent ?? 0, failed: by.failed ?? 0, queued: by.queued ?? 0, done };
}
