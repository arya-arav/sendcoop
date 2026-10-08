import { index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { workspaces } from "./auth";
import { createdAt, id } from "./columns";

// Images a workspace uploaded for its emails. The files live in public
// S3-compatible storage under content-hash keys, so the same image
// uploaded twice is stored once.
export const media = pgTable(
  "media",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text().notNull(),
    url: text().notNull(),
    fileName: text().notNull(),
    contentType: text().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    bytes: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("media_workspace_key_unique").on(t.workspaceId, t.key),
    index().on(t.workspaceId, t.id),
  ],
);

export type Media = typeof media.$inferSelect;
