import { sql } from "drizzle-orm";
import { getDb } from "../client";
import type { PlanLimits } from "../plans";
import { WARMUP_STEPS, warmupLimit } from "../abuse";
import { effectiveLimits, type PlanFeatures } from "../plans";
import { getAccountPlan, workspaceOwnerId } from "./billing";

// Quotas (D73): what an account has used of its plan's limits, across every
// workspace it owns. Subscribers count while they can be emailed (subscribed
// or pending); emails count from when they're queued, so two campaigns
// prepared at once can't both use the same room. A workspace without an
// owner (made directly in the database, as tests do) has no limits.

export type Usage = { subscribers: number; sendsPerMonth: number; workspaces: number };

const ownedWorkspaces = (userId: string) => sql`
  select workspace_id from memberships where user_id = ${userId} and role like '%owner%'`;

export async function accountUsage(userId: string): Promise<Usage> {
  const [row] = await getDb().execute<{
    subscribers: number;
    sends: number;
    workspaces: number;
  }>(sql`
    select
      (select count(*)::int from subscribers
        where workspace_id in (${ownedWorkspaces(userId)}) and status in ('subscribed', 'pending')) as subscribers,
      (select count(*)::int from messages
        where workspace_id in (${ownedWorkspaces(userId)})
          and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
          and status in ('queued', 'sending', 'sent', 'held')) as sends,
      (select count(*)::int from (${ownedWorkspaces(userId)}) w) as workspaces`);
  return { subscribers: row!.subscribers, sendsPerMonth: row!.sends, workspaces: row!.workspaces };
}

/** When this month's email allowance starts again: the 1st of next month, UTC. */
export function nextMonthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export type Quota = {
  ownerId: string | null;
  /** The account is suspended (D75): nothing may be sent. */
  suspended: boolean;
  planName: string;
  limits: PlanLimits;
  usage: Usage;
  /** How many more of each the account may have; Infinity when unlimited. */
  room: Record<keyof Usage, number>;
  /** A new account's daily cap (D76), until it's two weeks old or trusted. */
  warmup: { perDay: number; sentToday: number; room: number; risesAt: Date } | null;
};

const room = (limit: number | null, used: number) =>
  limit === null ? Infinity : Math.max(0, limit - used);

export async function accountQuota(userId: string): Promise<Quota> {
  const [plan, usage, [owner]] = await Promise.all([
    getAccountPlan(userId),
    accountUsage(userId),
    getDb().execute<{
      banned: boolean;
      created_at: Date;
      trusted: boolean | null;
      admin: boolean;
    }>(sql`
      select u.banned, u.created_at, (s.overrides ->> 'trusted')::boolean as trusted,
             coalesce(u.role, '') = 'admin' as admin
      from users u left join subscriptions s on s.user_id = u.id
      where u.id = ${userId}`),
  ]);
  const suspended = Boolean(owner?.banned);
  // Super-admins run the platform: no warm-up for them.
  const step =
    owner && !owner.trusted && !owner.admin ? warmupLimit(new Date(owner.created_at)) : null;
  const warmup = step
    ? await (async () => {
        const sentToday = await sendsInLastDay(userId);
        return { ...step, sentToday, room: Math.max(0, step.perDay - sentToday) };
      })()
    : null;
  if (suspended) {
    return {
      ownerId: userId,
      suspended,
      planName: plan.plan.name,
      limits: plan.limits,
      usage,
      room: { subscribers: 0, sendsPerMonth: 0, workspaces: 0 },
      warmup,
    };
  }
  return {
    ownerId: userId,
    suspended,
    planName: plan.plan.name,
    limits: plan.limits,
    usage,
    room: {
      subscribers: room(plan.limits.subscribers, usage.subscribers),
      sendsPerMonth: room(plan.limits.sendsPerMonth, usage.sendsPerMonth),
      workspaces: room(plan.limits.workspaces, usage.workspaces),
    },
    warmup,
  };
}

/** Emails queued in the last 24 hours, for the warm-up's daily cap. */
async function sendsInLastDay(userId: string) {
  const [row] = await getDb().execute<{ n: number }>(sql`
    select count(*)::int as n from messages
    where workspace_id in (${ownedWorkspaces(userId)})
      and created_at >= now() - interval '1 day'
      and status in ('queued', 'sending', 'sent', 'held')`);
  return row?.n ?? 0;
}

const UNLIMITED: PlanLimits = effectiveLimits({});

export async function workspaceQuota(workspaceId: string): Promise<Quota> {
  const owner = await workspaceOwnerId(workspaceId);
  if (owner) return accountQuota(owner);
  return {
    ownerId: null,
    suspended: false,
    planName: "",
    limits: UNLIMITED,
    usage: { subscribers: 0, sendsPerMonth: 0, workspaces: 0 },
    room: { subscribers: Infinity, sendsPerMonth: Infinity, workspaces: Infinity },
    warmup: null,
  };
}

