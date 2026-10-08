import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "../client";
import { EMPTY_AUDIENCE } from "../schema";
import { audienceQuality, enforceAccountHealth, recentlySendingAccounts } from "./abuse";
import { sendQuotaProblem, workspaceQuota } from "./quotas";

const sql = getSql();
const run = Date.now().toString(36);
let userId: string;
let ws: string;
let listId: string;
let campaignId: string;

beforeAll(async () => {
  const [u] = await sql<{ id: string }[]>`
    insert into users (name, email) values ('Abuse owner', ${`abuse-${run}@example.com`}) returning id`;
  userId = u!.id;
  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Abuse', ${`int-abuse-${run}`}) returning id`;
  ws = w!.id;
  await sql`insert into memberships (workspace_id, user_id, role) values (${ws}, ${userId}, 'owner')`;
  const [l] = await sql<{ id: string }[]>`
    insert into lists (workspace_id, name) values (${ws}, 'Bought') returning id`;
  listId = l!.id;
  await sql`
    with made as (
      insert into subscribers (workspace_id, email, status)
      values (${ws}, 'info@a.example', 'subscribed'), (${ws}, 'sales@b.example', 'subscribed'),
             (${ws}, 'x@mailinator.com', 'subscribed'), (${ws}, 'robin@example.com', 'subscribed')
      returning id)
    insert into list_memberships (list_id, subscriber_id) select ${listId}, id from made`;
  const [c] = await sql<{ id: string }[]>`
    insert into campaigns (workspace_id, name, subject, from_name, from_local, html, text, status)
    values (${ws}, 'Blast', 'Hi', 'Acme', 'news', 'x', 'x', 'sending') returning id`;
  campaignId = c!.id;
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
  await sql`delete from users where id = ${userId}`;
});

describe("abuse protection", () => {
  it("counts role and throwaway addresses in an audience", async () => {
    expect(await audienceQuality(ws, { ...EMPTY_AUDIENCE, lists: [listId] })).toEqual({
      total: 4,
      role: 2,
      disposable: 1,
    });
  });

  it("caps a new account's day, unless it's trusted", async () => {
    // On a plan with room for the month: only the warm-up applies.
    await sql`
      insert into subscriptions (user_id, plan_id, status)
      select ${userId}, id, 'active' from plans where key = 'pro'`;
    const quota = await workspaceQuota(ws);
    expect(quota.warmup?.perDay).toBe(1_000);
    expect(sendQuotaProblem(quota, 1_000)).toBeNull();
    expect(sendQuotaProblem(quota, 1_001)).toMatch(/New accounts send up to 1,000 emails a day/);
    await sql`
      update subscriptions set overrides = ${JSON.stringify({ trusted: true })}::text::jsonb
      where user_id = ${userId}`;
    expect((await workspaceQuota(ws)).warmup).toBeNull();
  });

  it("leaves an account with few complaints alone", async () => {
    await sql`
      insert into messages (workspace_id, campaign_id, email, status, sent_at, complained_at)
      select ${ws}, ${campaignId}, 'r' || g || '@example.com', 'sent', now(),
             case when g <= 2 then now() end
      from generate_series(1, 600) g`;
    expect(await enforceAccountHealth(userId)).toBeNull();
    expect(await recentlySendingAccounts()).toContain(userId);
  });

  it("suspends an account whose emails draw too many complaints", async () => {
    await sql`update messages set complained_at = now()
              where campaign_id = ${campaignId} and email in ('r3@example.com', 'r4@example.com')`;
    // 4 in 600 is 0.67%, over the 0.5% limit.
    expect(await enforceAccountHealth(userId)).toMatch(
      /0\.67% of last week's emails were marked as spam/,
    );
    const [user] = await sql<{ banned: boolean }[]>`select banned from users where id = ${userId}`;
    expect(user!.banned).toBe(true);
    const [campaign] = await sql<
      { status: string }[]
    >`select status from campaigns where id = ${campaignId}`;
    expect(campaign!.status).toBe("paused");
    expect(await enforceAccountHealth(userId)).toBeNull(); // once
  });
});
