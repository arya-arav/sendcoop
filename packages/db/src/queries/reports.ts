import { sql } from "drizzle-orm";
import { getDb } from "../client";

// A campaign's numbers. Machines are left out of opens and clicks (and
// shown separately): Apple Mail Privacy Protection opens, scanners' clicks.
// Rates are per delivered email.

export type CampaignReport = {
  recipients: number;
  sent: number;
  failed: number;
  skipped: number;
  delivered: number;
  hardBounces: number;
  softBounces: number;
  complaints: number;
  unsubscribes: number;
  /** People who opened (first open by a person). */
  uniqueOpens: number;
  /** Every open by a person, re-opens included. */
  opens: number;
  /** Opens by Apple's proxy and scanners: not counted above. */
  machineOpens: number;
  /** People who clicked at least once. */
  uniqueClicks: number;
  /** Every click by a person. */
  clicks: number;
  /** Clicks by scanners and other machines: not counted above. */
  botClicks: number;
  revenue: number;
  openRate: number;
  clickRate: number;
  /** Of the people who opened, the share who clicked. */
  clickToOpenRate: number;
};

export type LinkReport = {
  id: string;
  variant: "a" | "b";
  position: number;
  url: string;
  label: string | null;
  isAffiliate: boolean;
  networkId: string | null;
  clicks: number;
  uniqueClicks: number;
  botClicks: number;
};

const rate = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

export async function campaignReport(workspaceId: string, campaignId: string) {
  const db = getDb();
  const [[m], [o], [c], links] = await Promise.all([
    db.execute<Record<string, number>>(sql`
      select
        count(*) filter (where status = 'sent')::int as sent,
        count(*) filter (where status = 'failed')::int as failed,
        count(*) filter (where status = 'skipped')::int as skipped,
        count(*) filter (where status = 'sent' and bounced_at is null)::int as delivered,
        count(*) filter (where bounce_type = 'hard')::int as hard_bounces,
        count(*) filter (where bounce_type = 'soft')::int as soft_bounces,
        count(*) filter (where complained_at is not null)::int as complaints,
        count(*) filter (where unsubscribed_at is not null)::int as unsubscribes,
        count(*) filter (where opened_at is not null)::int as unique_opens,
        count(*) filter (where clicked_at is not null)::int as unique_clicks,
        coalesce(sum(revenue), 0)::float8 as revenue
      from messages where workspace_id = ${workspaceId} and campaign_id = ${campaignId}`),
    db.execute<Record<string, number>>(sql`
      select count(*) filter (where not is_machine)::int as opens,
             count(*) filter (where is_machine)::int as machine_opens
      from opens where workspace_id = ${workspaceId} and campaign_id = ${campaignId}`),
    db.execute<Record<string, number>>(sql`
      select count(*) filter (where not is_bot)::int as clicks,
             count(*) filter (where is_bot)::int as bot_clicks
      from clicks where workspace_id = ${workspaceId} and campaign_id = ${campaignId}`),
    db.execute<{
      id: string;
      variant: "a" | "b";
      position: number;
      url: string;
      label: string | null;
      is_affiliate: boolean;
      network_id: string | null;
      clicks: number;
      unique_clicks: number;
      bot_clicks: number;
    }>(sql`
      select l.id, l.variant, l.position, l.url, l.label, l.is_affiliate, l.network_id,
             count(c.id) filter (where not c.is_bot)::int as clicks,
             count(distinct c.message_id) filter (where not c.is_bot)::int as unique_clicks,
             count(c.id) filter (where c.is_bot)::int as bot_clicks
      from links l left join clicks c on c.link_id = l.id
      where l.workspace_id = ${workspaceId} and l.campaign_id = ${campaignId}
      group by l.id
      order by l.variant, l.position`),
  ]);
  const [campaign] = await db.execute<{ recipient_count: number }>(sql`
    select recipient_count from campaigns where workspace_id = ${workspaceId} and id = ${campaignId}`);
  if (!campaign) return null;

  const delivered = m!.delivered!;
  const uniqueOpens = m!.unique_opens!;
  const uniqueClicks = m!.unique_clicks!;
  const report: CampaignReport = {
    recipients: campaign.recipient_count,
    sent: m!.sent!,
    failed: m!.failed!,
    skipped: m!.skipped!,
    delivered,
    hardBounces: m!.hard_bounces!,
    softBounces: m!.soft_bounces!,
    complaints: m!.complaints!,
    unsubscribes: m!.unsubscribes!,
    uniqueOpens,
    opens: o!.opens!,
    machineOpens: o!.machine_opens!,
    uniqueClicks,
    clicks: c!.clicks!,
    botClicks: c!.bot_clicks!,
    revenue: Number(m!.revenue),
    openRate: rate(uniqueOpens, delivered),
    clickRate: rate(uniqueClicks, delivered),
    clickToOpenRate: rate(uniqueClicks, uniqueOpens),
  };
  const linkReports: LinkReport[] = links.map((l) => ({
    id: l.id,
    variant: l.variant,
    position: l.position,
    url: l.url,
    label: l.label,
    isAffiliate: l.is_affiliate,
    networkId: l.network_id,
    clicks: l.clicks,
    uniqueClicks: l.unique_clicks,
    botClicks: l.bot_clicks,
  }));
  return { report, links: linkReports };
}
