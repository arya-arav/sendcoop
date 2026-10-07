import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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

export type List = typeof lists.$inferSelect;
