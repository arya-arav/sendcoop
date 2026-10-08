import { getIntegrationSecret, getSql, signConversionBody } from "@sendcoop/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./app";

// POST /v1/events (D64): signed like the conversion API; the event waits
// for the worker to start what it triggers.

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let secret: string;

beforeAll(async () => {
  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Events', ${`int-events-${run}`}) returning id`;
  ws = w!.id;
  secret = await getIntegrationSecret(ws, "api");
  await sql`insert into subscribers (workspace_id, email, status) values (${ws}, 'evt@example.com', 'subscribed')`;
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
  await sql.end();
});

const send = (body: unknown, key = secret) => {
  const text = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return app.request("/v1/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sendcoop-workspace": ws,
      "sendcoop-timestamp": timestamp,
      "sendcoop-signature": signConversionBody(key, timestamp, text),
    },
    body: text,
  });
};

describe("POST /v1/events", () => {
  it("queues a signed event once per event id", async () => {
    const body = {
      event: "trial_started",
      email: "EVT@example.com",
      event_id: "t-1",
      data: { plan: "pro" },
    };
    const first = await send(body);
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ result: "queued" });
    expect(await (await send(body)).json()).toEqual({ result: "duplicate" });
    const rows =
      await sql`select type, ref, payload from automation_events where workspace_id = ${ws}`;
    expect(rows).toEqual([{ type: "api_event", ref: "trial_started", payload: { plan: "pro" } }]);
  });

  it("explains what's wrong", async () => {
    expect((await send({ event: "x", email: "evt@example.com" }, "sk_wrong")).status).toBe(401);
    expect((await send({ event: "bad name!", email: "evt@example.com" })).status).toBe(422);
    expect((await send({ event: "ok" })).status).toBe(422);
    const unknown = await send({ event: "ok", email: "nobody@example.com" });
    expect(await unknown.json()).toEqual({ error: expect.stringMatching(/No subscriber/) });
  });
});
