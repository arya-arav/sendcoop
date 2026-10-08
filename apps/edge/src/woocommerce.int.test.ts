import { createHmac } from "node:crypto";
import {
  createCampaign,
  EMPTY_AUDIENCE,
  getIntegrationSecret,
  getOrCreateWebhookSigningSecret,
  getSql,
} from "@sendcoop/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./app";

// WooCommerce's order webhooks, with the click id the plugin saved.

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let urlKey: string;
let signing: string;
let campaignId: string;
const clickId = `sc${run.padEnd(16, "w").slice(0, 16)}`;
const orderId = 700 + (Date.now() % 1000);
const txid = `woocommerce:woo.example:${orderId}`;

beforeAll(async () => {
  const [row] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Woo', ${`int-woo-${run}`}) returning id`;
  ws = row!.id;
  urlKey = await getIntegrationSecret(ws, "woocommerce");
  signing = await getOrCreateWebhookSigningSecret(ws, "woocommerce");
  const campaign = await createCampaign(ws, {
    name: "Mugs",
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
    values (${ws}, ${campaignId}, 'mugs@example.com', 'sent') returning id`;
  await sql`insert into clicks (click_id, workspace_id, campaign_id, message_id)
            values (${clickId}, ${ws}, ${campaignId}, ${m!.id})`;
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
  await sql.end();
});

function webhook(topic: string, payload: unknown, secret = signing) {
  const body = JSON.stringify(payload);
  return app.request(`/wh/woocommerce/${urlKey}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wc-webhook-topic": topic,
      "x-wc-webhook-source": "https://woo.example/",
      "x-wc-webhook-signature": createHmac("sha256", secret).update(body).digest("base64"),
    },
    body,
  });
}

const order = (over: Record<string, unknown> = {}) => ({
  id: orderId,
  number: String(orderId),
  status: "processing",
  currency: "USD",
  total: "60.00",
  billing: { email: "mugs@example.com" },
  meta_data: [{ id: 9, key: "sc_cid", value: clickId }],
  refunds: [],
  ...over,
});

const conversion = async () => {
  const [row] = await sql<{ value: number; status: string; campaign_id: string }[]>`
    select value::float8 as value, status, campaign_id from conversions
    where workspace_id = ${ws} and external_txid = ${txid}`;
  return row;
};

describe("WooCommerce webhooks", () => {
  it("answers WooCommerce's ping when the webhook is saved", async () => {
    const res = await app.request(`/wh/woocommerce/${urlKey}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "webhook_id=12",
    });
    expect(await res.text()).toBe("ok ping");
  });

  it("records an order, credited to the email click the plugin saved", async () => {
    expect(await (await webhook("order.created", order())).text()).toBe("ok created");
    expect(await conversion()).toEqual({ value: 60, status: "approved", campaign_id: campaignId });
    expect(await (await webhook("order.updated", order({ status: "completed" }))).text()).toBe(
      "ok duplicate",
    );
  });

  it("takes refunds off, and reverses a refunded order", async () => {
    await webhook("order.updated", order({ refunds: [{ id: 801, total: "-20.00" }] }));
    expect(await conversion()).toMatchObject({ value: 40, status: "approved" });
    await webhook(
      "order.updated",
      order({
        status: "refunded",
        refunds: [
          { id: 802, total: "-40.00" },
          { id: 801, total: "-20.00" },
        ],
      }),
    );
    expect(await conversion()).toMatchObject({ value: 0, status: "reversed" });
  });

  it("refuses bad signatures and ignores other topics", async () => {
    expect((await webhook("order.created", order(), "wrong")).status).toBe(401);
    expect(await (await webhook("product.updated", { id: 1 })).text()).toBe("ok ignored");
  });
});
