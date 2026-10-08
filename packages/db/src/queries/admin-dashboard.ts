import { sql } from "drizzle-orm";
import { getDb } from "../client";

// The super-admin dashboard: the whole platform at a glance.

export type AdminDay = { day: string; value: number };

export type AdminDashboard = {
  customers: { total: number; newThisMonth: number; suspended: number };
  subscriptions: { paying: number; mrrCents: number; endingSoon: number };
  sending: {
    sent30: number;
    openRate: number;
    clickRate: number;
    bounceRate: number;
    complaintRate: number;
  };
  sendsPerDay: AdminDay[];
  signupsPerDay: AdminDay[];
  plans: { name: string; accounts: number }[];
  recentCustomers: { id: string; name: string; email: string; plan: string; createdAt: Date }[];
  recentSubscriptions: {
    userId: string;
    email: string;
    plan: string;
    status: string;
    updatedAt: Date;
  }[];
  topWorkspaces: { id: string; name: string; slug: string; sent30: number }[];
  counts: Record<
    "plans" | "workspaces" | "subscribers" | "campaigns" | "automations" | "admins",
    number
  >;
};

/** The last `days` days (UTC), oldest first, with 0 for days that had nothing. */
async function perDay(query: ReturnType<typeof sql>, days: number): Promise<AdminDay[]> {
  const rows = await getDb().execute<{ day: string; value: number }>(sql`
    with days as (
      select generate_series(
        (now() at time zone 'utc')::date - ${days - 1}::int, (now() at time zone 'utc')::date, '1 day'
      )::date as day
    ), counted as (${query})
    select to_char(days.day, 'YYYY-MM-DD') as day, coalesce(counted.value, 0)::int as value
    from days left join counted on counted.day = days.day
    order by days.day`);
  return rows.map((r) => ({ day: r.day, value: Number(r.value) }));
}

export async function adminDashboard(): Promise<AdminDashboard> {
  const db = getDb();
  const [customers] = await db.execute<{ total: number; new_month: number; suspended: number }>(sql`
    select count(*)::int as total,
           count(*) filter (where created_at >= date_trunc('month', now()))::int as new_month,
           count(*) filter (where banned)::int as suspended
    from users where coalesce(role, '') <> 'admin'`);
  const [subs] = await db.execute<{ paying: number; mrr: number; ending: number }>(sql`
    select count(*) filter (where p.price_cents > 0)::int as paying,
           coalesce(sum(p.price_cents) filter (where p.price_cents > 0), 0)::int as mrr,
           count(*) filter (where s.cancel_at_period_end and s.current_period_end < now() + interval '7 days')::int as ending
    from subscriptions s join plans p on p.id = s.plan_id
    where s.status in ('active', 'trialing', 'past_due')`);
  const [sending] = await db.execute<{
    sent: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
  }>(sql`
    select count(*)::int as sent,
           count(*) filter (where opened_at is not null)::int as opened,
           count(*) filter (where clicked_at is not null)::int as clicked,
           count(*) filter (where bounce_type = 'hard')::int as bounced,
           count(*) filter (where complained_at is not null)::int as complained
    from messages where status = 'sent' and sent_at >= now() - interval '30 days'`);
  const rate = (n: number) => (sending!.sent > 0 ? n / sending!.sent : 0);

  const [
    sendsPerDay,
    signupsPerDay,
    plans,
    recentCustomers,
    recentSubscriptions,
    topWorkspaces,
    [counts],
  ] = await Promise.all([
    perDay(
      sql`select (sent_at at time zone 'utc')::date as day, count(*) as value
            from messages where status = 'sent' and sent_at >= now() - interval '31 days' group by 1`,
      30,
    ),
    perDay(
      sql`select (created_at at time zone 'utc')::date as day, count(*) as value
            from users where coalesce(role, '') <> 'admin' and created_at >= now() - interval '31 days' group by 1`,
      30,
    ),
    db.execute<{ name: string; accounts: number }>(sql`
        select p.name, count(u.id)::int as accounts
        from plans p
        left join subscriptions s on s.plan_id = p.id and s.status in ('active', 'trialing', 'past_due')
        left join users u on u.id = s.user_id
        where not p.archived
        group by p.id, p.name, p.sort_order
        order by p.sort_order`),
    db.execute<{
      id: string;
      name: string;
      email: string;
      plan: string | null;
      created_at: Date;
    }>(sql`
        select u.id, u.name, u.email, u.created_at,
               case when s.status in ('active', 'trialing', 'past_due') then p.name end as plan
        from users u
        left join subscriptions s on s.user_id = u.id
        left join plans p on p.id = s.plan_id
        where coalesce(u.role, '') <> 'admin'
        order by u.created_at desc limit 6`),
    db.execute<{
      user_id: string;
      email: string;
      plan: string;
      status: string;
      updated_at: Date;
    }>(sql`
        select s.user_id, u.email, p.name as plan, s.status, s.updated_at
        from subscriptions s join users u on u.id = s.user_id join plans p on p.id = s.plan_id
        where p.price_cents > 0
        order by s.updated_at desc limit 6`),
    db.execute<{ id: string; name: string; slug: string; sent: number }>(sql`
        select w.id, w.name, w.slug, count(*)::int as sent
        from messages m join workspaces w on w.id = m.workspace_id
        where m.status = 'sent' and m.sent_at >= now() - interval '30 days'
        group by w.id order by sent desc limit 5`),
    db.execute<AdminDashboard["counts"]>(sql`
        select (select count(*) from plans where not archived)::int as plans,
               (select count(*) from workspaces)::int as workspaces,
               (select count(*) from subscribers)::int as subscribers,
               (select count(*) from campaigns where kind = 'broadcast')::int as campaigns,
               (select count(*) from automations)::int as automations,
               (select count(*) from users where role = 'admin')::int as admins`),
  ]);
  const free = (
    await db.execute<{ name: string }>(sql`select name from plans where key = 'free'`)
  )[0]?.name;

  return {
    customers: {
      total: customers!.total,
      newThisMonth: customers!.new_month,
      suspended: customers!.suspended,
    },
    subscriptions: { paying: subs!.paying, mrrCents: subs!.mrr, endingSoon: subs!.ending },
    sending: {
      sent30: sending!.sent,
      openRate: rate(sending!.opened),
      clickRate: rate(sending!.clicked),
      bounceRate: rate(sending!.bounced),
      complaintRate: rate(sending!.complained),
    },
    sendsPerDay,
    signupsPerDay,
    plans: [...plans],
    recentCustomers: recentCustomers.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      plan: c.plan ?? free ?? "Free",
      createdAt: new Date(c.created_at),
    })),
    recentSubscriptions: recentSubscriptions.map((s) => ({
      userId: s.user_id,
      email: s.email,
      plan: s.plan,
      status: s.status,
      updatedAt: new Date(s.updated_at),
    })),
    topWorkspaces: topWorkspaces.map((w) => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      sent30: w.sent,
    })),
    counts: counts!,
  };
}
