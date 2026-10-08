import { createHmac } from "node:crypto";
import {
  createCampaign,
  EMPTY_AUDIENCE,
  getIntegrationSecret,
  getSql,
  setWebhookSigningSecret,
} from "@sendcoop/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./app";

// Shopify's order and refund webhooks.

const sql = getSql();
const run = Date.now().toString(36);
const SIGNING = "shpss_test_signing_secret";
let ws: string;
let urlKey: string;
let campaignId: string;
let messageId: string;
const clickId = `sc${run.padEnd(16, "s").slice(0, 16)}`;
const orderId = Number(Date.now());

beforeAll(async () => {
  const [row] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Shopify', ${`int-shopify-${run}`}) returning id`;
  ws = row!.id;
  urlKey = await getIntegrationSecret(ws, "shopify");
  await setWebhookSigningSecret(ws, "shopify", SIGNING);
  const campaign = await createCampaign(ws, {
    name: "Boots",
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
    values (${ws}, ${campaignId}, 'boots@example.com', 'sent') returning id`;
  messageId = m!.id;
  await sql`insert into clicks (click_id, workspace_id, campaign_id, message_id)
            values (${clickId}, ${ws}, ${campaignId}, ${messageId})`;
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
  await sql.end();
});

function webhook(topic: string, payload: unknown, secret = SIGNING) {
  const body = JSON.stringify(payload);
  return app.request(`/wh/shopify/${urlKey}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": "boots.myshopify.com",
      "x-shopify-hmac-sha256": createHmac("sha256", secret).update(body).digest("base64"),
    },
    body,
  });
}

const order = {
  id: orderId,
  name: "#1001",
  email: "boots@example.com",
  currency: "USD",
  financial_status: "paid",
  total_price: "150.00",
  note_attributes: [{ name: "sc_cid", value: clickId }],
};
const refund = (id: number, amount: string) => ({
  id,
  order_id: orderId,
  transactions: [{ kind: "refund", status: "success", amount }],
});

const state = async () => {
  const [conversion] = await sql<{ value: number; status: string; campaign_id: string }[]>`
    select value::float8 as value, status, campaign_id from conversions
    where workspace_id = ${ws} and external_txid = ${`shopify:${orderId}`}`;
  const [message] = await sql<{ revenue: number }[]>`
    select revenue::float8 as revenue from messages where id = ${messageId}`;
  return { ...conversion, revenue: message!.revenue };
};

describe("Shopify webhooks", () => {
  it("records an order, credited to the email click from the cart attribute", async () => {
    const res = await webhook("orders/create", order);
    expect(await res.text()).toBe("ok created");
    expect(await state()).toEqual({
      value: 150,
      status: "approved",
      campaign_id: campaignId,
      revenue: 150,
    });
    // Shopify retries deliveries
    expect(await (await webhook("orders/create", order)).text()).toBe("ok duplicate");
  });

  it("takes partial refunds off, once each, and reverses the order when it's all refunded", async () => {
    expect(await (await webhook("refunds/create", refund(1, "50.00"))).text()).toBe("ok refunded");
    expect(await (await webhook("refunds/create", refund(1, "50.00"))).text()).toBe("ok duplicate");
    expect(await state()).toMatchObject({ value: 100, status: "approved", revenue: 100 });

    expect(await (await webhook("refunds/create", refund(2, "100.00"))).text()).toBe("ok reversed");
    expect(await state()).toMatchObject({ value: 0, status: "reversed", revenue: 0 });
  });

  it("refuses wrong signatures and unknown URLs, and ignores other topics", async () => {
    expect((await webhook("orders/create", order, "wrong")).status).toBe(401);
    const unknown = await app.request("/wh/shopify/sh_nope", { method: "POST", body: "{}" });
    expect(unknown.status).toBe(404);
    expect(await (await webhook("customers/create", { id: 1 })).text()).toBe("ok ignored");
    expect(
      await (await webhook("refunds/create", { ...refund(3, "1.00"), order_id: 1 })).text(),
    ).toBe("ok unknown");
  });
});
