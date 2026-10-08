import { and, asc, count, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { getDb } from "../client";
import {
  type Campaign,
  campaigns,
  EMPTY_AUDIENCE,
  messages,
  subscribers,
  templates,
} from "../schema";
import { audienceSql } from "./audience";
import { suppressedSql } from "./suppressions";

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
  | "audience"
>;

/** Content fields beyond the required ones (they have defaults). */
type ContentExtras = Partial<Pick<Campaign, "preheader" | "editor" | "design" | "mjml">>;

/** What can change while a campaign is a draft. */
export type CampaignDraftChanges = Partial<CampaignInput> & ContentExtras;

export async function createCampaign(workspaceId: string, input: CampaignInput & ContentExtras) {
  const [row] = await getDb()
    .insert(campaigns)
    .values({ workspaceId, ...input })
    .returning();
  return row!;
}

/**
 * A campaign with a template's content. The content is copied, so editing
 * the template later never changes this campaign. Name and subject default
 * to the template's. Null if the template isn't in this workspace.
 */
export async function createCampaignFromTemplate(
  workspaceId: string,
  templateId: string,
  input: Omit<CampaignInput, "name" | "subject" | "html" | "text"> & {
    name?: string;
    subject?: string;
  },
) {
  const [template] = await getDb()
    .select()
    .from(templates)
    .where(and(eq(templates.workspaceId, workspaceId), eq(templates.id, templateId)));
  if (!template) return null;
  const { name, subject, ...settings } = input;
  return createCampaign(workspaceId, {
    ...settings,
    name: name || template.name,
    subject: subject || template.subject || template.name,
    // The template's editor and design come along, so it's edited the same way.
    editor: template.editor,
    design: template.design,
    mjml: template.mjml,
    html: template.html,
    text: template.text,
  });
}

/**
 * Puts a template's content into a draft, replacing what was there, and its
 * subject when the draft has none yet. False if either isn't found.
 */
export async function applyTemplateToDraft(
  workspaceId: string,
  campaignId: string,
  templateId: string,
) {
  const [template] = await getDb()
    .select()
    .from(templates)
    .where(and(eq(templates.workspaceId, workspaceId), eq(templates.id, templateId)));
  const campaign = await getCampaign(workspaceId, campaignId);
  if (!template || !campaign) return false;
  return updateDraftCampaign(workspaceId, campaignId, {
    editor: template.editor,
    design: template.design,
    mjml: template.mjml,
    html: template.html,
    text: template.text,
    ...(campaign.subject ? {} : { subject: template.subject }),
  });
}

/** A new, empty draft for the campaign builder. */
export async function createDraftCampaign(workspaceId: string, fromName: string) {
  return createCampaign(workspaceId, {
    name: "Untitled campaign",
    subject: "",
    fromName,
    fromLocal: "news",
    replyTo: null,
    html: "",
    text: "",
    sendingDomainId: null,
    sendingServerId: null,
    audience: EMPTY_AUDIENCE,
  });
}

/** For the campaigns list: no content. */
export async function listCampaigns(workspaceId: string) {
  return getDb()
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
      recipientCount: campaigns.recipientCount,
      sentCount: campaigns.sentCount,
      createdAt: campaigns.createdAt,
      startedAt: campaigns.startedAt,
      scheduledAt: campaigns.scheduledAt,
    })
    .from(campaigns)
    .where(eq(campaigns.workspaceId, workspaceId))
    .orderBy(desc(campaigns.createdAt));
}

