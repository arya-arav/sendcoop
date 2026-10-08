import {
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { workspaces } from "./auth";
import { campaigns, messages } from "./campaigns";
import { createdAt, id, updatedAt } from "./columns";
import { subscribers } from "./contacts";
import { clicks } from "./tracking";

// Conversion tracking (phase 5): sales, leads and sign-ups reported back by
// affiliate networks, stores, forms and UTMCAP, attributed to the email
// click that led to them.

export const conversionSource = pgEnum("conversion_source", [
  "postback", // affiliate network server-to-server postback
  "pixel", // sc.js on the store or landing page
  "shopify",
  "woocommerce",
  "lead", // lead-gen form tools
  "utmcap",
  "api", // server-side conversion API
]);

export const conversionEvent = pgEnum("conversion_event", ["sale", "lead", "signup", "custom"]);

/** Where a lead is in the sales process (D50): only sold leads count as revenue. */
export const leadStage = pgEnum("lead_stage", ["new", "qualified", "sold", "lost"]);

/** As UTMCAP: only approved conversions count as revenue. */
export const conversionStatus = pgEnum("conversion_status", [
  "pending",
  "approved",
  "rejected",
  "reversed", // refunded or charged back after approval
]);

export const conversions = pgTable(
  "conversions",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Our click id (sc_cid / sub-id) when the conversion came with one. */
    clickId: text(),
    clickRowId: uuid().references(() => clicks.id, { onDelete: "set null" }),
    // What it's attributed to (D43).
    messageId: uuid().references(() => messages.id, { onDelete: "set null" }),
    campaignId: uuid().references(() => campaigns.id, { onDelete: "set null" }),
    /** Automations arrive in phase 7. */
    automationId: uuid(),
    subscriberId: uuid().references(() => subscribers.id, { onDelete: "set null" }),
    source: conversionSource().notNull(),
    event: conversionEvent().notNull().default("sale"),
    value: numeric({ precision: 12, scale: 2, mode: "number" }).notNull().default(0),
    currency: text().notNull().default("USD"),
    /**
     * From currency to the workspace's reporting currency, at the rate of the
     * day it arrived (D54); null while no rate is known for the currency.
     */
    fxRate: numeric({ precision: 18, scale: 8, mode: "number" }),
    /** value in the reporting currency: what revenue adds up. */
    valueBase: numeric({ precision: 12, scale: 2, mode: "number" }).generatedAlwaysAs(
      sql`round(value * fx_rate, 2)`,
    ),
    status: conversionStatus().notNull().default("approved"),
    /** Leads only. */
    leadStage: leadStage(),
    /** The reporter's id for it (order or transaction id): duplicates are ignored. */
    externalTxid: text(),
    /** Affiliate network that reported it ("clickbank", ...). */
    networkId: text(),
    /** What was received, for support and reprocessing. */
    payload: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("conversions_workspace_txid_unique")
      .on(t.workspaceId, t.externalTxid)
      .where(sql`${t.externalTxid} is not null`),
    index().on(t.workspaceId, t.id),
    index().on(t.campaignId),
    index().on(t.clickId),
    index().on(t.subscriberId),
  ],
);

/**
 * A workspace's affiliate network setups: a built-in template (ClickBank,
 * Impact, ...) or a custom network with its own sub-id parameter (D44).
 */
export const networks = pgTable(
  "networks",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** A template id from AFFILIATE_NETWORKS, or "custom". */
    template: text().notNull(),
    name: text().notNull(),
    subidParam: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.workspaceId)],
);

/**
 * Daily reference rates (ECB): units of a currency per euro. Conversions use
 * the rate of the day they arrived, or the nearest day known.
 */
export const fxRates = pgTable(
  "fx_rates",
  {
    currency: text().notNull(),
    day: date({ mode: "string" }).notNull(),
    perEur: numeric({ precision: 18, scale: 8, mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.currency, t.day] })],
);

export const integrationKind = pgEnum("integration_kind", [
  "postback",
  "pixel",
  "api",
  "shopify",
  "woocommerce",
  "utmcap",
  "leads", // lead form webhook
  "webhooks", // signs outgoing webhooks (automation actions, D67; events, D78)
]);

/**
 * Per-workspace secrets for receiving conversions. The secret is stored
 * encrypted (so it can be shown again, e.g. in a postback URL) and hashed
 * (so incoming requests are matched without decrypting anything).
 */
export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: integrationKind().notNull(),
    secretEncrypted: text().notNull(),
    /** SHA-256 of the secret, hex. */
    secretHash: text().notNull(),
    /** Settings that aren't secret (shop domain, allowed IPs, ...). */
    config: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("integrations_workspace_kind_unique").on(t.workspaceId, t.kind),
    uniqueIndex("integrations_secret_hash_unique").on(t.secretHash),
  ],
);

export type Conversion = typeof conversions.$inferSelect;
export type ConversionStatus = (typeof conversionStatus.enumValues)[number];
export type LeadStage = (typeof leadStage.enumValues)[number];
export type IntegrationKind = (typeof integrationKind.enumValues)[number];

/**
 * UTMCAP's click id (ucid) for a Sendcoop click (sc_cid), learnt from
 * postbacks and click lookups: UTMCAP's webhooks name only their own (D58).
 */
export const utmcapClicks = pgTable(
  "utmcap_clicks",
  {
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ucid: text().notNull(),
    clickId: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.ucid] }), index().on(t.clickId)],
);

/** UTMCAP webhook events already handled: a retry has the same id (D59). */
export const utmcapEvents = pgTable(
  "utmcap_events",
  {
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text().notNull(),
    type: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    /** Null until the worker has applied it. */
    processedAt: timestamp({ withTimezone: true }),
    error: text(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.eventId] })],
);
