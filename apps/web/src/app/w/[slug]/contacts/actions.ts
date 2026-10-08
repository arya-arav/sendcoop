"use server";

import {
  createSubscriber,
  listCustomFields,
  parseFieldValues,
  subscriberQuotaProblem,
  workspaceQuota,
} from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

export type SubscriberFormResult =
  | { ok: true }
  | {
      ok: false;
      error?: string;
      fieldErrors?: { email?: string; name?: string };
      /** Custom field errors keyed by field key. */
      customErrors?: Record<string, string>;
    };

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
  // Custom fields arrive as cf_<key>; validate against this workspace's definitions.
  const definitions = await listCustomFields(workspace.id);
  const fields = parseFieldValues(
    definitions,
    Object.fromEntries(definitions.map((f) => [f.key, formData.get(`cf_${f.key}`)])),
  );

  // Report every problem at once rather than one group at a time.
  if (!input.success || !fields.ok) {
    const errors = input.success ? undefined : z.flattenError(input.error).fieldErrors;
    return {
      ok: false,
      fieldErrors: {
        email: errors?.email?.[0],
        name: errors?.firstName?.[0] ?? errors?.lastName?.[0],
      },
      error: errors?.listIds ? "Pick lists from this workspace." : undefined,
      customErrors: fields.ok ? undefined : fields.errors,
    };
  }

  const { listIds, ...subscriber } = input.data;
  const overLimit = subscriberQuotaProblem(await workspaceQuota(workspace.id));
  if (overLimit) return { ok: false, error: overLimit };
  const result = await createSubscriber(
    workspace.id,
    { ...subscriber, source: "manual", fields: fields.values },
    listIds,
  );
  if (!result.ok) {
    return result.error === "duplicate"
      ? { ok: false, fieldErrors: { email: "This email is already a subscriber." } }
      : { ok: false, error: "One of the lists no longer exists. Refresh the page." };
  }

  revalidatePath(`/w/${slug}/contacts`);
  revalidatePath(`/w/${slug}/lists`);
  return { ok: true };
}
