import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "../client";
import {
  type AbTestSettings,
  type Campaign,
  type CampaignVariant,
  campaigns,
  campaignVariants,
  messages,
} from "../schema";

// A/B tests: a share of the recipients gets variant A (the campaign) or B
// (campaign_variants), split evenly at random. The rest are held until the
// test ends, then get whichever variant won on clicks or revenue.

export type VariantB = Pick<
  CampaignVariant,
  "subject" | "preheader" | "editor" | "design" | "mjml" | "html" | "text"
>;

export async function getVariantB(campaignId: string) {
  const [row] = await getDb()
    .select()
    .from(campaignVariants)
    .where(eq(campaignVariants.campaignId, campaignId));
  return row ?? null;
}

/**
 * Turns a draft's A/B test on (with variant B's content) or off (null).
 * False if the campaign isn't a draft in this workspace.
 */
export async function setAbTest(
  workspaceId: string,
  campaignId: string,
  test: { settings: AbTestSettings; variant: VariantB } | null,
) {
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .update(campaigns)
      .set({ abTest: test?.settings ?? null })
      .where(
        and(
          eq(campaigns.id, campaignId),
          eq(campaigns.workspaceId, workspaceId),
          eq(campaigns.status, "draft"),
        ),
      )
      .returning({ id: campaigns.id });
    if (rows.length === 0) return false;
    if (!test) {
      await tx.delete(campaignVariants).where(eq(campaignVariants.campaignId, campaignId));
      return true;
    }
    await tx
      .insert(campaignVariants)
      .values({ campaignId, ...test.variant })
      .onConflictDoUpdate({ target: campaignVariants.campaignId, set: test.variant });
    return true;
  });
}

/**
 * After a test campaign's messages are created: picks the test recipients at
 * random, half A and half B, and holds everyone else. Sets when to decide.
 */
export async function assignAbVariants(campaign: Campaign) {
  const test = campaign.abTest;
  if (!test) return;
  const db = getDb();
  await db.execute(sql`
    with ranked as (
      select id,
             row_number() over (order by random()) as n,
             -- At least one recipient per variant.
             greatest(1, ceil(count(*) over () * ${test.testPercent} / 200.0)) as per_variant
      from ${messages}
      where campaign_id = ${campaign.id} and status = 'queued'
    )
    update ${messages} m set
      variant = case when r.n <= r.per_variant then 'a'
                     when r.n <= 2 * r.per_variant then 'b' end,
      status = (case when r.n <= 2 * r.per_variant then 'queued' else 'held' end)::message_status
    from ranked r
    where m.id = r.id`);
  await db
    .update(campaigns)
    .set({ abDecideAt: sql`now() + make_interval(mins => ${test.waitMinutes}::int)` })
    .where(eq(campaigns.id, campaign.id));
}

export type VariantResult = { sent: number; clicks: number; revenue: number };

/** How each variant is doing: emails sent, people who clicked, revenue. */
export async function abResults(campaignId: string) {
  const rows = await getDb().execute<VariantResult & { variant: "a" | "b" }>(sql`
    select variant,
           count(*) filter (where status = 'sent')::int as sent,
           count(*) filter (where clicked_at is not null)::int as clicks,
           coalesce(sum(revenue), 0)::float8 as revenue
    from ${messages}
    where campaign_id = ${campaignId} and variant is not null and status <> 'held'
    group by variant`);
  const empty = { sent: 0, clicks: 0, revenue: 0 };
  const a = rows.find((r) => r.variant === "a");
  const b = rows.find((r) => r.variant === "b");
  return {
    a: a ? { sent: a.sent, clicks: a.clicks, revenue: Number(a.revenue) } : empty,
    b: b ? { sent: b.sent, clicks: b.clicks, revenue: Number(b.revenue) } : empty,
  };
}

/** The winner on the test's metric; per email sent, so uneven splits are fair. Ties keep A. */
export function pickWinner(
  metric: AbTestSettings["metric"],
  results: { a: VariantResult; b: VariantResult },
): "a" | "b" {
  const score = (r: VariantResult) =>
    r.sent === 0 ? 0 : (metric === "revenue" ? r.revenue : r.clicks) / r.sent;
  return score(results.b) > score(results.a) ? "b" : "a";
}

/**
 * Ends tests whose time has come: picks each winner and releases the held
 * recipients with it. Returns the campaigns whose remainder needs queueing.
 * Only sending campaigns are decided (a paused one waits until resumed).
 */
export async function decideDueAbTests() {
  const db = getDb();
  const due = await db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.status, "sending"),
        isNull(campaigns.abWinner),
        lte(campaigns.abDecideAt, sql`now()`),
      ),
    );
  const decided: {
    campaignId: string;
    workspaceId: string;
    winner: "a" | "b";
    /** Just the released messages, in batches: test batches may still be queued. */
    batches: { sendAfter: Date | null; messageIds: string[] }[];
  }[] = [];
  for (const campaign of due) {
    if (!campaign.abTest) continue;
    const winner = pickWinner(campaign.abTest.metric, await abResults(campaign.id));
    const released = await db.transaction(async (tx) => {
      // Only one process gets to decide.
      const won = await tx
        .update(campaigns)
        .set({ abWinner: winner })
        .where(and(eq(campaigns.id, campaign.id), isNull(campaigns.abWinner)))
        .returning({ id: campaigns.id });
      if (won.length === 0) return null;
      return tx
        .update(messages)
        .set({ variant: winner, status: "queued" })
        .where(and(eq(messages.campaignId, campaign.id), eq(messages.status, "held")))
        .returning({ id: messages.id, sendAfter: messages.sendAfter });
    });
    if (released) {
      decided.push({
        campaignId: campaign.id,
        workspaceId: campaign.workspaceId,
        winner,
        batches: batchByTime(released),
      });
    }
  }
  return decided;
}

/** Groups messages into batches of up to `size` that share a send time. */
export function batchByTime(rows: { id: string; sendAfter: Date | null }[], size = 100) {
  const sorted = [...rows].sort(
    (x, y) =>
      (x.sendAfter?.getTime() ?? 0) - (y.sendAfter?.getTime() ?? 0) || x.id.localeCompare(y.id),
  );
  const batches: { sendAfter: Date | null; messageIds: string[] }[] = [];
  for (const row of sorted) {
    const last = batches.at(-1);
    const sameTime = last && last.sendAfter?.getTime() === row.sendAfter?.getTime();
    if (last && sameTime && last.messageIds.length < size) last.messageIds.push(row.id);
    else batches.push({ sendAfter: row.sendAfter, messageIds: [row.id] });
  }
  return batches;
}
