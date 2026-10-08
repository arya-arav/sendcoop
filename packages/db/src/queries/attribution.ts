import { sql } from "drizzle-orm";
import { getDb } from "../client";

// Which email gets the credit for a conversion.
//
// 1. click: the conversion came with our click id (sc_cid, a network sub-id).
// 2. email: no usable click id, but the buyer's email is a subscriber's:
//    their last click by a person within the attribution window (default 7
//    days) before the conversion gets it.
// 3. subscriber: a known subscriber without such a click; on their profile,
//    not on any campaign.
// 4. none.

export type Attribution = {
  method: "click" | "email" | "subscriber" | "none";
  clickRowId: string | null;
  messageId: string | null;
  campaignId: string | null;
  automationId: string | null;
  subscriberId: string | null;
};

const NONE: Attribution = {
  method: "none",
  clickRowId: null,
  messageId: null,
  campaignId: null,
  automationId: null,
  subscriberId: null,
};

export async function attributeConversion(
  workspaceId: string,
  input: { clickId?: string | null; email?: string | null; occurredAt?: Date },
): Promise<Attribution> {
  const db = getDb();
  if (input.clickId) {
    // A person's click first, should a scanner have fetched the same link.
    const [click] = await db.execute<{
      id: string;
      message_id: string | null;
      campaign_id: string | null;
      subscriber_id: string | null;
    }>(sql`
      select id, message_id, campaign_id, subscriber_id from clicks
      where workspace_id = ${workspaceId} and click_id = ${input.clickId}
      order by is_bot, id limit 1`);
    if (click) {
      return {
        method: "click",
        clickRowId: click.id,
        messageId: click.message_id,
        campaignId: click.campaign_id,
        automationId: null,
        subscriberId: click.subscriber_id,
      };
    }
  }

  const email = input.email?.trim().toLowerCase();
  if (!email) return NONE;
  const at = (input.occurredAt ?? new Date()).toISOString();
  const [match] = await db.execute<{
    subscriber_id: string;
    click_id: string | null;
    message_id: string | null;
    campaign_id: string | null;
  }>(sql`
    select s.id as subscriber_id, c.id as click_id, c.message_id, c.campaign_id
    from subscribers s
    left join lateral (
      select clicks.id, clicks.message_id, clicks.campaign_id from clicks
      where clicks.workspace_id = ${workspaceId} and clicks.subscriber_id = s.id
        and not clicks.is_bot
        and clicks.created_at <= ${at}::timestamptz
        and clicks.created_at > ${at}::timestamptz - make_interval(days => coalesce(
          (select attribution_window_days from tracking_settings where workspace_id = ${workspaceId}), 7))
      order by clicks.created_at desc limit 1
    ) c on true
    where s.workspace_id = ${workspaceId} and s.email = ${email}`);
  if (!match) return NONE;
  if (!match.click_id) return { ...NONE, method: "subscriber", subscriberId: match.subscriber_id };
  return {
    method: "email",
    clickRowId: match.click_id,
    messageId: match.message_id,
    campaignId: match.campaign_id,
    automationId: null,
    subscriberId: match.subscriber_id,
  };
}

/**
 * A message's revenue: its approved conversions (reversed or rejected ones
 * don't count). Kept on the message for fast reports and A/B decisions.
 */
export async function refreshMessageRevenue(messageId: string) {
  await getDb().execute(sql`
    update messages set revenue = coalesce((
      select sum(value) from conversions where message_id = ${messageId} and status = 'approved'
    ), 0)
    where id = ${messageId}`);
}
