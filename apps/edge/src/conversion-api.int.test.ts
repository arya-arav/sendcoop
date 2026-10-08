import {
  createCampaign,
  EMPTY_AUDIENCE,
  getIntegrationSecret,
  getSql,
  signConversionBody,
} from "@sendcoop/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./app";

// POST /v1/conversions: signed requests from a store's own server.

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let noKey: string;
let secret: string;
let campaignId: string;
const clickId = `sc${run.padEnd(16, "a").slice(0, 16)}`;

beforeAll(async () => {
  const rows = await sql<{ id: string }[]>`
    insert into workspaces (name, slug)
    values ('Api', ${`int-api-${run}`}), ('No key', ${`int-api-nokey-${run}`}) returning id`;
  [ws, noKey] = rows.map((r) => r.id) as [string, string];
  secret = await getIntegrationSecret(ws, "api");
  const campaign = await createCampaign(ws, {
    name: "Restock",
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
    values (${ws}, ${campaignId}, 'api-buyer@example.com', 'sent') returning id`;
  await sql`insert into clicks (click_id, workspace_id, campaign_id, message_id)
            values (${clickId}, ${ws}, ${campaignId}, ${m!.id})`;
});

afterAll(async () => {
  await sql`delete from workspaces where id in (${ws}, ${noKey})`;
  await sql.end();
});

function send(
  body: unknown,
  options: { workspace?: string; key?: string; timestamp?: number; signature?: string } = {},
) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  return app.request("/v1/conversions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sendcoop-workspace": options.workspace ?? ws,
      "sendcoop-timestamp": timestamp,
      "sendcoop-signature":
        options.signature ?? signConversionBody(options.key ?? secret, timestamp, text),
    },
    body: text,
  });
}

describe("POST /v1/conversions", () => {
  it("records a signed sale, credited to the email click", async () => {
    const res = await send({ click_id: clickId, value: 120, currency: "GBP", order_id: "API-1" });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ result: "created", attributed_by: "click" });
    const [row] = await sql<{ source: string; value: number; campaign_id: string }[]>`
      select source, value::float8 as value, campaign_id from conversions
      where workspace_id = ${ws} and external_txid = 'API-1'`;
    expect(row).toEqual({ source: "api", value: 120, campaign_id: campaignId });
  });

  it("ignores a repeat, and takes a refund later", async () => {
    const again = await send({ click_id: clickId, value: 120, currency: "GBP", order_id: "API-1" });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ result: "duplicate" });
    const refund = await send({ order_id: "API-1", status: "reversed" });
    expect(await refund.json()).toMatchObject({ result: "updated" });
    const [row] = await sql<{ status: string }[]>`
      select status from conversions where workspace_id = ${ws} and external_txid = 'API-1'`;
    expect(row!.status).toBe("reversed");
  });

  it("records a sale it can't credit to an email", async () => {
    const res = await send({ email: "stranger@example.com", value: 15, order_id: "API-2" });
    expect(await res.json()).toMatchObject({ result: "created", attributed_by: "none" });
  });

  it("refuses unsigned, wrongly signed, stale and other workspaces' requests", async () => {
    const body = { value: 1, order_id: "API-BAD" };
    const errors = async (res: Response) => [
      res.status,
      ((await res.json()) as { error: string }).error,
    ];
    expect(await errors(await send(body, { signature: "" }))).toEqual([
      401,
      expect.stringMatching(/Sign the request/),
    ]);
    expect(await errors(await send(body, { key: "sk_wrong" }))).toEqual([
      401,
      expect.stringMatching(/doesn't match/),
    ]);
    expect(
      await errors(await send(body, { timestamp: Math.floor(Date.now() / 1000) - 600 })),
    ).toEqual([401, expect.stringMatching(/5 minutes/)]);
    expect(await errors(await send(body, { workspace: noKey }))).toEqual([
      401,
      expect.stringMatching(/doesn't match/),
    ]);
    expect(await errors(await send(body, { workspace: "acme" }))).toEqual([
      401,
      expect.stringMatching(/Sendcoop-Workspace/),
    ]);
    const [{ n }] = (await sql<{ n: number }[]>`
      select count(*)::int as n from conversions where external_txid = 'API-BAD'`) as unknown as [
      { n: number },
    ];
    expect(n).toBe(0);
  });

  it("explains invalid bodies", async () => {
    const bad = await send("{oops");
    expect(bad.status).toBe(400);
    const invalid = await send({ value: "lots" });
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toEqual({
      error: expect.stringMatching(/value must be a number/),
    });
  });
});