const SUSPENDED = "This account is suspended, so nothing can be sent or added.";

/** Why `count` more emails can't go out this month, or null when they can. */
export function sendQuotaProblem(quota: Quota, count: number) {
  if (quota.suspended) return SUSPENDED;
  const warmup = quota.warmup;
  if (count <= quota.room.sendsPerMonth) {
    if (!warmup || count <= warmup.room) return null;
    const rises = warmup.risesAt.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
    return (
      `New accounts send up to ${WARMUP_STEPS[0].perDay.toLocaleString("en")} emails a day at first, rising over two weeks. ` +
      `Yours can send ${warmup.room.toLocaleString("en")} more today (of ${warmup.perDay.toLocaleString("en")}); ` +
      `this would send ${count.toLocaleString("en")}. The limit rises on ${rises}; send to part of the list now, or contact us to go faster.`
    );
  }
  const limit = quota.limits.sendsPerMonth!;
  const resets = nextMonthStart().toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  return (
    `This would send ${count.toLocaleString("en")} emails, but your ${quota.planName} plan has ` +
    `${quota.room.sendsPerMonth.toLocaleString("en")} of its ${limit.toLocaleString("en")} a month left. ` +
    `Upgrade your plan, or send on ${resets} when the allowance starts again.`
  );
}

/** Why `count` more subscribers can't be added, or null when they can. */
export function subscriberQuotaProblem(quota: Quota, count = 1) {
  if (quota.suspended) return SUSPENDED;
  if (count <= quota.room.subscribers) return null;
  return (
    `Your ${quota.planName} plan allows ${quota.limits.subscribers!.toLocaleString("en")} ` +
    `subscribers, and you have ${quota.usage.subscribers.toLocaleString("en")}. ` +
    `Upgrade your plan to add more.`
  );
}

/** Plan limits that count things the account has made (the plans editor). */
export type CountedLimit =
  "lists" | "automations" | "forms" | "segments" | "sendingDomains" | "sendingServers";

const COUNTED: Record<CountedLimit, { table: string; where?: string; noun: [string, string] }> = {
  lists: { table: "lists", noun: ["list", "lists"] },
  automations: {
    table: "automations",
    where: "status = 'active'",
    noun: ["live automation", "live automations"],
  },
  forms: { table: "signup_forms", noun: ["signup form", "signup forms"] },
  segments: { table: "segments", noun: ["segment", "segments"] },
  sendingDomains: { table: "sending_domains", noun: ["sending domain", "sending domains"] },
  sendingServers: { table: "sending_servers", noun: ["sending server", "sending servers"] },
};

/**
 * Why the account behind a workspace can't have `adding` more of something,
 * or null when it can (or the workspace has no owner, as in tests).
 */
export async function limitProblem(workspaceId: string, key: CountedLimit, adding = 1) {
  const owner = await workspaceOwnerId(workspaceId);
  if (!owner) return null;
  const plan = await getAccountPlan(owner);
  const limit = plan.limits[key];
  if (limit === null) return null;
  const { table, where, noun } = COUNTED[key];
  const [row] = await getDb().execute<{ n: number }>(sql`
    select count(*)::int as n from ${sql.raw(table)}
    where workspace_id in (${ownedWorkspaces(owner)}) ${where ? sql.raw(`and ${where}`) : sql``}`);
  const used = row?.n ?? 0;
  if (used + adding <= limit) return null;
  return (
    `Your ${plan.plan.name} plan allows ${limit.toLocaleString("en")} ${noun[limit === 1 ? 0 : 1]}, ` +
    `and you have ${used.toLocaleString("en")}. Upgrade your plan in Settings > Billing for more.`
  );
}

const FEATURE_NAMES: Record<keyof PlanFeatures, string> = {
  automations: "Automations",
  abTests: "A/B tests",
  aiAssist: "AI assist",
  utmcap: "The UTMCAP integration",
  api: "The API and webhooks",
  removeBranding: "Removing the Sendcoop footer",
  importContacts: "Importing contacts",
  exportContacts: "Exporting contacts",
  ownSendingServers: "Connecting your own sending servers",
};

/** Why the workspace's plan doesn't allow a feature, or null when it does. */
export async function featureProblem(workspaceId: string, feature: keyof PlanFeatures) {
  const owner = await workspaceOwnerId(workspaceId);
  if (!owner) return null;
  const plan = await getAccountPlan(owner);
  if (plan.features[feature]) return null;
  return `${FEATURE_NAMES[feature]} isn't part of the ${plan.plan.name} plan. Upgrade in Settings > Billing.`;
}

/** The largest file the workspace's plan lets it upload, in bytes (null: no plan limit). */
export async function uploadLimitBytes(workspaceId: string) {
  const owner = await workspaceOwnerId(workspaceId);
  if (!owner) return null;
  const mb = (await getAccountPlan(owner)).limits.uploadMb;
  return mb === null ? null : mb * 1024 * 1024;
}
