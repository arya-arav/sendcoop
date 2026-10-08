import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "../client";
import { revokeApiKey } from "./api-keys";
import { getAutomation } from "./automations";
import { getCampaign } from "./campaigns";
import { deleteList } from "./lists";
import { apiDeleteSubscriber, apiGetSubscriber, apiUpdateSubscriber } from "./rest-api";
import { deleteSegment, getSegment } from "./segments";
import { getSubscriberProfile } from "./subscriber-profile";
import { deleteTemplate, getTemplate } from "./templates";
import { deleteWebhookEndpoint } from "./webhooks";

// Workspace isolation (D79): every query that takes an id also takes the
// workspace, and an id from another workspace finds nothing and changes
// nothing. Workspace A asks for workspace B's things here.

const sql = getSql();
const run = Date.now().toString(36);
let a: string;
let b: string;
const of: Record<string, string> = {};

beforeAll(async () => {
  const made = await sql<{ id: string }[]>`
    insert into workspaces (name, slug)
    values ('A', ${`int-iso-a-${run}`}), ('B', ${`int-iso-b-${run}`}) returning id`;
  [a, b] = [made[0]!.id, made[1]!.id];
  const one = async (query: Promise<{ id: string }[]>) => (await query)[0]!.id;
  of.list = await one(
    sql`insert into lists (workspace_id, name) values (${b}, 'B list') returning id`,
  );
  of.subscriber = await one(sql`
    insert into subscribers (workspace_id, email) values (${b}, ${`b-${run}@example.com`}) returning id`);
  of.campaign = await one(sql`
    insert into campaigns (workspace_id, name, subject, from_name, from_local, html, text)
    values (${b}, 'B', 'B', 'B', 'b', 'x', 'x') returning id`);
  of.template = await one(sql`
    insert into templates (workspace_id, name, html, text) values (${b}, 'B', 'x', 'x') returning id`);
  of.segment = await one(sql`
    insert into segments (workspace_id, name, rules)
    values (${b}, 'B', ${JSON.stringify({ match: "all", conditions: [] })}::text::jsonb) returning id`);
  of.automation = await one(sql`
    insert into automations (workspace_id, name, trigger, graph)
    values (${b}, 'B', ${JSON.stringify({ type: "api_event", event: "x" })}::text::jsonb,
            ${JSON.stringify({ nodes: [], edges: [] })}::text::jsonb) returning id`);
  of.apiKey = await one(sql`
    insert into api_keys (workspace_id, name, hint, key_hash)
    values (${b}, 'B', 'sc_live_x', ${`hash-${run}`}) returning id`);
  of.endpoint = await one(sql`
    insert into webhook_endpoints (workspace_id, url, events)
    values (${b}, 'https://b.example/hook', ${["conversion.created"]}) returning id`);
});

afterAll(async () => {
  await sql`delete from workspaces where id in (${a}, ${b})`;
});

describe("workspace isolation", () => {
  it("finds nothing of another workspace's", async () => {
    expect(await getCampaign(a, of.campaign!)).toBeNull();
    expect(await getTemplate(a, of.template!)).toBeNull();
    expect(await getSegment(a, of.segment!)).toBeNull();
    expect(await getAutomation(a, of.automation!)).toBeNull();
    expect(await getSubscriberProfile(a, of.subscriber!)).toBeNull();
    expect(await apiGetSubscriber(a, of.subscriber!)).toBeNull();
    expect(await apiGetSubscriber(a, `b-${run}@example.com`)).toBeNull();
  });

  it("changes nothing of another workspace's", async () => {
    expect(await deleteList(a, of.list!)).toBe(false);
    expect(await deleteSegment(a, of.segment!)).toBe(false);
    expect(await deleteTemplate(a, of.template!)).toBeFalsy();
    expect(await apiUpdateSubscriber(a, of.subscriber!, { firstName: "Mallory" })).toBe(false);
    expect(await apiDeleteSubscriber(a, of.subscriber!)).toBe(false);
    expect(await revokeApiKey(a, of.apiKey!)).toBe(false);
    expect(await deleteWebhookEndpoint(a, of.endpoint!)).toBe(false);

    const [left] = await sql<{ lists: number; subs: number; keys: number; hooks: number }[]>`
      select (select count(*)::int from lists where workspace_id = ${b}) as lists,
             (select count(*)::int from subscribers where workspace_id = ${b} and first_name is null) as subs,
             (select count(*)::int from api_keys where workspace_id = ${b} and revoked_at is null) as keys,
             (select count(*)::int from webhook_endpoints where workspace_id = ${b}) as hooks`;
    expect(left).toEqual({ lists: 1, subs: 1, keys: 1, hooks: 1 });
  });
});
