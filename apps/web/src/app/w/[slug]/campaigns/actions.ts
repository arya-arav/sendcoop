"use server";

import { countAudience, createDraftCampaign, updateDraftCampaign } from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cleanAudience } from "@/lib/campaign-audience";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

const NO_PERMISSION = "Only workspace owners and admins can change campaigns.";

async function managerWorkspace(slug: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  return canManage(role) ? workspace : null;
}

/** Starts a draft and opens the builder at step 1. */
export async function createCampaignAction(slug: string) {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { error: NO_PERMISSION };
  const campaign = await createDraftCampaign(workspace.id, workspace.name);
  redirect(`/w/${slug}/campaigns/${campaign.id}/recipients`);
}

/** How many people an audience reaches right now (the builder's live count). */
export async function countRecipientsAction(slug: string, audience: unknown) {
  const { workspace } = await requireMemberWorkspace(slug);
  const clean = await cleanAudience(workspace.id, audience);
  if (!clean) return { ok: false as const };
  return { ok: true as const, count: await countAudience(workspace.id, clean) };
}

const nameSchema = z
  .string()
  .trim()
  .min(1, "Give the campaign a name.")
  .max(100, "Keep the name under 100 characters.");

export async function saveRecipientsAction(
  slug: string,
  campaignId: string,
  input: { name: string; audience: unknown },
) {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false as const, error: NO_PERMISSION };
  if (!z.uuid().safeParse(campaignId).success) return { ok: false as const, error: "Not found." };
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false as const, error: name.error.issues[0]!.message };
  const audience = await cleanAudience(workspace.id, input.audience);
  if (!audience) return { ok: false as const, error: "Choose who gets this campaign." };

  const saved = await updateDraftCampaign(workspace.id, campaignId, { name: name.data, audience });
  if (!saved) return { ok: false as const, error: "This campaign has already been sent." };
  revalidatePath(`/w/${slug}/campaigns`);
  return { ok: true as const, count: await countAudience(workspace.id, audience) };
}