/** Changes a draft. False if the campaign doesn't exist or is no longer a draft. */
export async function updateDraftCampaign(
  workspaceId: string,
  campaignId: string,
  changes: CampaignDraftChanges,
) {
  const rows = await getDb()
    .update(campaigns)
    .set(changes)
    .where(
      and(
        eq(campaigns.id, campaignId),
        eq(campaigns.workspaceId, workspaceId),
        eq(campaigns.status, "draft"),
      ),
    )
    .returning({ id: campaigns.id });
  return rows.length > 0;
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
  const audience = await audienceSql(campaign.workspaceId, campaign.audience);

  // In subscriber-timezone mode each message waits for the chosen local time
  // in its subscriber's timezone (or the schedule's, when unknown or invalid).
  const sendAfter =
    campaign.sendInSubscriberTimezone && campaign.scheduleLocal && campaign.scheduleTimezone
      ? sql`(${localString(campaign.scheduleLocal)}::timestamp at time zone
          case when ${subscribers.timezone} in (select name from pg_timezone_names)
            then ${subscribers.timezone} else ${campaign.scheduleTimezone} end)`
      : sql`null::timestamptz`;

  await db.execute(sql`
    insert into ${messages} (workspace_id, campaign_id, subscriber_id, email, send_after)
    select ${campaign.workspaceId}, ${campaign.id}, ${subscribers.id}, ${subscribers.email}, ${sendAfter}
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
      variant: messages.variant,
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

/** sentAt is when the message was handed to the server (what rate limits count). */
/**
 * Pauses a sending campaign by hand. Running batches notice within a few
 * messages; the rest stay queued for resume. Null unless it was sending.
 */
export async function pauseCampaign(workspaceId: string, campaignId: string) {
  return moveStatus(workspaceId, campaignId, "sending", { status: "paused", error: null });
}

/**
 * Stops a campaign for good: anything not sent yet is skipped. Works on
 * scheduled, queued, sending and paused campaigns. False if it was none of those.
 */
export async function cancelCampaign(workspaceId: string, campaignId: string) {
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .update(campaigns)
      .set({ status: "canceled", finishedAt: new Date() })
      .where(
        and(
          eq(campaigns.id, campaignId),
          eq(campaigns.workspaceId, workspaceId),
          inArray(campaigns.status, ["scheduled", "queued", "sending", "paused"]),
        ),
      )
      .returning({ id: campaigns.id });
    if (rows.length === 0) return false;
    await tx
      .update(messages)
      .set({ status: "skipped", error: "Canceled" })
      .where(
        and(eq(messages.campaignId, campaignId), inArray(messages.status, ["queued", "held"])),
      );
    return true;
  });
}

/**
 * Puts a paused campaign back to sending. The caller queues the batches of
 * messages still waiting. Null if the campaign isn't paused.
 */
export async function resumeCampaign(workspaceId: string, campaignId: string) {
  const [row] = await getDb()
    .update(campaigns)
    .set({ status: "sending", error: null })
    .where(
      and(
        eq(campaigns.id, campaignId),
        eq(campaigns.workspaceId, workspaceId),
        eq(campaigns.status, "paused"),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Just before sending: marks messages skipped whose address has since been
 * suppressed, or whose subscriber unsubscribed, bounced, complained or was
 * deleted after the campaign started. Returns how many were skipped.
 */
export async function skipUnsendableMessages(
  workspaceId: string,
  campaignId: string,
  messageIds: string[],
) {
  if (messageIds.length === 0) return 0;
  const result = await getDb().execute(sql`
    update ${messages} m set
      status = 'skipped',
      error = case
        when ${suppressedSql(workspaceId, sql`m.email`)} then 'Suppressed'
        else 'No longer subscribed'
      end
    where m.workspace_id = ${workspaceId}
      and m.campaign_id = ${campaignId}
      and m.status = 'queued'
      and m.id in ${messageIds}
      and (
        ${suppressedSql(workspaceId, sql`m.email`)}
        or not exists (
          select 1 from ${subscribers} s
          where s.id = m.subscriber_id and s.status = 'subscribed'
        )
      )`);
  return result.count;
}

export async function markMessageSent(
  messageId: string,
  providerMessageId: string | undefined,
  sentAt = new Date(),
) {
  await getDb()
    .update(messages)
    .set({ status: "sent", providerMessageId, sentAt })
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
  // Held A/B remainders still have to go out.
  const done = (by.queued ?? 0) === 0 && (by.held ?? 0) === 0;
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

/**
 * A timestamp-without-timezone column comes back as a Date read as UTC;
 * this turns it back into the wall-clock text Postgres stored.
 */
function localString(value: Date) {
  return value.toISOString().slice(0, 19);
}

/**
 * Queued messages in batches, each batch sharing one send time (null: now).
 * Subscriber-timezone sends have one group of batches per local moment.
 */
export async function queuedMessageBatchesTimed(campaignId: string, size = 100) {
  const rows = await getDb()
    .select({ id: messages.id, sendAfter: messages.sendAfter })
    .from(messages)
    .where(and(eq(messages.campaignId, campaignId), eq(messages.status, "queued")))
    .orderBy(asc(messages.sendAfter), asc(messages.id));
  const batches: { sendAfter: Date | null; messageIds: string[] }[] = [];
  for (const row of rows) {
    const last = batches.at(-1);
    const sameTime = last && last.sendAfter?.getTime() === row.sendAfter?.getTime();
    if (last && sameTime && last.messageIds.length < size) last.messageIds.push(row.id);
    else batches.push({ sendAfter: row.sendAfter, messageIds: [row.id] });
  }
  return batches;
}

export async function isValidTimezone(timezone: string) {
  const [row] = await getDb().execute<{ ok: boolean }>(
    sql`select exists (select 1 from pg_timezone_names where name = ${timezone}) as ok`,
  );
  return Boolean(row?.ok);
}

export type ScheduleInput = {
  /** Local date and time, "YYYY-MM-DDTHH:mm". */
  local: string;
  timezone: string;
  /** Send at that local time in each subscriber's own timezone. */
  perSubscriber: boolean;
};

/**
 * Schedules a draft. The start time is worked out in Postgres from the local
 * time and timezone; in per-subscriber mode the campaign starts when that
 * local time first comes anywhere (UTC+14) and each message waits for its own.
 */
export async function scheduleCampaign(
  workspaceId: string,
  campaignId: string,
  input: ScheduleInput,
): Promise<{ ok: true; scheduledAt: Date } | { ok: false; error: "past" | "timezone" | "state" }> {
  if (!(await isValidTimezone(input.timezone))) return { ok: false, error: "timezone" };
  const db = getDb();
  const local = sql`${input.local}::timestamp`;
  // When it starts, and the last moment anyone gets it (UTC-12).
  // (Etc/GMT-14 is UTC+14: POSIX zone names have the sign reversed.)
  const ms = (zone: SQL) => sql`(extract(epoch from ${local} at time zone ${zone}) * 1000)::float8`;
  const [times] = await db.execute<{ start: number; last: number }>(sql`
    select ${input.perSubscriber ? ms(sql`'Etc/GMT-14'`) : ms(sql`${input.timezone}`)} as start,
           ${input.perSubscriber ? ms(sql`'Etc/GMT+12'`) : ms(sql`${input.timezone}`)} as last`);
  const start = new Date(Number(times!.start));
  if (Number(times!.last) < Date.now()) return { ok: false, error: "past" };

  const rows = await db
    .update(campaigns)
    .set({
      status: "scheduled",
      scheduledAt: start,
      scheduleLocal: sql`${local}`,
      scheduleTimezone: input.timezone,
      sendInSubscriberTimezone: input.perSubscriber,
    })
    .where(
      and(
        eq(campaigns.id, campaignId),
        eq(campaigns.workspaceId, workspaceId),
        eq(campaigns.status, "draft"),
      ),
    )
    .returning({ id: campaigns.id });
  return rows.length > 0 ? { ok: true, scheduledAt: start } : { ok: false, error: "state" };
}

/** Back to a draft, to change it or send it another way. */
export async function unscheduleCampaign(workspaceId: string, campaignId: string) {
  const rows = await getDb()
    .update(campaigns)
    .set({
      status: "draft",
      scheduledAt: null,
      scheduleLocal: null,
      sendInSubscriberTimezone: false,
    })
    .where(
      and(
        eq(campaigns.id, campaignId),
        eq(campaigns.workspaceId, workspaceId),
        eq(campaigns.status, "scheduled"),
      ),
    )
    .returning({ id: campaigns.id });
  return rows.length > 0;
}

/** Moves scheduled campaigns whose time has come to queued; returns them for queueing. */
export async function startDueCampaigns() {
  return getDb()
    .update(campaigns)
    .set({ status: "queued" })
    .where(and(eq(campaigns.status, "scheduled"), sql`${campaigns.scheduledAt} <= now()`))
    .returning({ campaignId: campaigns.id, workspaceId: campaigns.workspaceId });
}
