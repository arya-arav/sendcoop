import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { workspaces } from "./auth";
import { campaigns, messages } from "./campaigns";
import { createdAt, id, updatedAt } from "./columns";
import { subscribers } from "./contacts";

// Click and conversion tracking (phase 4 onwards).

/**
 * Each link in a campaign's email, in order (each occurrence separately, so
 * "Shop now" in the header and the footer are told apart). Found when the
 * campaign is prepared; clicks (D37) point at these rows.
 */
export const links = pgTable(
  "links",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid()
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    /** A/B test version the link is in ("a" for campaigns without a test). */
    variant: text().$type<"a" | "b">().notNull().default("a"),
    position: integer().notNull(),
    /** As written in the email, merge tags included. */
    url: text().notNull(),
    label: text(),
    isAffiliate: boolean().notNull().default(false),
    /** Known affiliate network ("clickbank", ...), "custom" for the workspace's own domains. */
    networkId: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("links_campaign_variant_position_unique").on(t.campaignId, t.variant, t.position),
    index().on(t.workspaceId, t.id),
  ],
);

/** Per-workspace tracking settings. */
export const trackingSettings = pgTable("tracking_settings", {
  workspaceId: uuid()
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  /** Links on these domains (and their subdomains) count as affiliate links. */
  affiliateDomains: jsonb().$type<string[]>().notNull().default([]),
  /** Add utm_* tags to ordinary links (those already set are kept). */
  addUtm: boolean().notNull().default(true),
  utmSource: text().notNull().default("sendcoop"),
  /** Add the open pixel to HTML emails. */
  trackOpens: boolean().notNull().default(true),
  /** How long after an email click a sale matched only by email still counts (days). */
  attributionWindowDays: integer().notNull().default(7),
  updatedAt: updatedAt(),
});

export type Link = typeof links.$inferSelect;

/**
 * One row per click on a tracked link. click_id is the short public id
 * passed on to landing pages and affiliate networks (sc_cid, sub-ids), and
 * comes back with conversions.
 */
export const clicks = pgTable(
  "clicks",
  {
    id: id(),
    /** "sc" + 16 letters and digits: fits every network's sub-id field. */
    clickId: text().notNull(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid().references(() => campaigns.id, { onDelete: "set null" }),
    messageId: uuid().references(() => messages.id, { onDelete: "set null" }),
    linkId: uuid().references(() => links.id, { onDelete: "set null" }),
    subscriberId: uuid().references(() => subscribers.id, { onDelete: "set null" }),
    ip: text(),
    userAgent: text(),
    /** Security scanners and other machines (D39); left out of reports. */
    isBot: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("clicks_click_id_unique").on(t.clickId),
    index().on(t.workspaceId, t.id),
    index().on(t.campaignId),
    index().on(t.messageId),
  ],
);

export type Click = typeof clicks.$inferSelect;

/**
 * Each time the open pixel loads. Machine opens (Apple Mail Privacy
 * Protection, scanners) are kept but flagged: they happen whether or not
 * anyone reads the email.
 */
export const opens = pgTable(
  "opens",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid().references(() => campaigns.id, { onDelete: "set null" }),
    messageId: uuid().references(() => messages.id, { onDelete: "set null" }),
    subscriberId: uuid().references(() => subscribers.id, { onDelete: "set null" }),
    ip: text(),
    userAgent: text(),
    isMachine: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.workspaceId, t.id), index().on(t.campaignId), index().on(t.messageId)],
);
