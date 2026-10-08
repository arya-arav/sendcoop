import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "../client";
import { recordConversion } from "./conversions";
import { revenueReport, setCampaignCost } from "./revenue";

// Two campaigns, their sends, clicks (one by a scanner) and conversions,
// one unattributed sale and one refunded: the report must add up to what's
// in the conversions table.

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let listId: string;
const campaign: Record<string, string> = {};
const link: Record<string, string> = {};
const DAY = 86_400_000;
const NOW = new Date();
const ALL = { from: null, to: new Date(Date.now() + DAY) };

beforeAll(async () => {
  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Revenue', ${`int-rev-${run}`}) returning id`;
  ws = w!.id;
  const [l] = await sql<{ id: string }[]>`
    insert into lists (workspace_id, name) values (${ws}, 'Buyers') returning id`;
  listId = l!.id;
  for (const name of ["spring", "summer"]) {
    const [c] = await sql<{ id: string }[]>`
      insert into campaigns (workspace_id, name, subject, from_name, from_local, html, text,
                             status, started_at, audience)
      values (${ws}, ${name}, 'Hi', 'Acme', 'news', 'x', 'x', 'sent', now(),
              ${sql.json({ everyone: false, lists: [listId], segments: [], excludeLists: [], excludeSegments: [] })})
      returning id`;
    campaign[name] = c!.id;
    const [k] = await sql<{ id: string }[]>`
      insert into links (workspace_id, campaign_id, variant, position, url, is_affiliate)
      values (${ws}, ${c!.id}, 'a', 0, ${`https://shop.example/${name}`}, false) returning id`;
    link[name] = k!.id;
  }
  // spring: 4 sent, 2 people clicked (one twice) + a scanner; summer: 2 sent, 1 click
  const messages: Record<string, string[]> = { spring: [], summer: [] };
  for (const [name, count] of [
    ["spring", 4],
    ["summer", 2],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const [m] = await sql<{ id: string }[]>`
        insert into messages (workspace_id, campaign_id, email, status, sent_at)
        values (${ws}, ${campaign[name]!}, ${`${name}${i}@example.com`}, 'sent', now()) returning id`;
      messages[name]!.push(m!.id);
    }
  }
  const click = async (name: string, i: number, clickId: string, bot = false) => {
    await sql`insert into clicks (click_id, workspace_id, campaign_id, message_id, link_id, is_bot)
              values (${clickId}, ${ws}, ${campaign[name]!}, ${messages[name]![i]!}, ${link[name]!}, ${bot})`;
  };
  await click("spring", 0, `sc${run}a0000000`.slice(0, 18));
  await click("spring", 0, `sc${run}a1111111`.slice(0, 18));
  await click("spring", 1, `sc${run}b0000000`.slice(0, 18));
  await click("spring", 2, `sc${run}c0000000`.slice(0, 18), true);
  await click("summer", 0, `sc${run}d0000000`.slice(0, 18));

  const sale = (clickId: string | null, value: number, txid: string) =>
    recordConversion(ws, {
      source: "postback",
      clickId,
      value,
      currency: "USD",
      status: "approved",
      event: "sale",
      txid,
      network: null,
      payload: {},
    });
  await sale(`sc${run}a0000000`.slice(0, 18), 100, "s1");
  await sale(`sc${run}b0000000`.slice(0, 18), 50, "s2");
  await sale(`sc${run}d0000000`.slice(0, 18), 30, "s3");
  await sale(null, 20, "s4"); // nobody's email
  await sale(`sc${run}b0000000`.slice(0, 18), 999, "s5");
  await sql`update conversions set status = 'reversed' where workspace_id = ${ws} and external_txid = 's5'`;
  await setCampaignCost(ws, campaign.spring!, 60);
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
});

describe("revenueReport", () => {
  it("totals match the conversions table: approved only", async () => {
    const { totals } = await revenueReport(ws, "campaign", ALL);
    const [truth] = await sql<{ n: number; total: number }[]>`
      select count(*)::int as n, sum(value)::float8 as total from conversions
      where workspace_id = ${ws} and status = 'approved'`;
    expect(totals).toMatchObject({
      conversions: truth!.n,
      revenue: truth!.total,
      sent: 6,
      clicks: 3,
    });
    expect(totals.revenue).toBe(200);
  });

  it("by campaign: rows plus unattributed add up, with EPC, per 1k, conversion rate and ROI", async () => {
    const { totals, rows } = await revenueReport(ws, "campaign", ALL);
    const sum = (key: "revenue" | "conversions" | "sent" | "clicks") =>
      rows.reduce((s, r) => s + r[key], 0);
    expect([sum("revenue"), sum("conversions"), sum("sent"), sum("clicks")]).toEqual([
      totals.revenue,
      totals.conversions,
      totals.sent,
      totals.clicks,
    ]);
    const spring = rows.find((r) => r.id === campaign.spring)!;
    expect(spring).toMatchObject({
      name: "spring",
      sent: 4,
      clicks: 2,
      conversions: 2,
      revenue: 150,
      epc: 75,
      revenuePer1k: 37_500,
      conversionRate: 1,
      cost: 60,
      roi: 1.5,
    });
    expect(rows.find((r) => r.id === campaign.summer)).toMatchObject({ revenue: 30, roi: null });
    expect(rows.find((r) => r.id === null)).toMatchObject({ revenue: 20, conversions: 1 });
  });

  it("by link: the same totals, with email-credited sales on their own row", async () => {
    const { totals, rows } = await revenueReport(ws, "link", ALL);
    expect(rows.reduce((s, r) => s + r.revenue, 0)).toBe(totals.revenue);
    expect(rows.find((r) => r.id === link.spring)).toMatchObject({
      name: "https://shop.example/spring",
      campaignName: "spring",
      clicks: 2,
      revenue: 150,
    });
    expect(rows.find((r) => r.id === null)).toMatchObject({ revenue: 20 });
  });

  it("by audience: campaigns sent to a list", async () => {
    const { rows } = await revenueReport(ws, "audience", ALL);
    expect(rows).toEqual([
      expect.objectContaining({ kind: "list", id: listId, name: "Buyers", sent: 6, revenue: 180 }),
    ]);
  });

  it("only counts what happened in the period", async () => {
    const future = { from: new Date(NOW.getTime() + DAY), to: new Date(NOW.getTime() + 2 * DAY) };
    const { totals, rows } = await revenueReport(ws, "campaign", future);
    expect(totals).toMatchObject({ sent: 0, clicks: 0, conversions: 0, revenue: 0 });
    expect(rows).toEqual([]);
  });
});
