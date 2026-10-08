import { getCampaign, updateDraftCampaign } from "@sendcoop/db";
import { z } from "zod";
import { jsonError, managerWorkspaceForApi } from "@/lib/api-auth";
import { buildContent, contentSchema, readJsonBody } from "@/lib/email-content";

/** Saves a draft campaign's content from its editor (as templates are saved). */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string; campaignId: string }> },
) {
  const { slug, campaignId } = await params;
  const access = await managerWorkspaceForApi(slug);
  if ("response" in access) return access.response;
  if (!z.uuid().safeParse(campaignId).success) return jsonError(404, "Campaign not found.");

  let data: unknown;
  try {
    data = await readJsonBody(request);
  } catch {
    return jsonError(400, "The email couldn't be read, or is too large.");
  }
  const input = contentSchema.safeParse(data);
  if (!input.success) return jsonError(400, input.error.issues[0]?.message ?? "Invalid email.");

  const campaign = await getCampaign(access.workspace.id, campaignId);
  if (!campaign) return jsonError(404, "Campaign not found.");
  if (campaign.status !== "draft") return jsonError(409, "This campaign has already been sent.");
  if (campaign.editor !== input.data.editor) {
    return jsonError(409, "This email uses a different editor. Reload the page.");
  }

  const { content, warnings } = await buildContent(input.data);
  await updateDraftCampaign(access.workspace.id, campaignId, content);
  return Response.json({ ok: true, warnings });
}
