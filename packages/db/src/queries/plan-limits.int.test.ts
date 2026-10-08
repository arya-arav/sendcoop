import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "../client";
import { featureProblem, limitProblem, uploadLimitBytes } from "./quotas";

// The plans editor's limits and features, as the app checks them.

const sql = getSql();
const run = Date.now().toString(36);
let userId: string;
let ws: string;
let loose: string;

beforeAll(async () => {
  const [u] = await sql<{ id: string }[]>`
    insert into users (name, email) values ('Limits', ${`limits-${run}@example.com`}) returning id`;
  userId = u!.id;
  const made = await sql<{ id: string }[]>`
    insert into workspaces (name, slug)
    values ('Limits', ${`int-limits-${run}`}), ('Loose', ${`int-loose-${run}`}) returning id`;
  [ws, loose] = [made[0]!.id, made[1]!.id];
  await sql`insert into memberships (workspace_id, user_id, role) values (${ws}, ${userId}, 'owner')`;
  await sql`
    insert into subscriptions (user_id, plan_id, status, overrides)
    select ${userId}, id, 'active',
           ${JSON.stringify({
             limits: { lists: 1, uploadMb: 2 },
             features: { abTests: false, importContacts: true },
           })}::text::jsonb
    from plans where key = 'starter'`;
});

afterAll(async () => {
  await sql`delete from workspaces where id in (${ws}, ${loose})`;
  await sql`delete from users where id = ${userId}`;
});

describe("plan limits and features", () => {
  it("allows up to the limit, then explains", async () => {
    expect(await limitProblem(ws, "lists")).toBeNull();
    await sql`insert into lists (workspace_id, name) values (${ws}, 'One')`;
    expect(await limitProblem(ws, "lists")).toMatch(/allows 1 list, and you have 1/);
    // No limit set on segments: unlimited.
    expect(await limitProblem(ws, "segments", 1000)).toBeNull();
  });

  it("checks features and upload size", async () => {
    expect(await featureProblem(ws, "abTests")).toMatch(
      /A\/B tests isn't part of the Starter plan/,
    );
    expect(await featureProblem(ws, "importContacts")).toBeNull();
    expect(await uploadLimitBytes(ws)).toBe(2 * 1024 * 1024);
  });

  it("leaves workspaces without an owner alone", async () => {
    expect(await limitProblem(loose, "lists", 10_000)).toBeNull();
    expect(await featureProblem(loose, "abTests")).toBeNull();
    expect(await uploadLimitBytes(loose)).toBeNull();
  });
});
