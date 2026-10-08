import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "../client";
import { importSubscriberBatch } from "./import-batch";
import {
  accountQuota,
  nextMonthStart,
  sendQuotaProblem,
  subscriberQuotaProblem,
  workspaceQuota,
} from "./quotas";

const sql = getSql();
const run = Date.now().toString(36);
let userId: string;
let ws: string;
let other: string;

beforeAll(async () => {
  const [u] = await sql<{ id: string }[]>`
    insert into users (name, email) values ('Quota owner', ${`quota-${run}@example.com`}) returning id`;
  userId = u!.id;
  const made = await sql<{ id: string }[]>`
    insert into workspaces (name, slug)
    values ('Quota A', ${`int-quota-a-${run}`}), ('Quota B', ${`int-quota-b-${run}`}) returning id`;
  [ws, other] = [made[0]!.id, made[1]!.id];
  await sql`insert into memberships (workspace_id, user_id, role)
            values (${ws}, ${userId}, 'owner'), (${other}, ${userId}, 'owner')`;
  // Two plans' worth of limits, small enough to reach.
  await sql`
    insert into subscriptions (user_id, plan_id, status, overrides)
    select ${userId}, id, 'active',
           ${JSON.stringify({ limits: { subscribers: 4, sendsPerMonth: 3 } })}::text::jsonb
    from plans where key = 'free'`;
  await sql`
    insert into subscribers (workspace_id, email, status)
    values (${ws}, ${`a-${run}@example.com`}, 'subscribed'),
           (${other}, ${`b-${run}@example.com`}, 'pending'),
           (${other}, ${`c-${run}@example.com`}, 'unsubscribed')`;
  const [c] = await sql<{ id: string }[]>`
    insert into campaigns (workspace_id, name, subject, from_name, from_local, html, text, status)
    values (${ws}, 'Q', 'Hi', 'Acme', 'news', 'x', 'x', 'sent') returning id`;
  // Two this month (one failed, which doesn't count) and one last month.
  await sql`
    insert into messages (workspace_id, campaign_id, email, status, created_at)
    values (${ws}, ${c!.id}, 'x1@example.com', 'sent', now()),
           (${ws}, ${c!.id}, 'x2@example.com', 'queued', now()),
           (${ws}, ${c!.id}, 'x3@example.com', 'failed', now()),
           (${ws}, ${c!.id}, 'x4@example.com', 'sent', now() - interval '40 days')`;
});

afterAll(async () => {
  await sql`delete from workspaces where id in (${ws}, ${other})`;
  await sql`delete from users where id = ${userId}`;
});

describe("quotas", () => {
  it("counts usage across every workspace the account owns", async () => {
    const quota = await accountQuota(userId);
    expect(quota.usage).toEqual({ subscribers: 2, sendsPerMonth: 2, workspaces: 2 });
    expect(quota.room.sendsPerMonth).toBe(1);
    expect(quota.room.subscribers).toBe(2);
    expect((await workspaceQuota(other)).ownerId).toBe(userId);
  });

  it("explains what's over the limit", async () => {
    const quota = await workspaceQuota(ws);
    expect(sendQuotaProblem(quota, 1)).toBeNull();
    expect(sendQuotaProblem(quota, 2)).toMatch(/has 1 of its 3 a month left/);
    expect(subscriberQuotaProblem(quota, 3)).toMatch(/allows 4 subscribers, and you have 2/);
  });

  it("imports only as many new people as the plan has room for", async () => {
    const row = (email: string) => ({ email, firstName: null, lastName: null, fields: {} });
    const result = await importSubscriberBatch(
      ws,
      [
        row(`a-${run}@example.com`),
        row(`n1-${run}@example.com`),
        row(`n2-${run}@example.com`),
        row(`n3-${run}@example.com`),
      ],
      { listIds: [], updateExisting: false, maxNew: 2 },
    );
    expect(result.created).toBe(2);
    expect(result.unchanged).toBe(1);
    expect(result.overLimit).toEqual([`n3-${run}@example.com`]);
    expect((await accountQuota(userId)).room.subscribers).toBe(0);
  });

  it("lets a suspended account send nothing", async () => {
    await sql`update users set banned = true where id = ${userId}`;
    const quota = await workspaceQuota(ws);
    expect(quota.suspended).toBe(true);
    expect(sendQuotaProblem(quota, 1)).toMatch(/suspended/);
    await sql`update users set banned = false where id = ${userId}`;
    expect(sendQuotaProblem(await workspaceQuota(ws), 1)).toBeNull();
  });

  it("gives unowned workspaces no limits", async () => {
    const [w] = await sql<{ id: string }[]>`
      insert into workspaces (name, slug) values ('Loose', ${`int-quota-c-${run}`}) returning id`;
    expect((await workspaceQuota(w!.id)).room.sendsPerMonth).toBe(Infinity);
    await sql`delete from workspaces where id = ${w!.id}`;
  });

  it("starts the allowance again on the 1st", () => {
    expect(nextMonthStart(new Date("2026-12-15T10:00:00Z")).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });
});
