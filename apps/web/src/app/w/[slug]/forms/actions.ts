"use server";

import { createForm, deleteForm, listCustomFields, listLists, updateForm } from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

export type FormSaveResult = { ok: true; id: string } | { ok: false; error: string };

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const formSchema = z.object({
  name: z.string().trim().min(1, "Give the form a name.").max(100),
  title: z.string().trim().min(1, "Give the form a heading.").max(120),
  description: optional(500),
  buttonText: z.string().trim().min(1, "Add the button text.").max(40),
  successMessage: z.string().trim().min(1, "Add a thank-you message.").max(300),
  // Only web addresses, never javascript: or similar.
  redirectUrl: optional(500).refine(
    (v) => v === null || /^https?:\/\/[^\s]+$/i.test(v),
    "The redirect must be a web address starting with https://",
  ),
  fields: z.array(z.string().max(60)).max(30),
  listIds: z.array(z.uuid()).max(50),
  doubleOptIn: z.boolean(),
});

export type FormValues = z.input<typeof formSchema>;

export async function saveFormAction(
  slug: string,
  formId: string | null,
  values: FormValues,
): Promise<FormSaveResult> {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false, error: "Only workspace owners and admins can change signup forms." };
  }
  const parsed = formSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  if (formId && !z.uuid().safeParse(formId).success) {
    return { ok: false, error: "This form no longer exists." };
  }

  const [customFields, lists] = await Promise.all([
    listCustomFields(workspace.id),
    listLists(workspace.id),
  ]);
  const allowedFields = new Set(["first_name", "last_name", ...customFields.map((f) => f.key)]);
  const ownLists = new Set(lists.map((l) => l.id));
  const input = {
    ...parsed.data,
    fields: [...new Set(parsed.data.fields)].filter((f) => allowedFields.has(f)),
    listIds: parsed.data.listIds.filter((id) => ownLists.has(id)),
  };

  const form = formId
    ? await updateForm(workspace.id, formId, input)
    : await createForm(workspace.id, input);
  if (!form) return { ok: false, error: "This form no longer exists." };

  revalidatePath(`/w/${slug}/forms`);
  return { ok: true, id: form.id };
}

export async function deleteFormAction(slug: string, formId: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role) || !z.uuid().safeParse(formId).success) return { ok: false } as const;
  const deleted = await deleteForm(workspace.id, formId);
  revalidatePath(`/w/${slug}/forms`);
  return { ok: deleted } as const;
}
