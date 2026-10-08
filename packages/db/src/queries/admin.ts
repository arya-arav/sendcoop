import { sql } from "drizzle-orm";
import { getDb } from "../client";
import type { PlanFeatures, PlanLimits } from "../plans";
import { subscriptions } from "../schema";
import { getPlanByKey } from "./billing";

// The super-admin's view of customers (D75): accounts, what they're on and
// what they use. Suspending and impersonating go through Better Auth's admin
// plugin; plan changes and overrides are written here.

export type CustomerRow = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean;
  createdAt: Date;
  plan: string;
  workspaces: number;
  subscribers: number;
  sendsThisMonth: number;
};

/** Newest accounts first, matching an email or name. */
export async function listCustomers({ q = "", limit = 50 }: { q?: string; limit?: number } = {}) {
  const like = `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await getDb().execute<{
    id: string;
    name: string;
    email: string;
    role: string | null;
    banned: boolean;
    created_at: Date;
    plan: string | null;
    workspaces: number;
    subscribers: number;
    sends: number;
  }>(sql`
    with owned as (
      select user_id, workspace_id from memberships where role like '%owner%'
    )
    select u.id, u.name, u.email, u.role, u.banned, u.created_at,
           case when s.status is null or s.status = 'canceled' then null else p.name end as plan,
           (select count(*)::int from owned o where o.user_id = u.id) as workspaces,
           (select count(*)::int from subscribers sb
             where sb.workspace_id in (select workspace_id from owned o where o.user_id = u.id)
               and sb.status in ('subscribed', 'pending')) as subscribers,
           (select count(*)::int from messages m
             where m.workspace_id in (select workspace_id from owned o where o.user_id = u.id)
               and m.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
               and m.status in ('queued', 'sent', 'held')) as sends
    from users u
    left join subscriptions s on s.user_id = u.id
    left join plans p on p.id = s.plan_id
    where ${q.trim() === "" ? sql`true` : sql`(u.email ilike ${like} or u.name ilike ${like})`}
    order by u.created_at desc
    limit ${limit}`);
  const free = (await getPlanByKey("free"))!.name;
  return rows.map((r): CustomerRow => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    banned: r.banned,
    createdAt: new Date(r.created_at),
    plan: r.plan ?? free,
    workspaces: r.workspaces,
    subscribers: r.subscribers,
    sendsThisMonth: r.sends,
  }));
}

export async function getCustomer(userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const db = getDb();
  const [user] = await db.execute<{
    id: string;
    name: string;
    email: string;
    role: string | null;
    banned: boolean;
    ban_reason: string | null;
    created_at: Date;
  }>(
    sql`select id, name, email, role, banned, ban_reason, created_at from users where id = ${userId}`,
  );
  if (!user) return null;
  const workspaces = await db.execute<{ id: string; name: string; slug: string; role: string }>(sql`
    select w.id, w.name, w.slug, m.role from memberships m
    join workspaces w on w.id = m.workspace_id
    where m.user_id = ${userId} order by m.created_at`);
  const [sub] = await db.execute<{
    overrides: { limits?: Partial<PlanLimits>; features?: Partial<PlanFeatures> } | null;
  }>(sql`select overrides from subscriptions where user_id = ${userId}`);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    banned: user.banned,
    banReason: user.ban_reason,
    createdAt: new Date(user.created_at),
    workspaces: [...workspaces],
    overrides: sub?.overrides ?? null,
  };
}

/** Limits that beat the plan's for one account; null clears them. */
export async function setAccountOverrides(
  userId: string,
  overrides: { limits?: Partial<PlanLimits>; features?: Partial<PlanFeatures> } | null,
) {
  const free = (await getPlanByKey("free"))!;
  await getDb()
    .insert(subscriptions)
    .values({ userId, planId: free.id, status: "canceled", overrides })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: { overrides, updatedAt: new Date() },
    });
}
