import {
  accountForStripeCustomer,
  getPlanByStripePrice,
  getPlanByKey,
  setAccountPlan,
} from "@sendcoop/db";
import Stripe from "stripe";

// Stripe billing (D72). Checkout starts a subscription, the customer portal
// changes cards and cancels, and webhooks keep subscriptions in step. Without
// STRIPE_SECRET_KEY billing is off: everyone stays on their plan.
// STRIPE_API_BASE points the client elsewhere (the e2e tests' fake Stripe).

let client: Stripe | null | undefined;

export function getStripe() {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return (client = null);
  const base = process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;
  client = new Stripe(key, {
    maxNetworkRetries: 2,
    ...(base && {
      host: base.hostname,
      port: base.port,
      protocol: base.protocol === "http:" ? "http" : "https",
    }),
  });
  return client;
}

type Status = "active" | "trialing" | "past_due" | "canceled";

/** Stripe's subscription status as ours; null while the first payment is pending. */
export function subscriptionStatus(status: Stripe.Subscription.Status): Status | null {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
      return status as Status;
    case "unpaid":
      return "past_due";
    case "incomplete":
      return null;
    default: // canceled, incomplete_expired, paused
      return "canceled";
  }
}

const customerId = (sub: Stripe.Subscription) =>
  typeof sub.customer === "string" ? sub.customer : sub.customer.id;

/**
 * Brings an account's plan in line with a Stripe subscription (as Stripe has
 * it now, so events arriving out of order don't matter). Returns the account,
 * or null when the subscription isn't one of ours.
 */
export async function syncSubscription(sub: Stripe.Subscription) {
  const userId =
    (await accountForStripeCustomer(customerId(sub))) ?? sub.metadata?.sendcoop_user_id ?? null;
  if (!userId) return null;
  const status = subscriptionStatus(sub.status);
  if (!status) return userId;
  const item = sub.items.data[0];
  const plan = item ? await getPlanByStripePrice(item.price.id) : null;
  const ended = status === "canceled";
  await setAccountPlan(userId, (plan ?? (await getPlanByKey("free"))!).id, {
    status: plan ? status : "canceled",
    stripeCustomerId: customerId(sub),
    stripeSubscriptionId: ended ? null : sub.id,
    currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
    cancelAtPeriodEnd: !ended && sub.cancel_at_period_end,
  });
  return userId;
}
