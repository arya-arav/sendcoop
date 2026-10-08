import { getSql, WEBHOOK_DISABLE_AFTER } from "@sendcoop/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { deliverWebhook } from "../webhooks";
import { sendWebhookDeliveries } from "./webhook-deliveries";

// Outgoing webhooks (D78): the database triggers queue a delivery per event
// and endpoint; the job sends them, retries failures later and turns an
// endpoint off after too many failures. JSON goes in as ::text::jsonb.

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let endpointId: string;
const sent: { url: string; body: Record<string, unknown> }[] = [];
let answer = { ok: true, status: 200 as number | null, error: null as string | null };
const fake: typeof deliverWebhook = async (url, body) => {
  sent.push({ url, body });
  return { ...answer, attempts: 1 };
};
const URL_ = `https://hooks-${run}.example/in`;
const ours = () => sent.filter((s) => s.url === URL_);

beforeAll(async () => {
  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Hooks', ${`int-hooks-${run}`}) returning id`;
  ws = w!.id;
  const [e] = await sql<{ id: string }[]>`
    insert into webhook_endpoints (workspace_id, url, events)
    values (${ws}, ${URL_}, ${["subscriber.subscribed", "subscriber.unsubscribed", "conversion.created"]})
    returning id`;
  endpointId = e!.id;
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
});

const deliveries = () =>
  sql<{ event: string; status: string; attempts: number; next_in: number }[]>`
    select event, status, attempts,
           extract(epoch from next_attempt_at - now())::int as next_in
    from webhook_deliveries where endpoint_id = ${endpointId} order by created_at`;

describe("outgoing webhooks", () => {
  it("queues subscribed, unsubscribed and conversion events, and nothing else", async () => {
    const [s] = await sql<{ id: string }[]>`
      insert into subscribers (workspace_id, email, status, first_name)
      values (${ws}, ${`robin-${run}@example.com`}, 'subscribed', 'Robin') returning id`;
    await sql`insert into subscribers (workspace_id, email, status)
              values (${ws}, ${`pending-${run}@example.com`}, 'pending')`;
    await sql`update subscribers set first_name = 'Rob' where id = ${s!.id}`;
    await sql`update subscribers set status = 'unsubscribed' where id = ${s!.id}`;
    await sql`insert into conversions (workspace_id, source, event, value, currency, subscriber_id)
              values (${ws}, 'api', 'sale', 30, 'EUR', ${s!.id})`;
    expect((await deliveries()).map((d) => d.event)).toEqual([
      "subscriber.subscribed",
      "subscriber.unsubscribed",
      "conversion.created",
    ]);
  });

  it("sends them with an id and the event's data", async () => {
    // Others' deliveries may be due too (the job claims 50 at a time).
    for (let i = 0; i < 5 && ours().length < 3; i++) await sendWebhookDeliveries({ deliver: fake });
    // Sent several at once, so in any order.
    const byEvent = (event: string) => ours().find((s) => s.body.event === event)!.body;
    expect(
      ours()
        .map((s) => s.body.event)
        .sort(),
    ).toEqual(["conversion.created", "subscriber.subscribed", "subscriber.unsubscribed"]);
    expect(byEvent("subscriber.subscribed")).toMatchObject({
      id: expect.any(String),
      data: { email: `robin-${run}@example.com`, first_name: "Robin", status: "subscribed" },
    });
    expect(byEvent("conversion.created").data).toMatchObject({
      value: 30,
      currency: "EUR",
      email: `robin-${run}@example.com`,
    });
    expect((await deliveries()).every((d) => d.status === "delivered")).toBe(true);
  });

  it("retries a failure later, then gives up and turns the endpoint off", async () => {
    answer = { ok: false, status: 500, error: null };
    await sql`update webhook_endpoints set failure_streak = ${WEBHOOK_DISABLE_AFTER - 1} where id = ${endpointId}`;
    await sql`insert into subscribers (workspace_id, email, status)
              values (${ws}, ${`late-${run}@example.com`}, 'subscribed')`;
    await sendWebhookDeliveries({ deliver: fake });
    let last = (await deliveries()).at(-1)!;
    expect(last).toMatchObject({ status: "pending", attempts: 1 });
    expect(last.next_in).toBeGreaterThan(50); // a minute

    for (let i = 0; i < 5; i++) {
      await sql`update webhook_deliveries set next_attempt_at = now()
                where endpoint_id = ${endpointId} and status = 'pending'`;
      await sendWebhookDeliveries({ deliver: fake });
    }
    last = (await deliveries()).at(-1)!;
    expect(last).toMatchObject({ status: "failed", attempts: 6 });
    const [endpoint] = await sql<{ enabled: boolean; disabled_reason: string }[]>`
      select enabled, disabled_reason from webhook_endpoints where id = ${endpointId}`;
    expect(endpoint).toMatchObject({
      enabled: false,
      disabled_reason: expect.stringMatching(/Turned off/),
    });
  });
});
