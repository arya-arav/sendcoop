import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users, workspaces } from "./auth";
import { createdAt, id } from "./columns";

// Keys for the REST API (D77). Only a key's SHA-256 is stored; hint is its
// first characters, so people can tell their keys apart.
export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text().notNull(),
    hint: text().notNull(),
    keyHash: text().notNull().unique(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    lastUsedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.workspaceId)],
);
