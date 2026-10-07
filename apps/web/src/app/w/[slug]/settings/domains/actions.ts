"use server";

import { addSendingDomain, deleteSendingDomain, normalizeSendingDomain } from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

export type DomainResult = { ok: true; id: string } | { ok: false; error: string };

export async function addDomainAction(slug: string, input: string): Promise<DomainResult> {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false, error: "Only workspace owners and admins can add sending domains." };
  }
  const normalized = normalizeSendingDomain(String(input ?? "").slice(0, 300));
  if (!normalized.ok) return normalized;

  const result = await addSendingDomain(workspace.id, normalized.domain);
  if (!result.ok) return { ok: false, error: `${normalized.domain} is already added.` };

  revalidatePath(`/w/${slug}/settings/domains`);
  return { ok: true, id: result.domain.id };
}

export async function deleteDomainAction(slug: string, domainId: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role) || !z.uuid().safeParse(domainId).success) return { ok: false } as const;
  const deleted = await deleteSendingDomain(workspace.id, domainId);
  revalidatePath(`/w/${slug}/settings/domains`);
  return { ok: deleted } as const;
}
