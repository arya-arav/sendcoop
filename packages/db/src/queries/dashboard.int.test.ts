import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "../client";
import { dashboardSummary } from "./dashboard";

// The dashboard's numbers agree with the conversions table.

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;

beforeAll(async () => {
  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Dash', ${`int-dash-${run}`}) returning id`;
  ws = w!.id;
  const [c] = await sql<{ id: string }[]>`
    insert into campaigns (workspace_id, name, subject, from_name, from_local, html, text, status)
    values (${ws}, 'Boots', 'Hi', 'Acme', 'news', 'x', 'x', 'sent') returning id`;
  const [m] = await sql<{ id: string }[]>`
    insert into messages (workspace_id, campaign_id, email, status, sent_at)
    values (${ws}, ${c!.id}, 'd@example.com', 'sent', now() - interval '3 days') returning id`;
  const [l] = await sql<{ id: string }[]>`
    insert into links (workspace_id, campaign_id, variant, position, url, is_affiliate, network_id)
    values (${ws}, ${c!.id}, 'a', 0, 'https://vendor.hop.clickbank.net/?tid=x', true, 'clickbank')
    returning id`;
  const [k] = await sql<{ id: string }[]>`
    insert into clicks (click_id, workspace_id, campaign_id, message_id, link_id, created_at)
    values (${`sc${run}dash000000`.slice(0, 18)}, ${ws}, ${c!.id}, ${m!.id}, ${l!.id},
            now() - interval '3 days') returning id`;
  await sql`
    insert into conversions (workspace_id, campaign_id, message_id, click_row_id, source, event,
                             value, status, external_txid, created_at, fx_rate)
    values (${ws}, ${c!.id}, ${m!.id}, ${k!.id}, 'postback', 'sale', 70, 'approved', 'd1',
            now() - interval '2 days', 1),
           (${ws}, ${c!.id}, ${m!.id}, ${k!.id}, 'postback', 'sale', 30, 'approved', 'd2', now(), 1),
           (${ws}, ${c!.id}, ${m!.id}, ${k!.id}, 'postback', 'sale', 500, 'reversed', 'd3', now(), 1),
           (${ws}, null, null, null, 'api', 'sale', 15, 'approved', 'd4', now(), 1),
           (${ws}, ${c!.id}, ${m!.id}, ${k!.id}, 'postback', 'sale', 999, 'approved', 'old',
            now() - interval '40 days', 1)`;
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
});

describe("dashboardSummary", () => {
  it("has one point per day, adding up to the total", async () => {
    const d = await dashboardSummary(ws, 30);
    expect(d.series).toHaveLength(30);
    expect(d.series.reduce((s, p) => s + p.revenue, 0)).toBe(d.totals.revenue);
    expect(d.totals).toMatchObject({ revenue: 115, conversions: 3, clicks: 1, sent: 1, epc: 115 });
    expect(d.series.at(-1)).toMatchObject({ revenue: 45, conversions: 2 });
  });

  it("ranks campaigns and offers by revenue", async () => {
    const d = await dashboardSummary(ws, 30);
    expect(d.campaigns).toEqual([
      expect.objectContaining({ name: "Boots", revenue: 100, conversions: 2, sent: 1 }),
    ]);
    expect(d.offers).toEqual([
      {
        url: "https://vendor.hop.clickbank.net/",
        networkId: "clickbank",
        campaigns: 1,
        clicks: 1,
        conversions: 2,
        revenue: 100,
      },
    ]);
  });
});
