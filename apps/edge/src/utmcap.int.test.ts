import { getIntegrationSecret, getSql, saveUtmcapConnection } from "@sendcoop/db";
import { closeQueues } from "@sendcoop/queue";
import { signUtmcapBody } from "@sendcoop/utmcap";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./app";

// UTMCAP's postback and webhook endpoints: keys, signatures, repeats.

const sql = getSql();
const run = Date.now().toString(36);
const SECRET = "whsec_edge_test";
let ws: string;
let key: string;

beforeAll(async () => {
  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('UTMCAP edge', ${`int-utmcap-edge-${run}`}) returning id`;
  ws = w!.id;
  key = await getIntegrationSecret(ws, "utmcap");
  await saveUtmcapConnection(ws, {
    apiKey: "utmk_x",
    sourceId: "s",
    sourceName: "Sendcoop",
    webhookId: "w",
    webhookSecret: SECRET,
  });
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
  await closeQueues();
  await sql.end();
});

const hook = (event: Record<string, unknown>, secret = SECRET) => {
  const body = JSON.stringify(event);
  return app.request(`/wh/utmcap/${key}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "utmcap-signature": signUtmcapBody(secret, body),
    },
    body,
  });
};

describe("/pb/utmcap", () => {
  it("needs the workspace's key and a click id", async () => {
    expect((await app.request("/pb/utmcap?key=ut_nope&sc_cid=scAAAAAAAAAAAAAAAA")).status).toBe(
      401,
    );
    expect((await app.request(`/pb/utmcap?key=${key}&payout=5`)).status).toBe(400);
    const ok = await app.request(
      `/pb/utmcap?key=${key}&sc_cid=scBBBBBBBBBBBBBBBB&ucid=UCX1&payout=5`,
    );
    expect(await ok.text()).toBe("ok created");
  });
});

describe("/wh/utmcap", () => {
  const event = { id: `evt-${run}`, type: "conversion.created", data: { click_id: "UCX1" } };

  it("keeps a signed conversion event once, however often it's delivered", async () => {
    expect(await (await hook(event)).text()).toBe("ok queued");
    expect(await (await hook(event)).text()).toBe("ok duplicate");
    const rows = await sql`select event_id from utmcap_events where workspace_id = ${ws}`;
    expect(rows).toHaveLength(1);
  });

  it("refuses bad signatures, and acknowledges other events without keeping them", async () => {
    expect((await hook(event, "whsec_wrong")).status).toBe(401);
    const unsigned = await app.request(`/wh/utmcap/${key}`, { method: "POST", body: "{}" });
    expect(unsigned.status).toBe(401);
    expect(await (await hook({ id: "p1", type: "ping" })).text()).toBe("ok ignored");
    expect((await app.request("/wh/utmcap/ut_nope", { method: "POST", body: "{}" })).status).toBe(
      404,
    );
  });
});
