import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { isBotUserAgent, isMachineOpen } from "../bot-detection";
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
  /** A machine's click (scanner, previewer): redirected, but left out of reports. */
  isBot: boolean;
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
  const agentIsBot = isBotUserAgent(ua);
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
    is_bot: boolean;
    burst: boolean;
  }>(sql`
    with m as (
      select id, workspace_id, campaign_id, subscriber_id, email, sent_at
      from messages where id = ${input.messageId}
    ), l as (
      select links.id, links.url, links.label, links.position, links.network_id
      from links join m on links.campaign_id = m.campaign_id
      where links.id = ${input.linkId}
    ), verdict as (
      -- A machine: its user agent, a click within seconds of the email going
      -- out (scanners check mail as it arrives), or a burst: three or more
      -- different links of one email within two seconds.
      select (${agentIsBot} or coalesce(m.sent_at > now() - interval '5 seconds', false)) as quick_or_agent,
             (select count(distinct link_id) from (
                select link_id from clicks
                where message_id = m.id and created_at > now() - interval '2 seconds'
                union select ${input.linkId}::uuid) recent) >= 3 as burst
      from m
    ), ins as (
      insert into clicks (click_id, workspace_id, campaign_id, message_id, link_id, subscriber_id, ip, user_agent, is_bot)
      select ${clickId}, m.workspace_id, m.campaign_id, m.id, l.id, m.subscriber_id, ${input.ip}, ${ua},
             v.quick_or_agent or v.burst
      from m, l, verdict v
      returning id
    ), flag_burst as (
      -- The earlier clicks of a burst were the same machine.
      update clicks set is_bot = true
      where message_id = ${input.messageId} and created_at > now() - interval '2 seconds'
        and not is_bot and (select burst from verdict)
      returning id
    ), first_click as (
      update messages set clicked_at = now()
      where id = ${input.messageId} and clicked_at is null and exists (select 1 from l)
        and not (select quick_or_agent or burst from verdict)
      returning id
    )
    select l.url, l.label, l.position, l.network_id, m.workspace_id, m.campaign_id,
           c.name as campaign_name, t.add_utm, t.utm_source,
           m.email, s.first_name, s.last_name, s.fields,
           v.quick_or_agent or v.burst as is_bot, v.burst
    from m cross join l cross join verdict v
    join campaigns c on c.id = m.campaign_id
    left join tracking_settings t on t.workspace_id = m.workspace_id
    left join subscribers s on s.id = m.subscriber_id`);
  if (!row) return null;
  // A burst may have unmasked clicks that counted as a person's first click.
  if (row.burst) await refreshFirstHumanClick(input.messageId);
  return {
    clickId,
    isBot: row.is_bot,
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

/** Sets a message's first click to its earliest click by a person (or none). */
export async function refreshFirstHumanClick(messageId: string) {
  await getDb().execute(sql`
    update messages set clicked_at = (
      select min(created_at) from clicks where message_id = ${messageId} and not is_bot)
    where id = ${messageId}`);
}

/**
 * The hidden link in every email was followed: only a machine does that
 * (people can't see it). Its clicks on that email in the last minute are
 * flagged. False if the message doesn't exist.
 */
export async function recordHoneypot(messageId: string) {
  const rows = await getDb().execute<{ id: string }>(sql`
    update clicks set is_bot = true
    where message_id = ${messageId} and created_at > now() - interval '60 seconds' and not is_bot
    returning id`);
  if (rows.length > 0) await refreshFirstHumanClick(messageId);
  const [exists] = await getDb().execute<{ ok: boolean }>(
    sql`select exists (select 1 from messages where id = ${messageId}) as ok`,
  );
  return Boolean(exists?.ok);
}

/**
 * The open pixel loaded. Machine opens (Apple Mail Privacy Protection,
 * scanners, or within seconds of sending) are recorded but don't count as
 * the message being opened. False if the message doesn't exist.
 */
export async function recordOpen(input: {
  messageId: string;
  ip: string | null;
  userAgent: string | null;
}) {
  const ua = input.userAgent?.slice(0, 500) ?? null;
  const machine = isMachineOpen(input.ip, ua);
  const [row] = await getDb().execute<{ ok: boolean }>(sql`
    with m as (
      select id, workspace_id, campaign_id, subscriber_id,
             ${machine} or coalesce(sent_at > now() - interval '5 seconds', false) as machine
      from messages where id = ${input.messageId}
    ), ins as (
      insert into opens (workspace_id, campaign_id, message_id, subscriber_id, ip, user_agent, is_machine)
      select workspace_id, campaign_id, id, subscriber_id, ${input.ip}, ${ua}, machine from m
      returning id
    ), first_open as (
      update messages set opened_at = now()
      where id = ${input.messageId} and opened_at is null and not (select machine from m)
      returning id
    )
    select exists (select 1 from m) as ok`);
  return Boolean(row?.ok);
}
