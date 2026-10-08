import { getCampaign } from "@sendcoop/db";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { requireMemberWorkspace } from "@/lib/workspace";

// A draft opens in the builder; anything else shows where sending stands
// (the full report arrives with click tracking in D40).
export default async function CampaignPage({
  params,
}: {
  params: Promise<{ slug: string; campaignId: string }>;
}) {
  const { slug, campaignId } = await params;
  const { workspace } = await requireMemberWorkspace(slug);
  const campaign = await getCampaign(workspace.id, campaignId);
  if (!campaign) notFound();
  if (campaign.status === "draft") redirect(`/w/${slug}/campaigns/${campaign.id}/recipients`);

  return (
    <Card>
      <CardContent className="grid gap-1 text-sm">
        <p>
          Sent to {campaign.sentCount.toLocaleString("en")} of{" "}
          {campaign.recipientCount.toLocaleString("en")} recipients.
        </p>
        {campaign.error && <p className="text-muted-foreground">{campaign.error}</p>}
      </CardContent>
    </Card>
  );
}
