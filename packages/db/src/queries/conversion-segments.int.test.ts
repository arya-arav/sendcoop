import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "../client";
import type { SegmentRules } from "../segments";
import { previewSegment } from "./segments";

// Conversion segments (D53) against a small, known cast:
//   ann:  got Spring, clicked, bought $150 two days ago
//   ben:  got Spring, clicked, didn't buy
//   cat:  got Spring, didn't open
//   dan:  got Summer, opened, bought $30 sixty days ago (and a refunded $500)
//   eve:  never emailed

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let spring: string;
let summer: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Conv segments', ${`int-convseg-${run}`}) returning id`;
  ws = w!.id;
  for (const name of ["ann", "ben", "cat", "dan", "eve"]) {
    const [s] = await sql<{ id: string }[]>`
      insert into subscribers (workspace_id, email, status)
      values (${ws}, ${`${name}@example.com`}, 'subscribed') returning id`;
    ids[name] = s!.id;
  }
  const campaign = async (name: string) => {
    const [c] = await sql<{ id: string }[]>`
      insert into campaigns (workspace_id, name, subject, from_name, from_local, html, text, status)
      values (${ws}, ${name}, 'Hi', 'Acme', 'news', 'x', 'x', 'sent') returning id`;
    return c!.id;
  };
  spring = await campaign("Spring");
  summer = await campaign("Summer");
  const message = async (
    who: string,
    campaignId: string,
    opts: { opened?: string; clicked?: string } = {},
  ) => {
    const [m] = await sql<{ id: string }[]>`
      insert into messages (workspace_id, campaign_id, subscriber_id, email, status, sent_at,
                            opened_at, clicked_at)
      values (${ws}, ${campaignId}, ${ids[who]!}, ${`${who}@example.com`}, 'sent',
              now() - interval '70 days',
              ${opts.opened ? sql`now() - ${opts.opened}::interval` : null},
              ${opts.clicked ? sql`now() - ${opts.clicked}::interval` : null})
      returning id`;
    return m!.id;
  };
  await message("ann", spring, { opened: "3 days", clicked: "3 days" });
  await message("ben", spring, { opened: "3 days", clicked: "3 days" });
  await message("cat", spring);
  await message("dan", summer, { opened: "65 days" });
  const sale = async (
    who: string,
    campaignId: string,
    value: number,
    ago: string,
    status = "approved",
  ) => {
    await sql`
      insert into conversions (workspace_id, campaign_id, subscriber_id, source, event, value,
                               status, external_txid, created_at, fx_rate)
      values (${ws}, ${campaignId}, ${ids[who]!}, 'pixel', 'sale', ${value},
              ${status}::conversion_status, ${`${who}-${value}`}, now() - ${ago}::interval, 1)`;
  };
  await sale("ann", spring, 150, "2 days");
  await sale("dan", summer, 30, "60 days");
  await sale("dan", summer, 500, "59 days", "reversed");
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
});

const who = async (rules: SegmentRules) => {
  const { count, sample } = await previewSegment(ws, rules, { sampleSize: 10 });
  const names = sample.map((s) => s.email.split("@")[0]).sort();
  expect(names).toHaveLength(count);
  return names;
};
const all = (...conditions: SegmentRules["conditions"]): SegmentRules => ({
  match: "all",
  conditions,
});

describe("conversion segments", () => {
  it('"clicked Spring, didn\'t buy"', async () => {
    expect(
      await who(
        all(
          { type: "activity", op: "did", event: "clicked", campaignId: spring, withinDays: null },
          {
            type: "activity",
            op: "did_not",
            event: "converted",
            campaignId: null,
            withinDays: null,
          },
        ),
      ),
    ).toEqual(["ben"]);
  });

  it('"lifetime value > 100": refunds don\'t count', async () => {
    expect(
      await who(all({ type: "field", field: "lifetime_value", op: "gt", value: "100" })),
    ).toEqual(["ann"]);
    expect(
      await who(all({ type: "field", field: "lifetime_value", op: "gte", value: "30" })),
    ).toEqual(["ann", "dan"]);
  });

  it('"buyer in the last 30 days", two ways', async () => {
    expect(
      await who(
        all({ type: "activity", op: "did", event: "converted", campaignId: null, withinDays: 30 }),
      ),
    ).toEqual(["ann"]);
    expect(
      await who(
        all({ type: "field", field: "last_conversion_at", op: "in_last_days", value: "30" }),
      ),
    ).toEqual(["ann"]);
  });

  it("never bought, received but never opened, purchase counts", async () => {
    expect(
      await who(all({ type: "field", field: "last_conversion_at", op: "is_not_set" })),
    ).toEqual(["ben", "cat", "eve"]);
    expect(
      await who(
        all(
          { type: "activity", op: "did", event: "received", campaignId: null, withinDays: null },
          { type: "activity", op: "did_not", event: "opened", campaignId: null, withinDays: null },
        ),
      ),
    ).toEqual(["cat"]);
    expect(
      await who(all({ type: "field", field: "conversion_count", op: "eq", value: "0" })),
    ).toEqual(["ben", "cat", "eve"]);
  });

  it("opened within days", async () => {
    expect(
      await who(
        all({ type: "activity", op: "did", event: "opened", campaignId: null, withinDays: 7 }),
      ),
    ).toEqual(["ann", "ben"]);
  });
});
