"use server";

import { createList, deleteList, updateList } from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

export type ListFormResult =
  | { ok: true }
  | { ok: false; error?: string; fieldErrors?: { name?: string; description?: string } };

const listInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the list a name.")
    .max(100, "Keep the name under 100 characters."),
  description: z
    .string()
    .trim()
    .max(500, "Keep the description under 500 characters.")
    .transform((value) => value || null),
});

const listId = z.uuid();

const NO_PERMISSION = "Only workspace owners and admins can change lists.";
const DUPLICATE = "A list with this name already exists.";
const GONE = "This list no longer exists. Refresh the page.";

/** Membership is checked on every call: actions are public endpoints. */
async function managerWorkspace(slug: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  return canManage(role) ? workspace : null;
}

function parse(formData: FormData) {
  return listInput.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
  });
}

function fieldErrors(error: z.ZodError<z.output<typeof listInput>>) {
  const { fieldErrors } = z.flattenError(error);
  return { name: fieldErrors.name?.[0], description: fieldErrors.description?.[0] };
}

export async function createListAction(slug: string, formData: FormData): Promise<ListFormResult> {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false, error: NO_PERMISSION };

  const input = parse(formData);
  if (!input.success) return { ok: false, fieldErrors: fieldErrors(input.error) };

  const result = await createList(workspace.id, input.data);
  if (!result.ok) return { ok: false, fieldErrors: { name: DUPLICATE } };

  revalidatePath(`/w/${slug}/lists`);
  return { ok: true };
}

export async function updateListAction(
  slug: string,
  id: string,
  formData: FormData,
): Promise<ListFormResult> {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false, error: NO_PERMISSION };
  if (!listId.safeParse(id).success) return { ok: false, error: GONE };

  const input = parse(formData);
  if (!input.success) return { ok: false, fieldErrors: fieldErrors(input.error) };

  const result = await updateList(workspace.id, id, input.data);
  if (!result.ok) {
    return result.error === "duplicate"
      ? { ok: false, fieldErrors: { name: DUPLICATE } }
      : { ok: false, error: GONE };
  }

  revalidatePath(`/w/${slug}/lists`);
  return { ok: true };
}

export async function deleteListAction(slug: string, id: string): Promise<ListFormResult> {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false, error: NO_PERMISSION };
  if (!listId.safeParse(id).success) return { ok: false, error: GONE };

  if (!(await deleteList(workspace.id, id))) return { ok: false, error: GONE };

  revalidatePath(`/w/${slug}/lists`);
  return { ok: true };
}
