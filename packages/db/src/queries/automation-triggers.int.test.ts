import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AutomationTrigger } from "../automations";
import { starterGraph } from "../automations";
import { getSql } from "../client";
import {
  processAutomationEvents,
  recordApiEvent,
  startDateTriggeredRuns,
} from "./automation-triggers";

// JSON goes in as text (::text::jsonb): drizzle changes the raw client's JSON
// handling once it's used, so sql.json and ::jsonb depend on the order.

// Each trigger starts a run (D64): joining a list (also by confirming a
// double opt-in), getting a tag, an API event, a date in a profile field.

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let listId: string;
let tagId: string;
const automation: Record<string, string> = {};

async function subscriber(
  email: string,
  status = "subscribed",
  fields: Record<string, string> = {},
) {
  const [s] = await sql<{ id: string }[]>`
    insert into subscribers (workspace_id, email, status, fields)
    values (${ws}, ${email}, ${status}::subscriber_status, ${JSON.stringify(fields)}::text::jsonb) returning id`;
  return s!.id;
}
const runsOf = async (key: string) =>
  sql<{ subscriber_id: string; trigger_ref: string | null }[]>`
    select subscriber_id, trigger_ref from automation_runs where automation_id = ${automation[key]!}`;

beforeAll(async () => {
  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Triggers', ${`int-trig-${run}`}) returning id`;
  ws = w!.id;
  const [l] = await sql<
    { id: string }[]
  >`insert into lists (workspace_id, name) values (${ws}, 'Buyers') returning id`;
  listId = l!.id;
  const [t] = await sql<
    { id: string }[]
  >`insert into tags (workspace_id, name) values (${ws}, 'vip') returning id`;
  tagId = t!.id;
  const triggers: Record<string, AutomationTrigger> = {
    list: { type: "joined_list", listId },
    tag: { type: "tag_added", tagId },
    api: { type: "api_event", event: "trial_started" },
    birthday: { type: "date_field", field: "birthday", offsetDays: 0, yearly: true },
    renewal: { type: "date_field", field: "renews_on", offsetDays: -3 },
  };
  for (const [key, trigger] of Object.entries(triggers)) {
    const [a] = await sql<{ id: string }[]>`
      insert into automations (workspace_id, name, status, trigger, graph)
      values (${ws}, ${key}, 'active', ${JSON.stringify(trigger)}::text::jsonb, ${JSON.stringify(starterGraph())}::text::jsonb)
      returning id`;
    automation[key] = a!.id;
  }
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
});

describe("automation triggers", () => {
  it("joining a list starts a run; a pending subscriber's starts when they confirm", async () => {
    const ann = await subscriber("ann@example.com");
    const pat = await subscriber("pat@example.com", "pending");
    await sql`insert into list_memberships (list_id, subscriber_id) values (${listId}, ${ann}), (${listId}, ${pat})`;
    await processAutomationEvents();
    expect((await runsOf("list")).map((r) => r.subscriber_id)).toEqual([ann]);

    await sql`update subscribers set status = 'subscribed' where id = ${pat}`;
    await processAutomationEvents();
    expect((await runsOf("list")).map((r) => r.subscriber_id).sort()).toEqual([ann, pat].sort());
  });

  it("getting a tag starts a run", async () => {
    const vip = await subscriber("vip@example.com");
    await sql`insert into subscriber_tags (subscriber_id, tag_id) values (${vip}, ${tagId})`;
    expect(await processAutomationEvents()).toHaveLength(1);
    expect((await runsOf("tag")).map((r) => r.subscriber_id)).toEqual([vip]);
  });

  it("an API event starts a run once per event id", async () => {
    const dev = await subscriber("dev@example.com");
    const event = {
      event: "trial_started",
      email: "DEV@example.com",
      subscriberId: null,
      data: { plan: "pro" },
    };
    expect(await recordApiEvent(ws, { ...event, eventId: "evt-1" })).toBe("queued");
    expect(await recordApiEvent(ws, { ...event, eventId: "evt-1" })).toBe("duplicate");
    expect(
      await recordApiEvent(ws, { ...event, email: "nobody@example.com", eventId: "evt-2" }),
    ).toBe("unknown_subscriber");
    await processAutomationEvents();
    expect(await runsOf("api")).toEqual([{ subscriber_id: dev, trigger_ref: "api_event:evt-1" }]);
    // A different event name doesn't start it
    await recordApiEvent(ws, { ...event, event: "other", eventId: "evt-3" });
    await processAutomationEvents();
    expect(await runsOf("api")).toHaveLength(1);
  });

  it("dates: a yearly birthday, and three days before a renewal; once a day", async () => {
    const now = new Date("2026-10-08T09:00:00Z");
    const bday = await subscriber("bday@example.com", "subscribed", { birthday: "1990-10-08" });
    const renews = await subscriber("renew@example.com", "subscribed", { renews_on: "2026-10-11" });
    await subscriber("later@example.com", "subscribed", {
      birthday: "1990-11-08",
      renews_on: "2026-10-12",
    });
    await startDateTriggeredRuns(now);
    expect((await runsOf("birthday")).map((r) => r.subscriber_id)).toEqual([bday]);
    expect(await runsOf("renewal")).toEqual([
      { subscriber_id: renews, trigger_ref: "date:2026-10-08" },
    ]);
    // The hourly scan again: nothing new
    await sql`update automation_runs set status = 'completed' where workspace_id = ${ws}`;
    await startDateTriggeredRuns(new Date("2026-10-08T10:00:00Z"));
    expect(await runsOf("birthday")).toHaveLength(1);
  });

  it("paused automations don't listen", async () => {
    await sql`update automations set status = 'paused' where id = ${automation.tag!}`;
    const quiet = await subscriber("quiet@example.com");
    await sql`insert into subscriber_tags (subscriber_id, tag_id) values (${quiet}, ${tagId})`;
    const [{ n }] = (await sql`
      select count(*)::int as n from automation_events where subscriber_id = ${quiet}`) as unknown as [
      { n: number },
    ];
    expect(n).toBe(0);
  });
});
