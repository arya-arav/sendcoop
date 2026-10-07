import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { workspaces } from "./auth";
import { createdAt, id, updatedAt } from "./columns";

export const domainStatus = pgEnum("sending_domain_status", ["pending", "verified", "failed"]);

// A domain a workspace sends from. We sign mail with its own DKIM key; the
// private key is stored encrypted (see ../secrets.ts).
export const sendingDomains = pgTable(
  "sending_domains",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    domain: text().notNull(),
    dkimSelector: text().notNull(),
    dkimPublicKey: text().notNull(),
    dkimPrivateKeyEncrypted: text().notNull(),
    status: domainStatus().notNull().default("pending"),
    spfVerified: boolean().notNull().default(false),
    dkimVerified: boolean().notNull().default(false),
    dmarcVerified: boolean().notNull().default(false),
    lastCheckedAt: timestamp({ withTimezone: true }),
    verifiedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("sending_domains_workspace_domain_unique").on(t.workspaceId, t.domain),
    index().on(t.status, t.lastCheckedAt),
  ],
);

export type SendingDomain = typeof sendingDomains.$inferSelect;
export type DomainStatus = (typeof domainStatus.enumValues)[number];

export const serverType = pgEnum("sending_server_type", ["smtp", "ses"]);

// How a workspace delivers mail. Credentials live in configEncrypted (the whole
// driver config, encrypted); summary is the non-secret part shown in lists.
export const sendingServers = pgTable(
  "sending_servers",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text().notNull(),
    type: serverType().notNull(),
    summary: text().notNull(),
    configEncrypted: text().notNull(),
    // Sending limits per UTC second, hour and day; null means no limit.
    maxPerSecond: integer(),
    maxPerHour: integer(),
    maxPerDay: integer(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.workspaceId)],
);

export type SendingServer = typeof sendingServers.$inferSelect;
export type SendingServerType = (typeof serverType.enumValues)[number];
