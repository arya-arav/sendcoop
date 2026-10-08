import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, id } from "./columns";

/** What super-admins did (the admin activity log). */
export const adminActivity = pgTable(
  "admin_activity",
  {
    id: id(),
    adminId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** e.g. "customer.suspended", "plan.saved". */
    action: text().notNull(),
    /** The record acted on: a user, plan, campaign… */
    targetId: text(),
    detail: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.createdAt), index().on(t.adminId), index().on(t.targetId)],
);
