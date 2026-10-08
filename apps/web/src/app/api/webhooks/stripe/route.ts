import type Stripe from "stripe";
import { getStripe, syncInvoice, syncSubscription } from "@/lib/stripe";

// Stripe posts subscription changes here (Developers > Webhooks, with the
// events below). Each event is signed with STRIPE_WEBHOOK_SECRET. The
// subscription is read back from Stripe, so a late or repeated event can't
// undo a newer change.

const SUBSCRIPTION_EVENTS = new Set<string>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response("Billing is off", { status: 404 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      request.headers.get("stripe-signature") ?? "",
      secret,
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  let subscriptionId: string | null = null;
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.mode === "subscription" && session.subscription) {
      subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    }
  } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
    subscriptionId = (event.data.object as Stripe.Subscription).id;
  }
  // Invoices: read back too, so the newest state wins.
  if (event.type.startsWith("invoice.")) {
    const id = (event.data.object as Stripe.Invoice).id;
    if (id) await syncInvoice(await stripe.invoices.retrieve(id));
  }
  if (subscriptionId) {
    await syncSubscription(await stripe.subscriptions.retrieve(subscriptionId));
  }
  return Response.json({ received: true });
}
