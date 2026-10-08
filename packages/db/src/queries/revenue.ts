import { sql } from "drizzle-orm";
import { getDb } from "../client";

// Revenue reports (D51): what the emails earned, by campaign, by link and by
// audience, over a period. Everything counts within the period on its own
// clock: sends by when they were sent, clicks by when they happened,
// conversions by when they arrived. Only approved conversions are revenue,
// and only people's clicks count (not scanners').
//
// By campaign, the rows plus "unattributed" add up to the totals, which come
// straight from the tables. By link the same holds, with "no link" for
// conversions credited by email. By audience they don't: a campaign sent to
// two lists counts in both.

export type RevenueGrouping = "campaign" | "link" | "audience";

export type RevenueMetrics = {
  sent: number;
  /** People who clicked (one per email), not scanners. */
  clicks: number;
  conversions: number;
  revenue: number;
  /** Earnings per click: revenue / clicks. */
  epc: number;
  /** Revenue per 1,000 emails sent. */
  revenuePer1k: number;
  /** conversions / clicks. */
  conversionRate: number;
  /** null without a cost. */
  cost: number | null;
  /** (revenue - cost) / cost; null without a cost. */
  roi: number | null;
};

export type RevenueRow = RevenueMetrics & {
  /** null: the unattributed / no-link row. */
  id: string | null;
  name: string;
  /** For links: the campaign it's in. */
  campaignId: string | null;
  campaignName: string | null;
  kind?: "list" | "segment" | "everyone";
};

export type RevenuePeriod = { from: Date | null; to: Date };

type Raw = {
  sent: number;
  clicks: number;
  conversions: number;
  revenue: number;
  cost: number | null;
};

function metrics(raw: Raw): RevenueMetrics {
  const per = (a: number, b: number) => (b > 0 ? a / b : 0);
  const revenue = Math.round(raw.revenue * 100) / 100;
  return {
    sent: raw.sent,
    clicks: raw.clicks,
    conversions: raw.conversions,
    revenue,
    epc: per(revenue, raw.clicks),
    revenuePer1k: per(revenue * 1000, raw.sent),
    conversionRate: per(raw.conversions, raw.clicks),
    cost: raw.cost,
    roi: raw.cost && raw.cost > 0 ? (revenue - raw.cost) / raw.cost : null,
  };
}

