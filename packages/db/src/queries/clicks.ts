import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../client";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** "sc" + 16 random letters and digits (95 bits): short and safe in any sub-id field. */
export function newClickId() {
  let id = "sc";
  while (id.length < 18) {
    for (const byte of randomBytes(24)) {
      // 248 = 4 x 62: dropping higher bytes keeps every character equally likely.
      if (byte < 248 && id.length < 18) id += BASE62[byte % 62];
    }
  }
  return id;
}

export type RecordedClick = {
  clickId: string;
  /** The link as written in the email; merge tags not yet filled in. */
  url: string;
  workspaceId: string;
  campaignId: string;
  campaignName: string;
  link: { label: string | null; position: number; networkId: string | null };
  tracking: { addUtm: boolean; utmSource: string };
  subscriber: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    fields: Record<string, unknown> | null;
  };
};

/**
 * Records a click on a tracked link and returns where to send the person.
 * One round trip: the click row, the message's first click, and the link's
 * URL with the subscriber (for merge tags in it). Null if the message or
 * link doesn't exist, or the link isn't from that message's campaign.
 */
export async function recordClick(input: {
  messageId: string;
  linkId: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<RecordedClick | null> {
  const clickId = newClickId();
  const ua = input.userAgent?.slice(0, 500) ?? null;
  const [row] = await getDb().execute<{
    url: string;
    label: string | null;
    position: number;
    network_id: string | null;
    workspace_id: string;
    campaign_id: string;
    campaign_name: string;
    add_utm: boolean | null;
    utm_source: string | null;
    email: string;
    first_name: string | null;
    last_name: string | null;
    fields: Record<string, unknown> | null;
  }>(sql`
    with m as (
      select id, workspace_id, campaign_id, subscriber_id, email
      from messages where id = ${input.messageId}
    ), l as (
      select links.id, links.url, links.label, links.position, links.network_id
      from links join m on links.campaign_id = m.campaign_id
      where links.id = ${input.linkId}
    ), ins as (
      insert into clicks (click_id, workspace_id, campaign_id, message_id, link_id, subscriber_id, ip, user_agent)
      select ${clickId}, m.workspace_id, m.campaign_id, m.id, l.id, m.subscriber_id, ${input.ip}, ${ua}
      from m, l
      returning id
    ), first_click as (
      update messages set clicked_at = now()
      where id = ${input.messageId} and clicked_at is null and exists (select 1 from l)
      returning id
    )
    select l.url, l.label, l.position, l.network_id, m.workspace_id, m.campaign_id,
           c.name as campaign_name, t.add_utm, t.utm_source,
           m.email, s.first_name, s.last_name, s.fields
    from m cross join l
    join campaigns c on c.id = m.campaign_id
    left join tracking_settings t on t.workspace_id = m.workspace_id
    left join subscribers s on s.id = m.subscriber_id`);
  if (!row) return null;
  return {
    clickId,
    url: row.url,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    link: { label: row.label, position: row.position, networkId: row.network_id },
    // Defaults when the workspace never changed its tracking settings.
    tracking: { addUtm: row.add_utm ?? true, utmSource: row.utm_source ?? "sendcoop" },
    subscriber: {
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      fields: row.fields,
    },
  };
}
