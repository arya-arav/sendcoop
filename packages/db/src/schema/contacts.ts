import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { workspaces } from "./auth";
import { createdAt, id, updatedAt } from "./columns";

// Every contacts table carries workspace_id; queries must always filter by it.

export const lists = pgTable(
  "lists",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // List names are unique per workspace, ignoring case.
    uniqueIndex("lists_workspace_name_unique").on(t.workspaceId, sql`lower(${t.name})`),
    index().on(t.workspaceId, t.createdAt),
  ],
);

// Status is per workspace, not per list: someone who unsubscribes or bounces
// is never mailed again from this workspace, whichever list they're on.
export const subscriberStatus = pgEnum("subscriber_status", [
  "subscribed",
  "pending", // awaiting double opt-in confirmation (D15)
  "unsubscribed",
  "bounced",
  "complained",
]);

export const subscriberSource = pgEnum("subscriber_source", [
  "manual",
  "import",
  "form",
  "api",
  "integration",
]);

export const subscribers = pgTable(
  "subscribers",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // Stored lowercased, so one address is one subscriber per workspace.
    email: text().notNull(),
    firstName: text(),
    lastName: text(),
    status: subscriberStatus().notNull().default("subscribed"),
    source: subscriberSource().notNull().default("manual"),
    // Custom field values keyed by field key (definitions arrive in D8).
    fields: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    subscribedAt: timestamp({ withTimezone: true }),
    unsubscribedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("subscribers_workspace_email_unique").on(t.workspaceId, t.email),
    // Newest-first listing; uuidv7 ids are time-ordered.
    index().on(t.workspaceId, t.id),
    index().on(t.workspaceId, t.status),
  ],
);

export const listMemberships = pgTable(
  "list_memberships",
  {
    listId: uuid()
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    subscriberId: uuid()
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.listId, t.subscriberId] }), index().on(t.subscriberId)],
);

export type List = typeof lists.$inferSelect;
export type Subscriber = typeof subscribers.$inferSelect;
export type SubscriberStatus = (typeof subscriberStatus.enumValues)[number];
export type SubscriberSource = (typeof subscriberSource.enumValues)[number];
