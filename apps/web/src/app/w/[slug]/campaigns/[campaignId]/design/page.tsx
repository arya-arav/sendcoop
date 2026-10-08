import { getCampaign, getUtmcapConnection, listMedia } from "@sendcoop/db";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { appUrl } from "@/lib/app-url";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { CodeEditor } from "../../../templates/[templateId]/code-editor";
import { VisualEditor } from "../../../templates/[templateId]/visual-editor";

export const metadata: Metadata = { title: "Edit campaign email" };

// The campaign's own copy of its email, in the same editors as templates.
export default async function CampaignDesignPage({
  params,
}: {
  params: Promise<{ slug: string; campaignId: string }>;
}) {
  const { slug, campaignId } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!z.uuid().safeParse(campaignId).success) notFound();
  const campaign = await getCampaign(workspace.id, campaignId);
  if (!campaign) notFound();
  const contentStep = `/w/${slug}/campaigns/${campaign.id}/content`;
  // An automation's email belongs to its automation, which is where "back" goes.
  const automation =
    campaign.kind === "automation" && campaign.automationId
      ? `/w/${slug}/automations/${campaign.automationId}`
      : null;
  if (!canManage(role) || campaign.status !== "draft") redirect(automation ?? contentStep);

  const target = {
    saveUrl: `/api/w/${slug}/campaigns/${campaign.id}/content`,
    backHref: automation ?? contentStep,
    backLabel: automation ? "Back to the automation" : "Back to the campaign",
    utmcapSlug: (await getUtmcapConnection(workspace.id)) ? slug : undefined,
  };

  if (campaign.editor !== "visual") {
    return (
      <CodeEditor
        target={target}
        mode={campaign.editor}
        initialContent={campaign.editor === "html" ? campaign.html : campaign.text}
      />
    );
  }
  return (
    <VisualEditor
      slug={slug}
      target={target}
      design={campaign.design}
      mjml={campaign.mjml}
      assets={`${appUrl()}/email`}
      images={(await listMedia(workspace.id)).map((m) => ({
        src: m.url,
        width: m.width,
        height: m.height,
        name: m.fileName,
      }))}
    />
  );
}
