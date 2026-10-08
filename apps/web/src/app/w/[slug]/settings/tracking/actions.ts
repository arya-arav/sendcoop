"use server";

import { setAffiliateDomains } from "@sendcoop/db";
import { revalidatePath } from "next/cache";
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
