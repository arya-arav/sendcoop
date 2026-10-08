"use server";

import { getAccountPlan, getPlanByKey, setAccountPlan } from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAdminAction, requireSuperAdmin } from "@/lib/admin";
import { getStripe, syncSubscription } from "@/lib/stripe";

// Super-admin actions on a subscription. Stripe subscriptions change in
// Stripe (its webhook follows); ones set by hand change here.

type Result = { ok: true; message?: string } | { ok: false; error: string };

const userId = z.uuid();

async function stripeSubscription(customerId: string) {
  const account = await getAccountPlan(customerId);
  const stripe = getStripe();
  return account.stripeSubscriptionId && stripe
    ? { stripe, id: account.stripeSubscriptionId, account }
    : { stripe: null, id: null, account };
}

function done(customerId: string, message: string): Result {
  revalidatePath("/admin/subscriptions");
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: true, message };
}

/** Ends at the end of the paid period (or, with resume, keeps renewing). */
export async function setCancelAtPeriodEndAction(
  customerId: string,
  cancel: boolean,
): Promise<Result> {
  await requireSuperAdmin();
  if (!userId.safeParse(customerId).success) return { ok: false, error: "No such customer." };
  const { stripe, id, account } = await stripeSubscription(customerId);
  if (account.status === "free") return { ok: false, error: "They have no subscription." };
  if (stripe && id) {
    await syncSubscription(await stripe.subscriptions.update(id, { cancel_at_period_end: cancel }));
  } else {
    await setAccountPlan(customerId, account.plan.id, { cancelAtPeriodEnd: cancel });
  }
  await logAdminAction(cancel ? "subscription.cancel_at_end" : "subscription.resumed", customerId, {
    plan: account.plan.key,
  });
  return done(customerId, cancel ? "It ends when the paid period does." : "It renews again.");
}

/** Ends it now: the account goes back to the free plan. */
export async function cancelNowAction(customerId: string): Promise<Result> {
  await requireSuperAdmin();
  if (!userId.safeParse(customerId).success) return { ok: false, error: "No such customer." };
  const { stripe, id, account } = await stripeSubscription(customerId);
  if (account.status === "free") return { ok: false, error: "They have no subscription." };
  if (stripe && id) {
    await syncSubscription(await stripe.subscriptions.cancel(id));
  } else {
    const free = (await getPlanByKey("free"))!;
    await setAccountPlan(customerId, free.id, { status: "canceled", cancelAtPeriodEnd: false });
  }
  await logAdminAction("subscription.canceled", customerId, { plan: account.plan.key });
  return done(customerId, "Canceled: they're on the free plan now.");
}
