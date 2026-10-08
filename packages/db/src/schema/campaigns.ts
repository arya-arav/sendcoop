import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { workspaces } from "./auth";
import { createdAt, id, updatedAt } from "./columns";
import { subscribers } from "./contacts";
import { sendingDomains, sendingServers } from "./sending";
import { templateEditor } from "./templates";

/**
 * Who a campaign goes to: everyone subscribed, or anyone in the chosen lists
 * or segments; minus anyone in the excluded ones. Suppressed and
 * unsubscribed people never get campaigns.
 */
/** A/B test settings: variant A is the campaign itself, B is in campaign_variants. */
export type AbTestSettings = {
  /** Share of recipients in the test, split evenly between A and B (10-50). */
  testPercent: number;
  /** How long the test runs before the winner goes to everyone else. */
  waitMinutes: number;
  /** What makes a winner. Ties, and no data, keep A. */
  metric: "clicks" | "revenue";
};

export type CampaignAudience = {
  everyone: boolean;
  lists: string[];
  segments: string[];
  excludeLists: string[];
  excludeSegments: string[];
};

export const EMPTY_AUDIENCE: CampaignAudience = {
  everyone: false,
  lists: [],
  segments: [],
  excludeLists: [],
  excludeSegments: [],
};

export const campaignStatus = pgEnum("campaign_status", [
  "draft",
  "scheduled", // waits for scheduledAt
  "queued", // waiting for the prepare job
  "sending",
  "sent",
  "paused",
  "canceled",
  "failed",
]);

// A one-off send to a list or segment. The builder UI arrives in D31; the
// sending engine works from these columns.
export const campaigns = pgTable(
  "campaigns",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text().notNull(),
    subject: text().notNull(),
    fromName: text().notNull(),
    /** The part before @; the domain comes from sendingDomainId. */
    fromLocal: text().notNull(),
    replyTo: text(),
    /** Shown after the subject in most inbox lists. */
    preheader: text().notNull().default(""),
    // Content, edited like a template's (and copied from one): see templates.
    editor: templateEditor().notNull().default("html"),
    design: jsonb().$type<Record<string, unknown>>(),
    mjml: text(),
    html: text().notNull(),
    text: text().notNull(),
    sendingDomainId: uuid().references(() => sendingDomains.id, { onDelete: "set null" }),
    sendingServerId: uuid().references(() => sendingServers.id, { onDelete: "set null" }),
    // Audience: who gets it (see CampaignAudience).
    audience: jsonb().$type<CampaignAudience>().notNull().default(EMPTY_AUDIENCE),
    status: campaignStatus().notNull().default("draft"),
    /** When it starts. In subscriber-timezone mode: the earliest timezone's moment. */
    scheduledAt: timestamp({ withTimezone: true }),
    /** The chosen local time, for subscriber-timezone sends (no zone). */
    scheduleLocal: timestamp({ withTimezone: false }),
    /** IANA timezone of the schedule, and the fallback for subscribers without one. */
    scheduleTimezone: text(),
    sendInSubscriberTimezone: boolean().notNull().default(false),
    /** Set when the campaign is an A/B test. */
    abTest: jsonb().$type<AbTestSettings>(),
    /** When the test's winner is picked and sent to the rest. */
    abDecideAt: timestamp({ withTimezone: true }),
    abWinner: text().$type<"a" | "b">(),
    recipientCount: integer().notNull().default(0),
    sentCount: integer().notNull().default(0),
    failedCount: integer().notNull().default(0),
    error: text(),
    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.workspaceId, t.id)],
);

export const messageStatus = pgEnum("message_status", [
  "queued",
  "sent",
  "failed",
  "skipped",
  "held", // A/B test remainder: waits for the winner
]);
export const bounceType = pgEnum("bounce_type", ["hard", "soft"]);

// One row per recipient of a campaign: the record of what was sent to whom.
// Unique per (campaign, subscriber), so preparing twice never double-sends.
export const messages = pgTable(
  "messages",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid()
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    subscriberId: uuid().references(() => subscribers.id, { onDelete: "set null" }),
    /** Copied at queue time, so the record survives the subscriber being deleted. */
    email: text().notNull(),
    status: messageStatus().notNull().default("queued"),
    providerMessageId: text(),
    error: text(),
    /** A/B tests: which variant this recipient gets ("a" or "b"). */
    variant: text().$type<"a" | "b">(),
    // Engagement, kept on the message for fast reports and A/B decisions:
    // the first click (D37) and attributed revenue (D43).
    clickedAt: timestamp({ withTimezone: true }),
    revenue: numeric({ precision: 12, scale: 2, mode: "number" }).notNull().default(0),
    /** Not before this (subscriber-timezone sends); null means right away. */
    sendAfter: timestamp({ withTimezone: true }),
    sentAt: timestamp({ withTimezone: true }),
    /** When the recipient unsubscribed using this email's link. */
    unsubscribedAt: timestamp({ withTimezone: true }),
    // Feedback from the provider (D22).
    bouncedAt: timestamp({ withTimezone: true }),
    /** hard: the address doesn't exist (suppressed); soft: try again later. */
    bounceType: bounceType(),
    bounceDetail: text(),
    complainedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("messages_campaign_subscriber_unique").on(t.campaignId, t.subscriberId),
    index().on(t.campaignId, t.status),
    index().on(t.subscriberId),
    // Provider feedback (bounces, complaints) names messages by their id.
    index().on(t.providerMessageId),
  ],
);

export type Campaign = typeof campaigns.$inferSelect;
export type CampaignStatus = (typeof campaignStatus.enumValues)[number];
export type Message = typeof messages.$inferSelect;

/** Variant B of an A/B test campaign: what differs from the campaign (variant A). */
export const campaignVariants = pgTable(
  "campaign_variants",
  {
    id: id(),
    campaignId: uuid()
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    subject: text().notNull(),
    preheader: text().notNull().default(""),
    editor: templateEditor().notNull().default("html"),
    design: jsonb().$type<Record<string, unknown>>(),
    mjml: text(),
    html: text().notNull(),
    text: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("campaign_variants_campaign_unique").on(t.campaignId)],
);

export type CampaignVariant = typeof campaignVariants.$inferSelect;