export async function revenueReport(
  workspaceId: string,
  grouping: RevenueGrouping,
  period: RevenuePeriod,
) {
  const db = getDb();
  const from = period.from?.toISOString() ?? "-infinity";
  const to = period.to.toISOString();
  const within = (column: string) =>
    sql.raw(`${column} >= '${from}'::timestamptz and ${column} < '${to}'::timestamptz`);

  const [totals] = await db.execute<Raw>(sql`
    select
      (select count(*) from messages where workspace_id = ${workspaceId}
         and status = 'sent' and ${within("sent_at")})::int as sent,
      (select count(distinct message_id) from clicks where workspace_id = ${workspaceId}
         and not is_bot and ${within("created_at")})::int as clicks,
      (select count(*) from conversions where workspace_id = ${workspaceId}
         and status = 'approved' and ${within("created_at")})::int as conversions,
      (select coalesce(sum(value_base), 0) from conversions where workspace_id = ${workspaceId}
         and status = 'approved' and ${within("created_at")})::float8 as revenue,
      (select sum(cost) from campaigns where workspace_id = ${workspaceId}
         and cost is not null and ${within("started_at")})::float8 as cost`);

  let rows: RevenueRow[];
  if (grouping === "campaign") {
    const raw = await db.execute<Raw & { id: string | null; name: string | null }>(sql`
      with s as (
        select campaign_id, count(*)::int as sent from messages
        where workspace_id = ${workspaceId} and campaign_id is not null
          and status = 'sent' and ${within("sent_at")}
        group by campaign_id
      ), k as (
        select campaign_id, count(distinct message_id)::int as clicks from clicks
        where workspace_id = ${workspaceId} and campaign_id is not null
          and not is_bot and ${within("created_at")}
        group by campaign_id
      ), v as (
        select campaign_id, count(*)::int as conversions, sum(value_base)::float8 as revenue
        from conversions
        where workspace_id = ${workspaceId} and status = 'approved' and ${within("created_at")}
        group by campaign_id
      )
      select x.campaign_id as id, c.name, c.cost::float8 as cost,
             coalesce(s.sent, 0) as sent, coalesce(k.clicks, 0) as clicks,
             coalesce(v.conversions, 0) as conversions, coalesce(v.revenue, 0) as revenue
      from (select campaign_id from s union select campaign_id from k
            union select campaign_id from v) x
      left join s on s.campaign_id is not distinct from x.campaign_id
      left join k on k.campaign_id is not distinct from x.campaign_id
      left join v on v.campaign_id is not distinct from x.campaign_id
      left join campaigns c on c.id = x.campaign_id
      order by revenue desc, sent desc`);
    rows = raw.map((r) => ({
      ...metrics(r),
      id: r.id,
      name: r.id ? (r.name ?? "Deleted campaign") : "Unattributed (no email credited)",
      campaignId: r.id,
      campaignName: r.name,
    }));
  } else if (grouping === "link") {
    const raw = await db.execute<
      Raw & {
        id: string | null;
        url: string | null;
        label: string | null;
        campaign_id: string | null;
        campaign_name: string | null;
      }
    >(sql`
      with k as (
        select link_id, count(distinct message_id)::int as clicks from clicks
        where workspace_id = ${workspaceId} and link_id is not null
          and not is_bot and ${within("created_at")}
        group by link_id
      ), v as (
        select k.link_id, count(*)::int as conversions, sum(v.value_base)::float8 as revenue
        from conversions v left join clicks k on k.id = v.click_row_id
        where v.workspace_id = ${workspaceId} and v.status = 'approved'
          and ${within("v.created_at")}
        group by k.link_id
      )
      select x.link_id as id, l.url, l.label, l.campaign_id, c.name as campaign_name,
             0 as sent, coalesce(k.clicks, 0) as clicks,
             coalesce(v.conversions, 0) as conversions, coalesce(v.revenue, 0) as revenue,
             null::float8 as cost
      from (select link_id from k union select link_id from v) x
      left join k on k.link_id is not distinct from x.link_id
      left join v on v.link_id is not distinct from x.link_id
      left join links l on l.id = x.link_id
      left join campaigns c on c.id = l.campaign_id
      order by revenue desc, clicks desc
      limit 200`);
    rows = raw.map((r) => ({
      ...metrics(r),
      id: r.id,
      name: r.id
        ? r.label
          ? `${r.label} (${r.url})`
          : (r.url ?? "Deleted link")
        : "No link (credited by email)",
      campaignId: r.campaign_id,
      campaignName: r.campaign_name,
    }));
  } else {
    const raw = await db.execute<
      Raw & { id: string | null; kind: "list" | "segment" | "everyone"; name: string | null }
    >(sql`
      with targets as (
        select c.id as campaign_id, 'list' as kind, t.value as target_id
        from campaigns c, jsonb_array_elements_text(c.audience->'lists') t
        where c.workspace_id = ${workspaceId}
        union all
        select c.id, 'segment', t.value
        from campaigns c, jsonb_array_elements_text(c.audience->'segments') t
        where c.workspace_id = ${workspaceId}
        union all
        select c.id, 'everyone', null from campaigns c
        where c.workspace_id = ${workspaceId} and (c.audience->>'everyone')::boolean
      ), per_campaign as (
        select c.id as campaign_id, c.cost,
          (select count(*) from messages m where m.campaign_id = c.id and m.status = 'sent'
             and ${within("m.sent_at")})::int as sent,
          (select count(distinct k.message_id) from clicks k where k.campaign_id = c.id
             and not k.is_bot and ${within("k.created_at")})::int as clicks,
          (select count(*) from conversions v where v.campaign_id = c.id
             and v.status = 'approved' and ${within("v.created_at")})::int as conversions,
          (select coalesce(sum(v.value_base), 0) from conversions v where v.campaign_id = c.id
             and v.status = 'approved' and ${within("v.created_at")})::float8 as revenue
        from campaigns c where c.workspace_id = ${workspaceId} and c.started_at is not null
      )
      select t.kind, t.target_id as id, coalesce(l.name, s.name) as name,
             sum(p.sent)::int as sent, sum(p.clicks)::int as clicks,
             sum(p.conversions)::int as conversions, sum(p.revenue)::float8 as revenue,
             sum(p.cost)::float8 as cost
      from targets t join per_campaign p on p.campaign_id = t.campaign_id
      left join lists l on t.kind = 'list' and l.id::text = t.target_id
      left join segments s on t.kind = 'segment' and s.id::text = t.target_id
      group by t.kind, t.target_id, l.name, s.name
      having sum(p.sent) > 0 or sum(p.conversions) > 0
      order by revenue desc, sent desc`);
    rows = raw.map((r) => ({
      ...metrics(r),
      id: r.id,
      kind: r.kind,
      name: r.kind === "everyone" ? "All subscribers" : (r.name ?? `Deleted ${r.kind}`),
      campaignId: null,
      campaignName: null,
    }));
  }
  return { totals: metrics(totals!), rows };
}

/** Saves what a campaign cost (null clears it). */
export async function setCampaignCost(
  workspaceId: string,
  campaignId: string,
  cost: number | null,
) {
  const [row] = await getDb().execute<{ id: string }>(sql`
    update campaigns set cost = ${cost}, updated_at = now()
    where workspace_id = ${workspaceId} and id = ${campaignId} returning id`);
  return Boolean(row);
}
