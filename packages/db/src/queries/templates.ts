import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { type TemplateEditor, templates } from "../schema";

// Every query is scoped by workspaceId.

export async function createTemplate(
  workspaceId: string,
  input: {
    name: string;
    subject?: string;
    editor?: TemplateEditor;
    design?: Record<string, unknown> | null;
    mjml?: string | null;
    html?: string;
    text?: string;
  },
) {
  const [row] = await getDb()
    .insert(templates)
    .values({ workspaceId, ...input })
    .returning();
  return row!;
}

export async function getTemplate(workspaceId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(templates)
    .where(and(eq(templates.workspaceId, workspaceId), eq(templates.id, id)));
  return row ?? null;
}

/** For the list: no content, newest edits first. */
export async function listTemplates(workspaceId: string) {
  return getDb()
    .select({
      id: templates.id,
      name: templates.name,
      editor: templates.editor,
      updatedAt: templates.updatedAt,
    })
    .from(templates)
    .where(eq(templates.workspaceId, workspaceId))
    .orderBy(desc(templates.updatedAt));
}

export type TemplateContent = {
  name?: string;
  subject?: string;
  design?: Record<string, unknown> | null;
  mjml?: string | null;
  html?: string;
  text?: string;
};

/** Saves changes; false if the template doesn't exist in this workspace. */
export async function updateTemplate(workspaceId: string, id: string, content: TemplateContent) {
  const rows = await getDb()
    .update(templates)
    .set(content)
    .where(and(eq(templates.workspaceId, workspaceId), eq(templates.id, id)))
    .returning({ id: templates.id });
  return rows.length > 0;
}

export async function deleteTemplate(workspaceId: string, id: string) {
  const rows = await getDb()
    .delete(templates)
    .where(and(eq(templates.workspaceId, workspaceId), eq(templates.id, id)))
    .returning({ name: templates.name });
  return rows[0]?.name ?? null;
}
