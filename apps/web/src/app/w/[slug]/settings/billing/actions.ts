"use server";

import { getPlan, getWorkspacePlan, setStripeCustomer } from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { appUrl } from "@/lib/app-url";
import { getStripe, syncSubscription } from "@/lib/stripe";
import { requireMemberWorkspace } from "@/lib/workspace";

type Result = { ok: true; url?: string; message?: string } | { ok: false; error: string };

/** The billing account behind a workspace, when the signed-in user owns it. */
async function ownerAccount(slug: string) {
  const { user, workspace } = await requireMemberWorkspace(slug);
  const account = await getWorkspacePlan(workspace.id);
  if (account.ownerId !== user.id) return null;
  return { user, account };
}

/** Starts Checkout for a paid plan, or switches an existing subscription to it. */
export async function choosePlanAction(slug: string, planId: string): Promise<Result> {
  const owner = await ownerAccount(slug);
  if (!owner) return { ok: false, error: "Only the workspace's owner can change the plan." };
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Billing isn't set up yet." };
  const plan = await getPlan(planId);
  if (!plan || !plan.public || plan.archived || !plan.stripePriceId) {
    return { ok: false, error: "That plan can't be chosen here." };
  }
  const { user, account } = owner;

  const current = await currentSubscription(account.stripeSubscriptionId);
  if (current) {
    // Already paying: swap the price, prorated, and keep the same subscription.
    const item = current.items.data[0]!;
    const updated = await stripe.subscriptions.update(current.id, {
      items: [{ id: item.id, price: plan.stripePriceId }],
      proration_behavior: "create_prorations",
      cancel_at_period_end: false,
    });
    await syncSubscription(updated);
    revalidatePath(`/w/${slug}/settings/billing`);
    return { ok: true, message: `You're now on ${plan.name}.` };
  }

  let customer = account.stripeCustomerId;
  if (!customer) {
    customer = (
      await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { sendcoop_user_id: user.id },
      })
    ).id;
    await setStripeCustomer(user.id, customer);
  }
  const back = `${appUrl()}/w/${slug}/settings/billing`;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    subscription_data: {
      metadata: { sendcoop_user_id: user.id },
      // The plan's free trial, for an account that has never paid.
      ...(plan.trialDays > 0 &&
        !account.stripeSubscriptionId && { trial_period_days: plan.trialDays }),
    },
    success_url: `${back}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: back,
  });
  if (!session.url) return { ok: false, error: "Stripe didn't return a checkout page." };
  return { ok: true, url: session.url };
}

/** The live Stripe subscription behind an account, if any. */
async function currentSubscription(subscriptionId: string | null) {
  if (!subscriptionId) return null;
  const sub = await getStripe()!.subscriptions.retrieve(subscriptionId);
  return sub.status === "canceled" || sub.status === "incomplete_expired" ? null : sub;
}

/** Opens Stripe's customer portal: cards, invoices, cancelling. */
export async function openPortalAction(slug: string): Promise<Result> {
  const owner = await ownerAccount(slug);
  if (!owner) return { ok: false, error: "Only the workspace's owner can manage billing." };
  const stripe = getStripe();
  if (!stripe || !owner.account.stripeCustomerId) {
    return { ok: false, error: "There's no billing account yet." };
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: owner.account.stripeCustomerId,
    return_url: `${appUrl()}/w/${slug}/settings/billing`,
  });
  return { ok: true, url: session.url };
}
