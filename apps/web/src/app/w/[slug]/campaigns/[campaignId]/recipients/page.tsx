import { countAudience, getCampaign, listLists, listSegments } from "@sendcoop/db";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { RecipientsForm } from "./recipients-form";

export const metadata: Metadata = { title: "Campaign recipients" };

export default async function RecipientsPage({
  params,
}: {
  params: Promise<{ slug: string; campaignId: string }>;
}) {
  const { slug, campaignId } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const campaign = await getCampaign(workspace.id, campaignId);
  if (!campaign) notFound();
  if (campaign.status !== "draft") redirect(`/w/${slug}/campaigns/${campaign.id}`);

  const [lists, segments, count] = await Promise.all([
    listLists(workspace.id),
    listSegments(workspace.id),
    countAudience(workspace.id, campaign.audience),
  ]);

  return (
    <RecipientsForm
      slug={slug}
      campaignId={campaign.id}
      editable={canManage(role)}
      initialName={campaign.name}
      initialAudience={campaign.audience}
      initialCount={count}
      lists={lists.map((l) => ({ id: l.id, name: l.name, count: l.subscriberCount }))}
      segments={segments.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
