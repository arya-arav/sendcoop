import { boolean, pgTable, text, uniqueIndex, uuid, jsonb, index } from "drizzle-orm/pg-core";
import { workspaces } from "./auth";
import { createdAt, id, updatedAt } from "./columns";

// A signup form, shown on a hosted page (/f/<publicId>) or embedded on any
// website. publicId is random and is the only identifier used publicly.
export const signupForms = pgTable(
  "signup_forms",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    publicId: text().notNull(),
    name: text().notNull(),
    title: text().notNull(),
    description: text(),
    buttonText: text().notNull().default("Subscribe"),
    successMessage: text().notNull(),
    /** Where to send people after signing up; the hosted thank-you page if null. */
    redirectUrl: text(),
    /** Fields shown besides email: "first_name", "last_name" or custom field keys. */
    fields: jsonb().$type<string[]>().notNull().default([]),
    listIds: jsonb().$type<string[]>().notNull().default([]),
    doubleOptIn: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("signup_forms_public_id_unique").on(t.publicId), index().on(t.workspaceId)],
);

export type SignupForm = typeof signupForms.$inferSelect;
