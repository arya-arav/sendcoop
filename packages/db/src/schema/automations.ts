import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AutomationGraph, AutomationTrigger } from "../automations";
import { workspaces } from "./auth";
import { createdAt, id, updatedAt } from "./columns";
import { subscribers } from "./contacts";

// Automations (phase 7): a trigger starts a run per subscriber, and the run
// walks a graph of steps (send an email, wait, branch on a condition, act).
// The graph is stored as React Flow draws it (nodes and edges, D62). Each
// email step has its own campaign row (kind "automation") holding its
// content, so automation emails use the same sending, tracking and reports
// as campaigns.

export const automationStatus = pgEnum("automation_status", ["draft", "active", "paused"]);

export const automations = pgTable(
  "automations",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text().notNull(),
    status: automationStatus().notNull().default("draft"),
    trigger: jsonb().$type<AutomationTrigger>().notNull(),
    graph: jsonb().$type<AutomationGraph>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.workspaceId, t.status)],
);

export const automationRunStatus = pgEnum("automation_run_status", [
  "active", // being moved along, or due to be
  "waiting", // in a wait step until wait_until
  "completed", // reached the end
  "exited", // left early: a goal reached (e.g. bought), unsubscribed, removed
  "failed",
]);

/** One subscriber's way through an automation. */
export const automationRuns = pgTable(
  "automation_runs",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    automationId: uuid()
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    subscriberId: uuid()
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    status: automationRunStatus().notNull().default("active"),
    /** The step it's at (a node id in the graph). */
    currentNodeId: text(),
    /** In a wait step: when to move on. */
    waitUntil: timestamp({ withTimezone: true }),
    /** What started it (an event id, a conversion), so the same trigger starts it once. */
    triggerRef: text(),
    /** Values from the trigger (e.g. the conversion, the lead's stage), for conditions and merge tags. */
    context: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    exitReason: text(),
    error: text(),
    startedAt: createdAt(),
    finishedAt: timestamp({ withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [
    // At most one live run per subscriber and automation.
    uniqueIndex("automation_runs_live_unique")
      .on(t.automationId, t.subscriberId)
      .where(sql`${t.status} in ('active', 'waiting')`),
    uniqueIndex("automation_runs_trigger_unique")
      .on(t.automationId, t.triggerRef)
      .where(sql`${t.triggerRef} is not null`),
    // The engine's queue: due runs.
    index().on(t.status, t.waitUntil),
    index().on(t.subscriberId),
  ],
);

export const automationStepStatus = pgEnum("automation_step_status", ["done", "skipped", "failed"]);

/**
 * What each step did for a run. Unique per run and step, so a step that runs
 * again after a crash finds its log and doesn't act twice (e.g. send twice).
 */
export const automationStepLogs = pgTable(
  "automation_step_logs",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    automationId: uuid()
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    runId: uuid()
      .notNull()
      .references(() => automationRuns.id, { onDelete: "cascade" }),
    nodeId: text().notNull(),
    /** The step's type: email, wait, condition, action, exit. */
    kind: text().notNull(),
    status: automationStepStatus().notNull(),
    /** What happened: the message sent, the branch taken, the action's result. */
    detail: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("automation_step_logs_run_node_unique").on(t.runId, t.nodeId),
    index().on(t.automationId, t.nodeId),
  ],
);

export type Automation = typeof automations.$inferSelect;
export type AutomationRun = typeof automationRuns.$inferSelect;
export type AutomationRunStatus = (typeof automationRunStatus.enumValues)[number];

/**
 * What can start automation runs (D64), written by database triggers (list
 * joined, tag added, subscription confirmed) and the API (events). The
 * worker reads it every few seconds and starts the matching automations.
 */
export const automationEvents = pgTable(
  "automation_events",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** joined_list, tag_added, api_event, converted, lead_status, … */
    type: text().notNull(),
    subscriberId: uuid()
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    /** The list, tag, event name or conversion it's about. */
    ref: text(),
    /**
     * The sender's id for an API event: the same id starts runs once (unique per
     * workspace and type, in migration 0037 since drizzle can't express it here).
     */
    externalId: text(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    processedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("automation_events_pending_index")
      .on(t.createdAt)
      .where(sql`${t.processedAt} is null`),
  ],
);
