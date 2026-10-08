import { sql } from "drizzle-orm";
import { getDb } from "../client";

// A subscriber's profile (D52): who they are, what they're worth, and their
// journey through the emails: sent, opened, clicked, converted, newest first.
// Machine opens and scanner clicks are left out, as in reports.

export type SubscriberProfile = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  source: string;
  timezone: string | null;
  /** Epoch ms. */
  createdAt: number;
  subscribedAt: number | null;
  lists: { id: string; name: string }[];
  tags: string[];
  fields: Record<string, unknown>;
  stats: {
    emails: number;
    opened: number;
    clicked: number;
    conversions: number;
    /** Approved revenue credited to them. */
    lifetimeValue: number;
    /** Leads and sales still pending. */
    pendingValue: number;
    lastActivity: number | null;
  };
};

export type TimelineEvent = {
  kind:
    | "subscribed"
    | "unsubscribed"
    | "sent"
    | "opened"
    | "clicked"
    | "converted"
    | "bounced"
    | "complained";
  /** Epoch ms. */
  at: number;
  campaignId: string | null;
  campaignName: string | null;
  /** clicked: the link; converted: source and event; bounced: the type. */
  detail: string | null;
  /** converted only. */
  value: number | null;
  currency: string | null;
  status: string | null;
};

const ms = (column: string) => sql.raw(`(extract(epoch from ${column}) * 1000)::float8`);

export async function getSubscriberProfile(
  workspaceId: string,
  subscriberId: string,
): Promise<SubscriberProfile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(subscriberId)) return null;
  const db = getDb();
  const [row] = await db.execute<
    Omit<SubscriberProfile, "stats" | "lists" | "tags"> & {
      lists: { id: string; name: string }[] | null;
      tags: string[] | null;
    }
  >(sql`
    select s.id, s.email, s.first_name as "firstName", s.last_name as "lastName", s.status,
           s.source, s.timezone, s.fields, ${ms("s.created_at")} as "createdAt",
           ${ms("s.subscribed_at")} as "subscribedAt",
           (select json_agg(json_build_object('id', l.id, 'name', l.name) order by l.name)
              from list_memberships m join lists l on l.id = m.list_id
              where m.subscriber_id = s.id) as lists,
           (select json_agg(t.name order by t.name)
              from subscriber_tags st join tags t on t.id = st.tag_id
              where st.subscriber_id = s.id) as tags
    from subscribers s where s.workspace_id = ${workspaceId} and s.id = ${subscriberId}`);
  if (!row) return null;

  const [stats] = await db.execute<SubscriberProfile["stats"]>(sql`
    select
      (select count(*) from messages where subscriber_id = ${subscriberId}
         and workspace_id = ${workspaceId} and status = 'sent')::int as emails,
      (select count(*) from messages where subscriber_id = ${subscriberId}
         and workspace_id = ${workspaceId} and opened_at is not null)::int as opened,
      (select count(*) from messages where subscriber_id = ${subscriberId}
         and workspace_id = ${workspaceId} and clicked_at is not null)::int as clicked,
      (select count(*) from conversions where subscriber_id = ${subscriberId}
         and workspace_id = ${workspaceId} and status = 'approved')::int as conversions,
      (select coalesce(sum(value), 0) from conversions where subscriber_id = ${subscriberId}
         and workspace_id = ${workspaceId} and status = 'approved')::float8 as "lifetimeValue",
      (select coalesce(sum(value), 0) from conversions where subscriber_id = ${subscriberId}
         and workspace_id = ${workspaceId} and status = 'pending')::float8 as "pendingValue",
      greatest(
        (select max(${ms("created_at")}) from clicks where subscriber_id = ${subscriberId}
           and workspace_id = ${workspaceId} and not is_bot),
        (select max(${ms("opened_at")}) from messages where subscriber_id = ${subscriberId}
           and workspace_id = ${workspaceId}),
        (select max(${ms("created_at")}) from conversions where subscriber_id = ${subscriberId}
           and workspace_id = ${workspaceId})
      ) as "lastActivity"`);

  return { ...row, lists: row.lists ?? [], tags: row.tags ?? [], stats: stats! };
}

/** The journey, newest first, `limit` events at most. */
export async function subscriberTimeline(
  workspaceId: string,
  subscriberId: string,
  limit = 200,
): Promise<TimelineEvent[]> {
  return getDb().execute<TimelineEvent>(sql`
    select * from (
      select 'subscribed' as kind, ${ms("subscribed_at")} as at, null::uuid as "campaignId",
             null as "campaignName", source::text as detail, null::float8 as value,
             null as currency, null as status
      from subscribers where id = ${subscriberId} and workspace_id = ${workspaceId}
        and subscribed_at is not null
      union all
      select 'unsubscribed', ${ms("unsubscribed_at")}, null, null, null, null, null, null
      from subscribers where id = ${subscriberId} and workspace_id = ${workspaceId}
        and unsubscribed_at is not null
      union all
      select 'sent', ${ms("m.sent_at")}, m.campaign_id, c.name, null, null, null, null
      from messages m left join campaigns c on c.id = m.campaign_id
      where m.subscriber_id = ${subscriberId} and m.workspace_id = ${workspaceId}
        and m.sent_at is not null
      union all
      select 'opened', ${ms("o.created_at")}, o.campaign_id, c.name, null, null, null, null
      from opens o left join campaigns c on c.id = o.campaign_id
      where o.subscriber_id = ${subscriberId} and o.workspace_id = ${workspaceId}
        and not o.is_machine
      union all
      select 'clicked', ${ms("k.created_at")}, k.campaign_id, c.name,
             coalesce(l.label, l.url), null, null, null
      from clicks k left join campaigns c on c.id = k.campaign_id
      left join links l on l.id = k.link_id
      where k.subscriber_id = ${subscriberId} and k.workspace_id = ${workspaceId}
        and not k.is_bot
      union all
      select 'converted', ${ms("v.created_at")}, v.campaign_id, c.name,
             v.source::text || ' ' || v.event::text, v.value::float8, v.currency,
             coalesce(v.lead_stage::text, v.status::text)
      from conversions v left join campaigns c on c.id = v.campaign_id
      where v.subscriber_id = ${subscriberId} and v.workspace_id = ${workspaceId}
      union all
      select 'bounced', ${ms("m.bounced_at")}, m.campaign_id, c.name, m.bounce_type::text,
             null, null, null
      from messages m left join campaigns c on c.id = m.campaign_id
      where m.subscriber_id = ${subscriberId} and m.workspace_id = ${workspaceId}
        and m.bounced_at is not null
      union all
      select 'complained', ${ms("m.complained_at")}, m.campaign_id, c.name, null, null, null, null
      from messages m left join campaigns c on c.id = m.campaign_id
      where m.subscriber_id = ${subscriberId} and m.workspace_id = ${workspaceId}
        and m.complained_at is not null
    ) events
    order by at desc, kind
    limit ${limit}`);
}
