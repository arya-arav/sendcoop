import { index, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { workspaces } from "./auth";
import { createdAt, id } from "./columns";

export const suppressionReason = pgEnum("suppression_reason", [
  "manual", // added or imported by the workspace
  "bounce", // hard bounce reported by the provider
  "complaint", // marked as spam
]);

// Addresses never to email, whatever their subscriber record says: it
// survives the subscriber being deleted and imported again. Rows without a
// workspace apply to every workspace (platform-wide, managed by admins).
export const suppressions = pgTable(
  "suppressions",
  {
    id: id(),
    workspaceId: uuid().references(() => workspaces.id, { onDelete: "cascade" }),
    /** Always lowercase. */
    email: text().notNull(),
    reason: suppressionReason().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // One global entry per address too: nulls count as equal here.
    unique("suppressions_workspace_email_unique").on(t.workspaceId, t.email).nullsNotDistinct(),
    index().on(t.workspaceId, t.id),
  ],
);

export type Suppression = typeof suppressions.$inferSelect;
export type SuppressionReason = (typeof suppressionReason.enumValues)[number];
