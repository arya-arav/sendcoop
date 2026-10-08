import {
  createCampaign,
  EMPTY_AUDIENCE,
  getIntegrationSecret,
  getSql,
  setIntegrationConfig,
} from "@sendcoop/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./app";

// Affiliate network postbacks: attributed to the email click, and safe to
// repeat.

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let key: string;
let campaignId: string;
let messageId: string;
const clickId = `sc${run.padEnd(16, "x").slice(0, 16)}`;

beforeAll(async () => {
  const [row] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Postbacks', ${`int-pb-${run}`}) returning id`;
  ws = row!.id;
  key = await getIntegrationSecret(ws, "postback");
  const campaign = await createCampaign(ws, {
    name: "Offer",
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
    values (${ws}, ${campaignId}, 'buyer@example.com', 'sent') returning id`;
  messageId = m!.id;
  await sql`insert into clicks (click_id, workspace_id, campaign_id, message_id)
            values (${clickId}, ${ws}, ${campaignId}, ${messageId})`;
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
  await sql.end();
});

const postback = (query: string, init?: RequestInit) =>
  app.request(`/pb?key=${key}&${query}`, {
    headers: { "x-forwarded-for": "203.0.113.9" },
    ...init,
  });
const conversions = () =>
  sql<
    {
      status: string;
      value: number;
      campaign_id: string;
      message_id: string;
      external_txid: string;
    }[]
  >`
    select status, value::float8 as value, campaign_id, message_id, external_txid
    from conversions where workspace_id = ${ws} order by id`;

describe("GET/POST /pb", () => {
  it("records a sale, attributed to the email it came from", async () => {
    const response = await postback(`cid=${clickId}&payout=24.50&txid=T-1&status=approved`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok created");
    expect(await conversions()).toEqual([
      {
        status: "approved",
        value: 24.5,
        campaign_id: campaignId,
        message_id: messageId,
        external_txid: "T-1",
      },
    ]);
  });

  it("ignores the same postback sent again", async () => {
    for (let i = 0; i < 3; i++) {
      expect(await (await postback(`cid=${clickId}&payout=24.50&txid=T-1`)).text()).toBe(
        "ok duplicate",
      );
    }
    expect(await conversions()).toHaveLength(1);
  });

  it("updates the status when the network reverses it", async () => {
    expect(
      await (await postback(`cid=${clickId}&payout=24.50&txid=T-1&status=refund`)).text(),
    ).toBe("ok updated");
    expect((await conversions())[0]!.status).toBe("reversed");
  });

  it("accepts POSTed forms and JSON", async () => {
    const form = await app.request(`/pb?key=${key}`, {
      method: "POST",
      body: new URLSearchParams({ cid: clickId, amount: "10", transaction_id: "T-2" }),
    });
    expect(await form.text()).toBe("ok created");
    const json = await app.request(`/pb?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subid: clickId, payout: 5, txid: "T-3" }),
    });
    expect(await json.text()).toBe("ok created");
    expect(await conversions()).toHaveLength(3);
  });

  it("dedupes postbacks without a transaction id by click and payout", async () => {
    expect(await (await postback(`cid=${clickId}&payout=7`)).text()).toBe("ok created");
    expect(await (await postback(`cid=${clickId}&payout=7`)).text()).toBe("ok duplicate");
  });

  it("refuses unknown keys, and IPs outside the allowlist", async () => {
    const wrong = await app.request(`/pb?key=pk_wrong&cid=${clickId}&payout=1&txid=X`);
    expect(wrong.status).toBe(401);
    await setIntegrationConfig(ws, "postback", { allowedIps: ["198.51.100.0/24"] });
    expect((await postback("cid=x&payout=1&txid=IP-1")).status).toBe(403);
    const allowed = await app.request(`/pb?key=${key}&cid=x&payout=1&txid=IP-1`, {
      headers: { "x-forwarded-for": "198.51.100.77" },
    });
    expect(allowed.status).toBe(200);
    await setIntegrationConfig(ws, "postback", {});
  });
});
