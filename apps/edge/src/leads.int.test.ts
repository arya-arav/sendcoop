import {
  createCampaign,
  EMPTY_AUDIENCE,
  getIntegrationSecret,
  getSql,
  setIntegrationConfig,
} from "@sendcoop/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./app";

// Leads: created from a form tool, moved along by a CRM, revenue when sold.

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let key: string;
let listId: string;
let messageId: string;
let campaignId: string;
const clickId = `sc${run.padEnd(16, "l").slice(0, 16)}`;

beforeAll(async () => {
  const [row] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Leads', ${`int-leads-${run}`}) returning id`;
  ws = row!.id;
  key = await getIntegrationSecret(ws, "leads");
  const [list] = await sql<{ id: string }[]>`
    insert into lists (workspace_id, name) values (${ws}, 'Leads') returning id`;
  listId = list!.id;
  await setIntegrationConfig(ws, "leads", { listId });
  const campaign = await createCampaign(ws, {
    name: "Free audit",
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
    values (${ws}, ${campaignId}, 'prospect@example.com', 'sent') returning id`;
  messageId = m!.id;
  await sql`insert into clicks (click_id, workspace_id, campaign_id, message_id)
            values (${clickId}, ${ws}, ${campaignId}, ${messageId})`;
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
  await sql.end();
});

const send = (fields: Record<string, string | number>, json = true) =>
  app.request(`/lead/${key}`, {
    method: "POST",
    headers: {
      "content-type": json ? "application/json" : "application/x-www-form-urlencoded",
    },
    body: json
      ? JSON.stringify(fields)
      : new URLSearchParams(
          Object.entries(fields).map(([k, v]): [string, string] => [k, String(v)]),
        ).toString(),
  });

const lead = async () => {
  const [row] = await sql<{ lead_stage: string; status: string; value: number }[]>`
    select lead_stage, status, value::float8 as value from conversions
    where workspace_id = ${ws} and external_txid = 'lead:L-1'`;
  const [message] = await sql<{ revenue: number }[]>`
    select revenue::float8 as revenue from messages where id = ${messageId}`;
  return { ...row, revenue: message!.revenue };
};

describe("lead webhook", () => {
  it("records a new lead from a form, credited to the email click, and lists them", async () => {
    const res = await send(
      {
        "Email Address": "Prospect@Example.com",
        Name: "Pat Smith",
        lead_id: "L-1",
        sc_cid: clickId,
      },
      false,
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      result: "created",
      stage: "new",
      attributed_by: "click",
      listed: true,
    });
    expect(await lead()).toEqual({ lead_stage: "new", status: "pending", value: 0, revenue: 0 });
    const members = await sql<{ email: string; first_name: string }[]>`
      select s.email, s.first_name from list_memberships m
      join subscribers s on s.id = m.subscriber_id where m.list_id = ${listId}`;
    expect(members).toEqual([{ email: "prospect@example.com", first_name: "Pat" }]);
  });

  it("moves the lead along; selling it adds its value to the email's revenue", async () => {
    expect(await (await send({ lead_id: "L-1", status: "qualified" })).json()).toMatchObject({
      result: "updated",
      stage: "qualified",
    });
    expect(await lead()).toMatchObject({ lead_stage: "qualified", revenue: 0 });

    await send({ lead_id: "L-1", status: "won", value: 2500 });
    expect(await lead()).toEqual({
      lead_stage: "sold",
      status: "approved",
      value: 2500,
      revenue: 2500,
    });

    // The same update again changes nothing; a lost deal takes the revenue back
    expect(
      await (await send({ lead_id: "L-1", status: "sold", value: 2500 })).json(),
    ).toMatchObject({ result: "duplicate" });
    await send({ lead_id: "L-1", status: "lost" });
    expect(await lead()).toMatchObject({ lead_stage: "lost", status: "rejected", revenue: 0 });
  });

  it("explains bad requests", async () => {
    const res = await send({ name: "No contact" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Send the lead's email or lead_id." });
    const unknown = await app.request("/lead/ld_nope", { method: "POST", body: "{}" });
    expect(unknown.status).toBe(404);
  });
});
