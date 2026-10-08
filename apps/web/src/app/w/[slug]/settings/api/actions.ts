"use server";

import { createApiKey, listApiKeys, revokeApiKey } from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { canManage } from "@/lib/permissions";
import { withinRateLimit } from "@/lib/rate-limit";
import { requireMemberWorkspace } from "@/lib/workspace";

const NO_PERMISSION = "Only owners and admins can manage API keys.";
const MAX_KEYS = 20;

/** Makes a key and returns it: the only time it can be seen. */
export async function createApiKeyAction(slug: string, name: string) {
  const { user, workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) return { ok: false as const, error: NO_PERMISSION };
  const label = name.trim().slice(0, 60);
  if (!label) return { ok: false as const, error: "Name the key after what will use it." };
  if (!(await withinRateLimit(`api-key:${workspace.id}`, 10, 3600))) {
    return { ok: false as const, error: "That's a lot of new keys. Try again in an hour." };
  }
  if ((await listApiKeys(workspace.id)).length >= MAX_KEYS) {
    return { ok: false as const, error: `Up to ${MAX_KEYS} keys; revoke one you don't use.` };
  }
  const { key } = await createApiKey(workspace.id, label, user.id);
  revalidatePath(`/w/${slug}/settings/api`);
  return { ok: true as const, key };
}

export async function revokeApiKeyAction(slug: string, keyId: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) return { ok: false as const, error: NO_PERMISSION };
  await revokeApiKey(workspace.id, keyId);
  revalidatePath(`/w/${slug}/settings/api`);
  return { ok: true as const };
}
