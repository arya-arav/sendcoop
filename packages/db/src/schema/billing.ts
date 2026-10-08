import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { PlanFeatures, PlanLimits } from "../plans";
import { users } from "./auth";
import { createdAt, id, updatedAt } from "./columns";

// Plans and subscriptions (phase 8). A plan belongs to an account (the user
// who owns workspaces), since one of its limits is how many workspaces they
// may have; every workspace an account owns shares its plan's quotas.

export const plans = pgTable("plans", {
  id: id(),
  /** Stable name for code and URLs: "free", "starter", … */
  key: text().notNull().unique(),
  name: text().notNull(),
  description: text().notNull().default(""),
  /** Per month, in cents; 0 is free. */
  priceCents: integer().notNull().default(0),
  currency: text().notNull().default("USD"),
  /** The Stripe price this plan subscribes to (D72); null for free plans. */
  stripePriceId: text(),
  /** Limits; null means unlimited. */
  limits: jsonb().$type<PlanLimits>().notNull(),
  features: jsonb().$type<PlanFeatures>().notNull(),
  /** Shown on the pricing and billing pages; hidden plans are for special cases. */
  public: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
  archived: boolean().notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const subscriptionStatus = pgEnum("subscription_status", [
  "active",
  "trialing",
  "past_due", // a payment failed; still on the plan while Stripe retries
  "canceled", // ended: back to the free plan
]);

/** An account's plan. No row: the free plan. */
export const subscriptions = pgTable("subscriptions", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  planId: uuid()
    .notNull()
    .references(() => plans.id),
  status: subscriptionStatus().notNull().default("active"),
  stripeCustomerId: text().unique(),
  stripeSubscriptionId: text().unique(),
  currentPeriodEnd: timestamp({ withTimezone: true }),
  /** Canceled, but paid up until currentPeriodEnd. */
  cancelAtPeriodEnd: boolean().notNull().default(false),
  /**
   * Set by a super-admin (D75): limits and features that beat the plan's, and
   * trusted (D76): no new-account warm-up.
   */
  overrides: jsonb().$type<{
    limits?: Partial<PlanLimits>;
    features?: Partial<PlanFeatures>;
    trusted?: boolean;
  }>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type Plan = typeof plans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;

export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "open", // issued, not paid yet
  "paid",
  "uncollectible", // Stripe gave up collecting it
  "void",
]);

/** Stripe invoices, kept as the billing webhook reports them (admin Invoices). */
export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    stripeInvoiceId: text().notNull().unique(),
    stripeCustomerId: text(),
    number: text(),
    status: invoiceStatus().notNull(),
    /** What it was for, e.g. the plan's name. */
    description: text().notNull().default(""),
    amountDueCents: integer().notNull().default(0),
    amountPaidCents: integer().notNull().default(0),
    currency: text().notNull().default("USD"),
    /** Payment attempts that failed (Stripe retries). */
    attemptCount: integer().notNull().default(0),
    hostedUrl: text(),
    pdfUrl: text(),
    periodStart: timestamp({ withTimezone: true }),
    periodEnd: timestamp({ withTimezone: true }),
    paidAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.createdAt)],
);

export type Invoice = typeof invoices.$inferSelect;
