import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "../client";
import { listRecentConversions, recordConversion } from "./conversions";

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let other: string;
let campaign: string;

const base = {
  clickId: null,
  value: 10,
  currency: "USD",
  status: "approved" as const,
  event: "sale" as const,
  network: null,
};

beforeAll(async () => {
  const rows = await sql<{ id: string }[]>`
    insert into workspaces (name, slug)
    values ('Recent', ${`int-recent-${run}`}), ('Other', ${`int-recent-other-${run}`})
    returning id`;
  [ws, other] = rows.map((r) => r.id) as [string, string];
  const [c] = await sql<{ id: string }[]>`
    insert into campaigns (workspace_id, name, subject, from_name, from_local, html, text, status)
    values (${ws}, 'Spring sale', 'Hi', 'Acme', 'news', 'x', 'x', 'sent') returning id`;
  campaign = c!.id;
});

afterAll(async () => {
  await sql`delete from workspaces where id in (${ws}, ${other})`;
});

describe("listRecentConversions", () => {
  it("lists the workspace's latest conversions, newest first, with what they're credited to", async () => {
    await recordConversion(ws, { ...base, source: "pixel", txid: "first", payload: {} });
    const { id } = await recordConversion(ws, {
      ...base,
      source: "postback",
      network: "test",
      value: 1,
      txid: "second",
      payload: { test: "1" },
    });
    await sql`update conversions set campaign_id = ${campaign} where id = ${id}`;
    await recordConversion(other, { ...base, source: "api", txid: "elsewhere", payload: {} });

    const rows = await listRecentConversions(ws);
    expect(rows).toEqual([
      expect.objectContaining({
        txid: "second",
        source: "postback",
        network: "test",
        value: 1,
        test: true,
        campaignId: campaign,
        campaignName: "Spring sale",
      }),
      expect.objectContaining({ txid: "first", source: "pixel", test: false, campaignId: null }),
    ]);
    expect(typeof rows[0]!.at).toBe("number");
    expect(Date.now() - rows[0]!.at).toBeLessThan(60_000);
    expect(await listRecentConversions(ws, 1)).toHaveLength(1);
  });
});
