import { sql } from "drizzle-orm";
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
import { workspaces } from "./auth";
import type { WebhookEvent } from "../webhook-events";
import { createdAt, id } from "./columns";

// Outgoing webhooks (D78): endpoints a workspace registers, and one delivery
// per event and endpoint. Deliveries are queued by database triggers (on
// subscribers, clicks and conversions; migration 0045), so every way an
// event can happen is covered, and sent by the worker with retries.

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    url: text().notNull(),
    description: text().notNull().default(""),
    events: text().array().$type<WebhookEvent[]>().notNull(),
    enabled: boolean().notNull().default(true),
    /** Deliveries that failed in a row; the endpoint turns itself off at 20. */
    failureStreak: integer().notNull().default(0),
    disabledReason: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.workspaceId)],
);

export const webhookDeliveryStatus = pgEnum("webhook_delivery_status", [
  "pending",
  "delivered",
  "failed",
]);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: id(),
    endpointId: uuid()
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    workspaceId: uuid().notNull(),
    event: text().$type<WebhookEvent | "webhook.test">().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    status: webhookDeliveryStatus().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    responseStatus: integer(),
    error: text(),
    deliveredAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("webhook_deliveries_due")
      .on(t.nextAttemptAt)
      .where(sql`${t.status} = 'pending'`),
    index().on(t.endpointId, t.createdAt),
  ],
);
