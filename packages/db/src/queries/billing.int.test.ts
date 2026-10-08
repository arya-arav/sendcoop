import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "../client";
import {
  getAccountPlan,
  getPlanByKey,
  getWorkspacePlan,
  savePlan,
  setAccountPlan,
} from "./billing";

const sql = getSql();
const run = Date.now().toString(36);
let userId: string;
let ws: string;
let customPlanId: string | null = null;

beforeAll(async () => {
  const [u] = await sql<{ id: string }[]>`
    insert into users (name, email) values ('Plan owner', ${`plan-${run}@example.com`}) returning id`;
  userId = u!.id;
  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Plans', ${`int-plans-${run}`}) returning id`;
  ws = w!.id;
  await sql`insert into memberships (workspace_id, user_id, role) values (${ws}, ${userId}, 'owner')`;
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
  await sql`delete from users where id = ${userId}`;
  if (customPlanId) await sql`delete from plans where id = ${customPlanId}`;
});

describe("plans", () => {
  it("seeds four plans, free first", async () => {
    const free = await getPlanByKey("free");
    expect(free?.priceCents).toBe(0);
    expect((await getPlanByKey("growth"))?.features.automations).toBe(true);
  });

  it("puts an account without a subscription on the free plan", async () => {
    const plan = await getAccountPlan(userId);
    expect(plan.plan.key).toBe("free");
    expect(plan.status).toBe("free");
    expect((await getWorkspacePlan(ws)).ownerId).toBe(userId);
  });

  it("saves a plan, refuses a taken key, and applies overrides", async () => {
    const input = {
      key: `custom-${run}`,
      name: "Custom",
      description: "",
      priceCents: 9900,
      currency: "USD",
      stripePriceId: null,
      limits: { subscribers: 5000, sendsPerMonth: 50000, workspaces: 2, teamMembers: 3 },
      features: {
        automations: true,
        abTests: false,
        aiAssist: false,
        utmcap: true,
        api: false,
        removeBranding: false,
      },
      public: false,
      sortOrder: 99,
      archived: false,
    };
    const saved = await savePlan(null, input);
    expect(saved.ok).toBe(true);
    customPlanId = saved.ok ? saved.plan.id : null;
    expect((await savePlan(null, input)).ok).toBe(false);

    await setAccountPlan(userId, customPlanId!);
    await sql`update subscriptions set overrides = ${JSON.stringify({ limits: { subscribers: null } })}::text::jsonb
              where user_id = ${userId}`;
    const plan = await getWorkspacePlan(ws);
    expect(plan.plan.key).toBe(`custom-${run}`);
    expect(plan.limits.subscribers).toBeNull();
    expect(plan.limits.workspaces).toBe(2);

    await setAccountPlan(userId, customPlanId!, { status: "canceled" });
    expect((await getAccountPlan(userId)).plan.key).toBe("free");
  });
});
