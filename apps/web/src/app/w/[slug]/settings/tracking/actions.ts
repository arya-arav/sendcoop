"use server";

import { setAffiliateDomains, setUtmSettings } from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

/** One domain (or link) per line; saved normalized, without duplicates. */
export async function saveAffiliateDomainsAction(slug: string, text: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false as const, error: "Only workspace owners and admins can change this." };
  }
  const domains = await setAffiliateDomains(workspace.id, text.slice(0, 20_000).split(/[\s,]+/));
  revalidatePath(`/w/${slug}/settings/tracking`);
  return { ok: true as const, domains };
}

const utmSchema = z.object({
  addUtm: z.boolean(),
  utmSource: z
    .string()
    .trim()
    .min(1, "Enter a source, e.g. newsletter.")
    .max(50)
    .regex(/^[\w.-]+$/, "Use letters, numbers, dots, dashes or underscores."),
});

export async function saveUtmSettingsAction(slug: string, input: z.input<typeof utmSchema>) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false as const, error: "Only workspace owners and admins can change this." };
  }
  const parsed = utmSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]!.message };
  await setUtmSettings(workspace.id, parsed.data);
  revalidatePath(`/w/${slug}/settings/tracking`);
  return { ok: true as const };
}
