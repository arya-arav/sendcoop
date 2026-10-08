import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AutomationGraph, ConditionStep } from "../automations";
import { getSql } from "../client";
import { advanceAutomationRun, startAutomationRun } from "./automation-engine";

// Conditions route each run down Yes or No (D66). Every case is a flow:
// trigger → condition → Yes: tag "yes" / No: tag "no". Its tag says which
// way the run went. JSON goes in as ::text::jsonb (see automation-triggers).

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let yesTag: string;
let noTag: string;
let listId: string;
let campaignId: string;

beforeAll(async () => {
  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Conditions', ${`int-cond-${run}`}) returning id`;
  ws = w!.id;
  const tags = await sql<{ id: string }[]>`
    insert into tags (workspace_id, name) values (${ws}, 'yes'), (${ws}, 'no') returning id`;
  [yesTag, noTag] = tags.map((t) => t.id) as [string, string];
  const [l] = await sql<
    { id: string }[]
  >`insert into lists (workspace_id, name) values (${ws}, 'VIP') returning id`;
  listId = l!.id;
  const [c] = await sql<{ id: string }[]>`
    insert into campaigns (workspace_id, kind, name, subject, from_name, from_local, html, text, status)
    values (${ws}, 'automation', 'Welcome', 'Hi', 'Acme', 'news', 'x', 'x', 'sending') returning id`;
  campaignId = c!.id;
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
});

let n = 0;
/** Runs one subscriber through "condition → tag yes / tag no"; returns the branch taken. */
async function route(
  condition: ConditionStep,
  setup: (subscriberId: string, runId: string) => Promise<void> = async () => {},
  subscriberFields: { firstName?: string } = {},
) {
  n++;
  const graph: AutomationGraph = {
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: {} },
      {
        id: "welcome",
        type: "email",
        position: { x: 0, y: 1 },
        data: { campaignId, name: "Welcome", subject: "Hi" },
      },
      { id: "check", type: "condition", position: { x: 0, y: 2 }, data: condition },
      {
        id: "yes",
        type: "action",
        position: { x: 0, y: 3 },
        data: { type: "add_tag", tagId: yesTag },
      },
      {
        id: "no",
        type: "action",
        position: { x: 1, y: 3 },
        data: { type: "add_tag", tagId: noTag },
      },
    ],
    edges: [
      { id: "1", source: "trigger", target: "check" },
      { id: "2", source: "check", target: "yes", sourceHandle: "yes" },
      { id: "3", source: "check", target: "no", sourceHandle: "no" },
    ],
  };
  const [a] = await sql<{ id: string }[]>`
    insert into automations (workspace_id, name, status, trigger, graph)
    values (${ws}, ${`case ${n}`}, 'active', ${JSON.stringify({ type: "api_event", event: "x" })}::text::jsonb,
            ${JSON.stringify(graph)}::text::jsonb)
    returning id`;
  const [s] = await sql<{ id: string }[]>`
    insert into subscribers (workspace_id, email, status, first_name)
    values (${ws}, ${`case${n}@example.com`}, 'subscribed', ${subscriberFields.firstName ?? null})
    returning id`;
  const runId = (await startAutomationRun(ws, a!.id, s!.id))!;
  await setup(s!.id, runId);
  expect(await advanceAutomationRun(runId)).toMatchObject({ state: "done", status: "completed" });
  const tags = await sql<
    { tag_id: string }[]
  >`select tag_id from subscriber_tags where subscriber_id = ${s!.id}`;
  expect(tags).toHaveLength(1);
  return tags[0]!.tag_id === yesTag ? "yes" : "no";
}

/** The run's welcome email, as if sent (and maybe opened or clicked). */
const welcome =
  (opened: boolean, clicked: boolean) => async (subscriberId: string, runId: string) => {
    await sql`
    insert into messages (workspace_id, campaign_id, subscriber_id, automation_run_id, email, status,
                          sent_at, opened_at, clicked_at)
    values (${ws}, ${campaignId}, ${subscriberId}, ${runId}, 'x@example.com', 'sent', now(),
            ${opened ? sql`now()` : null}, ${clicked ? sql`now()` : null})`;
  };

describe("automation conditions", () => {
  it("opened / clicked one of the run's emails", async () => {
    const opened: ConditionStep = { kind: "activity", event: "opened", nodeId: "welcome" };
    const clicked: ConditionStep = { kind: "activity", event: "clicked", nodeId: null };
    expect(await route(opened, welcome(true, false))).toBe("yes");
    expect(await route(opened, welcome(false, false))).toBe("no");
    expect(await route(clicked, welcome(true, true))).toBe("yes");
    expect(await route(clicked, welcome(true, false))).toBe("no");
  });

  it("converted since the run began", async () => {
    const converted: ConditionStep = { kind: "activity", event: "converted", nodeId: null };
    const sale = (status: string) => async (subscriberId: string) => {
      await sql`
        insert into conversions (workspace_id, subscriber_id, source, value, status, external_txid, fx_rate)
        values (${ws}, ${subscriberId}, 'api', 10, ${status}::conversion_status, ${`s-${Math.random()}`}, 1)`;
    };
    expect(await route(converted, sale("approved"))).toBe("yes");
    expect(await route(converted, sale("pending"))).toBe("no");
  });

  it("a field's value, and conversion fields", async () => {
    const isAnn: ConditionStep = {
      kind: "rules",
      rules: {
        match: "all",
        conditions: [{ type: "field", field: "first_name", op: "equals", value: "ann" }],
      },
    };
    expect(await route(isAnn, undefined, { firstName: "Ann" })).toBe("yes");
    expect(await route(isAnn, undefined, { firstName: "Bob" })).toBe("no");
    const bigSpender: ConditionStep = {
      kind: "rules",
      rules: {
        match: "all",
        conditions: [{ type: "field", field: "lifetime_value", op: "gt", value: "100" }],
      },
    };
    const spent = (value: number) => async (subscriberId: string) => {
      await sql`
        insert into conversions (workspace_id, subscriber_id, source, value, status, external_txid, fx_rate)
        values (${ws}, ${subscriberId}, 'api', ${value}, 'approved', ${`v-${Math.random()}`}, 1)`;
    };
    expect(await route(bigSpender, spent(150))).toBe("yes");
    expect(await route(bigSpender, spent(50))).toBe("no");
  });

  it("segment membership", async () => {
    const [segment] = await sql<{ id: string }[]>`
      insert into segments (workspace_id, name, rules)
      values (${ws}, 'VIPs', ${JSON.stringify({ match: "all", conditions: [{ type: "list", op: "in", listId }] })}::text::jsonb)
      returning id`;
    const inSegment: ConditionStep = { kind: "segment", segmentId: segment!.id };
    const joinVip = async (subscriberId: string) => {
      await sql`insert into list_memberships (list_id, subscriber_id) values (${listId}, ${subscriberId})`;
    };
    expect(await route(inSegment, joinVip)).toBe("yes");
    expect(await route(inSegment)).toBe("no");
  });
});
