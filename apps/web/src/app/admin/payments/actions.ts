"use server";

import { requireSuperAdmin } from "@/lib/admin";
import { getStripe } from "@/lib/stripe";

/** Checks the secret key works: reads the account's balance. */
export async function testStripeAction(): Promise<
  { ok: true; message: string } | { ok: false; error: string }
> {
  await requireSuperAdmin();
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "STRIPE_SECRET_KEY isn't set." };
  try {
    const balance = await stripe.balance.retrieve();
    return {
      ok: true,
      message: `Connected (${balance.livemode ? "live" : "test"} mode).`,
    };
  } catch (error) {
    return {
      ok: false,
      error: `Stripe refused: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}
