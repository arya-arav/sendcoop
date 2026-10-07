"use server";

import {
  createCustomField,
  customFieldType,
  deleteCustomField,
  fieldKeyProblem,
  MAX_CUSTOM_FIELDS,
  MAX_DROPDOWN_OPTIONS,
  normalizeOptions,
  updateCustomField,
} from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

export type FieldFormResult =
  | { ok: true }
  | { ok: false; error?: string; fieldErrors?: { label?: string; key?: string; options?: string } };

const NO_PERMISSION = "Only workspace owners and admins can change custom fields.";
const GONE = "This field no longer exists. Refresh the page.";

const label = z
  .string()
  .trim()
  .min(1, "Give the field a label.")
  .max(60, "Keep the label under 60 characters.");

/** One option per line in the form. */
function readOptions(formData: FormData) {
  return normalizeOptions(String(formData.get("options") ?? "").split(/\r?\n/));
}

function optionsProblem(options: string[]) {
  if (options.length === 0) return "Add at least one option, one per line.";
  if (options.length > MAX_DROPDOWN_OPTIONS) return `Use at most ${MAX_DROPDOWN_OPTIONS} options.`;
  return null;
}

async function managerWorkspace(slug: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  return canManage(role) ? workspace : null;
}

function revalidate(slug: string) {
  revalidatePath(`/w/${slug}/contacts/fields`);
  revalidatePath(`/w/${slug}/contacts`);
}

export async function createFieldAction(
  slug: string,
  formData: FormData,
): Promise<FieldFormResult> {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false, error: NO_PERMISSION };

  const parsedLabel = label.safeParse(formData.get("label") ?? "");
  const key = String(formData.get("key") ?? "").trim();
  const type = z.enum(customFieldType.enumValues).safeParse(formData.get("type"));
  const options = type.data === "dropdown" ? readOptions(formData) : [];

  const fieldErrors = {
    label: parsedLabel.error?.issues[0]?.message,
    key: fieldKeyProblem(key) ?? undefined,
    options: type.data === "dropdown" ? (optionsProblem(options) ?? undefined) : undefined,
  };
  if (!type.success) return { ok: false, error: "Choose a field type." };
  if (!parsedLabel.success || fieldErrors.key || fieldErrors.options) {
    return { ok: false, fieldErrors };
  }

  const result = await createCustomField(workspace.id, {
    key,
    label: parsedLabel.data,
    type: type.data,
    options,
  });
  if (!result.ok) {
    return result.error === "duplicate"
      ? { ok: false, fieldErrors: { key: "Another field already uses this key." } }
      : { ok: false, error: `A workspace can have up to ${MAX_CUSTOM_FIELDS} custom fields.` };
  }

  revalidate(slug);
  return { ok: true };
}

export async function updateFieldAction(
  slug: string,
  fieldId: string,
  isDropdown: boolean,
  formData: FormData,
): Promise<FieldFormResult> {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false, error: NO_PERMISSION };
  if (!z.uuid().safeParse(fieldId).success) return { ok: false, error: GONE };

  const parsedLabel = label.safeParse(formData.get("label") ?? "");
  const options = isDropdown ? readOptions(formData) : [];
  const problem = isDropdown ? optionsProblem(options) : null;
  if (!parsedLabel.success || problem) {
    return {
      ok: false,
      fieldErrors: {
        label: parsedLabel.error?.issues[0]?.message,
        options: problem ?? undefined,
      },
    };
  }

  // The query keeps options empty for non-dropdown fields whatever we send.
  const result = await updateCustomField(workspace.id, fieldId, {
    label: parsedLabel.data,
    options,
  });
  if (!result.ok) return { ok: false, error: GONE };

  revalidate(slug);
  return { ok: true };
}

export async function deleteFieldAction(slug: string, fieldId: string): Promise<FieldFormResult> {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false, error: NO_PERMISSION };
  if (!z.uuid().safeParse(fieldId).success) return { ok: false, error: GONE };

  if (!(await deleteCustomField(workspace.id, fieldId))) return { ok: false, error: GONE };

  revalidate(slug);
  return { ok: true };
}
