import { and, asc, count, eq, max, sql } from "drizzle-orm";
import { getDb } from "../client";
import { MAX_CUSTOM_FIELDS } from "../custom-fields";
import { type CustomField, type CustomFieldType, customFields, subscribers } from "../schema";
import { isUniqueViolation } from "./errors";

// Scoped by workspaceId like every other query.

export async function listCustomFields(workspaceId: string): Promise<CustomField[]> {
  return getDb()
    .select()
    .from(customFields)
    .where(eq(customFields.workspaceId, workspaceId))
    .orderBy(asc(customFields.position), asc(customFields.createdAt));
}

export type CustomFieldInput = {
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
};

export type CustomFieldWriteResult =
  { ok: true; field: CustomField } | { ok: false; error: "duplicate" | "limit" | "not_found" };

export async function createCustomField(
  workspaceId: string,
  input: CustomFieldInput,
): Promise<CustomFieldWriteResult> {
  const db = getDb();
  const [stats] = await db
    .select({ total: count(), last: max(customFields.position) })
    .from(customFields)
    .where(eq(customFields.workspaceId, workspaceId));
  if ((stats?.total ?? 0) >= MAX_CUSTOM_FIELDS) return { ok: false, error: "limit" };

  try {
    const [field] = await db
      .insert(customFields)
      .values({
        workspaceId,
        ...input,
        options: input.type === "dropdown" ? input.options : [],
        position: (stats?.last ?? -1) + 1,
      })
      .returning();
    return { ok: true, field: field! };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicate" };
    throw error;
  }
}

/** Only the label and dropdown options can change; key and type are fixed. */
export async function updateCustomField(
  workspaceId: string,
  fieldId: string,
  input: { label: string; options: string[] },
): Promise<CustomFieldWriteResult> {
  const [field] = await getDb()
    .update(customFields)
    .set({
      label: input.label,
      // Non-dropdown fields keep their empty options list.
      options: sql`case when ${customFields.type} = 'dropdown' then ${JSON.stringify(input.options)}::jsonb else '[]'::jsonb end`,
    })
    .where(and(eq(customFields.id, fieldId), eq(customFields.workspaceId, workspaceId)))
    .returning();
  return field ? { ok: true, field } : { ok: false, error: "not_found" };
}

/**
 * Deletes the definition and removes its values from every subscriber in the
 * workspace, so a new field with the same key never shows old data.
 */
export async function deleteCustomField(workspaceId: string, fieldId: string): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const [deleted] = await tx
      .delete(customFields)
      .where(and(eq(customFields.id, fieldId), eq(customFields.workspaceId, workspaceId)))
      .returning({ key: customFields.key });
    if (!deleted) return false;

    await tx
      .update(subscribers)
      .set({ fields: sql`${subscribers.fields} - ${deleted.key}::text` })
      .where(
        and(eq(subscribers.workspaceId, workspaceId), sql`${subscribers.fields} ? ${deleted.key}`),
      );
    return true;
  });
}
