import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AutomationTrigger } from "../automations";
import { starterGraph } from "../automations";
import { getSql } from "../client";
import { startAutomationRun } from "./automation-engine";
import { processAutomationEvents, startClickedNoConversionRuns } from "./automation-triggers";

// Conversion triggers (D65). JSON goes in as ::text::jsonb (see
// automation-triggers.int.test.ts).

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let campaignId: string;
const automation: Record<string, string> = {};

async function subscriber(email: string) {
  const [s] = await sql<{ id: string }[]>`
    insert into subscribers (workspace_id, email, status) values (${ws}, ${email}, 'subscribed') returning id`;
  return s!.id;
}
async function conversion(
  subscriberId: string,
  value: number,
  fields: { leadStage?: string; status?: string } = {},
) {
  const [c] = await sql<{ id: string }[]>`
    insert into conversions (workspace_id, subscriber_id, campaign_id, source, event, value, status,
                             lead_stage, external_txid, fx_rate)
    values (${ws}, ${subscriberId}, ${campaignId}, 'api', ${fields.leadStage ? "lead" : "sale"}::conversion_event,
            ${value}, ${fields.status ?? "approved"}::conversion_status,
            ${fields.leadStage ?? null}::lead_stage, ${`t-${Math.random()}`}, 1)
    returning id`;
  return c!.id;
}
const runs = (key: string) =>
  sql<{ subscriber_id: string; status: string; exit_reason: string | null }[]>`
    select subscriber_id, status, exit_reason from automation_runs where automation_id = ${automation[key]!}
    order by started_at`;

beforeAll(async () => {
  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Conv triggers', ${`int-ctrig-${run}`}) returning id`;
  ws = w!.id;
  const [c] = await sql<{ id: string }[]>`
    insert into campaigns (workspace_id, name, subject, from_name, from_local, html, text, status)
    values (${ws}, 'Launch', 'Hi', 'Acme', 'news', 'x', 'x', 'sent') returning id`;
  campaignId = c!.id;
  const setups: [string, AutomationTrigger, boolean][] = [
    ["sales", { type: "api_event", event: "never" }, true],
    ["bought", { type: "converted", minValue: 50 }, false],
    ["sold", { type: "lead_status", stage: "sold" }, false],
    ["nudge", { type: "clicked_no_conversion", campaignId: null, hours: 48 }, true],
  ];
  for (const [key, trigger, exit] of setups) {
    const [a] = await sql<{ id: string }[]>`
      insert into automations (workspace_id, name, status, trigger, graph, exit_on_conversion)
      values (${ws}, ${key}, 'active', ${JSON.stringify(trigger)}::text::jsonb,
              ${JSON.stringify(starterGraph())}::text::jsonb, ${exit})
      returning id`;
    automation[key] = a!.id;
  }
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
});

describe("conversion triggers", () => {
  it("a purchase stops the sales sequence", async () => {
    const buyer = await subscriber("buyer@example.com");
    expect(await startAutomationRun(ws, automation.sales!, buyer)).toBeTruthy();
    await sql`update automation_runs set status = 'waiting', wait_until = now() + interval '1 day'
              where automation_id = ${automation.sales!}`;
    await conversion(buyer, 30);
    await processAutomationEvents();
    expect(await runs("sales")).toEqual([
      { subscriber_id: buyer, status: "exited", exit_reason: "converted" },
    ]);
  });

  it("buying starts an automation, from its minimum value", async () => {
    const big = await subscriber("big@example.com");
    const small = await subscriber("small@example.com");
    await conversion(big, 80);
    await conversion(small, 20);
    await conversion(small, 60, { status: "pending" });
    await processAutomationEvents();
    expect((await runs("bought")).map((r) => r.subscriber_id)).toEqual([big]);
  });

  it("a lead reaching a stage starts an automation", async () => {
    const lead = await subscriber("lead@example.com");
    const id = await conversion(lead, 0, { leadStage: "new", status: "pending" });
    await processAutomationEvents();
    expect(await runs("sold")).toEqual([]);
    await sql`update conversions set lead_stage = 'sold', status = 'approved', value = 900 where id = ${id}`;
    await processAutomationEvents();
    expect((await runs("sold")).map((r) => r.subscriber_id)).toEqual([lead]);
  });

  it("clicked but didn't buy within 48 hours: once per click, not for buyers", async () => {
    const browser = await subscriber("browser@example.com");
    const shopper = await subscriber("shopper@example.com");
    for (const s of [browser, shopper]) {
      await sql`
        insert into messages (workspace_id, campaign_id, subscriber_id, email, status, sent_at, clicked_at)
        values (${ws}, ${campaignId}, ${s}, 'x@example.com', 'sent', now() - interval '3 days',
                now() - interval '50 hours')`;
    }
    await sql`
      insert into conversions (workspace_id, subscriber_id, source, value, status, external_txid, fx_rate, created_at)
      values (${ws}, ${shopper}, 'api', 10, 'approved', 'shop-1', 1, now() - interval '40 hours')`;
    expect(await startClickedNoConversionRuns()).toHaveLength(1);
    expect((await runs("nudge")).map((r) => r.subscriber_id)).toEqual([browser]);
    expect(await startClickedNoConversionRuns()).toHaveLength(0);
  });
});
