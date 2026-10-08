import { getSql, saveUtmcapConnection, storeUtmcapEvent } from "@sendcoop/db";
import { UtmcapClient } from "@sendcoop/utmcap";
import { type FakeUtmcap, startFakeUtmcap } from "@sendcoop/utmcap/fake";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyUtmcapEvent } from "./utmcap-events";

// A webhook for a click no postback told us about: the worker asks UTMCAP's
// click log which Sendcoop click it was, credits the email, and later
// applies the chargeback.

const sql = getSql();
const run = Date.now().toString(36);
let fake: FakeUtmcap;
let ws: string;
let messageId: string;
const clickId = `sc${run.padEnd(16, "w").slice(0, 16)}`;
let ucid: string;
let sourceId: string;

beforeAll(async () => {
  fake = await startFakeUtmcap();
  process.env.UTMCAP_API_URL = fake.apiUrl;
  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('UTMCAP events', ${`int-utmcap-ev-${run}`}) returning id`;
  ws = w!.id;
  await saveUtmcapConnection(ws, {
    apiKey: fake.apiKey,
    sourceId: "pending",
    sourceName: "Sendcoop",
    webhookId: "wh",
    webhookSecret: "whsec_test",
  });
  const [c] = await sql<{ id: string }[]>`
    insert into campaigns (workspace_id, name, subject, from_name, from_local, html, text, status)
    values (${ws}, 'Webinar', 'Hi', 'Acme', 'news', 'x', 'x', 'sent') returning id`;
  const [m] = await sql<{ id: string }[]>`
    insert into messages (workspace_id, campaign_id, email, status, sent_at)
    values (${ws}, ${c!.id}, 'w@example.com', 'sent', now()) returning id`;
  messageId = m!.id;
  await sql`insert into clicks (click_id, workspace_id, campaign_id, message_id)
            values (${clickId}, ${ws}, ${c!.id}, ${messageId})`;

  // The click as UTMCAP logged it: our sc_cid as the Sendcoop source's external id
  const source = await new UtmcapClient({
    apiKey: fake.apiKey,
    baseUrl: fake.apiUrl,
  }).createTrafficSource({ name: "Sendcoop", external_id_param: "sc_cid" });
  await saveUtmcapConnection(ws, {
    apiKey: fake.apiKey,
    sourceId: source.id,
    sourceName: "Sendcoop",
    webhookId: "wh",
    webhookSecret: "whsec_test",
  });
  sourceId = source.id;
  const offer = fake.addCampaign("Webinar offer");
  await fetch(`${offer.url}?sc_cid=${clickId}&sub1=webinar`, { redirect: "manual" });
  ucid = fake.clicks.at(-1)!.click_id;
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
  await sql.end();
  await fake.close();
});

const event = async (id: string, status: string, payout = 99) => {
  await storeUtmcapEvent(ws, {
    id,
    type: "conversion.updated",
    payload: {
      id,
      type: "conversion.updated",
      data: {
        click_id: ucid,
        conversion_id: "WEB-1",
        source_id: sourceId,
        status,
        payout,
        currency: "USD",
        recorded_at: new Date().toISOString().replace("T", " ").slice(0, 23),
      },
    },
  });
  return applyUtmcapEvent({ workspaceId: ws, eventId: id });
};
const revenue = async () => {
  const [m] = await sql<{ revenue: number }[]>`
    select revenue::float8 as revenue from messages where id = ${messageId}`;
  return m!.revenue;
};

describe("applyUtmcapEvent", () => {
  it("leaves conversions from other traffic sources alone", async () => {
    await storeUtmcapEvent(ws, {
      id: "evt-other",
      type: "conversion.created",
      payload: {
        data: {
          click_id: ucid,
          conversion_id: "X",
          status: "approved",
          payout: 5,
          source_id: "someone-else",
        },
      },
    });
    expect(await applyUtmcapEvent({ workspaceId: ws, eventId: "evt-other" })).toEqual({
      result: "skipped",
    });
    expect(await revenue()).toBe(0);
  });

  it("finds the Sendcoop click through UTMCAP's click log and credits the email", async () => {
    expect(await event("evt-1", "approved")).toMatchObject({ result: "created" });
    expect(await revenue()).toBe(99);
    expect(fake.requests.some((r) => r.path === `/logs/clicks/${ucid}`)).toBe(true);
  });

  it("applies a chargeback, and a replayed event changes nothing", async () => {
    const lookups = fake.requests.length;
    expect(await event("evt-2", "chargeback")).toMatchObject({ result: "updated" });
    expect(await revenue()).toBe(0);
    // The click is remembered now: no second lookup
    expect(fake.requests.length).toBe(lookups);
    expect(await applyUtmcapEvent({ workspaceId: ws, eventId: "evt-2" })).toEqual({
      result: "skipped",
    });
  });
});
