"use server";

import { clearUtmcapConnection } from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { canManage } from "@/lib/permissions";
import { withinRateLimit } from "@/lib/rate-limit";
import { connectUtmcap } from "@/lib/utmcap-connect";
import { requireMemberWorkspace } from "@/lib/workspace";

export async function connectUtmcapAction(slug: string, apiKey: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false as const, error: "Only workspace owners and admins can connect UTMCAP." };
  }
  const key = apiKey.trim();
  if (!/^utmk_[\w-]{8,200}$/.test(key)) {
    return {
      ok: false as const,
      error: "Paste a UTMCAP API key: it starts with utmk_ (UTMCAP → Settings → API).",
    };
  }
  if (!(await withinRateLimit(`utmcap-connect:${workspace.id}`, 10, 3600))) {
    return { ok: false as const, error: "Too many attempts. Try again in an hour." };
  }
  const result = await connectUtmcap(workspace.id, workspace.name, key);
  revalidatePath(`/w/${slug}/integrations`);
  return result;
}

export async function disconnectUtmcapAction(slug: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false as const, error: "Only workspace owners and admins can disconnect UTMCAP." };
  }
  await clearUtmcapConnection(workspace.id);
  revalidatePath(`/w/${slug}/integrations`);
  return { ok: true as const };
}
