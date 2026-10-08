import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  getIntegrationSecret,
  getSql,
  startAutomationRun,
  verifyConversionSignature,
} from "@sendcoop/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isPrivateAddress, webhookUrlProblem } from "../webhooks";
import { processAutomationRun } from "./automation-runs";

// Every action (D67) in one flow: tag, move to another list, update a
// field, call a webhook (signed), remove a tag. JSON goes in as
// ::text::jsonb (see packages/db automation-triggers.int.test.ts).

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let subscriberId: string;
let automationId: string;
let server: Server;
let hookUrl: string;
const received: { headers: Record<string, string>; body: string }[] = [];
const ids: Record<string, string> = {};

beforeAll(async () => {
  process.env.SENDCOOP_ALLOW_PRIVATE_WEBHOOKS = "1";
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ headers: req.headers as Record<string, string>, body });
      res.writeHead(received.length === 1 ? 503 : 200).end("ok");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  hookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;

  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Actions', ${`int-actions-${run}`}) returning id`;
  ws = w!.id;
  for (const [key, query] of [
    ["vip", sql`insert into tags (workspace_id, name) values (${ws}, 'vip') returning id`],
    ["trial", sql`insert into tags (workspace_id, name) values (${ws}, 'trial') returning id`],
    ["leads", sql`insert into lists (workspace_id, name) values (${ws}, 'Leads') returning id`],
    [
      "customers",
      sql`insert into lists (workspace_id, name) values (${ws}, 'Customers') returning id`,
    ],
  ] as const) {
    const [row] = (await query) as unknown as { id: string }[];
    ids[key] = row!.id;
  }
  const [s] = await sql<{ id: string }[]>`
    insert into subscribers (workspace_id, email, status, first_name)
    values (${ws}, 'act@example.com', 'subscribed', 'Ada') returning id`;
  subscriberId = s!.id;
  await sql`insert into list_memberships (list_id, subscriber_id) values (${ids.leads!}, ${subscriberId})`;
  await sql`insert into subscriber_tags (subscriber_id, tag_id) values (${subscriberId}, ${ids.trial!})`;

  const steps = [
    { id: "tag", data: { type: "add_tag", tagId: ids.vip } },
    { id: "move", data: { type: "move_list", fromListId: ids.leads, toListId: ids.customers } },
    { id: "field", data: { type: "update_field", field: "plan", value: "pro" } },
    { id: "hook", data: { type: "webhook", url: hookUrl } },
    { id: "untag", data: { type: "remove_tag", tagId: ids.trial } },
  ];
  const graph = {
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: {} },
      ...steps.map((s, i) => ({ ...s, type: "action", position: { x: 0, y: i + 1 } })),
    ],
    edges: ["trigger", ...steps.map((s) => s.id)]
      .slice(0, -1)
      .map((source, i) => ({ id: `e${i}`, source, target: steps[i]!.id })),
  };
  const [a] = await sql<{ id: string }[]>`
    insert into automations (workspace_id, name, status, trigger, graph)
    values (${ws}, 'Upgrade', 'active', ${JSON.stringify({ type: "api_event", event: "upgraded" })}::text::jsonb,
            ${JSON.stringify(graph)}::text::jsonb)
    returning id`;
  automationId = a!.id;
});

afterAll(async () => {
  delete process.env.SENDCOOP_ALLOW_PRIVATE_WEBHOOKS;
  await sql`delete from workspaces where id = ${ws}`;
  await sql.end();
  server.close();
});

describe("automation actions", () => {
  it("each action does its job, the webhook signed and retried", async () => {
    const runId = (await startAutomationRun(ws, automationId, subscriberId, {
      context: { plan: "pro" },
    }))!;
    expect(await processAutomationRun(runId)).toMatchObject({ state: "done", status: "completed" });

    const tags = await sql<{ name: string }[]>`
      select t.name from subscriber_tags st join tags t on t.id = st.tag_id
      where st.subscriber_id = ${subscriberId} order by t.name`;
    expect(tags.map((t) => t.name)).toEqual(["vip"]);
    const lists = await sql<{ name: string }[]>`
      select l.name from list_memberships m join lists l on l.id = m.list_id
      where m.subscriber_id = ${subscriberId}`;
    expect(lists.map((l) => l.name)).toEqual(["Customers"]);
    const [s] = await sql<{ fields: Record<string, unknown> }[]>`
      select fields from subscribers where id = ${subscriberId}`;
    expect(s!.fields).toMatchObject({ plan: "pro" });

    // The webhook: retried after a 503, signed with the workspace's webhook secret
    expect(received).toHaveLength(2);
    const { headers, body } = received[1]!;
    const secret = await getIntegrationSecret(ws, "webhooks");
    expect(
      verifyConversionSignature({
        secret,
        timestamp: headers["sendcoop-timestamp"],
        signature: headers["sendcoop-signature"],
        body,
      }),
    ).toBe("ok");
    expect(JSON.parse(body)).toMatchObject({
      event: "automation.webhook",
      automation: { id: automationId, name: "Upgrade", step: "hook" },
      subscriber: { id: subscriberId, email: "act@example.com", first_name: "Ada" },
    });
    const [log] = await sql<{ status: string; detail: { status: number; attempts: number } }[]>`
      select status, detail from automation_step_logs where run_id = ${runId} and node_id = 'hook'`;
    expect(log).toMatchObject({ status: "done", detail: { status: 200, attempts: 2 } });
  });
});

describe("webhook addresses", () => {
  it("are refused when private or internal", async () => {
    for (const ip of [
      "10.0.0.5",
      "127.0.0.1",
      "169.254.169.254",
      "192.168.1.1",
      "172.20.0.1",
      "::1",
      "fd00::1",
      "::ffff:10.1.1.1",
    ]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    delete process.env.SENDCOOP_ALLOW_PRIVATE_WEBHOOKS;
    expect(await webhookUrlProblem("https://127.0.0.1/x")).toMatch(/private or internal/);
    expect(await webhookUrlProblem("http://example.com/x")).toMatch(/https/);
    expect(await webhookUrlProblem("https://localhost/x")).toMatch(/private or internal/);
    process.env.SENDCOOP_ALLOW_PRIVATE_WEBHOOKS = "1";
  });
});
