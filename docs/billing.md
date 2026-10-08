# Billing with Stripe

Sendcoop bills accounts (the user who owns workspaces) through Stripe
subscriptions. Every workspace an account owns shares its plan.

## Setting it up

1. In Stripe, create a product and a monthly price for each paid plan.
2. In Sendcoop, open **Admin > Plans** and paste each plan's price id
   (`price_…`). Plans without one can't be bought (free, or hidden plans you
   assign by hand).
3. Add a webhook endpoint in Stripe (Developers > Webhooks) at
   `https://<your app>/api/webhooks/stripe`, sending:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (the endpoint's signing
   secret) and restart the app.
5. Turn on the customer portal (Settings > Billing > Customer portal) and allow
   cancelling and updating payment methods.

Without `STRIPE_SECRET_KEY`, billing is off and accounts keep their plan.

## How it behaves

- **Subscribing:** Settings > Billing > Choose opens Stripe Checkout. Back in
  Sendcoop, the plan applies at once (the webhook confirms it too).
- **Switching plans:** a paying account switches straight away, prorated, on
  the same subscription.
- **Cancelling:** in the portal (Manage billing). The plan stays until the
  paid period ends, then the account is on Free.
- **Failed payments:** the subscription is past due and the plan stays while
  Stripe retries. If Stripe ends it, the account is on Free.

Each webhook reads the subscription back from Stripe, so events that arrive
late or twice can't undo a newer change.

## Quotas

A plan's limits apply to the account, across every workspace it owns:

| Limit          | Counts                            | When it's reached                                                                                                                                                                                                          |
| -------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subscribers    | subscribed and pending people     | Adding by hand and importing stop (imports list the people left out in their report). Signup forms and integrations keep collecting, so no lead is lost, but campaigns can't be sent while the account is over.            |
| Emails a month | emails queued since the 1st (UTC) | A campaign that would go over can't be sent or scheduled; the checklist says why. A scheduled campaign is checked again when it starts and fails with the same message. Automation emails are skipped and the run goes on. |
| Workspaces     | workspaces the account owns       | Creating another is refused.                                                                                                                                                                                               |

Usage is shown under Settings > Billing. Super-admins can raise one
account's limits with overrides on its subscription.

## Abuse protection

- **New accounts warm up.** For their first two weeks, accounts send at most
  1,000 emails a day, then 5,000 (from day 1), 20,000 (day 3) and 50,000
  (day 7), counted over the last 24 hours. After day 14 only the plan's
  limits apply. A super-admin can mark an account trusted (Admin > Customers)
  to skip this.
- **List quality.** A campaign to 50 or more people can't be sent when 30% or
  more of them are shared mailboxes (info@, sales@, …) or throwaway inboxes
  (mailinator.com, …): such lists are usually bought or scraped.
- **Automatic suspension.** Every 10 minutes, accounts that sent at least 500
  emails in the last 7 days are checked: 0.5% or more marked as spam, or 8%
  or more hard bounces, suspends the account (its sessions end and its
  sending campaigns pause). One campaign already pauses itself earlier, at
  0.3% complaints or 5% bounces. A super-admin can lift a suspension.
