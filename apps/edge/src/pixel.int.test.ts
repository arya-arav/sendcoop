import { createCampaign, EMPTY_AUDIENCE, getIntegrationSecret, getSql } from "@sendcoop/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./app";

// The website pixel: sc.js itself, and the sales it reports to /px.

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let key: string;
let campaignId: string;
const clickId = `sc${run.padEnd(16, "p").slice(0, 16)}`;

beforeAll(async () => {
  const [row] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Pixel', ${`int-px-${run}`}) returning id`;
  ws = row!.id;
  key = await getIntegrationSecret(ws, "pixel");
  const campaign = await createCampaign(ws, {
    name: "Launch",
    subject: "Hi",
    fromName: "Acme",
    fromLocal: "news",
    replyTo: null,
    sendingDomainId: null,
    sendingServerId: null,
    audience: EMPTY_AUDIENCE,
    html: "x",
    text: "x",
  });
  campaignId = campaign.id;
  const [m] = await sql<{ id: string }[]>`
    insert into messages (workspace_id, campaign_id, email, status)
    values (${ws}, ${campaignId}, 'shopper@example.com', 'sent') returning id`;
  await sql`insert into clicks (click_id, workspace_id, campaign_id, message_id)
            values (${clickId}, ${ws}, ${campaignId}, ${m!.id})`;
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
  await sql.end();
});

// As sendBeacon sends it: JSON in a text/plain body.
const beacon = (body: unknown) =>
  app.request("/px", {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8", origin: "https://shop.example" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("sc.js", () => {
  it("is served as cacheable JavaScript that parses", async () => {
    const res = await app.request("/sc.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/javascript/);
    expect(res.headers.get("cache-control")).toMatch(/max-age/);
    const code = await res.text();
    expect(() => new Function(code)).not.toThrow();
    expect(code).toContain('"/px"');
  });
});

describe("/px", () => {
  it("records a sale credited to the email click", async () => {
    const res = await beacon({
      key,
      cid: clickId,
      event: "sale",
      value: 89.5,
      currency: "EUR",
      order_id: "ORDER-1",
      email: "shopper@example.com",
      url: "https://shop.example/thanks",
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const rows = await sql<
      { source: string; value: number; currency: string; campaign_id: string; payload: unknown }[]
    >`select source, value::float8 as value, currency, campaign_id, payload
      from conversions where workspace_id = ${ws} and external_txid = 'ORDER-1'`;
    expect(rows).toEqual([
      {
        source: "pixel",
        value: 89.5,
        currency: "EUR",
        campaign_id: campaignId,
        payload: { url: "https://shop.example/thanks", origin: "https://shop.example" },
      },
    ]);
  });

  it("counts a reloaded thank-you page once", async () => {
    await beacon({ key, cid: clickId, value: 89.5, currency: "EUR", order_id: "ORDER-1" });
    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from conversions where workspace_id = ${ws}
        and external_txid = 'ORDER-1'`;
    expect(row!.n).toBe(1);
  });

  it("answers the CORS preflight", async () => {
    const res = await app.request("/px", {
      method: "OPTIONS",
      headers: { origin: "https://shop.example", "access-control-request-method": "POST" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("refuses unknown keys and bad bodies", async () => {
    expect((await beacon({ key: "px_nope", value: 1 })).status).toBe(401);
    expect((await beacon({ key: key.replace("px_", "pk_"), value: 1 })).status).toBe(401);
    expect((await beacon({ value: 1 })).status).toBe(400);
    expect((await beacon("{not json")).status).toBe(400);
  });
});
