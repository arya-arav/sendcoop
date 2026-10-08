import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { starterGraph } from "../automations";
import { getSql } from "../client";

// The automation tables' guarantees (D61), straight against the database.

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let subscriber: string;
let automation: string;
let email: string;

beforeAll(async () => {
  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Automations', ${`int-auto-${run}`}) returning id`;
  ws = w!.id;
  const [s] = await sql<{ id: string }[]>`
    insert into subscribers (workspace_id, email) values (${ws}, 'flow@example.com') returning id`;
  subscriber = s!.id;
  const [a] = await sql<{ id: string }[]>`
    insert into automations (workspace_id, name, trigger, graph)
    values (${ws}, 'Welcome', ${sql.json({ type: "joined_list", listId: "x" })},
            ${sql.json(starterGraph())})
    returning id`;
  automation = a!.id;
  const [c] = await sql<{ id: string }[]>`
    insert into campaigns (workspace_id, kind, automation_id, name, subject, from_name, from_local, html, text)
    values (${ws}, 'automation', ${automation}, 'Email 1', 'Hi', 'Acme', 'news', 'x', 'x') returning id`;
  email = c!.id;
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
});

const newRun = (status = "active", triggerRef: string | null = null) =>
  sql<{ id: string }[]>`
    insert into automation_runs (workspace_id, automation_id, subscriber_id, status, current_node_id, trigger_ref)
    values (${ws}, ${automation}, ${subscriber}, ${status}::automation_run_status, 'trigger', ${triggerRef})
    returning id`;

describe("automation tables", () => {
  it("allow one live run per subscriber, and any number of finished ones", async () => {
    const [first] = await newRun("active", "event-1");
    await expect(newRun("waiting")).rejects.toThrow(/automation_runs_live_unique/);
    await sql`update automation_runs set status = 'completed' where id = ${first!.id}`;
    await expect(newRun("active")).resolves.toHaveLength(1);
    // The same trigger never starts it twice
    await sql`update automation_runs set status = 'exited' where automation_id = ${automation}`;
    await expect(newRun("active", "event-1")).rejects.toThrow(/automation_runs_trigger_unique/);
  });

  it("log each step once per run", async () => {
    const [r] = await sql<
      { id: string }[]
    >`select id from automation_runs where automation_id = ${automation} limit 1`;
    const log = () => sql`
      insert into automation_step_logs (workspace_id, automation_id, run_id, node_id, kind, status)
      values (${ws}, ${automation}, ${r!.id}, 'email-1', 'email', 'done')`;
    await log();
    await expect(log()).rejects.toThrow(/automation_step_logs_run_node_unique/);
  });

  it("send an automation email once per run, so going through again sends it again", async () => {
    const runs = await sql<
      { id: string }[]
    >`select id from automation_runs where automation_id = ${automation} order by started_at limit 2`;
    const message = (runId: string | null) => sql`
      insert into messages (workspace_id, campaign_id, subscriber_id, automation_run_id, email)
      values (${ws}, ${email}, ${subscriber}, ${runId}, 'flow@example.com')`;
    await message(runs[0]!.id);
    await message(runs[1]!.id);
    await expect(message(runs[0]!.id)).rejects.toThrow(/messages_run_campaign_unique/);
    // A broadcast still reaches each subscriber once
    await message(null);
    await expect(message(null)).rejects.toThrow(/messages_campaign_subscriber_unique/);
  });
});
