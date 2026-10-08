import { index, jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { workspaces } from "./auth";
import { createdAt, id, updatedAt } from "./columns";

/** How a template is edited: drag-and-drop (MJML), or HTML/plain-text code (D30). */
export const templateEditor = pgEnum("template_editor", ["visual", "html", "text"]);

// Reusable email designs. A campaign copies a template's content when it is
// created from one, so editing a template never changes what was sent.
export const templates = pgTable(
  "templates",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text().notNull(),
    /** Suggested subject line for campaigns made from it. */
    subject: text().notNull().default(""),
    editor: templateEditor().notNull().default("visual"),
    /** The visual editor's project (GrapesJS), reloaded to keep editing. */
    design: jsonb().$type<Record<string, unknown>>(),
    /** MJML source of a visual design. */
    mjml: text(),
    /** What is sent: the compiled HTML, and the plain-text version. */
    html: text().notNull().default(""),
    text: text().notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.workspaceId, t.id)],
);

export type Template = typeof templates.$inferSelect;
export type TemplateEditor = (typeof templateEditor.enumValues)[number];
