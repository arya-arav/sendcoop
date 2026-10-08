import { sql } from "drizzle-orm";
import { getDb } from "../client";

// The dashboard (D55): the last N days at a glance. Revenue per day, the
// campaigns and the offers (affiliate and product links) that earned most.
// Same rules as the reports: approved conversions in the reporting currency,
// people's clicks only.

export type DashboardDay = { day: string; revenue: number; conversions: number };

export type DashboardOffer = {
  /** The link's address without its query string: the offer. */
  url: string;
  networkId: string | null;
  campaigns: number;
  clicks: number;
  conversions: number;
  revenue: number;
};

export type DashboardCampaign = {
  id: string;
  name: string;
  sent: number;
  conversions: number;
  revenue: number;
};

export async function dashboardSummary(workspaceId: string, days = 30) {
  const db = getDb();
  const since = sql`(current_date - ${days - 1}::int)::timestamptz`;
  const [series, [totals], campaigns, offers] = await Promise.all([
    db.execute<DashboardDay>(sql`
      select to_char(d.day, 'YYYY-MM-DD') as day,
             coalesce(v.revenue, 0)::float8 as revenue, coalesce(v.conversions, 0)::int as conversions
      from generate_series(current_date - ${days - 1}::int, current_date, '1 day') as d(day)
      left join (
        select (created_at at time zone 'UTC')::date as day, sum(value_base) as revenue,
               count(*) as conversions
        from conversions
        where workspace_id = ${workspaceId} and status = 'approved' and created_at >= ${since}
        group by 1
      ) v on v.day = d.day
      order by d.day`),
    db.execute<{ revenue: number; conversions: number; clicks: number; sent: number }>(sql`
      select
        (select coalesce(sum(value_base), 0) from conversions where workspace_id = ${workspaceId}
           and status = 'approved' and created_at >= ${since})::float8 as revenue,
        (select count(*) from conversions where workspace_id = ${workspaceId}
           and status = 'approved' and created_at >= ${since})::int as conversions,
        (select count(distinct message_id) from clicks where workspace_id = ${workspaceId}
           and not is_bot and created_at >= ${since})::int as clicks,
        (select count(*) from messages where workspace_id = ${workspaceId}
           and status = 'sent' and sent_at >= ${since})::int as sent`),
    db.execute<DashboardCampaign>(sql`
      select c.id, c.name, v.conversions::int, v.revenue::float8,
             (select count(*) from messages m where m.campaign_id = c.id and m.status = 'sent')::int as sent
      from (
        select campaign_id, count(*) as conversions, sum(value_base) as revenue from conversions
        where workspace_id = ${workspaceId} and status = 'approved' and created_at >= ${since}
          and campaign_id is not null
        group by campaign_id order by sum(value_base) desc nulls last limit 5
      ) v join campaigns c on c.id = v.campaign_id
      order by v.revenue desc nulls last`),
    db.execute<DashboardOffer & { network_id: string | null }>(sql`
      with sold as (
        select split_part(l.url, '?', 1) as url, max(l.network_id) as network_id,
               count(*)::int as conversions, sum(v.value_base)::float8 as revenue
        from conversions v
        join clicks k on k.id = v.click_row_id
        join links l on l.id = k.link_id
        where v.workspace_id = ${workspaceId} and v.status = 'approved' and v.created_at >= ${since}
        group by 1 order by sum(v.value_base) desc nulls last limit 5
      )
      select s.url, s.network_id, s.conversions, coalesce(s.revenue, 0)::float8 as revenue,
             (select count(distinct l.campaign_id) from links l
                where l.workspace_id = ${workspaceId} and split_part(l.url, '?', 1) = s.url)::int
               as campaigns,
             (select count(distinct k.message_id) from clicks k join links l on l.id = k.link_id
                where k.workspace_id = ${workspaceId} and not k.is_bot and k.created_at >= ${since}
                  and split_part(l.url, '?', 1) = s.url)::int as clicks
      from sold s order by s.revenue desc`),
  ]);
  const t = totals!;
  return {
    days,
    series,
    totals: { ...t, epc: t.clicks > 0 ? t.revenue / t.clicks : 0 },
    campaigns,
    offers: offers.map(({ network_id, ...o }) => ({ ...o, networkId: network_id })),
  };
}
