import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../client";
import { campaigns } from "../schema";

// Sending health: bounce and complaint rates, and the automatic pause that
// protects a workspace's reputation when a campaign goes wrong. The limits
// follow what mailbox providers and Amazon SES enforce: SES reviews accounts
// at 5% bounces or 0.1% complaints, and Gmail wants spam reports under 0.3%.

export const HEALTH_LIMITS = {
  /** Rates count once this many emails went out, so one early bounce can't stop a campaign. */
  minSent: 100,
  bounce: { warn: 0.02, pause: 0.05 },
  complaint: { warn: 0.001, pause: 0.003 },
} as const;

export type HealthCounts = {
  sent: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
};

export function healthRates(c: HealthCounts) {
  const of = (n: number) => (c.sent > 0 ? n / c.sent : 0);
  return {
    bounceRate: of(c.bounced),
    complaintRate: of(c.complained),
    unsubscribeRate: of(c.unsubscribed),
  };
}

export type HealthLevel = "good" | "warning" | "danger";

export function healthLevel(rate: number, limits: { warn: number; pause: number }): HealthLevel {
  return rate >= limits.pause ? "danger" : rate >= limits.warn ? "warning" : "good";
}

const percent = (rate: number) =>
  `${(rate * 100).toLocaleString("en", { maximumFractionDigits: 2 })}%`;

// Only hard bounces count: soft ones (full mailbox, greylisting) aren't the sender's fault.
const countsSql = sql`
  count(*) filter (where m.status = 'sent')::int as sent,
  count(*) filter (where m.bounce_type = 'hard')::int as bounced,
  count(*) filter (where m.complained_at is not null)::int as complained,
  count(*) filter (where m.unsubscribed_at is not null)::int as unsubscribed`;

export async function campaignHealthCounts(campaignId: string): Promise<HealthCounts> {
  const [row] = await getDb().execute<HealthCounts>(
    sql`select ${countsSql} from messages m where m.campaign_id = ${campaignId}`,
  );
  return row ?? { sent: 0, bounced: 0, complained: 0, unsubscribed: 0 };
}

/**
 * Pauses a sending campaign whose bounce or complaint rate has crossed the
 * limit. Returns the reason when it paused it, otherwise null.
 */
export async function enforceCampaignHealth(campaignId: string): Promise<string | null> {
  const counts = await campaignHealthCounts(campaignId);
  if (counts.sent < HEALTH_LIMITS.minSent) return null;
  const { bounceRate, complaintRate } = healthRates(counts);
  let reason: string | null = null;
  if (complaintRate >= HEALTH_LIMITS.complaint.pause) {
    reason = `Paused automatically: ${percent(complaintRate)} of recipients marked it as spam (the limit is ${percent(HEALTH_LIMITS.complaint.pause)}).`;
  } else if (bounceRate >= HEALTH_LIMITS.bounce.pause) {
    reason = `Paused automatically: ${percent(bounceRate)} of emails bounced (the limit is ${percent(HEALTH_LIMITS.bounce.pause)}). Clean the list before resuming.`;
  }
  if (!reason) return null;
  const paused = await getDb()
    .update(campaigns)
    .set({ status: "paused", error: reason })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "sending")))
    .returning({ id: campaigns.id });
  return paused.length > 0 ? reason : null;
}

/** Totals for emails a workspace sent in the last `days` days. */
export async function workspaceHealth(workspaceId: string, days = 30): Promise<HealthCounts> {
  const [row] = await getDb().execute<HealthCounts>(sql`
    select ${countsSql} from messages m
    where m.workspace_id = ${workspaceId}
      and m.sent_at >= now() - make_interval(days => ${days}::int)`);
  return row ?? { sent: 0, bounced: 0, complained: 0, unsubscribed: 0 };
}

export type CampaignHealth = HealthCounts & {
  id: string;
  name: string;
  status: string;
  error: string | null;
  /** ISO timestamp (raw query). */
  startedAt: string | null;
};

/** The most recent campaigns that sent anything, with their counts. */
export async function listCampaignHealth(workspaceId: string, limit = 20) {
  return getDb().execute<CampaignHealth>(sql`
    select c.id, c.name, c.status, c.error, c.started_at as "startedAt", ${countsSql}
    from ${campaigns} c
    left join messages m on m.campaign_id = c.id
    where c.workspace_id = ${workspaceId} and c.status <> 'draft'
    group by c.id
    order by c.created_at desc
    limit ${limit}`);
}
