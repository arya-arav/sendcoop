import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "../client";
import { effectiveFeatures, effectiveLimits, type PlanFeatures, type PlanLimits } from "../plans";
import { type Plan, plans, subscriptions } from "../schema";

// Plans and who's on which (D71). Stripe keeps subscriptions in step (D72);
// quotas are enforced in D73.

/**
 * Every limit and feature filled in, whatever the stored row has (rows saved
 * before a limit existed, or written by hand): missing ones are unlimited, on.
 */
const complete = (plan: Plan): Plan => ({
  ...plan,
  limits: effectiveLimits(plan.limits),
  features: effectiveFeatures(plan.features),
});

export async function listPlans({ includeHidden = false } = {}) {
  const rows = await getDb()
    .select()
    .from(plans)
    .where(includeHidden ? sql`true` : and(eq(plans.public, true), eq(plans.archived, false)))
    .orderBy(asc(plans.sortOrder), asc(plans.priceCents));
  return rows.map(complete);
}

export async function getPlan(planId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(planId)) return null;
  const [row] = await getDb().select().from(plans).where(eq(plans.id, planId));
  return row ? complete(row) : null;
}

export async function getPlanByKey(key: string) {
  const [row] = await getDb().select().from(plans).where(eq(plans.key, key));
  return row ? complete(row) : null;
}

export type PlanInput = {
  key: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  interval: "month" | "year";
  trialDays: number;
  stripePriceId: string | null;
  limits: PlanLimits;
  features: PlanFeatures;
  public: boolean;
  sortOrder: number;
  archived: boolean;
};

/** Creates or updates a plan (by id); false when the key is taken by another plan. */
export async function savePlan(planId: string | null, input: PlanInput) {
  const db = getDb();
  const [clash] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.key, input.key), planId ? sql`${plans.id} <> ${planId}` : sql`true`));
  if (clash) return { ok: false as const, error: "Another plan has that key." };
  if (planId) {
    const [row] = await db
      .update(plans)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(plans.id, planId))
      .returning();
    return row ? { ok: true as const, plan: row } : { ok: false as const, error: "No such plan." };
  }
  const [row] = await db.insert(plans).values(input).returning();
  return { ok: true as const, plan: row! };
}

export type AccountPlan = {
  plan: Plan;
  status: "active" | "trialing" | "past_due" | "canceled" | "free";
  limits: PlanLimits;
  features: PlanFeatures;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

/** An account's plan, with any overrides; the free plan without a (live) subscription. */
export async function getAccountPlan(userId: string): Promise<AccountPlan> {
  const db = getDb();
  const [sub] = await db
    .select({ subscription: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.userId, userId));
  const live = sub && sub.subscription.status !== "canceled";
  const plan = live ? complete(sub.plan) : (await getPlanByKey("free"))!;
  const overrides = sub?.subscription.overrides ?? null;
  return {
    plan,
    status: live ? sub.subscription.status : "free",
    limits: effectiveLimits(plan.limits, overrides?.limits),
    features: effectiveFeatures(plan.features, overrides?.features),
    currentPeriodEnd: live ? sub.subscription.currentPeriodEnd : null,
    cancelAtPeriodEnd: live ? sub.subscription.cancelAtPeriodEnd : false,
    stripeCustomerId: sub?.subscription.stripeCustomerId ?? null,
    stripeSubscriptionId: live ? sub.subscription.stripeSubscriptionId : null,
  };
}

/** The account a workspace's quotas come from: its owner. */
export async function workspaceOwnerId(workspaceId: string) {
  const [row] = await getDb().execute<{ user_id: string }>(sql`
    select user_id from memberships
    where workspace_id = ${workspaceId} and role like '%owner%'
    order by created_at limit 1`);
  return row?.user_id ?? null;
}

export async function getWorkspacePlan(workspaceId: string) {
  const owner = await workspaceOwnerId(workspaceId);
  if (!owner) {
    const free = (await getPlanByKey("free"))!;
    return {
      plan: free,
      status: "free" as const,
      limits: free.limits,
      features: free.features,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      ownerId: null,
    };
  }
  return { ...(await getAccountPlan(owner)), ownerId: owner };
}

/** Puts an account on a plan (the billing webhook, D72; super-admins, D75). */
export async function setAccountPlan(
  userId: string,
  planId: string,
  fields: Partial<{
    status: "active" | "trialing" | "past_due" | "canceled";
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  }> = {},
) {
  await getDb()
    .insert(subscriptions)
    .values({ userId, planId, status: "active", ...fields })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: { planId, ...fields, updatedAt: new Date() },
    });
}

/** Whether a user runs Sendcoop (role "admin", set in the database only). */
export async function isSuperAdmin(userId: string) {
  const [row] = await getDb().execute<{ yes: boolean }>(sql`
    select role = 'admin' as yes from users where id = ${userId}`);
  return Boolean(row?.yes);
}

export async function getPlanByStripePrice(priceId: string) {
  const [row] = await getDb().select().from(plans).where(eq(plans.stripePriceId, priceId));
  return row ? complete(row) : null;
}

/** The account a Stripe customer belongs to. */
export async function accountForStripeCustomer(customerId: string) {
  const [row] = await getDb()
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId));
  return row?.userId ?? null;
}

/** Remembers an account's Stripe customer, keeping it on its plan (free without a subscription). */
export async function setStripeCustomer(userId: string, customerId: string) {
  const free = (await getPlanByKey("free"))!;
  await getDb()
    .insert(subscriptions)
    .values({ userId, planId: free.id, status: "canceled", stripeCustomerId: customerId })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: { stripeCustomerId: customerId, updatedAt: new Date() },
    });
}
