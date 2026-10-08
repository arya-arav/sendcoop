import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../client";
import { type Invoice, invoices } from "../schema";
import { accountForStripeCustomer } from "./billing";

// Subscriptions and invoices for the super-admin area, and invoices for a
// customer's own billing page. Invoices come from Stripe's webhook.

export type InvoiceInput = {
  stripeInvoiceId: string;
  stripeCustomerId: string | null;
  number: string | null;
  status: Invoice["status"];
  description: string;
  amountDueCents: number;
  amountPaidCents: number;
  currency: string;
  attemptCount: number;
  hostedUrl: string | null;
  pdfUrl: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  paidAt: Date | null;
  createdAt: Date;
};

/** Stores an invoice as Stripe has it now (later events overwrite earlier ones). */
export async function upsertInvoice(input: InvoiceInput) {
  const userId = input.stripeCustomerId
    ? await accountForStripeCustomer(input.stripeCustomerId)
    : null;
  await getDb()
    .insert(invoices)
    .values({ ...input, userId })
    .onConflictDoUpdate({
      target: invoices.stripeInvoiceId,
      // Keeps when it was first issued.
      set: { ...input, createdAt: undefined, userId, updatedAt: new Date() },
    });
}

const like = (q: string) => `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listInvoicesPage({
  status,
  q = "",
  page = 1,
  pageSize = 25,
}: {
  status?: Invoice["status"] | null;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const rows = await getDb().execute<{
    id: string;
    user_id: string | null;
    email: string | null;
    number: string | null;
    status: Invoice["status"];
    description: string;
    amount_due_cents: number;
    amount_paid_cents: number;
    currency: string;
    attempt_count: number;
    hosted_url: string | null;
    pdf_url: string | null;
    created_at: Date;
    paid_at: Date | null;
    total: number;
  }>(sql`
    select i.id, i.user_id, u.email, i.number, i.status, i.description, i.amount_due_cents,
           i.amount_paid_cents, i.currency, i.attempt_count, i.hosted_url, i.pdf_url,
           i.created_at, i.paid_at, count(*) over ()::int as total
    from invoices i left join users u on u.id = i.user_id
    where ${status ? sql`i.status = ${status}` : sql`true`}
      and ${q.trim() ? sql`(u.email ilike ${like(q)} or i.number ilike ${like(q)})` : sql`true`}
    order by i.created_at desc
    limit ${pageSize} offset ${(Math.max(1, page) - 1) * pageSize}`);
  return {
    total: rows[0]?.total ?? 0,
    page: Math.max(1, page),
    pageSize,
    rows: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      email: r.email,
      number: r.number,
      status: r.status,
      description: r.description,
      amountDueCents: r.amount_due_cents,
      amountPaidCents: r.amount_paid_cents,
      currency: r.currency,
      attemptCount: r.attempt_count,
      hostedUrl: r.hosted_url,
      pdfUrl: r.pdf_url,
      createdAt: new Date(r.created_at),
      paidAt: r.paid_at ? new Date(r.paid_at) : null,
    })),
  };
}

export async function invoiceStats() {
  const [row] = await getDb().execute<{
    paid30: number;
    paid_prev30: number;
    open: number;
    failing: number;
    total: number;
  }>(sql`
    select
      coalesce(sum(amount_paid_cents) filter (where status = 'paid' and paid_at >= now() - interval '30 days'), 0)::int as paid30,
      coalesce(sum(amount_paid_cents) filter (where status = 'paid' and paid_at >= now() - interval '60 days'
                                              and paid_at < now() - interval '30 days'), 0)::int as paid_prev30,
      count(*) filter (where status = 'open')::int as open,
      count(*) filter (where status = 'uncollectible' or (status = 'open' and attempt_count > 0))::int as failing,
      count(*)::int as total
    from invoices`);
  return {
    paid30Cents: row!.paid30,
    paidPrevious30Cents: row!.paid_prev30,
    open: row!.open,
    failing: row!.failing,
    total: row!.total,
  };
}

/** A customer's own invoices, newest first. */
export async function listUserInvoices(userId: string, limit = 12) {
  return getDb()
    .select()
    .from(invoices)
    .where(and(eq(invoices.userId, userId), sql`${invoices.status} <> 'draft'`))
    .orderBy(desc(invoices.createdAt))
    .limit(limit);
}

export const SUBSCRIPTION_TABS = [
  "all",
  "active",
  "trialing",
  "past_due",
  "canceling",
  "canceled",
] as const;
export type SubscriptionTab = (typeof SUBSCRIPTION_TABS)[number];

/** Paid subscriptions (free accounts have none), by tab. */
export async function listSubscriptionsPage({
  tab = "all",
  q = "",
  page = 1,
  pageSize = 25,
}: {
  tab?: SubscriptionTab;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const where =
    tab === "canceling"
      ? sql`s.cancel_at_period_end and s.status <> 'canceled'`
      : tab === "all"
        ? sql`true`
        : sql`s.status = ${tab}`;
  const rows = await getDb().execute<{
    user_id: string;
    email: string;
    plan: string;
    price_cents: number;
    currency: string;
    status: string;
    current_period_end: Date | null;
    cancel_at_period_end: boolean;
    stripe_subscription_id: string | null;
    stripe_customer_id: string | null;
    updated_at: Date;
    total: number;
  }>(sql`
    select s.user_id, u.email, p.name as plan, p.price_cents, p.currency, s.status,
           s.current_period_end, s.cancel_at_period_end, s.stripe_subscription_id,
           s.stripe_customer_id, s.updated_at, count(*) over ()::int as total
    from subscriptions s join users u on u.id = s.user_id join plans p on p.id = s.plan_id
    where p.key <> 'free' and ${where}
      and ${q.trim() ? sql`u.email ilike ${like(q)}` : sql`true`}
    order by s.updated_at desc
    limit ${pageSize} offset ${(Math.max(1, page) - 1) * pageSize}`);
  return {
    total: rows[0]?.total ?? 0,
    page: Math.max(1, page),
    pageSize,
    rows: rows.map((r) => ({
      userId: r.user_id,
      email: r.email,
      plan: r.plan,
      priceCents: r.price_cents,
      currency: r.currency,
      status: r.status,
      currentPeriodEnd: r.current_period_end ? new Date(r.current_period_end) : null,
      cancelAtPeriodEnd: r.cancel_at_period_end,
      stripeSubscriptionId: r.stripe_subscription_id,
      stripeCustomerId: r.stripe_customer_id,
      updatedAt: new Date(r.updated_at),
    })),
  };
}

export async function subscriptionStats() {
  const [row] = await getDb().execute<{
    mrr: number;
    active: number;
    trialing: number;
    past_due: number;
    canceling: number;
    ending7: number;
    canceled: number;
  }>(sql`
    select
      coalesce(sum(p.price_cents) filter (where s.status in ('active', 'past_due')), 0)::int as mrr,
      count(*) filter (where s.status = 'active')::int as active,
      count(*) filter (where s.status = 'trialing')::int as trialing,
      count(*) filter (where s.status = 'past_due')::int as past_due,
      count(*) filter (where s.cancel_at_period_end and s.status <> 'canceled')::int as canceling,
      count(*) filter (where s.cancel_at_period_end and s.status <> 'canceled'
                       and s.current_period_end < now() + interval '7 days')::int as ending7,
      count(*) filter (where s.status = 'canceled')::int as canceled
    from subscriptions s join plans p on p.id = s.plan_id
    where p.key <> 'free'`);
  return {
    mrrCents: row!.mrr,
    active: row!.active,
    trialing: row!.trialing,
    pastDue: row!.past_due,
    canceling: row!.canceling,
    endingIn7Days: row!.ending7,
    canceled: row!.canceled,
  };
}

/** The account behind a Stripe subscription id, for admin actions. */
export async function subscriptionByStripeId(stripeSubscriptionId: string) {
  const [row] = await getDb().execute<{ user_id: string }>(sql`
    select user_id from subscriptions where stripe_subscription_id = ${stripeSubscriptionId}`);
  return row?.user_id ?? null;
}
