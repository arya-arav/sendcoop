"use server";

import {
  clearUtmcapConnection,
  featureProblem,
  getUtmcapConnection,
  rememberUtmcapDomains,
} from "@sendcoop/db";
import { UtmcapClient, UtmcapError } from "@sendcoop/utmcap";
import { revalidatePath } from "next/cache";
import { canManage } from "@/lib/permissions";
import { withinRateLimit } from "@/lib/rate-limit";
import { connectUtmcap } from "@/lib/utmcap-connect";
import { reconcileUtmcap } from "@/lib/utmcap-reconcile";
import { requireMemberWorkspace } from "@/lib/workspace";

export async function connectUtmcapAction(slug: string, apiKey: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false as const, error: "Only workspace owners and admins can connect UTMCAP." };
  }
  const blocked = await featureProblem(workspace.id, "utmcap");
  if (blocked) return { ok: false as const, error: blocked };
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

export type UtmcapCampaignOption = { id: string; name: string; url: string; status: string };

/**
 * The user's UTMCAP campaigns, for "Insert UTMCAP link" in the editor. Their
 * tracking domains are remembered, so links to them get sc_cid and sub1–4.
 */
export async function listUtmcapCampaignsAction(
  slug: string,
): Promise<{ ok: true; campaigns: UtmcapCampaignOption[] } | { ok: false; error: string }> {
  const { workspace } = await requireMemberWorkspace(slug);
  const connection = await getUtmcapConnection(workspace.id);
  if (!connection) return { ok: false, error: "Connect UTMCAP first, in Integrations." };
  try {
    const campaigns = await new UtmcapClient({ apiKey: connection.apiKey }).listCampaigns();
    const domains = campaigns.flatMap((c) => {
      try {
        return [new URL(c.url).hostname];
      } catch {
        return [];
      }
    });
    await rememberUtmcapDomains(workspace.id, domains);
    return {
      ok: true,
      campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, url: c.url, status: c.status })),
    };
  } catch (error) {
    if (error instanceof UtmcapError) {
      return { ok: false, error: `UTMCAP couldn't list your campaigns: ${error.message}` };
    }
    throw error;
  }
}

/** UTMCAP's numbers for the Sendcoop source next to Sendcoop's, last 30 days. */
export async function reconcileUtmcapAction(slug: string) {
  const { workspace } = await requireMemberWorkspace(slug);
  try {
    const rows = await reconcileUtmcap(workspace.id, 30);
    if (!rows) return { ok: false as const, error: "Connect UTMCAP first." };
    return { ok: true as const, rows };
  } catch (error) {
    if (error instanceof UtmcapError) {
      return { ok: false as const, error: `UTMCAP's report didn't load: ${error.message}` };
    }
    throw error;
  }
}
