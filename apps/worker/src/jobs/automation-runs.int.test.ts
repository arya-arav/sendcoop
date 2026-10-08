import {
  addSendingDomain,
  createSendingServer,
  ensureAutomationEmail,
  getSql,
  setAutomationStatus,
  startAutomationRun,
} from "@sendcoop/db";
import type { SendBatchJob } from "@sendcoop/queue";
import { closeQueues } from "@sendcoop/queue";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processAutomationRun } from "./automation-runs";
import { sendBatch } from "./send-campaign";

// A three-step flow end to end (D63): email, wait an hour, email, exit,
// with the clock moved on instead of waiting, and the emails really sent.

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";
const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let automationId: string;
let subscriberId: string;
const email = `flow-${run}@example.com`;
const sent: SendBatchJob[] = [];
const send = async (jobs: SendBatchJob[]) => {
  sent.push(...jobs);
  for (const job of jobs) await sendBatch(job);
};

beforeAll(async () => {
  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Flow', ${`int-flow-${run}`}) returning id`;
  ws = w!.id;
  const domain = await addSendingDomain(ws, `mail.flow-${run}.test`);
  if (!domain.ok) throw new Error("setup");
  const server = await createSendingServer(ws, {
    name: "Mailpit",
    type: "smtp",
    summary: "mailpit",
    config: {
      type: "smtp",
      host: process.env.SMTP_HOST ?? "localhost",
      port: Number(process.env.SMTP_PORT ?? 1026),
      secure: false,
    },
  });
  const [s] = await sql<{ id: string }[]>`
    insert into subscribers (workspace_id, email, status, subscribed_at)
    values (${ws}, ${email}, 'subscribed', now()) returning id`;
  subscriberId = s!.id;
  const [a] = await sql<{ id: string }[]>`
    insert into automations (workspace_id, name, trigger, graph)
    values (${ws}, 'Welcome', ${JSON.stringify({ type: "api_event", event: "signup" })}::jsonb, ${JSON.stringify(
      {
        nodes: [
          { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: {} },
          {
            id: "hello",
            type: "email",
            position: { x: 0, y: 1 },
            data: { campaignId: null, name: "Hello", subject: "Hello" },
          },
          {
            id: "wait",
            type: "wait",
            position: { x: 0, y: 2 },
            data: { amount: 1, unit: "hours" },
          },
          {
            id: "tips",
            type: "email",
            position: { x: 0, y: 3 },
            data: { campaignId: null, name: "Tips", subject: "Tips" },
          },
          { id: "exit", type: "exit", position: { x: 0, y: 4 }, data: {} },
        ],
        edges: [
          { id: "1", source: "trigger", target: "hello" },
          { id: "2", source: "hello", target: "wait" },
          { id: "3", source: "wait", target: "tips" },
          { id: "4", source: "tips", target: "exit" },
        ],
      },
    )}::jsonb)
    returning id`;
  automationId = a!.id;
  const sender = {
    fromName: "Flow",
    fromLocal: "hello",
    sendingDomainId: domain.domain.id,
    sendingServerId: server.id,
  };
  for (const [node, subject] of [
    ["hello", `Hello ${run}`],
    ["tips", `Tips ${run}`],
  ] as const) {
    const campaignId = await ensureAutomationEmail(ws, automationId, node, sender);
    await sql`update campaigns set subject = ${subject},
                html = ${`<html><body><p>${subject}</p></body></html>`}, text = ${subject}
              where id = ${campaignId!}`;
  }
  await setAutomationStatus(ws, automationId, "active");
});

afterAll(async () => {
  await closeQueues();
  await sql`delete from workspaces where id = ${ws}`;
  await sql.end();
});

const inbox = async () => {
  const found = (await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
  ).then((r) => r.json())) as { messages: { Subject: string }[] };
  return found.messages.map((m) => m.Subject).sort();
};

describe("an automation run", () => {
  let runId: string;
  const start = Date.now();

  it("sends the first email, then waits", async () => {
    runId = (await startAutomationRun(ws, automationId, subscriberId, { triggerRef: "signup-1" }))!;
    expect(runId).toBeTruthy();
    // The same trigger again starts nothing
    expect(
      await startAutomationRun(ws, automationId, subscriberId, { triggerRef: "signup-1" }),
    ).toBeNull();

    const result = await processAutomationRun(runId, { now: () => new Date(start), send });
    expect(result).toMatchObject({ state: "waiting", until: new Date(start + 3_600_000) });
    expect(await inbox()).toEqual([`Hello ${run}`]);
    // Not yet: the hour isn't over
    expect(
      await processAutomationRun(runId, { now: () => new Date(start + 60_000), send }),
    ).toMatchObject({
      state: "waiting",
    });
  });

  it("after the wait, sends the second email and ends", async () => {
    const result = await processAutomationRun(runId, {
      now: () => new Date(start + 3_600_000 + 1000),
      send,
    });
    expect(result).toMatchObject({ state: "done", status: "completed" });
    expect(await inbox()).toEqual([`Hello ${run}`, `Tips ${run}`]);
    const logs = await sql<{ node_id: string }[]>`
      select node_id from automation_step_logs where run_id = ${runId} order by created_at`;
    expect(logs.map((l) => l.node_id)).toEqual(["hello", "wait", "tips", "exit"]);
  });

  it("does nothing twice when it's run again", async () => {
    expect(await processAutomationRun(runId, { send })).toMatchObject({ state: "idle" });
    expect(sent).toHaveLength(2);
    expect(await inbox()).toHaveLength(2);
  });
});
