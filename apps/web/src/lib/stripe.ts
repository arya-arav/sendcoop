import {
  accountForStripeCustomer,
  getPlanByStripePrice,
  getPlanByKey,
  setAccountPlan,
  upsertInvoice,
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

const INVOICE_STATUSES = ["draft", "open", "paid", "uncollectible", "void"] as const;

/** Stores an invoice as Stripe has it now (the admin's Invoices, the customer's billing page). */
export async function syncInvoice(invoice: Stripe.Invoice) {
  if (!invoice.id) return;
  const status = INVOICE_STATUSES.find((s) => s === invoice.status) ?? "open";
  const at = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000) : null);
  await upsertInvoice({
    stripeInvoiceId: invoice.id,
    stripeCustomerId:
      typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? null),
    number: invoice.number ?? null,
    status,
    description: invoice.lines?.data?.[0]?.description ?? invoice.description ?? "",
    amountDueCents: invoice.amount_due ?? 0,
    amountPaidCents: invoice.amount_paid ?? 0,
    currency: (invoice.currency ?? "usd").toUpperCase(),
    attemptCount: invoice.attempt_count ?? 0,
    hostedUrl: invoice.hosted_invoice_url ?? null,
    pdfUrl: invoice.invoice_pdf ?? null,
    periodStart: at(invoice.period_start),
    periodEnd: at(invoice.period_end),
    paidAt: at(invoice.status_transitions?.paid_at),
    createdAt: at(invoice.created) ?? new Date(),
  });
}
