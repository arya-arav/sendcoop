"use server";

import { createSubscriber } from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

export type SubscriberFormResult =
  { ok: true } | { ok: false; error?: string; fieldErrors?: { email?: string; name?: string } };

const optionalName = z
  .string()
  .trim()
  .max(100, "Keep names under 100 characters.")
  .transform((value) => value || null);

const subscriberInput = z.object({
  email: z.string().trim().pipe(z.email("Enter a valid email address.")),
  firstName: optionalName,
  lastName: optionalName,
  listIds: z.array(z.uuid()).max(100),
});

export async function addSubscriberAction(
  slug: string,
  formData: FormData,
): Promise<SubscriberFormResult> {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false, error: "Only workspace owners and admins can add subscribers." };
  }

  const input = subscriberInput.safeParse({
    email: formData.get("email") ?? "",
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    listIds: formData.getAll("listIds"),
  });
  if (!input.success) {
    const { fieldErrors } = z.flattenError(input.error);
    return {
      ok: false,
      fieldErrors: {
        email: fieldErrors.email?.[0],
        name: fieldErrors.firstName?.[0] ?? fieldErrors.lastName?.[0],
      },
      error: fieldErrors.listIds ? "Pick lists from this workspace." : undefined,
    };
  }

  const { listIds, ...subscriber } = input.data;
  const result = await createSubscriber(workspace.id, { ...subscriber, source: "manual" }, listIds);
  if (!result.ok) {
    return result.error === "duplicate"
      ? { ok: false, fieldErrors: { email: "This email is already a subscriber." } }
      : { ok: false, error: "One of the lists no longer exists. Refresh the page." };
  }

  revalidatePath(`/w/${slug}/contacts`);
  revalidatePath(`/w/${slug}/lists`);
  return { ok: true };
}
