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
import { campaigns } from "./campaigns";
import { createdAt, id, updatedAt } from "./columns";

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
  updatedAt: updatedAt(),
});

export type Link = typeof links.$inferSelect;
