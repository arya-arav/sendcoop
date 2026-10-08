import { inArray, sql } from "drizzle-orm";
import { getDb } from "../client";
import { workspaces } from "../schema";

// Customers in the super-admin area: a filtered, paged list with its
// stats, and one customer's whole picture (the 360° overview).

export const CUSTOMER_SORTS = {
  newest: sql`u.created_at desc`,
  oldest: sql`u.created_at asc`,
  subscribers: sql`subscribers desc, u.created_at desc`,
  sends: sql`sends desc, u.created_at desc`,
} as const;
export type CustomerSort = keyof typeof CUSTOMER_SORTS;

export type CustomerFilter = {
  q?: string;
  status?: "active" | "suspended" | "unverified" | null;
  /** A plan key; "free" includes accounts without a live subscription. */
  plan?: string | null;
  sort?: CustomerSort;
  page?: number;
  pageSize?: number;
};

const like = (q: string) => `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Accounts (super-admins excluded), with what they're on and use. */
export async function listCustomersPage(filter: CustomerFilter = {}) {
  const pageSize = Math.min(100, filter.pageSize ?? 25);
  const page = Math.max(1, filter.page ?? 1);
  const q = filter.q?.trim() ?? "";
  const where = sql.join(
    [
      sql`coalesce(u.role, '') <> 'admin'`,
      q ? sql`(u.email ilike ${like(q)} or u.name ilike ${like(q)})` : null,
      filter.status === "suspended" ? sql`u.banned` : null,
      filter.status === "active" ? sql`not u.banned and u.email_verified` : null,
      filter.status === "unverified" ? sql`not u.email_verified` : null,
      filter.plan === "free"
        ? sql`(s.user_id is null or s.status = 'canceled' or p.key = 'free')`
        : filter.plan
          ? sql`(p.key = ${filter.plan} and s.status <> 'canceled')`
          : null,
    ].filter((c) => c !== null),
    sql` and `,
  );
  const db = getDb();
  const rows = await db.execute<{
    id: string;
    name: string;
    email: string;
    banned: boolean;
    email_verified: boolean;
    created_at: Date;
    plan: string | null;
    status: string | null;
    workspaces: number;
    subscribers: number;
    sends: number;
    total: number;
  }>(sql`
    with owned as (select user_id, workspace_id from memberships where role like '%owner%')
    select u.id, u.name, u.email, u.banned, u.email_verified, u.created_at,
           case when s.status is null or s.status = 'canceled' then null else p.name end as plan,
           s.status,
           (select count(*)::int from owned o where o.user_id = u.id) as workspaces,
           (select count(*)::int from subscribers sb
             where sb.workspace_id in (select workspace_id from owned o where o.user_id = u.id)
               and sb.status in ('subscribed', 'pending')) as subscribers,
           (select count(*)::int from messages m
             where m.workspace_id in (select workspace_id from owned o where o.user_id = u.id)
               and m.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
               and m.status in ('queued', 'sending', 'sent', 'held')) as sends,
           count(*) over ()::int as total
    from users u
    left join subscriptions s on s.user_id = u.id
    left join plans p on p.id = s.plan_id
    where ${where}
    order by ${CUSTOMER_SORTS[filter.sort ?? "newest"] ?? CUSTOMER_SORTS.newest}
    limit ${pageSize} offset ${(page - 1) * pageSize}`);
  const [free] = await db.execute<{ name: string }>(sql`select name from plans where key = 'free'`);
  return {
    total: rows[0]?.total ?? 0,
    page,
    pageSize,
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      banned: r.banned,
      emailVerified: r.email_verified,
      createdAt: new Date(r.created_at),
      plan: r.plan ?? free?.name ?? "Free",
      subscriptionStatus: r.status === "canceled" ? null : r.status,
      workspaces: r.workspaces,
      subscribers: r.subscribers,
      sendsThisMonth: r.sends,
    })),
  };
}

export async function customerStats() {
  const [row] = await getDb().execute<{
    total: number;
    active: number;
    suspended: number;
    unverified: number;
    new_month: number;
  }>(sql`
    select count(*)::int as total,
           count(*) filter (where not banned and email_verified)::int as active,
           count(*) filter (where banned)::int as suspended,
           count(*) filter (where not email_verified)::int as unverified,
           count(*) filter (where created_at >= date_trunc('month', now()))::int as new_month
    from users where coalesce(role, '') <> 'admin'`);
  return {
    total: row!.total,
    active: row!.active,
    suspended: row!.suspended,
    unverified: row!.unverified,
    newThisMonth: row!.new_month,
  };
}

/** One customer's 360° view: usage, performance, workspaces, campaigns, sessions. */
export async function customerOverview(userId: string) {
  const db = getDb();
  const owned = sql`(select workspace_id from memberships where user_id = ${userId} and role like '%owner%')`;
  const [kpis] = await db.execute<{
    subscribers: number;
    lists: number;
    campaigns: number;
    automations: number;
    revenue: number;
    sent: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
  }>(sql`
    select
      (select count(*)::int from subscribers where workspace_id in ${owned} and status in ('subscribed', 'pending')) as subscribers,
      (select count(*)::int from lists where workspace_id in ${owned}) as lists,
      (select count(*)::int from campaigns where workspace_id in ${owned} and kind = 'broadcast') as campaigns,
      (select count(*)::int from automations where workspace_id in ${owned}) as automations,
      (select coalesce(sum(value), 0)::float8 from conversions
        where workspace_id in ${owned} and status = 'approved' and created_at >= now() - interval '30 days') as revenue,
      m.sent, m.opened, m.clicked, m.bounced, m.complained
    from (
      select count(*)::int as sent,
             count(*) filter (where opened_at is not null)::int as opened,
             count(*) filter (where clicked_at is not null)::int as clicked,
             count(*) filter (where bounce_type = 'hard')::int as bounced,
             count(*) filter (where complained_at is not null)::int as complained
      from messages
      where workspace_id in ${owned} and status = 'sent' and sent_at >= now() - interval '30 days'
    ) m`);
  const sendsPerDay = await db.execute<{ day: string; value: number }>(sql`
    with days as (
      select generate_series((now() at time zone 'utc')::date - 29, (now() at time zone 'utc')::date, '1 day')::date as day
    ), counted as (
      select (sent_at at time zone 'utc')::date as day, count(*)::int as value
      from messages
      where workspace_id in ${owned} and status = 'sent' and sent_at >= now() - interval '31 days'
      group by 1
    )
    select to_char(days.day, 'YYYY-MM-DD') as day, coalesce(counted.value, 0)::int as value
    from days left join counted using (day) order by days.day`);
  const workspaces = await db.execute<{
    id: string;
    name: string;
    slug: string;
    role: string;
    members: number;
    subscribers: number;
    created_at: Date;
  }>(sql`
    select w.id, w.name, w.slug, m.role, w.created_at,
           (select count(*)::int from memberships x where x.workspace_id = w.id) as members,
           (select count(*)::int from subscribers s where s.workspace_id = w.id and s.status in ('subscribed', 'pending')) as subscribers
    from memberships m join workspaces w on w.id = m.workspace_id
    where m.user_id = ${userId}
    order by m.created_at`);
  const campaigns = await db.execute<{
    id: string;
    name: string;
    workspace: string;
    status: string;
    sent: number;
    opened: number;
    clicked: number;
    updated_at: Date;
  }>(sql`
    select c.id, c.name, w.name as workspace, c.status, c.sent_count as sent, c.updated_at,
           (select count(*)::int from messages m where m.campaign_id = c.id and m.opened_at is not null) as opened,
           (select count(*)::int from messages m where m.campaign_id = c.id and m.clicked_at is not null) as clicked
    from campaigns c join workspaces w on w.id = c.workspace_id
    where c.workspace_id in ${owned} and c.kind = 'broadcast'
    order by c.updated_at desc limit 8`);
  const sessions = await db.execute<{
    created_at: Date;
    ip_address: string | null;
    user_agent: string | null;
    impersonated_by: string | null;
  }>(sql`
    select created_at, ip_address, user_agent, impersonated_by from sessions
    where user_id = ${userId} order by created_at desc limit 5`);

  const k = kpis!;
  const rate = (n: number) => (k.sent > 0 ? n / k.sent : 0);
  return {
    kpis: {
      subscribers: k.subscribers,
      lists: k.lists,
      campaigns: k.campaigns,
      automations: k.automations,
      revenue30: k.revenue,
    },
    performance: {
      sent: k.sent,
      openRate: rate(k.opened),
      clickRate: rate(k.clicked),
      bounceRate: rate(k.bounced),
      complaintRate: rate(k.complained),
    },
    sendsPerDay: sendsPerDay.map((d) => ({ day: d.day, value: Number(d.value) })),
    workspaces: workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      role: w.role,
      members: w.members,
      subscribers: w.subscribers,
      createdAt: new Date(w.created_at),
    })),
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      workspace: c.workspace,
      status: c.status,
      sent: c.sent,
      opened: c.opened,
      clicked: c.clicked,
      updatedAt: new Date(c.updated_at),
    })),
    sessions: sessions.map((s) => ({
      createdAt: new Date(s.created_at),
      ip: s.ip_address,
      userAgent: s.user_agent,
      impersonated: Boolean(s.impersonated_by),
    })),
  };
}

/** Workspaces the customer is the only owner of: deleted with the account. */
export async function soleOwnedWorkspaces(userId: string) {
  return getDb().execute<{ id: string; name: string }>(sql`
    select w.id, w.name from workspaces w
    join memberships m on m.workspace_id = w.id and m.user_id = ${userId} and m.role like '%owner%'
    where not exists (
      select 1 from memberships o
      where o.workspace_id = w.id and o.user_id <> ${userId} and o.role like '%owner%')`);
}

export async function deleteWorkspaces(ids: string[]) {
  if (ids.length === 0) return;
  await getDb().delete(workspaces).where(inArray(workspaces.id, ids));
}
